/**
 * Bagelito 3D tour browser QA. Test only on an isolated preview.
 * Requires the optional Playwright browser install used by qa:guided.
 */
const { chromium } = require('playwright')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const base = (process.env.BASE_URL || 'http://localhost:4173').replace(/\/$/, '')
const output = resolve(process.env.QA_OUTPUT || 'qa-artifacts')
mkdirSync(output, { recursive: true })

const stops = ['totem', 'vitrina', 'bagels', 'schmears', 'cashier']

async function audit() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  })
  const failures = []
  const results = []
  try {
    for (const mode of [
      { name: 'desktop', viewport: { width: 1280, height: 800 } },
      { name: 'mobile', viewport: { width: 390, height: 844 } },
    ]) {
      const page = await browser.newPage({ viewport: mode.viewport, deviceScaleFactor: 1 })
      page.on('pageerror', (err) => failures.push(mode.name + ' JS: ' + err.message))
      try {
        await page.goto(base + '/playable', { waitUntil: 'domcontentloaded' })
        await page.locator('canvas').waitFor({ timeout: 30000 })
        await page.locator('.tour-start-button').waitFor({ timeout: 30000 })

        if (mode.name === 'desktop') {
          const initialX = Number(await page.locator('.playable-shell').getAttribute('data-player-x'))
          await page.keyboard.down('d')
          await page.waitForTimeout(480)
          await page.keyboard.up('d')
          await page.waitForTimeout(100)
          const movedX = Number(await page.locator('.playable-shell').getAttribute('data-player-x'))
          if (!(Number.isFinite(initialX) && movedX > initialX + .12)) {
            failures.push('Right strafe does not move in the correct direction.')
          }
        }

        await page.locator('.tour-start-button').click()
        const panel = page.getByLabel('Recorrido guiado por Bagelito')
        await panel.waitFor()

        for (let i = 0; i < stops.length; i++) {
          await page.locator('[data-tour-node="' + stops[i] + '"]').waitFor()
          await page.waitForTimeout(320)
          await page.screenshot({ path: resolve(output, mode.name + '-tour-' + (i+1) + '-' + stops[i] + '.png') })
          results.push(mode.name + ': ' + stops[i])
          if (i < stops.length - 1) {
            await panel.getByRole('button', { name: /Siguiente/ }).click()
          }
        }

        await panel.getByRole('button', { name: /Anterior/ }).click()
        await page.locator('[data-tour-node="schmears"]').waitFor()
        await panel.getByRole('button', { name: /Siguiente/ }).click()
        await page.locator('[data-tour-node="cashier"]').waitFor()
        await panel.getByRole('button', { name: /Terminar visita/ }).click()
        await page.locator('[data-tour-node="none"]').waitFor()
        if (await panel.count()) failures.push(mode.name + ': tour overlay was not dismissed.')

        await page.locator('.tour-start-button').click()
        await panel.getByRole('button', { name: /Armar pedido/ }).click()
        await page.locator('[data-scene="entrance"]').waitFor()
        results.push(mode.name + ': tour-to-commerce')

      } catch (err) {
        failures.push(mode.name + ' FLOW_STOP: ' + String(err))
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
  writeFileSync(resolve(output, 'tour-results.json'), JSON.stringify({ results, failures }, null, 2))
  console.log(results.length + ' checks; ' + failures.length + ' failures')
  if (failures.length) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  }
}

audit().catch((err) => { console.error(err); process.exitCode = 1 })
