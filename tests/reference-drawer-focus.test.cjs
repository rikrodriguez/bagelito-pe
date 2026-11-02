const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const file = path.join(__dirname, '../src/reference/reference-drawer-focus.ts')
const moduleObject = {exports: {}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {module: moduleObject, exports: moduleObject.exports})
const {containReferenceDrawerFocus} = moduleObject.exports

// Minimal event/element contract, not a browser emulator. Native-browser
// verification separately covers real inert/Tab/focus/scroll behavior.
function fixture() {
  const listeners = new Map()
  const doc = {activeElement: null,
    defaultView: {getComputedStyle: element => ({visibility: element.visibility})},
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name, handler) => {if (listeners.get(name) === handler) listeners.delete(name)},
  }
  function element(parent = null, className = '') {
    const value = {parent, ownerDocument: doc, inert: false, isConnected: true, tabIndex: 0,
      disabled: false, visible: true, visibility: 'visible', focusCalls: [], children: [], controls: [],
      classList: {contains: name => className.split(' ').includes(name)},
      matches: () => value.disabled,
      getClientRects: () => value.visible ? [{}] : [],
      querySelectorAll: () => value.controls,
      contains: child => {for (let node = child; node; node = node.parent) if (node === value) return true; return false},
      closest: () => {for (let node = value; node; node = node.parent) if (node.inert) return node; return null},
      focus: options => {value.focusCalls.push(options); if (!value.closest('[inert]')) doc.activeElement = value},
    }
    if (parent) parent.children.push(value)
    return value
  }
  const root = element(), background = element(root), trigger = element(background), previousInert = element(root)
  previousInert.inert = true
  const dismiss = element(root, 'guided-overlay-dismiss'), panel = element(root)
  panel.tabIndex = -1
  const first = element(panel), middle = element(panel), last = element(panel)
  panel.controls = [first, middle, last]
  doc.activeElement = trigger
  function key(input = {}) {
    const event = {key: 'Tab', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
      defaultPrevented: false, prevented: false, ...input, preventDefault() {this.prevented = true}}
    listeners.get('keydown')?.(event)
    return event
  }
  return {root, background, trigger, previousInert, dismiss, panel, first, middle, last, doc, listeners, element, key,
    open: () => containReferenceDrawerFocus(root, panel, trigger)}
}

test('opening focuses the first action and isolates only background siblings', () => {
  const f = fixture(); const close = f.open()
  assert.equal(f.doc.activeElement, f.first)
  assert.equal(f.background.inert, true); assert.equal(f.previousInert.inert, true)
  assert.equal(f.panel.inert, false); assert.equal(f.dismiss.inert, false)
  assert.equal(f.first.focusCalls[0].preventScroll, true)
  close()
})

test('forward and reverse Tab wrap at drawer boundaries', () => {
  const f = fixture(); const close = f.open()
  f.doc.activeElement = f.last; assert.equal(f.key().prevented, true); assert.equal(f.doc.activeElement, f.first)
  assert.equal(f.key({shiftKey: true}).prevented, true); assert.equal(f.doc.activeElement, f.last)
  close()
})

test('middle actions retain ordinary native Tab behavior', () => {
  const f = fixture(); const close = f.open(); f.doc.activeElement = f.middle
  assert.equal(f.key().prevented, false); assert.equal(f.key({shiftKey: true}).prevented, false)
  assert.equal(f.doc.activeElement, f.middle); close()
})

test('empty drawers focus the fallback panel rather than background', () => {
  const f = fixture(); f.panel.controls = []; const close = f.open()
  assert.equal(f.doc.activeElement, f.panel); assert.equal(f.key().prevented, true)
  assert.equal(f.doc.activeElement, f.panel); close()
})

test('disabled, hidden and negative-tabindex controls are excluded on every key event', () => {
  const f = fixture(); f.first.disabled = true; f.middle.visible = false
  const close = f.open(); assert.equal(f.doc.activeElement, f.last)
  f.first.disabled = false; f.first.tabIndex = -1; f.middle.visible = true; f.middle.visibility = 'hidden'
  assert.equal(f.key().prevented, true); assert.equal(f.doc.activeElement, f.last)
  f.middle.visibility = 'visible'
  assert.equal(f.key().prevented, true); assert.equal(f.doc.activeElement, f.middle)
  close()
})

test('stray focus and focus on the panel return to the appropriate boundary', () => {
  const f = fixture(); const close = f.open(); f.doc.activeElement = f.trigger
  assert.equal(f.key().prevented, true); assert.equal(f.doc.activeElement, f.first)
  f.doc.activeElement = f.panel
  assert.equal(f.key({shiftKey: true}).prevented, true); assert.equal(f.doc.activeElement, f.last)
  close()
})

test('non-Tab, modified Tab and previously handled keys remain untouched', () => {
  const f = fixture(); const close = f.open(); f.doc.activeElement = f.last
  for (const input of [{key: 'Escape'}, {ctrlKey: true}, {altKey: true}, {metaKey: true}, {defaultPrevented: true}]) {
    assert.equal(f.key(input).prevented, false); assert.equal(f.doc.activeElement, f.last)
  }
  close()
})

test('cleanup restores original inert state before returning focus without scroll', () => {
  const f = fixture(); const close = f.open(); close()
  assert.equal(f.background.inert, false); assert.equal(f.previousInert.inert, true)
  assert.equal(f.doc.activeElement, f.trigger); assert.equal(f.trigger.focusCalls[0].preventScroll, true)
  assert.equal(f.listeners.size, 0); assert.equal(f.key().prevented, false)
})

test('cleanup does not focus a detached or still-inert trigger', () => {
  for (const mode of ['detached', 'inert']) {
    const f = fixture(); const close = f.open()
    if (mode === 'detached') f.trigger.isConnected = false
    else f.root.inert = true
    close(); assert.equal(f.trigger.focusCalls.length, 0)
  }
})

test('drawer integration is reference-only and retains legacy landmarks and Escape handler', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/playable/GuidedCommerce.tsx'), 'utf8')
  assert.match(source, /if \(!referenceMode \|\| \(!menuOpen && !cartOpen\)\) return/)
  assert.match(source, /const MenuPanel = referenceMode \? 'section' : 'nav'/)
  assert.match(source, /const CartPanel = referenceMode \? 'section' : 'aside'/)
  assert.equal((source.match(/role=\{referenceMode \? 'dialog' : undefined\} aria-modal=\{referenceMode \|\| undefined\}/g) || []).length, 2)
  assert.match(source, /if \(event.key === 'Escape'\)/)
  assert.match(source, /if \(referenceMode\) setMenuOpen\(false\); setScene\('selector'\)/)
  assert.match(source, /\{referenceMode && <button type="button" onClick=\{\(\) => setMenuOpen\(false\)\}>Cerrar menú<\/button>\}/)
})
