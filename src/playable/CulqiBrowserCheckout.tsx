import { useCallback, useEffect, useRef, useState } from 'react'
import { CHECKOUT_LEGAL_VERSION } from '../domain/lib/legal-version'
import { confirmPaidOrderReceipt, parsePaymentStatusObservation, type PaidOrderReceipt } from '../domain/lib/paid-order-receipt'

export type CulqiPublicConfig = {
  enabled: boolean
  configured: boolean
  intakeEnabled: boolean
  bridgeReady: boolean
  webhookReady: boolean
  clientReady: boolean
  visualQaAllowed: boolean
  mode: string
  currency?: 'PEN'
  publicKey?: string
  rsaId?: string
  rsaPublicKey?: string
}

export type CheckoutCustomer = {
  customerName: string
  email: string
  whatsapp: string
  deliveryAddress: string
  district: string
  addressReference: string
  deliveryNotes: string
  termsAccepted: boolean
  termsVersion: typeof CHECKOUT_LEGAL_VERSION
}

export type GuidedOrderPayload = {
  category: 'packs' | 'combos' | 'schmears' | null
  packFormat: 'grande' | 'mini'
  packQty: number
  packMix: 'mixed' | 'single'
  bagels: Record<string, number>
  schmears: Record<string, number>
  schmearSize: number
  comboId: string | null
  bagelMode: string
}

type Auth3DS = {
  cavv: string
  directoryServerTransactionId?: string
  eci: string
  protocolVersion: string
  xid: string
}

type CheckoutInstance = {
  close: () => void
  culqi?: () => void
  error?: { merchant_message?: string; message?: string; user_message?: string } | null
  open: () => void
  token?: { id?: string } | null
  order?: { id?: string } | null
}

type CheckoutCtor = new (publicKey: string, config: Record<string, unknown>) => CheckoutInstance

type Culqi3DSApi = {
  publicKey: string
  generateDevice: () => Promise<string>
  initAuthentication: (tokenId: string) => Promise<void>
  reset: () => void
  settings: {
    charge: { totalAmount: number; returnUrl: string; currency?: string }
    card: { email: string }
  }
  options: {
    showModal: boolean
    showLoading: boolean
    showIcon: boolean
    closeModalAction?: () => void
  }
}

declare global {
  interface Window {
    CulqiCheckout?: CheckoutCtor
    Culqi3DS?: Culqi3DSApi
  }
}

type CheckoutSession = {
  checkoutSessionId: string
  orderCode: string
  amountMinor: number
  expiresAt: string | null
  sessionId: string
}

const RECOVERY_KEY = 'bagelito.culqi.pending.v1'

type RecoveryReference = {
  checkoutSessionId: string
  orderCode: string
  state: 'pending'|'review'
}

type InvalidRecovery = { invalid: true }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type ReservedCheckout = {checkoutSessionId: string; orderCode: string; amountMinor: number; expiresAt: string}
function confirmBrowserReservation(value: unknown, checkoutSessionId: string): ReservedCheckout {
  const r = value as Record<string, unknown> | null
  if (!r || r.ok !== true || r.checkoutSessionId !== checkoutSessionId || !uuid.test(checkoutSessionId)
    || typeof r.orderCode !== 'string' || !/^BAG-[A-Z0-9_-]{1,80}$/.test(r.orderCode)
    || typeof r.amountMinor !== 'number' || !Number.isSafeInteger(r.amountMinor) || r.amountMinor <= 0 || r.amountMinor > 2147483647
    || typeof r.expiresAt !== 'string' || !Number.isFinite(Date.parse(r.expiresAt)) || Date.parse(r.expiresAt) <= Date.now()
    || (r.currency !== undefined && r.currency !== 'PEN')) throw new Error('No se pudo verificar la reserva completa.')
  return {checkoutSessionId, orderCode: r.orderCode, amountMinor: r.amountMinor, expiresAt: r.expiresAt}
}
function confirmBrowserPreparation(value: unknown, reservation: ReservedCheckout): CheckoutSession {
  const r = value as Record<string, unknown> | null
  if (!r || r.ok !== true || typeof r.sessionId !== 'string' || !uuid.test(r.sessionId)
    || r.amount !== reservation.amountMinor || typeof r.expiresAt !== 'string'
    || Date.parse(r.expiresAt) !== Date.parse(reservation.expiresAt) || Date.parse(r.expiresAt) <= Date.now()
    || (r.currency !== undefined && r.currency !== 'PEN')) throw new Error('La preparación del pago no coincide con la reserva.')
  return {...reservation, sessionId: r.sessionId}
}

function loadScript(id: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing?.dataset.ready === 'true') return resolve()
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('script-load-failed')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.defer = true
    script.onload = () => {
      script.dataset.ready = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error('script-load-failed'))
    document.body.appendChild(script)
  })
}

function readRecovery(): RecoveryReference | InvalidRecovery | null {
  const raw = window.localStorage.getItem(RECOVERY_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { checkoutSessionId?: unknown; orderCode?: unknown; state?: unknown }
    if (typeof value.checkoutSessionId === 'string'
      && typeof value.orderCode === 'string'
      && (value.state === 'pending' || value.state === 'review')) {
      return {
        checkoutSessionId: value.checkoutSessionId,
        orderCode: value.orderCode,
        state: value.state,
      }
    }
  } catch {}
  return { invalid: true }
}

function setRecovery(session: CheckoutSession, state: 'pending'|'review') {
  window.localStorage.setItem(RECOVERY_KEY, JSON.stringify({
    checkoutSessionId: session.checkoutSessionId,
    orderCode: session.orderCode,
    state,
  }))
}

function clearRecovery(session: Pick<CheckoutSession, 'checkoutSessionId' | 'orderCode'>) {
  const current = readRecovery()
  if (current && 'checkoutSessionId' in current
    && current.checkoutSessionId === session.checkoutSessionId
    && current.orderCode === session.orderCode) {
    window.localStorage.removeItem(RECOVERY_KEY)
  }
}

async function jsonFetch<T>(url: string, init: RequestInit, timeoutMs: number): Promise<{ response: Response; result: T }> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const result = await response.json() as T
    return { response, result }
  } finally {
    window.clearTimeout(timeout)
  }
}

export function CulqiBrowserCheckout(props: {
  config: CulqiPublicConfig
  customer: CheckoutCustomer
  order: GuidedOrderPayload
  subtotalPen: number
  sandboxMode?: boolean
  onPaid: (result: { orderCode: string; amountPen: number; receipt: PaidOrderReceipt }) => void
  onReview: (message: string) => void
}) {
  const { config, customer, order, subtotalPen, onPaid, onReview, sandboxMode = false } = props
  const [status, setStatus] = useState<'idle'|'loading'|'ready'|'charging'|'3ds'|'confirming'|'review'|'error'|'expired'>('idle')
  const [message, setMessage] = useState('')
  const checkoutRef = useRef<CheckoutInstance | null>(null)
  const sessionRef = useRef<CheckoutSession | null>(null)
  const tokenRef = useRef<{ tokenId: string; deviceId: string } | null>(null)
  const busyRef = useRef(false)
  const callbackConsumedRef = useRef(false)
  const awaiting3DSRef = useRef(false)
  const checkoutSessionIdRef = useRef<string | null>(null)
  const reservationExpiresAtRef = useRef<number | null>(null)
  const reservationTimerRef = useRef<number | null>(null)
  const paymentAttemptStartedRef = useRef(false)
  const aliveRef = useRef(true)
  const operationVersionRef = useRef(0)
  const sessionIsCurrentRef = useRef<(() => boolean) | null>(null)
  const recoveryBusyRef = useRef(false)
  // A changed order, customer, consent or config invalidates pending responses.
  // This string remains in memory only; it is never persisted or transmitted.
  const operationContext = JSON.stringify({config, customer, order})
  const beginOperation = useCallback(() => {
    const version = ++operationVersionRef.current
    return () => aliveRef.current && version === operationVersionRef.current
  }, [])

  const review = useCallback((text: string) => {
    awaiting3DSRef.current = false
    const session = sessionRef.current
    if (session) setRecovery(session, 'review')
    busyRef.current = true
    setStatus('review')
    setMessage(text)
    onReview(text)
  }, [onReview])


  const clearReservationTimer = useCallback(() => {
    if (reservationTimerRef.current !== null) {
      window.clearTimeout(reservationTimerRef.current)
      reservationTimerRef.current = null
    }
  }, [])

  const expireReservation = useCallback(() => {
    if (!aliveRef.current) return
    clearReservationTimer()
    awaiting3DSRef.current = false
    try { checkoutRef.current?.close() } catch {}
    try { window.Culqi3DS?.reset() } catch {}

    if (paymentAttemptStartedRef.current || readRecovery()) {
      review('La reserva venció mientras el pago estaba en curso. No vuelvas a pagar hasta verificar el estado.')
      return
    }

    busyRef.current = false
    callbackConsumedRef.current = false
    sessionRef.current = null
    tokenRef.current = null
    checkoutSessionIdRef.current = null
    reservationExpiresAtRef.current = null
    setStatus('expired')
    setMessage('Tu reserva venció y el cupo dejó de estar garantizado. Inicia un nuevo checkout.')
  }, [clearReservationTimer, review])

  const checkReservationExpiry = useCallback(() => {
    const expiresAt = reservationExpiresAtRef.current
    if (expiresAt !== null && Date.now() >= expiresAt) {
      expireReservation()
      return true
    }
    return false
  }, [expireReservation])

  const scheduleReservationExpiry = useCallback((expiresAt: number) => {
    reservationExpiresAtRef.current = expiresAt
    clearReservationTimer()

    const watch = () => {
      reservationTimerRef.current = null
      if (!aliveRef.current || checkReservationExpiry()) return
      const remaining = expiresAt - Date.now()
      reservationTimerRef.current = window.setTimeout(watch, Math.max(250, Math.min(remaining, 2_147_483_647)))
    }

    watch()
  }, [checkReservationExpiry, clearReservationTimer])

  const waitForPaid = useCallback(async (session: CheckoutSession, isCurrent: () => boolean) => {
    if (!isCurrent()) return
    setStatus('confirming')
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, Math.min(1500 * (attempt + 1), 6000)))
      if (!isCurrent()) return
      const { response, result: rawStatus } = await jsonFetch<{
        ok?: boolean
        paymentStatus?: string
        amountPen?: number | null
        reconciliationRequired?: boolean
      }>('/api/payments/culqi/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutSessionId: session.checkoutSessionId,
          orderCode: session.orderCode,
        }),
      }, 10_000)

      if (!isCurrent()) return
      if (!response.ok) throw new Error('No se pudo verificar el estado del pago.')
      const result = parsePaymentStatusObservation(rawStatus, {orderCode: session.orderCode, amountMinor: session.amountMinor})
      if (result.reconciliationRequired === true) {
        review('El pago necesita revisión. No vuelvas a pagar; verifica el estado del pedido.')
        return
      }
      if (result.paymentStatus === 'paid') {
        const receipt = confirmPaidOrderReceipt(result, {orderCode: session.orderCode, amountMinor: session.amountMinor})
        clearReservationTimer()
        clearRecovery(session)
        busyRef.current = false
        paymentAttemptStartedRef.current = false
        setStatus('ready')
        onPaid({ orderCode: receipt.orderCode, amountPen: receipt.amountMinor / 100, receipt })
        return
      }
      if (result.paymentStatus === 'failed' || result.paymentStatus === 'expired') {
        clearReservationTimer()
        clearRecovery(session)
        busyRef.current = false
        paymentAttemptStartedRef.current = false
        sessionRef.current = null
        tokenRef.current = null
        checkoutSessionIdRef.current = null
        reservationExpiresAtRef.current = null
        setStatus('error')
        setMessage('El pago no se completó. Puedes iniciar un nuevo checkout.')
        return
      }
    }
    review('No pudimos confirmar el resultado todavía. No vuelvas a pagar hasta revisar el pedido.')
  }, [clearReservationTimer, onPaid, review])

  const submitToken = useCallback(async (
    session: CheckoutSession,
    tokenId: string,
    deviceId: string,
    authentication3DS?: Auth3DS,
    isCurrent = sessionIsCurrentRef.current,
  ) => {
    if (!isCurrent?.() || checkReservationExpiry()) return
    paymentAttemptStartedRef.current = true

    const { response, result } = await jsonFetch<{
      ok?: boolean
      paymentStatus?: string
      requires3DS?: boolean
      error?: string
    }>('/api/payments/culqi/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authentication3DS,
        checkoutSessionId: session.checkoutSessionId,
        deviceId,
        email: customer.email,
        orderCode: session.orderCode,
        sourceId: tokenId,
      }),
    }, 30_000)

    if (!isCurrent()) return
    if (!response.ok || result.paymentStatus === 'reconciliation_required') {
      review(result.error || 'El resultado del pago necesita revisión. No vuelvas a pagar.')
      return
    }

    if (result.requires3DS) {
      // A response may arrive after the reservation expired while awaiting charge.
      // Do not restart authentication; non-3DS outcomes still go to observation.
      if (checkReservationExpiry()) return
      if (!tokenId.startsWith('tkn_') || !window.Culqi3DS) {
        review('No se pudo iniciar la autenticación bancaria.')
        return
      }
      tokenRef.current = { tokenId, deviceId }
      setStatus('3ds')
      window.Culqi3DS.settings = {
        card: { email: customer.email.trim().toLowerCase() },
        charge: {
          totalAmount: session.amountMinor,
          returnUrl: window.location.href,
          currency: 'PEN',
        },
      }
      awaiting3DSRef.current = true
      await window.Culqi3DS.initAuthentication(tokenId)
      return
    }

    clearReservationTimer()
    await waitForPaid(session, isCurrent)
  }, [checkReservationExpiry, clearReservationTimer, customer.email, review, waitForPaid])

  const recoverPayment = useCallback(async () => {
    if (!aliveRef.current || recoveryBusyRef.current) return
    const recovered = readRecovery()
    if (!recovered || !('checkoutSessionId' in recovered)) {
      setStatus('review')
      setMessage('Existe una referencia de pago inválida. No vuelvas a pagar hasta revisarla.')
      return
    }
    recoveryBusyRef.current = true
    busyRef.current = true
    const isCurrent = beginOperation()
    setStatus('confirming')
    setMessage('Consultando el estado del pago…')
    try {
      const { response, result: rawStatus } = await jsonFetch<{
        ok?: boolean
        paymentStatus?: string
        amountPen?: number | null
        reconciliationRequired?: boolean
      }>('/api/payments/culqi/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutSessionId: recovered.checkoutSessionId,
          orderCode: recovered.orderCode,
        }),
      }, 10_000)

      if (!isCurrent()) return
      if (!response.ok) throw new Error('No se pudo verificar el estado del pago.')
      const result = parsePaymentStatusObservation(rawStatus, {orderCode: recovered.orderCode})
      if (result.reconciliationRequired === true) {
        setStatus('review')
        setMessage('El pago necesita revisión. No vuelvas a pagar.')
        return
      }
      if (result.paymentStatus === 'paid') {
        const receipt = confirmPaidOrderReceipt(result, {orderCode: recovered.orderCode})
        clearReservationTimer()
        clearRecovery(recovered)
        busyRef.current = false
        paymentAttemptStartedRef.current = false
        setStatus('ready')
        setMessage('')
        onPaid({
          orderCode: receipt.orderCode,
          amountPen: receipt.amountMinor / 100, receipt,
        })
        return
      }
      if (result.paymentStatus === 'failed' || result.paymentStatus === 'expired') {
        clearReservationTimer()
        clearRecovery(recovered)
        busyRef.current = false
        paymentAttemptStartedRef.current = false
        sessionRef.current = null
        tokenRef.current = null
        checkoutSessionIdRef.current = null
        reservationExpiresAtRef.current = null
        setStatus('idle')
        setMessage('La reserva anterior ya no está pendiente. Puedes iniciar un nuevo checkout.')
        return
      }
      setStatus('review')
      setMessage('El pago sigue pendiente. No vuelvas a pagar todavía.')
    } catch {
      if (!isCurrent()) return
      setStatus('review')
      setMessage('No pudimos consultar el pago. No vuelvas a pagar hasta verificarlo.')
    } finally {
      if (isCurrent()) recoveryBusyRef.current = false
    }
  }, [beginOperation, clearReservationTimer, onPaid])

  const startCheckout = useCallback(async () => {
    if (!aliveRef.current || !config.enabled || busyRef.current) return
    const recovered = readRecovery()
    if (recovered) {
      await recoverPayment()
      return
    }

    busyRef.current = true
    const isCurrent = beginOperation()
    setStatus('loading')
    setMessage('Preparando tu pedido…')

    try {
      await Promise.all([
        loadScript('culqi-custom-checkout', 'https://js.culqi.com/checkout-js'),
        loadScript('culqi-3ds', 'https://3ds.culqi.com'),
      ])
      if (!isCurrent()) return
      if (!window.CulqiCheckout || !window.Culqi3DS || !config.publicKey || !config.rsaId || !config.rsaPublicKey) {
        throw new Error('Culqi no está disponible.')
      }

      const checkoutSessionId = checkoutSessionIdRef.current ?? crypto.randomUUID()
      checkoutSessionIdRef.current = checkoutSessionId
      const { response: reservationResponse, result: rawReservation } = await jsonFetch<{
        ok?: boolean
        amountMinor?: number
        checkoutSessionId?: string
        expiresAt?: string | null
        orderCode?: string
        error?: string
      }>('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...order,
          ...customer,
          checkoutSessionId,
          website: '',
        }),
      }, 20_000)

      if (!isCurrent()) return
      if (!reservationResponse.ok) throw new Error(rawReservation.error || 'No se pudo reservar el pedido.')
      const reservation = confirmBrowserReservation(rawReservation, checkoutSessionId)

      const { response: prepResponse, result: prepared } = await jsonFetch<{
        ok?: boolean
        sessionId?: string
        amount?: number
        expiresAt?: string | null
        error?: string
      }>('/api/payments/culqi/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutSessionId,
          email: customer.email,
          orderCode: reservation.orderCode,
        }),
      }, 15_000)

      if (!isCurrent()) return
      if (!prepResponse.ok) throw new Error(prepared.error || 'No se pudo preparar Culqi.')
      const session = confirmBrowserPreparation(prepared, reservation)
      const expiresAt = session.expiresAt ? Date.parse(session.expiresAt) : NaN
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        checkoutSessionIdRef.current = null
        throw new Error('La reserva expiró antes de abrir el checkout.')
      }
      sessionRef.current = session
      sessionIsCurrentRef.current = isCurrent
      scheduleReservationExpiry(expiresAt)

      window.Culqi3DS.publicKey = config.publicKey
      window.Culqi3DS.options = {
        showModal: true,
        showLoading: true,
        showIcon: true,
        closeModalAction: () => { if (isCurrent() && awaiting3DSRef.current) review('La autenticación bancaria fue cerrada. Revisa el estado antes de volver a pagar.') },
      }

      const names = customer.customerName.trim().split(/\s+/)
      const firstName = names.shift() || 'Cliente'
      const lastName = names.join(' ') || 'Bagelito'
      const checkout = new window.CulqiCheckout(config.publicKey, {
        settings: {
          title: 'Bagelito',
          currency: 'PEN',
          amount: session.amountMinor,
          xculqirsaid: config.rsaId,
          rsapublickey: config.rsaPublicKey.replace(/\\n/g, '\n'),
        },
        client: {
          email: customer.email.trim().toLowerCase(),
          firstName,
          lastName,
        },
        options: {
          lang: 'es',
          installments: true,
          modal: false,
          container: '#culqi-checkout-container',
          paymentMethods: {
            tarjeta: true,
            yape: session.amountMinor <= 200000,
            billetera: false,
            bancaMovil: false,
            agente: false,
            cuotealo: false,
          },
          paymentMethodsSort: ['yape', 'tarjeta'],
        },
        appearance: {
          hiddenEmail: true,
          menuType: 'sliderTop',
          theme: 'default',
          variables: {
            colorPrimary: '#004aad',
            colorBackground: '#fffaf4',
            colorText: '#10243a',
            borderRadius: '16px',
          },
        },
      })

      checkoutRef.current = checkout
      checkout.culqi = () => {
        if (!isCurrent() || !busyRef.current || callbackConsumedRef.current) return
        callbackConsumedRef.current = true
        const tokenId = checkout.token?.id
        if (!tokenId) {
          callbackConsumedRef.current = false
          busyRef.current = false
          const error = checkout.error
          setStatus('error')
          setMessage(error?.user_message || error?.merchant_message || error?.message || 'Culqi no pudo generar el token.')
          return
        }

        void (async () => {
          try {
            checkout.close()
            setStatus('charging')
            window.Culqi3DS!.publicKey = config.publicKey!
            const deviceId = tokenId.startsWith('tkn_') ? await window.Culqi3DS!.generateDevice() : ''
            if (!isCurrent()) return
            if (tokenId.startsWith('tkn_') && !deviceId) {
              throw new Error('No se pudo generar el identificador antifraude.')
            }
            if (checkReservationExpiry()) return

            tokenRef.current = { tokenId, deviceId }
            setRecovery(session, 'pending')
            await submitToken(session, tokenId, deviceId)
          } catch (error) {
            if (isCurrent()) review(error instanceof Error ? error.message : 'No se pudo procesar el pago.')
          }
        })()
      }

      busyRef.current = true
      callbackConsumedRef.current = false
      setStatus('ready')
      setMessage('')
      checkout.open()
    } catch (error) {
      if (!isCurrent()) return
      busyRef.current = false
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar Culqi.')
    }
  }, [beginOperation, checkReservationExpiry, config, customer, order, recoverPayment, review, scheduleReservationExpiry, submitToken])

  useEffect(() => {
    function on3DSMessage(event: MessageEvent) {
      const isCurrent = sessionIsCurrentRef.current
      if (!isCurrent?.() || !awaiting3DSRef.current) return
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') return
      const data = event.data as { parameters3DS?: Auth3DS; error?: unknown }
      if (data.error) {
        awaiting3DSRef.current = false
        window.Culqi3DS?.reset()
        review('No se pudo completar la autenticación 3D Secure.')
        return
      }
      if (!data.parameters3DS) return
      // Consume synchronously before any asynchronous continuation: repeated,
      // dismissed or late SDK messages must not submit another charge request.
      awaiting3DSRef.current = false
      const session = sessionRef.current
      const token = tokenRef.current
      if (!session || !token) {
        review('Se perdió la referencia del pago. No vuelvas a pagar.')
        return
      }
      if (checkReservationExpiry()) return
      setStatus('charging')
      void submitToken(session, token.tokenId, token.deviceId, data.parameters3DS, isCurrent)
        .catch(() => { if (isCurrent()) review('No pudimos verificar el resultado. No vuelvas a pagar.') })
        .finally(() => { if (isCurrent()) window.Culqi3DS?.reset() })
    }

    window.addEventListener('message', on3DSMessage)
    return () => window.removeEventListener('message', on3DSMessage)
  }, [checkReservationExpiry, review, submitToken])

  useEffect(() => {
    const onForeground = () => { checkReservationExpiry() }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkReservationExpiry()
    }

    window.addEventListener('focus', onForeground)
    window.addEventListener('pageshow', onForeground)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearReservationTimer()
      window.removeEventListener('focus', onForeground)
      window.removeEventListener('pageshow', onForeground)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [checkReservationExpiry, clearReservationTimer])

  useEffect(() => {
    aliveRef.current = true
    setStatus('idle')
    setMessage('')
    return () => {
      aliveRef.current = false
      operationVersionRef.current++
      recoveryBusyRef.current = false
      busyRef.current = false
      sessionIsCurrentRef.current = null
      sessionRef.current = null
      tokenRef.current = null
      checkoutSessionIdRef.current = null
      reservationExpiresAtRef.current = null
      callbackConsumedRef.current = false
      awaiting3DSRef.current = false
      paymentAttemptStartedRef.current = false
      clearReservationTimer()
      try { checkoutRef.current?.close() } catch {}
      try { window.Culqi3DS?.reset() } catch {}
      // Recovery in localStorage is deliberately retained: cleanup is not proof
      // that a submitted payment failed or that another charge is safe.
    }
  }, [operationContext, clearReservationTimer])

  const customerReady = customer.customerName.trim().length >= 2
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())
    && customer.whatsapp.replace(/\D/g, '').length >= 7
    && customer.deliveryAddress.trim().length >= 5
    && customer.district.trim().length > 0
    && customer.termsAccepted

  if (!config.enabled) {
    return <div className="culqi-browser-status is-locked">
      <b>{sandboxMode ? 'Prueba sandbox bloqueada' : 'Checkout Culqi bloqueado'}</b>
      <span>Subtotal actual: S/ {subtotalPen}. Se habilitará solo cuando cliente, webhook, datos legales y batch estén listos.</span>
    </div>
  }

  return <div className="culqi-browser-checkout">
    <button type="button" className="culqi-start-button" disabled={!customerReady || status === 'loading' || status === 'charging' || status === '3ds' || status === 'confirming' || status === 'review'} onClick={() => void startCheckout()}>
      {sandboxMode && 'Prueba sandbox · '}
      {status === 'loading' ? 'Preparando…'
        : status === 'expired' ? 'Reserva vencida'
          : status === 'charging' ? 'Procesando…'
          : status === '3ds' ? 'Autenticando banco…'
            : status === 'confirming' ? 'Confirmando pago…'
              : status === 'review' ? 'Pago en revisión'
                : sandboxMode ? 'Iniciar prueba con Culqi' : 'Pagar con Culqi'}
    </button>
    {!customerReady && <p className="culqi-browser-message">{sandboxMode ? 'Completa los datos de prueba autorizados y acepta los términos para habilitar la prueba sandbox.' : 'Completa tus datos y acepta los términos para habilitar el pago.'}</p>}
    {message && <p className="culqi-browser-message">{message}</p>}
    {status === 'review' && <button type="button" className="culqi-recovery-button" onClick={() => void recoverPayment()}>{sandboxMode ? 'Consultar estado de la prueba sandbox' : 'Consultar estado del pago'}</button>}
    <div id="culqi-checkout-container" className="culqi-browser-container" />
  </div>
}
