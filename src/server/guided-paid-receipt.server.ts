/** Injected server bridge; only the separately gated status service may disclose
 * its minimized result after capability checks. No DB default/credentials/provider. */
import { readGuidedProductReservation } from './guided-product-reservation.server'
import { confirmPaidOrderReceipt } from '../domain/lib/paid-order-receipt'

type Reader = Parameters<typeof readGuidedProductReservation>[0]
export type PaidReceiptContext = {
  orderId: string; orderCode: string; amountMinor: number
  paymentStatus: unknown; orderStatus: unknown; reconciliationRequired: unknown
}

/** Caller must authenticate/authorize the order and supply trusted payment state.
 * Reads stored lines only; it cannot confirm a charge or authorize fulfillment.
 */
export async function readGuidedPaidOrderReceipt(db: Reader, context: PaidReceiptContext) {
  const status = {ok: true, orderCode: context.orderCode, amountPen: context.amountMinor / 100,
    paymentStatus: context.paymentStatus, orderStatus: context.orderStatus, reconciliationRequired: context.reconciliationRequired}
  const expected = {orderCode: context.orderCode, amountMinor: context.amountMinor}
  confirmPaidOrderReceipt(status, expected) // Invalid payment observations cannot query products.
  const snapshot = await readGuidedProductReservation(db, context.orderId)
  if (!snapshot) throw new Error('No se pudo verificar el detalle del pedido. No se autoriza su preparación.')
  return confirmPaidOrderReceipt({...status, productSnapshot: snapshot}, expected)
}
