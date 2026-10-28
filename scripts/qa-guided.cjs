/**
 * Bagelito visual journey smoke QA. Run only against a non-production preview
 * with BAGELITO_VISUAL_QA_ENABLED=true and all payment intake disabled.
 * Install locally: npm i --no-save playwright@1.56.1 && npx playwright install chromium
 * Run: BASE_URL=http://localhost:4173 npm run qa:guided
 */
const { chromium } = require('playwright')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const base = (process.env.BASE_URL || 'http://localhost:4173').replace(/\/$/, '')
const output = resolve(process.env.QA_OUTPUT || 'qa-artifacts')
const modes = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
]
mkdirSync(output, { recursive: true })

async function audit() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const results = []
  const failures = []
  try {
    for (const mode of modes) {
      const page = await browser.newPage({ viewport: mode.viewport, deviceScaleFactor: 1 })
      page.on('pageerror', (err) => failures.push(mode.name + ': ' + err.message))
      page.on('console', (event) => {
        if (event.type() === 'error') failures.push(mode.name + ': ' + event.text())
      })

      async function visit() {
        await page.goto(base + '/?qa=1', { waitUntil: 'networkidle' })
        await page.locator('[data-scene="entrance"]').waitFor()
        const qaEnabled = await page.locator('[data-qa="true"]').count()
        if (!qaEnabled) throw Error('Visual QA is not enabled. Do not use payment bypass on production.')
      }
      async function scene(key, name) {
        await page.locator('[data-scene="' + key + '"]').waitFor()
        const brokenImages = await page.evaluate(() => [...document.images]
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.src))
        const widths = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
        }))
        if (brokenImages.length) failures.push(mode.name + '/' + name + ': broken images ' + brokenImages.join(', '))
        if (widths.document > widths.viewport + 2) failures.push(mode.name + '/' + name + ': overflow')
        await page.screenshot({ path: resolve(output, mode.name + '-' + name + '.png') })
        results.push({ mode: mode.name, scene: name, pass: !brokenImages.length && widths.document <= widths.viewport + 2 })
      }

      await visit()
      await scene('entrance', '01-entrance')
      await page.getByRole('button', { name: /Entrar a Bagelito/i }).click()
      await scene('selector', '02-selector')
      await page.getByRole('button', { name: 'Packs', exact: true }).click()
      await scene('pack-size', '03-pack-size')
      await page.locator('.pack-format-grid button').first().click()
      await scene('pack-qty', '04-pack-quantity')
      await page.locator('.pack-choice-grid button').first().click()
      await scene('bagels', '05-bagels')
      for (let i = 0; i < 6; i++) {
        const selector = mode.name === 'mobile' ? '.mobile-bagel-card > button' : '.bagel-hotspots > button'
        await page.locator(selector).nth(i % 3).click()
      }
      await scene('bagels', '06-bagels-selected')
      await page.getByRole('button', { name: /Continuar/ }).last().click()
      await scene('schmears', '07-schmears')
      await page.getByRole('button', { name: /Ir a caja/ }).click()
      await scene('cashier', '08-cashier')
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
      await page.close()
    }
  } finally {
    await browser.close()
  }
  writeFileSync(resolve(output, 'results.json'), JSON.stringify({ results, failures }, null, 2))
  console.log(results.length + ' scene checks; ' + failures.length + ' failures.')
  if (failures.length) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  }
}
audit().catch((err) => { console.error(err); process.exitCode = 1 })
