/**
 * INTERNAL, REVIEW-ONLY Delivery V2 candidate binding.
 * Binds a nonpayable tariff candidate to the exact server-owned draft revision
 * and cart digest. HMAC proves integrity of this envelope, NOT that a delivery
 * address, stock, provider, or payment was verified.
 *
 * Never import into the browser, expose the serverKey or treat a valid binding
 * as permission to bypass delivery-v2-hard-stop.ts.
 */
import {createHmac, timingSafeEqual} from 'node:crypto';

const SCHEMA = 'bagelito.delivery-review-binding.v1';
const TARIFF = 'bagelito.delivery-tiers.2026-11-06.v2';
const TTL_MS = 15 * 60 * 1000;
const TIERS = Object.freeze({adjacent:800, regular:1000, distant:1500, very_distant:2000});
const KEYS = Object.freeze(['schema','draftId','draftRevision','cartSha256','tariffVersion',
  'tier','feeMinor','status','payable','issuedAtMs','expiresAtMs','signature']);

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length < 32) {
    throw new TypeError('32-byte-or-longer server-only HMAC key required');
  }
}
function validDraft(draft) {
  return draft && typeof draft === 'object' &&
    typeof draft.draftId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(draft.draftId) &&
    Number.isSafeInteger(draft.revision) && draft.revision > 0 &&
    typeof draft.cartSha256 === 'string' && /^[0-9a-f]{64}$/.test(draft.cartSha256);
}
function validCandidate(candidate) {
  return candidate && typeof candidate === 'object' &&
    candidate.payable === false && candidate.status === 'candidate_only' &&
    candidate.tariffVersion === TARIFF &&
    Object.hasOwn(TIERS, candidate.tier) &&
    candidate.feeMinor === TIERS[candidate.tier];
}
// Snapshot each input field ONCE before validation and HMAC signing/comparison.
// A mutable provider object or accessor must not change revision or fee mid-check.
function snapshotDraft(draft) {
  if (!draft || typeof draft !== 'object') return null;
  return {draftId:draft.draftId, revision:draft.revision, cartSha256:draft.cartSha256};
}
function snapshotCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {payable:candidate.payable, status:candidate.status,
    tariffVersion:candidate.tariffVersion, tier:candidate.tier, feeMinor:candidate.feeMinor};
}
function snapshotBinding(binding) {
  if (!binding || typeof binding !== 'object' ||
      Object.keys(binding).length !== KEYS.length ||
      KEYS.some(k => !Object.hasOwn(binding,k))) return null;
  return Object.fromEntries(KEYS.map(k => [k,binding[k]]));
}
function body(fields) {
  return {
    schema:SCHEMA, draftId:fields.draftId, draftRevision:fields.draftRevision,
    cartSha256:fields.cartSha256, tariffVersion:TARIFF, tier:fields.tier,
    feeMinor:fields.feeMinor, status:'review_only', payable:false,
    issuedAtMs:fields.issuedAtMs, expiresAtMs:fields.expiresAtMs,
  };
}
function sign(payload, serverKey) {
  return createHmac('sha256',serverKey).update(JSON.stringify(payload)).digest('hex');
}

export function createDeliveryV2ReviewBinding({draft, candidate, serverKey, nowMs = Date.now()}) {
  assertKey(serverKey);
  const verifiedDraft = snapshotDraft(draft);
  const verifiedCandidate = snapshotCandidate(candidate);
  if (!validDraft(verifiedDraft) || !validCandidate(verifiedCandidate) ||
      !Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > Number.MAX_SAFE_INTEGER - TTL_MS) {
    throw new TypeError('Server-owned valid draft, candidate and issue time required');
  }
  const payload = body({draftId:verifiedDraft.draftId,draftRevision:verifiedDraft.revision,
    cartSha256:verifiedDraft.cartSha256,tier:verifiedCandidate.tier,feeMinor:verifiedCandidate.feeMinor,
    issuedAtMs:nowMs,expiresAtMs:nowMs+TTL_MS});
  return Object.freeze({...payload,signature:sign(payload,serverKey)});
}

/** True only for a matching, unexpired review envelope. NEVER a payment authorization. */
export function isDeliveryV2ReviewBindingCurrent({binding, draft, serverKey, nowMs = Date.now()}) {
  assertKey(serverKey);
  const verifiedDraft = snapshotDraft(draft);
  const verifiedBinding = snapshotBinding(binding);
  if (!validDraft(verifiedDraft) || !verifiedBinding ||
      !Number.isSafeInteger(nowMs) || nowMs < 0 ||
      !Number.isSafeInteger(verifiedBinding.issuedAtMs) ||
      !Number.isSafeInteger(verifiedBinding.expiresAtMs) ||
      verifiedBinding.issuedAtMs < 0 || verifiedBinding.issuedAtMs > nowMs ||
      verifiedBinding.expiresAtMs !== verifiedBinding.issuedAtMs + TTL_MS ||
      nowMs >= verifiedBinding.expiresAtMs ||
      verifiedBinding.draftId !== verifiedDraft.draftId ||
      verifiedBinding.draftRevision !== verifiedDraft.revision ||
      verifiedBinding.cartSha256 !== verifiedDraft.cartSha256 ||
      verifiedBinding.schema !== SCHEMA || verifiedBinding.tariffVersion !== TARIFF ||
      verifiedBinding.payable !== false || verifiedBinding.status !== 'review_only' ||
      !Object.hasOwn(TIERS,verifiedBinding.tier) || TIERS[verifiedBinding.tier] !== verifiedBinding.feeMinor ||
      typeof verifiedBinding.signature !== 'string' || !/^[0-9a-f]{64}$/.test(verifiedBinding.signature)) {
    return false;
  }
  const expected = Buffer.from(sign(body(verifiedBinding),serverKey),'hex');
  const provided = Buffer.from(verifiedBinding.signature,'hex');
  return timingSafeEqual(expected,provided);
}
