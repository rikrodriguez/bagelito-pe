const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const moduleFixture = {exports: {}}
const source = fs.readFileSync('src/server/manual-inquiry-config.server.ts', 'utf8')
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText, {module: moduleFixture, exports: moduleFixture.exports, URL, process: {env: {}}})
const {isManualInquiryPageAllowed: allowed} = moduleFixture.exports
const request = new Request('https://manual.example.test/consulta')
const env = {BAGELITO_MANUAL_INQUIRY_ENABLED: 'true', BAGELITO_MANUAL_INQUIRY_ORIGIN: 'https://manual.example.test'}

test('manual route is closed by default, with payments enabled or any non-exact opt-in', () => {
  assert.equal(allowed(request), false)
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true ']) {
    assert.equal(allowed(request, {...env, BAGELITO_MANUAL_INQUIRY_ENABLED: value, CULQI_ENABLED: 'true', CULQI_LIVE_APPROVED: 'true'}), false)
  }
})
test('only an explicit contact-only flag plus exact HTTPS origin enables the route', () => {
  assert.equal(allowed(request, env), true)
  assert.equal(allowed(request, {...env, BAGELITO_MERCHANT_REVIEW_ONLY: 'true', BAGELITO_REFERENCE_REVIEW_ONLY: 'true'}), true)
  assert.equal(allowed(request, {...env, BAGELITO_MANUAL_INQUIRY_ORIGIN: 'https://manual.example.test/'}), true)
  assert.equal(allowed(new Request('https://other.example.test/consulta'), env), false)
  assert.equal(allowed(new Request('https://manual.example.test.evil.test/consulta'), env), false)
  assert.equal(allowed(new Request('https://manual.example.test:444/consulta'), env), false)
  assert.equal(allowed(new Request('http://manual.example.test/consulta'), env), false)
})
test('malformed, credentialed, insecure and non-origin configuration fails closed', () => {
  for (const origin of [undefined, '', 'manual.example.test', 'http://manual.example.test', 'https://name:secret@manual.example.test',
    'https://manual.example.test/consulta', 'https://manual.example.test?x=1', 'https://manual.example.test#fragment', 'null', '*']) {
    assert.equal(allowed(request, {...env, BAGELITO_MANUAL_INQUIRY_ORIGIN: origin}), false, String(origin))
  }
})
test('forwarded headers cannot enable an unapproved request origin', () => {
  const other = new Request('https://other.example.test/consulta', {headers: {
    host: 'manual.example.test', 'x-forwarded-host': 'manual.example.test', origin: 'https://manual.example.test',
  }})
  assert.equal(allowed(other, env), false)
})
test('HTTP is allowed only on an explicitly configured loopback development origin', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const origin = 'http://' + host + ':3280'
    const local = {...env, BAGELITO_MANUAL_INQUIRY_ORIGIN: origin}
    assert.equal(allowed(new Request(origin + '/consulta'), local), true)
    assert.equal(allowed(new Request('https://manual.example.test/consulta'), local), false)
  }
  for (const host of ['127.0.0.2', 'localhost.evil.test', '0.0.0.0', '192.168.1.1']) {
    const origin = 'http://' + host + ':3280'
    assert.equal(allowed(new Request(origin + '/consulta'), {...env, BAGELITO_MANUAL_INQUIRY_ORIGIN: origin}), false)
  }
})
