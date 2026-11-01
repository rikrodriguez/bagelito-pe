const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// Exercise the real source-selection statements with no Git objects available.
// This is a startup regression, not a replacement for any browser/driver test.
const source = fs.readFileSync(path.join(__dirname, 'qa-world-driver.test.cjs'), 'utf8')
const start = source.indexOf('const originalMode = ')
const end = source.indexOf('\nconst currentGuardTest = ', start)
assert.ok(start >= 0 && end > start)
function select(flag) {
  const calls = []
  const context = {
    process: {env: {QA_DRIVER_TEST_ORIGINAL: flag}}, current: 'current driver', original: 'historical driver',
    execFileSync(command, args, options) {
      calls.push({command, args, options})
      throw new Error('Historical Git object is unavailable')
    },
  }
  const selected = vm.runInNewContext(source.slice(start, end) + '\nsource', context)
  return {selected, calls}
}

test('default/current driver tests do not request any Git history in a shallow clone', () => {
  for (const flag of [undefined, 'false', 'TRUE', '']) {
    const {selected, calls} = select(flag)
    assert.equal(selected, 'current driver')
    assert.equal(calls.length, 0)
  }
})

test('historical baseline replay selects the pinned local fixture without Git history', () => {
  const {selected, calls} = select('true')
  assert.equal(selected, 'historical driver')
  assert.equal(calls.length, 0)
})
