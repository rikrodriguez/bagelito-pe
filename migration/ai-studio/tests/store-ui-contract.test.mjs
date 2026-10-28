import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const appUrl = new URL('../tanstack-app/src/routes/index.tsx', import.meta.url)
const publicUrl = new URL('../tanstack-app/public/', import.meta.url)

test('portable store keeps the approved Bagelito journey', async () => {
  const source = await readFile(appUrl, 'utf8')
  for (const text of ['Packs', 'Combos', 'Schmears', '¿Grandes o Minis?', '2 bagels + schmear']) {
    assert.ok(source.includes(text), 'missing approved UI copy: ' + text)
  }
  assert.ok(source.includes('Sin sándwich. Sin bebida.'))
  assert.equal(source.includes('Perfect Pair'), false)
  assert.equal(source.includes('Brunch Pack'), false)
  assert.equal(source.includes('Schmear Lover'), false)
})

test('portable store fails closed before checkout', async () => {
  const source = await readFile(appUrl, 'utf8')
  assert.ok(source.includes('currentOfferApproved: false'))
  assert.ok(source.includes('Checkout aún no habilitado'))
})

test('portable store uses bundled visuals instead of old-site image requests', async () => {
  const source = await readFile(appUrl, 'utf8')
  assert.ok(source.includes('localProductImage'))
  assert.equal(source.includes('src="https://bagelito.pe/images/'), false)

  const required = [
    'store-entry-door.webp',
    'store-category-flow.webp',
    'images/pack-6-mixed.webp',
    'images/bagel-everything.webp',
    'images/bagel-sesame.webp',
    'images/bagel-plain.webp',
    'images/bagel-classic-onion.webp',
    'images/bagel-jalapeno-cheddar.webp',
    'images/bagel-cheddar.webp',
    'images/bagel-cinnamon-raisin.webp',
    'images/bagel-blueberry.webp',
  ]
  await Promise.all(required.map((file) => access(new URL(file, publicUrl))))
})

test('pack UI preserves approved regular and mini quantities', async () => {
  const source = await readFile(appUrl, 'utf8')
  assert.ok(source.includes("props.format === 'mini' ? [6, 12, 24] : [6, 12]"))
  assert.ok(source.includes('Bagels grandes'))
  assert.ok(source.includes('Mini bagels'))
})
