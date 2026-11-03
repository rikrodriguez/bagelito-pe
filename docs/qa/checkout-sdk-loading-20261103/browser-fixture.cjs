const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),{chromium}=require('playwright')
const output='docs/qa/checkout-sdk-loading-20261103/browser-result.json'
const source=fs.readFileSync('src/playable/CulqiBrowserCheckout.tsx','utf8')
const code=ts.transpileModule(source.slice(source.indexOf('type ScriptLoadState ='),source.indexOf('\nfunction readRecovery()')),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const checkout='https://js.culqi.com/checkout-js',threeDS='https://3ds.culqi.com/'
;(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),requests=[],results=[]
 try {
  const page=await browser.newPage();let attempt=0
  await page.route('**/*',async route=>{
   const url=route.request().url();requests.push({scenario:'error-retry',url,intercepted:true})
   assert.ok([checkout,threeDS].includes(url),'no unexpected destination')
   if(url===checkout&&++attempt===1)return route.abort('failed')
   return route.fulfill({status:200,contentType:'text/javascript',body:`window.fixtureExecutions=(window.fixtureExecutions||0)+1;`})
  })
  await page.setContent('<!doctype html><html><body></body></html>');await page.evaluate(code+'\nwindow.fixtureLoad=loadScript;')
  const retry=await page.evaluate(async()=>{
   let failed=false;try{await Promise.all([window.fixtureLoad('culqi-custom-checkout','https://js.culqi.com/checkout-js'),window.fixtureLoad('culqi-3ds','https://3ds.culqi.com')])}catch{failed=true}
   await Promise.all([window.fixtureLoad('culqi-custom-checkout','https://js.culqi.com/checkout-js'),window.fixtureLoad('culqi-3ds','https://3ds.culqi.com')])
   return{failed,executions:window.fixtureExecutions,scripts:document.querySelectorAll('script').length}
  })
  assert.deepEqual(retry,{failed:true,executions:2,scripts:2});assert.equal(attempt,2)
  assert.equal(requests.filter(r=>r.url===threeDS).length,1);results.push({scenario:'terminal-error-manual-retry',pass:true,...retry});await page.close()
  const delayed=await browser.newPage();let held
  await delayed.route('**/*',route=>{requests.push({scenario:'timeout-late-load',url:route.request().url(),intercepted:true});assert.equal(route.request().url(),checkout);held=route})
  await delayed.setContent('<!doctype html><html><body></body></html>');await delayed.evaluate(code+'\nwindow.fixtureLoad=loadScript;')
  const start=Date.now()
  const timed=await delayed.evaluate(async()=>{try{await window.fixtureLoad('culqi-custom-checkout','https://js.culqi.com/checkout-js');return false}catch{return true}})
  const elapsed=Date.now()-start;assert.equal(timed,true);assert.ok(elapsed>=11500&&elapsed<20000,'real 12-second wait is bounded')
  await delayed.evaluate(()=>{window.fixtureRetry=window.fixtureLoad('culqi-custom-checkout','https://js.culqi.com/checkout-js').then(()=>true)})
  assert.ok(held);await held.fulfill({status:200,contentType:'text/javascript',body:'window.fixtureExecutions=(window.fixtureExecutions||0)+1;'})
  const late=await delayed.evaluate(async()=>({retry:await window.fixtureRetry,executions:window.fixtureExecutions,scripts:document.querySelectorAll('script').length}))
  assert.deepEqual(late,{retry:true,executions:1,scripts:1});assert.equal(requests.filter(r=>r.scenario==='timeout-late-load').length,1)
  results.push({scenario:'timeout-late-completion-without-reinjection',pass:true,elapsedMs:elapsed,...late})
  await delayed.close()
  fs.writeFileSync(output,JSON.stringify({browser:browser.version(),results,requests,realProviderRequests:0,scope:'actual loader in Chromium DOM, all SDK requests intercepted and fulfilled/aborted as local fixtures; no payment/storefront/provider acceptance'},null,2)+'\n')
  console.log(JSON.stringify({pass:results.length,browser:browser.version(),interceptedRequests:requests.length,realProviderRequests:0}))
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
