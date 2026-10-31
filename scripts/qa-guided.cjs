/**
 * Bagelito visual journey smoke QA. Run only against a loopback preview
 * with BAGELITO_VISUAL_QA_ENABLED=true and all payment intake disabled.
 * Install locally: npm i --no-save playwright@1.56.1 && npx playwright install chromium
 * Run: BASE_URL=http://localhost:4173 QA_HDR_FIXTURE_PATH=/path/lebombo_1k.hdr npm run qa:guided
 */
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const base = (process.env.BASE_URL || 'http://localhost:4173').replace(/\/$/, '')
const baseURL = new URL(base)
assert.ok(baseURL.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(baseURL.hostname), 'Only a loopback preview is allowed')
assert.ok(process.env.QA_HDR_FIXTURE_PATH, 'Provide the pinned HDR as a local fixture')
const hdr = readFileSync(process.env.QA_HDR_FIXTURE_PATH)
assert.equal(createHash('sha256').update(hdr).digest('hex'), 'a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb')
const hdrURL = 'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr'
const output = resolve(process.env.QA_OUTPUT || 'qa-artifacts')
const modes = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
]
mkdirSync(output, { recursive: true })

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sourceFiles = [
  'scripts/qa-guided.cjs', 'src/playable/PlayableStore.tsx', 'src/playable/movement-input.ts',
  'src/playable/StoreArchitectureVisual.tsx', 'src/playable/GuidedCommerce.tsx',
  'src/playable/playable.css', 'src/playable/guided-commerce.css',
  'src/domain/lib/approved-shop-contract.ts', 'src/domain/data/verified-menu-2026-10-21.json',
  'package.json', 'package-lock.json', 'vercel.json',
]
const optionalSourceFiles = ['package-lock.json']
const metadata = {
  startedAt: new Date().toISOString(),
  repositorySHA: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
  declaredBuildSHA: process.env.QA_CODE_SHA || null,
  base, nodeVersion: process.version, expectedScenes: modes.length * 16,
  hdrFixtureSHA256: sha256(hdr),
  sourceSHA256: Object.fromEntries(sourceFiles.map(file => [file, existsSync(resolve(file)) ? sha256(readFileSync(resolve(file))) : null])),
  missingSourceFiles: sourceFiles.filter(file => !existsSync(resolve(file))),
  optionalSourceFiles,
}
const missingRequiredSources = metadata.missingSourceFiles.filter(file => !optionalSourceFiles.includes(file))
if (missingRequiredSources.length) throw Error('Missing required QA source snapshots: ' + missingRequiredSources.join(', '))

async function bounded(operation, milliseconds, label) {
  let timer
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(label + ' timed out after ' + milliseconds + 'ms')), milliseconds)
    })])
  } finally { clearTimeout(timer) }
}

async function audit() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.QA_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.QA_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  })
  const results = []
  const failures = []
  const network = []
  const events = []
  const diagnostics = []
  const interruptions = []
  let activePage = null, activeMode = null, activeStage = 'browser-launched'
  let interrupted = false, handlingSignal = false
  let failureDiagnosed = false
  metadata.browserVersion = browser.version()

  function checkpoint(status = 'running', final = false) {
    const target = resolve(output, final ? 'results.json' : 'checkpoint.json')
    const temporary = target + '.tmp'
    writeFileSync(temporary, JSON.stringify({ metadata, status, activeMode, activeStage, results, failures, network, events, diagnostics, interruptions }, null, 2))
    renameSync(temporary, target)
  }
  function record(type, details = {}) {
    const event = { at: new Date().toISOString(), mode: activeMode, stage: activeStage, type, ...details }
    events.push(event)
    console.log(JSON.stringify(event))
    checkpoint(interrupted ? 'interrupted' : 'running')
  }
  async function diagnose(reason) {
    const diagnostic = { at: new Date().toISOString(), reason, mode: activeMode, stage: activeStage }
    diagnostics.push(diagnostic)
    if (!activePage || activePage.isClosed()) {
      diagnostic.pageClosed = true
      return
    }
    diagnostic.url = activePage.url()
    try {
      diagnostic.state = await bounded(activePage.evaluate(() => {
        const rect = element => {
          const box = element.getBoundingClientRect()
          return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }
        }
        const commerce = document.querySelector('.guided-commerce'), shell = document.querySelector('.playable-shell')
        const canvas = document.querySelector('canvas'), gl = canvas?.getContext('webgl2')
        const hidden = []
        for (let node = canvas; node; node = node.parentElement) {
          const style = getComputedStyle(node)
          if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) hidden.push(node.tagName + '.' + node.className)
        }
        // Only product state is inspected. Never copy input values, customer
        // details, payment tokens, or the raw session-storage draft into QA logs.
        return {
          scene: commerce?.getAttribute('data-scene'), liveWorld: commerce?.getAttribute('data-live-world'), qa: commerce?.getAttribute('data-qa'),
          worldScene: shell?.getAttribute('data-world-scene'), viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth },
          overlays: [...document.querySelectorAll('.guided-store-menu-panel,.guided-store-cart-panel,.guided-overlay-dismiss')].map(element => ({ className: element.className, rect: rect(element) })),
          plates: [...document.querySelectorAll('.bagelito-3d-blue-sign,.schmear-3d-sign')].map(element => ({ label: element.textContent, rect: rect(element) })),
          productCounters: [...document.querySelectorAll('.bagel-live-summary>b,.guided-order-counter>b,.guided-store-cart-button>span')].map(element => element.textContent),
          canvas: canvas ? { rect: rect(canvas), hidden, webgl: Boolean(gl), lost: gl?.isContextLost(), bufferWidth: gl?.drawingBufferWidth, bufferHeight: gl?.drawingBufferHeight } : null,
        }
      }), 5000, 'Read-only diagnostic state')
    } catch (error) { diagnostic.stateError = String(error) }
    if (!interrupted) {
      try {
        diagnostic.capture = activeMode + '-diagnostic-' + diagnostics.length + '.png'
        const path = resolve(output, diagnostic.capture)
        await activePage.screenshot({ path, animations: 'disabled', timeout: 10000 })
        diagnostic.captureSHA256 = sha256(readFileSync(path))
      } catch (error) { diagnostic.captureError = String(error) }
    }
    checkpoint(interrupted ? 'interrupted' : 'running')
  }
  async function onSignal(signal) {
    if (handlingSignal) return
    handlingSignal = true
    interrupted = true
    process.exitCode = signal === 'SIGINT' ? 130 : 143
    interruptions.push({ signal, at: new Date().toISOString(), mode: activeMode, stage: activeStage })
    record('interrupted', { signal })
    // Save the durable checkpoint before closing our own browser. An intentional
    // stop is recorded separately from a failed assertion or application error.
    const stop = setTimeout(() => {
      metadata.finishedAt = new Date().toISOString()
      checkpoint('interrupted', true)
      process.exit(signal === 'SIGINT' ? 130 : 143)
    }, 8000)
    stop.unref()
    await Promise.race([diagnose('signal-' + signal), new Promise(done => setTimeout(done, 2500))])
    await browser.close().catch(() => {})
    clearTimeout(stop)
    process.exitCode = signal === 'SIGINT' ? 130 : 143
  }
  const terminate = () => { void onSignal('SIGTERM') }
  const interrupt = () => { void onSignal('SIGINT') }
  process.once('SIGTERM', terminate)
  process.once('SIGINT', interrupt)
  checkpoint()
  try {
    for (const mode of modes) {
      const failuresBeforeMode = failures.length
      activeMode = mode.name
      activeStage = 'context-setup'
      record('mode-start', { viewport: mode.viewport })
      const context = await browser.newContext({ viewport: mode.viewport, deviceScaleFactor: 1, serviceWorkers: 'block' })
      const traffic = { mode: mode.name, reads: [], fixtureReads: 0, blocked: [], httpErrors: [], routeErrors: [], closingRouteErrors: [], closingAborts: [] }
      const pendingRoutes = new Set()
      let closing = false
      const reportRouteError = (entry, allowedGet) => {
        const expectedClosingError = closing && allowedGet
          && /disposed|(?:page|browser|context).*closed|net::ERR_ABORTED/i.test(entry.message)
          && !/timeout|timed out/i.test(entry.message)
        if (expectedClosingError) traffic.closingRouteErrors.push(entry)
        else {
          traffic.routeErrors.push(entry)
          failures.push(mode.name + ': route handler failed: ' + entry.message)
          record('route-error', entry)
        }
      }
      network.push(traffic)
      try {
      await context.route('**/*', route => {
        const work = (async () => {
        const request = route.request(), url = request.url()
        const localGet = request.method() === 'GET' && new URL(url).origin === baseURL.origin
        const fixtureGet = request.method() === 'GET' && url === hdrURL
        if (closing) {
          traffic.closingAborts.push({ method: request.method(), url })
          if (!localGet && !fixtureGet) {
            traffic.blocked.push({ method: request.method(), url, reason: 'forbidden-during-close' })
            failures.push(mode.name + ': forbidden request while closing: ' + request.method() + ' ' + url)
          }
          await route.abort('blockedbyclient').catch(error => reportRouteError({ method: request.method(), url, message: String(error) }, localGet || fixtureGet))
          return
        }
        try {
        if (localGet) {
          const response = await route.fetch({ maxRedirects: 0 })
          traffic.reads.push({ url, status: response.status() })
          if (response.status() >= 400) {
            const entry = { method: 'GET', url, status: response.status() }
            traffic.httpErrors.push(entry)
            failures.push(mode.name + ': local GET returned HTTP ' + entry.status + ': ' + url)
            record('local-read-error', entry)
          }
          if (response.status() >= 300 && response.status() < 400) {
            traffic.blocked.push({ method: 'GET', url, reason: 'redirect' })
            failures.push(mode.name + ': local redirect is forbidden: ' + url)
            await route.abort('blockedbyclient')
            return
          }
          await route.fulfill({ response })
          return
        }
        if (fixtureGet) {
          traffic.fixtureReads++
          await route.fulfill({ status: 200, headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' }, body: hdr })
          return
        }
        traffic.blocked.push({ method: request.method(), url })
        failures.push(mode.name + ': unrelated request or write is forbidden: ' + request.method() + ' ' + url)
        await route.abort('blockedbyclient')
        } catch (error) {
          const entry = { method: request.method(), url, message: String(error) }
          reportRouteError(entry, localGet || fixtureGet)
          await route.abort('blockedbyclient').catch(abortError => {
            reportRouteError({ ...entry, message: String(abortError), phase: 'abort-after-error' }, localGet || fixtureGet)
          })
        }
        })()
        pendingRoutes.add(work)
        void work.then(() => pendingRoutes.delete(work), () => pendingRoutes.delete(work))
        return work
      })
      const page = await context.newPage()
      activePage = page
      page.setDefaultTimeout(45000)
      page.on('pageerror', (err) => { failures.push(mode.name + ': ' + err.message); record('page-error', { message: err.message }) })
      page.on('console', (event) => {
        if (event.type() === 'error') failures.push(mode.name + ': ' + event.text())
        if (event.type() === 'debug' && event.text().startsWith('BAGELITO_QA_UI ')) {
          try { record('ui-event', JSON.parse(event.text().slice('BAGELITO_QA_UI '.length))) } catch {}
        }
      })
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) record('navigation', { url: frame.url() }) })
      await page.addInitScript(() => {
        for (const type of ['pointerdown', 'pointerup', 'click', 'keydown']) document.addEventListener(type, event => {
          if (type === 'keydown' && !['Enter', ' ', 'Escape'].includes(event.key)) return
          const target = event.target instanceof Element ? event.target.closest('button,[role="button"],a') : null
          if (!target) return
          console.debug('BAGELITO_QA_UI ' + JSON.stringify({ event: type, pointerType: event.pointerType || null, key: type === 'keydown' ? event.key : null, tag: target.tagName, className: target.className, ariaLabel: target.getAttribute('aria-label') }))
        }, { capture: true })
      })
      const config = await page.request.get(new URL('/api/payments/culqi/config', baseURL).href, { maxRedirects: 0 })
      assert.equal(config.status(), 200)
      const payment = await config.json()
      for (const key of ['enabled', 'configured', 'intakeEnabled']) assert.equal(payment[key], false, key + ' must remain disabled')
      assert.equal(payment.mode, 'disabled')
      assert.equal(payment.visualQaAllowed, true, 'The loopback server must explicitly enable visual QA')
      record('config-verified', { mode: payment.mode, enabled: payment.enabled, configured: payment.configured, intakeEnabled: payment.intakeEnabled, visualQaAllowed: payment.visualQaAllowed })

      async function visit() {
        activeStage = 'visit'
        record('journey-start')
        const targetOrigin = new URL(base).origin
        if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
          throw Error('Starting a fresh product journey is restricted to a loopback QA origin.')
        }
        // visit() starts an independent journey. Keep the explicit mid-journey
        // page.reload() test below intact so draft recovery remains exercised.
        if (new URL(page.url()).origin === targetOrigin) {
          await page.evaluate(() => sessionStorage.removeItem('bagelito.guided.product-draft.v1'))
        } else if (page.url() !== 'about:blank') {
          throw Error('Refusing to reset a product draft outside the local QA origin.')
        }
        await page.goto(base + '/?qa=1', { waitUntil: 'networkidle' })
        await page.getByRole('button', {name:'Empezar pedido',exact:true}).click()
        await page.getByRole('button', {name:'Abrir menú',exact:true}).click()
        await page.getByRole('button', {name:'Inicio',exact:true}).click()
        // Inicio changes the scene; its existing effect closes the menu.
        // Wait for that state before interacting with the same toggle again.
        await page.locator('.guided-store-menu-panel').waitFor({state:'hidden'})
        await page.locator('[data-scene="entrance"]').waitFor()
        const qaEnabled = await page.locator('[data-qa="true"]').count()
        if (!qaEnabled) throw Error('Visual QA is not enabled. Do not use payment bypass on production.')
        record('journey-ready')
      }
      async function scene(key, name) {
        activeStage = 'scene-' + name
        record('scene-start', { scene: key, name })
        await page.locator('[data-scene="' + key + '"]').waitFor()
        await page.waitForFunction(expected => document.querySelector('.playable-shell')?.getAttribute('data-world-scene') === expected, key)
        if (['selector','pack-size','pack-qty','combos','schmear-size','bagels','schmears'].includes(key)) {
          await page.waitForFunction(scene => {
            const selector = scene === 'bagels' ? '.bagelito-3d-blue-sign' : scene === 'schmears' ? '.schmear-3d-sign' : '.bagelito-3d-blue-sign,.schmear-3d-sign'
            const plates = [...document.querySelectorAll(selector)]
            return plates.length === (scene === 'bagels' ? 8 : scene === 'schmears' ? 5 : 13) && plates.every(plate => {
              const box = plate.getBoundingClientRect()
              return box.width > 0 && box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
            })
          }, key)
        }
        // Transitions request a new real scene image; wait for decode rather than
        // flagging a normal in-flight image request as a broken asset.
        await page.locator('[data-scene="' + key + '"]').evaluate(async (root) => {
          const images = [...root.querySelectorAll('img')]
          await Promise.race([
            Promise.all(images.map((image) => image.decode().catch(() => {}))),
            new Promise((done) => setTimeout(done, 5000)),
          ])
        })
        const brokenImages = await page.evaluate(() => [...document.images]
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.src))
        const widths = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
        }))
        if (brokenImages.length) failures.push(mode.name + '/' + name + ': broken images ' + brokenImages.join(', '))
        if (widths.document > widths.viewport + 2) failures.push(mode.name + '/' + name + ': overflow')
        const capture = mode.name + '-' + name + '.png'
        const path = resolve(output, capture)
        await page.screenshot({ path, animations:'disabled' })
        results.push({ mode: mode.name, scene: name, pass: !brokenImages.length && widths.document <= widths.viewport + 2, capture, captureSHA256: sha256(readFileSync(path)) })
        record('scene-complete', { scene: key, name, completedScenes: results.length })
      }

      await visit()
      await scene('entrance', '01-entrance')

      // The approved store chrome must be real, usable controls, not
      // decorative screenshots of a menu/bag icon.
      if (await page.getByRole('button', { name: 'Abrir menú' }).count() !== 1
        || await page.getByRole('button', { name: /Ver tu pedido: 0 productos/ }).count() !== 1) {
        failures.push(mode.name + ': missing accessible menu or live order holder')
      } else {
        await page.getByRole('button', { name: 'Abrir menú' }).click()
        await page.getByRole('navigation', { name: 'Menú Bagelito' }).waitFor()
        await page.getByRole('button', { name: 'Cerrar menú' }).click()
        await page.getByRole('button', { name: /Ver tu pedido: 0 productos/ }).click()
        await page.getByRole('complementary', { name: 'Resumen de tu pedido' }).waitFor()
        await page.getByRole('button', { name: 'Cerrar resumen' }).click()
      }

      await page.getByRole('button', { name: /Entrar a Bagelito/i }).click()
      await scene('selector', '02-selector')

      const holder = await page.locator('.guided-progress-master').boundingBox()
      if (!holder || (mode.name === 'desktop' && holder.y < mode.viewport.height * .75)
        || (mode.name === 'mobile' && holder.y < mode.viewport.height * .75)) {
        failures.push(mode.name + ': progress holder placement differs from approved responsive layout')
      }
      await page.getByRole('button', { name: 'Packs', exact: true }).click()
      await scene('pack-size', '03-pack-size')
      await page.locator('.pack-format-grid button').first().click()
      await scene('pack-qty', '04-pack-quantity')
      // Mixed/single packs must be independently selectable in the UI.
      const mixChoices = page.locator('.guided-pack-mix > button')
      if (await mixChoices.count() !== 2
        || await mixChoices.first().getAttribute('aria-pressed') !== 'true') {
        failures.push(mode.name + ': pack mix choices are missing or default incorrectly')
      }
      await page.locator('.pack-choice-grid button').first().click()
      await scene('bagels', '05-bagels')

      // The catalog is NOT in the same order as the approved panorama.
      // Assert that tapping each visible tray selects its actual printed flavor.
      const showcaseLabels = await page.locator('.mobile-bagel-card > button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
      const expectedShowcaseLabels = [
        'Agregar Plain', 'Agregar Everything', 'Agregar Sesame',
        'Agregar Classic Onion', 'Agregar Jalapeño Cheddar', 'Agregar Cheddar',
        'Agregar Cinnamon Raisin', 'Agregar Blueberry',
      ]
      if (JSON.stringify([...showcaseLabels].sort()) !== JSON.stringify([...expectedShowcaseLabels].sort())) {
        failures.push(mode.name + ': bagel panorama hotspot positions do not match visual flavor labels')
      }

      // The live 3D store replaces the bounded panorama; real product cards
      // retain exact approved labels, complete images and the existing handlers.
      const liveWorld = await page.locator('[data-live-world="true"]').count()
      if (liveWorld !== 1 || await page.locator('canvas').count() !== 1
        || await page.locator('.guided-scene-image,.guided-scene-backdrop').count() !== 0) {
        failures.push(mode.name + ': commerce must keep the real world without room screenshots')
      }
      const productLabels = await page.locator('.mobile-bagel-sign').allTextContents()
      if (productLabels.length !== 8 || new Set(productLabels).size !== 8) {
        failures.push(mode.name + ': the eight approved product labels must remain available')
      }
      const mobileSigns = await page.locator('.mobile-bagel-sign').evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element)
        return {color:style.color,background:style.backgroundColor}
      }))
      if (mobileSigns.some(sign => sign.background !== 'rgb(255, 250, 244)' || sign.color !== 'rgb(0, 74, 173)')) {
        failures.push(mode.name + ': product labels must use the approved white plates and blue lettering')
      }
      if (mode.name === 'mobile') {
        const productCards = await page.locator('.mobile-bagel-card').evaluateAll((cards) =>
          cards.map((card) => ({
            image: card.querySelector('img')?.getAttribute('src') || '',
            alt: card.querySelector('img')?.getAttribute('alt') || '',
            button: card.querySelector('button')?.getAttribute('aria-label') || '',
          }))
        )
        if (productCards.length !== 8
          || productCards.some((card) => !card.image.startsWith('/images/bagel-')
            || card.button !== 'Agregar ' + card.alt)) {
          failures.push('Mobile bagel product cards are not matched to their actual labeled photos')
        }
      }

      for (let i = 0; i < 6; i++) {
        const selector = '.mobile-bagel-card > button'
        await page.locator(selector).nth(i % 3).click()
      }
      await scene('bagels', '06-bagels-selected')

      // Editing quantity / returning to the vitrinas must retain valid choices.
      await page.getByRole('button', { name: 'Volver al paso anterior' }).click()
      await page.locator('[data-scene="pack-qty"]').waitFor()
      await page.locator('.pack-choice-grid button').first().click()
      await page.locator('[data-scene="bagels"]').waitFor()
      if (await page.locator('.bagel-live-summary>b').textContent() !== '6/6') {
        failures.push(mode.name + ': returning to an unchanged pack lost its selected flavors')
      }
      // A draft must survive leaving the screen for a 3D visit and coming back
      // or a reload, without retaining sensitive customer/payment information.
      await page.reload({ waitUntil: 'networkidle' })
      await page.locator('[data-scene="bagels"]').waitFor({timeout:10000})
      if (await page.locator('.bagel-live-summary>b').textContent() !== '6/6') {
        failures.push(mode.name + ': an unfinished product draft was lost across navigation')
      }
      const rawDraft = await page.evaluate(() => sessionStorage.getItem('bagelito.guided.product-draft.v1'))
      if (!rawDraft || rawDraft.includes('customerName') || rawDraft.includes('email') || rawDraft.includes('token')) {
        failures.push(mode.name + ': product draft storage is missing or contains sensitive details')
      }
      record('draft-reload-inspected', { draftPresent: Boolean(rawDraft), counter: await page.locator('.bagel-live-summary>b').textContent() })

      const orderHolderText = await page.locator('.guided-store-cart-button>span').textContent()
      if (orderHolderText !== 'Tu pedido (6)') {
        failures.push(mode.name + ': order holder did not update to six selected bagels')
      }
      await page.getByRole('button', { name: /Continuar/ }).last().click()
      await scene('schmears', '07-schmears')
      // Both viewports use these real commerce controls over the mounted world.
      // The panorama hotspots are deliberately absent while liveWorld is true.
      const optionalSchmear = page.locator('.mobile-schmear-card > button').first()
      await optionalSchmear.click()
      if (await page.locator('.guided-store-cart-button>span').textContent() !== 'Tu pedido (7)') {
        failures.push(mode.name + ': optional schmear not added to live order count')
      }
      await optionalSchmear.click()
      if (await page.locator('.guided-store-cart-button>span').textContent() !== 'Tu pedido (6)') {
        failures.push(mode.name + ': optional schmear could not be removed again')
      }
      const schmearLabels = await page.locator('.mobile-schmear-card > button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
      const expectedSchmearLabels = [
        'Agregar Whipped Original', 'Agregar Ají Amarillo', 'Agregar Herb & Roasted Garlic',
        'Agregar Honey Cinnamon', 'Agregar Classic Strawberry',
      ]
      if (JSON.stringify(schmearLabels) !== JSON.stringify(expectedSchmearLabels)) {
        failures.push(mode.name + ': schmear showcase names are not aligned to the five product slots')
      }
      await page.getByRole('button', { name: /Ir a caja/ }).click()
      await scene('cashier', '08-cashier')
      const inquiryLink = page.locator('.guided-launch-contact > a')
      const inquiryHref = await inquiryLink.getAttribute('href')
      const inquiryMessage = inquiryHref && inquiryHref.includes('?text=')
        ? decodeURIComponent(inquiryHref.split('?text=')[1]) : ''
      if (!inquiryHref?.startsWith('https://wa.me/51917547745?text=')
        || !inquiryMessage.includes('Plain')
        || !inquiryMessage.includes('Everything')
        || !inquiryMessage.includes('no confirma ni paga el pedido')) {
        failures.push(mode.name + ': launch fallback must send an accurate unpaid WhatsApp inquiry')
      }
      await page.locator('.guided-cashier-action > button').click()
      await scene('pay', '09-payment')
      await page.locator('.qa-only-pay').click()
      await scene('receipt', '10-receipt')
      await page.locator('.receipt-interaction').click()
      await scene('wallet', '11-wallet')
      await page.getByRole('button', { name: /Ahora no/ }).click()
      await scene('handoff', '12-handoff')
      await page.locator('.handoff-action').click()
      await scene('goodbye', '13-goodbye')
      await page.getByRole('button', { name: /Seguir explorando/ }).click()
      await scene('returning', '14-returning')
      await visit()
      await page.getByRole('button', { name: /Entrar a Bagelito/i }).click()
      await page.getByRole('button', { name: 'Combos', exact: true }).click()
      await scene('combos', '15-combos')
      await visit()
      await page.getByRole('button', { name: /Entrar a Bagelito/i }).click()
      await page.getByRole('button', { name: 'Schmears', exact: true }).click()
      await scene('schmear-size', '16-schmear-size')

      // Repeat with mini + single-flavor pack: one tap selects the whole pack,
      // and the remove action clears the whole choice.
      await visit()
      await page.getByRole('button', { name: /Entrar a Bagelito/i }).click()
      await page.getByRole('button', { name: 'Packs', exact: true }).click()
      await page.locator('.pack-format-grid button').nth(1).click()
      await page.locator('.guided-pack-mix button').nth(1).click()
      if (await page.locator('.guided-pack-mix button').nth(1).getAttribute('aria-pressed') !== 'true') {
        failures.push(mode.name + ': one-flavor pack selector did not activate')
      }
      await page.locator('.pack-choice-grid button').first().click()
      await page.locator('[data-scene="bagels"]').waitFor()
      const bagelSelector = '.mobile-bagel-card > button'
      await page.locator(bagelSelector).first().click()
      if (await page.locator('.bagel-live-summary>b').textContent() !== '6/6') {
        failures.push(mode.name + ': single-flavor selection requires more than one tap')
      }
      await page.locator('.mobile-bagel-card .mobile-product-count > button').first().click()
      if (await page.locator('.bagel-live-summary>b').textContent() !== '0/6') {
        failures.push(mode.name + ': one-flavor pack cannot be cleared in one action')
      }
      assert.equal(traffic.fixtureReads > 0, true, 'The live world must load the pinned HDR fixture')
      assert.deepEqual(traffic.blocked, [], 'No unrelated external request or write is allowed')
      assert.deepEqual(traffic.reads.filter(read => read.status >= 400), [], 'All local resources must load')
      record('mode-complete', { completedScenes: results.filter(result => result.mode === mode.name).length, localReads: traffic.reads.length, fixtureReads: traffic.fixtureReads, blocked: traffic.blocked.length })
      if (failures.length > failuresBeforeMode) await diagnose('mode-assertion-failures')
      } catch (error) {
        if (!interrupted) {
          await diagnose('operation-failure')
          failureDiagnosed = true
        }
        throw error
      } finally {
        closing = true
        record('context-closing', { pendingRoutes: pendingRoutes.size })
        while (pendingRoutes.size) await Promise.allSettled([...pendingRoutes])
        await context.close()
        while (pendingRoutes.size) await Promise.allSettled([...pendingRoutes])
        activePage = null
        record('context-closed', { routeErrors: traffic.routeErrors.length, closingRouteErrors: traffic.closingRouteErrors.length, closingAborts: traffic.closingAborts.length })
      }
    }
  } catch (error) {
    if (interrupted) record('interrupted-operation', { message: String(error) })
    else {
      failures.push(String(error.stack || error))
      if (!failureDiagnosed) await diagnose('operation-failure')
    }
  } finally {
    await browser.close().catch(() => {})
    metadata.finishedAt = new Date().toISOString()
    checkpoint(interrupted ? 'interrupted' : failures.length ? 'failed' : 'passed', true)
    process.removeListener('SIGTERM', terminate)
    process.removeListener('SIGINT', interrupt)
  }
  console.log(results.length + ' scene checks; ' + failures.length + ' failures.')
  if (failures.length && !interrupted) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  }
}
if (process.env.QA_PREFLIGHT_ONLY === '1') {
  writeFileSync(resolve(output, 'metadata-preflight.json'), JSON.stringify({ status: 'preflight-passed', browserExecuted: false, metadata }, null, 2))
  console.log('Metadata preflight PASS; no browser launched; missing optional snapshots: ' + (metadata.missingSourceFiles.join(', ') || 'none'))
} else audit().catch((err) => { console.error(err); process.exitCode = 1 })
