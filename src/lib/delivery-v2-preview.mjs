/**
 * Bagelito Delivery V2 — non-payable, server-review estimate.
 * Never use this preview as payment authorization or a verified address.
 * Actual sector/district coverage and final fee require trusted operator/geocoder.
 */
export const DELIVERY_V2 = 'BAGELITO-DELIVERY-2026-11-06-v2';
export const normalizeDistrict = value => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
  : '';
const NEIGHBORS = new Set(['lince', 'jesus maria', 'san isidro', 'la victoria']);
const FAR = new Set(['la molina']);
export function previewDeliveryV2(district) {
  const normalized = normalizeDistrict(district);
  if (!normalized || normalized.length > 100 || !/^[a-z0-9 .-]+$/.test(normalized)) {
    return Object.freeze({version: DELIVERY_V2, district: null, estimatedFeeMinor: null,
      rangeMinor: null, status: 'district_required', payable: false, addressVerified: false});
  }
  let estimatedFeeMinor = 1000;
  let rangeMinor = null;
  let status = 'standard_estimate_review_required';
  if (NEIGHBORS.has(normalized)) {
    estimatedFeeMinor = 800;
    status = 'neighbor_estimate_review_required';
  } else if (FAR.has(normalized)) {
    estimatedFeeMinor = null;
    rangeMinor = Object.freeze([1500, 2000]);
    status = 'far_sector_review_required';
  } else if (!new Set([
    'miraflores','san borja','pueblo libre','magdalena','magdalena del mar',
    'surquillo','cercado de lima','brena','barranco','san miguel','surco',
    'santiago de surco','san luis','chorrillos','rimac','san juan de miraflores',
    'ate','los olivos','san martin de porres','villa el salvador','villa maria del triunfo'
  ]).has(normalized)) {
    estimatedFeeMinor = null;
    status = 'coverage_review_required';
  }
  return Object.freeze({version: DELIVERY_V2, district: normalized, estimatedFeeMinor,
    rangeMinor, status, payable: false, addressVerified: false});
}
