// Replays the included built fixture only. No build, browser, business module,
// credential inspection, DB, or provider is needed. Historical evidence is read-only.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')

const fixture = path.join(__dirname, 'fixture-build')
const bundle = path.join(fixture, 'server/index.mjs')
const provenance = JSON.parse(fs.readFileSync(path.join(__dirname, 'provenance.json')))
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(fs.readFileSync(bundle)), provenance.fixtureBundleSHA256)
const port = Number(process.env.QA_GUARD_FIXTURE_PORT || 3295)
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Choose a valid unprivileged fixture port')
const base = 'http://127.0.0.1:' + port
const output = process.env.QA_GUARD_FIXTURE_OUTPUT
  ? path.resolve(process.env.QA_GUARD_FIXTURE_OUTPUT)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'bagelito-api-guard-replay-'))
assert.ok(output !== __dirname && !output.startsWith(__dirname + path.sep), 'Keep historical evidence unchanged; select an output outside this archive')
fs.mkdirSync(output, {recursive: true})
const report = {startedAt: new Date().toISOString(), kind: 'replay-isolated-built-fixture-only', sourceCommit: provenance.applicationSourceCommit, guardSourceSHA256: provenance.guardSourceSHA256, fixtureBundleSHA256: provenance.fixtureBundleSHA256, base, runs: []}

async function start(flag) {
  const child = spawn(process.execPath, [bundle], {
    cwd: fixture,
    env: {...process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port), BAGELITO_REFERENCE_REVIEW_ONLY: flag},
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = '', listening = false
  const collect = bytes => {logs += bytes; if (logs.includes('Listening on: ' + base)) listening = true}
  child.stdout.on('data', collect); child.stderr.on('data', collect)
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw Error('Fixture process exited before readiness: ' + logs)
      // Do not send a request to a port occupied by an unrelated application.
      if (listening) {
        const response = await fetch(base + '/__ready', {redirect: 'error'})
        const initial = await response.json()
        assert.equal(response.status, 200)
        assert.equal(initial.fixtureDownstream, true)
        return {child, initial, logs: () => logs}
      }
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw Error('Fixture did not become ready')
  } catch (error) {
    if (child.exitCode === null) {child.kill('SIGTERM'); await once(child, 'exit')}
    throw error
  }
}

async function replay() {
  for (const flag of ['true', 'false']) {
    const server = await start(flag), run = {flag, checks: []}
    report.runs.push(run)
    try {
      if (flag === 'true') {
        for (const [method, route] of [['GET','/api'], ['GET','/api/batch'], ['GET','/api/payments/culqi/config'], ['POST','/api/checkout/quote'], ['POST','/api/webhooks/culqi'], ['GET','/%61pi/batch']]) {
          const response = await fetch(base + route, {method, redirect: 'error'})
          assert.equal(response.status, 503, route)
          assert.equal((await response.json()).reviewOnly, true)
          run.checks.push({method, route, status: 503})
        }
        const allowed = await fetch(base + '/images/store-reference-approved.webp', {redirect: 'error'})
        assert.equal(allowed.status, 200)
        assert.equal((await allowed.json()).calls, server.initial.calls + 1)
        run.downstreamCallsFromBlockedAPIs = 0
      } else {
        // These POST/GET requests hit only the included counter stub, never
        // the application's financial handlers or its real /api/catalog.
        for (const method of ['GET', 'POST']) {
          const response = await fetch(base + '/api/catalog', {method, redirect: 'error'})
          assert.equal(response.status, 200)
          assert.equal((await response.json()).fixtureDownstream, true)
          run.checks.push({method, route: '/api/catalog', status: 200})
        }
      }
      run.passed = true
    } finally {
      server.child.kill('SIGTERM')
      await once(server.child, 'exit')
      fs.writeFileSync(path.join(output, 'server-' + flag + '.log'), server.logs())
    }
  }
  report.passed = true
}

replay().catch(error => {report.passed = false; report.error = String(error); process.exitCode = 1}).finally(() => {
  report.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({passed: report.passed, output}))
})
