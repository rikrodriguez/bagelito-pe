import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { parseCulqiEventResource, verifyCulqiEventIdentity } from '../../src/lib/payments/verification.ts';
import { resolveVerifiedCulqiChargeCurrency } from '../../src/lib/payments/culqi-event-currency-evidence.ts';

const source = await readFile(new URL('../../src/app/api/webhooks/culqi/route.ts', import.meta.url), 'utf8');
const executable = (value) => stripTypeScriptTypes(value.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const load = new Function('NextResponse', 'fetchCulqiEvent', 'isCulqiRequestAllowed', 'createSupabaseAdminClient',
  'parseCulqiEventResource', 'verifyCulqiEventIdentity', 'console', 'randomUUID', 'process', 'fetchCulqiCharge', 'resolveVerifiedCulqiChargeCurrency', `${executable(source)}; return POST;`);
const eventId = 'evt_test_DIAGNOSTIC001';
const chargeId = 'chr_test_DIAGNOSTIC001';
const marker = 'PRIVATE-fixture@example.invalid sk_test_fixture 4111111111111111 Bearer-fixture cookie-fixture';
const snapshot = JSON.stringify({ schema: 1, commit: 'a'.repeat(40), sourceDigest: 'b'.repeat(64), sourceMatchesCommit: true });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function execute({ received = { object: 'event', id: eventId }, raw, enabled = true,
  fetchError, event = {}, rpcError, clientError, data = { status: 'paid' }, logThrows = false,
  uuid = randomUUID, buildSnapshot = snapshot, headers = {}, jsonError = false } = {}) {
  const logs = [], lookups = [], clients = [], rpc = [];
  let logAttempts = 0, bodyReads = 0;
  const post = load({ json: (payload, init) => ({ payload, ...init }) }, async (id) => {
    lookups.push(id);
    if (fetchError) throw fetchError;
    return { id: eventId, type: 'charge.creation.succeeded', data: { id: chargeId, amount: 12300, currency_code: 'PEN' }, ...event };
  }, () => enabled, () => {
    clients.push(true);
    if (clientError) throw clientError;
    return { rpc: async (name, args) => { rpc.push({ name, args }); if (rpcError) throw rpcError; return { data, error: null }; } };
  }, parseCulqiEventResource, verifyCulqiEventIdentity, { info: (...args) => {
    logAttempts++;
    if (logThrows) throw new Error(marker);
    logs.push(args);
  } }, uuid, { env: { CULQI_WEBHOOK_BUILD_IDENTITY: buildSnapshot } },
  async () => { throw new Error('Unexpected charge GET'); }, resolveVerifiedCulqiChargeCurrency);
  const request = new Request('https://fixture.invalid/api/webhooks/culqi', { method: 'POST',
    body: raw ?? JSON.stringify(received), headers });
  const nativeJson = request.json.bind(request);
  request.json = async () => { bodyReads++; if (jsonError) throw new Error(marker); return nativeJson(); };
  const response = await post(request);
  return { response, logs, diagnostic: logs[0]?.[1], lookups, clients, rpc, logAttempts, bodyReads };
}

test('each concurrent invocation has a server UUID that never enters responses or transactions', async () => {
  const incoming = '11111111-1111-4111-8111-111111111111';
  const results = await Promise.all(Array.from({ length: 12 }, () => execute({
    received: { id: eventId, invocationId: incoming }, headers: { 'x-request-id': incoming, authorization: marker },
  })));
  const ids = results.map(r => r.diagnostic.invocationId);
  for (const r of results) {
    assert.match(r.diagnostic.invocationId, uuidPattern);
    assert.notEqual(r.diagnostic.invocationId, incoming);
    assert.equal(JSON.stringify(r.response).includes(r.diagnostic.invocationId), false);
    assert.equal(JSON.stringify(r.rpc).includes(r.diagnostic.invocationId), false);
    assert.equal(r.bodyReads, 1);
    assert.equal(r.logAttempts, 1);
  }
  assert.equal(new Set(ids).size, results.length);
});

test('scope rejection never reads the body or claims a provider operation', async () => {
  const r = await execute({ enabled: false, raw: '{' });
  assert.equal(r.response.status, 503);
  assert.equal(r.bodyReads, 0);
  assert.equal(r.diagnostic.requestParse, 'not_read');
  assert.equal(r.diagnostic.bodyKind, 'not_read');
  assert.equal(r.diagnostic.lookupResource, 'none');
  assert.equal(r.diagnostic.lookupState, 'not_attempted');
  assert.deepEqual(r.lookups, []); assert.deepEqual(r.clients, []); assert.deepEqual(r.rpc, []);
});

test('direct charges distinguish camel and snake shapes while keeping the existing rejection', async () => {
  for (const [fields, camel, snake] of [
    [{ creationDate: 123, currencyCode: 'PEN' }, true, false],
    [{ creation_date: 123, currency_code: 'PEN' }, false, true],
  ]) {
    const r = await execute({ received: { object: 'charge', id: chargeId, ...fields, email: marker } });
    assert.equal(r.response.status, 400);
    assert.equal(r.diagnostic.requestParse, 'parsed');
    assert.equal(r.diagnostic.bodyKind, 'object');
    assert.equal(r.diagnostic.bodyObject, 'charge');
    assert.equal(r.diagnostic.bodyIdKind, 'chr');
    assert.equal(r.diagnostic.bodyHasCamelFields, camel);
    assert.equal(r.diagnostic.bodyHasSnakeFields, snake);
    assert.equal(r.diagnostic.bodyHasData, false);
    assert.equal(r.diagnostic.bodyDataKind, 'missing');
    assert.equal(r.diagnostic.lookupResource, 'none');
    assert.deepEqual(r.lookups, []); assert.deepEqual(r.clients, []); assert.deepEqual(r.rpc, []);
    assert.equal(JSON.stringify(r.logs).includes(chargeId), false);
    assert.equal(JSON.stringify(r.logs).includes(marker), false);
  }
});

test('outer data kinds are observed once without parsing or trusting caller data', async () => {
  for (const [data, kind] of [[{ id: marker }, 'object'], ['{broken-private', 'string'], [[], 'array'], [null, 'null'], [12, 'other']]) {
    const r = await execute({ received: { object: 'event', id: eventId, data } });
    assert.equal(r.response.status, 200);
    assert.equal(r.diagnostic.bodyHasData, true);
    assert.equal(r.diagnostic.bodyDataKind, kind);
    assert.equal(r.diagnostic.lookupResource, 'events');
    assert.equal(r.diagnostic.lookupIdKind, 'evt');
    assert.equal(r.diagnostic.lookupState, 'returned');
    assert.equal(r.rpc.length, 1);
    assert.equal(r.rpc[0].args.p_resource.id, chargeId);
    assert.equal(r.bodyReads, 1);
  }
});

test('invalid JSON is distinct from parsed null, arrays and primitive bodies without changing HTTP results', async () => {
  for (const [raw, parse, kind, status] of [
    ['{', 'read_or_parse_failed', 'not_read', 500], ['null', 'parsed', 'null', 500],
    ['[]', 'parsed', 'array', 400], ['12', 'parsed', 'other', 400],
    ['true', 'parsed', 'other', 400], ['"private"', 'parsed', 'other', 400],
  ]) {
    const r = await execute({ raw });
    assert.equal(r.response.status, status);
    assert.equal(r.diagnostic.requestParse, parse);
    assert.equal(r.diagnostic.bodyKind, kind);
    assert.equal(r.diagnostic.lookupState, 'not_attempted');
    assert.deepEqual(r.lookups, []); assert.deepEqual(r.clients, []); assert.deepEqual(r.rpc, []);
  }
  const r = await execute({ jsonError: true });
  assert.equal(r.response.status, 500);
  assert.equal(r.diagnostic.requestParse, 'read_or_parse_failed');
});

test('one final diagnostic separates lookup, identity, DB initialization and transaction failures', async () => {
  for (const [options, stage, lookupState, transactionAttempted] of [
    [{ fetchError: Object.assign(new Error(marker), { status: 400 }) }, 'event_lookup', 'failed', false],
    [{ fetchError: new DOMException(marker, 'TimeoutError') }, 'event_lookup', 'failed', false],
    [{ event: { id: 'different' } }, 'event_identity', 'returned', false],
    [{ clientError: new Error(marker) }, 'database_client', 'returned', false],
    [{ rpcError: new Error(marker) }, 'transaction', 'returned', true],
    [{ data: { duplicate: true } }, 'transaction', 'returned', true],
  ]) {
    const r = await execute(options);
    assert.equal(r.diagnostic.stage, stage);
    assert.equal(r.diagnostic.lookupState, lookupState);
    assert.equal(r.diagnostic.lookupResource, 'events');
    assert.equal(r.diagnostic.transactionAttempted, transactionAttempted);
    assert.equal(r.logAttempts, 1);
    assert.equal(r.rpc.length, transactionAttempted ? 1 : 0);
    assert.equal(JSON.stringify(r.logs).includes(marker), false);
  }
});

test('private values in every input position cannot enter any new diagnostic field', async () => {
  for (const received of [
    { object: marker, id: marker, data: marker, creationDate: marker, currency_code: marker },
    { object: { private: marker }, id: { private: marker }, data: { email: marker }, [marker]: marker },
    { id: eventId, type: marker, data: marker, authorization: marker },
  ]) {
    const r = await execute({ received, headers: { authorization: marker, cookie: marker, 'x-request-id': marker },
      event: { data: { id: chargeId, source: { number: marker }, email: marker, metadata: { private: marker } } },
      data: { status: marker, private: marker } });
    const serialized = JSON.stringify(r.logs);
    for (const value of [marker, eventId, chargeId]) assert.equal(serialized.includes(value), false);
    assert.equal(r.diagnostic.diagnosticVersion, 2);
    assert.ok(['event', 'charge', 'other', 'missing'].includes(r.diagnostic.bodyObject));
    assert.ok(['evt', 'chr', 'other', 'missing'].includes(r.diagnostic.bodyIdKind));
  }
});

test('logger failures make one attempt and preserve successful, duplicate and failed outcomes', async () => {
  for (const options of [{}, { data: { duplicate: true } }, { fetchError: new Error(marker) }, { received: { object: 'charge', id: chargeId } }]) {
    const baseline = await execute(options);
    const r = await execute({ ...options, logThrows: true });
    assert.deepEqual(r.response, baseline.response);
    assert.deepEqual(r.lookups, baseline.lookups);
    assert.deepEqual(r.rpc, baseline.rpc);
    assert.equal(r.logAttempts, 1);
  }
});

test('unavailable correlation never derives identifiers from the request or changes settlement', async () => {
  const r = await execute({ uuid: () => { throw new Error(marker); } });
  assert.equal(r.response.status, 200);
  assert.equal(r.rpc.length, 1);
  assert.equal(r.diagnostic.invocationId, null);
  assert.equal(JSON.stringify(r.logs).includes(marker), false);
});

test('build identity logs only validated compiled fields and labels unavailable snapshots', async () => {
  const r = await execute();
  assert.equal(r.diagnostic.buildCommit, 'a'.repeat(40));
  assert.equal(r.diagnostic.buildSourceDigest, 'b'.repeat(64));
  assert.equal(r.diagnostic.buildSourceMatchesCommit, true);
  const sourceOnly = await execute({ buildSnapshot: JSON.stringify({ schema: 1, commit: null,
    sourceDigest: 'b'.repeat(64), sourceMatchesCommit: false }) });
  assert.equal(sourceOnly.diagnostic.buildCommit, null);
  assert.equal(sourceOnly.diagnostic.buildSourceDigest, 'b'.repeat(64));
  assert.equal(sourceOnly.diagnostic.buildSourceMatchesCommit, null);
  const dirty = await execute({ buildSnapshot: JSON.stringify({ schema: 1, commit: 'a'.repeat(40),
    sourceDigest: 'b'.repeat(64), sourceMatchesCommit: false, private: marker }) });
  assert.equal(dirty.diagnostic.buildSourceMatchesCommit, false);
  assert.equal(JSON.stringify(dirty.logs).includes(marker), false);
  for (const buildSnapshot of [undefined, '', '{', marker, JSON.stringify({ schema: 1, commit: marker, sourceDigest: marker, sourceMatchesCommit: marker })]) {
    const r = await execute({ buildSnapshot });
    // An omitted option uses the valid default; explicit absence is tested with blank.
    if (buildSnapshot === undefined) continue;
    assert.equal(r.response.status, 200);
    assert.equal(r.diagnostic.buildCommit, null);
    assert.equal(r.diagnostic.buildSourceDigest, null);
    assert.equal(r.diagnostic.buildSourceMatchesCommit, null);
    assert.equal(JSON.stringify(r.logs).includes(marker), false);
  }
});

const configSource = await readFile(new URL('../../next.config.ts', import.meta.url), 'utf8');
const configBody = stripTypeScriptTypes(configSource.replace(/^import .*;\n/gm, '')).replace(/export default nextConfig;/, 'return nextConfig;');
const loadConfig = new Function('process', 'createHash', 'readFileSync', 'execFileSync', configBody);
function build({ changed, badSha = false, gitThrows = false, fileThrows = false } = {}) {
  const files = [];
  const config = loadConfig({ cwd: () => '/fixture', env: {} }, createHash, (path) => {
    assert.doesNotMatch(path, /\.env|credentials|sessions/);
    files.push(path);
    if (fileThrows) throw new Error(marker);
    return Buffer.from(path === changed ? 'changed-source' : `source:${path}`);
  }, (_command, args) => {
    if (gitThrows) throw new Error(marker);
    if (args[0] === 'rev-parse') return badSha ? marker : 'a'.repeat(40);
    assert.equal(args[0], 'show');
    return Buffer.from(`source:${args[1].slice(41)}`);
  });
  assert.equal(typeof config.env.CULQI_WEBHOOK_BUILD_IDENTITY, 'string');
  return { identity: JSON.parse(config.env.CULQI_WEBHOOK_BUILD_IDENTITY), files };
}

test('build snapshot is deterministic, covers every selected module and detects modified sources', () => {
  const baseline = build();
  assert.match(baseline.identity.sourceDigest, /^[a-f0-9]{64}$/);
  assert.equal(baseline.identity.commit, 'a'.repeat(40));
  assert.equal(baseline.identity.sourceMatchesCommit, true);
  assert.ok(baseline.files.includes('src/app/api/webhooks/culqi/route.ts'));
  assert.ok(baseline.files.includes('src/lib/payments/culqi.ts'));
  assert.ok(baseline.files.includes('src/lib/payments/verification.ts'));
  assert.deepEqual(build().identity, baseline.identity);
  for (const path of baseline.files) {
    const changed = build({ changed: path });
    assert.notEqual(changed.identity.sourceDigest, baseline.identity.sourceDigest);
    assert.equal(changed.identity.sourceMatchesCommit, false);
  }
});

test('missing Git, invalid SHA and unreadable source never invent build identity or expose errors', () => {
  for (const options of [{ gitThrows: true }, { badSha: true }, { fileThrows: true }]) {
    const r = build(options);
    assert.equal(r.identity.commit, null);
    assert.equal(r.identity.sourceMatchesCommit, null);
    if (options.fileThrows) assert.equal(r.identity.sourceDigest, null);
    assert.equal(JSON.stringify(r.identity).includes(marker), false);
  }
});

test('diagnostics-only handler revalidates HTTP param categories without reading raw params or messages', async () => {
  for (const value of ['id', 'environment', 'version', 'authorization', 'other', 'absent',
    marker, undefined, null, ['id'], { private: marker }, 'id ', 'none']) {
    const error = Object.assign(new Error(marker), { status: 400, errorType: 'parameter_error',
      upstreamErrorParam: value, eventIdMatchesDocumentedLength: marker });
    let rawReads = 0;
    for (const key of ['param', 'payload', 'cause']) Object.defineProperty(error, key, {
      get() { rawReads++; throw new Error(marker); },
    });
    const r = await execute({ fetchError: error });
    assert.equal(r.response.status, 500);
    assert.equal(r.diagnostic.upstreamErrorParam,
      ['id', 'environment', 'version', 'authorization', 'other', 'absent'].includes(value) ? value : 'other');
    assert.equal(r.diagnostic.eventIdMatchesDocumentedLength, eventId.length === 25,
      'The handler computes this boolean from its lookup input, never an arbitrary error field');
    assert.equal(r.diagnostic.eventVerified, false);
    assert.equal(r.diagnostic.transactionAttempted, false);
    assert.deepEqual(r.clients, []);
    assert.deepEqual(r.rpc, []);
    assert.equal(rawReads, 0);
    for (const sensitive of [marker, eventId, createHash('sha256').update(eventId).digest('hex')]) {
      assert.equal(JSON.stringify(r.logs).includes(sensitive), false);
      assert.equal(JSON.stringify(r.response).includes(sensitive), false);
    }
  }
  const error = Object.assign(new Error(marker), { status: 400 });
  Object.defineProperty(error, 'upstreamErrorParam', { get() { throw new Error(marker); } });
  const r = await execute({ fetchError: error });
  assert.equal(r.response.status, 500);
  assert.equal(r.diagnostic.upstreamErrorParam, 'other');
  assert.deepEqual(r.clients, []);
  assert.deepEqual(r.rpc, []);
});

test('diagnostics-only lookup context is neutral before lookup and has no provider param on transport failures', async () => {
  for (const options of [{ enabled: false }, { raw: '{' }, { received: { id: chargeId } }]) {
    const r = await execute(options);
    assert.equal(r.diagnostic.eventIdMatchesDocumentedLength, null);
    assert.equal(r.diagnostic.upstreamErrorParam, 'none');
    assert.deepEqual(r.lookups, []);
  }
  for (const fetchError of [new Error(marker), new DOMException(marker, 'TimeoutError')]) {
    let categoryReads = 0;
    Object.defineProperty(fetchError, 'upstreamErrorParam', {
      get() { categoryReads++; throw new Error(marker); },
    });
    const r = await execute({ fetchError });
    assert.equal(r.response.status, 500);
    assert.equal(r.diagnostic.eventIdMatchesDocumentedLength, eventId.length === 25);
    assert.equal(r.diagnostic.upstreamErrorParam, 'none');
    assert.equal(categoryReads, 0);
    assert.equal(r.diagnostic.upstreamHttpStatus, null);
    assert.deepEqual(r.clients, []);
    assert.deepEqual(r.rpc, []);
  }
});
