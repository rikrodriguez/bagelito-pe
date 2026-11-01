/** QA-only rebuilt storefront safety. Install before creating any page.
 * No browser/server launch. drain() is terminal: it freezes new requests and
 * navigates every live document (including legal popups) to about:blank.
 */
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const KEY = 'tsr-scroll-restoration-v1_3'
const PREFIX = '__qaRebuiltCapability:'
const ORIGINAL_SHA256 = '0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const expectedClosure = message => /disposed|(?:page|browser|context).*closed|net::ERR_ABORTED/i.test(message) && !/timeout|timed out/i.test(message)
function decodedPath(url, base) {
  let value = new URL(url, base).pathname
  for (let i = 0; i < 3; i++) { try { const next = decodeURIComponent(value); if (next === value) break; value = next } catch { break } }
  return value.replace(/\\/g, '/')
}
function forbiddenURL(url, base) {
  const pathname = decodedPath(url, base)
  if (/(?:^|\/)api(?:\/|$)/i.test(pathname)) return 'api-path'
  if (/store[-_]reference[-_](?:approved|original)|vitrina[-_]photo|storyboard|(?:^|\/)original(?:[\/._-]|$)/i.test(pathname)) return 'forbidden-source-asset'
  return null
}
function forbiddenEmbeddedSource(value, depth = 0) {
  if (depth > 3) return false
  if (/store[-_]reference[-_](?:approved|original)|vitrina[-_]photo|storyboard|(?:^|\/)original(?:[\/._-]|$)/i.test(value)) return true
  for (const match of value.matchAll(/data:image\/[^,]+,[^\s"')<>]+/gi)) {
    const text = match[0], comma = text.indexOf(','), header = text.slice(0, comma)
    try {
      const body = /;base64/i.test(header) ? Buffer.from(text.slice(comma + 1), 'base64') : Buffer.from(decodeURIComponent(text.slice(comma + 1)))
      if (sha256(body) === ORIGINAL_SHA256) return true
      if (/svg/i.test(header) && forbiddenEmbeddedSource(body.toString('utf8'), depth + 1)) return true
    } catch {}
  }
  return false
}
function auditCapabilityEvents(events) {
  const groups = new Map(), knownFrameworkReads = [], errors = []
  for (const entry of events) {
    const id = String(entry.documentId || 'missing-document')
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(entry)
  }
  for (const [documentId, entries] of groups) {
    entries.sort((a, b) => a.sequence - b.sequence)
    let reads = 0
    for (let i = 0; i < entries.length; i++) {
      const event = entries[i], next = entries[i + 1]
      if (event.kind === 'storage-access' && event.name === 'sessionStorage'
        && next?.kind === 'storage-method' && next.storage === 'sessionStorage'
        && next.name === 'getItem' && next.key === KEY && event.stack && next.stack) {
        reads++
        knownFrameworkReads.push({ documentId, key: KEY, accessStack: event.stack, readStack: next.stack, url: next.url })
        if (reads > 1) errors.push({ documentId, event: next, message: 'More than one exact-key framework read in this document' })
        i++
      } else errors.push({ documentId, event, message: 'Forbidden application capability or unpaired storage access' })
    }
  }
  return { knownFrameworkReads, errors, documentCount: groups.size }
}

function installCapabilityProbe() {
  const prefix = '__qaRebuiltCapability:', key = 'tsr-scroll-restoration-v1_3'
  const documentId = String(performance.timeOrigin) + ':' + Math.random().toString(36).slice(2)
  let sequence = 0, frameworkReads = 0
  const entries = window.__qaRebuiltCapabilities = []
  function emit(event) {
    const entry = { ...event, documentId, sequence: ++sequence, url: location.href }
    entries.push(entry)
    console.debug(prefix + JSON.stringify(entry))
    try { const sent = window.__qaRebuiltSafetyBridge?.(entry); if (sent?.catch) void sent.catch(() => {}) } catch {}
    return entry
  }
  function denied(kind, details = {}) {
    emit({ kind, ...details, stack: new Error().stack })
    throw new DOMException('Forbidden rebuilt-review capability: ' + kind, 'SecurityError')
  }
  function define(object, name, descriptor) {
    try { Object.defineProperty(object, name, descriptor) } catch (error) { emit({ kind: 'instrumentation-error', name, message: String(error) }) }
  }
  function denyMethod(object, name, kind) {
    if (!object || typeof object[name] !== 'function') return
    define(object, name, { configurable: true, writable: true, value: function (...args) {
      return denied(kind, { name, target: typeof args[0] === 'string' ? args[0] : undefined })
    } })
  }
  emit({ kind: 'document-init' })
  if (typeof window.fetch === 'function') define(window, 'fetch', { configurable: true, writable: true, value: function (...args) {
    emit({ kind: 'fetch', target: String(args[0]?.url || args[0]), stack: new Error().stack })
    return Promise.reject(new DOMException('Fetch is disabled in rebuilt review QA', 'SecurityError'))
  } })
  if (typeof XMLHttpRequest !== 'undefined') {
    denyMethod(XMLHttpRequest.prototype, 'open', 'xhr')
    denyMethod(XMLHttpRequest.prototype, 'send', 'xhr-send')
  }
  for (const name of ['WebSocket', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'Worker', 'SharedWorker', 'BroadcastChannel']) {
    if (typeof window[name] !== 'function') continue
    define(window, name, { configurable: true, writable: true, value: new Proxy(window[name], {
      construct(_target, args) { return denied('network-constructor', { name, target: typeof args[0] === 'string' ? args[0] : undefined }) },
      apply(_target, _this, args) { return denied('network-constructor', { name, target: typeof args[0] === 'string' ? args[0] : undefined }) },
    }) })
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    const descriptor = Object.getOwnPropertyDescriptor(window, name)
    if (!descriptor?.get || !descriptor.configurable) { emit({ kind: 'instrumentation-error', name, message: 'Storage getter cannot be observed' }); continue }
    let proxy
    define(window, name, { ...descriptor, get() {
      emit({ kind: 'storage-access', name, stack: new Error().stack })
      const target = descriptor.get.call(this)
      if (!proxy) proxy = new Proxy(target, {
        get(storage, property) {
          if (['getItem', 'setItem', 'removeItem', 'clear', 'key'].includes(property)) return function (...args) {
            emit({ kind: 'storage-method', storage: name, name: property, key: String(args[0] ?? ''), stack: new Error().stack })
            if (name === 'sessionStorage' && property === 'getItem' && args[0] === key && frameworkReads++ === 0) return storage.getItem(args[0])
            throw new DOMException('Application storage is disabled in rebuilt review QA', 'SecurityError')
          }
          return denied('storage-property-read', { storage: name, name: String(property) })
        },
        set(_storage, property) { return denied('storage-property-write', { storage: name, name: String(property) }) },
        deleteProperty(_storage, property) { return denied('storage-property-delete', { storage: name, name: String(property) }) },
        defineProperty(_storage, property) { return denied('storage-property-define', { storage: name, name: String(property) }) },
        ownKeys() { return denied('storage-enumeration', { storage: name }) },
      })
      return proxy
    } })
  }
  for (const name of ['indexedDB', 'caches']) {
    const descriptor = Object.getOwnPropertyDescriptor(window, name)
    if (!descriptor?.get || !descriptor.configurable) {
      if (typeof window[name] !== 'undefined') emit({ kind: 'instrumentation-error', name, message: 'Persistent API getter cannot be observed' })
      continue
    }
    define(window, name, { ...descriptor, get() {
      emit({ kind: 'persistent-api-access', name, stack: new Error().stack })
      const target = descriptor.get.call(this)
      return new Proxy(target, { get(_target, property) { return function () { return denied('persistent-api-call', { name, method: String(property) }) } } })
    } })
  }
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
  if (cookie?.configurable) define(Document.prototype, 'cookie', { ...cookie,
    get() { return denied('cookie-read') }, set() { return denied('cookie-write') },
  })
  else emit({ kind: 'instrumentation-error', name: 'document.cookie', message: 'Cookie capability cannot be observed' })
  denyMethod(navigator, 'sendBeacon', 'beacon')
  const feature = name => { try { return navigator[name] } catch { return undefined } }
  for (const [object, names, kind] of [
    [feature('serviceWorker'), ['register', 'getRegistration', 'getRegistrations'], 'service-worker'],
    [feature('storage'), ['getDirectory', 'persist', 'persisted', 'estimate'], 'storage-manager'],
    [feature('clipboard'), ['read', 'readText', 'write', 'writeText'], 'clipboard'],
    [feature('credentials'), ['get', 'create', 'store', 'preventSilentAccess'], 'credentials'],
    [window, ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker', 'openDatabase'], 'file-or-database'],
    [document, ['hasStorageAccess', 'requestStorageAccess', 'requestStorageAccessFor'], 'storage-access-api'],
  ]) for (const name of names) denyMethod(object, name, kind)
}

async function installSafety(context, base, onFailure) {
  base = new URL(base)
  assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Rebuilt QA requires HTTP loopback')
  assert.ok(!base.username && !base.password, 'Do not put credentials in the loopback URL')
  assert.equal(typeof onFailure, 'function', 'Provide the failure collector')
  const traffic = { reads: [], legalRedirects: [], blocked: [], errors: [], expectedClosingErrors: [], capabilities: [], documents: [], pages: [], pageErrors: [], consoleErrors: [], assets: [], callbackErrors: [] }
  const pending = new Set(), pageRecords = new Map(), seen = new Set(), reported = new Set()
  let closing = false, drainPromise, closePromise
  function fail(entry) {
    traffic.errors.push(entry)
    try { const result = onFailure(entry); if (result?.then) {
      const work = Promise.resolve(result).catch(error => traffic.callbackErrors.push({ message: String(error) }))
      pending.add(work); void work.then(() => pending.delete(work), () => pending.delete(work))
    } } catch (error) { traffic.callbackErrors.push({ message: String(error) }) }
  }
  function routeError(error, entry, allowed) {
    const message = String(error)
    if (closing && allowed && expectedClosure(message)) traffic.expectedClosingErrors.push({ ...entry, message })
    else fail({ kind: 'route-error', ...entry, message })
  }
  function attachPage(page) {
    if (pageRecords.has(page)) return pageRecords.get(page)
    const record = { id: pageRecords.size + 1, url: page.url(), closed: page.isClosed() }
    pageRecords.set(page, record); traffic.pages.push(record)
    page.on('pageerror', error => { const entry = { kind: 'page-error', pageId: record.id, message: error.message }; traffic.pageErrors.push(entry); fail(entry) })
    page.on('console', message => {
      const value = message.text()
      if (message.type() === 'debug' && value.startsWith(PREFIX)) {
        try { collect(JSON.parse(value.slice(PREFIX.length)), page) } catch (error) { fail({ kind: 'capability-trace-error', pageId: record.id, message: String(error) }) }
      } else if (message.type() === 'error' || /(?:content security policy|violates.*(?:csp|content security)|refused to (?:load|connect|execute|frame))/i.test(value)) {
        const entry = { kind: 'console-error', pageId: record.id, message: value }; traffic.consoleErrors.push(entry); fail(entry)
      }
    })
    page.on('crash', () => fail({ kind: 'page-crash', pageId: record.id }))
    page.on('close', () => { record.closed = true })
    return record
  }
  function collect(entry, page) {
    if (!entry || typeof entry.kind !== 'string' || typeof entry.documentId !== 'string' || !Number.isInteger(entry.sequence)) { fail({ kind: 'invalid-capability-trace' }); return }
    const id = entry.documentId + ':' + entry.sequence
    if (seen.has(id)) return
    seen.add(id)
    entry = { ...entry, pageId: attachPage(page).id }
    if (entry.kind === 'document-init') traffic.documents.push(entry)
    else traffic.capabilities.push(entry)
  }
  context.on('page', attachPage)
  if (typeof context.exposeBinding === 'function') await context.exposeBinding('__qaRebuiltSafetyBridge', (source, entry) => collect(entry, source.page))
  await context.addInitScript(installCapabilityProbe)
  for (const page of context.pages()) attachPage(page)
  await context.route('**/*', route => {
    const work = (async () => {
      const request = route.request(), url = request.url(), method = request.method(), target = new URL(url)
      const denied = forbiddenURL(url, base), allowed = method === 'GET' && target.origin === base.origin && !denied
      const entry = { method, url, resourceType: request.resourceType?.() }
      try {
        if (!allowed) {
          const blocked = { ...entry, reason: denied || (method !== 'GET' ? 'non-get' : 'egress') }
          traffic.blocked.push(blocked); fail({ kind: 'forbidden-request', ...blocked }); await route.abort('blockedbyclient'); return
        }
        if (closing) { await route.abort('blockedbyclient'); return }
        const response = await route.fetch({ maxRedirects: 0 }), status = response.status()
        traffic.reads.push({ ...entry, status })
        const location = response.headers?.().location
        const legalRedirect = (status === 301 || status === 308) && entry.resourceType === 'document'
          && target.href === new URL('/legal', base).href && location
          && new URL(location, target).href === new URL('/legal/', base).href
        if (legalRedirect) {
          traffic.legalRedirects.push({ ...entry, status, location: new URL(location, target).href })
          await route.fulfill({ response })
          return
        }
        if (status >= 300) { fail({ kind: 'http-or-redirect-error', ...entry, status }); await route.abort('blockedbyclient'); return }
        const type = response.headers?.()['content-type'] || ''
        if (/image\//i.test(type)) {
          const body = await response.body(), hash = sha256(body)
          traffic.assets.push({ url, contentType: type, sha256: hash })
          if (hash === ORIGINAL_SHA256) { fail({ kind: 'forbidden-original-image-bytes', ...entry, sha256: hash }); await route.abort('blockedbyclient'); return }
          if (/svg/i.test(type) && forbiddenEmbeddedSource(body.toString('utf8'))) { fail({ kind: 'forbidden-source-inside-svg', ...entry }); await route.abort('blockedbyclient'); return }
        }
        await route.fulfill({ response })
      } catch (error) {
        routeError(error, entry, allowed)
        try { await route.abort('blockedbyclient') } catch (abortError) { routeError(abortError, { ...entry, operation: 'abort' }, allowed) }
      }
    })().catch(error => { fail({ kind: 'unexpected-route-handler-error', message: String(error) }); return route.abort('blockedbyclient').catch(abortError => fail({ kind: 'abort-error', message: String(abortError) })) })
    pending.add(work); void work.then(() => pending.delete(work), () => pending.delete(work)); return work
  })
  function auditCapabilities() {
    const audit = auditCapabilityEvents(traffic.capabilities)
    for (const error of audit.errors) {
      const id = error.documentId + ':' + error.event?.sequence + ':' + error.message
      if (!reported.has(id)) { reported.add(id); fail({ kind: 'forbidden-capability', ...error }) }
    }
    if (traffic.pages.length && !traffic.documents.length) fail({ kind: 'missing-capability-instrumentation' })
    traffic.capabilityAudit = audit
    return audit
  }
  async function waitPending() { while (pending.size) await Promise.allSettled([...pending]) }
  async function pull() {
    for (const page of context.pages()) {
      attachPage(page)
      if (page.isClosed()) continue
      for (const frame of page.frames()) try {
        const entries = await frame.evaluate(() => window.__qaRebuiltCapabilities || [])
        for (const entry of entries) collect(entry, page)
        const assets = await frame.evaluate(() => {
          const values = []
          for (const element of document.querySelectorAll('img,image,feImage,use,source,object,embed,video')) for (const name of ['src', 'href', 'xlink:href', 'srcset', 'data', 'poster']) {
            const value = element.getAttribute(name); if (value) values.push({ source: element.tagName + ':' + name, value })
          }
          for (const element of document.querySelectorAll('*')) for (const pseudo of [null, '::before', '::after']) {
            const value = getComputedStyle(element, pseudo).backgroundImage
            if (value && value !== 'none') values.push({ source: element.tagName + ':' + (pseudo || 'background'), value })
          }
          return values
        })
        for (const asset of assets) {
          if (forbiddenEmbeddedSource(asset.value)) fail({ kind: 'forbidden-dom-or-background-source', pageId: pageRecords.get(page).id, ...asset })
        }
      } catch (error) {
        if (closing && (expectedClosure(String(error)) || ((page.isClosed() || frame.isDetached?.()) && /execution context was destroyed/i.test(String(error)) && !/timeout|timed out/i.test(String(error))))) traffic.expectedClosingErrors.push({ operation: 'document-pull', message: String(error) })
        else fail({ kind: 'document-pull-error', message: String(error) })
      }
    }
  }
  function drain() {
    if (!drainPromise) drainPromise = (async () => {
      closing = true
      await waitPending(); await pull()
      const visited = new Set()
      for (let round = 0; round < 5; round++) {
        const pages = context.pages().filter(page => !page.isClosed() && !visited.has(page))
        if (!pages.length) break
        for (const page of pages) {
          visited.add(page)
          if (page.url() === 'about:blank') continue
          try { await page.goto('about:blank', { waitUntil: 'load', timeout: 5000 }) } catch (error) {
            if (expectedClosure(String(error)) && page.isClosed()) traffic.expectedClosingErrors.push({ operation: 'blank-drain', message: String(error) })
            else fail({ kind: 'blank-drain-error', message: String(error) })
          }
        }
        await waitPending(); await pull()
      }
      if (context.pages().some(page => !page.isClosed() && page.url() !== 'about:blank')) fail({ kind: 'unstable-popup-drain' })
      await waitPending()
      return auditCapabilities()
    })()
    return drainPromise
  }
  function close() {
    if (!closePromise) closePromise = (async () => {
      await drain(); closing = true; await waitPending()
      try { await context.close() } catch (error) { fail({ kind: 'context-close-error', message: String(error) }) }
      await waitPending()
      return auditCapabilities()
    })()
    return closePromise
  }
  return { traffic, auditCapabilities, drain, close }
}
module.exports = { installSafety, auditCapabilityEvents, forbiddenURL, forbiddenEmbeddedSource, KEY, ORIGINAL_SHA256 }
