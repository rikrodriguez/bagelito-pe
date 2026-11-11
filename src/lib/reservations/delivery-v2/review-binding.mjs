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
  if (!validDraft(draft) || !validCandidate(candidate) ||
      !Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > Number.MAX_SAFE_INTEGER - TTL_MS) {
    throw new TypeError('Server-owned valid draft, candidate and issue time required');
  }
  const payload = body({draftId:draft.draftId,draftRevision:draft.revision,
    cartSha256:draft.cartSha256,tier:candidate.tier,feeMinor:candidate.feeMinor,
    issuedAtMs:nowMs,expiresAtMs:nowMs+TTL_MS});
  return Object.freeze({...payload,signature:sign(payload,serverKey)});
}

/** True only for a matching, unexpired review envelope. NEVER a payment authorization. */
export function isDeliveryV2ReviewBindingCurrent({binding, draft, serverKey, nowMs = Date.now()}) {
  assertKey(serverKey);
  if (!validDraft(draft) || !binding || typeof binding !== 'object' ||
      Object.keys(binding).length !== KEYS.length ||
      KEYS.some(k=>!Object.hasOwn(binding,k)) ||
      !Number.isSafeInteger(nowMs) || nowMs < 0 ||
      !Number.isSafeInteger(binding.issuedAtMs) ||
      !Number.isSafeInteger(binding.expiresAtMs) ||
      binding.issuedAtMs < 0 || binding.issuedAtMs > nowMs ||
      binding.expiresAtMs !== binding.issuedAtMs + TTL_MS ||
      nowMs >= binding.expiresAtMs ||
      binding.draftId !== draft.draftId ||
      binding.draftRevision !== draft.revision ||
      binding.cartSha256 !== draft.cartSha256 ||
      binding.schema !== SCHEMA || binding.tariffVersion !== TARIFF ||
      binding.payable !== false || binding.status !== 'review_only' ||
      !Object.hasOwn(TIERS,binding.tier) || TIERS[binding.tier] !== binding.feeMinor ||
      typeof binding.signature !== 'string' || !/^[0-9a-f]{64}$/.test(binding.signature)) {
    return false;
  }
  const expected = Buffer.from(sign(body(binding),serverKey),'hex');
  const provided = Buffer.from(binding.signature,'hex');
  return timingSafeEqual(expected,provided);
}
