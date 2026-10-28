export type CulqiChargeResultBinding = Readonly<{
  chargeId: string
  sourceId: string
  orderCode: string
  amountMinor: number
  currencyCode: 'PEN'
  mode: 'test' | 'live'
}>

export type CulqiNormalizedChargeEvidence = Readonly<{
  chargeId: string
  sourceId: string
  amountMinor: number
  currencyCode: 'PEN'
  capture: true
  currentAmountMinor: number
  amountRefundedMinor: 0
  dispute: false
  captureDatePresent: boolean
}>

export type CulqiChargeEvidenceResult =
  | Readonly<{ verified: false; reason: string; needsLookup: boolean }>
  | Readonly<{ verified: true; reason: 'captured'; needsLookup: false; evidence: CulqiNormalizedChargeEvidence }>

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function field(value: Record<string, unknown>, name: string) {
  const descriptor = Object.getOwnPropertyDescriptor(value, name)
  if (!descriptor) return { present: false, value: undefined as unknown }
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new Error('Unusable charge evidence.')
  return { present: true, value: descriptor.value as unknown }
}

export function validateCulqiChargeResult(
  charge: unknown,
  expected: CulqiChargeResultBinding,
): CulqiChargeEvidenceResult {
  const reject = (reason: string, needsLookup = false): CulqiChargeEvidenceResult =>
    Object.freeze({ verified: false, reason, needsLookup })

  if (!Number.isSafeInteger(expected.amountMinor) || expected.amountMinor <= 0
    || !['test', 'live'].includes(expected.mode)
    || !new RegExp('^chr_' + expected.mode + '_[A-Za-z0-9_-]{8,100}$').test(expected.chargeId)
    || !new RegExp('^(?:tkn|ype)_' + expected.mode + '_[A-Za-z0-9_-]{8,100}$').test(expected.sourceId)
    || !/^BAG-[A-Z0-9_-]{1,80}$/.test(expected.orderCode)
    || expected.currencyCode !== 'PEN') return reject('invalid_binding')

  try {
    if (!record(charge)) return reject('malformed_charge')
    let missing = false
    const object = field(charge, 'object')
    if (!object.present) missing = true
    else if (object.value !== 'charge') return reject('identity_mismatch')

    const id = field(charge, 'id')
    if (!id.present) missing = true
    else if (id.value !== expected.chargeId) return reject('identity_mismatch')

    const amount = field(charge, 'amount')
    if (!amount.present) missing = true
    else if (!Number.isSafeInteger(amount.value) || amount.value !== expected.amountMinor) return reject('amount_mismatch')

    const currencyCode = field(charge, 'currency_code')
    const currency = field(charge, 'currency')
    if (!currencyCode.present && !currency.present) missing = true
    if ((currencyCode.present && currencyCode.value !== 'PEN')
      || (currency.present && currency.value !== 'PEN')) return reject('currency_mismatch')

    const metadata = field(charge, 'metadata')
    if (!metadata.present) missing = true
    else if (!record(metadata.value) || field(metadata.value, 'bagelito_order_code').value !== expected.orderCode) {
      return reject('order_mismatch')
    }

    const source = field(charge, 'source')
    if (!source.present) missing = true
    else if (!record(source.value) || field(source.value, 'id').value !== expected.sourceId) {
      return reject('source_mismatch')
    }

    const capture = field(charge, 'capture')
    if (!capture.present) missing = true
    else if (capture.value !== true) return reject('capture_not_confirmed')

    const currentAmount = field(charge, 'current_amount')
    if (!currentAmount.present) missing = true
    else if (!Number.isSafeInteger(currentAmount.value) || currentAmount.value !== expected.amountMinor) {
      return reject('current_amount_mismatch')
    }

    const refunded = field(charge, 'amount_refunded')
    if (!refunded.present) missing = true
    else if (!Number.isSafeInteger(refunded.value) || refunded.value !== 0) return reject('refund_observed')

    const dispute = field(charge, 'dispute')
    if (!dispute.present) missing = true
    else if (dispute.value !== false) return reject('dispute_observed')

    const actionCode = field(charge, 'action_code')
    if (actionCode.value === 'REVIEW') return reject('authentication_required')
    if (missing) return reject('evidence_incomplete', true)

    const captureDate = field(charge, 'capture_date')
    return Object.freeze({
      verified: true,
      reason: 'captured',
      needsLookup: false,
      evidence: Object.freeze({
        chargeId: expected.chargeId,
        sourceId: expected.sourceId,
        amountMinor: expected.amountMinor,
        currencyCode: 'PEN',
        capture: true,
        currentAmountMinor: expected.amountMinor,
        amountRefundedMinor: 0,
        dispute: false,
        captureDatePresent: captureDate.present && captureDate.value != null,
      }),
    })
  } catch {
    return reject('malformed_charge')
  }
}
