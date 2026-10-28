import { useCallback, useEffect, useRef, useState } from 'react'
import { CHECKOUT_LEGAL_VERSION } from '../domain/lib/legal-version'

export type CulqiPublicConfig = {
  enabled: boolean
  configured: boolean
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

function readRecovery() {
  const raw = window.localStorage.getItem(RECOVERY_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { checkoutSessionId?: unknown; orderCode?: unknown; state?: unknown }
    if (typeof value.checkoutSessionId === 'string'
      && typeof value.orderCode === 'string'
      && (value.state === 'pending' || value.state === 'review')) return value
  } catch {}
  return { state: 'review' } as const
}

function setRecovery(session: CheckoutSession, state: 'pending'|'review') {
  window.localStorage.setItem(RECOVERY_KEY, JSON.stringify({
    checkoutSessionId: session.checkoutSessionId,
    orderCode: session.orderCode,
    state,
  }))
}

function clearRecovery(session: CheckoutSession) {
  const current = readRecovery()
  if (current?.checkoutSessionId === session.checkoutSessionId && current?.orderCode === session.orderCode) {
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
  onPaid: (orderCode: string) => void
  onReview: (message: string) => void
}) {
  const { config, customer, order, subtotalPen, onPaid, onReview } = props
  const [status, setStatus] = useState<'idle'|'loading'|'ready'|'charging'|'3ds'|'confirming'|'review'|'error'>('idle')
  const [message, setMessage] = useState('')
  const checkoutRef = useRef<CheckoutInstance | null>(null)
  const sessionRef = useRef<CheckoutSession | null>(null)
  const tokenRef = useRef<{ tokenId: string; deviceId: string } | null>(null)
  const busyRef = useRef(false)
  const callbackConsumedRef = useRef(false)

  const review = useCallback((text: string) => {
    const session = sessionRef.current
    if (session) setRecovery(session, 'review')
    busyRef.current = true
    setStatus('review')
    setMessage(text)
    onReview(text)
  }, [onReview])

  const waitForPaid = useCallback(async (session: CheckoutSession) => {
    setStatus('confirming')
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, Math.min(1500 * (attempt + 1), 6000)))
      const { response, result } = await jsonFetch<{
        ok?: boolean
        paymentStatus?: string
        reconciliationRequired?: boolean
      }>('/api/payments/culqi/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutSessionId: session.checkoutSessionId,
          orderCode: session.orderCode,
        }),
      }, 10_000)

      if (!response.ok || result.reconciliationRequired === true) {
        review('El pago necesita revisión. No vuelvas a pagar; verifica el estado del pedido.')
        return
      }
      if (result.paymentStatus === 'paid') {
        clearRecovery(session)
        busyRef.current = false
        setStatus('ready')
        onPaid(session.orderCode)
        return
      }
      if (result.paymentStatus === 'failed' || result.paymentStatus === 'expired') {
        clearRecovery(session)
        busyRef.current = false
        setStatus('error')
        setMessage('El pago no se completó. Puedes iniciar un nuevo checkout.')
        return
      }
    }
    review('No pudimos confirmar el resultado todavía. No vuelvas a pagar hasta revisar el pedido.')
  }, [onPaid, review])

  const submitToken = useCallback(async (
    session: CheckoutSession,
    tokenId: string,
    deviceId: string,
    authentication3DS?: Auth3DS,
  ) => {
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

    if (!response.ok || result.paymentStatus === 'reconciliation_required') {
      review(result.error || 'El resultado del pago necesita revisión. No vuelvas a pagar.')
      return
    }

    if (result.requires3DS) {
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
      await window.Culqi3DS.initAuthentication(tokenId)
      return
    }

    await waitForPaid(session)
  }, [customer.email, review, waitForPaid])

  const startCheckout = useCallback(async () => {
    if (!config.enabled || busyRef.current) return
    const recovered = readRecovery()
    if (recovered) {
      setStatus('review')
      setMessage('Existe un pago pendiente de verificación. No inicies otro pago.')
      onReview('Existe un pago pendiente de verificación. No inicies otro pago.')
      return
    }

    busyRef.current = true
    setStatus('loading')
    setMessage('Preparando tu pedido…')

    try {
      await Promise.all([
        loadScript('culqi-custom-checkout', 'https://js.culqi.com/checkout-js'),
        loadScript('culqi-3ds', 'https://3ds.culqi.com'),
      ])
      if (!window.CulqiCheckout || !window.Culqi3DS || !config.publicKey || !config.rsaId || !config.rsaPublicKey) {
        throw new Error('Culqi no está disponible.')
      }

      const checkoutSessionId = crypto.randomUUID()
      const { response: reservationResponse, result: reservation } = await jsonFetch<{
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

      if (!reservationResponse.ok || !reservation.ok || !reservation.orderCode || !reservation.amountMinor) {
        throw new Error(reservation.error || 'No se pudo reservar el pedido.')
      }

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

      if (!prepResponse.ok || !prepared.ok || !prepared.sessionId || !prepared.amount) {
        throw new Error(prepared.error || 'No se pudo preparar Culqi.')
      }
      if (prepared.amount !== reservation.amountMinor) {
        throw new Error('El monto preparado no coincide con la reserva.')
      }

      const session: CheckoutSession = {
        amountMinor: prepared.amount,
        checkoutSessionId,
        expiresAt: prepared.expiresAt ?? reservation.expiresAt ?? null,
        orderCode: reservation.orderCode,
        sessionId: prepared.sessionId,
      }
      sessionRef.current = session

      window.Culqi3DS.publicKey = config.publicKey
      window.Culqi3DS.options = {
        showModal: true,
        showLoading: true,
        showIcon: true,
        closeModalAction: () => review('La autenticación bancaria fue cerrada. Revisa el estado antes de volver a pagar.'),
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
        if (!busyRef.current || callbackConsumedRef.current) return
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
              setRecovery(session, 'pending')
              setStatus('charging')
              window.Culqi3DS!.publicKey = config.publicKey!
              const deviceId = tokenId.startsWith('tkn_') ? await window.Culqi3DS!.generateDevice() : ''
              if (tokenId.startsWith('tkn_') && !deviceId) throw new Error('No se pudo generar el identificador antifraude.')
              tokenRef.current = { tokenId, deviceId }
              await submitToken(session, tokenId, deviceId)
            } catch (error) {
              review(error instanceof Error ? error.message : 'No se pudo procesar el pago.')
            }
        })()
      }

      busyRef.current = true
      callbackConsumedRef.current = false
      setStatus('ready')
      setMessage('')
      checkout.open()
    } catch (error) {
      busyRef.current = false
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar Culqi.')
    }
  }, [config, customer, onReview, order, review, status, submitToken])

  useEffect(() => {
    function on3DSMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') return
      const data = event.data as { parameters3DS?: Auth3DS; error?: unknown }
      if (data.error) {
        window.Culqi3DS?.reset()
        review('No se pudo completar la autenticación 3D Secure.')
        return
      }
      if (!data.parameters3DS) return
      const session = sessionRef.current
      const token = tokenRef.current
      if (!session || !token) {
        review('Se perdió la referencia del pago. No vuelvas a pagar.')
        return
      }
      setStatus('charging')
      void submitToken(session, token.tokenId, token.deviceId, data.parameters3DS)
        .finally(() => window.Culqi3DS?.reset())
    }

    window.addEventListener('message', on3DSMessage)
    return () => window.removeEventListener('message', on3DSMessage)
  }, [review, submitToken])

  useEffect(() => () => {
    try { checkoutRef.current?.close() } catch {}
    try { window.Culqi3DS?.reset() } catch {}
  }, [])

  const customerReady = customer.customerName.trim().length >= 2
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())
    && customer.whatsapp.replace(/\D/g, '').length >= 7
    && customer.deliveryAddress.trim().length >= 5
    && customer.district.trim().length > 0
    && customer.termsAccepted

  if (!config.enabled) {
    return <div className="culqi-browser-status is-locked">
      <b>Checkout Culqi bloqueado</b>
      <span>Se habilitará solo cuando cliente, webhook, datos legales y batch estén listos.</span>
    </div>
  }

  return <div className="culqi-browser-checkout">
    <button type="button" className="culqi-start-button" disabled={!customerReady || status === 'loading' || status === 'charging' || status === '3ds' || status === 'confirming' || status === 'review'} onClick={() => void startCheckout()}>
      {status === 'loading' ? 'Preparando…'
        : status === 'charging' ? 'Procesando…'
          : status === '3ds' ? 'Autenticando banco…'
            : status === 'confirming' ? 'Confirmando pago…'
              : status === 'review' ? 'Pago en revisión'
                : 'Pagar con Culqi'}
    </button>
    {!customerReady && <p className="culqi-browser-message">Completa tus datos y acepta los términos para habilitar el pago.</p>}
    {message && <p className="culqi-browser-message">{message}</p>}
    <div id="culqi-checkout-container" className="culqi-browser-container" />
  </div>
}
