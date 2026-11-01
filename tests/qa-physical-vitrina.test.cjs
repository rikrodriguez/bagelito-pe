/** Offline geometry tests for the read-only QA measurement; no browser/GPU. */
const test = require('node:test')
const assert = require('node:assert/strict')
const THREE = require('three')
const { readPhysicalScene } = require('../scripts/qa-physical-vitrina.cjs')

function fixture({ fibre = false } = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 390 / 844, .05, 70)
  camera.position.set(0, 3.5, 10); camera.lookAt(0, 1.5, 0); camera.updateMatrixWorld()
  const groups = []
  for (const [x, y] of [[-1.2, 1.7], [0, 1.7], [1.2, 1.7], [-.6, 1], [.6, 1]]) {
    const group = new THREE.Group(); group.position.set(x, y, 0); group.rotation.x = .23
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(.41, .34, .19, 24), new THREE.MeshStandardMaterial({ color: '#c4c5ba' })))
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.365, .365, .035, 24), new THREE.MeshStandardMaterial({ color: '#eee8dd' })); base.position.y = .108; group.add(base)
    const cream = new THREE.Mesh(new THREE.SphereGeometry(.345, 20, 12), new THREE.MeshStandardMaterial({ color: '#eee8dd' })); cream.position.y = .14; cream.scale.set(1, .38, 1); group.add(cream)
    scene.add(group); groups.push(group)
  }
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(5, 1), new THREE.MeshBasicMaterial({ color: '#004aad' })); logo.name = 'approved-reference-logo-crop'; logo.position.set(0, 4.5, -3); scene.add(logo)
  const canvas = { isConnected: true, getBoundingClientRect: () => ({ x: 0, y: 0, right: 390, bottom: 844, width: 390, height: 844 }) }
  const state = { scene, camera, gl: { domElement: canvas }, raycaster: new THREE.Raycaster(), internal: { active: true }, clock: { elapsedTime: 1 } }
  state.get = () => state
  if (fibre) canvas.__reactFiber$offline = { return: { memoizedState: { memoizedState: { current: state }, next: null } } }
  else canvas.__r3f = { root: { getState: () => state } }
  const update = () => { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true) }
  const read = () => {
    update(); const previous = global.document; global.document = { querySelector: selector => selector === '.playable-shell canvas' ? canvas : null }
    try { return readPhysicalScene() } finally { if (previous === undefined) delete global.document; else global.document = previous }
  }
  function blocker(material) {
    update()
    const center = groups[1].children[2].getWorldPosition(new THREE.Vector3())
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.35, .35), material); mesh.position.copy(camera.position).lerp(center, .5); mesh.quaternion.copy(camera.quaternion); scene.add(mesh)
    return mesh
  }
  return { scene, camera, canvas, state, logo, groups, read, blocker }
}

test('five real cream centres and nonempty silhouette samples are required', () => {
  const f = fixture(), result = f.read()
  assert.equal(result.bowls.length, 5); assert.equal(result.clearCreamCentres, 5)
  assert.ok(result.bowls.every(b => b.centre.intersectsCream && b.sampledCreamPoints > 0 && b.centre.target.material.solid))
  assert.equal(result.logo.corners.length, 4); assert.equal(result.logo.insideCorners, 4)
})

test('opaque blocker is attributed to an external mesh before the cream', () => {
  const f = fixture(), blocker = f.blocker(new THREE.MeshStandardMaterial({ color: '#004aad' })), result = f.read()
  assert.equal(result.clearCreamCentres, 4)
  const blocked = result.bowls.filter(b => !b.centre.visibleCream)
  assert.equal(blocked.length, 1); assert.equal(blocked[0].centre.firstSolidBlocker.uuid, blocker.uuid); assert.equal(blocked[0].centre.firstSolidBlocker.sameBowl, false)
  assert.ok(blocked[0].centre.firstSolidBlocker.distance < blocked[0].centre.target.distance)
})

test('transmission glass is recorded without becoming an opaque blocker', () => {
  const f = fixture(); f.blocker(new THREE.MeshPhysicalMaterial({ color: '#fff8e9', transmission: .94, transparent: true, opacity: .045 })); const result = f.read()
  assert.equal(result.clearCreamCentres, 5)
  assert.ok(result.bowls.some(b => b.centre.transparentBefore.some(h => h.material.transmission === .94 && !h.material.solid)))
})

test('transparent flag alone does not hide opaque photo or POS material', () => {
  const f = fixture(); f.blocker(new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, alphaTest: .2 })); const result = f.read()
  assert.equal(result.clearCreamCentres, 4)
  assert.equal(result.bowls.find(b => !b.centre.visibleCream).centre.firstSolidBlocker.material.alphaTest, .2)
})

test('hidden ancestors are excluded and the existing Canvas fibre ref works', () => {
  const f = fixture({ fibre: true }), blocker = f.blocker(new THREE.MeshStandardMaterial()), hidden = new THREE.Group(); hidden.visible = false; hidden.add(blocker); f.scene.add(hidden)
  const result = f.read(); assert.equal(result.clearCreamCentres, 5); assert.equal(result.access, 'canvas React fiber ancestor existing rootState ref')
})

test('offscreen or behind-camera logo corners cannot count as fully projected', () => {
  const f = fixture(); f.logo.position.x = -12
  assert.ok(f.read().logo.insideCorners < 4)
  f.logo.position.set(0, 4.5, 20)
  const result = f.read(); assert.equal(result.logo.insideCorners, 0); assert.ok(result.logo.corners.every(c => !c.front))
})

test('hidden cream children cannot supply target hits or visibility samples', () => {
  const f = fixture(); for (const group of f.groups) for (const mesh of group.children.slice(1)) mesh.visible = false
  assert.throws(() => f.read(), /real cream surface/)
})

test('opacity below one without transparent blending still blocks the cream', () => {
  const f = fixture(); f.blocker(new THREE.MeshStandardMaterial({ opacity: .5, transparent: false }))
  const result = f.read(); assert.equal(result.clearCreamCentres, 4)
  assert.equal(result.bowls.find(b => !b.centre.visibleCream).centre.firstSolidBlocker.material.solid, true)
})

test('hidden or fully transparent logo material cannot pass through projection alone', () => {
  const f = fixture(); f.logo.material.visible = false
  assert.throws(() => f.read(), /visible opaque material/)
  f.logo.material.visible = true; f.logo.material.transparent = true; f.logo.material.opacity = 0
  assert.throws(() => f.read(), /visible opaque material/)
})
