const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const source = fs.readFileSync('src/routes/consulta.tsx', 'utf8')
function setup(enabled) {
  const module = {exports: {}}, headers = new Map()
  const request = new Request('https://fixture.example.test/consulta')
  const code = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText
  vm.runInNewContext(code, {module, exports: module.exports, require(id) {
    if (id === '@tanstack/react-start') return {createServerFn(options) {
      assert.equal(options.method, 'GET'); return {handler: fn => fn}
    }}
    if (id === '@tanstack/react-start/server') return {
      getRequest: () => request, setResponseHeader: (key, value) => headers.set(key.toLowerCase(), value),
    }
    if (id === '../server/manual-inquiry-config.server') return {isManualInquiryPageAllowed(actual) {
      assert.equal(actual, request); return enabled
    }}
    if (id === '@tanstack/react-router') return {createFileRoute: path => {
      assert.equal(path, '/consulta'); return value => value
    }}
    if (id === 'react' || id === 'react/jsx-runtime' || id.endsWith('.css') || id === '../playable/GuidedCommerce') return {}
    throw Error('Unexpected module '+id)
  }})
  return {route: module.exports.Route, headers}
}
for (const enabled of [false, true]) test(`availability ${enabled} returns only a boolean capability and is private/uncached`, async () => {
  const app = setup(enabled), result = await app.route.loader()
  assert.deepEqual(Object.keys(result), ['enabled']); assert.equal(result.enabled, enabled)
  assert.equal(app.headers.get('cache-control'), 'private, no-store, max-age=0')
  assert.equal(app.headers.get('cdn-cache-control'), 'no-store')
})
test('manual document declares private no-store and noindex independently of availability', () => {
  const {route} = setup(false)
  assert.equal(route.headers()['Cache-Control'], 'private, no-store, max-age=0')
  assert.equal(route.headers()['CDN-Cache-Control'], 'no-store')
  assert.ok(route.head().meta.some(meta => meta.name === 'robots' && meta.content === 'noindex,nofollow,noarchive'))
})
