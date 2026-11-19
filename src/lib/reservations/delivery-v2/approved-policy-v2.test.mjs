import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

// Reference-only. This file is NOT a quote, provider adapter, or checkout gate.
const policy = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'approved-policy-v2.json'), 'utf8'));

test('the transferred V2 policy is the owner-approved 2026-11-06 version', () => {
  assert.equal(policy.schema, 'bagelito.delivery-tiers.2026-11-06.v2');
  assert.equal(policy.owner_approval_date, '2026-11-06');
  assert.equal(policy.currency, 'PEN');
  assert.deepEqual(policy.pricing, {
    adjacent_minor: 800, regular_minor: 1000,
    distant_minor: 1500, very_distant_minor: 2000,
  });
});

test('La Molina and long-distance overrides must not be silently dropped', () => {
  assert.equal(policy.overrides.la_molina_min, 1500);
  assert.deepEqual(policy.overrides.la_molina_verified_sectors_very_distant,
    ['El Sol de La Molina', 'Las Lagunas de La Molina', 'La Planicie']);
  assert.deepEqual(policy.overrides.server_verified_road_km_upgrade, {
    over_15_km: 1500, over_25_km: 2000, over_40_km: 'manual-review',
  });
});

test('the transferred manifest contains no private dispatch location', () => {
  assert.equal(policy.public_dispatch_area, 'Lince, Lima');
  assert.equal(policy.private_origin, 'NOT_RECORDED_OR_REQUIRED');
  const keys = JSON.stringify(policy).toLowerCase();
  for (const forbidden of ['street_address', 'latitude', 'longitude', 'coordinates', 'origin_street']) {
    assert.equal(keys.includes(forbidden), false, 'private-origin key: ' + forbidden);
  }
});

test('public configuration never authorizes checkout or accepts client evidence', () => {
  assert.match(policy.checkout, /requires verified destination district and address from internal backend/i);
  assert.match(policy.checkout, /no client-supplied evidence/i);
  assert.match(policy.manual, /manual|separate logistic quote/i);
  assert.equal(Object.hasOwn(policy, 'checkout_enabled'), false);
  assert.equal(Object.hasOwn(policy, 'payable'), false);
});
