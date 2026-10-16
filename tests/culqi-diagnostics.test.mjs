import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import {
  CULQI_DIAGNOSTIC_ORIGIN,
  culqiDiagnosticFormScope,
  culqiDiagnosticScope,
  diagnoseCulqiConfiguration,
  inspectRsaSize,
} from '../src/lib/payments/culqi-diagnostics.ts';

// Generated fixtures remain in memory. No provider, database or network is used.
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const weakRsa = generateKeyPairSync('rsa', { modulusLength: 1024 });
const largerRsa = generateKeyPairSync('rsa', { modulusLength: 3072 });
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const rsaPem = rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const weakRsaPem = weakRsa.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const origin = 'https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app';
const database = 'https://qaahskendqdkynwtylho.supabase.co';
const snapshotName = 'CULQI_DIAGNOSTIC_BUILD_PUBLIC_CONFIG';
const keyNames = new Set([
  'NEXT_PUBLIC_CULQI_PUBLIC_KEY', 'CULQI_SECRET_KEY',
  'NEXT_PUBLIC_CULQI_RSA_ID', 'NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY',
]);

function environment(overrides = {}) {
  return {
    VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview',
    VERCEL_PROJECT_ID: 'prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0',
    VERCEL_GIT_COMMIT_REF: 'fix/culqi-payment-coordination-20261012',
    VERCEL_GIT_REPO_OWNER: 'rikrodriguez', VERCEL_GIT_REPO_SLUG: 'bagelito-pe',
    VERCEL_BRANCH_URL: new URL(origin).hostname,
    NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_SUPABASE_URL: database,
    PAYMENT_PROVIDER: 'culqi', CULQI_ENABLED: 'false', CULQI_MODE: 'sandbox',
    CULQI_LIVE_APPROVED: 'false', NODE_ENV: 'production',
    NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_test_fixture123',
    CULQI_SECRET_KEY: 'sk_test_fixture123', NEXT_PUBLIC_CULQI_RSA_ID: 'fixture-rsa-id',
    NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY: rsaPem,
    ...overrides,
  };
}

function bundled(env, overrides = {}) {
  return {
    publicKey: env.NEXT_PUBLIC_CULQI_PUBLIC_KEY,
    rsaId: env.NEXT_PUBLIC_CULQI_RSA_ID,
    rsaPublicKey: env.NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY,
    siteUrl: env.NEXT_PUBLIC_SITE_URL, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    ...overrides,
  };
}

function request({ url = origin, originHeader = origin, method = 'POST', headers = {}, body } = {}) {
  const allHeaders = new Headers(headers);
  if (originHeader !== null) allHeaders.set('origin', originHeader);
  return new Request(url + '/admin/diagnostics/culqi', { method, headers: allHeaders, body });
}

function assertBooleanReport(report) {
  assert.ok(Object.keys(report).length > 0);
  assert.ok(Object.values(report).every(value => typeof value === 'boolean'));
}

const routeSource = await readFile(new URL('../src/app/admin/diagnostics/culqi/route.ts', import.meta.url), 'utf8');
const routeBody = stripTypeScriptTypes(routeSource.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const loadRoute = new Function(
  'requireAdmin', 'culqiDiagnosticFormScope', 'culqiDiagnosticScope', 'diagnoseCulqiConfiguration', 'process', 'console',
  routeBody + ';return {POST,GET,runtime,dynamic,revalidate,fetchCache};',
);
const nextConfigSource = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');
const nextConfigBody = stripTypeScriptTypes(nextConfigSource.replace(/^import .*;\n/gm, ''))
  .replace(/export default nextConfig;/, 'return nextConfig;');
const loadNextConfig = new Function('process', nextConfigBody);
const diagnosticSource = await readFile(new URL('../src/lib/payments/culqi-diagnostics.ts', import.meta.url), 'utf8');
const diagnosticBody = stripTypeScriptTypes(diagnosticSource.replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const loadDiagnostic = new Function('createPublicKey', diagnosticBody + ';return diagnoseCulqiConfiguration;');

function observedKey(key, overrides = {}) {
  return {
    asymmetricKeyType: key.asymmetricKeyType,
    get asymmetricKeyDetails() {
      if (overrides.metadataError) throw new Error('raw-private-metadata-error');
      return Object.hasOwn(overrides, 'metadata') ? overrides.metadata : key.asymmetricKeyDetails;
    },
    export(options) {
      if (options.format === 'jwk') {
        if (overrides.exportError) throw new Error('raw-private-jwk-error');
        if (Object.hasOwn(overrides, 'jwk')) return overrides.jwk;
      }
      return key.export(options);
    },
  };
}

function assertUnverifiedSize(checks) {
  assertBooleanReport(checks);
  assert.equal(checks.rsaSizeMetadataMatchesComputed, false);
  assert.equal(checks.rsaBelow2048Bits, false);
  assert.equal(checks.rsaAtLeast2048Bits, false);
  assert.equal(checks.rsaSizeUnverified, true);
}

async function runRoute({ env = environment(), authenticated = true, req, method = 'POST', failAt } = {}) {
  const reads = [], logs = [], events = [];
  let authenticationComplete = false;
  let diagnoses = 0;
  // Model the public build snapshot independently from runtime env. An explicit
  // undefined/blank override must remain absent/blank to exercise regressions.
  const runtimeEnv = Object.hasOwn(env, snapshotName)
    ? env
    : { ...env, [snapshotName]: JSON.stringify(bundled(env)) };
  const observedEnv = new Proxy(runtimeEnv, {
    get(target, property) {
      assert.equal(authenticationComplete, true, 'environment must not be read before authentication');
      reads.push(property);
      if (property === failAt) throw new Error('raw-private-provider-error');
      return Reflect.get(target, property);
    },
  });
  const route = loadRoute(async () => {
    events.push('auth');
    if (!authenticated) throw new Error('raw-private-auth-error');
    authenticationComplete = true;
  }, culqiDiagnosticFormScope, culqiDiagnosticScope, (...args) => {
    diagnoses++;
    return diagnoseCulqiConfiguration(...args);
  }, { env: observedEnv }, {
    info: (...args) => logs.push(args),
    warn: () => { throw new Error('unexpected warning log'); },
    error: () => { throw new Error('unexpected error log'); },
  });
  const response = await route[method](req ?? request({ method, originHeader: method === 'GET' ? null : origin }));
  const isHtml = response.headers.get('content-type')?.startsWith('text/html');
  const html = isHtml ? await response.text() : undefined;
  const payload = isHtml ? undefined : await response.json();
  return { response, payload, html, reads, logs, events, route, diagnoses };
}

function assertNoStoreHeaders(result, vary = 'Cookie, Origin') {
  assert.equal(result.response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(result.response.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.equal(result.response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(result.response.headers.get('vary'), vary);
  assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');
}

function assertResponse(result, status, ok) {
  assert.equal(result.response.status, status);
  assert.deepEqual(result.payload, { ok });
  assertNoStoreHeaders(result);
  assert.match(result.response.headers.get('content-type'), /^application\/json/);
}

function assertFormResponse(result) {
  assert.equal(result.response.status, 200);
  assertNoStoreHeaders(result, 'Cookie, Origin, Sec-Fetch-Site');
  assert.equal(result.response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(result.response.headers.get('content-security-policy'), "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  assert.equal(result.response.headers.get('referrer-policy'), 'same-origin');
  assert.equal(result.response.headers.get('x-frame-options'), 'DENY');
  assert.equal(result.payload, undefined);
  assert.match(result.html, /^<!doctype html>/i);
  const form = result.html.match(/<form\b([^>]*)>/i);
  assert.ok(form);
  assert.match(form[1], /method="post"/i);
  const action = form[1].match(/\baction="([^"]*)"/);
  assert.ok(action);
  assert.equal(action[1], origin + '/admin/diagnostics/culqi');
  assert.equal(result.html.split(origin).length - 1, 1);
  assert.equal(result.html.replace('action="' + action[1] + '"', 'action=""').includes(origin), false);
  assert.match(result.html, /<button type="submit">/);
  assert.doesNotMatch(result.html, /<script\b|\bon\w+\s*=|<input\b/i);
  for (const value of [
    'pk_test_fixture123', 'sk_test_fixture123', 'fixture-rsa-id', 'BEGIN PUBLIC KEY',
    'offlineConfigurationValid', 'rsaAssociationVerified', 'rsaBelow2048Bits',
    'rsaSizeUnverified', 'rsaCompatibilityUnverified', snapshotName, database,
    'fix/culqi-payment-coordination-20261012', 'prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0',
  ]) assert.equal(result.html.includes(value), false);
  assert.deepEqual(result.logs, []);
  assert.equal(result.diagnoses, 0);
  assert.deepEqual(result.reads.filter(name => keyNames.has(name) || name === snapshotName || name === 'PAYMENT_PROVIDER'), []);
}

test('fixed branch origin and scoped Preview remain valid with production Node runtime', () => {
  assert.equal(CULQI_DIAGNOSTIC_ORIGIN, origin);
  const checks = culqiDiagnosticScope(request(), environment());
  assertBooleanReport(checks);
  assert.ok(Object.values(checks).every(Boolean));
  assert.ok(Object.values(culqiDiagnosticScope(request(), environment({ VERCEL_TARGET_ENV: undefined }))).every(Boolean));
});

test('Next build always embeds a snapshot of public fields even when configuration is absent', () => {
  for (const values of [{}, environment()]) {
    const buildReads = [];
    const config = loadNextConfig({
      cwd: () => '/synthetic-build',
      env: new Proxy(values, {
        get(target, property) {
          buildReads.push(property);
          assert.ok(property.startsWith('NEXT_PUBLIC_'), 'build snapshot must never read a server secret');
          return Reflect.get(target, property);
        },
      }),
    });
    assert.equal(typeof config.env[snapshotName], 'string');
    const snapshot = JSON.parse(config.env[snapshotName]);
    assert.deepEqual(snapshot, {
      publicKey: values.NEXT_PUBLIC_CULQI_PUBLIC_KEY ?? '',
      rsaId: values.NEXT_PUBLIC_CULQI_RSA_ID ?? '',
      rsaPublicKey: values.NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY ?? '',
      siteUrl: values.NEXT_PUBLIC_SITE_URL ?? '',
      supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL ?? '',
    });
    assert.equal(buildReads.includes('CULQI_SECRET_KEY'), false);
  }
});

test('unauthenticated POST and GET cannot read any environment or emit logs', async () => {
  for (const method of ['POST', 'GET']) {
    const result = await runRoute({ authenticated: false, method });
    assertResponse(result, 401, false);
    assert.deepEqual(result.events, ['auth']);
    assert.deepEqual(result.reads, []);
    assert.deepEqual(result.logs, []);
  }
});

test('successful POST authenticates before reads, logs only booleans and keeps results private', async () => {
  const result = await runRoute();
  assertResponse(result, 200, true);
  assert.deepEqual(result.events, ['auth']);
  assert.ok(result.reads.includes('CULQI_SECRET_KEY'));
  assert.equal(result.logs.length, 1);
  assert.equal(result.logs[0][0], 'culqi_configuration_diagnostic');
  assertBooleanReport(result.logs[0][1]);
  assert.equal(result.logs[0][1].offlineConfigurationValid, true);
  assert.equal(result.logs[0][1].rsaAssociationVerified, false);
  assert.equal(result.logs[0][1].rsaCompatibilityUnverified, true);
  assert.equal(result.logs[0][1].rsaSizeMetadataAvailable, true);
  assert.equal(result.logs[0][1].rsaComputedSizeAvailable, true);
  assert.equal(result.logs[0][1].rsaSizeMetadataMatchesComputed, true);
  assert.equal(result.logs[0][1].rsaSizeUnverified, false);
  assert.equal(result.logs[0][1].rsaBelow2048Bits, false);
  assert.equal(result.logs[0][1].checkoutBlockedByFeatureFlag, true);
  assert.equal(result.logs[0][1].diagnosticCompleted, true);
  assert.equal(result.route.runtime, 'nodejs');
  assert.equal(result.route.dynamic, 'force-dynamic');
  assert.equal(result.route.revalidate, 0);
  assert.equal(result.route.fetchCache, 'force-no-store');
});

test('wrong hosting, project, branch, origin, database, mode or flag blocks GET and POST before key reads', async () => {
  const invalidScopes = [
    { VERCEL: undefined }, { VERCEL: '0' }, { VERCEL_ENV: 'production' },
    { VERCEL_ENV: undefined }, { VERCEL_TARGET_ENV: 'staging' },
    { VERCEL_PROJECT_ID: undefined }, { VERCEL_PROJECT_ID: 'prj_other' },
    { VERCEL_GIT_COMMIT_REF: 'main' }, { VERCEL_GIT_COMMIT_REF: undefined },
    { VERCEL_GIT_REPO_OWNER: 'other-owner' }, { VERCEL_GIT_REPO_SLUG: 'other-repository' },
    { VERCEL_BRANCH_URL: 'another-branch.vercel.app' },
    { NEXT_PUBLIC_SITE_URL: undefined }, { NEXT_PUBLIC_SITE_URL: 'https://bagelito.pe' },
    { NEXT_PUBLIC_SITE_URL: origin + ':444' }, { NEXT_PUBLIC_SITE_URL: origin + '/path' },
    { NEXT_PUBLIC_SITE_URL: origin + '?query=1' }, { NEXT_PUBLIC_SITE_URL: origin + '#fragment' },
    { NEXT_PUBLIC_SITE_URL: 'https://user:password@' + new URL(origin).hostname },
    { NEXT_PUBLIC_SUPABASE_URL: undefined },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://other-project.supabase.co' },
    { NEXT_PUBLIC_SUPABASE_URL: database + '/path' },
    { NEXT_PUBLIC_SUPABASE_URL: database + '?query=1' },
    { CULQI_MODE: 'live' }, { CULQI_MODE: undefined }, { CULQI_LIVE_APPROVED: 'true' },
    { CULQI_ENABLED: 'true' }, { CULQI_ENABLED: undefined },
    { CULQI_ENABLED: '' }, { CULQI_ENABLED: 'False' },
  ];
  for (const overrides of invalidScopes) {
    for (const method of ['GET', 'POST']) {
      const result = await runRoute({ env: environment(overrides), method });
      assertResponse(result, 404, false);
      assert.deepEqual(result.reads.filter(name => keyNames.has(name) || name === snapshotName), []);
      assert.deepEqual(result.logs, []);
      assert.equal(result.diagnoses, 0);
    }
  }
});

test('missing, foreign and forged request origins cannot inspect configuration', async () => {
  const otherOrigin = 'https://another-deployment.vercel.app';
  const invalidRequests = [
    request({ originHeader: null }), request({ originHeader: 'null' }),
    request({ originHeader: otherOrigin }), request({ originHeader: origin + ':444' }),
    request({ originHeader: origin.replace('https:', 'http:') }),
    request({ originHeader: origin + '/path' }),
    request({ originHeader: origin + '.evil.invalid' }),
    request({ url: otherOrigin }), request({ url: 'https://bagelito.pe' }),
    request({ url: origin.replace('https:', 'http:') }), request({ url: origin + ':444' }),
    request({ url: otherOrigin, headers: { host: new URL(origin).hostname, 'x-forwarded-host': new URL(origin).hostname, 'x-forwarded-proto': 'https' } }),
  ];
  for (const req of invalidRequests) {
    const result = await runRoute({ req });
    assertResponse(result, 404, false);
    assert.deepEqual(result.reads.filter(name => keyNames.has(name)), []);
    assert.deepEqual(result.logs, []);
  }
});

test('authenticated GET without Origin serves a static form without reading keys or diagnosing', async () => {
  const result = await runRoute({ method: 'GET' });
  assertFormResponse(result);
  assert.deepEqual(result.events, ['auth']);
  for (const failAt of [...keyNames, snapshotName, 'PAYMENT_PROVIDER']) {
    const protectedRead = await runRoute({ method: 'GET', failAt });
    assertFormResponse(protectedRead);
    assert.equal(protectedRead.html, result.html);
  }
  const missingConfiguration = environment({ PAYMENT_PROVIDER: undefined, [snapshotName]: 'malformed-json' });
  for (const name of keyNames) delete missingConfiguration[name];
  const missing = await runRoute({ method: 'GET', env: missingConfiguration });
  assertFormResponse(missing);
  assert.equal(missing.html, result.html);
});

test('GET form action is an absolute HTTPS URL for the same fixed canonical endpoint', async () => {
  const result = await runRoute({ method: 'GET' });
  assertFormResponse(result);
  const action = result.html.match(/<form\b[^>]*\baction="([^"]*)"/i)[1];
  const destination = new URL(action);
  assert.equal(destination.protocol, 'https:');
  assert.equal(destination.hostname, new URL(origin).hostname);
  assert.equal(destination.origin, origin);
  assert.equal(destination.pathname, '/admin/diagnostics/culqi');
  assert.equal(destination.port, '');
  assert.equal(destination.username, '');
  assert.equal(destination.password, '');
  assert.equal(destination.search, '');
  assert.equal(destination.hash, '');
  assert.equal(destination.href, new URL('/admin/diagnostics/culqi', origin).href);
});

test('GET permits direct and same-origin navigation with absent or exact Origin only', async () => {
  for (const originHeader of [null, origin]) {
    for (const fetchSite of [undefined, 'none', 'same-origin']) {
      const headers = fetchSite === undefined ? {} : { 'sec-fetch-site': fetchSite };
      const result = await runRoute({ method: 'GET', req: request({ method: 'GET', originHeader, headers }) });
      assertFormResponse(result);
    }
  }
});

test('GET rejects foreign URL, Origin and fetch metadata without reading diagnostic configuration', async () => {
  const invalidRequests = [
    request({ method: 'GET', originHeader: '' }),
    request({ method: 'GET', originHeader: 'null' }),
    request({ method: 'GET', originHeader: 'https://evil.example.invalid' }),
    request({ method: 'GET', originHeader: origin + ':444' }),
    request({ method: 'GET', originHeader: origin + '/path' }),
    request({ method: 'GET', originHeader: null, url: 'https://bagelito.pe' }),
    request({ method: 'GET', originHeader: null, url: 'https://another-deployment.vercel.app', headers: { 'x-forwarded-host': new URL(origin).hostname } }),
    request({ method: 'GET', originHeader: null, url: origin.replace('https:', 'http:') }),
    request({ method: 'GET', originHeader: null, url: origin + ':444' }),
    request({ method: 'POST', originHeader: origin }),
    ...['cross-site', 'same-site', '', 'invalid', 'none, same-origin'].map(fetchSite => request({
      method: 'GET', originHeader: null, headers: { 'sec-fetch-site': fetchSite },
    })),
  ];
  for (const req of invalidRequests) {
    const result = await runRoute({ method: 'GET', req });
    assertResponse(result, 404, false);
    assert.deepEqual(result.reads.filter(name => keyNames.has(name) || name === snapshotName), []);
    assert.deepEqual(result.logs, []);
    assert.equal(result.diagnoses, 0);
  }
  assert.equal(culqiDiagnosticFormScope(request(), environment()).requestOriginMatches, false);
});

test('ordinary form POST needs exact Origin and retains private boolean diagnostic results', async () => {
  for (const body of [undefined, '', new URLSearchParams()]) {
    const result = await runRoute({ req: request({ body, headers: { 'sec-fetch-site': 'same-origin' } }) });
    assertResponse(result, 200, true);
    assert.equal(result.diagnoses, 1);
    assert.equal(result.logs.length, 1);
    assertBooleanReport(result.logs[0][1]);
    assert.equal(result.logs[0][1].offlineConfigurationValid, true);
  }
  for (const originHeader of [null, 'null', 'https://evil.example.invalid']) {
    const result = await runRoute({ req: request({
      originHeader, body: new URLSearchParams(), headers: { 'sec-fetch-site': 'cross-site' },
    }) });
    assertResponse(result, 404, false);
    assert.deepEqual(result.reads.filter(name => keyNames.has(name) || name === snapshotName), []);
    assert.deepEqual(result.logs, []);
    assert.equal(result.diagnoses, 0);
  }
});

test('GET scope failures remain generic with no HTML, diagnosis or raw error log', async () => {
  const result = await runRoute({ method: 'GET', failAt: 'VERCEL_PROJECT_ID' });
  assertResponse(result, 503, false);
  assert.equal(result.html, undefined);
  assert.deepEqual(result.logs, []);
  assert.equal(result.diagnoses, 0);
});

test('missing Culqi configuration produces only private boolean checks', async () => {
  const env = environment({ PAYMENT_PROVIDER: undefined });
  for (const name of keyNames) delete env[name];
  const result = await runRoute({ env });
  assertResponse(result, 200, true);
  assert.equal(result.logs.length, 1);
  assertBooleanReport(result.logs[0][1]);
  assert.equal(result.logs[0][1].publicTestKeyPresent, false);
  assert.equal(result.logs[0][1].secretTestKeyPresent, false);
  assert.equal(result.logs[0][1].rsaIdPresent, false);
  assert.equal(result.logs[0][1].rsaPublicKeyParseable, false);
  assert.equal(result.logs[0][1].offlineConfigurationValid, false);
  const empty = diagnoseCulqiConfiguration({}, {});
  assertBooleanReport(empty);
  const informationalTrue = new Set(['rsaSizeUnverified', 'rsaCompatibilityUnverified', 'checkoutBlockedByFeatureFlag']);
  for (const [name, value] of Object.entries(empty)) assert.equal(value, informationalTrue.has(name));
});

test('absent or empty public build snapshot cannot fall back to valid runtime keys', async () => {
  const emptyBuild = JSON.stringify({
    publicKey: '', rsaId: '', rsaPublicKey: '', siteUrl: '', supabaseUrl: '',
  });
  for (const snapshot of [undefined, '{}', emptyBuild]) {
    const result = await runRoute({ env: environment({ [snapshotName]: snapshot }) });
    assertResponse(result, 200, true);
    assert.equal(result.logs.length, 1);
    const checks = result.logs[0][1];
    assertBooleanReport(checks);
    assert.equal(checks.publicTestKeyPresent, true);
    assert.equal(checks.secretTestKeyPresent, true);
    assert.equal(checks.rsaIdPresent, true);
    assert.equal(checks.rsaPublicKeyParseable, true);
    assert.equal(checks.rsaAtLeast2048Bits, true);
    for (const name of [
      'publicKeyMatchesBundle', 'rsaIdMatchesBundle', 'rsaPublicKeyMatchesBundle',
      'siteOriginMatchesBundle', 'sandboxDatabaseMatchesBundle',
    ]) assert.equal(checks[name], false);
    assert.equal(checks.offlineConfigurationValid, false);
    assert.equal(checks.rsaAssociationVerified, false);
  }
});

test('malformed or blank JSON build snapshot returns generic 503 without logs or key reads', async () => {
  for (const snapshot of ['', ' ', '{', '{"publicKey":"raw-private-build-error",broken']) {
    const result = await runRoute({ env: environment({ [snapshotName]: snapshot }) });
    assertResponse(result, 503, false);
    assert.deepEqual(result.logs, []);
    assert.deepEqual(result.reads.filter(name => keyNames.has(name)), []);
    assert.equal(JSON.stringify(result.payload).includes('raw-private'), false);
  }
});

test('route diagnoses mismatched build snapshot instead of comparing runtime keys with themselves', async () => {
  const env = environment();
  const staleBuild = bundled(env, {
    publicKey: 'pk_test_another123', rsaId: 'another-rsa-id', rsaPublicKey: weakRsaPem,
    siteUrl: 'https://another-deployment.vercel.app',
    supabaseUrl: 'https://other-project.supabase.co',
  });
  const result = await runRoute({ env: { ...env, [snapshotName]: JSON.stringify(staleBuild) } });
  assertResponse(result, 200, true);
  assert.equal(result.logs.length, 1);
  const checks = result.logs[0][1];
  assertBooleanReport(checks);
  assert.equal(checks.publicTestKeyPresent, true);
  assert.equal(checks.secretTestKeyPresent, true);
  for (const name of [
    'publicKeyMatchesBundle', 'rsaIdMatchesBundle', 'rsaPublicKeyMatchesBundle',
    'siteOriginMatchesBundle', 'sandboxDatabaseMatchesBundle',
  ]) assert.equal(checks[name], false);
  assert.equal(checks.offlineConfigurationValid, false);
});

test('unexpected scope or configuration failures are generic and never logged', async () => {
  for (const failAt of ['VERCEL_PROJECT_ID', 'CULQI_SECRET_KEY']) {
    const result = await runRoute({ failAt });
    assertResponse(result, 503, false);
    assert.deepEqual(result.logs, []);
    assert.equal(JSON.stringify(result.payload).includes('raw-private'), false);
  }
});

test('valid test prefixes do not claim RSA association or require enabling payments', () => {
  const env = environment();
  const checks = diagnoseCulqiConfiguration(env, bundled(env));
  assertBooleanReport(checks);
  assert.equal(checks.publicTestKeyPresent, true);
  assert.equal(checks.secretTestKeyPresent, true);
  assert.equal(checks.offlineConfigurationValid, true);
  assert.equal(checks.rsaAssociationVerified, false);
  assert.equal(checks.rsaCompatibilityUnverified, true);
  assert.equal(checks.rsaSizeUnverified, false);
  assert.equal(checks.rsaBelow2048Bits, false);
  assert.equal(checks.checkoutBlockedByFeatureFlag, true);
  assert.equal(env.CULQI_ENABLED, 'false');
});

test('live, mixed, empty, malformed and oversized keys fail offline preflight', () => {
  for (const overrides of [
    { NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_live_fixture123', CULQI_SECRET_KEY: 'sk_live_fixture123' },
    { NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_live_fixture123' },
    { CULQI_SECRET_KEY: 'sk_live_fixture123' },
    { NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_test_' }, { CULQI_SECRET_KEY: 'sk_test_' },
    { NEXT_PUBLIC_CULQI_PUBLIC_KEY: '' }, { CULQI_SECRET_KEY: undefined },
    { NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_test_fixture\n123' },
    { CULQI_SECRET_KEY: 'sk_test_fixture.invalid' },
    { NEXT_PUBLIC_CULQI_PUBLIC_KEY: 'pk_test_' + 'a'.repeat(4096) },
    { PAYMENT_PROVIDER: 'manual' },
  ]) {
    const env = environment(overrides);
    const checks = diagnoseCulqiConfiguration(env, bundled(env));
    assertBooleanReport(checks);
    assert.equal(checks.offlineConfigurationValid, false);
  }
});

test('RSA rejects private, EC, absent, malformed, certificate and oversized material', () => {
  const invalid = [
    undefined, '', 'synthetic-placeholder',
    rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    rsa.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    ec.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----',
    rsaPem.replaceAll('PUBLIC KEY', 'CERTIFICATE'), rsaPem + '\nextra-data',
    'a'.repeat(16385),
  ];
  for (const pem of invalid) {
    const env = environment({ NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY: pem });
    const checks = diagnoseCulqiConfiguration(env, bundled(env));
    assertBooleanReport(checks);
    assert.equal(checks.rsaPublicKeyParseable, false);
    assert.equal(checks.rsaAtLeast2048Bits, false);
    assert.equal(checks.rsaSizeMetadataAvailable, false);
    assert.equal(checks.rsaComputedSizeAvailable, false);
    assert.equal(checks.rsaBelow2048Bits, false);
    assert.equal(checks.rsaSizeUnverified, true);
    assert.equal(checks.rsaPublicKeyMatchesBundle, false);
    assert.equal(checks.offlineConfigurationValid, false);
  }
});

test('RSA strength is distinct from parseability and PEM encodings compare by public key', () => {
  const weak = environment({ NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY: weakRsaPem });
  const weakChecks = diagnoseCulqiConfiguration(weak, bundled(weak));
  assert.equal(weakChecks.rsaPublicKeyParseable, true);
  assert.equal(weakChecks.rsaPublicKeyMatchesBundle, true);
  assert.equal(weakChecks.rsaAtLeast2048Bits, false);
  assert.equal(weakChecks.rsaSizeMetadataAvailable, true);
  assert.equal(weakChecks.rsaComputedSizeAvailable, true);
  assert.equal(weakChecks.rsaSizeMetadataMatchesComputed, true);
  assert.equal(weakChecks.rsaBelow2048Bits, true);
  assert.equal(weakChecks.rsaSizeUnverified, false);
  assert.equal(weakChecks.offlineConfigurationValid, false);
  const env = environment({ NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY: rsaPem.replaceAll('\n', '\\n') });
  for (const pem of [
    rsa.publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    rsaPem.replaceAll('\n', '\r\n'),
  ]) {
    const checks = diagnoseCulqiConfiguration(env, bundled(env, { rsaPublicKey: pem }));
    assert.equal(checks.rsaPublicKeyParseable, true);
    assert.equal(checks.rsaAtLeast2048Bits, true);
    assert.equal(checks.rsaPublicKeyMatchesBundle, true);
    assert.equal(checks.offlineConfigurationValid, true);
  }
});

test('generated RSA sizes agree across metadata, JWK calculation and supported PEM formats', () => {
  for (const [key, belowMinimum] of [[weakRsa.publicKey, true], [rsa.publicKey, false], [largerRsa.publicKey, false]]) {
    const spki = key.export({ type: 'spki', format: 'pem' }).toString();
    for (const pem of [
      spki, key.export({ type: 'pkcs1', format: 'pem' }).toString(),
      spki.replaceAll('\n', '\r\n'), spki.replaceAll('\n', '\\n'),
    ]) {
      const parsed = createPublicKey(pem.replaceAll('\\n', '\n').trim());
      const size = inspectRsaSize(parsed);
      assertBooleanReport(size);
      assert.equal(size.rsaSizeMetadataAvailable, true);
      assert.equal(size.rsaComputedSizeAvailable, true);
      assert.equal(size.rsaSizeMetadataMatchesComputed, true);
      assert.equal(size.rsaBelow2048Bits, belowMinimum);
      assert.equal(size.rsaAtLeast2048Bits, !belowMinimum);
      assert.equal(size.rsaSizeUnverified, false);
      const env = environment({ NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY: pem });
      const checks = diagnoseCulqiConfiguration(env, bundled(env));
      assertBooleanReport(checks);
      assert.equal(checks.rsaPublicKeyParseable, true);
      assert.equal(checks.rsaPublicKeyMatchesBundle, true);
      assert.equal(checks.offlineConfigurationValid, !belowMinimum);
      assert.equal(checks.rsaCompatibilityUnverified, true);
      assert.equal(checks.rsaAssociationVerified, false);
    }
  }
});

test('missing or invalid RSA size metadata stays unknown even with a computed strong modulus', () => {
  const unavailableMetadata = [
    undefined, null, {}, { modulusLength: undefined }, { modulusLength: null },
    ...[NaN, Infinity, -Infinity, 0, -1, 2048.5, '2048', Number.MAX_SAFE_INTEGER + 1]
      .map(modulusLength => ({ modulusLength })),
  ];
  for (const metadata of unavailableMetadata) {
    const size = inspectRsaSize(observedKey(rsa.publicKey, { metadata }));
    assertUnverifiedSize(size);
    assert.equal(size.rsaSizeMetadataAvailable, false);
    assert.equal(size.rsaComputedSizeAvailable, true);
  }
  const thrownMetadata = inspectRsaSize(observedKey(rsa.publicKey, { metadataError: true }));
  assertUnverifiedSize(thrownMetadata);
  assert.equal(thrownMetadata.rsaSizeMetadataAvailable, false);
  assert.equal(thrownMetadata.rsaComputedSizeAvailable, true);
});

test('missing, invalid or unsupported JWK export never produces a size pass', () => {
  const modulus = rsa.publicKey.export({ format: 'jwk' }).n;
  const invalidJwk = [
    undefined, null, {}, { kty: 'EC', n: modulus },
    ...[undefined, null, '', 123, '!', 'g', 'gA==', 'gA+', 'gA/', 'gB', 'AA']
      .map(n => ({ kty: 'RSA', n })),
  ];
  for (const jwk of invalidJwk) {
    const size = inspectRsaSize(observedKey(rsa.publicKey, { jwk }));
    assertUnverifiedSize(size);
    assert.equal(size.rsaSizeMetadataAvailable, true);
    assert.equal(size.rsaComputedSizeAvailable, false);
  }
  const thrownExport = inspectRsaSize(observedKey(rsa.publicKey, { exportError: true }));
  assertUnverifiedSize(thrownExport);
  assert.equal(thrownExport.rsaSizeMetadataAvailable, true);
  assert.equal(thrownExport.rsaComputedSizeAvailable, false);
  for (const key of [null, ec.publicKey]) {
    const size = inspectRsaSize(key);
    assertUnverifiedSize(size);
    assert.equal(size.rsaSizeMetadataAvailable, false);
    assert.equal(size.rsaComputedSizeAvailable, false);
  }
});

test('disagreeing RSA metadata and computed size cannot classify below or above the minimum', () => {
  for (const [key, modulusLength] of [
    [rsa.publicKey, 1024], [rsa.publicKey, 3072], [weakRsa.publicKey, 2048],
  ]) {
    const size = inspectRsaSize(observedKey(key, { metadata: { modulusLength } }));
    assertUnverifiedSize(size);
    assert.equal(size.rsaSizeMetadataAvailable, true);
    assert.equal(size.rsaComputedSizeAvailable, true);
  }
});

test('computed RSA size counts significant bits rather than bytes or leading zeros', () => {
  for (const [modulusLength, firstByte] of [[2047, 64], [2048, 128]]) {
    const bytes = Buffer.alloc(256);
    bytes[0] = firstByte;
    for (const n of [bytes.toString('base64url'), Buffer.concat([Buffer.from([0, 0]), bytes]).toString('base64url')]) {
      const size = inspectRsaSize(observedKey(rsa.publicKey, {
        metadata: { modulusLength }, jwk: { kty: 'RSA', n },
      }));
      assertBooleanReport(size);
      assert.equal(size.rsaSizeMetadataMatchesComputed, true);
      assert.equal(size.rsaSizeUnverified, false);
      assert.equal(size.rsaBelow2048Bits, modulusLength === 2047);
      assert.equal(size.rsaAtLeast2048Bits, modulusLength === 2048);
    }
  }
});

test('unverified size keeps offline validation false despite parseability and matching bundle', () => {
  const env = environment();
  for (const overrides of [
    { metadata: undefined }, { metadata: {} }, { metadata: { modulusLength: NaN } },
    { metadata: { modulusLength: 1024 } }, { metadataError: true },
    { jwk: { kty: 'RSA', n: '!' } }, { exportError: true },
  ]) {
    const diagnose = loadDiagnostic(pem => observedKey(createPublicKey(pem), overrides));
    const checks = diagnose(env, bundled(env));
    assertUnverifiedSize(checks);
    assert.equal(checks.rsaPublicKeyParseable, true);
    assert.equal(checks.rsaPublicKeyMatchesBundle, true);
    assert.equal(checks.publicTestKeyPresent, true);
    assert.equal(checks.secretTestKeyPresent, true);
    assert.equal(checks.offlineConfigurationValid, false);
    assert.equal(checks.rsaCompatibilityUnverified, true);
    assert.equal(checks.rsaAssociationVerified, false);
    assert.equal(checks.checkoutBlockedByFeatureFlag, true);
  }
});

test('informational negative and unverified flags stay outside the strict offline aggregate', () => {
  for (const flag of [undefined, 'false', 'true']) {
    const env = environment({ CULQI_ENABLED: flag });
    const checks = diagnoseCulqiConfiguration(env, bundled(env));
    assertBooleanReport(checks);
    assert.equal(checks.offlineConfigurationValid, true);
    assert.equal(checks.rsaAtLeast2048Bits, true);
    assert.equal(checks.rsaBelow2048Bits, false);
    assert.equal(checks.rsaSizeUnverified, false);
    assert.equal(checks.rsaCompatibilityUnverified, true);
    assert.equal(checks.rsaAssociationVerified, false);
    assert.equal(checks.checkoutBlockedByFeatureFlag, flag !== 'true');
  }
});

test('RSA ID must be present and bounded without implying panel association', () => {
  for (const rsaId of [undefined, '', ' ', 'bad.id', 'id\nsecond-line', 'a'.repeat(129)]) {
    const env = environment({ NEXT_PUBLIC_CULQI_RSA_ID: rsaId });
    const checks = diagnoseCulqiConfiguration(env, bundled(env));
    assert.equal(checks.rsaIdPresent, false);
    assert.equal(checks.offlineConfigurationValid, false);
    assert.equal(checks.rsaAssociationVerified, false);
  }
});

test('runtime and bundled public key, RSA ID, RSA key, origin and sandbox DB must match', () => {
  const env = environment();
  for (const [overrides, check] of [
    [{ publicKey: 'pk_test_other123' }, 'publicKeyMatchesBundle'],
    [{ publicKey: undefined }, 'publicKeyMatchesBundle'],
    [{ rsaId: 'another-rsa-id' }, 'rsaIdMatchesBundle'],
    [{ rsaId: undefined }, 'rsaIdMatchesBundle'],
    [{ rsaPublicKey: weakRsaPem }, 'rsaPublicKeyMatchesBundle'],
    [{ rsaPublicKey: undefined }, 'rsaPublicKeyMatchesBundle'],
    [{ siteUrl: 'https://bagelito.pe' }, 'siteOriginMatchesBundle'],
    [{ siteUrl: origin + ':444' }, 'siteOriginMatchesBundle'],
    [{ siteUrl: origin + '/path' }, 'siteOriginMatchesBundle'],
    [{ siteUrl: 'https://user:password@' + new URL(origin).hostname }, 'siteOriginMatchesBundle'],
    [{ supabaseUrl: 'https://other-project.supabase.co' }, 'sandboxDatabaseMatchesBundle'],
    [{ supabaseUrl: database + '/path' }, 'sandboxDatabaseMatchesBundle'],
    [{ supabaseUrl: database + '?query=1' }, 'sandboxDatabaseMatchesBundle'],
  ]) {
    const checks = diagnoseCulqiConfiguration(env, bundled(env, overrides));
    assertBooleanReport(checks);
    assert.equal(checks[check], false);
    assert.equal(checks.offlineConfigurationValid, false);
  }
  for (const overrides of [
    { NEXT_PUBLIC_SITE_URL: 'https://bagelito.pe' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://other-project.supabase.co' },
  ]) {
    const checks = diagnoseCulqiConfiguration(environment(overrides), bundled(env));
    assert.equal(checks.offlineConfigurationValid, false);
  }
});
