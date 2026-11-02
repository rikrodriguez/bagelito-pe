/**
 * Proposed product-line persistence adapter. Writes remain unregistered. Reads
 * may be used by the separately gated status service after capability validation.
 * Requires an explicitly injected DB; never reads credentials.
 * The additive SQL RPC is independently disabled by its owner-only policy.
 * Future routes must retain payment/origin/rate-limit guards; this is not an HTTP handler.
 */
import { planGuidedOrder, type GuidedQuoteRequest } from '../domain/lib/guided-order-quote'
import { CHECKOUT_LEGAL_VERSION } from '../domain/lib/legal-version'
import { getDeliveryFee, isSupportedDistrict } from './delivery-pricing.server'
import { parseGuidedProductSnapshot, buildGuidedPackingPreview } from '../domain/lib/guided-product-snapshot'

export type ProductReservationInput = {
  order: GuidedQuoteRequest
  orderCode: string
  checkoutSessionId: string
  batchId: string
  expiresAt: string
  customer: {
    customerName: unknown; email: unknown; whatsapp: unknown; deliveryAddress: unknown
    district: unknown; addressReference?: unknown; deliveryNotes?: unknown
    termsAccepted: unknown; termsVersion: unknown
  }
}
type RpcClient = {rpc(name: string, args: Record<string, unknown>): PromiseLike<{data: unknown; error: unknown}>}
async function productRpc(db: RpcClient, name: string, args: Record<string, unknown>, failure: string): Promise<unknown> {
  try {
    const result = await db.rpc(name, args)
    if (!result || result.error !== null) throw new Error(failure)
    return result.data
  } catch {
    // A lost response does not prove the write rolled back. Never retry or expose
    // raw transport diagnostics; the same session must be reconciled separately.
    throw new Error(failure)
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function clean(value: unknown, max: number, optional = false): string {
  if (optional && value === undefined) return ''
  if (typeof value !== 'string' || value.trim().length > max) throw new Error('Invalid customer field')
  return value.trim()
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}'
  return JSON.stringify(value) ?? 'undefined'
}

/** Produces a persistence candidate, NOT checkout/payment authorization. */
export function prepareGuidedProductReservation(input: ProductReservationInput) {
  const plan = planGuidedOrder(input.order)
  if (plan.status === 'invalid' || plan.amountPen === null || !plan.lines.length
    || plan.lines.some(line => !['pack', 'schmear'].includes(line.kind))) {
    throw new Error('Complete supported products with confirmed prices are required')
  }
  const customerName = clean(input.customer.customerName, 120)
  const email = clean(input.customer.email, 160).toLowerCase()
  const whatsapp = clean(input.customer.whatsapp, 40)
  const deliveryAddress = clean(input.customer.deliveryAddress, 220)
  const district = clean(input.customer.district, 80)
  const addressReference = clean(input.customer.addressReference, 160, true)
  const deliveryNotes = clean(input.customer.deliveryNotes, 500, true)
  if (customerName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || whatsapp.replace(/\D/g, '').length < 7 || deliveryAddress.length < 5 || !isSupportedDistrict(district)) {
    throw new Error('Invalid customer or delivery')
  }
  if (input.customer.termsAccepted !== true || input.customer.termsVersion !== CHECKOUT_LEGAL_VERSION) {
    throw new Error('Explicit current legal acceptance is required')
  }
  if (!uuid.test(input.checkoutSessionId) || !uuid.test(input.batchId) || !/^BAG-[A-Z0-9_-]{1,80}$/.test(input.orderCode)
    || !Number.isFinite(Date.parse(input.expiresAt))) throw new Error('Invalid reservation identity or expiry')
  // ExpiresAt is server-generated; SQL checks it again after acquiring capacity.
  const subtotalMinor = plan.amountPen * 100
  const deliveryFeeMinor = getDeliveryFee(district) * 100
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor <= 0) throw new Error('Invalid product amount')
  const args = {
    p_order_code: input.orderCode,
    p_checkout_session_id: input.checkoutSessionId.toLowerCase(),
    p_batch_id: input.batchId.toLowerCase(),
    p_customer: {customerName, email, whatsapp, deliveryAddress, district, addressReference, deliveryNotes, termsAccepted: true},
    p_lines: plan.lines,
    p_delivery_fee_minor: deliveryFeeMinor,
    p_terms_version: CHECKOUT_LEGAL_VERSION,
    p_payment_expires_at: new Date(input.expiresAt).toISOString(),
  }
  return {args, subtotalMinor, deliveryFeeMinor, amountMinor: subtotalMinor + deliveryFeeMinor}
}

/** No network/default DB client. Tests inject an isolated SQL RPC adapter. */
export async function persistGuidedProductReservation(db: RpcClient, input: ProductReservationInput) {
  const prepared = prepareGuidedProductReservation(input)
  const data = await productRpc(db, 'create_guided_product_reservation', prepared.args,
    'Complete product reservation could not be confirmed; do not initiate payment')
  const result = data as Record<string, unknown> | null
  if (!result || result.currency !== 'PEN' || result.amountMinor !== prepared.amountMinor
    || result.subtotalMinor !== prepared.subtotalMinor || result.deliveryFeeMinor !== prepared.deliveryFeeMinor
    || result.checkoutSessionId !== prepared.args.p_checkout_session_id
    || typeof result.orderId !== 'string' || !uuid.test(result.orderId)
    || typeof result.orderCode !== 'string' || !/^BAG-[A-Z0-9_-]{1,80}$/.test(result.orderCode)
    || typeof result.expiresAt !== 'string' || !Number.isFinite(Date.parse(result.expiresAt))
    || Date.parse(result.expiresAt) <= Date.now()
    || canonical(result.lines) !== canonical(prepared.args.p_lines)) {
    throw new Error('Persisted product reservation does not match the complete order; do not initiate payment')
  }
  return {orderId: result.orderId, orderCode: result.orderCode, checkoutSessionId: result.checkoutSessionId,
    expiresAt: result.expiresAt, amountMinor: prepared.amountMinor, subtotalMinor: prepared.subtotalMinor,
    deliveryFeeMinor: prepared.deliveryFeeMinor, currency: 'PEN' as const, lines: prepared.args.p_lines}
}

/** Read-only fulfillment/reconciliation detail; not a new reservation or payment. */
export async function readGuidedProductReservation(db: RpcClient, orderId: string) {
  if (!uuid.test(orderId)) throw new Error('Invalid order identity')
  const data = await productRpc(db, 'read_guided_product_reservation', {p_order_id: orderId.toLowerCase()},
    'Could not read the complete product reservation')
  if (data === null) return null
  return parseGuidedProductSnapshot(data, orderId)
}

/** Trusted injected reader only; no public route, customer lookup or outbound message. */
export async function readGuidedPackingPreview(db: RpcClient, orderId: string) {
  const snapshot = await readGuidedProductReservation(db, orderId)
  return snapshot === null ? null : buildGuidedPackingPreview(snapshot)
}
