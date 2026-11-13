/**
 * REVIEW-ONLY Delivery V2 quote candidate.
 *
 * Inputs MUST originate from a server-side destination resolver; this function
 * does not authenticate geodata, verify an address, reserve inventory or
 * release the reservation hard stop. Never expose it as a payable quote API.
 *
 * No origin street, coordinates, customer address or client-provided proof is
 * accepted or emitted. A provider-backed binding to an order is still required.
 */
const SCHEMA = 'bagelito.delivery-tiers.2026-11-06.v2';

const canonical = value => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

function assertText(value, field) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > 120) {
    throw new TypeError(`${field} must be a nonempty canonical server value`);
  }
  return value.trim().replace(/\s+/g, ' ');
}

/** Returns public-safe, explicitly nonpayable candidate; never a verified quote. */
export function evaluateDeliveryV2Candidate({district, province, adjacent, sector = null, roadKm = null}, policy) {
  if (!policy || policy.schema !== SCHEMA || policy.currency !== 'PEN') {
    throw new TypeError('Owner-approved Delivery V2 policy is required');
  }
  const cleanDistrict = assertText(district, 'district');
  const cleanProvince = assertText(province, 'province');
  if (typeof adjacent !== 'boolean') {
    throw new TypeError('adjacent requires server-owned geographic classification');
  }
  if (sector !== null && typeof sector !== 'string') {
    throw new TypeError('sector must be resolved by the internal backend');
  }
  if (roadKm !== null && (!Number.isFinite(roadKm) || roadKm <= 0)) {
    throw new TypeError('roadKm must be a positive finite, server-measured number');
  }

  const base = {
    district: cleanDistrict,
    province: cleanProvince,
    feeMinor: null,
    tier: 'unverified',
    status: 'verification_required',
    payable: false,
    tariffVersion: policy.schema,
  };
  // Unmeasured distance or a different province cannot receive a fixed fee.
  if (roadKm === null || canonical(cleanProvince) !== 'lima') return base;

  const distanceRules = policy.overrides.server_verified_road_km_upgrade;
  if (roadKm > 40 && distanceRules.over_40_km === 'manual-review') {
    return {...base, tier: 'manual', status: 'manual_review'};
  }

  let feeMinor = adjacent ? policy.pricing.adjacent_minor : policy.pricing.regular_minor;
  if (canonical(cleanDistrict) === 'la molina') {
    feeMinor = Math.max(feeMinor, policy.overrides.la_molina_min);
    const isFarSector = typeof sector === 'string' &&
      policy.overrides.la_molina_verified_sectors_very_distant
        .some(name => canonical(name) === canonical(sector));
    // The policy lists far sectors, but does NOT certify a near-sector
    // allowlist. Missing or unknown sector could still be S/20; do not
    // publish a misleading S/15 candidate merely because no far match was
    // found. A verified >25 km route independently fixes the S/20 tier.
    if (!isFarSector && roadKm <= 25) return base;
    if (isFarSector) feeMinor = Math.max(feeMinor, policy.pricing.very_distant_minor);
  }
  if (roadKm > 15) feeMinor = Math.max(feeMinor, distanceRules.over_15_km);
  if (roadKm > 25) feeMinor = Math.max(feeMinor, distanceRules.over_25_km);

  const tiers = new Map([
    [policy.pricing.adjacent_minor, 'adjacent'],
    [policy.pricing.regular_minor, 'regular'],
    [policy.pricing.distant_minor, 'distant'],
    [policy.pricing.very_distant_minor, 'very_distant'],
  ]);
  if (!tiers.has(feeMinor)) throw new TypeError('Unrecognized policy fee');
  return {...base, feeMinor, tier: tiers.get(feeMinor), status: 'candidate_only'};
}
