/** Server-observed payment detail. Never infer products from an editable cart. */
import { buildGuidedPackingPreview } from './guided-product-snapshot'

export type PaidOrderReceipt = {
  orderCode: string; amountMinor: number; currency: 'PEN'; paymentStatus: 'paid'
  detailsAvailable: boolean; subtotalMinor: number | null; deliveryFeeMinor: number | null
  items: Array<{kind: 'bagel' | 'schmear'; flavorId: string; name: string; quantity: number; grams?: number}>
  fulfillmentAuthorized: false; isFiscalReceipt: false
}
export type PaidOrderReference = {orderCode: string; amountMinor?: number}
const code = /^BAG-[A-Z0-9_-]{1,80}$/
const minor = (value: unknown): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
const invalid = (): never => {throw new Error('No se pudo verificar el detalle del pago. No vuelvas a pagar hasta revisar el pedido.')}

/** Bind every status response, including failed/expired, before deleting recovery. */
export function parsePaymentStatusObservation(value: unknown, expected: PaidOrderReference) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !code.test(expected.orderCode)
    || (expected.amountMinor !== undefined && !minor(expected.amountMinor))) return invalid()
  const result = value as Record<string, unknown>
  const amount = typeof result.amountPen === 'number' ? result.amountPen * 100 : NaN
  if (result.ok !== true || result.orderCode !== expected.orderCode || typeof result.paymentStatus !== 'string'
    || !['pending','paid','failed','expired','refunded'].includes(result.paymentStatus)
    || typeof result.reconciliationRequired !== 'boolean' || typeof result.orderStatus !== 'string'
    || !['payment_pending_review','payment_confirmed','needs_correction','in_production','ready_for_delivery','delivered','cancelled'].includes(result.orderStatus)
    || !minor(amount) || (expected.amountMinor !== undefined && amount !== expected.amountMinor)
    || (result.currency !== undefined && result.currency !== 'PEN')) return invalid()
  return {ok: true, orderCode: expected.orderCode, amountPen: amount / 100, amountMinor: amount,
    paymentStatus: result.paymentStatus, orderStatus: result.orderStatus,
    reconciliationRequired: result.reconciliationRequired, productSnapshot: result.productSnapshot}
}

/** Input is a response from the guarded status service, not browser payment SDK data. */
export function confirmPaidOrderReceipt(value: unknown, expected: PaidOrderReference): PaidOrderReceipt {
  const result = parsePaymentStatusObservation(value, expected)
  const amount = result.amountMinor
  if (result.paymentStatus !== 'paid' || result.reconciliationRequired !== false
    || !['payment_confirmed','in_production','ready_for_delivery','delivered'].includes(result.orderStatus)) return invalid()
  const receipt: PaidOrderReceipt = {orderCode: expected.orderCode, amountMinor: amount, currency: 'PEN', paymentStatus: 'paid',
    detailsAvailable: false, subtotalMinor: null, deliveryFeeMinor: null, items: [],
    fulfillmentAuthorized: false, isFiscalReceipt: false}
  // Legacy status has no product snapshot. Absence must remain visible, never
  // reconstructed from the current cart or a guessed pack/pot/default size.
  if (result.productSnapshot === undefined || result.productSnapshot === null) return receipt
  try {
    const preview = buildGuidedPackingPreview(result.productSnapshot)
    if (preview.paymentStatus !== 'paid' || preview.orderCode !== expected.orderCode || preview.amountMinor !== amount) return invalid()
    return {...receipt, detailsAvailable: true, subtotalMinor: preview.subtotalMinor, deliveryFeeMinor: preview.deliveryFeeMinor,
      items: [...preview.packing.bagels.map(item => ({...item, kind: 'bagel' as const})),
        ...preview.packing.schmears.map(item => ({...item, kind: 'schmear' as const}))]}
  } catch {return invalid()}
}
