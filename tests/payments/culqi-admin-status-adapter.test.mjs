import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getCulqiReadonlyDiagnosticScope } from '../../src/lib/payments/culqi-readonly-diagnostic.ts';
import { hasStrongAdminPassword } from '../../src/lib/admin/login-security.ts';

// Every session, environment, row and handler reply is synthetic and local.
globalThis.fetch = () => { throw new Error('Unexpected network call'); };
const origin = 'https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app';
const host = new URL(origin).host;
const codes = ['BAG-000001', 'BAG-000002', 'BAG-000004'];
const sessionId = '22222222-2222-4222-8222-000000000001';
const marker = 'SYNTHETIC_PRIVATE_COOKIE_KEY_EMAIL_CHARGE_UUID';
const password = 'local-status-adapter-strong-password';
const secret = 'local-status-adapter-independent-session-secret-32';
const selection = 'order_code,checkout_session_id';
const config = () => ({
  VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview',
  VERCEL_PROJECT_ID: 'prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0',
  VERCEL_GIT_COMMIT_REF: 'fix/culqi-payment-coordination-20261012',
  VERCEL_GIT_REPO_OWNER: 'rikrodriguez', VERCEL_GIT_REPO_SLUG: 'bagelito-pe',
  VERCEL_BRANCH_URL: host, NEXT_PUBLIC_SITE_URL: origin,
  NEXT_PUBLIC_SUPABASE_URL: 'https://qaahskendqdkynwtylho.supabase.co',
  CULQI_MODE: 'sandbox', CULQI_LIVE_APPROVED: 'false', CULQI_ENABLED: 'true',
  PAYMENT_PROVIDER: 'culqi', CULQI_STATUS_RECOVERY_APPROVED: 'true',
  NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_test_OFFLINEStatusAdapter',
  CULQI_SECRET_KEY: 'sk_test_OFFLINEStatusAdapter',
});
const requestHeaders = () => new Headers({ origin, host, 'x-forwarded-host': host,
  'x-forwarded-proto': 'https', 'sec-fetch-site': 'same-origin', referer: `${origin}/admin/orders/BAG-000001`,
  cookie: marker, authorization: `Bearer ${marker}`, 'content-length': '999999',
  'next-action': marker, 'x-private-extra': marker });
const statusReply = () => ({ ok: true, paymentStatus: 'pending', orderStatus: 'payment_pending_review',
  reconciliationRequired: false, recoveryState: 'deferred', retryAfterSeconds: 15,
  orderCode: codes[0], checkoutSessionId: sessionId, chargeId: marker, error: marker, expiresAt: marker });

async function stripped(path, optional = false) {
  let source;
  try { source = await readFile(new URL(path, import.meta.url), 'utf8'); }
  catch (error) { if (optional && error.code === 'ENOENT') return ''; throw error; }
  return stripTypeScriptTypes(source.replace(/^import\s[\s\S]*?;\s*/gm, ''))
    .replace(/^export\s+type\s+[\s\S]*?;\s*/gm, '').replace(/^export /gm, '');
}
const adapterBody = await stripped('../../src/lib/payments/culqi-admin-status-adapter.ts', true);
const exports = adapterBody ? new Function('getCulqiReadonlyDiagnosticScope',
  `${adapterBody}; return {createCulqiAdminStatusAction,isCulqiAdminStatusOrderCodeAllowed,getCulqiAdminStatusUiScope};`)(getCulqiReadonlyDiagnosticScope) : {};
const sessionBody = await stripped('../../src/lib/admin/session-security.ts');
const session = new Function('createHmac', 'randomBytes', 'timingSafeEqual', 'hasStrongAdminPassword',
  `${sessionBody}; return {issueAdminSession,verifyAdminSession,isAdminSessionConfigured};`)(createHmac, randomBytes, timingSafeEqual, hasStrongAdminPassword);
const authBody = await stripped('../../src/lib/admin/auth.ts');
const loadAuth = new Function('timingSafeEqual', 'cookies', 'redirect', 'hasStrongAdminPassword',
  'issueAdminSession', 'verifyAdminSession', 'isAdminSessionConfigured', 'process', `${authBody}; return requireAdmin;`);
const actionSource = await readFile(new URL('../../src/app/admin/culqi-status-actions.ts', import.meta.url), 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return ''; throw error;
});
const actionBody = await stripped('../../src/app/admin/culqi-status-actions.ts', true);
const loadAction = actionBody ? new Function('headers', 'requireAdmin', 'createSupabaseAdminClient',
  'createCulqiAdminStatusAction', 'POST', 'process', `${actionBody}; return runCulqiExistingOrderStatus;`) : null;

function harness({ cookieMode = 'valid', headerChanges = {}, environment = {},
  row = { order_code: codes[0], checkout_session_id: sessionId }, dbError = null,
  response = Response.json(statusReply()), headersError = null, dbMode = 'normal', postError = null,
} = {}) {
  assert.equal(typeof exports.createCulqiAdminStatusAction, 'function', 'Secure status adapter factory must exist');
  assert.equal(typeof loadAction, 'function', 'Native Server Action must exist');
  const state = { steps: [], configReads: [], queries: [], signals: [], posts: [], clients: 0 };
  let cookie = session.issueAdminSession(password, secret, origin);
  if (cookieMode === 'missing') cookie = '';
  if (cookieMode === 'tampered') cookie += 'x';
  if (cookieMode === 'expired') cookie = session.issueAdminSession(password, secret, origin, Date.now() - 9 * 3600_000);
  if (cookieMode === 'foreign') cookie = session.issueAdminSession(password, secret, 'https://fixture.invalid');
  const auth = loadAuth(timingSafeEqual, async () => ({ get: () => cookie ? { value: cookie } : undefined }),
    () => { throw new Error(marker); }, hasStrongAdminPassword, session.issueAdminSession, session.verifyAdminSession,
    session.isAdminSessionConfigured, { env: { ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: secret, NEXT_PUBLIC_SITE_URL: origin } });
  const incoming = requestHeaders();
  for (const [name, value] of Object.entries(headerChanges)) {
    if (value === null) incoming.delete(name);
    else incoming.set(name, value);
  }
  let authorized = false;
  let headersRead = false;
  const env = new Proxy({ ...config(), ...environment }, { get(target, key) {
    assert.equal(authorized, true); assert.equal(headersRead, true);
    state.configReads.push(key); return target[key];
  } });
  const query = {
    select: (fields) => { state.queries.push(['select', fields]); return query; },
    eq: (column, value) => { state.queries.push(['eq', column, value]); return query; },
    abortSignal: (signal) => { state.signals.push(signal); return query; },
    maybeSingle: () => dbMode === 'stall' ? new Promise(() => {}) : Promise.resolve({ data: row, error: dbError }),
  };
  const noEffect = () => { throw new Error('Unauthorized capability invoked'); };
  const action = loadAction(async () => {
    state.steps.push('headers'); assert.equal(authorized, true);
    if (headersError) throw headersError; headersRead = true; return incoming;
  }, async () => {
    state.steps.push('auth'); await auth(); authorized = true;
  }, () => {
    state.steps.push('pair'); state.clients++;
    return { from: (table) => { state.queries.push(['from', table]); return query; },
      rpc: noEffect, insert: noEffect, update: noEffect, delete: noEffect, upsert: noEffect };
  }, exports.createCulqiAdminStatusAction, async (request) => {
    state.steps.push('post'); state.posts.push(request); if (postError) throw postError; return response;
  }, { env });
  return { state, action, incoming, async run(input = { orderCode: codes[0] }, previousState = null) {
    const result = await action(previousState, input);
    const serialized = JSON.stringify(result);
    for (const value of [marker, password, secret, cookie, sessionId, ...codes,
      'sk_test_OFFLINEStatusAdapter', 'pk_test_OFFLINEStatusAdapter']) {
      if (value) assert.equal(serialized.includes(value), false, 'No private material in action result');
    }
    return result;
  } };
}

test('signed admin resolves only the approved pair and invokes the status handler locally', async () => {
  const h = harness();
  assert.deepEqual(await h.run(), { ok: true, paymentStatus: 'pending', orderStatus: 'payment_pending_review',
    reconciliationRequired: false, recoveryState: 'deferred', retryAfterSeconds: 15 });
  assert.deepEqual(h.state.steps, ['auth', 'headers', 'pair', 'post']);
  assert.deepEqual(h.state.queries, [['from', 'orders'], ['select', selection], ['eq', 'order_code', codes[0]]]);
  assert.equal(h.state.signals.length, 1); assert.ok(h.state.signals[0] instanceof AbortSignal);
  assert.equal(h.state.posts.length, 1);
  const request = h.state.posts[0];
  assert.equal(request.url, `${origin}/api/payments/culqi/status`); assert.equal(request.method, 'POST');
  assert.deepEqual(await request.json(), { orderCode: codes[0], checkoutSessionId: sessionId });
  assert.equal(request.cache, 'no-store'); assert.equal(request.credentials, 'omit'); assert.equal(request.redirect, 'error');
  assert.deepEqual([...request.headers.keys()].sort(), ['content-type', 'host', 'origin', 'referer', 'sec-fetch-site', 'x-forwarded-host', 'x-forwarded-proto']);
  for (const header of ['origin', 'host', 'referer', 'sec-fetch-site', 'x-forwarded-host', 'x-forwarded-proto'])
    assert.equal(request.headers.get(header), h.incoming.get(header));
});

for (const cookieMode of ['missing', 'tampered', 'expired', 'foreign'])
  test(`real admin authentication denies ${cookieMode} before request headers and configuration`, async () => {
    const h = harness({ cookieMode }); assert.deepEqual(await h.run(), { ok: false });
    assert.deepEqual(h.state.steps, ['auth']); assert.deepEqual(h.state.configReads, []);
    assert.equal(h.state.clients, 0); assert.deepEqual(h.state.posts, []);
  });

for (const [name, headerChanges] of [
  ['missing origin', { origin: null }], ['opaque origin', { origin: 'null' }],
  ['foreign origin', { origin: 'https://fixture.invalid' }], ['origin path', { origin: `${origin}/admin` }],
  ['origin port', { origin: `${origin}:444` }], ['insecure origin', { origin: origin.replace('https:', 'http:') }],
  ['missing host', { host: null }], ['foreign host', { host: 'fixture.invalid' }],
  ['foreign forwarded host', { 'x-forwarded-host': 'fixture.invalid' }],
  ['forwarded host list', { 'x-forwarded-host': `${host}, fixture.invalid` }],
  ['foreign forwarded protocol', { 'x-forwarded-proto': 'http' }],
  ['forwarded protocol list', { 'x-forwarded-proto': 'https,https' }],
  ['cross site', { 'sec-fetch-site': 'cross-site' }], ['same site', { 'sec-fetch-site': 'same-site' }],
  ['none fetch site', { 'sec-fetch-site': 'none' }], ['foreign referer', { referer: 'https://fixture.invalid/admin' }],
  ['referer credentials', { referer: `https://fixture:private@${host}/admin` }],
  ['malformed referer', { referer: 'invalid' }],
]) test(`${name} is denied before configuration and pair lookup`, async () => {
  const h = harness({ headerChanges }); assert.deepEqual(await h.run(), { ok: false });
  assert.deepEqual(h.state.steps, ['auth', 'headers']); assert.deepEqual(h.state.configReads, []);
  assert.equal(h.state.clients, 0); assert.deepEqual(h.state.posts, []);
});

test('missing optional request headers remain absent in the delegated request', async () => {
  const h = harness({ headerChanges: { 'x-forwarded-host': null, 'x-forwarded-proto': null, 'sec-fetch-site': null, referer: null } });
  assert.equal((await h.run()).ok, true);
  assert.deepEqual([...h.state.posts[0].headers.keys()], ['content-type', 'host', 'origin']);
});

test('raw header values must pass exact checks before a new Headers object can normalize them', async () => {
  for (const [name, value] of [['origin', ` ${origin} `], ['host', ` ${host} `],
    ['x-forwarded-host', ` ${host} `], ['x-forwarded-proto', ' https '], ['sec-fetch-site', ' same-origin ']]) {
    const original = requestHeaders();
    let effects = 0;
    const run = exports.createCulqiAdminStatusAction({
      requireAdmin: async () => {},
      readHeaders: () => ({ get: (key) => key === name ? value : original.get(key) }),
      readConfig: () => { effects++; return config(); },
      readOrderPair: async () => { effects++; return { order_code: codes[0], checkout_session_id: sessionId }; },
      postStatus: async () => { effects++; return Response.json(statusReply()); },
    });
    assert.deepEqual(await run(null, { orderCode: codes[0] }), { ok: false });
    assert.equal(effects, 0);
  }
});

for (const environment of [
  { CULQI_STATUS_RECOVERY_APPROVED: undefined }, { CULQI_STATUS_RECOVERY_APPROVED: 'false' },
  { CULQI_STATUS_RECOVERY_APPROVED: 'TRUE' }, { VERCEL: undefined }, { VERCEL_ENV: 'production' },
  { VERCEL_TARGET_ENV: 'production' }, { VERCEL_PROJECT_ID: 'other' }, { VERCEL_GIT_COMMIT_REF: 'main' },
  { VERCEL_GIT_COMMIT_REF: 'fix/culqi-capture-policy-20261014' }, { VERCEL_GIT_REPO_OWNER: 'other' },
  { VERCEL_GIT_REPO_SLUG: 'other' }, { VERCEL_BRANCH_URL: 'fixture.invalid' },
  { NEXT_PUBLIC_SITE_URL: 'https://bagelito.pe' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid' },
  { PAYMENT_PROVIDER: 'manual' }, { CULQI_MODE: 'live' }, { CULQI_LIVE_APPROVED: 'true' },
  { CULQI_ENABLED: 'false' }, { NEXT_PUBLIC_CULQI_PUBLIC_KEY: undefined }, { CULQI_SECRET_KEY: undefined },
  { NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_live_OFFLINEInvalid' }, { CULQI_SECRET_KEY: 'sk_live_OFFLINEInvalid' },
  { CULQI_SECRET_KEY: `sk_test_Invalid\r\nBearer ${marker}` },
]) test(`closed gate prevents pair SELECT: ${JSON.stringify(environment)}`, async () => {
  const h = harness({ environment }); assert.deepEqual(await h.run(), { ok: false });
  assert.equal(h.state.clients, 0); assert.deepEqual(h.state.posts, []);
});

for (const orderCode of codes) test(`fixed allowlist accepts ${orderCode}`, async () => {
  const h = harness({ row: { order_code: orderCode, checkout_session_id: sessionId } });
  assert.equal((await h.run({ orderCode })).ok, true);
  assert.deepEqual(h.state.queries.at(-1), ['eq', 'order_code', orderCode]);
});

test('unapproved codes and extra capability or financial fields are denied without SELECT or handler effects', async () => {
  const inputs = [null, [], 'BAG-000001', {}, { orderCode: 'BAG-000003' }, { orderCode: 'BAG-000005' },
    { orderCode: 'bag-000001' }, { orderCode: ' BAG-000001' }, { orderCode: 'BAG-000001 ' }, { orderCode: 1 },
    new FormData(), Object.create({ orderCode: codes[0] }),
    ...['checkoutSessionId', 'chargeId', 'sourceId', 'amount', 'currency', 'evidence', 'approved', 'origin', 'host'].map((key) => ({ orderCode: codes[0], [key]: marker })),
    Object.defineProperty({ orderCode: codes[0] }, 'hiddenCapability', { value: marker }),
    { orderCode: codes[0], [Symbol('private')]: marker }];
  for (const input of inputs) {
    const h = harness(); assert.deepEqual(await h.run(input), { ok: false });
    assert.equal(h.state.clients, 0); assert.deepEqual(h.state.posts, []);
  }
});

test('previous state cannot supply capabilities and is never inspected', async () => {
  const previousState = new Proxy({}, { get() { throw new Error(marker); }, ownKeys() { throw new Error(marker); } });
  const h = harness(); assert.equal((await h.run({ orderCode: codes[0] }, previousState)).ok, true);
});

test('missing or mismatched pairs and SELECT failures remain closed', async () => {
  for (const options of [{ row: null }, { row: { order_code: codes[1], checkout_session_id: sessionId } },
    { row: { order_code: codes[0], checkout_session_id: marker } }, { row: [ { order_code: codes[0], checkout_session_id: sessionId } ] },
    { dbError: { message: marker } }, { headersError: new Error(marker) }, { postError: new Error(marker) }]) {
    const h = harness(options); assert.deepEqual(await h.run(), { ok: false });
    if (!options.postError) assert.deepEqual(h.state.posts, []);
  }
});

test('absolute two second pair deadline aborts even an uncooperative SELECT and never delegates later', async () => {
  const h = harness({ dbMode: 'stall' }); const started = performance.now();
  assert.deepEqual(await h.run(), { ok: false });
  const elapsed = performance.now() - started;
  assert.ok(elapsed >= 1900 && elapsed < 3500, `pair deadline elapsed ${elapsed}ms`);
  assert.equal(h.state.signals[0].aborted, true); assert.deepEqual(h.state.posts, []);
});

test('closed handler responses preserve late paid cancelled review without a reservation success signal', async () => {
  const h = harness({ response: Response.json({ ...statusReply(), paymentStatus: 'paid', orderStatus: 'cancelled',
    reconciliationRequired: true, recoveryState: 'review_required' }) });
  assert.deepEqual(await h.run(), { ok: true, paymentStatus: 'paid', orderStatus: 'cancelled',
    reconciliationRequired: true, recoveryState: 'review_required', retryAfterSeconds: 15 });
});

test('failed and malformed handler replies cannot claim success or expose raw fields', async () => {
  for (const response of [Response.json({ ok: false, error: marker, paymentStatus: 'paid' }),
    Response.json({ ...statusReply(), ok: 'true' }), Response.json({ ...statusReply(), paymentStatus: marker }),
    Response.json({ ...statusReply(), orderStatus: marker }), Response.json({ ...statusReply(), reconciliationRequired: 'true' }),
    Response.json({ ...statusReply(), recoveryState: marker }), Response.json({ ...statusReply(), retryAfterSeconds: 16 }),
    Response.json({ ...statusReply(), retryAfterSeconds: -1 }), Response.json({ ...statusReply(), retryAfterSeconds: 1.5 }),
    Response.json({ ok: true }), Response.json(statusReply(), { status: 500 }), new Response(marker)]) {
    const h = harness({ response }); assert.deepEqual(await h.run(), { ok: false });
  }
});

test('metadata UI gate checks every original QA scope without inspecting payment keys', () => {
  assert.equal(typeof exports.getCulqiAdminStatusUiScope, 'function');
  const env = new Proxy(config(), { get(target, key) {
    assert.ok(!['CULQI_SECRET_KEY', 'NEXT_PUBLIC_CULQI_PUBLIC_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].includes(key)); return target[key];
  } });
  assert.equal(Object.values(exports.getCulqiAdminStatusUiScope(env)).every(Boolean), true);
  assert.equal(Object.values(exports.getCulqiAdminStatusUiScope({ ...config(), CULQI_STATUS_RECOVERY_APPROVED: undefined })).every(Boolean), false);
  for (const orderCode of [...codes, 'BAG-000003', 'BAG-000005', null, {}, 'bag-000001'])
    assert.equal(exports.isCulqiAdminStatusOrderCodeAllowed(orderCode), codes.includes(orderCode));
});

test('loading action and factory performs no environment, header, database or handler work', () => {
  const forbidden = () => { throw new Error('Module initialization effect'); };
  const env = new Proxy({}, { get: forbidden });
  const action = loadAction(forbidden, forbidden, forbidden, exports.createCulqiAdminStatusAction, forbidden, { env });
  assert.equal(typeof action, 'function');
  assert.equal(typeof exports.createCulqiAdminStatusAction(new Proxy({}, { get: forbidden })), 'function');
});

test('action remains server-only and adapter has no direct financial, network, logging or cache mutation capabilities', () => {
  assert.match(actionSource, /^['"]use server['"];/);
  assert.doesNotMatch(`${actionBody}\n${adapterBody}`, /\b(?:fetch|logError|logWarn|logInfo|revalidatePath|redirect)\s*\(|\.rpc\s*\(|\.(?:insert|update|upsert|delete)\s*\(|console\./);
});
