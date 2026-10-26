// Real Next.js HTTP boundary with synthetic sessions kept only in memory.
// The temporary runtime has no .env files and rejects every external fetch.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app';
const host = new URL(origin).host;
const manifest = JSON.parse(await readFile(path.join(root, '.next/server/server-reference-manifest.json'), 'utf8'));
const action = Object.entries(manifest.node).find(([, entry]) =>
  entry.filename === 'app/admin/actions.ts' && entry.exportedName === 'runCulqiReadonlyDiagnostic');
assert.ok(action, 'Build must include the administrative diagnostic action.');
const actionId = action[0];
const coreSource = await readFile(path.join(root, 'src/lib/payments/culqi-readonly-diagnostic.ts'), 'utf8');
const privateMarkers = ['culqi_readonly_dryrun', 'sourceMatchesPersisted', 'merchantAssociationVerified',
  ...Array.from(coreSource.matchAll(/chargeId: "([^"]+)"/g), (match) => match[1])];
assert.equal(privateMarkers.length, 6);
async function verifyClientBundle(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await verifyClientBundle(file);
    else if (entry.isFile() && /\.(?:js|map|json)$/.test(entry.name)) {
      const source = await readFile(file, 'utf8');
      assert.ok(!privateMarkers.some((marker) => source.includes(marker)), 'Private diagnostic material must remain outside the client bundle.');
    }
  }
}
await verifyClientBundle(path.join(root, '.next/static'));
const password = `LocalFixture-${randomBytes(20).toString('hex')}`;
const secret = randomBytes(32).toString('hex');
const sessionSource = stripTypeScriptTypes((await readFile(path.join(root, 'src/lib/admin/session-security.ts'), 'utf8'))
  .replace(/^import .*;\n/gm, '')).replace(/export /g, '');
const issue = new Function('createHmac', 'randomBytes', 'timingSafeEqual', 'hasStrongAdminPassword',
  `${sessionSource}; return issueAdminSession;`)(createHmac, randomBytes, timingSafeEqual,
  (value) => typeof value === 'string' && value.trim().length >= 16 && value.length <= 1024);
const cookie = issue(password, secret, origin);
assert.ok(cookie); // Never print or persist the synthetic cookie.

const baseEnv = {
  PATH: process.env.PATH, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: secret,
  NEXT_PUBLIC_SITE_URL: origin,
  NEXT_PUBLIC_SUPABASE_URL: 'https://qaahskendqdkynwtylho.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
  NEXT_PUBLIC_CULQI_PUBLIC_KEY: '', CULQI_SECRET_KEY: '',
  NEXT_PUBLIC_CULQI_RSA_ID: '', NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY: '',
  PAYMENT_PROVIDER: 'culqi', CULQI_MODE: 'sandbox', CULQI_ENABLED: 'true', CULQI_LIVE_APPROVED: 'false',
  VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview',
  VERCEL_PROJECT_ID: 'prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0',
  VERCEL_GIT_COMMIT_REF: 'fix/culqi-payment-coordination-20261012',
  VERCEL_GIT_REPO_OWNER: 'rikrodriguez', VERCEL_GIT_REPO_SLUG: 'bagelito-pe',
  VERCEL_BRANCH_URL: host,
};

function call(port, { method = 'POST', authenticated = true, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port, path: '/admin', method,
      headers: Object.fromEntries(Object.entries({ host, origin, 'x-forwarded-host': host, 'x-forwarded-proto': 'https',
        'sec-fetch-site': 'same-origin', 'next-action': actionId,
        'content-type': 'text/plain;charset=UTF-8', ...(authenticated ? { cookie: `bagelito_admin=${cookie}` } : {}),
        ...headers }).filter(([, value]) => value !== undefined)), timeout: 5000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('Local HTTP fixture timeout.')));
    request.end(method === 'POST' ? '[]' : undefined);
  });
}

async function runtime(overrides, run) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'culqi-readonly-http-'));
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  await symlink(path.join(root, '.next'), path.join(temporary, '.next'));
  await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'));
  await writeFile(path.join(temporary, 'package.json'), '{"private":true}');
  const guard = path.join(temporary, 'deny-external-fetch.cjs');
  await writeFile(guard, `global.fetch = async () => {
    process.stdout.write('readonly_http_external_fetch_blocked\\n');
    throw new Error('External fetch is prohibited in the local HTTP fixture.');
  };`);
  const processHandle = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'),
    'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: temporary, env: { ...baseEnv, ...overrides, NODE_OPTIONS: `--require ${guard}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  processHandle.stdout.on('data', (chunk) => { output += chunk; });
  processHandle.stderr.on('data', (chunk) => { output += chunk; });
  try {
    const deadline = Date.now() + 15_000;
    while (!output.includes('Ready in')) {
      if (processHandle.exitCode !== null || Date.now() >= deadline) throw new Error('Local Next runtime failed to start.');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await run(port, () => output);
    assert.doesNotMatch(output, /readonly_http_external_fetch_blocked/);
    assert.ok(!output.includes(cookie) && !output.includes(password) && !output.includes(secret), 'Fixture credentials must not appear in logs.');
  } finally {
    processHandle.kill('SIGTERM');
    await new Promise((resolve) => {
      if (processHandle.exitCode !== null) resolve();
      else processHandle.once('exit', resolve);
    });
    await rm(temporary, { recursive: true, force: true });
  }
}

function blocked(response) {
  assert.equal(response.status, 200);
  assert.match(response.body, /"ok":false/);
  assert.match(response.body, /"f":""/, 'Diagnostic fetch actions must skip dashboard rendering.');
  assert.match(response.headers['cache-control'], /no-store/);
  assert.doesNotMatch(response.body, /pk_test_|sk_test_|chr_test_|evt_test_|sourceMatches|payment_charge|culqi_readonly_dryrun|raw-private/);
  assert.ok(!response.body.includes(cookie) && !response.body.includes(password) && !response.body.includes(secret));
}

await runtime({}, async (port, logs) => {
  blocked(await call(port, { authenticated: false }));
  assert.doesNotMatch(logs(), /culqi_readonly_dryrun/);
  blocked(await call(port)); // Missing keys, no database/provider access.
  const logDeadline = Date.now() + 1000;
  while (!logs().includes('culqi_readonly_dryrun') && Date.now() < logDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.match(logs(), /culqi_readonly_dryrun/);
  assert.match(logs(), /stage:\s*'test_keys'/, 'Authenticated native action must reach the real core key preflight.');
  blocked(await call(port, { headers: { origin: undefined } }));
  blocked(await call(port, { headers: { host: 'wrong.example' } })); // Native proxy match cannot bypass our Host gate.
  blocked(await call(port, { headers: { 'sec-fetch-site': 'cross-site' } }));
  blocked(await call(port, { headers: { 'x-forwarded-proto': 'http' } }));
  const csrf = await call(port, { headers: { origin: 'https://wrong.example' } });
  assert.equal(csrf.status, 500); // Real Next.js rejects Origin/Host before the action.
  assert.match(csrf.headers['cache-control'], /no-store/);
  assert.doesNotMatch(csrf.body, /Invalid Server Actions request|stack|sk_test_|chr_test_/);
});
await runtime({ VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production' }, async (port) => blocked(await call(port)));
await runtime({ VERCEL_PROJECT_ID: '', NEXT_PUBLIC_SUPABASE_URL: '' }, async (port) => blocked(await call(port)));
console.log('PASS: native HTTP auth, CSRF, exact origin, production and absent configuration; zero external fetches, no credential output.');
