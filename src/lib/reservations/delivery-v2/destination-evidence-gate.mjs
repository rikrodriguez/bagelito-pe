/**
 * Bagelito Delivery V2: offline, review-only server evidence boundary.
 *
 * This does NOT geocode an address, measure a route, authenticate a provider,
 * reserve inventory or authorize checkout. Two trusted server-side callbacks
 * must independently resolve a persisted destination and its route; neither
 * callback nor this module may be exposed as a client-controlled quote API.
 * The resulting evidence may be passed to evaluateDeliveryV2Candidate ONLY
 * for a nonpayable, manual-review candidate. Never remove the reservation
 * hard stop on the strength of this result.
 */
const MAX_AGE_MS = 10 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const sha = /^[0-9a-f]{64}$/;
const fail = reason => Object.freeze({ready:false, reason, payable:false});
const exact = (obj, keys) => obj && typeof obj === 'object' && !Array.isArray(obj) &&
  Object.keys(obj).length === keys.length && keys.every(k => Object.hasOwn(obj,k));
const text = v => typeof v === 'string' && v.trim().length >= 2 && v.length <= 120;
const positiveInt = n => Number.isSafeInteger(n) && n > 0;
const fresh = (t, nowMs) => Number.isSafeInteger(t) && t > 0 &&
  t <= nowMs && nowMs - t <= MAX_AGE_MS;
const ADDRESS_KEYS = ['destinationId','addressRevision','verificationId','verifiedAtMs',
  'district','province','adjacent','sector','status'];
const ROUTE_KEYS = ['destinationId','addressRevision','verificationId','measuredAtMs','roadKm','status'];

/** destinationId is an opaque ID for an address that the server owns. */
export function createDeliveryV2EvidenceGate({lookupVerifiedAddress, measureTrustedRoute, now = Date.now} = {}) {
  if (typeof lookupVerifiedAddress !== 'function' ||
      typeof measureTrustedRoute !== 'function' || typeof now !== 'function') {
    throw new TypeError('trusted server-side evidence callbacks and clock required');
  }
  return async function reviewDestination({destinationId, ...extras} = {}) {
    if (typeof destinationId !== 'string' || !ID_PATTERN.test(destinationId) ||
        Object.keys(extras).length > 0) {
      throw new TypeError('opaque destinationId only; client geo, rates and evidence prohibited');
    }
    const startedAtMs = now();
    if (!Number.isSafeInteger(startedAtMs) || startedAtMs <= 0) {
      throw new TypeError('invalid server clock');
    }
    const rawAddress = await lookupVerifiedAddress(destinationId);
    // Snapshot each proof field exactly once before validation. Provider
    // accessors must not return one district/verification ID for validation
    // and another for the route binding or review response.
    const address = exact(rawAddress, ADDRESS_KEYS)
      ? Object.freeze(Object.fromEntries(ADDRESS_KEYS.map(key => [key, rawAddress[key]])))
      : null;
    const checkedAtMs = now();
    if (!Number.isSafeInteger(checkedAtMs) || checkedAtMs < startedAtMs) {
      throw new TypeError('invalid or nonmonotonic server clock');
    }
    if (!exact(address, ADDRESS_KEYS) || address.status !== 'verified' ||
        address.destinationId !== destinationId ||
        !positiveInt(address.addressRevision) ||
        !sha.test(address.verificationId ?? '') ||
        !fresh(address.verifiedAtMs, checkedAtMs) ||
        !text(address.district) || !text(address.province) ||
        typeof address.adjacent !== 'boolean' ||
        (address.sector !== null && !text(address.sector))) {
      return fail('address_verification_required');
    }
    // Snapshot the original verification time too: a mutable provider response
    // must not backdate or refresh its timestamp during route measurement.
    // Copy before the async boundary: provider-owned objects can be mutated
    // while the route is in flight. Never trust them after await.
    const verifiedAtMs = address.verifiedAtMs;
    const identity = Object.freeze({destinationId,
      addressRevision:address.addressRevision, verificationId:address.verificationId});
    const destination = Object.freeze({
      district:address.district.trim().replace(/\s+/g,' '),
      province:address.province.trim().replace(/\s+/g,' '),
      adjacent:address.adjacent,
      sector:address.sector === null ? null : address.sector.trim().replace(/\s+/g,' '),
    });
    const route = await measureTrustedRoute(identity);
    // Both proofs must still be fresh at the END of the async operation. A
    // slow route lookup cannot resurrect an address valid only at entry.
    const completedAtMs = now();
    if (!Number.isSafeInteger(completedAtMs) || completedAtMs < checkedAtMs) {
      throw new TypeError('invalid or nonmonotonic server clock');
    }
    if (!fresh(verifiedAtMs, completedAtMs)) {
      return fail('address_verification_required');
    }
    if (!exact(route, ROUTE_KEYS)) {
      return fail('route_verification_required');
    }
    // Read the route proof once after the async boundary. An accessor or a
    // mutable provider object must not change the measured distance between
    // validation and the nonpayable review response.
    const measuredRoute = Object.freeze({
      destinationId: route.destinationId,
      addressRevision: route.addressRevision,
      verificationId: route.verificationId,
      measuredAtMs: route.measuredAtMs,
      roadKm: route.roadKm,
      status: route.status,
    });
    if (measuredRoute.status !== 'measured' ||
        measuredRoute.destinationId !== destinationId ||
        measuredRoute.addressRevision !== identity.addressRevision ||
        measuredRoute.verificationId !== identity.verificationId ||
        !fresh(measuredRoute.measuredAtMs, completedAtMs) ||
        measuredRoute.measuredAtMs < verifiedAtMs ||
        typeof measuredRoute.roadKm !== 'number' || !Number.isFinite(measuredRoute.roadKm) ||
        measuredRoute.roadKm <= 0) {
      return fail('route_verification_required');
    }
    // No address line, provider token, coordinates, payment or amount is returned.
    // Ownership and actual provider authentication remain the host's duty.
    return Object.freeze({ready:true, payable:false, status:'evidence_for_review_only',
      destination:Object.freeze({...destination, roadKm:measuredRoute.roadKm})
    });
  };
}
