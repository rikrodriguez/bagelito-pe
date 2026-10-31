/**
 * Bagelito 3D tour browser QA. Test only on an isolated preview.
 * Requires the optional Playwright browser install used by qa:guided.
 * Supply QA_HDR_FIXTURE_PATH with the exact pinned HDR; browser egress is blocked.
 */
const { chromium } = require('playwright')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { resolve } = require('node:path')
const { execFileSync } = require('node:child_process')
const assert = require('node:assert/strict')

const base = (process.env.BASE_URL || 'http://localhost:4173').replace(/\/$/, '')
const baseURL = new URL(base)
const output = resolve(process.env.QA_OUTPUT || 'qa-artifacts')
mkdirSync(output, { recursive: true })
assert.ok(baseURL.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(baseURL.hostname), '3D QA requires HTTP loopback')
assert.ok(process.env.QA_HDR_FIXTURE_PATH, 'Provide the existing pinned HDR as a local fixture')
const hdr = readFileSync(process.env.QA_HDR_FIXTURE_PATH)
assert.equal(createHash('sha256').update(hdr).digest('hex'), 'a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb')
const hdrURL = 'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr'
// The approved reference is now used only for its bounded wall-logo/product
// crops. Verify exact bytes and UV bounds, rather than banning its GET alone.
execFileSync(process.execPath, [resolve(__dirname,'qa-visual-contract.cjs')], {stdio:'inherit'})
async function freshExplore(page, traffic) {
  const firstRead = traffic.reads.length
  if (new URL(page.url()).origin === new URL(base).origin) {
    await page.evaluate(() => sessionStorage.removeItem('bagelito.guided.product-draft.v1'))
  }
  const response = await page.goto(base + '/playable', {waitUntil:'domcontentloaded'})
  assert.equal(response?.status(), 200, 'Fresh exploration must return an HTTP 200 document')
  const failedReads = traffic.reads.slice(firstRead).filter(read => read.status >= 400)
  assert.equal(failedReads.length, 0, 'Fresh exploration cannot mount while local resources return HTTP errors; keep the built server artifact unchanged during QA: ' + JSON.stringify(failedReads))
}

const stops = ['totem', 'vitrina', 'bagels', 'schmears', 'production', 'cashier', 'pickup']
const stopX = [-3.70, 0, -2.05, 4.20, 0, 5.65, 6.95]
const verifiedBagels = [
  'bagel-plain.webp','bagel-everything.webp','bagel-sesame.webp',
  'bagel-classic-onion.webp','bagel-jalapeno-cheddar.webp',
  'bagel-cheddar.webp','bagel-cinnamon-raisin.webp','bagel-blueberry.webp',
]

async function waitForAssets(page, assets, deadline) {
  while (Date.now() < deadline) {
    if (verifiedBagels.every(name => {
      const asset = assets.get(name)
      return asset?.status === 200 && asset.finished === true
    })) return
    await page.waitForTimeout(Math.min(100, Math.max(1, deadline - Date.now())))
  }
  throw Error('3D showcase does not load all eight individual real bagel photos: '
    + JSON.stringify(verifiedBagels.map(name => ({name, ...assets.get(name)}))))
}

async function waitForFrames(page, deadline) {
  let timer
  try {
    await Promise.race([
      page.evaluate(() => new Promise(resolve => {
        let frames = 0
        const frame = () => {
          if (++frames === 8) resolve()
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('Eight browser animation frames did not complete before the readiness deadline')), Math.max(1, deadline - Date.now()))
      }),
    ])
  } finally { clearTimeout(timer) }
}

async function waitForCamera(page, target) {
  const deadline = Date.now() + 30000
  let first, second
  while (Date.now() < deadline) {
    first = Number(await page.locator('.playable-shell').getAttribute('data-player-x'))
    if (Number.isFinite(first) && Math.abs(first - target) <= .05) {
      await page.waitForTimeout(200)
      second = Number(await page.locator('.playable-shell').getAttribute('data-player-x'))
      if (Number.isFinite(second) && Math.abs(second - target) <= .05) return {target, first, second}
    } else await page.waitForTimeout(100)
  }
  throw Error('Camera X did not converge: ' + JSON.stringify({target, first, second}))
}

async function audit() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.QA_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.QA_CHROMIUM_EXECUTABLE_PATH} : {}),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  })
  const failures = []
  const results = []
  const diagnostics = {readiness: [], movement: [], cameras: [], network: []}
  try {
    for (const mode of [
      { name: 'desktop', viewport: { width: 1280, height: 800 } },
      { name: 'mobile', viewport: { width: 390, height: 844 } },
    ]) {
      const context = await browser.newContext({ viewport: mode.viewport, deviceScaleFactor: 1, serviceWorkers: 'block' })
      const traffic = {mode: mode.name, reads: [], fixtureReads: 0, blocked: []}
      diagnostics.network.push(traffic)
      await context.route('**/*', async route => {
        const request = route.request(), url = request.url()
        if (request.method() === 'GET' && new URL(url).origin === baseURL.origin) {
          const response = await route.fetch({maxRedirects: 0})
          traffic.reads.push({method: 'GET', url, status: response.status()})
          if (response.status() >= 300 && response.status() < 400) {
            traffic.blocked.push({method: 'GET', url, reason: 'redirect'})
            return route.abort('blockedbyclient')
          }
          return route.fulfill({response})
        }
        if (request.method() === 'GET' && url === hdrURL) {
          traffic.fixtureReads++
          return route.fulfill({status: 200, headers: {'content-type': 'application/octet-stream', 'access-control-allow-origin': '*'}, body: hdr})
        }
        traffic.blocked.push({method: request.method(), url})
        return route.abort('blockedbyclient')
      })
      const page = await context.newPage()
      const productAssets = new Set()
      const assetResponses = new Map()
      page.on('request', (request) => {
        const url = request.url()
        const item = url.match(/\/images\/(bagel-[a-z-]+\.webp)(?:\?|$)/)
        if (item) productAssets.add(item[1])
        if (url.includes('/images/bagel-vitrina-photo.webp')) {
          failures.push(mode.name + ': flat photographic showroom texture still used in 3D')
        }
      })
      page.on('response', response => {
        const item = response.url().match(/\/images\/(bagel-[a-z-]+\.webp)(?:\?|$)/)
        if (!item || !verifiedBagels.includes(item[1])) return
        const asset = {status: response.status(), responseAt: Date.now(), finished: false}
        assetResponses.set(item[1], asset)
        void response.finished().then(error => {
          asset.finished = error === null
          asset.finishedAt = Date.now()
          if (error) asset.error = String(error)
        }).catch(error => { asset.error = String(error) })
      })
      page.on('pageerror', (err) => failures.push(mode.name + ' JS: ' + err.message))
      try {
        const config = await page.request.get(new URL('/api/payments/culqi/config', baseURL).href, {maxRedirects: 0})
        assert.equal(config.status(), 200)
        const payment = await config.json()
        for (const key of ['enabled', 'configured', 'intakeEnabled']) assert.equal(payment[key], false, key + ' must remain disabled')
        assert.equal(payment.mode, 'disabled')
        await freshExplore(page, traffic)
        const readyDeadline = Date.now() + 30000
        const remaining = () => Math.max(1, readyDeadline - Date.now())
        await page.locator('canvas').waitFor({ timeout: remaining() })
        await page.locator('.tour-start-button').waitFor({ timeout: remaining() })
        await waitForAssets(page, assetResponses, readyDeadline)
        await page.locator('.bagelito-3d-blue-sign').nth(7).waitFor({state: 'attached', timeout: remaining()})
        if (await page.locator('.bagelito-3d-blue-sign').count() !== 8) throw Error('The mounted 3D world must contain exactly eight bagel signs')
        await waitForFrames(page, readyDeadline)
        diagnostics.readiness.push({mode: mode.name, at: Date.now(), assets: verifiedBagels.map(name => ({name, ...assetResponses.get(name)})), worldSigns: 8, browserFrames: 8})
        if (verifiedBagels.some((asset) => !productAssets.has(asset))) {
          failures.push(mode.name + ': 3D showcase does not load all eight individual real bagel photos')
        }

        if (mode.name === 'desktop') {
          await page.getByRole('button', {name:'Explorar libre',exact:true}).click()
          const initialX = Number(await page.locator('.playable-shell').getAttribute('data-player-x'))
          try {
            await page.keyboard.down('d')
            await page.waitForTimeout(480)
          } finally { await page.keyboard.up('d') }
          // Await changed-position telemetry without extending the original
          // key hold or reducing the required movement distance.
          const telemetryDeadline = Date.now() + 10000
          let movedX
          do {
            movedX = Number(await page.locator('.playable-shell').getAttribute('data-player-x'))
            if (Number.isFinite(movedX) && movedX > initialX + .12) break
            await page.waitForTimeout(100)
          } while (Date.now() < telemetryDeadline)
          diagnostics.movement.push({mode: mode.name, initialX, movedX, holdMs: 480, minimumDelta: .12, sampledAt: Date.now()})
          if (!(Number.isFinite(initialX) && movedX > initialX + .12)) {
            failures.push('Right strafe does not move in the correct direction.')
          }
        }

        await page.locator('.tour-start-button').click()
        const panel = page.locator('.guided-tour-panel')
        await panel.waitFor()

        for (let i = 0; i < stops.length; i++) {
          await page.locator('[data-tour-node="' + stops[i] + '"]').waitFor()
          const camera = await waitForCamera(page, stopX[i])
          diagnostics.cameras.push({mode: mode.name, node: stops[i], ...camera})
          await page.screenshot({ path: resolve(output, mode.name + '-tour-' + (i+1) + '-' + stops[i] + '.png'), timeout: 30000 })
          results.push(mode.name + ': ' + stops[i])
          if (i < stops.length - 1) {
            await panel.getByRole('button', { name: /Siguiente/ }).click()
          }
        }

        await panel.getByRole('button', { name: /Anterior/ }).click()
        await page.locator('[data-tour-node="cashier"]').waitFor()
        await panel.getByRole('button', { name: /Siguiente/ }).click()
        await page.locator('[data-tour-node="pickup"]').waitFor()
        await panel.getByRole('button', { name: /Terminar visita/ }).click()
        await page.locator('[data-tour-node="none"]').waitFor()
        if (await panel.count()) failures.push(mode.name + ': tour overlay was not dismissed.')

        await page.locator('.tour-start-button').click()
        await panel.getByRole('button', { name: /Armar pedido/ }).click()
        await page.locator('[data-scene="selector"]').waitFor()
        results.push(mode.name + ': tour-to-selector')

        // Physical bagel station opens pack configuration immediately.
        await freshExplore(page, traffic)
        await page.locator('.tour-start-button').click()
        await page.locator('.guided-tour-panel').getByRole('button', { name: /Siguiente/ }).click()
        await page.locator('.guided-tour-panel').getByRole('button', { name: /Siguiente/ }).click()
        await page.locator('[data-tour-node="bagels"]').waitFor()
        await page.locator('.guided-tour-panel').getByRole('button', { name: /Armar pedido/ }).click()
        await page.locator('[data-scene="pack-size"]').waitFor()
        results.push(mode.name + ': bagels-to-pack-configuration')

        // Physical schmear station opens the correct size and flavor flow.
        await freshExplore(page, traffic)
        await page.locator('.tour-start-button').click()
        for(let i=0;i<3;i++){
          await page.locator('.guided-tour-panel').getByRole('button', { name: /Siguiente/ }).click()
        }
        await page.locator('[data-tour-node="schmears"]').waitFor()
        await page.locator('.guided-tour-panel').getByRole('button', { name: /Armar pedido/ }).click()
        await page.locator('[data-scene="schmear-size"]').waitFor()
        results.push(mode.name + ': schmears-to-size-configuration')

      } catch (err) {
        failures.push(mode.name + ' FLOW_STOP: ' + String(err))
      } finally {
        for (const read of traffic.reads.filter(read => read.status >= 400)) failures.push(mode.name + ' HTTP ' + read.status + ': ' + read.url)
        for (const blocked of traffic.blocked) failures.push(mode.name + ' BLOCKED: ' + JSON.stringify(blocked))
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
  writeFileSync(resolve(output, 'tour-results.json'), JSON.stringify({ results, failures, diagnostics }, null, 2))
  console.log(results.length + ' checks; ' + failures.length + ' failures')
  if (failures.length) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  }
}

audit().catch((err) => { console.error(err); process.exitCode = 1 })
