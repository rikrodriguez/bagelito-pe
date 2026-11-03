'use strict'
// Isolated review-only UI. No API, orders, messaging, payment or external traffic.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const origin = new URL(process.env.BASE_URL || 'http://127.0.0.1:3290')
  assert.equal(origin.protocol, 'http:')
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
  assert.ok(!origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash)
  const output = path.resolve(process.env.OUTPUT_DIR || 'docs/qa/boutique-experience-20261103/browser')
  assert.ok(!fs.existsSync(output), 'Never overwrite browser evidence')
  if (process.argv.includes('--preflight')) {console.log(JSON.stringify({origin:origin.origin,output,browser:false}));return}
  const {chromium} = require('playwright')
  fs.mkdirSync(output, {recursive:true})
  const result = {passed:false,scope:'Local Chromium emulation; review-only; no live transaction validation',cases:[],blocked:[],pageErrors:[],httpErrors:[]}
  let browser
  try {
    browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})})
    for (const width of [320,390,768,1280]) {
      const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'})
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url())
        if(url.origin!==origin.origin || !['GET','HEAD'].includes(request.method()) || /^\/+api(?:[\\/]|$)/i.test(decodeURIComponent(url.pathname))) {
          result.blocked.push({width,url:url.href,method:request.method()});return route.abort()
        }
        const response=await route.fetch({maxRedirects:0})
        if(response.status()>=300 && response.status()<400) {result.blocked.push({width,url:url.href,reason:'redirect'});return route.abort()}
        if(response.status()>=400)result.httpErrors.push({width,url:url.href,status:response.status()})
        return route.fulfill({response})
      })
      assert.equal(typeof context.routeWebSocket,'function')
      await context.routeWebSocket('**/*',socket=>{result.blocked.push({width,url:socket.url(),method:'WEBSOCKET'});socket.close()})
      const page = await context.newPage()
      page.on('pageerror',error=>result.pageErrors.push({width,error:String(error)}))
      const stage = name=>page.waitForFunction(expected=>document.querySelector('.guided-commerce')?.getAttribute('data-scene')===expected,name)
      async function capture(name) {
        await page.evaluate(()=>document.fonts.ready)
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1)
        assert.equal(overflow,false,`${width} ${name} horizontal overflow`)
        assert.equal(await page.locator('script[src*="culqi" i],iframe').count(),0)
        const filename=`${width}-${name}.png`
        await page.screenshot({path:path.join(output,filename),fullPage:true,animations:'disabled'})
        result.cases.push({width,name,file:filename,overflow})
      }
      await page.goto(origin.href,{waitUntil:'networkidle'})
      await stage('selector')
      assert.equal(await page.locator('.guided-commerce').getAttribute('data-review-only'),'true')
      assert.equal(await page.locator('.boutique-tray-number').count(),13)
      assert.equal(await page.locator('.boutique-display').count(),2)
      await capture('entry')
      await page.getByRole('button',{name:'Acercarte a la vitrina de bagels',exact:true}).click()
      await stage('pack-size')
      await page.getByRole('button',{name:/Bagels grandes/}).click()
      await page.getByRole('button',{name:'Elegir 6 bagels, mixtos',exact:true}).click()
      await stage('bagels')
      assert.equal(await page.locator('.boutique-box-slot.is-empty').count(),6)
      await capture('empty-box')
      for(const flavor of ['Plain','Everything','Sesame'])await page.getByRole('button',{name:'Agregar '+flavor,exact:true}).click()
      assert.equal(await page.locator('.boutique-box-slot.is-filled').count(),3)
      const targetBounds=await page.locator('button.boutique-box-slot').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return{width:r.width,height:r.height}}))
      assert.ok(targetBounds.every(r=>r.width>=44&&r.height>=44),`${width} removal targets >=44 px`)
      await capture('three-bagels')
      await page.getByRole('button',{name:'Sacar Plain de la caja',exact:true}).click()
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-bagel-id')),'plain')
      assert.equal(await page.locator('.boutique-box-slot.is-filled').count(),2)
      for(let i=0;i<4;i++)await page.getByRole('button',{name:'Agregar Plain',exact:true}).click()
      assert.equal(await page.locator('.boutique-box-slot.is-filled').count(),6)
      await page.getByRole('button',{name:'Agregar Everything',exact:true}).click()
      assert.equal(await page.locator('.boutique-box-slot.is-filled').count(),6)
      await capture('full-box')
      await page.locator('.guided-primary-next').click();await stage('schmears')
      await page.getByRole('button',{name:'Agregar Whipped Original',exact:true}).click()
      await page.locator('.guided-primary-next').click();await stage('cashier')
      await capture('cashier')
      assert.match(await page.locator('.guided-cashier-lines').innerText(),/4\s*×\s*Plain/)
      await page.getByRole('button',{name:'Volver al paso anterior',exact:true}).click();await stage('schmears')
      await page.getByRole('button',{name:'Volver al paso anterior',exact:true}).click();await stage('bagels')
      assert.equal(await page.locator('.boutique-box-slot.is-filled').count(),6)
      await context.close()
    }
    assert.deepEqual(result.blocked,[])
    assert.deepEqual(result.pageErrors,[])
    assert.deepEqual(result.httpErrors,[])
    result.passed=true
  } catch(error) {result.error=String(error);throw error}
  finally {if(browser)await browser.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2))}
  console.log(JSON.stringify(result,null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1})
