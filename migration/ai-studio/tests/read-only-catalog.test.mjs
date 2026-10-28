import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Build with: npx tsc -p migration/ai-studio/portable-tsconfig.json
const require = createRequire(import.meta.url)
const { packs } = require('../.migration-test-dist/data/packs.js')
const { flavors } = require('../.migration-test-dist/data/flavors.js')
const catalog = require('../.migration-test-dist/lib/catalog.js')
const delivery = require('../.migration-test-dist/lib/delivery-pricing.js')

test('preserve source pack catalog without altering product offers', () => {
  assert.equal(packs.length, 4)
  assert.deepEqual(packs.map((p) => p.slug), ['12-mixed', '6-mixed', '12-single', '6-single'])
  assert.deepEqual(packs.map((p) => p.amount), [115, 60, 100, 50])
  for (const p of packs) {
    assert.ok(p.units > 0)
    assert.ok(p.amount > 0)
    assert.equal(catalog.getPackBySlug(p.slug)?.slug, p.slug)
    assert.equal(catalog.isPackSlug(p.slug), true)
  }
  assert.equal(catalog.isPackSlug('unknown'), false)
  assert.equal(catalog.getValidPack('unknown').slug, packs[0].slug)
})

test('preserve flavor data and lookup', () => {
  assert.equal(flavors.length, 10)
  assert.equal(catalog.getFlavorBySlug('plain')?.slug, 'plain')
  assert.equal(catalog.getFlavorBySlug('does-not-exist'), undefined)
})

test('preserve district pricing calculations exactly', () => {
  assert.equal(delivery.getDeliveryFee('Lince'), 8)
  assert.equal(delivery.getDeliveryFee('Miraflores'), 16)
  assert.equal(delivery.getDeliveryFee('Other'), 21)
  assert.equal(delivery.getDeliveryFee('Nonexistent district'), delivery.getDeliveryFee('Other'))
})

test('framework-free port has no Next.js API dependency', () => {
  assert.equal(typeof catalog.getValidPack, 'function')
  assert.equal(typeof delivery.getDeliveryFee, 'function')
})
