const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const ts = require('typescript')

// These are offline integration tests, not browser tests. They execute the
// production controller and keyboard effect with real Three.js vectors/camera.
// The seams below supply the R3F hooks, clock, and event registration only.
const root = resolve(__dirname, '..')
const storeSource = readFileSync(resolve(root, 'src/playable/PlayableStore.tsx'), 'utf8')
const storeTree = ts.createSourceFile('PlayableStore.tsx', storeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let THREE

test.before(async () => {
  THREE = await import('three')
})

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

const helper = {}
new Function('exports', transpile(readFileSync(resolve(root, 'src/playable/movement-input.ts'), 'utf8')))(helper)
const { createMovementInput } = helper

const controllerDeclarations = storeTree.statements.filter(node => {
  if (ts.isFunctionDeclaration(node)) return ['CameraController', 'canWalkAt'].includes(node.name?.text)
  return ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration =>
    ['WALK_BLOCKERS', 'GUIDED_CAMERAS', 'PORTRAIT_ENTRY_CAMERA'].includes(declaration.name.getText(storeTree)),
  )
}).map(node => node.getText(storeTree)).join('\n')

function controller(input, { guidedNode = null } = {}) {
  let frame
  let now = 0
  const camera = new THREE.PerspectiveCamera(56, 1.6, .05, 70)
  const published = []
  const hooks = {
    useThree: () => ({ camera, size: { width: 1280, height: 800 } }),
    useRef: current => ({ current }),
    useMemo: factory => factory(),
    useFrame: callback => { frame = callback },
  }
  const loadController = new Function(
    'THREE', 'useThree', 'useRef', 'useMemo', 'useFrame', 'performance',
    transpile(controllerDeclarations) + '\nreturn CameraController;',
  )
  const CameraController = loadController(
    THREE, hooks.useThree, hooks.useRef, hooks.useMemo, hooks.useFrame, { now: () => now },
  )
  CameraController({
    movementInput: input,
    look: { current: { yaw: 0, pitch: 0 } },
    guidedNode,
    onPosition: position => published.push({ x: position.x, z: position.z }),
    focusEntrance: false,
  })
  return {
    tick(at) {
      now = at
      frame({}, 2)
    },
    camera,
    published,
  }
}

let keyboardEffectSource
function findKeyboardEffect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(storeTree) === 'useEffect'
    && node.arguments[0]?.getText(storeTree).includes("'keyboard:'")) {
    keyboardEffectSource = node.arguments[0].getText(storeTree)
  }
  ts.forEachChild(node, findKeyboardEffect)
}
findKeyboardEffect(storeTree)
assert.ok(keyboardEffectSource, 'The production keyboard effect must be present')

function keyboardEffect(input, { experienceMode = 'explore', introGuide = null, category = null } = {}) {
  let now = 0
  const listeners = new Map()
  const documentListeners = new Map()
  const windowEvents = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: type => listeners.delete(type),
  }
  const documentEvents = {
    addEventListener: (type, handler) => documentListeners.set(type, handler),
    removeEventListener: type => documentListeners.delete(type),
  }
  class Element {
    constructor(editable = false) { this.editable = editable }
    closest() { return this.editable ? this : null }
  }
  const exported = {}
  const loadEffect = new Function(
    'exports', 'experienceMode', 'introGuide', 'category', 'movementInput',
    'performance', 'HTMLElement', 'window', 'document',
    transpile('export default ' + keyboardEffectSource),
  )
  loadEffect(
    exported, experienceMode, introGuide, category, input,
    { now: () => now }, Element, windowEvents, documentEvents,
  )
  const cleanup = exported.default()
  return {
    listeners,
    documentListeners,
    cleanup,
    emit(type, at, { editable = false, code = 'KeyD' } = {}) {
      now = at
      let prevented = false
      listeners.get(type)?.({
        code,
        target: new Element(editable),
        preventDefault() { prevented = true },
      })
      return prevented
    },
    at(at) { now = at },
  }
}

test('CameraController consumes a complete between-frame press once and publishes the resulting position', () => {
  const input = createMovementInput()
  const scene = controller(input)
  scene.tick(0)
  input.set('keyboard:KeyD', 'right', true, 0)
  input.set('keyboard:KeyD', 'right', false, 480)
  scene.tick(2000)
  assert.ok(Math.abs(scene.camera.position.x - 1.176) < 1e-9)
  assert.ok(scene.published.length > 0, 'Position telemetry must report the consumed movement')
  assert.ok(scene.published.at(-1).x > .12)
  const publications = scene.published.length
  scene.tick(4000)
  assert.equal(scene.published.length, publications)
  assert.ok(Math.abs(scene.camera.position.x - 1.176) < 1e-9, 'Completed input must not be replayed')
})

test('collision integration approaches the display, slides sideways, and respects the room bounds', () => {
  const input = createMovementInput()
  const scene = controller(input)
  scene.tick(0)
  input.set('keyboard:KeyW', 'forward', true, 0)
  input.set('keyboard:ShiftLeft', 'run', true, 0)
  for (let at = 1000; at <= 8000; at += 1000) scene.tick(at)
  assert.ok(scene.camera.position.z >= 1.52, 'The camera cannot enter the glass display')
  assert.ok(scene.camera.position.z < 2, 'Collision substeps must allow approaching the display')
  input.set('keyboard:KeyD', 'right', true, 8000)
  scene.tick(9000)
  assert.ok(scene.camera.position.x > 2)
  assert.ok(scene.camera.position.z >= 1.52, 'Diagonal motion must slide along the glass')
  input.set('keyboard:KeyW', 'forward', false, 9000)
  for (let at = 10000; at <= 20000; at += 1000) scene.tick(at)
  assert.equal(scene.camera.position.x, 7.15)
  assert.ok(Number.isFinite(scene.camera.position.z))
})

test('the guided controller discards queued and held free-roam movement', () => {
  const input = createMovementInput()
  const scene = controller(input, { guidedNode: 'entry' })
  input.set('keyboard:KeyD', 'right', true, 0)
  scene.tick(480)
  assert.deepEqual(input.consume(1000), [])
})

test('the keyboard handler ignores editable targets and still releases a key after focus changes', () => {
  const input = createMovementInput()
  const keyboard = keyboardEffect(input)
  assert.equal(keyboard.emit('keydown', 0, { editable: true }), false)
  keyboard.emit('keyup', 480, { editable: true })
  assert.deepEqual(input.consume(1000), [])
  assert.equal(keyboard.emit('keydown', 1000), true)
  keyboard.emit('keyup', 1480, { editable: true })
  assert.equal(input.consume(2000)[0].seconds, .48)
  keyboard.cleanup()
})

test('blur, visibility, cleanup, and guided setup discard movement across a five-minute inactive clock gap', () => {
  const inactiveGap = 5 * 60 * 1000
  for (const release of ['blur', 'visibilitychange', 'cleanup']) {
    const input = createMovementInput()
    const keyboard = keyboardEffect(input)
    keyboard.emit('keydown', 0)
    keyboard.emit('keyup', 120)
    keyboard.emit('keydown', 150)
    keyboard.at(200)
    if (release === 'cleanup') keyboard.cleanup()
    else if (release === 'blur') keyboard.listeners.get('blur')()
    else keyboard.documentListeners.get('visibilitychange')()
    assert.deepEqual(input.consume(200 + inactiveGap), [], release + ' must discard pending and held input')
    if (release === 'cleanup') {
      assert.equal(keyboard.listeners.size, 0)
      assert.equal(keyboard.documentListeners.size, 0)
    } else {
      keyboard.emit('keydown', 300 + inactiveGap)
      keyboard.emit('keyup', 780 + inactiveGap)
      assert.equal(input.consume(1000 + inactiveGap)[0].seconds, .48, 'A fresh press must exclude inactive time')
      keyboard.cleanup()
    }
  }
  const input = createMovementInput()
  input.set('keyboard:KeyD', 'right', true, 0)
  input.set('keyboard:KeyD', 'right', false, 480)
  const guided = keyboardEffect(input, { experienceMode: 'guided' })
  assert.equal(guided.listeners.size, 0)
  assert.deepEqual(input.consume(480 + inactiveGap), [])
})
