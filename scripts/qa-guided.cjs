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
      }
      async function scene(key, name) {
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
        await page.screenshot({ path: resolve(output, mode.name + '-' + name + '.png'), animations:'disabled' })
        results.push({ mode: mode.name, scene: name, pass: !brokenImages.length && widths.document <= widths.viewport + 2 })
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

      const orderHolderText = await page.locator('.guided-store-cart-button>span').textContent()
      if (orderHolderText !== 'Tu pedido (6)') {
        failures.push(mode.name + ': order holder did not update to six selected bagels')
      }
      await page.getByRole('button', { name: /Continuar/ }).last().click()
      await scene('schmears', '07-schmears')
      const optionalSchmear = mode.name === 'mobile'
        ? page.locator('.mobile-schmear-card > button').first()
        : page.locator('.schmear-hotspots > button').first()
      await optionalSchmear.click()
      if (await page.locator('.guided-store-cart-button>span').textContent() !== 'Tu pedido (7)') {
        failures.push(mode.name + ': optional schmear not added to live order count')
      }
      await optionalSchmear.click()
      if (await page.locator('.guided-store-cart-button>span').textContent() !== 'Tu pedido (6)') {
        failures.push(mode.name + ': optional schmear could not be removed again')
      }
      const schmearLabels = await page.locator('.schmear-hotspots > button')
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
