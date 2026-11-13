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
const APPROVED_POLICY = Object.freeze({
  ownerApprovalDate: '2026-11-06',
  publicDispatchArea: 'Lince, Lima',
  privateOrigin: 'NOT_RECORDED_OR_REQUIRED',
  currency: 'PEN',
  pricing: Object.freeze({adjacent_minor:800, regular_minor:1000, distant_minor:1500, very_distant_minor:2000}),
  laMolinaMin: 1500,
  laMolinaFarSectors: Object.freeze(['El Sol de La Molina','Las Lagunas de La Molina','La Planicie']),
  roadKmUpgrades: Object.freeze({over_15_km:1500, over_25_km:2000, over_40_km:'manual-review'}),
  publicResponseFields: Object.freeze(['district','province','feeMinor','tier','status','payable','tariffVersion']),
});

const canonical = value => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

function assertText(value, field) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > 120) {
    throw new TypeError(`${field} must be a nonempty canonical server value`);
  }
  return value.trim().replace(/\s+/g, ' ');
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isExactApprovedPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) ||
      policy.schema !== SCHEMA ||
      policy.owner_approval_date !== APPROVED_POLICY.ownerApprovalDate ||
      policy.public_dispatch_area !== APPROVED_POLICY.publicDispatchArea ||
      policy.private_origin !== APPROVED_POLICY.privateOrigin ||
      policy.currency !== APPROVED_POLICY.currency) return false;

  const pricing = policy.pricing;
  if (!hasExactKeys(pricing, Object.keys(APPROVED_POLICY.pricing)) ||
      Object.keys(APPROVED_POLICY.pricing).some(key => pricing[key] !== APPROVED_POLICY.pricing[key])) return false;

  const overrides = policy.overrides;
  const overrideKeys = ['la_molina_min','la_molina_verified_sectors_very_distant','server_verified_road_km_upgrade'];
  if (!hasExactKeys(overrides, overrideKeys) ||
      overrides.la_molina_min !== APPROVED_POLICY.laMolinaMin) return false;

  const sectors = overrides.la_molina_verified_sectors_very_distant;
  if (!Array.isArray(sectors) || sectors.length !== APPROVED_POLICY.laMolinaFarSectors.length ||
      sectors.some((value, index) => value !== APPROVED_POLICY.laMolinaFarSectors[index])) return false;

  const upgrades = overrides.server_verified_road_km_upgrade;
  if (!hasExactKeys(upgrades, Object.keys(APPROVED_POLICY.roadKmUpgrades)) ||
      Object.keys(APPROVED_POLICY.roadKmUpgrades).some(key => upgrades[key] !== APPROVED_POLICY.roadKmUpgrades[key])) return false;

  const responseFields = policy.public_response_fields;
  return Array.isArray(responseFields) &&
    responseFields.length === APPROVED_POLICY.publicResponseFields.length &&
    responseFields.every((value, index) => value === APPROVED_POLICY.publicResponseFields[index]);
}

/** Returns public-safe, explicitly nonpayable candidate; never a verified quote. */
export function evaluateDeliveryV2Candidate({district, province, adjacent, sector = null, roadKm = null}, policy) {
  if (!isExactApprovedPolicy(policy)) {
    throw new TypeError('Exact owner-approved Delivery V2 policy is required');
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