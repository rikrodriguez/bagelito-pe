'use strict'
// Read-only local browser QA. Never clicks the WhatsApp link or invokes payment.
// Example: BASE_URL=http://127.0.0.1:3280 MODE=enabled OUTPUT_DIR=/tmp/new-qa node scripts/qa-manual-inquiry.cjs
// --preflight validates configuration without importing Playwright or opening sockets.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function configuration(env) {
  assert.ok(env.BASE_URL, 'BASE_URL is required')
  const base = new URL(env.BASE_URL)
  assert.equal(base.protocol, 'http:', 'Only HTTP loopback is allowed')
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname), 'Only literal loopback hosts are allowed')
  assert.ok(!base.username && !base.password && !base.search && !base.hash && base.pathname === '/', 'Use a plain loopback origin')
  assert.ok(['closed','enabled'].includes(env.MODE), 'MODE must be closed or enabled')
  assert.ok(env.OUTPUT_DIR, 'OUTPUT_DIR must name a new directory')
  const output = path.resolve(env.OUTPUT_DIR)
  assert.ok(!fs.existsSync(output), 'OUTPUT_DIR already exists; never overwrite QA evidence')
  return {origin:base.origin,mode:env.MODE,output}
}
async function main() {
  const config = configuration(process.env)
  assert.ok(process.argv.slice(2).every(arg=>arg==='--preflight'), 'Unknown argument')
  if (process.argv.includes('--preflight')) {console.log(JSON.stringify({preflight:'passed',...config,browserStarted:false}));return}
  const {chromium} = require('playwright')
  fs.mkdirSync(config.output)
  const summary = {startedAt:new Date().toISOString(),...config,scope:'Local Chromium emulation only; no external requests, order sends, payments, deploy or real-device claims.',passed:false,cases:[],blocked:[],httpErrors:[],pageErrors:[],routeErrors:[],errors:[]}
  let browser
  try {
    browser=await chromium.launch({headless:true})
    for(const width of [390,1280]) {
      const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,serviceWorkers:'block'})
      try {
        // Register before creating/navigating a page. Fetch without redirect
        // following, so an allowed local URL cannot redirect to a third party.
        await context.route('**/*',async route=>{
          const request=route.request(),entry={url:request.url(),method:request.method(),width}
          try {
            const url=new URL(entry.url)
            let decoded=url.pathname
            try {decoded=decodeURIComponent(decoded)} catch {decoded='/api/invalid-encoding'}
            if(url.origin!==config.origin || !['GET','HEAD'].includes(entry.method) || /^\/+api(?:[\\/]|$)/i.test(decoded)) {
              summary.blocked.push(entry);await route.abort('blockedbyclient');return
            }
            const response=await route.fetch({maxRedirects:0})
            const status=response.status()
            if(status>=300 && status<400) {summary.blocked.push({...entry,reason:'redirect',status});await route.abort('blockedbyclient');return}
            if(status>=400) summary.httpErrors.push({...entry,status})
            await route.fulfill({response})
          } catch(error) {summary.routeErrors.push({...entry,error:String(error)});await route.abort('blockedbyclient').catch(()=>{})}
        })
        assert.equal(typeof context.routeWebSocket,'function','Playwright must support WebSocket interception')
        await context.routeWebSocket('**/*',ws=>{summary.blocked.push({url:ws.url(),method:'WEBSOCKET',width});ws.close()})
        const page=await context.newPage()
        page.setDefaultTimeout(15000)
        page.on('pageerror',error=>summary.pageErrors.push({width,error:String(error)}))
        const root=page.locator('.guided-commerce')
        const stage=async name=>{await root.waitFor();await page.waitForFunction(expected=>document.querySelector('.guided-commerce')?.getAttribute('data-scene')===expected,name);await safety()}
        async function safety() {
          assert.equal(await page.locator('form,input,textarea,select,.culqi-browser-checkout,.culqi-start-button,#culqi-checkout-container,iframe,.live-receipt-sheet').count(),0,'No form, SDK or receipt')
          assert.equal(await page.getByRole('button',{name:/Ir a Pago|Pagar online|Revisar entrega/}).count(),0,'No payment actions')
          assert.equal(await page.locator('script[src*="culqi" i]').count(),0,'No payment script')
        }
        async function start(category) {
          await page.goto(config.origin+'/consulta',{waitUntil:'networkidle'})
          await stage('selector');await page.getByRole('button',{name:category,exact:true}).click()
        }
        async function capture(name,message) {
          await safety(); const filename=width+'-'+name+'.png'
          await page.screenshot({path:path.join(config.output,filename),fullPage:true})
          summary.cases.push({width,name,screenshot:filename,message:message||null,horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)})
        }
        async function inquiry() {
          await stage('cashier')
          const link=page.locator('a[href^="https://wa.me/"]');assert.equal(await link.count(),1)
          const url=new URL(await link.getAttribute('href'))
          assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/51917547745')
          const message=url.searchParams.get('text');assert.match(message,/no confirma ni paga el pedido/)
          assert.match(message,/precio final, el delivery y la fecha/)
          return message // Inspect only. Never click this link.
        }
        if(config.mode==='closed') {
          await page.goto(config.origin+'/consulta',{waitUntil:'networkidle'})
          await page.getByRole('heading',{name:'Consulta de pedidos no habilitada',exact:true}).waitFor()
          assert.equal(await page.locator('a[href*="wa.me"],.guided-commerce').count(),0)
          await capture('closed')
        } else {
          for(const spec of [{name:'single',mix:'single',format:'grande',count:6},{name:'mixed',mix:'mixed',format:'grande',count:6},{name:'mini24',mix:'mixed',format:'mini',count:24}]) {
            await start('Packs');await stage('pack-size')
            await page.getByRole('button',{name:spec.format==='mini'?/Mini bagels/:/Bagels grandes/}).click();await stage('pack-qty')
            if(spec.mix==='single') await page.getByRole('button',{name:/Un sabor/}).click()
            await page.getByRole('button',{name:'Elegir '+spec.count+' '+(spec.format==='mini'?'mini bagels':'bagels')+', '+(spec.mix==='single'?'un sabor':'mixtos'),exact:true}).click();await stage('bagels')
            assert.equal(await page.locator('a[href*="wa.me"]').count(),0)
            for(let i=0;i<(spec.mix==='single'?1:spec.count);i++) await page.getByRole('button',{name:i%2===0?'Agregar Plain':'Agregar Everything',exact:true}).click()
            await page.locator('.guided-primary-next').click();await stage('schmears')
            await page.getByRole('button',{name:'Agregar Whipped Original',exact:true}).click()
            await page.locator('.guided-primary-next').click()
            let message=await inquiry();assert.match(message,/1 × Whipped Original \(120 g\)/)
            assert.match(message,new RegExp('Pack de '+spec.count+' bagels '+(spec.format==='mini'?'minis':'grandes')))
            if(spec.mix==='single') assert.match(message,/6 × Plain/)
            else {assert.match(message,new RegExp(spec.count/2+' × Plain'));assert.match(message,new RegExp(spec.count/2+' × Everything'))}
            await capture(spec.name+'-optional120',message)
            await page.getByRole('button',{name:'Volver al paso anterior',exact:true}).click();await stage('schmears')
            await page.getByRole('button',{name:'Agregar Whipped Original',exact:true}).click();await page.locator('.guided-primary-next').click()
            message=await inquiry();assert.doesNotMatch(message,/Whipped Original/);await capture(spec.name+'-removed',message)
          }
          await start('Combos');await stage('combos');await page.getByRole('button',{name:'Bagels + schmears',exact:true}).click();await stage('bagels')
          await page.getByRole('button',{name:'Agregar Plain',exact:true}).click();assert.equal(await page.locator('.guided-primary-next').count(),0)
          await page.getByRole('button',{name:'Agregar Everything',exact:true}).click();await page.locator('.guided-primary-next').click();await stage('schmears')
          assert.equal(await page.locator('.guided-primary-next').count(),0)
          await page.getByRole('button',{name:'Agregar Whipped Original',exact:true}).click();await page.locator('.guided-primary-next').click()
          const combo=await inquiry();assert.match(combo,/2 Bagels \+ Schmear/);assert.match(combo,/1 × Plain/);assert.match(combo,/1 × Everything/);assert.match(combo,/1 × Whipped Original \(120 g\)/);await capture('combo2plus1',combo)
          for(const grams of [120,180,240]) {
            await start('Schmears');await stage('schmear-size')
            await page.locator('.guided-size-cards button').filter({has:page.locator('b',{hasText:new RegExp('^'+grams+' g$')})}).click();await stage('schmears')
            assert.equal(await page.locator('.guided-primary-next').count(),0)
            await page.getByRole('button',{name:'Agregar Whipped Original',exact:true}).click();await page.locator('.guided-primary-next').click()
            const message=await inquiry();assert.match(message,new RegExp('Schmear individual \\('+grams+' g\\)'));assert.match(message,new RegExp('Whipped Original \\('+grams+' g\\)'));await capture('standalone'+grams,message)
          }
        }
      } finally {await context.close()}
    }
    for(const key of ['blocked','httpErrors','pageErrors','routeErrors']) assert.equal(summary[key].length,0,key+' must be empty')
    summary.passed=true
  } catch(error) {summary.errors.push(String(error.stack||error));process.exitCode=1}
  finally {if(browser) await browser.close().catch(error=>{summary.errors.push(String(error));summary.passed=false;process.exitCode=1});summary.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(config.output,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({passed:summary.passed,cases:summary.cases.length,summary:path.join(config.output,'summary.json')}))}
}
if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1})
module.exports={configuration}
