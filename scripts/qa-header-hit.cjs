/** Isolated native header regression: no RAF gate or application hooks.
 * The same criterion must fail on the old free-exploration header and pass
 * after the minimal CSS correction: pointer-events:auto, real hit, opens GUI.
 */
const {chromium}=require('playwright'),assert=require('node:assert/strict')
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs'),{createHash}=require('node:crypto'),{resolve}=require('node:path')
const root=resolve(__dirname,'..')
const base=new URL(process.env.BASE_URL||'http://127.0.0.1:4173'),output=resolve(root,process.env.QA_OUTPUT||'qa-artifacts/header-hit')
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname),'Loopback only')
assert.ok(process.env.QA_HDR_FIXTURE_PATH,'Pinned local HDR required')
const hdr=readFileSync(process.env.QA_HDR_FIXTURE_PATH),hash=bytes=>createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(hdr),'a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb')
const hdrURL='https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr'
mkdirSync(output,{recursive:true})
const report={metadata:{declaredBuildSHA:process.env.QA_CODE_SHA||null,base:base.href,scriptSHA256:hash(readFileSync(__filename)),gateInstalled:false,appHooks:false,startedAt:new Date().toISOString()},snapshots:[],reads:[],fixtureReads:0,blocked:[],routeErrors:[],closingErrors:[],pageErrors:[],consoleErrors:[],failures:[],status:'prepared'}
const persist=()=>writeFileSync(resolve(output,'header-hit-results.json'),JSON.stringify(report,null,2))
async function snapshot(page,label){
 const value=await page.evaluate(()=>{
  const button=document.querySelector('.brand-pill'),box=button?.getBoundingClientRect(),point=box?{x:box.x+box.width/2,y:box.y+box.height/2}:null
  const hit=point?document.elementFromPoint(point.x,point.y):null,parents=[]
  for(let element=button;element;element=element.parentElement)parents.push({tag:element.tagName,className:element.className,pointerEvents:getComputedStyle(element).pointerEvents})
  return{
   button:button?{tag:button.tagName,className:button.className,ariaLabel:button.getAttribute('aria-label'),pointerEvents:getComputedStyle(button).pointerEvents,visibility:getComputedStyle(button).visibility,display:getComputedStyle(button).display,box:{x:box.x,y:box.y,width:box.width,height:box.height}}:null,
   point,hitIsButton:Boolean(button&&hit&&(hit===button||button.contains(hit))),
   hitStack:point?document.elementsFromPoint(point.x,point.y).slice(0,8).map(element=>({tag:element.tagName,className:element.className,pointerEvents:getComputedStyle(element).pointerEvents})):[],
   ancestors:parents,entryPresent:Boolean(document.querySelector('.store-entry')),guidedCommerce:Boolean(document.querySelector('.guided-commerce')),cameraGuided:document.querySelector('.playable-shell')?.classList.contains('guided-mode')
  }
 });report.snapshots.push({label,...value});persist();return value
}
async function audit(){
 const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.QA_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']})
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,serviceWorkers:'block'}),pending=new Set();let closing=false
 const routeError=(error,url,allowedGet)=>{const value={url,message:String(error)};if(closing&&allowedGet&&/disposed|(?:page|browser|context).*closed|net::ERR_ABORTED/i.test(value.message)&&!/timeout|timed out/i.test(value.message))report.closingErrors.push(value);else{report.routeErrors.push(value);report.failures.push('Route error: '+value.message)}}
 await context.route('**/*',route=>{const work=(async()=>{const request=route.request(),url=request.url(),local=request.method()==='GET'&&new URL(url).origin===base.origin,fixture=request.method()==='GET'&&url===hdrURL;if(closing){if(!local&&!fixture){report.blocked.push({method:request.method(),url});report.failures.push('Forbidden closing request')}await route.abort('blockedbyclient').catch(error=>routeError(error,url,local||fixture));return}try{if(local){const response=await route.fetch({maxRedirects:0});report.reads.push({url,status:response.status()});if(response.status()>=400)report.failures.push('Local HTTP '+response.status()+': '+url);if(response.status()>=300&&response.status()<400){report.blocked.push({method:'GET',url,reason:'redirect'});report.failures.push('Forbidden redirect');await route.abort('blockedbyclient');return}await route.fulfill({response});return}if(fixture){report.fixtureReads++;await route.fulfill({status:200,headers:{'content-type':'application/octet-stream','access-control-allow-origin':'*'},body:hdr});return}report.blocked.push({method:request.method(),url});report.failures.push('Forbidden destination/write');await route.abort('blockedbyclient')}catch(error){routeError(error,url,local||fixture);await route.abort('blockedbyclient').catch(abortError=>routeError(abortError,url,local||fixture))}})();pending.add(work);void work.then(()=>pending.delete(work),()=>pending.delete(work));return work})
 const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>{report.pageErrors.push(error.message);report.failures.push('Page error: '+error.message)});page.on('console',message=>{if(message.type()==='error'){report.consoleErrors.push(message.text());report.failures.push('Console error: '+message.text())}})
 try{
  const response=await page.request.get(new URL('/api/payments/culqi/config',base).href,{maxRedirects:0});assert.equal(response.status(),200);const config=await response.json();for(const key of['enabled','configured','intakeEnabled'])assert.equal(config[key],false);assert.equal(config.mode,'disabled')
  await page.goto(new URL('/playable',base).href,{waitUntil:'domcontentloaded'});await page.locator('.bagelito-3d-blue-sign').nth(7).waitFor({state:'attached'})
  const entry=await snapshot(page,'entry-before-free');assert.equal(entry.entryPresent,true);assert.equal(entry.button.pointerEvents,'auto');assert.equal(entry.hitIsButton,true)
  await page.getByRole('button',{name:'Explorar libre',exact:true}).click();await page.waitForFunction(()=>Boolean(document.querySelector('.playable-shell:not(.guided-mode)')),undefined,{polling:100,timeout:30000})
  const free=await snapshot(page,'free-before-native-header-click')
  const capture=resolve(output,'free-header-before-native-click.png');await page.screenshot({path:capture,animations:'disabled'});report.capture={file:'free-header-before-native-click.png',sha256:hash(readFileSync(capture))}
  await page.mouse.click(free.point.x,free.point.y)
  try{await page.waitForFunction(()=>Boolean(document.querySelector('.guided-commerce')),undefined,{polling:100,timeout:3000})}catch{}
  const after=await snapshot(page,'after-native-header-click')
  if(free.button.pointerEvents!=='auto')report.failures.push('Free header brand button inherits pointer-events:'+free.button.pointerEvents)
  if(!free.hitIsButton)report.failures.push('Free header center hit belongs to another element')
  if(!after.guidedCommerce)report.failures.push('Native free-header click did not open guided commerce')
  assert.ok(report.fixtureReads>0);assert.deepEqual(report.blocked,[]);assert.deepEqual(report.routeErrors,[])
 }catch(error){report.failures.push(String(error.stack||error))}
 finally{closing=true;while(pending.size)await Promise.allSettled([...pending]);await context.close();while(pending.size)await Promise.allSettled([...pending]);await browser.close();report.metadata.finishedAt=new Date().toISOString();report.status=report.failures.length?'failed':'passed';persist()}
 console.log(JSON.stringify({status:report.status,failures:report.failures,snapshots:report.snapshots.map(value=>({label:value.label,pointerEvents:value.button?.pointerEvents??null,hitIsButton:value.hitIsButton,guidedCommerce:value.guidedCommerce,topHit:value.hitStack[0]}))},null,2));if(report.failures.length)process.exitCode=1
}
audit().catch(error=>{report.status='failed';report.failures.push(String(error));persist();console.error(error);process.exitCode=1})
