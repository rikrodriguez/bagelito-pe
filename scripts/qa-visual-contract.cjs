/** Source/asset contract only. No browser, server, provider or payment calls.
 * This checks the declared scene construction, not its rendered appearance,
 * readable text, crop pixels, frame rate, hit targets or camera framing.
 */
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve, dirname } = require('node:path')
const ts = require('typescript')

const root = join(__dirname, '..')
const read = path => readFileSync(join(root, path), 'utf8')
const sceneText = read('src/playable/PlayableStore.tsx')
const guidedText = read('src/playable/GuidedCommerce.tsx')
const architectureText = read('src/playable/StoreArchitectureVisual.tsx')
const parse = (path, text) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const scene = parse('PlayableStore.tsx', sceneText)
const guided = parse('GuidedCommerce.tsx', guidedText)
const architecture = parse('StoreArchitectureVisual.tsx', architectureText)
const menu = JSON.parse(read('src/domain/data/verified-menu-2026-10-21.json'))
const checks = []
const walk = (node, accept, found = []) => {
  if (accept(node)) found.push(node)
  ts.forEachChild(node, child => { walk(child, accept, found) })
  return found
}
const unwrap = node => ts.isAsExpression(node) || ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node
function literal(node) {
  node = unwrap(node)
  if (ts.isStringLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) return -literal(node.operand)
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => [p.name.getText(), literal(p.initializer)]))
  throw new Error('Expected a literal fixture, got ' + node.getText())
}
function variable(source, name) {
  const declarations = walk(source, node => ts.isVariableDeclaration(node) && node.name.getText() === name)
  assert.equal(declarations.length, 1, 'Expected one variable ' + name)
  return declarations[0].initializer
}
function fn(source, name) {
  const nodes = walk(source, node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.equal(nodes.length, 1, 'Expected one function ' + name)
  return nodes[0]
}
function check(name, effect) { effect(); checks.push(name) }
const opening = node => ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
const tags = (node, name) => walk(node, child => opening(child)?.tagName.getText() === name)
const attribute = (element, name) => opening(element).attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText() === name)?.initializer

const expectedBagels = [
  ['plain', 'Plain'], ['everything', 'Everything'], ['sesame', 'Sesame'], ['classic-onion', 'Classic Onion'],
  ['jalapeno-cheddar', 'Jalapeño Cheddar'], ['cheddar', 'Cheddar'], ['cinnamon-raisin', 'Cinnamon Raisin'], ['blueberry', 'Blueberry'],
]
const expectedSchmears = [
  ['whipped-original', 'Whipped Original'], ['aji-amarillo', 'Ají Amarillo'], ['herb-roasted-garlic', 'Herb & Roasted Garlic'],
  ['honey-cinnamon', 'Honey Cinnamon'], ['classic-strawberry', 'Classic Strawberry'],
]
const crop = literal(variable(architecture, 'LOGO_CROP'))
const imageSize = literal(variable(architecture, 'REFERENCE_SIZE'))
const referencePath = literal(variable(architecture, 'REFERENCE'))
const referenceBytes = readFileSync(join(root, 'public', referencePath))
const referenceSha = createHash('sha256').update(referenceBytes).digest('hex')
const manifest = { bagels: [], schmears: expectedSchmears.map(([id, name]) => ({ id, name })), reference: { path: referencePath, sha256: referenceSha, crop, imageSize } }

check('Exact verified eight bagel names and spatial order; exact five schmear names', () => {
  const order = literal(variable(guided, 'BAGEL_SHOWCASE_ORDER'))
  assert.deepEqual(order, expectedBagels.map(([id]) => id))
  assert.equal(menu.bagels.length, 8)
  assert.equal(menu.schmears.length, 5)
  assert.equal(new Set(order).size, 8)
  assert.deepEqual(menu.schmears.map(item => [item.id, item.name]), expectedSchmears)
  for (const [id, name] of expectedBagels) {
    assert.equal(menu.bagels.find(item => item.id === id)?.name, name)
    const path = '/images/bagel-' + id + '.webp'
    const bytes = readFileSync(join(root, 'public', path))
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
    manifest.bagels.push({ id, name, path, sha256: createHash('sha256').update(bytes).digest('hex'), productsPerTray: 6 })
  }
})

check('Eight catalog trays each construct six photographed products with shallow 3D geometry', () => {
  const tray = fn(scene, 'BagelCase').getText()
  assert.match(tray, /BAGEL_SHOWCASE_ORDER\.map\(\(flavorId,index\)=>/)
  assert.match(tray, /menu\.bagels\.find\(item=>item\.id===flavorId\)/)
  assert.equal(tags(fn(scene, 'BagelCase'), 'BagelShowcaseProduct').length, 1)
  assert.match(tray, /<BagelShowcaseProduct flavorId=\{bagel\.id\}/)
  const product = fn(scene, 'BagelShowcaseProduct')
  const arrays = walk(product, node => ts.isCallExpression(node) && node.expression.getText() === 'Array.from')
  assert.equal(arrays.length, 1)
  assert.deepEqual(literal(arrays[0].arguments[0]), { length: 6 })
  assert.match(product.getText(), /useTexture\('\/images\/bagel-'\+flavorId\+'\.webp'\)/)
  assert.equal(tags(product, 'torusGeometry').length, 1)
  assert.equal(tags(product, 'planeGeometry').length, 1)
  assert.match(product.getText(), /map=\{texture\} transparent alphaTest=/)
})

check('Exactly five mapped schmear pans; no sixth reference flavor added', () => {
  const schmears = fn(scene, 'SchmearCase')
  assert.equal(literal(variable(schmears, 'positions')).length, 5)
  assert.match(schmears.getText(), /menu\.schmears\.map\(\(item,index\)=>/)
  assert.equal(tags(schmears, 'SchmearBowl').length, 1)
  assert.match(schmears.getText(), /label=\{item\.name\}/)
})

check('Approved reference bytes, dimensions and bounded logo-only crop', () => {
  assert.equal(referenceSha, '0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9')
  assert.equal(referenceBytes.toString('ascii', 12, 16), 'VP8 ')
  assert.equal(referenceBytes.readUInt16LE(26) & 0x3fff, 1536)
  assert.equal(referenceBytes.readUInt16LE(28) & 0x3fff, 1024)
  assert.deepEqual(imageSize, { width: 1536, height: 1024 })
  assert.deepEqual(crop, { x: 485, y: 56, width: 730, height: 206 })
  // The headline begins below this rectangle; product cards start much lower.
  // Coordinate bounds do not substitute for reviewing the sampled crop pixels.
  assert.ok(crop.x >= 480 && crop.x + crop.width <= 1215 && crop.y + crop.height < 275)
  assert.ok(crop.width < imageSize.width / 2 && crop.height < imageSize.height / 3)
})

check('Logo is a cropped mesh texture, never a full photo/UI backdrop', () => {
  const component = fn(architecture, 'StoreArchitectureVisual')
  const named = tags(component, 'mesh').filter(mesh => attribute(mesh, 'name')?.text === 'approved-reference-logo-crop')
  assert.equal(named.length, 1)
  assert.equal(tags(named[0], 'planeGeometry').length, 1)
  assert.match(named[0].getText(), /map=\{logo\}/)
  assert.match(named[0].getText(), /assetRole: 'wall-logo-crop-only'/)
  assert.match(component.getText(), /texture\.repeat\.set\(LOGO_CROP\.width \/ REFERENCE_SIZE\.width, LOGO_CROP\.height \/ REFERENCE_SIZE\.height\)/)
  assert.match(component.getText(), /texture\.offset\.set\(LOGO_CROP\.x \/ REFERENCE_SIZE\.width, 1 - \(LOGO_CROP\.y \+ LOGO_CROP\.height\) \/ REFERENCE_SIZE\.height\)/)
  assert.equal(tags(architecture, 'Html').length, 0)
  assert.equal(tags(architecture, 'Text').length, 0)
  assert.doesNotMatch(architectureText, /https?:\/\//)
  assert.equal((architectureText.match(/map=\{logo\}/g) || []).length, 1)
  assert.match(fn(architecture, 'menuTexture').getText(), /menu\.bagels\.forEach\(item => name\(item\.name\)\)/)
  assert.match(fn(architecture, 'menuTexture').getText(), /menu\.schmears\.forEach\(item => name\(item\.name\)\)/)
  assert.doesNotMatch(fn(architecture, 'menuTexture').getText(), /\.price|\.premium|S\//)
})

check('Healthy store retains one Canvas across commerce; explicit GPU recovery can switch to DOM fallback', () => {
  const store = fn(scene, 'PlayableStore')
  const main = tags(store, 'main')[0]
  assert.ok(main)
  const boundary = tags(main, 'Store3DErrorBoundary')[0]
  assert.ok(boundary)
  const canvas = boundary.children.find(child => opening(child)?.tagName.getText() === 'Canvas')
  assert.ok(canvas, 'Canvas must be a direct, unconditional boundary child')
  const conditions = []
  for (let parent = boundary.parent; parent !== main; parent = parent.parent) {
    assert.ok(parent, 'The Canvas must remain inside the real store main')
    if (ts.isBinaryExpression(parent)) conditions.push(parent.left.getText())
    assert.equal(ts.isConditionalExpression(parent), false, 'No commerce-scene ternary may replace the Canvas')
  }
  assert.deepEqual(conditions, ['visualAvailable'], 'Only explicit GPU failure recovery may remove the world')
  assert.match(attribute(boundary, 'onRecover').getText(), /setVisualAvailable\(false\);enterGuided\(null\)/)
  assert.equal(tags(store, 'Canvas').length, 1)
  assert.equal(attribute(canvas, 'eventPrefix')?.text, 'client')
  assert.equal(tags(store, 'GoldenGuidedCommerce').length, 1)
  assert.equal(tags(fn(scene, 'World'), 'StoreArchitectureVisual').length, 1)
  assert.equal(tags(fn(scene, 'World'), 'StoreArchitecture').length, 0)
  assert.match(sceneText, /camera\.position\.lerp\(fittedPosition,alpha\)/)
})

check('Responsive fit uses the front display plane, with a finite scene diagnostic for callback readiness', () => {
  const controller = fn(scene, 'CameraController').getText()
  assert.match(controller, /width\/\(2\*Math\.tan\(THREE\.MathUtils\.degToRad\(fov\/2\)\)\*\(size\.width\/size\.height\)\)/)
  assert.match(controller, /fittedPosition\.z=Math\.max\(node\.position\.z,1\.5\+required\)/)
  assert.doesNotMatch(controller, /fittedPosition\.z=node\.lookAt\.z\+fittedDelta\.z\*scale/)
  assert.match(controller, /perspective\.updateProjectionMatrix\(\)/)
  const main = tags(fn(scene, 'PlayableStore'), 'main')[0]
  assert.match(attribute(main, 'data-world-scene').getText(), /experienceMode==='guided'\?commerceScene:'explore'/)
})

const report = { kind: 'source-and-asset-structure-only', checks, manifest, limitations: ['No rendered visual parity, framing or readability assertion', 'No browser interaction or payment/provider execution'] }
if (process.env.QA_VISUAL_OUTPUT) {
  const destination = resolve(process.env.QA_VISUAL_OUTPUT)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, JSON.stringify(report, null, 2))
}
console.log('Bagelito visual source/asset contract: ' + checks.length + '/' + checks.length + ' passed')
for (const name of checks) console.log('  OK ' + name)
console.log('Structural only: browser rendering, responsive framing and physical hit testing remain separate checks.')
