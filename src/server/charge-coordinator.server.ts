import type { CulqiChargeResult } from './culqi.server'
import { validateCulqiChargeResult } from './culqi-charge-evidence.server'

type RpcDb = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>
}

type Claim = { claimed?: boolean; state?: string; attempt_id?: string }

export async function coordinateCulqiCharge(input: {
  db: RpcDb
  orderId: string
  orderCode: string
  checkoutSessionId: string
  amountMinor: number
  mode: 'test' | 'live'
  sourceId: string
  deviceId: string
  has3DS: boolean
  createCharge: () => Promise<CulqiChargeResult>
  fetchCharge: (chargeId: string) => Promise<unknown>
}) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0
    || !new RegExp('^(?:tkn|ype)_' + input.mode + '_[A-Za-z0-9_-]{8,100}$').test(input.sourceId)) {
    throw new Error('Invalid charge confirmation context.')
  }

  const claimResult = await input.db.rpc('claim_culqi_charge', {
    p_order_id: input.orderId,
    p_source_id: input.sourceId,
    p_device_id: input.deviceId,
    p_has_3ds: input.has3DS,
  })
  if (claimResult.error) throw new Error(claimResult.error.message)
  const claim = claimResult.data as Claim | null

  if (!claim?.claimed || !claim.attempt_id) {
    if (claim?.state === 'paid') return { ok: true, orderCode: input.orderCode, paymentStatus: 'paid' }
    if (claim?.state === 'submitted' || claim?.state === 'submitting') {
      return { ok: true, orderCode: input.orderCode, paymentStatus: 'awaiting_webhook' }
    }
    return {
      ok: false,
      orderCode: input.orderCode,
      paymentStatus: 'reconciliation_required',
      error: 'This payment cannot be retried automatically.',
    }
  }

  const finish = (state: string, chargeId: string | null, payload: unknown) =>
    input.db.rpc('finish_culqi_charge', {
      p_order_id: input.orderId,
      p_attempt_id: claim.attempt_id,
      p_state: state,
      p_charge_id: chargeId,
      p_method: input.sourceId.startsWith('ype_') ? 'yape' : 'card',
      p_payload: payload,
    })

  let knownChargeId: string | null = null
  const review = () => ({
    ok: false,
    orderCode: input.orderCode,
    paymentStatus: 'reconciliation_required',
    error: 'We could not confirm the payment result. Do not pay again yet.',
  })

  try {
    const result = await input.createCharge()
    if (result.requires3DS) {
      const stored = await finish('requires_3ds', null, { stage: 'requires_3ds', action_code: 'REVIEW' })
      if (stored.error) throw new Error(stored.error.message)
      return { ok: true, orderCode: input.orderCode, paymentStatus: 'requires_3ds', requires3DS: true }
    }

    if (typeof result.charge.id === 'string'
      && new RegExp('^chr_' + input.mode + '_[A-Za-z0-9_-]{8,100}$').test(result.charge.id)) {
      knownChargeId = result.charge.id
    }
    if (!knownChargeId) throw new Error('Unbound charge identity.')

    const expected = {
      chargeId: knownChargeId,
      sourceId: input.sourceId,
      orderCode: input.orderCode,
      amountMinor: input.amountMinor,
      currencyCode: 'PEN' as const,
      mode: input.mode,
    }
    let observation = validateCulqiChargeResult(result.charge, expected)
    let provenance = 'culqi_charge_post'
    let observedAt = new Date().toISOString()

    if (!observation.verified && observation.needsLookup) {
      const charge = await input.fetchCharge(knownChargeId)
      observation = validateCulqiChargeResult(charge, expected)
      provenance = 'culqi_charge_get'
      observedAt = new Date().toISOString()
    }

    if (!observation.verified) {
      await finish('uncertain', knownChargeId, { stage: 'reconciliation_required', reason: observation.reason })
      return review()
    }

    const stored = await finish('submitted', knownChargeId, { stage: 'submitted', provenance })
    if (stored.error) throw new Error(stored.error.message)

    const confirmed = await input.db.rpc('confirm_culqi_charge_result', {
      p_order_id: input.orderId,
      p_checkout_session_id: input.checkoutSessionId,
      p_charge_attempt_id: claim.attempt_id,
      p_observed_at: observedAt,
      p_provenance: provenance,
      p_mode: input.mode,
      p_observation: observation.evidence,
    })
    if (confirmed.error) throw new Error(confirmed.error.message)

    const state = confirmed.data as { paymentState?: unknown; orderState?: unknown; requiresReview?: unknown } | null
    if (state?.paymentState === 'paid' && state.requiresReview === false
      && ['payment_confirmed', 'in_production', 'ready_for_delivery', 'delivered'].includes(String(state.orderState))) {
      return { ok: true, orderCode: input.orderCode, paymentStatus: 'paid' }
    }
    return review()
  } catch {
    try { await finish('uncertain', knownChargeId, { stage: 'reconciliation_required' }) } catch {}
    return review()
  }
}
