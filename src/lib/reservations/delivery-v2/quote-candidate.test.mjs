import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {evaluateDeliveryV2Candidate} from './quote-candidate.mjs';

const policy = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'approved-policy-v2.json'), 'utf8'));
const candidate = (overrides = {}, selectedPolicy = policy) => evaluateDeliveryV2Candidate({
  district: 'Lince', province: 'Lima', adjacent: true, roadKm: 3, ...overrides,
}, selectedPolicy);

test('adjacent/regular tiers and threshold upgrades are deterministic', () => {
  assert.equal(candidate().feeMinor, 800);
  assert.equal(candidate({adjacent:false}).feeMinor, 1000);
  assert.equal(candidate({roadKm:15}).feeMinor, 800);
  assert.equal(candidate({roadKm:15.01}).feeMinor, 1500);
  assert.equal(candidate({roadKm:25}).feeMinor, 1500);
  assert.equal(candidate({roadKm:25.01}).feeMinor, 2000);
  assert.equal(candidate({roadKm:40}).feeMinor, 2000);
});

test('above 40 km requires manual review without presenting a fixed price', () => {
  assert.deepEqual(candidate({roadKm:40.01}), {
    district:'Lince', province:'Lima', feeMinor:null,
    tier:'manual', status:'manual_review', payable:false, tariffVersion:policy.schema,
  });
});

test('La Molina uncertain sectors fail closed; verified far sectors and >25 km can yield a nonpayable S/20 candidate', () => {
  for (const sector of [null, '', 'La Rinconada', 'unknown']) {
    const quote = candidate({district:' LA  MOLINA ',adjacent:false,sector,roadKm:8});
    assert.equal(quote.feeMinor,null);
    assert.equal(quote.status,'verification_required');
    assert.equal(quote.payable,false);
  }
  assert.equal(candidate({district:'La Molina',adjacent:false,sector:null,roadKm:25}).feeMinor,null);
  assert.equal(candidate({district:'La Molina',adjacent:false,sector:null,roadKm:25.01}).feeMinor,2000);
  assert.equal(candidate({district:'La Molina',adjacent:false,sector:'la planicie',roadKm:8}).feeMinor,2000);
  assert.equal(candidate({district:'La Molina',adjacent:false,sector:'EL SOL DE LA MOLINA',roadKm:8}).feeMinor,2000);
  assert.equal(candidate({district:'La Molina',adjacent:false,sector:'Las Lagunas de La Molina',roadKm:8}).feeMinor,2000);
});

test('missing road proof and other provinces fail closed without payable fee', () => {
  for (const entry of [{roadKm:null},{province:'Callao'},{province:'Huarochirí'}]) {
    const result = candidate(entry);
    assert.equal(result.feeMinor,null);
    assert.equal(result.status,'verification_required');
    assert.equal(result.payable,false);
  }
});

test('untrusted or malformed geographic values cannot produce a candidate', () => {
  for (const overrides of [{roadKm:-1},{roadKm:Infinity},{roadKm:NaN},{roadKm:'3'},
    {adjacent:'true'},{district:''},{province:null},{sector:{verified:true}}]) {
    assert.throws(() => candidate(overrides), TypeError);
  }
  assert.throws(() => evaluateDeliveryV2Candidate({district:'Lince',province:'Lima',adjacent:true,roadKm:2},
    {...policy,schema:'v1'}), TypeError);
});

test('public output allowlist is exact, never authorizes payment or exposes private origin', () => {
  for (const result of [candidate(), candidate({roadKm:null}), candidate({roadKm:50})]) {
    assert.deepEqual(Object.keys(result).sort(), [...policy.public_response_fields].sort());
    assert.equal(result.payable,false);
    const serialized=JSON.stringify(result).toLowerCase();
    for (const forbidden of ['latitude','longitude','street','origin','customer','address']) {
      assert.equal(serialized.includes(forbidden),false,forbidden);
    }
  }
});

test('policy drift in any approved tariff field fails closed before quote calculation', () => {
  const mutations = [
    draft => { draft.pricing.adjacent_minor = 801; },
    draft => { draft.pricing.regular_minor = 1001; },
    draft => { draft.pricing.distant_minor = 1501; },
    draft => { draft.pricing.very_distant_minor = 2001; },
    draft => { draft.pricing.extra_tier_minor = 2500; },
    draft => { draft.overrides.la_molina_min = 1400; },
    draft => { draft.overrides.la_molina_verified_sectors_very_distant[0] = 'Other sector'; },
    draft => { draft.overrides.server_verified_road_km_upgrade.over_15_km = 1400; },
    draft => { draft.overrides.server_verified_road_km_upgrade.over_25_km = 1900; },
    draft => { draft.overrides.server_verified_road_km_upgrade.over_40_km = 'fixed'; },
    draft => { draft.overrides.extra_override = true; },
    draft => { draft.owner_approval_date = '2026-11-07'; },
    draft => { draft.checkout = 'client-supplied address accepted'; },
    draft => { draft.manual = 'always charge a fixed fee'; },
    draft => { draft.checkout_enabled = true; },
    draft => { draft.payable = true; },
    draft => { draft.server_verified = true; },
    draft => { draft.public_response_fields.push('address'); },
  ];
  for (const mutate of mutations) {
    const tampered = structuredClone(policy);
    mutate(tampered);
    assert.throws(() => candidate({}, tampered), /Exact owner-approved Delivery V2 policy is required/);
  }
});

test('the exact owner-approved policy remains accepted', () => {
  assert.equal(candidate().feeMinor, policy.pricing.adjacent_minor);
  assert.equal(candidate({adjacent:false}).feeMinor, policy.pricing.regular_minor);
});