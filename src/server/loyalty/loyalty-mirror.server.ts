import { createHash, randomUUID } from 'node:crypto'
import { LOYALTY_RULE, type Progress } from './loyalty.server'

/** Internal local/test protocol, not GHL API fields. No production adapter or consumer. */
export type MirrorSummary = Readonly<Pick<Progress, 'creditedOrders' | 'ordersInCurrentCycle' | 'ordersUntilNextReward' | 'earnedRewards' | 'unredeemedRewards' | 'requiresReview'> & {
  rule: Readonly<{id: string; orders: number; bagels: number; schmears: number}>
}>
export type MirrorEnvelope = Readonly<{
  schema: 1; messageId: string; subjectId: string; destinationRef: string
  revision: number; payloadHash: string; summary: MirrorSummary
}>
export type MirrorProjection = Readonly<{
  envelope: MirrorEnvelope; pending: boolean; attempts: number; lastError: string | null
}>
export type MirrorReceipt = Readonly<{
  messageId: string; subjectId: string; destinationRef: string; revision: number; payloadHash: string
  status: 'applied' | 'duplicate' | 'stale'
}>
type Awaitable<T> = T | Promise<T>
export interface MirrorTransaction {
  /** Trusted read of the actual core under this same transaction, not a browser/GHL payload. */
  readProgress(subjectId: string): Awaitable<Progress | null>
  getBinding(subjectId: string): Awaitable<string | null>
  getProjection(subjectId: string): Awaitable<MirrorProjection | null>
  saveProjection(envelope: MirrorEnvelope): Awaitable<void>
  attempt(envelope: MirrorEnvelope): Awaitable<boolean>
  acknowledge(envelope: MirrorEnvelope): Awaitable<boolean>
  fail(envelope: MirrorEnvelope, code: string): Awaitable<void>
  listSubjects(): Awaitable<string[]>
}
export interface MirrorStore {
  /** Serialize source reads, revisions and pending writes. Separate from credit/redemption. */
  transaction<T>(work: (tx: MirrorTransaction) => Promise<T>): Promise<T>
}
export interface MirrorTransport {
  /** Must reject old revisions at the destination; real GHL capability is NOT verified. */
  send(envelope: MirrorEnvelope): Promise<MirrorReceipt>
}
export class MirrorError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'MirrorError' }
}
function requireId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new MirrorError('invalid_input')
}
function summaryOf(progress: Omit<MirrorSummary, 'rule'>): MirrorSummary {
  const fields = ['creditedOrders', 'ordersInCurrentCycle', 'ordersUntilNextReward', 'earnedRewards', 'unredeemedRewards'] as const
  if (!progress || fields.some(key => !Number.isSafeInteger(progress[key]) || progress[key] < 0)
    || typeof progress.requiresReview !== 'boolean') throw new MirrorError('invalid_source_summary')
  // Whitelist: no order, entitlement, customer contact, token or payment evidence leaves the core.
  return Object.freeze({
    creditedOrders: progress.creditedOrders, ordersInCurrentCycle: progress.ordersInCurrentCycle,
    ordersUntilNextReward: progress.ordersUntilNextReward, earnedRewards: progress.earnedRewards,
    unredeemedRewards: progress.unredeemedRewards, requiresReview: progress.requiresReview,
    rule: LOYALTY_RULE,
  })
}
function fingerprint(summary: MirrorSummary): string {
  return createHash('sha256').update(JSON.stringify(summary)).digest('hex')
}
function checkedEnvelope(value: MirrorEnvelope, subjectId: string, destinationRef: string): MirrorEnvelope {
  if (value.subjectId !== subjectId || value.destinationRef !== destinationRef) throw new MirrorError('binding_changed')
  requireId(value.messageId)
  const summary = summaryOf(value.summary)
  if (value.schema !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1
    || fingerprint(summary) !== value.payloadHash || JSON.stringify(value.summary.rule) !== JSON.stringify(LOYALTY_RULE)) {
    throw new MirrorError('projection_integrity_error')
  }
  return Object.freeze({schema: 1, messageId: value.messageId, subjectId, destinationRef,
    revision: value.revision, payloadHash: value.payloadHash, summary})
}
function receiptMatches(receipt: MirrorReceipt | null, envelope: MirrorEnvelope): receipt is MirrorReceipt {
  return Boolean(receipt && receipt.messageId === envelope.messageId && receipt.subjectId === envelope.subjectId
    && receipt.destinationRef === envelope.destinationRef && receipt.revision === envelope.revision
    && receipt.payloadHash === envelope.payloadHash && ['applied', 'duplicate', 'stale'].includes(receipt.status))
}

/** Backend-only local coordinator. No timer, HTTP, GHL API or financial write method. */
export function createLoyaltyMirror(store: MirrorStore, transport: MirrorTransport) {
  async function capture(subjectId: string) {
    requireId(subjectId)
    return store.transaction(async tx => {
      const destinationRef = await tx.getBinding(subjectId)
      if (!destinationRef) throw new MirrorError('binding_unavailable')
      requireId(destinationRef)
      const progress = await tx.readProgress(subjectId)
      if (!progress || progress.subjectId !== subjectId) throw new MirrorError('source_subject_mismatch')
      const summary = summaryOf(progress)
      const payloadHash = fingerprint(summary)
      const previous = await tx.getProjection(subjectId)
      const old = previous ? checkedEnvelope(previous.envelope, subjectId, destinationRef) : null
      if (old?.payloadHash === payloadHash) return {status: 'unchanged' as const, envelope: old}
      const revision = (old?.revision ?? 0) + 1
      if (!Number.isSafeInteger(revision)) throw new MirrorError('revision_exhausted')
      const envelope: MirrorEnvelope = Object.freeze({schema: 1, messageId: randomUUID(), subjectId,
        destinationRef, revision, payloadHash, summary})
      await tx.saveProjection(envelope)
      return {status: 'captured' as const, envelope}
    })
  }
  async function deliver(subjectId: string) {
    requireId(subjectId)
    const envelope = await store.transaction(async tx => {
      const row = await tx.getProjection(subjectId)
      if (!row?.pending) return null
      const destinationRef = await tx.getBinding(subjectId)
      if (!destinationRef) throw new MirrorError('binding_unavailable')
      const snapshot = checkedEnvelope(row.envelope, subjectId, destinationRef)
      return await tx.attempt(snapshot) ? snapshot : null
    })
    if (!envelope) return {status: 'no_pending' as const}
    async function failed(code: string) {
      // CAS prevents an old failure from replacing a newer snapshot's metadata.
      await store.transaction(async tx => { await tx.fail(envelope!, code) })
      return {status: 'retry_pending' as const, code}
    }
    let receipt: MirrorReceipt
    try { receipt = await transport.send(envelope) } catch { return failed('transport_failed') }
    if (!receiptMatches(receipt, envelope)) return failed('invalid_receipt')
    // A remote higher revision is not proof that this local snapshot was applied.
    if (receipt.status === 'stale') return failed('destination_ahead')
    const acknowledged = await store.transaction(async tx => tx.acknowledge(envelope))
    return {status: acknowledged ? 'delivered' as const : 'superseded' as const}
  }
  async function reconcile() {
    const subjects = await store.transaction(async tx => tx.listSubjects())
    const results: Array<{subjectId: string; status: 'captured' | 'unchanged' | 'failed'; revision?: number; code?: string}> = []
    for (const subjectId of new Set(subjects)) {
      try {
        const result = await capture(subjectId)
        results.push({subjectId, status: result.status, revision: result.envelope.revision})
      } catch (error) {
        results.push({subjectId, status: 'failed', code: error instanceof MirrorError ? error.code : 'capture_failed'})
      }
    }
    return results
  }
  return {capture, deliver, reconcile}
}
