const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const ts = require('typescript')

// Load the real pure TypeScript module without adding a test-only runtime dependency.
const compiled = ts.transpileModule(readFileSync(resolve(__dirname, '../src/playable/movement-input.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const exported = {}
new Function('exports', compiled)(exported)
const { createMovementInput } = exported
const almost = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
const distance = slices => slices.reduce((sum, slice) => sum + Math.hypot(slice.forward, slice.right) * slice.seconds, 0)

test('a 480ms right hold survives keyup before the first rendered frame', () => {
  const input = createMovementInput(0)
  input.set('keyboard:KeyD', 'right', true, 0)
  input.set('keyboard:KeyD', 'right', false, 480)
  assert.deepEqual(input.consume(2000), [{forward: 0, right: 1, run: false, seconds: .48}])
  assert.deepEqual(input.consume(3000), [], 'completed input must never be replayed')
})

test('sampling frames during a hold does not double-count time when keyup arrives', () => {
  const input = createMovementInput(0)
  input.set('keyboard:KeyD', 'right', true, 0)
  const first = input.consume(200)
  input.set('keyboard:KeyD', 'right', false, 480)
  const second = input.consume(1000)
  almost(distance([...first, ...second]), .48)
  almost(first[0].seconds, .2)
  almost(second[0].seconds, .28)
})

test('repeat keydown events preserve one continuous hold rather than adding impulses', () => {
  const input = createMovementInput(0)
  input.set('keyboard:KeyD', 'right', true, 0)
  input.set('keyboard:KeyD', 'right', true, 120)
  input.set('keyboard:KeyD', 'right', true, 240)
  input.set('keyboard:KeyD', 'right', false, 480)
  const slices = input.consume(900)
  assert.equal(slices.length, 1)
  almost(distance(slices), .48)
})

test('releasing one alias or pointer source leaves another held source active', () => {
  const input = createMovementInput(0)
  input.set('keyboard:KeyW', 'forward', true, 0)
  input.set('keyboard:ArrowUp', 'forward', true, 100)
  input.set('keyboard:KeyW', 'forward', false, 200)
  input.set('pad:forward', 'forward', true, 300)
  input.set('keyboard:ArrowUp', 'forward', false, 400)
  input.set('pad:forward', 'forward', false, 480)
  const slices = input.consume(1000)
  assert.equal(slices.length, 1)
  almost(distance(slices), .48)
  assert.equal(slices[0].forward, 1)
})

test('diagonal movement has unit length and opposing directions cancel over each interval', () => {
  const input = createMovementInput(0)
  input.set('keyboard:KeyW', 'forward', true, 0)
  input.set('keyboard:KeyD', 'right', true, 0)
  const diagonal = input.consume(200)
  almost(Math.hypot(diagonal[0].forward, diagonal[0].right), 1)
  almost(diagonal[0].forward, Math.SQRT1_2)
  almost(diagonal[0].right, Math.SQRT1_2)
  input.set('keyboard:KeyS', 'backward', true, 200)
  input.set('keyboard:KeyA', 'left', true, 200)
  assert.deepEqual(input.consume(400), [])
  input.set('keyboard:KeyS', 'backward', false, 400)
  input.set('keyboard:KeyA', 'left', false, 400)
  almost(distance(input.consume(600)), .2)
})

test('run transitions retain their own elapsed intervals and modifier aliases', () => {
  const input = createMovementInput(0)
  input.set('keyboard:KeyD', 'right', true, 0)
  input.set('keyboard:ShiftLeft', 'run', true, 100)
  input.set('keyboard:ShiftRight', 'run', true, 200)
  input.set('keyboard:ShiftLeft', 'run', false, 300)
  input.set('keyboard:ShiftRight', 'run', false, 400)
  input.set('keyboard:KeyD', 'right', false, 480)
  const slices = input.consume(1000)
  assert.deepEqual(slices.map(slice => slice.run), [false, true, false])
  almost(slices[0].seconds, .1)
  almost(slices[1].seconds, .3)
  almost(slices[2].seconds, .08)
  almost(slices.reduce((sum, slice) => sum + slice.seconds * (slice.run ? 4 : 2.45), 0), 1.641)
})

test('reset discards held inputs and queued travel before a later fresh press', () => {
  const input = createMovementInput(0)
  input.set('keyboard:KeyD', 'right', true, 0)
  input.set('keyboard:KeyD', 'right', false, 120)
  input.set('keyboard:KeyW', 'forward', true, 150)
  input.reset(200)
  assert.deepEqual(input.consume(2000), [])
  input.set('keyboard:KeyA', 'left', true, 2100)
  input.set('keyboard:KeyA', 'left', false, 2200)
  assert.deepEqual(input.consume(2300), [{forward: 0, right: -1, run: false, seconds: .1}])
})

test('a long frame stalls at the configured travel budget rather than building an unbounded backlog', () => {
  const input = createMovementInput(0)
  input.set('keyboard:KeyD', 'right', true, 0)
  input.set('keyboard:KeyD', 'right', false, 10000)
  almost(distance(input.consume(20000)), 1)
  assert.deepEqual(input.consume(30000), [])
  const shortBudget = createMovementInput(0, .25)
  shortBudget.set('pad:right', 'right', true, 0)
  shortBudget.set('pad:right', 'right', false, 480)
  almost(distance(shortBudget.consume(1000)), .25)
})

test('the input clock is monotonic and rejects non-finite timestamps or invalid budgets', () => {
  const input = createMovementInput(100)
  input.set('keyboard:KeyD', 'right', true, 0)
  input.set('keyboard:KeyD', 'right', false, 200)
  almost(distance(input.consume(300)), .1)
  assert.throws(() => input.consume(NaN), /finite/)
  assert.throws(() => createMovementInput(0, 0), /positive/)
  assert.throws(() => createMovementInput(0, Infinity), /finite/)
})
