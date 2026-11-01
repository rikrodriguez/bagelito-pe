import { randomUUID } from 'node:crypto'

/** Local/test loyalty core. No route, payment client, identity provider or GHL integration. */
export type OrderFact = Readonly<{
  orderId: string
  subjectId: string | null
  paymentState: string
  verifiedSource: string | null
  verificationId: string | null
  requiresReview: boolean
}>
export type Credit = Readonly<{
  orderId: string; subjectId: string; verificationId: string; creditedAt: string
}>
export type Entitlement = Readonly<{
  id: string; subjectId: string; cycle: number; ruleId: string
  bagels: number; schmears: number; earnedAt: string
}>
export type Redemption = Readonly<{
  id: string; subjectId: string; entitlementId: string; requestId: string; redeemedAt: string
}>
export type Progress = Readonly<{
  subjectId: string; creditedOrders: number; ordersInCurrentCycle: number; ordersUntilNextReward: number
  earnedRewards: number; unredeemedRewards: number; requiresReview: boolean
  entitlements: ReadonlyArray<Entitlement & { redemption: Redemption | null }>
}>
type Awaitable<T> = T | Promise<T>
/** All methods must operate on one authoritative transaction. Context is never parsed by the core. */
export interface LoyaltyTransaction {
  authenticatedSubject(context: unknown): Awaitable<string | null>
  getOrder(orderId: string): Awaitable<OrderFact | null>
  getCredit(orderId: string): Awaitable<Credit | null>
  listCredits(subjectId: string): Awaitable<Credit[]>
  insertCredit(credit: Credit): Awaitable<void>
  listEntitlements(subjectId: string): Awaitable<Entitlement[]>
  insertEntitlement(entitlement: Entitlement): Awaitable<void>
  listRedemptions(subjectId: string): Awaitable<Redemption[]>
  getRedemptionByRequest(subjectId: string, requestId: string): Awaitable<Redemption | null>
  insertRedemption(redemption: Redemption): Awaitable<void>
}
export interface LoyaltyStore {
  transaction<T>(work: (transaction: LoyaltyTransaction) => Promise<T>): Promise<T>
}
export class LoyaltyError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'LoyaltyError' }
}
export const LOYALTY_RULE = Object.freeze({ id: 'paid-orders-10-v1', orders: 10, bagels: 2, schmears: 1 })
function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200
}
function requireId(value: unknown): asserts value is string {
  if (!validId(value)) throw new LoyaltyError('invalid_input')
}
function verifiedPaid(order: OrderFact): boolean {
  return order.paymentState === 'paid' && order.verifiedSource === 'backend-confirmed'
    && validId(order.verificationId) && order.requiresReview === false
}
async function subjectFor(tx: LoyaltyTransaction, context: unknown): Promise<string> {
  const subject = await tx.authenticatedSubject(context)
  if (!validId(subject)) throw new LoyaltyError('unauthenticated')
  return subject
}

/** Read immutable ledger and recheck its authoritative evidence inside the same transaction.
 * Changed/unknown evidence holds new actions for review; it does not decide refund policy.
 */
async function stateFor(tx: LoyaltyTransaction, subjectId: string) {
  const credits = await tx.listCredits(subjectId)
  const entitlements = await tx.listEntitlements(subjectId)
  const redemptions = await tx.listRedemptions(subjectId)
  const integrity = () => { throw new LoyaltyError('ledger_integrity_error') }
  const orderIds = new Set<string>()
  let requiresReview = false
  for (const credit of credits) {
    if (credit.subjectId !== subjectId || !validId(credit.orderId) || !validId(credit.verificationId)
      || orderIds.has(credit.orderId)) integrity()
    orderIds.add(credit.orderId)
    const order = await tx.getOrder(credit.orderId)
    if (!order || order.orderId !== credit.orderId || order.subjectId !== subjectId || !verifiedPaid(order)) {
      requiresReview = true
    }
  }
  const expectedRewards = Math.floor(credits.length / LOYALTY_RULE.orders)
  if (entitlements.length !== expectedRewards) integrity()
  const cycles = new Set<number>(), entitlementIds = new Set<string>()
  for (const reward of entitlements) {
    if (reward.subjectId !== subjectId || reward.ruleId !== LOYALTY_RULE.id || !validId(reward.id)
      || !Number.isInteger(reward.cycle) || reward.cycle < 1 || reward.cycle > expectedRewards
      || reward.bagels !== LOYALTY_RULE.bagels || reward.schmears !== LOYALTY_RULE.schmears
      || cycles.has(reward.cycle) || entitlementIds.has(reward.id)) integrity()
    cycles.add(reward.cycle)
    entitlementIds.add(reward.id)
  }
  const consumed = new Set<string>(), requests = new Set<string>()
  for (const redemption of redemptions) {
    if (redemption.subjectId !== subjectId || !validId(redemption.id) || !validId(redemption.requestId)
      || !entitlementIds.has(redemption.entitlementId) || consumed.has(redemption.entitlementId)
      || requests.has(redemption.requestId)) integrity()
    consumed.add(redemption.entitlementId)
    requests.add(redemption.requestId)
  }
  return {credits, entitlements: entitlements.sort((a, b) => a.cycle - b.cycle), redemptions, requiresReview}
}

/** Internal backend API only: no public route or production store is installed.
 * The adapter must atomically serialize canonical order reads and all loyalty writes.
 * It must authenticate context itself; no browser-provided subject or payment flag is trusted.
 */
export function createLoyaltyService(store: LoyaltyStore) {
  return {
    async creditPaidOrder(orderId: string) {
      requireId(orderId)
      return store.transaction(async tx => {
        const order = await tx.getOrder(orderId)
        if (!order || order.orderId !== orderId) throw new LoyaltyError('order_unavailable')
        if (!verifiedPaid(order)) throw new LoyaltyError('order_not_verified_paid')
        if (!validId(order.subjectId)) throw new LoyaltyError('order_identity_unresolved')
        const subjectId = order.subjectId
        const existing = await tx.getCredit(orderId)
        if (existing && existing.subjectId !== subjectId) throw new LoyaltyError('review_required')
        const state = await stateFor(tx, subjectId)
        if (state.requiresReview) throw new LoyaltyError('review_required')
        if (existing) return {status: 'already_credited' as const, orderId, subjectId, entitlement: null}
        const now = new Date().toISOString()
        await tx.insertCredit({orderId, subjectId, verificationId: order.verificationId!, creditedAt: now})
        const count = state.credits.length + 1
        let entitlement: Entitlement | null = null
        if (count % LOYALTY_RULE.orders === 0) {
          entitlement = {
            id: randomUUID(), subjectId, cycle: count / LOYALTY_RULE.orders,
            ruleId: LOYALTY_RULE.id, bagels: LOYALTY_RULE.bagels, schmears: LOYALTY_RULE.schmears,
            earnedAt: now,
          }
          await tx.insertEntitlement(entitlement)
        }
        return {status: 'credited' as const, orderId, subjectId, entitlement}
      })
    },
    async getProgress(context: unknown): Promise<Progress> {
      return store.transaction(async tx => {
        const subjectId = await subjectFor(tx, context)
        const state = await stateFor(tx, subjectId)
        const inCycle = state.credits.length % LOYALTY_RULE.orders
        return {
          subjectId, creditedOrders: state.credits.length, ordersInCurrentCycle: inCycle,
          ordersUntilNextReward: LOYALTY_RULE.orders - inCycle,
          earnedRewards: state.entitlements.length,
          unredeemedRewards: state.entitlements.length - state.redemptions.length,
          requiresReview: state.requiresReview,
          entitlements: state.entitlements.map(reward => ({
            ...reward, redemption: state.redemptions.find(item => item.entitlementId === reward.id) ?? null,
          })),
        }
      })
    },
    async redeem(context: unknown, input: {entitlementId: string; requestId: string}) {
      if (!input || typeof input !== 'object') throw new LoyaltyError('invalid_input')
      const {entitlementId, requestId} = input
      requireId(entitlementId)
      requireId(requestId)
      return store.transaction(async tx => {
        const subjectId = await subjectFor(tx, context)
        const state = await stateFor(tx, subjectId)
        const previous = await tx.getRedemptionByRequest(subjectId, requestId)
        if (previous) {
          if (previous.entitlementId !== entitlementId) throw new LoyaltyError('idempotency_conflict')
          // A committed result remains replayable during review, without another write.
          return {status: 'already_redeemed' as const, redemption: previous}
        }
        const reward = state.entitlements.find(item => item.id === entitlementId)
        if (!reward) throw new LoyaltyError('reward_unavailable')
        if (state.redemptions.some(item => item.entitlementId === reward.id)) {
          throw new LoyaltyError('reward_already_redeemed')
        }
        if (state.requiresReview) throw new LoyaltyError('review_required')
        const redemption: Redemption = {
          id: randomUUID(), subjectId, entitlementId: reward.id, requestId: requestId,
          redeemedAt: new Date().toISOString(),
        }
        await tx.insertRedemption(redemption)
        return {status: 'redeemed' as const, redemption}
      })
    },
  }
}
