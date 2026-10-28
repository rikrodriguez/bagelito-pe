import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const shop = require('../.migration-test-dist/lib/approved-shop-contract.js')

const plain = (quantity) => [{ flavorId: 'plain', quantity }]
const mixed = (quantity) => [{ flavorId: 'plain', quantity: quantity - 2 }, { flavorId: 'sesame', quantity: 2 }]

test('catalog has 8 regular flavors, 5 schmears and the verified 2026-10-21 menu', () => {
  const menu = shop.getVerifiedDisplayMenu()
  assert.equal(menu.sourceDate, '2026-10-14')
  assert.equal(menu.currency, 'PEN')
  assert.equal(menu.bagels.length, 8)
  assert.equal(menu.schmears.length, 5)
  assert.equal(menu.historicalPublishedCombos.length, 3)
  assert.equal(menu.miniPacks.length, 3)
})
test('regular mix 6 costs S/60 as published (no premium bagels)', () => {
  const q = shop.quotePublishedPack({ format: 'grande', quantity: 6, mix: 'mixed', selection: mixed(6) })
  assert.equal(q.status, 'ready')
  assert.equal(q.publishedBasePen, 60)
  assert.equal(shop.canProceedToCheckout(q, { liveInventoryAvailable: false, currentOfferApproved: true }), false)
  assert.equal(shop.canProceedToCheckout(q, { liveInventoryAvailable: true, currentOfferApproved: false }), false)
  assert.equal(shop.canProceedToCheckout(q, { liveInventoryAvailable: true, currentOfferApproved: true }), true)
})
test('single-flavor 12 costs S/100, no invented minimum flavor variety for mixed', () => {
  const q = shop.quotePublishedPack({ format: 'grande', quantity: 12, mix: 'single', selection: plain(12) })
  assert.equal(q.publishedBasePen, 100)
  assert.equal(q.status, 'ready')
  const mixedOneFlavor = shop.quotePublishedPack({ format: 'grande', quantity: 6, mix: 'mixed', selection: plain(6) })
  assert.equal(mixedOneFlavor.status, 'ready')
})
test('premium flavor in large pack cannot be charged using invented surcharge', () => {
  const q = shop.quotePublishedPack({ format: 'grande', quantity: 6, mix: 'mixed', selection: [{ flavorId: 'jalapeno-cheddar', quantity: 6 }] })
  assert.equal(q.status, 'review_required')
  assert.equal(q.checkoutAllowed, false)
  assert.equal(q.publishedBasePen, 60)
})
test('mini pack keeps published price, but unresolved flavor availability blocks checkout', () => {
  const q = shop.quotePublishedPack({ format: 'mini', quantity: 24, mix: 'mixed', selection: plain(24) })
  assert.equal(q.status, 'review_required')
  assert.equal(q.publishedBasePen, 75)
  assert.equal(q.checkoutAllowed, false)
})
test('schmear original and flavored prices reflect verified sizes', () => {
  assert.equal(shop.quotePublishedSchmear({ flavorId: 'whipped-original', grams: 120 }).publishedBasePen, 12)
  assert.equal(shop.quotePublishedSchmear({ flavorId: 'aji-amarillo', grams: 180 }).publishedBasePen, 23)
  assert.equal(shop.quotePublishedSchmear({ flavorId: 'classic-strawberry', grams: 240 }).publishedBasePen, 29)
})
test('two-bagel combo is selectable but unpriced and nonpayable', () => {
  const q = shop.quoteTwoBagelCombo({ bagels: plain(2), schmearId: 'whipped-original' })
  assert.equal(q.status, 'review_required')
  assert.equal(q.publishedBasePen, null)
  assert.equal(q.checkoutAllowed, false)
})
test('invalid quantities or nonregular flavors cannot sneak into checkout', () => {
  assert.equal(shop.quotePublishedPack({ format:'grande', quantity:6, mix:'mixed', selection:plain(5) }).status, 'invalid')
  assert.equal(shop.quotePublishedPack({ format:'grande', quantity:6, mix:'mixed', selection:[{flavorId:'snickerdoodle', quantity:6}] }).status, 'invalid')
  assert.equal(shop.quotePublishedPack({ format:'grande', quantity:6, mix:'single', selection:mixed(6) }).status, 'invalid')
  assert.equal(shop.quoteTwoBagelCombo({ bagels: plain(1), schmearId:'whipped-original' }).status, 'invalid')
})
