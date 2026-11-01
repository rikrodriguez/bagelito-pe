/** Read-only physical-mesh visibility study; real R3F scene, no application hooks.
 * Loopback GETs plus the approved offline HDR only. Default: schmears at three sizes.
 * QA_PHYSICAL_WIDTH=390 selects a single first capture without changing criteria.
 */
const assert = require('node:assert/strict')
const { readFileSync, writeFileSync, mkdirSync, renameSync } = require('node:fs')
const { resolve } = require('node:path')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { readPinnedHDR, installLoopbackGuard } = require('./lib/qa-loopback-guard.cjs')

function readPhysicalScene() {
  const canvas = document.querySelector('.playable-shell canvas')
  if (!canvas?.isConnected) throw Error('A connected real Canvas is required')
  const isState = s => s?.scene?.isScene && s?.camera?.isCamera && s?.gl?.domElement === canvas && typeof s?.raycaster?.setFromCamera === 'function'
  let state, access = null
  const direct = canvas.__r3f?.root?.getState?.()
  if (isState(direct)) { state = direct; access = 'canvas.__r3f.root.getState' }
  const key = Object.getOwnPropertyNames(canvas).find(k => k.startsWith('__reactFiber$'))
  const queue = key ? [canvas[key]] : [], visited = new Set()
  while (!state && queue.length && visited.size < 200) {
    const fiber = queue.shift()
    if (!fiber || visited.has(fiber)) continue
    visited.add(fiber)
    let hook = fiber.memoizedState, count = 0
    const hooks = new Set()
    while (hook && typeof hook === 'object' && !hooks.has(hook) && count++ < 100) {
      hooks.add(hook)
      const candidate = hook.memoizedState?.current
      if (isState(candidate)) { state = typeof candidate.get === 'function' ? candidate.get() : candidate; access = 'canvas React fiber ancestor existing rootState ref'; break }
      hook = hook.next
    }
    queue.push(fiber.return, fiber.alternate)
  }
  if (!isState(state) || !state.internal?.active) throw Error('Live R3F camera/scene/store could not be read from existing refs')
  const { scene, camera } = state, rect = canvas.getBoundingClientRect(), meshes = []
  scene.traverseVisible(o => { if (o.isMesh && o.layers.test(camera.layers)) meshes.push(o) })
  const vector = (x = 0, y = 0, z = 0) => camera.position.clone().set(x, y, z)
  const world = (o, p = [0, 0, 0]) => vector(...p).applyMatrix4(o.matrixWorld)
  const project = p => {
    const view = p.clone().applyMatrix4(camera.matrixWorldInverse), ndc = p.clone().project(camera)
    const x = rect.x + (ndc.x + 1) * rect.width / 2, y = rect.y + (1 - ndc.y) * rect.height / 2
    const front = view.z < -camera.near && ndc.z >= -1 && ndc.z <= 1
    return { x, y, ndc: ndc.toArray(), cameraDepth: -view.z, front, inside: front && x >= rect.x - .5 && x <= rect.right + .5 && y >= rect.y - .5 && y <= rect.bottom + .5 }
  }
  const ray = new state.raycaster.constructor()
  ray.layers.mask = camera.layers.mask
  ray.near = camera.near; ray.far = camera.far
  function material(hit) {
    const m = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex || 0] : hit.object.material
    const opacity = m?.opacity ?? 1, transmission = m?.transmission ?? 0
    return { type: m?.type, visible: m?.visible !== false, color: m?.color?.getHexString(), opacity, transparent: !!m?.transparent, transmission, alphaTest: m?.alphaTest || 0, hasAlphaMap: !!m?.alphaMap, hasMap: !!m?.map, depthWrite: m?.depthWrite,
      solid: m?.visible !== false && opacity >= .8 && transmission <= .1 }
  }
  const describe = hit => ({ uuid: hit.object.uuid, name: hit.object.name || null, type: hit.object.type, geometry: hit.object.geometry?.type, parameters: hit.object.geometry?.parameters,
    localPosition: hit.object.position.toArray(), worldPosition: world(hit.object).toArray(), distance: hit.distance, point: hit.point.toArray(), uv: hit.uv?.toArray(), material: material(hit),
    ancestors: (() => { const a = []; for (let o = hit.object.parent; o && a.length < 5; o = o.parent) a.push({ name: o.name || null, type: o.type, position: o.position.toArray(), rotation: o.rotation.toArray().slice(0, 3) }); return a })() })
  const allHits = screen => { ray.setFromCamera({ x: (screen.x - rect.x) / rect.width * 2 - 1, y: 1 - (screen.y - rect.y) / rect.height * 2 }, camera); return ray.intersectObjects(meshes, false) }
  const belongs = (object, group) => { for (let o = object; o; o = o.parent) if (o === group) return true; return false }
  function sample(screen, cream, group) {
    ray.setFromCamera({ x: (screen.x - rect.x) / rect.width * 2 - 1, y: 1 - (screen.y - rect.y) / rect.height * 2 }, camera)
    const target = ray.intersectObjects(cream, false)[0]
    if (!target) return { screen, intersectsCream: false }
    const hits = allHits(screen), before = hits.filter(h => h.distance < target.distance - .001), blockers = before.filter(h => material(h).solid)
    return { screen, intersectsCream: true, inside: screen.inside, visibleCream: screen.inside && !blockers.length, target: describe(target),
      firstSolidBlocker: blockers.length ? { ...describe(blockers[0]), sameBowl: belongs(blockers[0].object, group) } : null,
      transparentBefore: before.filter(h => !material(h).solid).map(describe) }
  }
  function bounds(objects) {
    const points = []
    for (const o of objects) {
      const p = o.geometry?.attributes?.position
      if (!p) continue
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < p.count; i++) for (let a = 0; a < 3; a++) { const v = a === 0 ? p.getX(i) : a === 1 ? p.getY(i) : p.getZ(i); lo[a] = Math.min(lo[a], v); hi[a] = Math.max(hi[a], v) }
      for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) points.push(project(world(o, [x, y, z])))
    }
    return { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)), points }
  }
  const bodies = meshes.filter(o => o.geometry?.type === 'CylinderGeometry' && Math.abs(o.geometry.parameters.radiusTop - .41) < .0001 && Math.abs(o.geometry.parameters.radiusBottom - .34) < .0001 && Math.abs(o.geometry.parameters.height - .19) < .0001)
  const bowls = bodies.map(body => {
    const group = body.parent, cream = group.children.filter(o => o.isMesh && o !== body && !(o.geometry?.type === 'TorusGeometry' && Math.abs(o.geometry.parameters.radius - .395) < .0001)), sphere = cream.find(o => o.geometry?.type === 'SphereGeometry' && Math.abs(o.geometry.parameters.radius - .345) < .0001)
    if (!sphere) throw Error('Each bowl must expose its real cream surface')
    const centre = sample(project(world(sphere)), cream, group), b = bounds(cream), samples = []
    for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
      const x = b.x + (col + .5) * (b.right - b.x) / 5, y = b.y + (row + .5) * (b.bottom - b.y) / 5
      const s = sample({ x, y, inside: x >= rect.x && x <= rect.right && y >= rect.y && y <= rect.bottom }, cream, group)
      if (s.intersectsCream) samples.push(s)
    }
    return { bodyUUID: body.uuid, groupPosition: world(group).toArray(), centre, projectedBounds: b, sampledCreamPoints: samples.length, visibleCreamPoints: samples.filter(s => s.visibleCream).length,
      visibleCreamFraction: samples.length ? samples.filter(s => s.visibleCream).length / samples.length : null, samples }
  }).sort((a, b) => b.groupPosition[1] - a.groupPosition[1] || a.groupPosition[0] - b.groupPosition[0])
  const logos = meshes.filter(o => o.name === 'approved-reference-logo-crop')
  if (logos.length !== 1) throw Error('Exactly one active approved-reference-logo-crop mesh is required')
  const logo = logos[0], pos = logo.geometry.attributes.position, seen = new Set(), corners = []
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)], key = p.join(',')
    if (!seen.has(key)) { seen.add(key); corners.push({ local: p, world: world(logo, p).toArray(), ...project(world(logo, p)) }) }
  }
  const logoBounds = bounds([logo]), width = logoBounds.right - logoBounds.x, height = logoBounds.bottom - logoBounds.y
  const clippedWidth = Math.max(0, Math.min(logoBounds.right, rect.right) - Math.max(logoBounds.x, rect.x)), clippedHeight = Math.max(0, Math.min(logoBounds.bottom, rect.bottom) - Math.max(logoBounds.y, rect.y))
  return { access, sceneActive: state.internal.active, elapsed: state.clock.elapsedTime, canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, meshCount: meshes.length,
    camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far },
    bowls, clearCreamCentres: bowls.filter(b => b.centre.intersectsCream && b.centre.visibleCream).length,
    logo: { uuid: logo.uuid, name: logo.name, position: world(logo).toArray(), corners, insideCorners: corners.filter(p => p.inside).length, bounds: logoBounds, viewportFraction: width > 0 && height > 0 ? clippedWidth * clippedHeight / (width * height) : null },
    materialPolicy: { solidMinOpacity: .8, solidMaxTransmission: .1, distanceEpsilonWorld: .001, alphaTextureLimit: 'Raycaster does not sample alpha texture texels; any alpha-tested/map blocker is recorded with UV and must be reviewed.' } }
}

async function main() {
  const repo = resolve(__dirname, '..'), hash = b => createHash('sha256').update(b).digest('hex'), base = new URL(process.env.BASE_URL || 'http://127.0.0.1:4173')
  assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'HTTP loopback only')
  const hdr = readPinnedHDR(process.env.QA_HDR_FIXTURE_PATH), output = resolve(process.env.QA_OUTPUT || resolve(repo, 'qa-artifacts/physical-vitrina'))
  mkdirSync(output, { recursive: true })
  const files = ['src/playable/PlayableStore.tsx', 'src/playable/StoreArchitectureVisual.tsx', 'src/playable/GuidedCommerce.tsx', 'src/playable/guided-commerce.css', 'src/playable/playable.css', 'scripts/qa-physical-vitrina.cjs', 'scripts/lib/qa-loopback-guard.cjs']
  const sourceHashes = () => Object.fromEntries(files.map(p => [p, hash(readFileSync(resolve(repo, p)))]))
  const declaredSource = process.env.QA_CODE_SHA ? Object.fromEntries(files.filter(p => p.startsWith('src/')).map(p => [p, hash(execFileSync('git', ['show', process.env.QA_CODE_SHA + ':' + p], { cwd: repo }))])) : null
  let sizes = [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]
  if (process.env.QA_PHYSICAL_WIDTH) { sizes = sizes.filter(s => s.width === Number(process.env.QA_PHYSICAL_WIDTH)); assert.equal(sizes.length, 1) }
  const report = { metadata: { startedAt: new Date().toISOString(), base: base.href, declaredBuildSHA: process.env.QA_CODE_SHA || null, repositorySHA: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), sourceSHA256: sourceHashes(), declaredAppSourceSHA256: declaredSource, viewports: sizes,
    criteria: { exactBowls: 5, clearCreamCentres: 5, mobileLogoCornersInside: 4, logoViewportToleranceCSSPx: .5, sampledCoverage: 'Diagnostic only, no fitted threshold', desktopLogo: 'Diagnostic; compare against desktop baseline for no regression' },
    scope: 'Existing R3F refs read only; physical solid-mesh raycasts and real logo projection. Complements DOM16; no production hooks, UI changes, renderer settings changes or photography-parity claim.' }, status: 'prepared', cases: [], failures: [], events: [], network: [] }
  const persist = () => { const p = resolve(output, 'physical-vitrina-results.json'); writeFileSync(p + '.tmp', JSON.stringify(report, null, 2)); renameSync(p + '.tmp', p) }
  const record = (type, details = {}) => { const e = { at: new Date().toISOString(), type, ...details }; report.events.push(e); console.log(JSON.stringify(e)); persist() }
  persist()
  if (process.env.QA_PREFLIGHT_ONLY === '1') { report.status = 'preflight-passed'; report.metadata.browserExecuted = false; persist(); return }
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] })
  try {
    report.metadata.browserVersion = browser.version()
    for (const size of sizes) {
      const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: size.width < 600, isMobile: size.width < 600, serviceWorkers: 'block' })
      const guard = await installLoopbackGuard(context, { base: base.href, hdr, onFailure: error => { report.failures.push({ width: size.width, network: error }); persist() }, onEvent: event => record(event.type, { width: size.width, ...event }) })
      report.network.push({ width: size.width, traffic: guard.traffic })
      const page = await context.newPage(); page.setDefaultTimeout(45000)
      page.on('pageerror', error => { report.failures.push({ width: size.width, pageError: error.message }); persist() })
      page.on('console', event => { if (event.type() === 'error') { report.failures.push({ width: size.width, consoleError: event.text() }); persist() } })
      try {
        const config = await page.request.get(new URL('/api/payments/culqi/config', base).href, { maxRedirects: 0 }); assert.equal(config.status(), 200)
        const payment = await config.json(); for (const k of ['enabled', 'configured', 'intakeEnabled']) assert.equal(payment[k], false); assert.equal(payment.mode, 'disabled'); assert.equal(payment.visualQaAllowed, true)
        await page.goto(new URL('/?qa=1', base).href, { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: 'Empezar pedido', exact: true }).click()
        await page.getByRole('button', { name: 'Schmears', exact: true }).click()
        await page.locator('.guided-size-cards>button').first().click()
        await page.locator('[data-scene="schmears"]').waitFor()
        await page.locator('.schmear-3d-sign').nth(4).waitFor({ state: 'attached' })
        await page.evaluate(() => new Promise(done => { let n = 0; const frame = () => ++n >= 5 ? done() : requestAnimationFrame(frame); requestAnimationFrame(frame) }))
        const metrics = await page.evaluate(readPhysicalScene), failures = []
        if (metrics.bowls.length !== 5) failures.push('Exactly five real bowls required')
        if (metrics.bowls.some(b => !b.centre.intersectsCream || !b.centre.target || !b.sampledCreamPoints)) failures.push('Real cream raycast samples required for every bowl')
        if (metrics.clearCreamCentres !== 5) failures.push('Five unobstructed cream centres required')
        if (size.width < 600 && (metrics.logo.corners.length !== 4 || metrics.logo.insideCorners !== 4)) failures.push('Full physical logo must project within mobile viewport')
        const file = size.width + '-schmears.png'; await page.screenshot({ path: resolve(output, file), animations: 'disabled' })
        report.cases.push({ viewport: size, scene: 'schmears', file, sha256: hash(readFileSync(resolve(output, file))), metrics, pass: !failures.length, failures })
        for (const message of failures) report.failures.push({ width: size.width, message })
        assert.ok(guard.traffic.fixtureReads > 0, 'Approved HDR fixture must actually be used')
        record('physical-captured', { width: size.width, pass: !failures.length, clearCreamCentres: metrics.clearCreamCentres, logoInsideCorners: metrics.logo.insideCorners, logoViewportFraction: metrics.logo.viewportFraction })
      } catch (error) { report.failures.push({ width: size.width, message: String(error.stack || error) }); record('case-failed', { width: size.width, message: String(error) }) }
      finally { await guard.close(); persist() }
    }
  } finally { await browser.close(); report.metadata.finalSourceSHA256 = sourceHashes(); report.metadata.sourceChangedDuringRun = JSON.stringify(report.metadata.sourceSHA256) !== JSON.stringify(report.metadata.finalSourceSHA256); if (report.metadata.sourceChangedDuringRun) report.failures.push({ message: 'Source changed during run' }); report.metadata.finishedAt = new Date().toISOString(); report.status = report.failures.length ? 'failed' : 'passed'; persist() }
  console.log(report.cases.length + ' physical cases; ' + report.failures.length + ' failures')
  if (report.failures.length) process.exitCode = 1
}

module.exports = { readPhysicalScene }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
