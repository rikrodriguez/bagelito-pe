/** Injected status reader. No default client, credentials or provider calls. */
import type { createSupabaseAdminClient } from './supabase-admin.server'
import { readGuidedPaidOrderReceipt } from './guided-paid-receipt.server'
import { parsePaymentStatusObservation } from '../domain/lib/paid-order-receipt'

type Db = ReturnType<typeof createSupabaseAdminClient>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const columns = 'id,order_code,checkout_session_id,payment_expires_at,total_amount,pack_slug,payment_currency,payment_amount_minor'
const invalid = (): never => { throw new Error('state_unavailable') }
export class PaymentStatusNotFoundError extends Error {}

export function parsePaymentStatusReference(payload: Record<string, unknown>) {
  if (typeof payload.checkoutSessionId !== 'string' || typeof payload.orderCode !== 'string') return null
  const checkoutSessionId = payload.checkoutSessionId.trim().toLowerCase()
  const orderCode = payload.orderCode.trim().toUpperCase()
  return uuid.test(checkoutSessionId) && /^BAG-[A-Z0-9_-]{1,80}$/.test(orderCode)
    ? {checkoutSessionId, orderCode} : null
}

/** Decimal DB numeric to integer cents without permissive coercion/rounding. */
function amountMinor(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return invalid()
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(String(value))
  if (!match) return invalid()
  const amount = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'))
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 2147483647 ? amount : invalid()
}

/** The UUID + order code is an existing bearer capability, not user identity.
 * Never accept an order ID, amount or paid state supplied by the browser.
 */
export async function readBoundPaymentStatus(db: Db, reference: NonNullable<ReturnType<typeof parsePaymentStatusReference>>,
  includeProductReceipt = false) {
  const normalized = parsePaymentStatusReference(reference)
  if (!normalized || normalized.checkoutSessionId !== reference.checkoutSessionId || normalized.orderCode !== reference.orderCode) return invalid()
  // Five sequential observations must share a budget below the browser's 10 s
  // status timeout. Racing the operation also bounds a transport ignoring abort.
  const deadline = Date.now() + 5000
  async function bounded<T>(operation: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return invalid()
    const operationDeadline = Date.now() + Math.min(2000, remaining)
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([Promise.resolve().then(() => operation(controller.signal)), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('state_unavailable')) }, Math.min(2000, remaining))
      })])
      if (Date.now() >= operationDeadline || Date.now() >= deadline) { controller.abort(); return invalid() }
      return result
    } finally { clearTimeout(timer) }
  }
  async function boundOrder() {
    const result = await bounded(signal => db.from('orders').select(columns)
      .eq('order_code', reference.orderCode).eq('checkout_session_id', reference.checkoutSessionId)
      .abortSignal(signal).maybeSingle())
    if (!result || result.error !== null) return invalid()
    const row = result.data
    if (row === null) throw new PaymentStatusNotFoundError('Payment not found.')
    if (!row || Array.isArray(row) || typeof row.id !== 'string' || !uuid.test(row.id)
      || row.order_code !== reference.orderCode || row.checkout_session_id !== reference.checkoutSessionId
      || row.payment_currency !== 'PEN') return invalid()
    const expiresAt = row.payment_expires_at === null ? null : typeof row.payment_expires_at === 'string'
      && Number.isFinite(Date.parse(row.payment_expires_at)) ? row.payment_expires_at : invalid()
    return {id: row.id, orderCode: row.order_code, expiresAt, amountMinor: amountMinor(row.total_amount),
      packSlug: row.pack_slug, currency: row.payment_currency, storedAmount: row.payment_amount_minor}
  }
  async function observe(row: Awaited<ReturnType<typeof boundOrder>>) {
    const state = await bounded(signal => db.rpc('expire_culqi_token_session', {
      p_order_id: row.id, p_checkout_session_id: reference.checkoutSessionId,
    }).abortSignal(signal))
    if (!state || state.error !== null || !state.data || typeof state.data !== 'object' || Array.isArray(state.data)) return invalid()
    return parsePaymentStatusObservation({ok: true, orderCode: row.orderCode, amountPen: row.amountMinor / 100,
      paymentStatus: state.data.paymentStatus, orderStatus: state.data.orderStatus,
      reconciliationRequired: state.data.reconciliationRequired}, {orderCode: row.orderCode, amountMinor: row.amountMinor})
  }
  const row = await boundOrder()
  const state = await observe(row)
  const response = {ok: true, orderCode: row.orderCode, expiresAt: row.expiresAt, currency: 'PEN' as const,
    paymentStatus: state.paymentStatus, orderStatus: state.orderStatus, amountPen: state.amountPen,
    reconciliationRequired: state.reconciliationRequired}
  // Default/legacy/unconfirmed paths never touch the proposed snapshot RPC.
  if (!includeProductReceipt || !v4.test(reference.checkoutSessionId)
    || typeof row.packSlug !== 'string' || !row.packSlug.startsWith('guided-v1:')
    || state.paymentStatus !== 'paid' || state.reconciliationRequired !== false
    || !['payment_confirmed','in_production','ready_for_delivery','delivered'].includes(state.orderStatus)) return response
  if (row.currency !== 'PEN' || row.storedAmount !== row.amountMinor) return invalid()
  const productReceipt = await readGuidedPaidOrderReceipt({rpc: (name, args) =>
    bounded(signal => db.rpc(name, args).abortSignal(signal))}, {
    orderId: row.id, orderCode: row.orderCode, amountMinor: row.amountMinor,
    paymentStatus: state.paymentStatus, orderStatus: state.orderStatus, reconciliationRequired: state.reconciliationRequired,
  })
  // Detect revocation/refund/reconciliation or changed identity/money while the
  // detail was read. This is NOT a transaction/lock or dispatch authorization.
  const latestRow = await boundOrder()
  if (latestRow.id !== row.id || latestRow.packSlug !== row.packSlug || latestRow.currency !== row.currency
    || latestRow.storedAmount !== row.storedAmount || latestRow.amountMinor !== row.amountMinor) return invalid()
  const latest = await observe(latestRow)
  if (latest.paymentStatus !== state.paymentStatus || latest.orderStatus !== state.orderStatus
    || latest.reconciliationRequired !== state.reconciliationRequired) return invalid()
  return {...response, productReceipt}
}
