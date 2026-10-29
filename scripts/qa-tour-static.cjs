/**
 * No-dependency verification for the physical Bagelito visit and commercial
 * handoff. This runs even when Vercel Sandbox / Playwright are unavailable.
 * This is structural QA, not a screenshot or payment acceptance test.
 */
const assert = require('node:assert/strict')
const { readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const three = readFileSync(join(root, 'src/playable/PlayableStore.tsx'), 'utf8')
const guided = readFileSync(join(root, 'src/playable/GuidedCommerce.tsx'), 'utf8')
const styling = readFileSync(join(root, 'src/playable/playable.css'), 'utf8')
const qaTour = readFileSync(join(root, 'scripts/qa-world-tour.cjs'), 'utf8')
const menu = JSON.parse(readFileSync(join(root, 'src/domain/data/verified-menu-2026-10-21.json'), 'utf8'))
const checks = []

function check(name, fn) {
  fn()
  checks.push(name)
}

check('Exact seven guided physical stops', () => {
  const stops = [...three.matchAll(/\{node:'([^']+)', title:/g)].map(x => x[1])
  assert.deepEqual(stops, ['totem', 'vitrina', 'bagels', 'schmears', 'production', 'cashier', 'pickup'])
  for (const stop of stops) assert.match(three, new RegExp('\\b' + stop + ':\\{position:new THREE\\.Vector3'))
})

check('Eight genuine bagel product textures, no panorama', () => {
  assert.match(three, /function BagelShowcaseProduct/)
  assert.match(three, /BagelShowcaseProduct flavorId=\{bagel\.id\}/)
  assert.doesNotMatch(three, /useTexture\('\/images\/bagel-vitrina-photo\.webp'\)/)
  for (const flavor of menu.bagels) {
    assert.equal(existsSync(join(root, 'public/images/bagel-' + flavor.id + '.webp')), true, flavor.id)
  }
})

check('Five physical schmear pans and labels', () => {
  assert.equal(menu.schmears.length, 5)
  assert.match(three, /function SchmearBowl/)
  assert.match(three, /SchmearBowl position=\{\[x,y\+\.05,z\]\}/)
  assert.match(three, /className="schmear-3d-sign"/)
  assert.doesNotMatch(three, /useTexture\('\/images\/store-reference-approved\.webp'\)/)
})

check('Approved blue-background white-letter bagel signage', () => {
  assert.match(three, /className="bagelito-3d-blue-sign"/)
  assert.match(styling, /\.bagelito-3d-blue-sign>div/)
  assert.match(styling, /background:#004aad/)
  assert.match(styling, /color:#fff/)
})

check('No stuck motion in camera stops', () => {
  assert.match(three, /if\(experienceMode!=='explore' \|\| introGuide!==null \|\| category!==null\)/)
  assert.match(three, /window\.addEventListener\('blur',release\)/)
  assert.doesNotMatch(three, /\[experienceMode,guideNode\]/)
  assert.match(three, /camera\.position\.lerp\(node\.position,alpha\)/)
})

check('Collision shields and correct strafing', () => {
  assert.match(three, /function canWalkAt/)
  assert.match(three, /if\(canWalkAt\(nextX,pos\.current\.z\)\)/)
  assert.match(three, /if\(canWalkAt\(pos\.current\.x,nextZ\)\)/)
  assert.match(three, /r\.set\(-f\.z,0,f\.x\)/)
})

check('3D product tap enters matching guided category', () => {
  assert.match(three, /if\(introGuide==='bagels'\)/)
  assert.match(three, /enterGuided\('packs'\)/)
  assert.match(three, /if\(introGuide==='schmears'\)/)
  assert.match(three, /enterGuided\('schmears'\)/)
  assert.match(guided, /skipEntrance \? 'selector' : 'entrance'/)
  assert.match(three, /browseOnly=\{inspectOnly\}/)
})

check('3D failures return the customer to functional guided shopping', () => {
  assert.match(three, /class Store3DErrorBoundary extends Component/)
  assert.match(three, /onRecover=\{\(\)=>enterGuided\(null\)\}/)
  assert.match(styling, /\.store-3d-fallback/)
  assert.match(three, /window\.localStorage\.getItem/)
  assert.match(three, /Storage may be disabled in a private mobile browser/)
})

check('Unfinished cart can resume without storing personal or payment data', () => {
  assert.match(guided, /GUIDED_DRAFT_KEY/)
  assert.match(guided, /window\.sessionStorage\.setItem\(GUIDED_DRAFT_KEY/)
  assert.match(guided, /window\.sessionStorage\.removeItem\(GUIDED_DRAFT_KEY/)
  assert.match(guided, /setDraftLoaded\(true\)/)
  assert.doesNotMatch(guided, /sessionStorage\.setItem\([^\n]*checkoutCustomer/)
})

check('Payment remains gated', () => {
  assert.match(guided, /checkoutQuote\?\.checkoutAllowed/)
  assert.match(guided, /const canPayOnline = paymentConfig\?\.enabled === true/)
  assert.match(guided, /manualOrderHref/)
  assert.match(guided, /Consultar mi pedido por WhatsApp/)
  assert.match(guided, /Sin pago ni reserva automática/)
  assert.match(guided, /qaMode/)
})

check('Playwright tests cover 3D-to-commerce handoff', () => {
  assert.match(qaTour, /bagels-to-pack-configuration/)
  assert.match(qaTour, /schmears-to-size-configuration/)
  assert.match(qaTour, /3D showcase does not load all eight individual real bagel photos/)
})

console.log('Bagelito structural QA: ' + checks.length + '/' + checks.length + ' passed')
for (const item of checks) console.log('  OK ' + item)
console.log('This does not replace rendering, responsive screenshot comparison or Culqi sandbox tests.')
