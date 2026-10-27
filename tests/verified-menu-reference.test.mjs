import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const menu = () => JSON.parse(read('src/data/verified-menu-reference.json'));

test('four regular packs preserve screenshot prices', () => {
  assert.deepEqual(menu().packs.map(p => [p.units,p.flavorMode,p.price]), [[6,'mixed',60],[6,'single',50],[12,'mixed',115],[12,'single',100]]);
});
test('three combos contain bagels and 120g schmears, not drinks or sandwiches', () => {
  assert.deepEqual(menu().combos.map(c => [c.name,c.bagels,c.schmearCount,c.schmearGrams,c.price]), [['Perfect Pair',6,1,120,74],['Brunch Pack',12,2,120,140],['Schmear Lover',6,3,120,99]]);
  assert.ok(menu().combos.every(c => c.flavorMode==='mixed'));
});
test('only the five explicitly supplied schmears are listed', () => {
  assert.deepEqual(menu().schmears.map(s=>s.name), ['Whipped Original','Herbs & Roasted Garlic','Ají Amarillo','Honey Cinnamon','Classic Strawberry']);
  assert.equal(menu().schmears.filter(s=>s.priceClass==='original').length,1);
});
test('original and flavored prices differ at all three sizes',()=>{
  assert.deepEqual(menu().schmearSizes.map(s=>[s.grams,s.original,s.flavored]), [[120,12,16],[180,18,23],[240,22,29]]);
});
test('mini prices are recorded without altering regular pack amounts',()=>{
  assert.deepEqual(menu().miniPacks.map(p=>[p.units,p.mixed,p.single]),[[6,25,20],[12,40,35],[24,75,70]]);
});
test('ambiguous supplements are not automatic checkout rules or invented stock',()=>{
  const m=menu();
  assert.equal(m.schmearUpgrade.chargingUnit,null);
  assert.equal(m.schmearUpgrade.enabled,false);
  assert.equal(m.customColors.enabled,false);
  assert.deepEqual(m.customColors.bands.map(b=>[b.min,b.max,b.supplement]),[[1,2,0],[3,5,10],[6,7,15]]);
  assert.equal(m.inventory,null);
  assert.equal(m.checkoutEnabled,false);
});
test('read-only menu is connected to category choice, not a payment endpoint',()=>{
  const component=read('src/components/visit/VerifiedMenu.tsx');
  const visit=read('src/components/visit/PhotoVisit.tsx');
  assert.match(component,/verified-menu-reference\.json/);
  assert.match(component,/<dialog/);
  assert.match(visit,/<VerifiedMenu/);
  assert.doesNotMatch(component,/fetch\(|\/api\/|Culqi|createOrder|createReservation/);
});
