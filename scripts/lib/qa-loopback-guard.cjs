/** QA HTTP guard. Use an isolated context with serviceWorkers: 'block'.
 * No browser/application hooks, credentials or provider traffic are required.
 */
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createHash } = require('node:crypto')

const HDR_URL = 'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr'
const HDR_SHA256 = 'a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

function readPinnedHDR(path) {
  assert.ok(typeof path === 'string' && path.trim(), 'Provide QA_HDR_FIXTURE_PATH with the approved offline HDR')
  const hdr = readFileSync(path)
  assert.equal(hash(hdr), HDR_SHA256, 'The offline HDR must match the exact approved fixture')
  return hdr
}

async function installLoopbackGuard(context, { base, hdr, onFailure, onEvent = () => {} }) {
  const origin = new URL(base)
  assert.ok(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'The QA guard requires HTTP loopback')
  assert.ok(!origin.username && !origin.password, 'The QA loopback URL must not contain credentials')
  assert.ok(Buffer.isBuffer(hdr), 'Provide the pinned local HDR buffer')
  assert.equal(hash(hdr), HDR_SHA256, 'The guard will only fulfill the approved HDR bytes')
  assert.equal(typeof onFailure, 'function', 'Provide onFailure so guarded errors fail the runner')

  const pending = new Set()
  const traffic = {
    reads: [], fixtureReads: 0, blocked: [], httpErrors: [], routeErrors: [],
    closingRouteErrors: [], closingAborts: [], failures: [], callbackErrors: [],
  }
  let closing = false, closed = false, closePromise

  function fail(type, details = {}) {
    const entry = { type, phase: closing ? 'closing' : 'active', ...details }
    traffic.failures.push(entry)
    try { onFailure(entry) } catch (error) {
      const callback = { type: 'failure-callback-error', phase: entry.phase, message: String(error) }
      traffic.callbackErrors.push(callback)
      traffic.failures.push(callback)
    }
    return entry
  }
  function emit(type, details = {}) {
    try { onEvent({ type, ...details }) } catch (error) {
      const callback = { type: 'event-callback-error', message: String(error) }
      traffic.callbackErrors.push(callback)
      fail(callback.type, callback)
    }
  }
  function routeError(error, entry, allowedGet) {
    const value = { ...entry, message: String(error) }
    const expected = closing && allowedGet
      && /disposed|(?:page|browser|context).*closed|net::ERR_ABORTED/i.test(value.message)
      && !/timeout|timed out/i.test(value.message)
    if (expected) traffic.closingRouteErrors.push(value)
    else {
      traffic.routeErrors.push(value)
      fail('route-error', value)
      emit('route-error', value)
    }
  }
  async function abort(route, entry, allowedGet) {
    try { await route.abort('blockedbyclient') } catch (error) {
      routeError(error, { ...entry, operation: 'abort' }, allowedGet)
    }
  }
  async function handle(route) {
    const request = route.request(), url = request.url(), method = request.method()
    const localGet = method === 'GET' && new URL(url).origin === origin.origin
    const fixtureGet = method === 'GET' && url === HDR_URL
    const entry = { method, url }, allowedGet = localGet || fixtureGet
    if (closing) {
      traffic.closingAborts.push(entry)
      if (!allowedGet) {
        const blocked = { ...entry, reason: 'forbidden-during-close' }
        traffic.blocked.push(blocked)
        fail('request-forbidden', blocked)
      }
      await abort(route, entry, allowedGet)
      return
    }
    try {
      if (localGet) {
        const response = await route.fetch({ maxRedirects: 0 })
        const read = { ...entry, status: response.status() }
        traffic.reads.push(read)
        if (read.status >= 400) {
          traffic.httpErrors.push(read)
          fail('local-http-error', read)
        }
        if (read.status >= 300 && read.status < 400) {
          const blocked = { ...read, reason: 'redirect' }
          traffic.blocked.push(blocked)
          fail('redirect-forbidden', blocked)
          await abort(route, entry, true)
          return
        }
        await route.fulfill({ response })
        return
      }
      if (fixtureGet) {
        traffic.fixtureReads++
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' },
          body: hdr,
        })
        return
      }
      traffic.blocked.push(entry)
      fail('request-forbidden', entry)
      await abort(route, entry, false)
    } catch (error) {
      routeError(error, entry, allowedGet)
      await abort(route, entry, allowedGet)
    }
  }
  await context.route('**/*', route => {
    // A fulfilled/aborted route can reject after context disposal. Catch the
    // returned promise itself, not just the synchronous route method call.
    const work = handle(route).catch(async error => {
      routeError(error, { operation: 'unexpected-handler-error' }, false)
      await abort(route, { operation: 'abort-after-unexpected-error' }, false)
    })
    pending.add(work)
    void work.then(() => pending.delete(work), () => pending.delete(work))
    return work
  })
  const drain = async () => {
    while (pending.size) await Promise.allSettled([...pending])
  }
  function close() {
    if (!closePromise) closePromise = (async () => {
      closing = true
      emit('context-closing', { pendingRoutes: pending.size })
      await drain()
      try { await context.close() } catch (error) {
        fail('context-close-error', { message: String(error) })
      }
      await drain()
      closed = true
      emit('context-closed', { routeErrors: traffic.routeErrors.length, closingRouteErrors: traffic.closingRouteErrors.length })
      return traffic
    })()
    return closePromise
  }
  return { traffic, close, state: () => ({ closing, closed, pendingRoutes: pending.size }) }
}

module.exports = { HDR_URL, HDR_SHA256, readPinnedHDR, installLoopbackGuard }
