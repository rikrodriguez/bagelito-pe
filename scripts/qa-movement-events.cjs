/** Isolated browser input regression. QA RAF gate only; no application hooks.
 * Run serially AFTER qa:guided. Only an immutable HTTP-loopback build is allowed.
 * Synthetic blur/visibility tests prove listener wiring, not OS backgrounding.
 * Native Chromium/CDP input is emulated device coverage; no production hooks,
 * providers or writes. This probe supplements the original QA3D 480ms assertion.
 */
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { readFileSync, writeFileSync, mkdirSync, renameSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { resolve } = require('node:path')
const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:4173')
assert.ok(base.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(base.hostname), 'HTTP loopback only')
assert.ok(process.env.QA_HDR_FIXTURE_PATH, 'Pinned local HDR fixture required')
const hdr = readFileSync(process.env.QA_HDR_FIXTURE_PATH)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(hdr), 'a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb')
const hdrURL = 'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr'
const repo = resolve(__dirname, '..')
const output = resolve(process.env.QA_OUTPUT || resolve(repo, 'qa-artifacts/movement-events'))
mkdirSync(output, { recursive: true })
const report = {
  metadata: { startedAt: new Date().toISOString(), base: base.href,
    repositorySHA: execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding:'utf8' }).trim(),
    declaredBuildSHA: process.env.QA_CODE_SHA || null, hdrFixtureSHA256: hash(hdr), scriptSHA256: hash(readFileSync(__filename)),
    sourceSHA256: Object.fromEntries(['src/playable/PlayableStore.tsx','src/playable/movement-input.ts'].map(file => [file, hash(readFileSync(resolve(repo,file)))])),
    scope: 'Supplementary native input/RAF-gate probe; does not replace or relax the original 480ms QA3D assertion.',
    lifecycleEvents: 'blur and visibilitychange are explicitly synthetic wiring probes; document visibility is not changed.',
    gate: 'QA addInitScript wraps only requestAnimationFrame/cancelAnimationFrame; real performance clock, timers, input and app handlers remain active.',
    tolerances: { speed:2.45, positionRounding:0.01, expectedDistanceTolerance:0.035, noReplayTolerance:0.02, holdRequestedMs:480, observedHoldMinMs:450, observedHoldMaxMs:900 },
  }, status:'prepared', results:[], failures:[], network:[], events:[], captures:[]
}
function persist() {
  const file = resolve(output,'movement-events-results.json')
  writeFileSync(file+'.tmp', JSON.stringify(report,null,2)); renameSync(file+'.tmp',file)
}
function record(type,details={}) { const entry={at:new Date().toISOString(),type,...details}; report.events.push(entry); console.log(JSON.stringify(entry)); persist() }
const delay = milliseconds => new Promise(done => setTimeout(done,milliseconds))
async function bounded(operation, milliseconds, label) {
  let timer
  try { return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),milliseconds)})]) }
  finally { clearTimeout(timer) }
}

async function isolateContext(context,traffic) {
  const pending=new Set();let closing=false
  const reportRouteError=(entry,allowedGet)=>{
    const expected=closing&&allowedGet&&/disposed|(?:page|browser|context).*closed|net::ERR_ABORTED/i.test(entry.message)&&!/timeout|timed out/i.test(entry.message)
    if(expected)traffic.closingRouteErrors.push(entry)
    else{traffic.routeErrors.push(entry);report.failures.push({mode:traffic.mode,message:'Route handler failed: '+entry.message});record('route-error',{mode:traffic.mode,...entry})}
  }
  await context.route('**/*',route=>{
    const work=(async()=>{
      const request=route.request(),url=request.url(),localGet=request.method()==='GET'&&new URL(url).origin===base.origin,fixtureGet=request.method()==='GET'&&url===hdrURL
      if(closing){
        traffic.closingAborts.push({method:request.method(),url})
        if(!localGet&&!fixtureGet){traffic.blocked.push({method:request.method(),url,reason:'forbidden-during-close'});report.failures.push({mode:traffic.mode,message:'Forbidden request while closing: '+request.method()+' '+url})}
        await route.abort('blockedbyclient').catch(error=>reportRouteError({method:request.method(),url,message:String(error)},localGet||fixtureGet));return
      }
      try{
        if(localGet){const response=await route.fetch({maxRedirects:0});traffic.reads.push({method:'GET',url,status:response.status()});if(response.status()>=400){report.failures.push({mode:traffic.mode,message:'Local GET HTTP '+response.status()+': '+url})}if(response.status()>=300&&response.status()<400){traffic.blocked.push({method:'GET',url,reason:'redirect'});report.failures.push({mode:traffic.mode,message:'Local redirect is forbidden: '+url});await route.abort('blockedbyclient');return}await route.fulfill({response});return}
        if(fixtureGet){traffic.fixtureReads++;await route.fulfill({status:200,headers:{'content-type':'application/octet-stream','access-control-allow-origin':'*'},body:hdr});return}
        traffic.blocked.push({method:request.method(),url});report.failures.push({mode:traffic.mode,message:'Unrelated request or write forbidden: '+request.method()+' '+url});await route.abort('blockedbyclient')
      }catch(error){
        const entry={method:request.method(),url,message:String(error)}
        reportRouteError(entry,localGet||fixtureGet)
        await route.abort('blockedbyclient').catch(abortError=>reportRouteError({...entry,message:String(abortError),phase:'abort-after-error'},localGet||fixtureGet))
      }
    })()
    pending.add(work);void work.then(()=>pending.delete(work),()=>pending.delete(work));return work
  })
  return async()=>{closing=true;while(pending.size)await Promise.allSettled([...pending]);await context.close();while(pending.size)await Promise.allSettled([...pending])}
}

// Preserve each original native request ID even when its callback is deferred.
// cancel(originalId) also cancels the new native handle scheduled by resume().
function installRafGate() {
  const requestNative=window.requestAnimationFrame.bind(window), cancelNative=window.cancelAnimationFrame.bind(window)
  const entries=new Map(), events=[]
  let paused=false, delivered=0, blocked=0, cancelled=0
  const deliver=(entry,timestamp)=>{
    if(!entries.has(entry.id)) return
    if(paused){entry.queued=true;blocked++;return}
    entries.delete(entry.id);entry.queued=false;delivered++
    Reflect.apply(entry.callback,window,[timestamp])
  }
  window.requestAnimationFrame=callback=>{
    if(typeof callback!=='function')return requestNative(callback)
    const entry={id:0,currentNativeId:0,callback,queued:false}
    entry.id=requestNative(timestamp=>deliver(entry,timestamp))
    entry.currentNativeId=entry.id;entries.set(entry.id,entry)
    return entry.id
  }
  window.cancelAnimationFrame=id=>{
    const entry=entries.get(id)
    if(entry){entries.delete(id);cancelNative(entry.currentNativeId);cancelled++}
    else cancelNative(id)
  }
  const snapshot=()=>({paused,delivered,blocked,cancelled,pending:entries.size,queued:[...entries.values()].filter(entry=>entry.queued).length,now:performance.now()})
  window.__bagelitoQaRafGate={
    async pause(){paused=true;await new Promise(done=>requestNative(()=>requestNative(done)));return snapshot()},
    resume(){paused=false;for(const entry of entries.values())if(entry.queued){entry.queued=false;entry.currentNativeId=requestNative(timestamp=>deliver(entry,timestamp))}return snapshot()},
    snapshot,
  }
  const capture=event=>{
    if(event.type.startsWith('key')&&!['KeyD','KeyA'].includes(event.code)) return
    const target=event.target instanceof Element?event.target:null
    events.push({type:event.type,at:performance.now(),trusted:event.isTrusted,code:event.code||null,key:event.key||null,repeat:Boolean(event.repeat),pointerType:event.pointerType||null,pointerId:event.pointerId??null,isPad:Boolean(target?.closest('.mobile-pad')),targetClass:target?.className||null,visibility:document.visibilityState})
  }
  window.addEventListener('keydown',capture,{capture:true});window.addEventListener('keyup',capture,{capture:true});window.addEventListener('blur',capture,{capture:true})
  document.addEventListener('visibilitychange',capture,{capture:true})
  for(const type of ['pointerdown','pointerup','pointercancel'])document.addEventListener(type,capture,{capture:true})
  window.__bagelitoQaMovementEvents=events
}

async function state(page) { return page.evaluate(()=>({x:Number(document.querySelector('.playable-shell')?.getAttribute('data-player-x')),worldScene:document.querySelector('.playable-shell')?.getAttribute('data-world-scene'),tour:document.querySelector('.playable-shell')?.getAttribute('data-tour-node'),guided:Boolean(document.querySelector('.guided-commerce')),cameraGuided:document.querySelector('.playable-shell')?.classList.contains('guided-mode'),gate:window.__bagelitoQaRafGate.snapshot(),events:window.__bagelitoQaMovementEvents.slice()})) }
async function frames(page,count=3) {
  await bounded(page.evaluate(count=>new Promise(done=>{let seen=0;function frame(){if(++seen===count)done();else requestAnimationFrame(frame)}requestAnimationFrame(frame)}),count),60000,'Resumed real animation frames')
}
async function waitDOM(page,expression,arg) { await page.waitForFunction(expression,arg,{polling:100,timeout:30000}) }
async function coordinateClick(page,locator) {
  const box=await locator.boundingBox()
  assert.ok(box&&box.width>0&&box.height>0,'Native coordinate click requires an existing visible target')
  const point={x:box.x+box.width/2,y:box.y+box.height/2}
  assert.ok(await locator.evaluate((element,point)=>{const hit=document.elementFromPoint(point.x,point.y);return Boolean(hit&&(element===hit||element.contains(hit)))},point),'Coordinate target must receive the click')
  await page.mouse.click(point.x,point.y)
}
async function pause(page) {
  const paused=await bounded(page.evaluate(()=>window.__bagelitoQaRafGate.pause()),10000,'Native RAF gate pause fence')
  assert.equal(paused.paused,true);return paused
}
async function assertGated(page,start) {
  const current=await state(page)
  assert.equal(current.gate.paused,true);assert.equal(current.gate.delivered,start.delivered,'No wrapped app RAF callback may run during the input interval')
  return current
}
async function resumeAndRead(page) { await page.evaluate(()=>window.__bagelitoQaRafGate.resume());await frames(page,3);return state(page) }
async function assertNoReplay(page,x) { await frames(page,3);const after=await state(page);assert.ok(Math.abs(after.x-x)<=.02,'Completed or reset input cannot replay on later frames');return after }
function measuredHold(events,downType,upType,predicate) {
  const relevant=events.filter(predicate),down=relevant.find(event=>event.type===downType),up=relevant.findLast(event=>event.type===upType)
  assert.ok(down&&up,'Both native input endpoints must be observed')
  assert.ok(down.trusted&&up.trusted,'Input endpoints must be trusted browser events')
  const milliseconds=up.at-down.at
  assert.ok(milliseconds>=450&&milliseconds<=900,'Requested 480ms hold must be sub-second and close to its requested duration: '+milliseconds)
  return {milliseconds,down,up,relevant}
}
async function keyboardCase(page,mode,name,key,{repeats=false,idleBeforeMs=0,idleAfterMs=0}={}) {
  record('case-start',{mode,name});const before=await state(page),gate=await pause(page)
  if(idleBeforeMs)await delay(idleBeforeMs)
  await page.keyboard.down(key)
  if(repeats){await delay(120);await page.keyboard.down(key);await delay(120);await page.keyboard.down(key);await delay(240)}else await delay(480)
  await page.keyboard.up(key)
  if(idleAfterMs)await delay(idleAfterMs)
  const held=await assertGated(page,gate),events=held.events.slice(before.events.length)
  const hold=measuredHold(events,'keydown','keyup',event=>event.code===(key==='d'?'KeyD':'KeyA'))
  if(repeats)assert.ok(hold.relevant.some(event=>event.type==='keydown'&&event.repeat),'The browser must emit repeat keydowns')
  const after=await resumeAndRead(page),sign=key==='d'?1:-1,expected=sign*2.45*hold.milliseconds/1000,actual=after.x-before.x
  assert.ok(Math.abs(actual-expected)<=.035,'Distance must match real native-event duration exactly once: '+JSON.stringify({actual,expected}))
  assert.ok(sign*actual>.12,'Supplementary 480ms tap must exceed the unchanged QA3D minimum displacement')
  const stable=await assertNoReplay(page,after.x)
  report.results.push({mode,name,pass:true,requestedHoldMs:480,observedHoldMs:hold.milliseconds,idleBeforeMs,idleAfterMs,beforeX:before.x,afterX:after.x,stableX:stable.x,expectedDelta:expected,actualDelta:actual,deliveredDuringPause:held.gate.delivered-gate.delivered,nativeEvents:events});record('case-pass',{mode,name})
}
async function resetCase(page,name,type) {
  const mode='desktop';record('case-start',{mode,name});const before=await state(page),gate=await pause(page)
  await page.keyboard.down('d');await delay(240)
  await page.evaluate(type=>{if(type==='blur')window.dispatchEvent(new Event('blur'));else document.dispatchEvent(new Event('visibilitychange'))},type)
  await delay(240);await page.keyboard.up('d')
  const held=await assertGated(page,gate),events=held.events.slice(before.events.length),synthetic=events.find(event=>event.type===type)
  assert.ok(synthetic&&!synthetic.trusted,'Lifecycle probe is explicitly synthetic listener wiring')
  const after=await resumeAndRead(page)
  assert.ok(Math.abs(after.x-before.x)<=.02,'Lifecycle reset must discard held and already queued movement')
  const stable=await assertNoReplay(page,after.x)
  report.results.push({mode,name,pass:true,beforeX:before.x,afterX:after.x,stableX:stable.x,syntheticEvent:synthetic,nativeEvents:events});record('case-pass',{mode,name})
}
async function guidedCase(page,tour=false) {
  const mode='desktop',name=tour?'paused-3d-tour-entry-exit-clears-input':'paused-commerce-entry-exit-clears-input';record('case-start',{mode,name})
  const before=await state(page),gate=await pause(page)
  await page.keyboard.down('d');await delay(120)
  if(tour){
    await coordinateClick(page,page.locator('.tour-start-button'))
    await waitDOM(page,()=>document.querySelector('.playable-shell')?.getAttribute('data-tour-node')==='totem')
    await page.keyboard.down('d');await page.keyboard.up('d')
    for(const next of ['vitrina','bagels','schmears','production','cashier','pickup','none']){
      await coordinateClick(page,page.locator('.guided-tour-actions > button.primary'))
      await waitDOM(page,expected=>document.querySelector('.playable-shell')?.getAttribute('data-tour-node')===expected,next)
    }
  }else{
    await coordinateClick(page,page.locator('.brand-pill'))
    await waitDOM(page,()=>Boolean(document.querySelector('.guided-commerce')))
    await page.keyboard.down('d');await page.keyboard.up('d')
    await coordinateClick(page,page.locator('.guided-store-menu-button'))
    await waitDOM(page,()=>Boolean(document.querySelector('.guided-store-menu-panel')))
    await coordinateClick(page,page.locator('.guided-store-menu-panel > button').nth(2))
    await waitDOM(page,()=>!document.querySelector('.guided-commerce'))
  }
  await waitDOM(page,()=>Boolean(document.querySelector('.playable-shell:not(.guided-mode)')))
  const held=await assertGated(page,gate),after=await resumeAndRead(page)
  assert.ok(Math.abs(after.x-before.x)<=.02,'Guided transitions while gated must discard stale input before free exploration resumes')
  const stable=await assertNoReplay(page,after.x)
  report.results.push({mode,name,pass:true,beforeX:before.x,afterX:after.x,stableX:stable.x,deliveredDuringPause:held.gate.delivered-gate.delivered,nativeEvents:held.events.slice(before.events.length)});record('case-pass',{mode,name})
}
async function touchCase(page,cdp,name,index,{idleBeforeMs=0}={}) {
  const mode='mobile';record('case-start',{mode,name});const button=page.locator('.mobile-pad > button').nth(index)
  assert.ok(await button.isVisible(),'Real mobile movement pad must be visible')
  const box=await button.boundingBox();assert.ok(box&&box.width>0&&box.height>0)
  const point={x:box.x+box.width/2,y:box.y+box.height/2}
  assert.ok(await button.evaluate((element,point)=>{const hit=document.elementFromPoint(point.x,point.y);return hit===element||element.contains(hit)},point),'Native touch must hit the visible pad')
  const before=await state(page),gate=await pause(page);if(idleBeforeMs)await delay(idleBeforeMs)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1,radiusX:2,radiusY:2,force:1}]});await delay(480)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  const held=await assertGated(page,gate),events=held.events.slice(before.events.length)
  const hold=measuredHold(events,'pointerdown','pointerup',event=>event.pointerType==='touch'&&event.isPad)
  const after=await resumeAndRead(page),sign=index===3?1:-1,expected=sign*2.45*hold.milliseconds/1000,actual=after.x-before.x
  assert.ok(Math.abs(actual-expected)<=.035,'Native mobile touch must move by its real duration once: '+JSON.stringify({actual,expected}))
  assert.ok(sign*actual>.12,'Native 480ms touch must produce positive displacement')
  const stable=await assertNoReplay(page,after.x)
  report.results.push({mode,name,pass:true,padVisible:true,nativeTouchMethod:'CDP Input.dispatchTouchEvent',requestedHoldMs:480,observedHoldMs:hold.milliseconds,idleBeforeMs,beforeX:before.x,afterX:after.x,stableX:stable.x,expectedDelta:expected,actualDelta:actual,nativeEvents:events});record('case-pass',{mode,name})
}
async function audit(){
  const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.QA_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']})
  report.metadata.browserExecuted=true;report.metadata.browserVersion=browser.version();report.status='running';persist()
  try{
    for(const mode of [{name:'desktop',viewport:{width:1280,height:800},touch:false},{name:'mobile',viewport:{width:390,height:844},touch:true}]){
      const context=await browser.newContext({viewport:mode.viewport,deviceScaleFactor:1,hasTouch:mode.touch,isMobile:mode.touch,serviceWorkers:'block'})
      const traffic={mode:mode.name,reads:[],fixtureReads:0,blocked:[],pageErrors:[],consoleErrors:[],routeErrors:[],closingRouteErrors:[],closingAborts:[]};report.network.push(traffic)
      await context.addInitScript(installRafGate)
      const closeContext=await isolateContext(context,traffic)
      const page=await context.newPage();page.setDefaultTimeout(45000)
      page.on('pageerror',error=>{traffic.pageErrors.push(error.message);report.failures.push({mode:mode.name,message:'Browser page error: '+error.message});record('page-error',{mode:mode.name,message:error.message})});page.on('console',message=>{if(message.type()==='error'){traffic.consoleErrors.push(message.text());report.failures.push({mode:mode.name,message:'Browser console error: '+message.text()});record('console-error',{mode:mode.name,message:message.text()})}})
      try{
        const config=await page.request.get(new URL('/api/payments/culqi/config',base).href,{maxRedirects:0});assert.equal(config.status(),200)
        const payment=await config.json();for(const key of ['enabled','configured','intakeEnabled'])assert.equal(payment[key],false,key+' must remain disabled');assert.equal(payment.mode,'disabled')
        record('mode-start',{mode:mode.name,paymentDisabled:true,touchContext:mode.touch})
        const response=await page.goto(new URL('/playable',base).href,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200)
        await page.locator('.bagelito-3d-blue-sign').nth(7).waitFor({state:'attached'});await frames(page,3)
        await page.getByRole('button',{name:'Explorar libre',exact:true}).click()
        await waitDOM(page,()=>Boolean(document.querySelector('.playable-shell:not(.guided-mode)')));await frames(page,3)
        if(mode.touch){
          const cdp=await context.newCDPSession(page)
          await touchCase(page,cdp,'native-touch-480ms-no-replay',3)
          await touchCase(page,cdp,'native-touch-after-long-idle-no-jump',1,{idleBeforeMs:3000})
          await cdp.detach()
        }else{
          await keyboardCase(page,mode.name,'native-repeat-keydown-keyup-480ms-no-replay','d',{repeats:true,idleAfterMs:500})
          await keyboardCase(page,mode.name,'native-key-after-long-idle-no-jump','a',{idleBeforeMs:3000})
          await resetCase(page,'synthetic-blur-discards-queued-held','blur')
          await resetCase(page,'synthetic-visibilitychange-discards-queued-held','visibilitychange')
          await guidedCase(page,false)
          await guidedCase(page,true)
          await keyboardCase(page,mode.name,'fresh-native-key-after-guided-transitions','d')
        }
        const capture=mode.name+'-free-exploration-after-events.png';await page.screenshot({path:resolve(output,capture),animations:'disabled'});report.captures.push({mode:mode.name,capture,sha256:hash(readFileSync(resolve(output,capture)))})
        assert.ok(traffic.fixtureReads>0);assert.deepEqual(traffic.blocked,[]);assert.deepEqual(traffic.reads.filter(read=>read.status>=400),[]);assert.deepEqual(traffic.pageErrors,[]);assert.deepEqual(traffic.consoleErrors,[])
        record('mode-pass',{mode:mode.name})
      }catch(error){report.failures.push({mode:mode.name,message:String(error.stack||error)});record('mode-fail',{mode:mode.name,message:String(error)});try{report.events.push({type:'failure-state',mode:mode.name,state:await bounded(state(page),5000,'Failure state')})}catch(diagnostic){report.events.push({type:'failure-state-error',message:String(diagnostic)})}}
      finally{await closeContext();persist()}
    }
  }finally{await browser.close();report.status=report.failures.length?'failed':'passed';report.metadata.finishedAt=new Date().toISOString();persist()}
  console.log(report.results.length+' movement event checks; '+report.failures.length+' failures');if(report.failures.length)process.exitCode=1
}
if(process.env.QA_PREFLIGHT_ONLY==='1'){report.status='preflight-passed';report.metadata.browserExecuted=false;persist();console.log('Movement-event probe metadata preflight PASS; no browser launched')}
else audit().catch(error=>{report.failures.push({message:String(error.stack||error)});report.status='failed';persist();console.error(error);process.exitCode=1})
