'use strict'

// Browser QA for the rebuilt DOM storefront. No app hooks, API calls, writes,
// WebGL/HDR, reference-photo backgrounds or production/provider integrations.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {createHash} = require('node:crypto')
const {execFileSync} = require('node:child_process')
const steps = require('./qa-reference-review-steps.cjs')
const {inspectProductText} = require('./qa-reference-text-geometry.cjs')
const {inspectSecondaryReadability} = require('./qa-reference-secondary-readability.cjs')
const {inspectRebuiltGeometry} = require('./qa-rebuilt-geometry.cjs')
const {installSafety} = require('./qa-rebuilt-safety.cjs')

const hash = value => createHash('sha256').update(value).digest('hex')
const repo = path.resolve(process.env.QA_REPO_ROOT || path.join(__dirname, '..'))
const base = new URL(process.env.BASE_URL || process.env.QA_URL || 'http://127.0.0.1:3230/')
assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Loopback HTTP origin required')
assert.ok(/^[a-f0-9]{40}$/.test(process.env.QA_CODE_SHA || ''), 'QA_CODE_SHA must declare the complete application commit')
const out = path.resolve(process.env.QA_OUTPUT_DIR || process.env.QA_OUTPUT || path.join(repo, 'qa-artifacts', 'rebuilt-storefront'))
const resultFile = path.join(out, 'rebuilt-results.json')
const sizes = [
  {width: 390, height: 844, touch: true},
  {width: 320, height: 700, touch: true},
  {width: 1280, height: 800, touch: false},
  {width: 768, height: 1024, touch: true},
  {width: 1024, height: 768, touch: true},
  {width: 844, height: 390, touch: true},
  {width: 1920, height: 1080, touch: false},
]
const widths = process.env.QA_WIDTHS?.split(',').map(Number)
const viewports = widths ? sizes.filter(size => widths.includes(size.width)) : sizes
assert.ok(viewports.length && (!widths || widths.length === viewports.length), 'QA_WIDTHS must be drawn from 320,390,768,844,1024,1280,1920')
const allScenarios = ['entry', 'pack-decline', 'pack-original', 'pack-flavoured', 'combo', 'schmear']
const scenarios = process.env.QA_SCENARIOS ? process.env.QA_SCENARIOS.split(',') : allScenarios
assert.ok(scenarios.length && new Set(scenarios).size === scenarios.length && scenarios.every(value => allScenarios.includes(value)), 'Unknown or duplicate QA scenario')
// The extended tablet/landscape scope is entry plus the complete decline path.
// Keep the five original journeys at 320/390/1280 rather than multiplying them
// into an unrequested full matrix across every additional viewport.
const originalWidths = new Set([320, 390, 1280])
const extendedJourneyWidths = new Set([768, 1024, 844])
const scheduledCases = viewports.flatMap(viewport => scenarios
  .filter(scenario => scenario === 'entry' || originalWidths.has(viewport.width) || scenario === 'pack-decline' && extendedJourneyWidths.has(viewport.width))
  .map(scenario => ({viewport, scenario})))
assert.ok(scheduledCases.length, 'Requested scenarios do not intersect the scoped viewport matrix')
const root = '.guided-commerce[data-reference-mode="true"][data-review-only="true"]'
const sourceFiles = [
  'src/routes/index.tsx',
  'src/reference/ReferenceScene.tsx', 'src/reference/ReferenceStorefront.tsx', 'src/reference/reference-storefront.css',
  'src/playable/GuidedCommerce.tsx', 'src/playable/guided-commerce.css', 'src/domain/lib/approved-shop-contract.ts',
  'src/domain/data/verified-menu-2026-10-21.json', 'public/fonts/fredoka-variable.ttf', 'public/fonts/OFL-Fredoka.txt',
]
function sources() {
  const files = new Set(sourceFiles)
  function collect(directory) {
    for (const item of fs.readdirSync(path.join(repo, directory), {withFileTypes: true})) {
      const file = directory + '/' + item.name
      if (item.isDirectory()) collect(file)
      else if (/\.(tsx?|css)$/.test(item.name)) files.add(file)
    }
  }
  collect('src/reference')
  for (const name of fs.readdirSync(path.join(repo, 'public/images'))) if (/^rebuilt[-.]/.test(name)) files.add('public/images/' + name)
  return Object.fromEntries([...files].sort().map(file => [file, hash(fs.readFileSync(path.join(repo, file)))]))
}
const sourceHashes = sources()
const helperFiles = ['qa-rebuilt-geometry.cjs', 'qa-rebuilt-safety.cjs', 'qa-reference-review-steps.cjs', 'qa-reference-text-geometry.cjs', 'qa-reference-secondary-readability.cjs']
const helpers = () => Object.fromEntries(helperFiles.map(file => [file, hash(fs.readFileSync(path.join(__dirname, file)))]))
const report = {
  metadata: {
    startedAt: new Date().toISOString(), baseURL: base.href, declaredCodeSHA: process.env.QA_CODE_SHA,
    repositorySHA: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(),
    driverSHA256: hash(fs.readFileSync(__filename)), sourceHashes,
    helperHashes: helpers(),
    viewports, scenarios, scheduledCases,
    contextPolicy: 'hasTouch and isMobile equal explicit viewport.touch; native touch taps for every touch viewport, mouse clicks at desktop1280/1920.',
    scope: 'Rebuilt DOM storefront and unchanged commercial review-only handlers. No approved-reference photo/crops, vitrina-photo or storyboard art may be requested. Chromium emulation only; no Safari/device/install/deploy claim.',
  },
  criteria: {minimumTargetCSSPx: 44, minimumCopyCSSPx: 12, minimumHeadingCSSPx: 16, documentOverflowToleranceCSSPx: 1,
    rebuiltSceneFullBleedToleranceCSSPx: 1,
    applicationStorageReads: 0, storageWrites: 0, apiFetchXHR: 0, knownFrameworkReadKey: 'tsr-scroll-restoration-v1_3', maximumKnownReadsPerDocument: 1},
  planned: {entryViewports: scenarios.includes('entry') ? viewports.length : 0, categoryCallbacks: scenarios.includes('entry') ? viewports.length * 3 : 0,
    vitrineCallbacks: scenarios.includes('entry') ? viewports.length * 2 : 0,
    completeJourneys: scheduledCases.filter(value => value.scenario !== 'entry').length},
  status: 'prepared', cases: [], failures: [], events: [],
}
function persist() { fs.mkdirSync(out, {recursive: true}); fs.writeFileSync(resultFile, JSON.stringify(report, null, 2)) }
function event(type, detail = {}) {
  const value = {at: new Date().toISOString(), type, ...detail}; report.events.push(value)
  console.log(JSON.stringify(value)); persist()
}
function failure(detail, record) {
  const value = {at: new Date().toISOString(), ...(record ? {case: record.id} : {}), ...detail}
  report.failures.push(value); if (record) record.pass = false; persist()
}
function assertCleanSecondary(audit) {
  return [...audit.countFailures, ...audit.smallText.map(value => ({type: 'font12', ...value})),
    ...audit.clippedText.map(value => ({type: 'text-clipping', ...value})),
    ...audit.overlaps.map(value => ({type: 'text-overlap', ...value})),
    ...audit.undersizedTargets.map(value => ({type: 'target44', ...value})),
    ...(audit.documentOverflowX > 1 ? [{type: 'document-overflow', overflow: audit.documentOverflowX}] : [])]
}
async function shell(page) {
  assert.equal(await page.locator(root).count(), 1)
  assert.equal(await page.locator(root).getAttribute('data-qa'), 'false')
  assert.equal(await page.locator(root).getAttribute('data-direct-catalog'), 'true')
  assert.equal(await page.locator('canvas,iframe,.guided-scene-backdrop,.guided-scene-image,.qa-only-pay,.culqi-browser-checkout,.wallet-screen-live,.live-receipt-sheet').count(), 0)
  assert.equal(await page.locator('.reference-image,[data-reference-crop],button[aria-label="Ampliar imagen"]').count(), 0)
  assert.equal(await page.getByRole('button', {name: 'Ir a Pago', exact: true}).isDisabled(), true, 'Progress cannot bypass the review-only payment gate')
}
async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Two animation frames did not complete within 5 seconds')), 5000)
    requestAnimationFrame(() => requestAnimationFrame(() => {clearTimeout(timer); resolve()}))
  }))
}
// DOM adapters for the rebuilt header. Keep the old reference drivers and their
// assertions unchanged; their cart class belongs to the earlier presentation.
const cartButton = page => page.getByRole('button', {name: /^Ver tu pedido: \d+ productos$/})
async function cart(page, count) {
  assert.equal(await cartButton(page).count(), 1)
  assert.equal(await cartButton(page).getAttribute('aria-label'), `Ver tu pedido: ${count} productos`)
}
async function fillBagels(page, {quantity = 6, flavors = ['Plain', 'Everything', 'Sesame']} = {}, act) {
  for (let index = 0; index < quantity; index++) await act(page.getByRole('button', {name: `Agregar ${flavors[index % flavors.length]}`, exact: true}))
  await steps.counter(page, steps.selectors.bagelCounter, `${quantity}/${quantity}`)
  await cart(page, quantity)
}
async function chooseSchmear(page, {grams = 180, flavor = 'Classic Strawberry'} = {}, act) {
  await act(page.locator(steps.selectors.category('schmears'))); await steps.scene(page, 'schmear-size')
  for (const size of steps.prices.schmearSizes) {
    const button = page.getByRole('button', {name: new RegExp('^' + size.grams + ' g')})
    assert.equal(steps.normalize(await button.locator('b').textContent()), `${size.grams} g`)
    assert.equal(steps.normalize(await button.locator('span').textContent()), `Original S/${size.original} · Sabores S/${size.flavoured}`)
  }
  await act(page.getByRole('button', {name: new RegExp('^' + grams + ' g')})); await steps.scene(page, 'schmears')
  await steps.counter(page, steps.selectors.schmearCounter, '0/1'); assert.equal(await page.locator(steps.selectors.primary).count(), 0)
  await act(page.getByRole('button', {name: `Agregar ${flavor}`, exact: true}))
  await steps.counter(page, steps.selectors.schmearCounter, '✓'); await cart(page, 1)
  assert.ok(steps.normalize(await page.locator(steps.selectors.primary).textContent()).startsWith('Continuar'))
  await act(page.locator(steps.selectors.primary)); await steps.scene(page, 'cashier')
  assert.equal(await page.locator('.cross-sell-actions').count(), 0)
  assert.deepEqual(await steps.summaryRows(page), [{quantity: 1, name: `${flavor} · ${grams} g`}])
}

async function runCase(browser, viewport, scenario) {
  const record = {id: `${viewport.width}-${scenario}`, viewport, scenario, pass: true, captures: [], actions: [], callbacks: [], vitrineCallbacks: [], coverage: []}
  report.cases.push(record); persist()
  const context = await browser.newContext({viewport: {width: viewport.width, height: viewport.height}, deviceScaleFactor: 1,
    hasTouch: viewport.touch, isMobile: viewport.touch, serviceWorkers: 'block'})
  let safety, page, lastScene, shotIndex = 0
  try {
    safety = await installSafety(context, base, detail => failure({safety: detail}, record))
    record.network = safety.traffic
    page = await context.newPage(); page.setDefaultTimeout(12000)
    async function capture(name, {inspect = true} = {}) {
      await twoFrames(page)
      const scene = await page.locator(root).getAttribute('data-scene')
      const prefix = `${record.id}-${String(++shotIndex).padStart(2, '0')}-${name}`
      // Capture pixels before assertions so even the first failed WIP is reviewable.
      const file = prefix + '.png', full = prefix + '-full.png'
      await page.screenshot({path: path.join(out, file)})
      await page.screenshot({path: path.join(out, full), fullPage: true})
      const shot = {name, scene, file, full, sha256: hash(fs.readFileSync(path.join(out, file))), fullSHA256: hash(fs.readFileSync(path.join(out, full)))}
      record.captures.push(shot); event('captured', {case: record.id, name, scene, file, sha256: shot.sha256})
      if (inspect) {
        shot.fullBleed = await page.locator('.rebuilt-store').evaluate(element => {
          const r = element.getBoundingClientRect()
          return {x: r.x, right: r.right, width: r.width, innerWidth, layoutViewportWidth: document.documentElement.clientWidth, scrollX}
        })
        if (Math.abs(shot.fullBleed.width - shot.fullBleed.innerWidth) > 1 || Math.abs(shot.fullBleed.x) > 1 || Math.abs(shot.fullBleed.right - shot.fullBleed.innerWidth) > 1) failure({stage: name, rebuiltSceneNotFullBleed: shot.fullBleed}, record)
        shot.geometry = await page.evaluate(inspectRebuiltGeometry)
        for (const issue of shot.geometry.failures) failure({stage: name, geometry: issue}, record)
        shot.secondary = await page.evaluate(inspectSecondaryReadability)
        for (const issue of assertCleanSecondary(shot.secondary)) failure({stage: name, secondary: issue}, record)
        if (scene === 'schmears' || scene === 'bagels') {
          shot.products = await page.evaluate(inspectProductText, {selector: scene === 'schmears' ? '.mobile-schmear-card' : '.mobile-bagel-card', expectedCount: scene === 'schmears' ? 5 : 8, minFont: 12})
          for (const issue of shot.products.failures) failure({stage: name, productText: issue}, record)
        }
      }
      lastScene = scene; persist(); return shot
    }
    async function act(locator, {newTab = false} = {}) {
      assert.equal(await locator.count(), 1, 'Native action needs one unambiguous control')
      await locator.scrollIntoViewIfNeeded(); await twoFrames(page)
      const target = await locator.evaluate(element => {
        const r = element.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2
        const hit = document.elementFromPoint(x, y)
        const visible = {x: Math.max(0, r.x), y: Math.max(0, r.y), right: Math.min(innerWidth, r.right), bottom: Math.min(innerHeight, r.bottom)}
        for (let parent = element.parentElement; parent && !parent.matches('html,body'); parent = parent.parentElement) {
          const style = getComputedStyle(parent), box = parent.getBoundingClientRect()
          if (/hidden|clip|auto|scroll/.test(style.overflowX)) {visible.x = Math.max(visible.x, box.x + parent.clientLeft); visible.right = Math.min(visible.right, box.x + parent.clientLeft + parent.clientWidth)}
          if (/hidden|clip|auto|scroll/.test(style.overflowY)) {visible.y = Math.max(visible.y, box.y + parent.clientTop); visible.bottom = Math.min(visible.bottom, box.y + parent.clientTop + parent.clientHeight)}
        }
        return {name: element.getAttribute('aria-label') || element.textContent.trim(), tag: element.tagName,
          width: r.width, height: r.height, effectiveWidth: Math.max(0, visible.right - visible.x), effectiveHeight: Math.max(0, visible.bottom - visible.y), x, y, hit: hit === element || element.contains(hit)}
      })
      if (target.width < 43.99 || target.height < 43.99 || target.effectiveWidth < 43.99 || target.effectiveHeight < 43.99) failure({actionTarget44: target}, record)
      assert.ok(target.hit, 'Native action center must hit the intended control: ' + target.name)
      target.input = viewport.touch ? 'touch' : 'mouse'
      if (viewport.touch) await locator.tap()
      else await locator.click()
      record.actions.push(target)
      if (newTab) return
      await twoFrames(page)
      const current = await page.locator(root).getAttribute('data-scene')
      if (current !== lastScene) await capture('scene-' + current)
    }
    const scene = key => steps.scene(page, key)
    async function menuReset() {
      await act(page.getByRole('button', {name: 'Abrir menú', exact: true}))
      await page.getByRole('navigation', {name: 'Menú Bagelito'}).waitFor({state: 'visible'})
      await act(page.getByRole('button', {name: 'Inicio', exact: true}))
      await scene('entrance'); await page.getByRole('navigation', {name: 'Menú Bagelito'}).waitFor({state: 'hidden'})
      await cart(page, 0)
    }
    await page.goto(base.href, {waitUntil: 'networkidle'})
    await page.locator(root).waitFor(); await page.evaluate(() => document.fonts.ready)
    await capture('first-pixels')
    await shell(page)
    if (scenario === 'entry') {
      assert.equal(await page.locator('.reference-category').count(), 3)
      assert.match(steps.normalize(await page.locator('[data-reference-category="combos"]').innerText()), /bagels\s*\+\s*schmears/i)
      assert.deepEqual((await page.locator('.rebuilt-bagel-tray figcaption').allTextContents()).map(steps.normalize).sort(), steps.menu.bagels.map(item => item.name).sort())
      assert.deepEqual((await page.locator('.rebuilt-schmear-tray figcaption').allTextContents()).map(steps.normalize).sort(), steps.menu.schmears.map(item => item.name).sort())
      await act(cartButton(page))
      await page.getByRole('complementary', {name: 'Resumen de tu pedido'}).waitFor()
      assert.match(await page.locator('.guided-store-cart-panel').innerText(), /Aún no has elegido productos/)
      await capture('empty-cart'); await act(page.getByRole('button', {name: 'Cerrar resumen', exact: true}))
      for (const [category, next] of [['packs', 'pack-size'], ['combos', 'combos'], ['schmears', 'schmear-size']]) {
        await act(page.locator(`[data-reference-category="${category}"]`)); await scene(next)
        record.callbacks.push({category, scene: next, pass: true})
        await menuReset()
      }
      for (const [name, next] of [['Elige tus bagels', 'pack-size'], ['Descubre los sabores', 'schmear-size']]) {
        await act(page.getByRole('button', {name, exact: false})); await scene(next)
        record.vitrineCallbacks.push({name, scene: next, pass: true})
        await menuReset()
      }
      record.coverage.push('three-category-callbacks', 'two-vitrine-callbacks', 'verified-vitrine-flavor-labels', 'empty-cart', 'menu', 'reset')
      return
    }
    const isPack = scenario.startsWith('pack-'), isCombo = scenario === 'combo'
    let selectedSchmear = null
    if (isPack) {
      await steps.choosePack(page, {format: 'grande', quantity: 6, mix: 'mixed'}, act)
      await fillBagels(page, {quantity: 6, flavors: ['Plain', 'Everything', 'Cinnamon Raisin']}, act)
      await capture('bagels-selected')
      await act(page.getByRole('button', {name: 'Quitar Plain', exact: true})); await steps.counter(page, steps.selectors.bagelCounter, '5/6')
      await act(page.getByRole('button', {name: 'Agregar Plain', exact: true})); await steps.counter(page, steps.selectors.bagelCounter, '6/6')
      selectedSchmear = scenario === 'pack-original' ? 'Whipped Original' : scenario === 'pack-flavoured' ? 'Classic Strawberry' : null
      await act(page.locator(steps.selectors.primary)); await steps.assertOptional120(page)
      if (selectedSchmear) {
        const add = page.getByRole('button', {name: `Agregar ${selectedSchmear}`, exact: true})
        await act(add); await steps.counter(page, steps.selectors.schmearCounter, '✓'); await capture('optional-selected')
        await act(add); await steps.counter(page, steps.selectors.schmearCounter, '0/1'); await capture('optional-deselected')
        await act(add); await steps.counter(page, steps.selectors.schmearCounter, '✓')
      } else assert.ok(steps.normalize(await page.locator(steps.selectors.primary).textContent()).startsWith(steps.text.noSchmear))
      await act(page.locator(steps.selectors.primary)); await scene('cashier')
      const rows = await steps.summaryRows(page)
      if (selectedSchmear) assert.ok(rows.some(row => row.quantity === 1 && row.name === selectedSchmear))
      else assert.ok(rows.every(row => !steps.menu.schmears.some(flavor => flavor.name === row.name)))
      record.coverage.push(selectedSchmear ? `optional-120g-${scenario === 'pack-original' ? 'S12' : 'S16'}-accept-remove-readd` : 'optional-120g-decline', 'bagel-remove-readd')
    } else if (isCombo) {
      await act(page.locator(steps.selectors.category('combos'))); await scene('combos')
      const comboChoice = page.getByRole('button', {name: 'Bagels + schmears', exact: true})
      assert.equal(steps.normalize(await comboChoice.locator('strong').textContent()), steps.prices.currentCombo.display)
      await act(comboChoice); await scene('bagels')
      await fillBagels(page, {quantity: 2, flavors: ['Plain', 'Everything']}, act)
      await capture('combo-bagels-selected')
      await act(page.locator(steps.selectors.primary)); await scene('schmears')
      await steps.counter(page, steps.selectors.schmearCounter, '0/1')
      assert.equal(await page.locator(steps.selectors.primary).count(), 0)
      assert.equal(await page.locator('.reference-schmear-price').count(), 0, 'Pack upsell prices cannot become combo prices')
      const addComboSchmear = page.getByRole('button', {name: 'Agregar Herb & Roasted Garlic', exact: true})
      await act(addComboSchmear); await steps.counter(page, steps.selectors.schmearCounter, '1/1'); await cart(page, 3)
      await capture('combo-schmear-selected')
      await act(page.getByRole('button', {name: 'Quitar Herb & Roasted Garlic', exact: true}))
      await steps.counter(page, steps.selectors.schmearCounter, '0/1'); await cart(page, 2)
      assert.equal(await page.locator(steps.selectors.primary).count(), 0)
      await act(addComboSchmear); await steps.counter(page, steps.selectors.schmearCounter, '1/1'); await cart(page, 3)
      await act(page.locator(steps.selectors.primary)); await scene('cashier')
      assert.equal(steps.prices.currentCombo.price, null, 'Unverified combo price stays null')
      record.coverage.push('combo-null-price', 'mandatory-schmear-remove-readd')
    } else {
      await chooseSchmear(page, {grams: 180, flavor: 'Classic Strawberry'}, act)
      selectedSchmear = 'Classic Strawberry'
      record.coverage.push('standalone-schmear-180g', 'verified-size-price-labels')
    }
    assert.equal(steps.normalize(await page.locator('.guided-cashier-quote > span').textContent()), steps.text.priceUnconfirmed)
    assert.equal(await page.locator('.guided-cashier-quote > strong').count(), 0, 'No fabricated paid/verified total')
    await capture('summary')
    await act(page.getByRole('button', {name: /^Revisar entrega y consentimiento/})); await scene('pay')
    await shell(page)
    assert.equal(await page.locator('.checkout-customer-grid input').count(), 6)
    assert.equal(await page.locator('.checkout-customer-grid select').count(), 1)
    const disabledPay = page.getByRole('button', {name: 'Pago no activo', exact: true})
    assert.equal(await disabledPay.isDisabled(), true)
    assert.equal(await page.locator(steps.selectors.terms).isChecked(), false)
    await capture('review-unfilled')
    await page.getByLabel('Nombre', {exact: true}).fill('QA Tienda')
    await page.getByLabel('Email', {exact: true}).fill('qa-storefront@example.invalid')
    await page.getByLabel('WhatsApp', {exact: true}).fill('900000000')
    const district = page.locator('.checkout-customer-grid select')
    assert.equal(await district.evaluate(element => element.closest('label').querySelector('span').textContent.trim()), 'Distrito')
    await district.selectOption('Lince')
    await page.getByLabel('Dirección de delivery', {exact: true}).fill('Dirección sintética de prueba, número 123, edificio largo')
    await page.getByLabel('Referencia', {exact: true}).fill('Solo revisión local, sin enviar ni reservar')
    await page.getByLabel('Notas', {exact: true}).fill('Datos sintéticos. No cobrar ni crear un pedido.')
    if (viewport.touch) await page.locator(steps.selectors.terms).tap()
    else await page.locator(steps.selectors.terms).check()
    assert.equal(await page.locator(steps.selectors.terms).isChecked(), true)
    assert.equal(await disabledPay.isDisabled(), true, 'Consent cannot enable payment in review-only mode')
    assert.equal(steps.normalize(await page.locator(steps.selectors.reviewStatus).textContent()), steps.text.finalStatus)
    assert.equal(await page.locator('a[href*="wa.me"],.culqi-start-button,.qa-only-pay,.receipt-interaction,.wallet-actions').count(), 0)
    await capture('review-consented')

    const legalLink = page.getByRole('link', {name: 'términos vigentes', exact: true})
    assert.equal(await legalLink.getAttribute('href'), '/legal'); assert.equal(await legalLink.getAttribute('target'), '_blank')
    const popup = context.waitForEvent('page'); await act(legalLink, {newTab: true}); const legal = await popup
    try {
      await legal.waitForLoadState('networkidle')
      const url = new URL(legal.url()); assert.equal(url.origin, base.origin); assert.ok(['/legal', '/legal/'].includes(url.pathname))
      assert.deepEqual(await legal.locator('h1').allTextContents(), ['Políticas de compra y delivery'])
      assert.equal(await legal.locator('main section h2').count(), 8)
      assert.equal(await legal.evaluate(() => window.opener === null), true)
      const file = record.id + '-legal.png'; await legal.screenshot({path: path.join(out, file), fullPage: true})
      record.legal = {url: url.href, file, sha256: hash(fs.readFileSync(path.join(out, file))), sections: 8, openerIsNull: true}
    } finally {await legal.goto('about:blank'); await legal.close(); await page.bringToFront()}
    assert.equal(await page.locator(steps.selectors.terms).isChecked(), true)
    await act(page.getByRole('button', {name: 'Volver al paso anterior', exact: true})); await scene('cashier')
    await act(cartButton(page)); await page.getByRole('complementary', {name: 'Resumen de tu pedido'}).waitFor()
    await capture('cart-with-selection')
    await act(page.getByRole('button', {name: 'Editar sabores', exact: true})); await scene(isPack || isCombo ? 'bagels' : 'schmears')
    if (isPack || isCombo) {
      const total = isPack ? 6 : 2
      await act(page.getByRole('button', {name: 'Quitar Plain', exact: true})); await steps.counter(page, steps.selectors.bagelCounter, `${total - 1}/${total}`)
      await act(page.getByRole('button', {name: 'Agregar Plain', exact: true})); await steps.counter(page, steps.selectors.bagelCounter, `${total}/${total}`)
      await act(page.locator(steps.selectors.primary)); await scene('schmears')
    } else {
      const add = page.getByRole('button', {name: 'Agregar Classic Strawberry', exact: true})
      await act(add); assert.equal(await page.locator(steps.selectors.primary).count(), 0); await act(add)
    }
    await act(page.locator(steps.selectors.primary)); await scene('cashier')
    await act(page.getByRole('button', {name: 'Ir a Categoría', exact: true})); await scene(isPack ? 'pack-size' : isCombo ? 'combos' : 'schmear-size')
    if (isPack) {
      await act(page.getByRole('button', {name: /Bagels grandes/})); await scene('pack-qty')
      await act(page.getByRole('button', {name: 'Elegir 6 bagels, mixtos', exact: true})); await scene('bagels')
    } else if (isCombo) {await act(page.getByRole('button', {name: 'Bagels + schmears', exact: true})); await scene('bagels')}
    else {await act(page.getByRole('button', {name: /^180 g/})); await scene('schmears')}
    if (isPack || isCombo) {await act(page.locator(steps.selectors.primary)); await scene('schmears')}
    await act(page.locator(steps.selectors.primary)); await scene('cashier')
    await act(page.getByRole('button', {name: 'Ir a Selecciona', exact: true})); await scene(isPack || isCombo ? 'bagels' : 'schmears')
    if (isPack || isCombo) {await act(page.locator(steps.selectors.primary)); await scene('schmears')}
    await act(page.locator(steps.selectors.primary)); await scene('cashier')
    await act(page.getByRole('button', {name: 'Abrir menú', exact: true}))
    await act(page.getByRole('button', {name: 'Packs · Combos · Schmears', exact: true})); await scene('selector')
    await page.getByRole('navigation', {name: 'Menú Bagelito'}).waitFor({state: 'hidden'})
    await menuReset(); await capture('returned-entry')
    record.coverage.push('summary', 'checkout-fields-consent-disabled-payment', 'legal-real-newtab', 'back', 'cart-edit', 'progress-category', 'progress-selection', 'menu', 'reset')
    record.completeJourney = true
  } catch (error) {
    failure({error: String(error.stack || error)}, record)
    if (page && !page.isClosed()) try {
      const file = record.id + '-failure.png'; await page.screenshot({path: path.join(out, file), fullPage: true}); record.failureScreenshot = file
    } catch (captureError) {failure({failureCaptureError: String(captureError)}, record)}
  } finally {
    if (safety) {
      try {
        await safety.close(); record.capabilityAudit = safety.auditCapabilities()
        for (const error of record.capabilityAudit.errors) failure({capabilityAudit: error}, record)
      } catch (error) {failure({cleanupError: String(error)}, record)}
    } else await context.close()
    event('case-finished', {case: record.id, pass: record.pass, completeJourney: record.completeJourney === true, captures: record.captures.length, callbacks: record.callbacks.length})
  }
}

async function main() {
  execFileSync('git', ['cat-file', '-e', process.env.QA_CODE_SHA + '^{commit}'], {cwd: repo, stdio: 'pipe'})
  const mismatches = []
  for (const [file, actual] of Object.entries(sourceHashes)) {
    let declared
    try {declared = hash(execFileSync('git', ['show', process.env.QA_CODE_SHA + ':' + file], {cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024}))}
    catch {declared = null}
    if (declared !== actual) mismatches.push({file, actual, declared})
  }
  report.metadata.sourceMatchesDeclaredCommit = mismatches.length === 0
  assert.deepEqual(mismatches, [], 'Commit source and local app/assets must match; use a committed immutable application epoch')
  if (process.argv.includes('--preflight')) {console.log(JSON.stringify({status: 'prepared', metadata: report.metadata, planned: report.planned}, null, 2)); return}
  assert.ok(!fs.existsSync(resultFile), 'Use a new QA_OUTPUT_DIR for each immutable run; do not overwrite prior evidence')
  persist()
  const {chromium} = require('playwright')
  const browser = await chromium.launch({headless: true, executablePath: process.env.QA_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu']})
  report.metadata.browserVersion = browser.version(); report.status = 'running'; persist()
  try {for (const {viewport, scenario} of scheduledCases) await runCase(browser, viewport, scenario)}
  finally {
    await browser.close()
    report.metadata.finishedAt = new Date().toISOString()
    report.metadata.finalSourceHashes = sources()
    if (JSON.stringify(report.metadata.finalSourceHashes) !== JSON.stringify(sourceHashes)) failure({sourceChangedDuringRun: true})
    report.metadata.finalHelperHashes = helpers()
    if (JSON.stringify(report.metadata.finalHelperHashes) !== JSON.stringify(report.metadata.helperHashes) || hash(fs.readFileSync(__filename)) !== report.metadata.driverSHA256) failure({driverOrHelperChangedDuringRun: true})
    report.completed = {entryViewports: report.cases.filter(record => record.scenario === 'entry' && record.callbacks.length === 3).length,
      categoryCallbacks: report.cases.reduce((sum, record) => sum + record.callbacks.length, 0),
      vitrineCallbacks: report.cases.reduce((sum, record) => sum + record.vitrineCallbacks.length, 0),
      completeJourneys: report.cases.filter(record => record.completeJourney).length, legalNewTabs: report.cases.filter(record => record.legal).length,
      screenshots: fs.readdirSync(out).filter(file => file.endsWith('.png')).length}
    if (report.completed.entryViewports !== report.planned.entryViewports || report.completed.categoryCallbacks !== report.planned.categoryCallbacks || report.completed.vitrineCallbacks !== report.planned.vitrineCallbacks || report.completed.completeJourneys !== report.planned.completeJourneys) failure({incompleteCoverage: {planned: report.planned, completed: report.completed}})
    report.status = report.failures.length ? 'failed' : 'passed'; persist()
  }
  console.log(JSON.stringify({status: report.status, planned: report.planned, completed: report.completed, failures: report.failures.length, output: out}))
  if (report.failures.length) process.exitCode = 1
}
if (require.main === module) main().catch(error => {failure({fatal: String(error.stack || error)}); report.status = 'failed'; persist(); console.error(error); process.exitCode = 1})

module.exports = {assertCleanSecondary, planned: report.planned, scheduledCases}
