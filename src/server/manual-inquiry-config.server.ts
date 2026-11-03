/** A contact-only page, never a payment or order-intake capability. */
export function isManualInquiryPageAllowed(request: Request, env: Record<string, string | undefined> = process.env) {
  if (env.BAGELITO_MANUAL_INQUIRY_ENABLED !== 'true') return false
  try {
    const configured = new URL(env.BAGELITO_MANUAL_INQUIRY_ORIGIN || '')
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname)
    if ((configured.protocol !== 'https:' && !(configured.protocol === 'http:' && loopback))
      || configured.username || configured.password
      || configured.pathname !== '/' || configured.search || configured.hash) return false
    return new URL(request.url).origin === configured.origin
  } catch {
    return false
  }
}
