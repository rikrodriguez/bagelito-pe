import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { hasStrongAdminPassword } from '../../src/lib/admin/login-security.ts';

// All sessions, keys, responses and clients below are synthetic and local.
// The signed cookie is created in memory and never written, logged or exported.
globalThis.fetch = () => { throw new Error('Unexpected real network call'); };
const origin = 'https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app';
const host = new URL(origin).host;
const codes = ['BAG-000001', 'BAG-000002', 'BAG-000004'];
const syntheticPassword = 'adapter-fixture-strong-password';
const syntheticSessionSecret = 'adapter-fixture-independent-session-secret-32';
const privateMarker = 'SYNTHETIC_PRIVATE_EMAIL_PAN_KEY_COOKIE_NEVER_LOG';
async function stripped(path) {
  const text = await readFile(new URL(path, import.meta.url), 'utf8');
  return stripTypeScriptTypes(text.replace(/^import [\s\S]*?;\n/gm, '')).replace(/export /g, '');
}
const sessionBody = await stripped('../../src/lib/admin/session-security.ts');
const { issueAdminSession, verifyAdminSession, isAdminSessionConfigured } = new Function(
  'createHmac', 'randomBytes', 'timingSafeEqual', 'hasStrongAdminPassword',
  `${sessionBody}; return {issueAdminSession,verifyAdminSession,isAdminSessionConfigured};`,
)(createHmac, randomBytes, timingSafeEqual, hasStrongAdminPassword);
const authBody = await stripped('../../src/lib/admin/auth.ts');
const loadAuth = new Function(
  'timingSafeEqual', 'cookies', 'redirect', 'hasStrongAdminPassword',
  'issueAdminSession', 'verifyAdminSession', 'isAdminSessionConfigured', 'process',
  `${authBody}; return requireAdmin;`,
);
const configuration = () => ({
  VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview',
  VERCEL_PROJECT_ID: 'prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0',
  VERCEL_GIT_COMMIT_REF: 'fix/culqi-payment-coordination-20261012',
  VERCEL_GIT_REPO_OWNER: 'rikrodriguez', VERCEL_GIT_REPO_SLUG: 'bagelito-pe',
  VERCEL_BRANCH_URL: host, NEXT_PUBLIC_SITE_URL: origin,
  NEXT_PUBLIC_SUPABASE_URL: 'https://qaahskendqdkynwtylho.supabase.co',
  PAYMENT_PROVIDER: 'culqi', CULQI_MODE: 'sandbox',
  CULQI_LIVE_APPROVED: 'false', CULQI_ENABLED: 'true',
  NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_test_OFFLINEAdapterFixture',
  CULQI_SECRET_KEY: 'sk_test_OFFLINEAdapterFixture',
});
const validHeaders = () => new Headers({
  origin, host, 'x-forwarded-host': host, 'sec-fetch-site': 'same-origin',
  referer: `${origin}/admin`,
});

const adapterBody = await stripped('../../src/lib/payments/culqi-readonly-adapter.ts');
const loadAdapter = new Function('headers', 'requireAdmin', 'createSupabaseAdminClient',
  'createCulqiReadonlyDiagnostic', 'process', 'fetch', 'console',
  `${adapterBody}; return {runAdminCulqiReadonlyDiagnostic,isCulqiReadonlyActionRequestAllowed};`);
const coreBody = await stripped('../../src/lib/payments/culqi-readonly-diagnostic.ts');
const coreFactory = new Function(`${coreBody}; return createCulqiReadonlyDiagnostic;`)();
const actionSource = await readFile(new URL('../../src/app/admin/actions.ts', import.meta.url), 'utf8');
const actionStart = actionSource.indexOf('export async function runCulqiReadonlyDiagnostic');
assert.ok(actionStart >= 0, 'Existing admin Server Action must expose the diagnostic');
const actionBody = stripTypeScriptTypes(actionSource.slice(actionStart, actionSource.indexOf('const allowedOrderStatuses', actionStart)))
  .replace(/export /g, '');
const loadAction = new Function('runAdminCulqiReadonlyDiagnostic', `${actionBody}; return runCulqiReadonlyDiagnostic;`);
const chargeIds = ['chr_test_WIu0Hn7e9r2MqEue', 'chr_test_BGmSf0LA6lKdxdcz', 'chr_test_SA3U26iSk7KDn0BI'];
const fields = ['order_code', 'payment_provider', 'payment_lane', 'payment_order_id', 'payment_charge_id',
  'payment_charge_source_id', 'payment_amount_minor', 'payment_currency'];
const rowFixture = (index) => ({
  id: `fixture-row-${index}`, order_code: codes[index], payment_provider: 'culqi',
  payment_lane: 'token', payment_order_id: null, payment_charge_id: chargeIds[index],
  payment_charge_source_id: `${index === 0 ? 'ype' : 'tkn'}_test_OFFLINEAdapterSource${index}`,
  payment_amount_minor: 6600, payment_currency: 'PEN',
});

async function execute({ cookieMode = 'valid', headerChanges = {}, environment = {},
  rows = codes.map((_, index) => rowFixture(index)), dbError = null, providerError = null,
  factory = coreFactory, headersError = null, actionArguments = [],
} = {}) {
  const state = { steps: [], configReads: [], keyReads: [], queries: [], fetches: [], logs: [],
    factoryCalls: 0, databaseClients: 0, writes: 0, forwardedArguments: null, querySignals: [] };
  const now = Date.now();
  let session = issueAdminSession(syntheticPassword, syntheticSessionSecret, origin, now);
  if (cookieMode === 'missing') session = '';
  if (cookieMode === 'tampered') session += 'x';
  if (cookieMode === 'expired') session = issueAdminSession(syntheticPassword, syntheticSessionSecret, origin, now - 9 * 3600_000);
  if (cookieMode === 'other_origin') session = issueAdminSession(syntheticPassword, syntheticSessionSecret, 'https://fixture.invalid', now);
  let authorized = false;
  let headersRead = false;
  const auth = loadAuth(timingSafeEqual, async () => ({ get: (name) => {
    assert.equal(name, 'bagelito_admin');
    return session ? { value: session } : undefined;
  } }), () => { throw new Error('SYNTHETIC_AUTH_REDIRECT'); }, hasStrongAdminPassword,
  issueAdminSession, verifyAdminSession, isAdminSessionConfigured,
  { env: { ADMIN_PASSWORD: syntheticPassword, ADMIN_SESSION_SECRET: syntheticSessionSecret, NEXT_PUBLIC_SITE_URL: origin } });
  const env = new Proxy({ ...configuration(), ...environment }, { get(target, key) {
    assert.equal(authorized, true, 'Payment configuration cannot be read before verified session');
    assert.equal(headersRead, true, 'Payment configuration cannot be read before server headers');
    state.configReads.push(key);
    if (key === 'CULQI_SECRET_KEY' || key === 'NEXT_PUBLIC_CULQI_PUBLIC_KEY' || key === 'SUPABASE_SERVICE_ROLE_KEY') state.keyReads.push(key);
    return target[key];
  } });
  const incoming = validHeaders();
  for (const [name, value] of Object.entries(headerChanges)) value == null ? incoming.delete(name) : incoming.set(name, value);
  const forbiddenWrite = () => { state.writes++; throw new Error(privateMarker); };
  const query = {
    select: (selection) => { state.queries.push(['select', selection]); return query; },
    in: (column, values) => { state.queries.push(['in', column, values]); return query; },
    limit: (count) => { state.queries.push(['limit', count]); return query; },
    abortSignal: (signal) => { state.querySignals.push(signal); return query; },
    then: (resolve) => resolve({ data: rows, error: dbError }),
    insert: forbiddenWrite, update: forbiddenWrite, delete: forbiddenWrite, upsert: forbiddenWrite,
  };
  const { runAdminCulqiReadonlyDiagnostic, isCulqiReadonlyActionRequestAllowed } = loadAdapter(
    async () => {
      state.steps.push('headers'); assert.equal(authorized, true);
      if (headersError) throw headersError;
      headersRead = true; return incoming;
    },
    async () => { state.steps.push('auth'); await auth(); authorized = true; state.steps.push('authorized'); },
    () => { state.databaseClients++; return { from: (table) => { state.queries.push(['from', table]); return query; }, rpc: forbiddenWrite }; },
    (dependencies) => { state.factoryCalls++; return factory(dependencies); },
    { env },
    async (url, init) => {
      state.fetches.push({ url, init });
      if (providerError) throw providerError;
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.culqi.com');
      assert.equal(init.method, 'GET'); assert.equal(init.body, undefined);
      assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
      const index = chargeIds.findIndex((id) => parsed.pathname === `/v2/charges/${id}`);
      if (index >= 0) return Response.json({ object: 'charge', id: chargeIds[index], amount: 6600,
        currency_code: 'PEN', metadata: { bagelito_order_code: codes[index] },
        source: { id: rowFixture(index).payment_charge_source_id }, capture: true, paid: false,
        email: privateMarker, payload: privateMarker });
      assert.equal(parsed.pathname, '/v2/events');
      return Response.json({ data: [] });
    },
    { info: (...args) => state.logs.push(args), warn: forbiddenWrite, error: forbiddenWrite, log: forbiddenWrite },
  );
  const action = loadAction((...args) => { state.forwardedArguments = args; return runAdminCulqiReadonlyDiagnostic(); });
  const response = await action(...actionArguments);
  const serialized = JSON.stringify({ response, logs: state.logs });
  for (const marker of [privateMarker, session, syntheticPassword, syntheticSessionSecret,
    'sk_test_OFFLINEAdapterFixture', 'pk_test_OFFLINEAdapterFixture', ...chargeIds, ...codes]) {
    if (marker) assert.equal(serialized.includes(marker), false, 'No synthetic private material or IDs may leave the adapter');
  }
  assert.deepEqual(Object.keys(response), ['ok']); assert.equal(typeof response.ok, 'boolean');
  assert.equal(state.writes, 0, 'Diagnostic cannot invoke a mutation or external monitoring logger');
  return { response, state, isCulqiReadonlyActionRequestAllowed };
}

test('actual signed admin fixture runs the existing action with server-only reads and acknowledgement', async () => {
  const { response, state } = await execute();
  assert.deepEqual(response, { ok: true });
  assert.deepEqual(state.steps, ['auth', 'authorized', 'headers']);
  assert.equal(state.factoryCalls, 1); assert.equal(state.databaseClients, 1);
  assert.deepEqual(state.queries, [['from', 'orders'], ['select', fields.join(',')], ['in', 'order_code', codes], ['limit', 4]]);
  assert.equal(state.querySignals.length, 1); assert.ok(state.querySignals[0] instanceof AbortSignal);
  assert.equal(state.querySignals[0].aborted, false);
  assert.equal(state.fetches.length, 5);
  assert.deepEqual(state.forwardedArguments, []);
  assert.equal(state.logs.length, 1);
  assert.equal(state.logs[0][0], 'culqi_readonly_dryrun');
  assert.equal(state.logs[0][1].paidConfirmed, false);
  assert.equal(state.logs[0][1].writesAttempted, false);
  assert.equal(state.logs[0][1].reconciliationApplied, false);
  assert.equal(state.logs[0][1].scanComplete, false);
});

for (const cookieMode of ['missing', 'tampered', 'expired', 'other_origin']) {
  test(`real session verification rejects ${cookieMode} before headers/config/provider/database`, async () => {
    const { response, state } = await execute({ cookieMode });
    assert.deepEqual(response, { ok: false }); assert.deepEqual(state.steps, ['auth']);
    assert.deepEqual(state.configReads, []); assert.equal(state.factoryCalls, 0);
    assert.equal(state.databaseClients, 0); assert.deepEqual(state.fetches, []); assert.deepEqual(state.logs, []);
  });
}

for (const [name, headerChanges] of [
  ['missing origin', { origin: null }], ['opaque origin', { origin: 'null' }],
  ['wrong origin', { origin: 'https://fixture.invalid' }], ['origin path', { origin: `${origin}/admin` }],
  ['origin port', { origin: `${origin}:444` }], ['insecure origin', { origin: origin.replace('https:', 'http:') }],
  ['missing host', { host: null }], ['wrong host', { host: 'fixture.invalid' }],
  ['wrong forwarded host', { 'x-forwarded-host': 'fixture.invalid' }],
  ['forwarded host list', { 'x-forwarded-host': `${host}, fixture.invalid` }],
  ['cross-site navigation', { 'sec-fetch-site': 'cross-site' }],
  ['same-site navigation', { 'sec-fetch-site': 'same-site' }], ['non-browser navigation', { 'sec-fetch-site': 'none' }],
  ['wrong referer', { referer: 'https://fixture.invalid/admin' }],
  ['referer credentials', { referer: `https://fixture:private@${host}/admin` }],
  ['malformed referer', { referer: 'invalid' }],
  ['wrong forwarded protocol', { 'x-forwarded-proto': 'http' }],
  ['forwarded protocol list', { 'x-forwarded-proto': 'https,http' }],
]) test(`${name} fails before configuration, keys, provider or DB access`, async () => {
  const { response, state } = await execute({ headerChanges });
  assert.deepEqual(response, { ok: false }); assert.deepEqual(state.steps, ['auth', 'authorized', 'headers']);
  assert.deepEqual(state.configReads, []); assert.equal(state.factoryCalls, 0);
  assert.equal(state.databaseClients, 0); assert.deepEqual(state.fetches, []); assert.deepEqual(state.logs, []);
});

test('optional absent forwarded and navigation headers cannot replace required exact origin and host', async () => {
  const { response } = await execute({ headerChanges: { 'x-forwarded-host': null, 'sec-fetch-site': null, referer: null, 'x-forwarded-proto': null } });
  assert.deepEqual(response, { ok: true });
});

test('pure request guard rejects methods outside native POST even with canonical server headers', async () => {
  const { isCulqiReadonlyActionRequestAllowed } = await execute({ cookieMode: 'missing' });
  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
    assert.equal(isCulqiReadonlyActionRequestAllowed({ method, origin, host, forwardedHost: host, fetchSite: 'same-origin' }), false);
  }
});

for (const environment of [
  { VERCEL_ENV: 'production' }, { VERCEL_TARGET_ENV: 'production' }, { VERCEL_PROJECT_ID: 'other' },
  { VERCEL_GIT_COMMIT_REF: 'main' }, { VERCEL_GIT_REPO_SLUG: 'other' },
  { NEXT_PUBLIC_SITE_URL: 'https://bagelito.pe' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid' },
  { CULQI_MODE: 'live' }, { CULQI_LIVE_APPROVED: 'true' }, { CULQI_ENABLED: 'false' },
]) test(`wrong sandbox scope fails before keys and clients: ${Object.keys(environment)[0]}`, async () => {
  const { response, state } = await execute({ environment });
  assert.deepEqual(response, { ok: false }); assert.deepEqual(state.keyReads, []);
  assert.equal(state.databaseClients, 0); assert.deepEqual(state.fetches, []);
});

test('missing, live or malformed Culqi keys stop before SELECT or provider requests', async () => {
  for (const environment of [
    { CULQI_SECRET_KEY: undefined }, { NEXT_PUBLIC_CULQI_PUBLIC_KEY: undefined },
    { CULQI_SECRET_KEY: 'sk_live_OFFLINEInvalid' }, { NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_live_OFFLINEInvalid' },
    { CULQI_SECRET_KEY: `sk_test_Invalid\r\nBearer ${privateMarker}` },
  ]) {
    const { response, state } = await execute({ environment });
    assert.deepEqual(response, { ok: false }); assert.equal(state.databaseClients, 0);
    assert.deepEqual(state.queries, []); assert.deepEqual(state.fetches, []);
  }
});

test('native action ignores hostile caller arguments and never forwards IDs or headers to the wrapper', async () => {
  const hostile = new Proxy({}, { get() { throw new Error('Caller argument was inspected'); } });
  const { response, state } = await execute({ actionArguments: [hostile, { origin: 'https://fixture.invalid', chargeId: privateMarker }] });
  assert.deepEqual(response, { ok: true }); assert.deepEqual(state.forwardedArguments, []);
  assert.deepEqual(state.queries[2], ['in', 'order_code', codes]);
});

test('extra, duplicate, mismatched, non-token or foreign order rows stop before provider lookup', async () => {
  const normal = codes.map((_, index) => rowFixture(index));
  for (const rows of [
    [...normal, { ...normal[0], order_code: 'BAG-999999' }], [normal[0], normal[0], normal[2]],
    normal.map((row, i) => i === 0 ? { ...row, payment_charge_id: 'chr_test_OFFLINEWrongCharge' } : row),
    normal.map((row, i) => i === 0 ? { ...row, payment_lane: 'legacy_order' } : row),
    normal.map((row, i) => i === 0 ? { ...row, payment_provider: 'manual' } : row),
  ]) {
    const { response, state } = await execute({ rows });
    assert.deepEqual(response, { ok: false }); assert.deepEqual(state.fetches, []);
    assert.deepEqual(state.queries.at(-1), ['limit', 4]);
  }
});

test('exceptions and failed SELECT remain generic and never leak raw details', async () => {
  for (const options of [
    { headersError: new Error(privateMarker) }, { dbError: { message: privateMarker, details: privateMarker } },
    { providerError: new Error(privateMarker) }, { factory: () => { throw new Error(privateMarker); } },
  ]) {
    const { response } = await execute(options); assert.deepEqual(response, { ok: false });
  }
});

test('public acknowledgement drops all report fields and only a strict boolean may report success', async () => {
  for (const [report, ok] of [[{ ok: true, raw: privateMarker }, true], [{ ok: false, raw: privateMarker }, false],
    [{ ok: 'true', raw: privateMarker }, false], [null, false]]) {
    const { response, state } = await execute({ factory: () => async () => report });
    assert.deepEqual(response, { ok }); assert.equal(state.databaseClients, 0); assert.deepEqual(state.fetches, []);
  }
});

test('diagnostic adapter and thin action add no payment mutations, notifications or cache revalidation', () => {
  assert.doesNotMatch(adapterBody, /\b(?:logError|logWarn|logInfo|revalidatePath|redirect)\s*\(|\.rpc\s*\(|\.(?:insert|update|upsert|delete)\s*\(/);
  assert.doesNotMatch(actionBody, /formData|\.get\s*\(|\b(?:revalidatePath|redirect|fetch)\s*\(|\.rpc\s*\(/);
});

test('read-only SELECT receives an abort signal with a ten second timeout', async () => {
  const originalTimeout = AbortSignal.timeout;
  const durations = new WeakMap();
  AbortSignal.timeout = (milliseconds) => {
    const signal = originalTimeout(milliseconds); durations.set(signal, milliseconds); return signal;
  };
  try {
    const { response, state } = await execute();
    assert.deepEqual(response, { ok: true }); assert.equal(state.querySignals.length, 1);
    assert.equal(durations.get(state.querySignals[0]), 10_000);
  } finally { AbortSignal.timeout = originalTimeout; }
});
