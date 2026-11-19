/**
 * Offline / staging only: joins verified server-owned destination evidence to
 * the exact approved Delivery V2 candidate policy. NOT an API route, payment
 * quote, order reservation, inventory hold, or checkout authorization.
 *
 * The host must authenticate the source of both evidence callbacks, provide
 * the owner-approved policy from server storage, and keep this adapter behind
 * the unconditional reservation hard stop.
 */
import {createDeliveryV2EvidenceGate} from './destination-evidence-gate.mjs';
import {evaluateDeliveryV2Candidate} from './quote-candidate.mjs';

const failure = status => Object.freeze({
  ready:false, status, payable:false, quote:null,
});
const OUTPUT_KEYS = ['district','province','feeMinor','tier','status','payable','tariffVersion'];

export function createDeliveryV2ReviewOnlyAdapter({
  lookupVerifiedAddress, measureTrustedRoute, approvedPolicy, now,
} = {}) {
  if (!approvedPolicy || typeof approvedPolicy !== 'object' || Array.isArray(approvedPolicy)) {
    throw new TypeError('server-owned approved policy required');
  }
  const gate = createDeliveryV2EvidenceGate({lookupVerifiedAddress, measureTrustedRoute, now});
  return async function evaluateReviewOnlyDestination(request) {
    // Reject client-supplied district, distance, fee or even a spoofed quote.
    if (!request || typeof request !== 'object' || Array.isArray(request) ||
        Object.keys(request).length !== 1 || !Object.hasOwn(request, 'destinationId')) {
      throw new TypeError('only an opaque destinationId is permitted');
    }
    let evidence;
    try {
      evidence = await gate({destinationId:request.destinationId});
    } catch (error) {
      if (error instanceof TypeError && /opaque destinationId/.test(error.message)) throw error;
      // Never leak provider credentials, private addresses or API error bodies.
      return failure('evidence_unavailable');
    }
    if (!evidence.ready) return failure('verification_required');
    let quote;
    try {
      quote = evaluateDeliveryV2Candidate(evidence.destination, approvedPolicy);
    } catch {
      return failure('policy_review_required');
    }
    if (!quote || quote.payable !== false ||
        Object.keys(quote).length !== OUTPUT_KEYS.length ||
        !OUTPUT_KEYS.every(key => Object.hasOwn(quote,key))) {
      return failure('policy_review_required');
    }
    // A calculated candidate remains explicitly nonpayable. Unknown sectors,
    // non-Lima provinces and routes >40 km require manual review.
    const ready = quote.status === 'candidate_only' && Number.isSafeInteger(quote.feeMinor) && quote.feeMinor > 0;
    return Object.freeze({
      ready, status:ready ? 'review_candidate_only' : 'manual_review_required',
      payable:false, quote:Object.freeze({...quote, payable:false}),
    });
  };
}
