import { planGuidedOrder, hasPersistableGuidedProducts, type GuidedQuoteRequest, type GuidedOrderLine } from '../domain/lib/guided-order-quote'
import { getBatchReadOnly } from './batch.server'

export type { GuidedQuoteRequest } from '../domain/lib/guided-order-quote'
export type GuidedQuoteResponse = {
  status: 'ready' | 'review_required' | 'invalid' | 'unavailable'
  checkoutAllowed: boolean
  amountPen: number | null
  reasons: string[]
  batchAccepting: boolean
  lines: GuidedOrderLine[]
  priceSourceDate: string
}

export async function quoteGuidedOrder(input: GuidedQuoteRequest, completeProductLane = false): Promise<GuidedQuoteResponse> {
  const canonical = planGuidedOrder(input)
  const {legacyPack: _legacyPack, bagelUnits, ...plan} = canonical
  if (plan.status === 'invalid') return {...plan, batchAccepting: false}
  // The route derives this capability from the private sandbox request gate,
  // never from JSON. SQL still rechecks price/capacity/policy before reserving.
  if (completeProductLane && hasPersistableGuidedProducts(canonical)) {
    plan.status = 'ready'; plan.checkoutAllowed = true; plan.reasons = []
  }
  // Actual selected bagels: a standalone pot is not a fictional six-bagel pack.
  // This is a read-only projection, not schmear-stock or transactional approval.
  const batch = await getBatchReadOnly(bagelUnits)
  if (batch.status !== 200 || !batch.batch.accepting) {
    return {...plan, status: 'unavailable', checkoutAllowed: false, amountPen: null,
      reasons: ['El batch actual no tiene capacidad para este pedido.'], batchAccepting: false}
  }
  if (!batch.batch.deliveryDate || !Number.isFinite(Date.parse(batch.batch.deliveryDate))) {
    return {...plan, status: 'unavailable', checkoutAllowed: false, amountPen: null,
      reasons: ['El batch está visible, pero todavía no tiene una fecha de delivery confirmada para cobrar pedidos.'], batchAccepting: true}
  }
  return {...plan, batchAccepting: true}
}
