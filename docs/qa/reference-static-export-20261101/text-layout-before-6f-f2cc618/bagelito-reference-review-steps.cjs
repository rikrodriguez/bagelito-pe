/** Offline-authored E2E steps for exact-reference reviewOnly storefront.
 * This module NEVER creates a browser or sends a request. The caller owns its
 * loopback-only GET guard, context and native action helper.
 * Do not apply the old 3D/Wallet driver: reviewOnly deliberately stops at pay.
 */
const assert = require('node:assert/strict')
const {readFileSync}=require('node:fs')
const {resolve}=require('node:path')
const repo=resolve(process.env.QA_REPO_ROOT||process.cwd())
const menu=JSON.parse(readFileSync(resolve(repo,'src/domain/data/verified-menu-2026-10-21.json'),'utf8'))
const normalize=value=>String(value??'').replace(/\s+/g,' ').trim()
const selectors={
  root:'.guided-commerce[data-reference-mode="true"][data-review-only="true"]',
  category:category=>`.reference-category[data-reference-category="${category}"]`,
  cart:'.reference-cart',
  addBagel:'.mobile-bagel-card > button',
  bagelCounter:'.bagel-live-summary > b',
  addSchmear:'.mobile-schmear-card > button',
  schmearCounter:'.guided-order-counter > b',
  summaryRows:'.guided-cashier-lines > span',
  primary:'.guided-primary-next',
  reviewCheckout:'.guided-cashier-action > button',
  terms:'.checkout-terms-check input[type="checkbox"]',
  reviewStatus:'.reference-payment-review [role="status"]',
  disabledPay:'.reference-payment-review > button',
  loyalty:'.reference-loyalty[aria-label="Programa de fidelidad"]',
}
const text={
  optional:'¿Agregamos un schmear?',
  optionalHint:'Opcional · 120 g · toca de nuevo para quitar',
  noSchmear:'Ir a caja sin schmear',
  checkout:'Revisar entrega y consentimiento',
  priceUnconfirmed:'Precio final por confirmar',
  summaryReview:'Revisa tu selección, los datos de entrega y el consentimiento. Esta vista no envía pedidos ni realiza pagos.',
  deliveryReview:'Puedes revisar tus datos y el consentimiento. El pago no está activo en esta vista.',
  disabledPay:'Pago no activo',
  finalStatus:'Modo revisión: no se envían datos, no se crea una reserva y no se realiza ningún cobro.',
  loyalty:'Cada 10 pedidos, 2 bagels + 1 schmear gratis.',
  loyaltyPending:'El programa usará pedidos verificados y seguimiento interno. El registro y el canje están pendientes de implementación; esta revisión no genera pedidos ni recompensas.',
}
const prices={
  schmearSizes:menu.schmear_sizes.map(size=>({grams:size.grams,original:size.original_price,flavoured:size.flavoured_price})),
  optional120:menu.schmears.map(flavor=>({id:flavor.id,name:flavor.name,priceClass:flavor.price_class,grams:120,price:flavor.price_class==='original'?12:16})),
  largePacks:menu.packs,
  miniPacks:menu.mini_packs,
  currentCombo:{id:'two-bagel-schmear',name:'2 Bagels + Schmear',bagels:2,schmears:1,price:null,display:'Precio por confirmar'},
}
const defaultAct=locator=>locator.click()
async function scene(page,key){
  await page.locator(`${selectors.root}[data-scene="${key}"]`).waitFor()
  assert.equal(await page.locator(selectors.root).getAttribute('data-qa'),'false')
}
async function counter(page,selector,expected){
  await page.waitForFunction(({selector,expected})=>document.querySelector(selector)?.textContent?.trim()===expected,{selector,expected},{polling:100,timeout:10000})
}
async function cart(page,count){assert.equal(await page.locator(selectors.cart).getAttribute('aria-label'),`Ver tu pedido: ${count} productos`)}
async function assertReferenceReviewShell(page){
  assert.equal(await page.locator(selectors.root).count(),1)
  assert.equal(await page.locator(selectors.root).getAttribute('data-direct-catalog'),'true')
  assert.equal(await page.locator(selectors.root).getAttribute('data-qa'),'false')
  assert.equal(await page.locator('canvas,.guided-scene-backdrop,.guided-scene-image').count(),0)
  assert.equal(await page.locator('.reference-image').getAttribute('src'),'/images/store-reference-approved.webp')
  assert.equal(await page.locator('.qa-only-pay,.culqi-browser-checkout,.culqi-browser-status,.culqi-start-button,#culqi-checkout-container').count(),0)
  assert.equal(await page.locator('.wallet-screen-live,.wallet-actions,.wallet-primary,.wallet-secondary,.receipt-interaction,.live-receipt-sheet').count(),0)
}
async function choosePack(page,{format='grande',quantity=6,mix='mixed'}={},act=defaultAct){
  await act(page.locator(selectors.category('packs')));await scene(page,'pack-size')
  await act(page.getByRole('button',{name:format==='mini'?/Mini bagels/:/Bagels grandes/}));await scene(page,'pack-qty')
  if(mix==='single')await act(page.locator('.guided-pack-mix > button').nth(1))
  const mixIndex=mix==='single'?1:0
  assert.equal(await page.locator('.guided-pack-mix > button').nth(mixIndex).getAttribute('aria-pressed'),'true')
  const name=`Elegir ${quantity} ${format==='mini'?'mini bagels':'bagels'}, ${mix==='single'?'un sabor':'mixtos'}`
  await act(page.getByRole('button',{name,exact:true}));await scene(page,'bagels');await counter(page,selectors.bagelCounter,`0/${quantity}`)
}
async function fillBagels(page,{quantity=6,mix='mixed',flavors=['Plain','Everything','Sesame']}={},act=defaultAct){
  if(mix==='single')await act(page.getByRole('button',{name:`Agregar ${flavors[0]}`,exact:true}))
  else for(let index=0;index<quantity;index++)await act(page.getByRole('button',{name:`Agregar ${flavors[index%flavors.length]}`,exact:true}))
  await counter(page,selectors.bagelCounter,`${quantity}/${quantity}`);await cart(page,quantity)
}
async function assertOptional120(page){
  await scene(page,'schmears')
  assert.equal(normalize(await page.locator('.mobile-schmear-stage h2').textContent()),text.optional)
  assert.equal(normalize(await page.locator('.mobile-schmear-stage > header > span').textContent()),text.optionalHint)
  assert.equal(await page.locator('.mobile-schmear-card').count(),5)
  for(const flavor of prices.optional120){
    const card=page.locator('.mobile-schmear-card').filter({has:page.getByRole('button',{name:`Agregar ${flavor.name}`,exact:true})})
    assert.equal(normalize(await card.locator('.reference-schmear-price').textContent()),`120 g · S/${flavor.price}`)
  }
}
async function optionalToCashier(page,{quantity=6,flavor=null}={},act=defaultAct){
  await act(page.locator(selectors.primary));await assertOptional120(page)
  await cart(page,quantity);await counter(page,selectors.schmearCounter,'0/1')
  if(flavor){
    await act(page.getByRole('button',{name:`Agregar ${flavor}`,exact:true}));await cart(page,quantity+1);await counter(page,selectors.schmearCounter,'✓')
    assert.ok(!normalize(await page.locator(selectors.primary).textContent()).includes(text.noSchmear))
  }else assert.ok(normalize(await page.locator(selectors.primary).textContent()).startsWith(text.noSchmear))
  await act(page.locator(selectors.primary));await scene(page,'cashier');await cart(page,quantity+(flavor?1:0))
  const rows=await summaryRows(page)
  if(flavor)assert.ok(rows.some(row=>row.quantity===1&&row.name===flavor))
  else for(const item of menu.schmears)assert.ok(!rows.some(row=>row.name===item.name))
  assert.equal(normalize(await page.locator('.guided-cashier-quote > span').textContent()),text.priceUnconfirmed)
  assert.equal(await page.locator('.guided-cashier-quote > strong').count(),0)
  return rows
}
async function summaryRows(page){
  return page.locator(selectors.summaryRows).evaluateAll(rows=>rows.map(row=>({quantity:Number(row.querySelector('i')?.textContent?.match(/\d+/)?.[0]),name:row.querySelector('b')?.textContent?.replace(/\s+/g,' ').trim()})))
}
async function chooseCombo(page,{bagels=['Everything','Sesame'],schmear='Herb & Roasted Garlic',exerciseRemove=true}={},act=defaultAct){
  await act(page.locator(selectors.category('combos')));await scene(page,'combos')
  const choice=page.getByRole('button',{name:prices.currentCombo.name,exact:true})
  assert.equal(normalize(await choice.locator('strong').textContent()),prices.currentCombo.display)
  await act(choice);await scene(page,'bagels');await fillBagels(page,{quantity:2,mix:'mixed',flavors:bagels},act)
  await act(page.locator(selectors.primary));await scene(page,'schmears');await counter(page,selectors.schmearCounter,'0/1')
  assert.equal(await page.locator(selectors.primary).count(),0,'A combo cannot continue without its one schmear')
  assert.equal(await page.locator('.reference-schmear-price').count(),0,'Pack-only upsell prices must not become combo prices')
  const add=page.getByRole('button',{name:`Agregar ${schmear}`,exact:true})
  await act(add);await counter(page,selectors.schmearCounter,'1/1');await cart(page,3)
  if(exerciseRemove){
    await act(page.getByRole('button',{name:`Quitar ${schmear}`,exact:true}));await counter(page,selectors.schmearCounter,'0/1');await cart(page,2)
    assert.equal(await page.locator(selectors.primary).count(),0)
    await act(add);await counter(page,selectors.schmearCounter,'1/1');await cart(page,3)
  }
  await act(page.locator(selectors.primary));await scene(page,'cashier')
  const rows=await summaryRows(page)
  assert.ok(rows.some(row=>row.quantity===1&&row.name===schmear))
  assert.equal(normalize(await page.locator('.guided-cashier-quote > span').textContent()),text.priceUnconfirmed)
  assert.equal(await page.locator('.guided-cashier-quote > strong').count(),0)
  return rows
}
async function chooseSchmear(page,{grams=120,flavor='Whipped Original'}={},act=defaultAct){
  await act(page.locator(selectors.category('schmears')));await scene(page,'schmear-size')
  for(const size of prices.schmearSizes){
    const button=page.getByRole('button',{name:new RegExp('^'+size.grams+' g')})
    assert.equal(normalize(await button.locator('b').textContent()),`${size.grams} g`)
    assert.equal(normalize(await button.locator('span').textContent()),`Original S/${size.original} · Sabores S/${size.flavoured}`)
  }
  await act(page.getByRole('button',{name:new RegExp('^'+grams+' g')}));await scene(page,'schmears');await counter(page,selectors.schmearCounter,'0/1')
  assert.equal(await page.locator(selectors.primary).count(),0)
  await act(page.getByRole('button',{name:`Agregar ${flavor}`,exact:true}));await counter(page,selectors.schmearCounter,'✓');await cart(page,1)
  assert.ok(normalize(await page.locator(selectors.primary).textContent()).startsWith('Continuar'))
  await act(page.locator(selectors.primary));await scene(page,'cashier')
  assert.equal(await page.locator('.cross-sell-actions').count(),0)
  const rows=await summaryRows(page);assert.deepEqual(rows,[{quantity:1,name:`${flavor} · ${grams} g`}])
  return rows
}
async function reviewPay(page,{fill=true}={}){
  await scene(page,'cashier')
  assert.equal(normalize(await page.locator('.guided-cashier-copy > p').textContent()),text.summaryReview)
  assert.equal(await page.locator('.guided-launch-contact,a[href^="https://wa.me/"]').count(),0)
  await page.getByRole('button',{name:new RegExp('^'+text.checkout)}).click();await scene(page,'pay')
  await assertReferenceReviewShell(page)
  assert.equal(normalize(await page.locator('.guided-payment-copy > span').textContent()),text.deliveryReview)
  assert.equal(await page.locator('.checkout-customer-grid input').count(),6)
  assert.equal(await page.locator('.checkout-customer-grid select').count(),1)
  assert.equal(await page.locator(selectors.terms).isChecked(),false)
  const disabled=page.getByRole('button',{name:text.disabledPay,exact:true});assert.equal(await disabled.isDisabled(),true)
  if(fill){
    // Entirely synthetic values; caller should not record field values in logs.
    await page.getByLabel('Nombre',{exact:true}).fill('QA Referencia')
    await page.getByLabel('Email',{exact:true}).fill('qa-reference@example.invalid')
    await page.getByLabel('WhatsApp',{exact:true}).fill('900000000')
    const district=page.locator('.checkout-customer-grid select')
    assert.equal(await district.count(),1)
    assert.equal(await district.evaluate(select=>select.closest('label')?.querySelector('span')?.textContent?.trim()),'Distrito')
    await district.selectOption('Lince')
    await page.getByLabel('Dirección de delivery',{exact:true}).fill('Dirección de prueba 123')
    await page.getByLabel('Referencia',{exact:true}).fill('Solo revisión')
    await page.getByLabel('Notas',{exact:true}).fill('No enviar ni reservar')
    await page.locator(selectors.terms).check();assert.equal(await page.locator(selectors.terms).isChecked(),true)
    assert.equal(await disabled.isDisabled(),true,'Consent never enables payment in reviewOnly')
  }
  assert.equal(normalize(await page.locator(selectors.reviewStatus).textContent()),text.finalStatus)
  assert.equal(normalize(await page.locator(`${selectors.loyalty} h2`).textContent()),text.loyalty)
  assert.equal(normalize(await page.locator(`${selectors.loyalty} p`).textContent()),text.loyaltyPending)
  assert.equal(await page.locator('.checkout-terms-check a').getAttribute('href'),'/legal')
  await assertReferenceReviewShell(page)
  return {scene:'pay',paymentDisabled:true,termsChecked:await page.locator(selectors.terms).isChecked(),loyaltyPending:true}
}
module.exports={selectors,text,prices,menu,normalize,scene,counter,cart,assertReferenceReviewShell,choosePack,fillBagels,assertOptional120,optionalToCashier,summaryRows,chooseCombo,chooseSchmear,reviewPay}
