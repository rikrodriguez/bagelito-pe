export type PaymentMode = 'disabled' | 'sandbox' | 'live'

export type PublicPaymentConfig = {
  mode: PaymentMode
  currency: 'PEN'
  enabled: boolean
  configured: boolean
  intakeEnabled: boolean
  bridgeReady: boolean
  webhookReady: boolean
  clientReady: boolean
  merchantReviewOnly: boolean
  visualQaAllowed: boolean
  provider: 'culqi' | 'manual'
  publicKey: string
  rsaId: string
  rsaPublicKey: string
}

export type PrivatePaymentConfig = PublicPaymentConfig & {
  secretKey: string
}

function configuredSiteUrl() {
  return process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || ''
}

function siteHost() {
  try {
    return new URL(configuredSiteUrl()).hostname
  } catch {
    return ''
  }
}

function buildPaymentConfig(): PrivatePaymentConfig {
  const provider: PublicPaymentConfig['provider'] = process.env.PAYMENT_PROVIDER === 'culqi' ? 'culqi' : 'manual'
  const publicKey = (process.env.CULQI_PUBLIC_KEY || process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY || '').trim()
  const rsaId = (process.env.CULQI_RSA_ID || process.env.NEXT_PUBLIC_CULQI_RSA_ID || '').trim()
  const rsaPublicKey = (process.env.CULQI_RSA_PUBLIC_KEY || process.env.NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY || '').trim()
  const secretKey = (process.env.CULQI_SECRET_KEY || '').trim()

  const requestedMode: PaymentMode = process.env.CULQI_MODE === 'sandbox'
    ? 'sandbox'
    : process.env.CULQI_MODE === 'live'
      ? 'live'
      : 'disabled'

  const matchingKeys = requestedMode === 'sandbox'
    ? publicKey.startsWith('pk_test_') && secretKey.startsWith('sk_test_')
    : requestedMode === 'live'
      ? publicKey.startsWith('pk_live_') && secretKey.startsWith('sk_live_')
      : false

  const host = siteHost()
  const publicHosts = new Set(['bagelito.pe', 'www.bagelito.pe', 'bagelito-pe.vercel.app'])
  const sandboxOriginAllowed = Boolean(host) && !publicHosts.has(host)
  const modeAllowed = requestedMode === 'sandbox'
    ? process.env.VERCEL_ENV !== 'production' && sandboxOriginAllowed
    : requestedMode === 'live' && process.env.CULQI_LIVE_APPROVED === 'true'

  // "configured" only describes whether the server has a coherent Culqi
  // environment. It deliberately does not authorize new charges.
  const configured = provider === 'culqi'
    && matchingKeys
    && modeAllowed
    && Boolean(host)
    && Boolean(publicKey && rsaId && rsaPublicKey && secretKey)

  const merchantReviewOnly = process.env.BAGELITO_MERCHANT_REVIEW_ONLY === 'true'
  const intakeEnabled = process.env.CULQI_ENABLED === 'true' && !merchantReviewOnly

  const bridgeReady = process.env.CULQI_TANSTACK_BRIDGE_READY === 'true'
  const webhookReady = process.env.CULQI_TANSTACK_WEBHOOK_READY === 'true'
  const clientReady = process.env.CULQI_TANSTACK_CLIENT_READY === 'true'

  const visualQaAllowed = process.env.BAGELITO_VISUAL_QA_ENABLED === 'true'
    && process.env.VERCEL_ENV !== 'production'

  return {
    mode: requestedMode,
    currency: 'PEN',
    enabled: configured && intakeEnabled && bridgeReady && webhookReady && clientReady,
    configured,
    intakeEnabled,
    bridgeReady,
    webhookReady,
    clientReady,
    merchantReviewOnly,
    visualQaAllowed,
    provider,
    publicKey: configured ? publicKey : '',
    rsaId: configured ? rsaId : '',
    rsaPublicKey: configured ? rsaPublicKey : '',
    secretKey: configured ? secretKey : '',
  }
}

export function getPublicPaymentConfig(): PublicPaymentConfig {
  const { secretKey: _secretKey, ...publicConfig } = buildPaymentConfig()
  return publicConfig
}

export function getPrivatePaymentConfig(): PrivatePaymentConfig {
  return buildPaymentConfig()
}

function requestMatchesConfiguredOrigin(request: Request) {
  const configuredSite = configuredSiteUrl()
  try {
    const expected = new URL(configuredSite)
    const actual = new URL(request.url)
    if (actual.origin !== expected.origin) return false

    const origin = request.headers.get('origin')
    if (origin && origin !== expected.origin) return false

    const forwardedHost = request.headers.get('x-forwarded-host')
    if (forwardedHost && forwardedHost !== expected.host) return false

    const forwardedProto = request.headers.get('x-forwarded-proto')
    if (forwardedProto && forwardedProto !== expected.protocol.replace(':', '')) return false

    return true
  } catch {
    return false
  }
}

/** New reservation / token / charge intake. */
export function isPaymentRequestAllowed(request: Request) {
  const cfg = buildPaymentConfig()
  return cfg.enabled
    && cfg.bridgeReady
    && requestMatchesConfiguredOrigin(request)
}

/**
 * Read/recovery path for an already-created payment.
 * It intentionally remains available when new intake is disabled so operators
 * can close the front door without making in-flight payments unverifiable.
 */
export function isPaymentStatusRequestAllowed(request: Request) {
  const cfg = buildPaymentConfig()
  return cfg.configured
    && cfg.bridgeReady
    && requestMatchesConfiguredOrigin(request)
}

/** Draft receipt disclosure gate. Not an intake/payment switch. Never live or
 * production; future cutover requires a separate reviewed change. Browser-only
 * same-origin disclosure, in addition to the order capability checked by status.
 */
export function isGuidedReceiptRequestAllowed(request: Request) {
  const cfg = buildPaymentConfig()
  return process.env.BAGELITO_GUIDED_RECEIPT_ENABLED === 'true'
    && process.env.VERCEL_ENV !== 'production'
    && cfg.mode === 'sandbox' && cfg.configured && cfg.bridgeReady
    && requestMatchesConfiguredOrigin(request)
    && request.headers.get('origin') === new URL(request.url).origin
    && (!request.headers.has('sec-fetch-site') || request.headers.get('sec-fetch-site') === 'same-origin')
}

/** Closed-by-default draft product-intake lane. No live/production opt-in is
 * supported; the independent SQL owner policy must also permit reservations.
 */
export function isGuidedProductCheckoutRequestAllowed(request: Request) {
  const cfg = buildPaymentConfig()
  return process.env.BAGELITO_GUIDED_PRODUCT_CHECKOUT_ENABLED === 'true'
    && process.env.BAGELITO_REFERENCE_REVIEW_ONLY !== 'true'
    && process.env.VERCEL_ENV !== 'production'
    && cfg.mode === 'sandbox' && isPaymentRequestAllowed(request)
    && request.headers.get('origin') === new URL(request.url).origin
    && (!request.headers.has('sec-fetch-site') || request.headers.get('sec-fetch-site') === 'same-origin')
}

/** Read-only sandbox entry availability; never returned as payment authority.
 * Navigating to this GET page need not carry Origin, but its checkout requests do.
 */
export function isGuidedProductCheckoutPageAllowed(request: Request) {
  const cfg = buildPaymentConfig()
  return process.env.BAGELITO_GUIDED_PRODUCT_CHECKOUT_ENABLED === 'true'
    && process.env.BAGELITO_REFERENCE_REVIEW_ONLY !== 'true'
    && process.env.VERCEL_ENV !== 'production'
    && cfg.mode === 'sandbox' && isPaymentRequestAllowed(request)
}

/** Recheck at token preparation and charge, not only at reservation creation.
 * A shared/copied database must never route a draft guided reservation to live.
 * Legacy orders retain their existing guards. Unknown guided versions stay shut.
 */
export function isPersistedProductPaymentRequestAllowed(request: Request, packSlug: unknown) {
  if (typeof packSlug !== 'string' || !packSlug) return false
  if (!packSlug.startsWith('guided-')) return true
  return /^guided-v1:((6|12)-(single|mixed)|schmear-(120|180|240))$/.test(packSlug)
    && isGuidedProductCheckoutRequestAllowed(request)
}
