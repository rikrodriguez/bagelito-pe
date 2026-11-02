/** Server-observed payment detail. Never infer products from an editable cart. */
import { buildGuidedPackingPreview } from './guided-product-snapshot'
import menu from '../data/verified-menu-2026-10-21.json'

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
const regularIds = new Set(['everything','sesame','plain','classic-onion','cinnamon-raisin','blueberry'])
const potIds = new Set(['whipped-original','aji-amarillo','herb-roasted-garlic','honey-cinnamon','classic-strawberry'])
const labels = new Map([...menu.bagels, ...menu.schmears].map(item => [item.id, item.name]))
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function observedAmountMinor(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return NaN
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(String(value))
  return match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN
}

/** Minimal public projection: no DB ID, session, contact, terms or timestamp.
 * Reconstruct every allowed item; never trust response display names/extensions.
 * Historical totals are validated, not repriced using today's menu.
 */
function publicReceipt(value: unknown, expected: PaidOrderReference & {amountMinor: number}): PaidOrderReceipt {
  if (!record(value) || value.orderCode !== expected.orderCode || value.amountMinor !== expected.amountMinor
    || value.currency !== 'PEN' || value.paymentStatus !== 'paid' || value.detailsAvailable !== true
    || value.fulfillmentAuthorized !== false || value.isFiscalReceipt !== false
    || !minor(value.subtotalMinor) || typeof value.deliveryFeeMinor !== 'number'
    || !Number.isSafeInteger(value.deliveryFeeMinor) || value.deliveryFeeMinor < 0
    || value.subtotalMinor + value.deliveryFeeMinor !== expected.amountMinor
    || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 7) return invalid()
  const seen = new Set<string>()
  const items: PaidOrderReceipt['items'] = value.items.map((item: unknown) => {
    if (!record(item) || typeof item.flavorId !== 'string' || !minor(item.quantity)) return invalid()
    const key = `${item.kind}:${item.flavorId}`
    if (seen.has(key)) return invalid()
    seen.add(key)
    if (item.kind === 'bagel' && regularIds.has(item.flavorId) && item.quantity <= 12) {
      return {kind: 'bagel' as const, flavorId: item.flavorId, name: labels.get(item.flavorId)!, quantity: item.quantity}
    }
    if (item.kind === 'schmear' && potIds.has(item.flavorId) && item.quantity === 1
      && (item.grams === 120 || item.grams === 180 || item.grams === 240)) {
      return {kind: 'schmear' as const, flavorId: item.flavorId, name: labels.get(item.flavorId)!, quantity: 1, grams: item.grams}
    }
    return invalid()
  })
  const bagels = items.filter(item => item.kind === 'bagel'), pots = items.filter(item => item.kind === 'schmear')
  const units = bagels.reduce((n, item) => n + item.quantity, 0)
  if (bagels.length > 6 || pots.length > 1 || (units !== 0 && units !== 6 && units !== 12)
    || (!units && pots.length !== 1) || (units && pots.some(item => item.grams !== 120))) return invalid()
  return {orderCode: expected.orderCode, amountMinor: expected.amountMinor, currency: 'PEN', paymentStatus: 'paid',
    detailsAvailable: true, subtotalMinor: value.subtotalMinor, deliveryFeeMinor: value.deliveryFeeMinor, items,
    fulfillmentAuthorized: false, isFiscalReceipt: false}
}

/** Bind every status response, including failed/expired, before deleting recovery. */
export function parsePaymentStatusObservation(value: unknown, expected: PaidOrderReference) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !code.test(expected.orderCode)
    || (expected.amountMinor !== undefined && !minor(expected.amountMinor))) return invalid()
  const result = value as Record<string, unknown>
  const amount = observedAmountMinor(result.amountPen)
  if (result.ok !== true || result.orderCode !== expected.orderCode || typeof result.paymentStatus !== 'string'
    || !['pending','paid','failed','expired','refunded'].includes(result.paymentStatus)
    || typeof result.reconciliationRequired !== 'boolean' || typeof result.orderStatus !== 'string'
    || !['payment_pending_review','payment_confirmed','needs_correction','in_production','ready_for_delivery','delivered','cancelled'].includes(result.orderStatus)
    || !minor(amount) || (expected.amountMinor !== undefined && amount !== expected.amountMinor)
    || (result.currency !== undefined && result.currency !== 'PEN')) return invalid()
  return {ok: true, orderCode: expected.orderCode, amountPen: amount / 100, amountMinor: amount,
    paymentStatus: result.paymentStatus, orderStatus: result.orderStatus,
    reconciliationRequired: result.reconciliationRequired, productSnapshot: result.productSnapshot, productReceipt: result.productReceipt}
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
  if (result.productReceipt !== undefined) {
    // Ambiguous dual representations must not silently choose one.
    if (result.productSnapshot !== undefined && result.productSnapshot !== null) return invalid()
    return publicReceipt(result.productReceipt, {orderCode: expected.orderCode, amountMinor: amount})
  }
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
