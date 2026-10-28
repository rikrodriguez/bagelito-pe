export type PaymentMode = 'disabled' | 'sandbox' | 'live'

export type PublicPaymentConfig = {
  mode: PaymentMode
  currency: 'PEN'
  enabled: boolean
  bridgeReady: boolean
  provider: 'culqi' | 'manual'
  publicKey: string
  rsaId: string
  rsaPublicKey: string
}

export type PrivatePaymentConfig = PublicPaymentConfig & {
  secretKey: string
}

function siteHost() {
  try {
    return new URL(process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').hostname
  } catch {
    return ''
  }
}

function buildPaymentConfig() {
  const provider = process.env.PAYMENT_PROVIDER === 'culqi' ? 'culqi' : 'manual'
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

  const configured = provider === 'culqi'
    && process.env.CULQI_ENABLED === 'true'
    && matchingKeys
    && modeAllowed
    && Boolean(publicKey && rsaId && rsaPublicKey && secretKey)

  // Transactional reservation + charge endpoints are intentionally not exposed
  // until the Next.js security/reconciliation layer has been ported and tested.
  const bridgeReady = process.env.CULQI_TANSTACK_BRIDGE_READY === 'true'

  return {
    mode: requestedMode,
    currency: 'PEN' as const,
    enabled: configured && bridgeReady,
    bridgeReady,
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
