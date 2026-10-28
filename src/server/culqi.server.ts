import { getPrivatePaymentConfig } from './payment-config.server'

export type CulqiAuthentication3DS = {
  cavv: string
  directoryServerTransactionId?: string
  eci: string
  protocolVersion: string
  xid: string
}

export type CulqiCharge = {
  id?: string
  object?: string
  amount?: number
  current_amount?: number
  amount_refunded?: number
  currency?: string
  currency_code?: string
  capture?: boolean
  capture_date?: number
  dispute?: boolean
  duplicated?: boolean
  paid?: boolean
  state?: string
  action_code?: string
  metadata?: Record<string, string> | null
  source?: { id?: string; type?: string } | null
  outcome?: {
    type?: string
    code?: string
    decline_code?: string
    merchant_message?: string
    user_message?: string
  } | null
}

export type CulqiChargeResult =
  | { charge: CulqiCharge & { id: string }; requires3DS: false }
  | { response: CulqiCharge; requires3DS: true }

function config() {
  const cfg = getPrivatePaymentConfig()
  if (!cfg.enabled || !cfg.bridgeReady || !cfg.secretKey) {
    throw new Error('Culqi bridge is not enabled.')
  }
  return cfg
}

function minor(amountPen: number) {
  const value = Math.round(amountPen * 100)
  if (!Number.isInteger(value) || value < 100) throw new Error('Invalid payment amount.')
  return value
}

function validSource(sourceId: string, mode: 'sandbox' | 'live') {
  const env = mode === 'sandbox' ? 'test' : 'live'
  return new RegExp('^(tkn|ype)_' + env + '_[A-Za-z0-9_-]{8,100}$').test(sourceId)
}

async function withinDeadline<T>(operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const timeoutError = new DOMException('Culqi request deadline exceeded.', 'TimeoutError')
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(timeoutError)
      reject(timeoutError)
    }, 10_000)
  })

  try {
    return await Promise.race([operation(controller.signal), deadline])
  } finally {
    clearTimeout(timer)
  }
}

export async function createCulqiCharge(input: {
  amountPen: number
  sourceId: string
  email: string
  orderCode: string
  customerName: string
  phoneNumber: string
  address: string
  district: string
  deviceId?: string
  authentication3DS?: CulqiAuthentication3DS
}): Promise<CulqiChargeResult> {
  const cfg = config()
  if (cfg.mode !== 'sandbox' && cfg.mode !== 'live') throw new Error('Culqi mode unavailable.')
  if (!validSource(input.sourceId, cfg.mode)) throw new Error('Invalid Culqi source.')
  if (input.sourceId.startsWith('ype_') && input.authentication3DS) {
    throw new Error('Yape cannot use card 3DS.')
  }
  if (input.sourceId.startsWith('ype_') && input.amountPen > 2000) {
    throw new Error('Yape supports a maximum of S/ 2000 per payment.')
  }

  const parts = input.customerName.trim().split(/\s+/).filter(Boolean)
  const firstName = parts.shift() || 'Cliente'
  const lastName = parts.join(' ') || 'Bagelito'
  const digits = input.phoneNumber.replace(/\D/g, '')
  const phone = digits.startsWith('51') && digits.length === 11 ? digits.slice(2) : digits.slice(-9)

  const url = 'https://api.culqi.com/v2/charges'
  const response = await withinDeadline((signal) => fetch(url, {
    method: 'POST',
    signal,
    cache: 'no-store',
    redirect: 'error',
    credentials: 'omit',
    headers: {
      Authorization: 'Bearer ' + cfg.secretKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      amount: minor(input.amountPen),
      capture: true,
      currency_code: 'PEN',
      description: 'Bagelito - ' + input.orderCode,
      email: input.email.trim().toLowerCase(),
      metadata: { bagelito_order_code: input.orderCode },
      source_id: input.sourceId,
      antifraud_details: {
        address: input.address,
        address_city: input.district,
        country_code: 'PE',
        email: input.email.trim().toLowerCase(),
        first_name: firstName,
        last_name: lastName,
        phone_number: phone,
        ...(input.deviceId ? { device_finger_print_id: input.deviceId } : {}),
      },
      ...(input.authentication3DS ? { authentication_3DS: input.authentication3DS } : {}),
    }),
  }))

  if (response.redirected || (response.url && response.url !== url)) {
    throw new Error('Culqi charge request cannot follow redirects.')
  }

  const payload = await response.json().catch(() => null) as
    | CulqiCharge
    | { user_message?: string; merchant_message?: string }
    | null

  if (!response.ok) {
    const message = payload && 'user_message' in payload
      ? payload.user_message || payload.merchant_message
      : null
    throw new Error(message || 'Culqi charge failed.')
  }

  if (!payload || !('object' in payload) || payload.object !== 'charge') {
    throw new Error('Culqi did not return a valid charge.')
  }

  const charge = payload as CulqiCharge
  if (response.status === 200 && charge.action_code === 'REVIEW') {
    if (typeof charge.id === 'string' && charge.id) {
      return {
        charge: charge as CulqiCharge & { id: string },
        requires3DS: false,
      }
    }
    if (charge.capture === true) throw new Error('Ambiguous Culqi authentication response.')
    return { response: charge, requires3DS: true }
  }

  if (response.status !== 201 || !charge.id) {
    throw new Error('Culqi did not return a valid captured charge.')
  }

  return {
    charge: charge as CulqiCharge & { id: string },
    requires3DS: false,
  }
}

export async function fetchCulqiCharge(chargeId: string) {
  const cfg = config()
  if (cfg.mode !== 'sandbox' && cfg.mode !== 'live') throw new Error('Culqi mode unavailable.')

  const env = cfg.mode === 'sandbox' ? 'test' : 'live'
  if (!new RegExp('^chr_' + env + '_[A-Za-z0-9_-]{8,100}$').test(chargeId)) {
    throw new Error('Invalid Culqi charge ID.')
  }

  const url = 'https://api.culqi.com/v2/charges/' + encodeURIComponent(chargeId)
  const response = await withinDeadline((signal) => fetch(url, {
    method: 'GET',
    signal,
    cache: 'no-store',
    redirect: 'error',
    credentials: 'omit',
    headers: {
      Authorization: 'Bearer ' + cfg.secretKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-version': '2',
      'x-culqi-env': env,
    },
  }))

  if (response.redirected || (response.url && response.url !== url)) {
    throw new Error('Culqi charge lookup cannot follow redirects.')
  }

  const payload = await response.json().catch(() => null) as CulqiCharge | null
  if (!response.ok || !payload || payload.object !== 'charge' || payload.id !== chargeId) {
    throw new Error('Culqi charge could not be verified.')
  }

  return payload
}
