/** Mobile live-store acceptance, serial loopback browser only.
 * Eight scenes x 320x700 / 390x844. These measurements supplement the unchanged
 * guided32/world20 runners; geometric visibility is not photographic parity.
 * BASE_URL=http://127.0.0.1:4173 QA_HDR_FIXTURE_PATH=/path/lebombo_1k.hdr node scripts/qa-mobile-vitrina.cjs
 */
const assert=require('node:assert/strict'),{chromium}=require('playwright')
const {readFileSync,writeFileSync,mkdirSync,renameSync}=require('node:fs'),{resolve}=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process')
const {readPinnedHDR,installLoopbackGuard}=require('./lib/qa-loopback-guard.cjs')
const {measureMobileLayout,inspectTapTarget,inspectCardContent}=require('./lib/qa-mobile-layout.cjs')
const repo=resolve(__dirname,'..'),base=new URL(process.env.BASE_URL||'http://127.0.0.1:4173'),hdr=readPinnedHDR(process.env.QA_HDR_FIXTURE_PATH),output=resolve(process.env.QA_OUTPUT||resolve(repo,'qa-artifacts/mobile-vitrina'))
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname),'HTTP loopback only')
mkdirSync(output,{recursive:true})
const hash=b=>createHash('sha256').update(b).digest('hex'),sourcePaths=['src/playable/GuidedCommerce.tsx','src/playable/guided-commerce.css','src/playable/PlayableStore.tsx','src/playable/playable.css','scripts/qa-mobile-vitrina.cjs','scripts/lib/qa-mobile-layout.cjs','scripts/lib/qa-loopback-guard.cjs']
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,hash(readFileSync(resolve(repo,p)))]))
const menu=JSON.parse(readFileSync(resolve(repo,'src/domain/data/verified-menu-2026-10-21.json'),'utf8'))
const focusBagels=process.env.QA_MOBILE_FOCUS==='bagels';assert.ok(!process.env.QA_MOBILE_FOCUS||focusBagels,'Only QA_MOBILE_FOCUS=bagels is supported')
const declaredSource=process.env.QA_CODE_SHA?Object.fromEntries(sourcePaths.filter(p=>p.startsWith('src/')).map(p=>[p,hash(execFileSync('git',['show',process.env.QA_CODE_SHA+':'+p],{cwd:repo}))])):null
const scenes=['selector','pack-size','pack-qty','bagels','combos','schmear-size','schmears','cashier']
const report={metadata:{startedAt:new Date().toISOString(),declaredBuildSHA:process.env.QA_CODE_SHA||null,repositorySHA:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),base:base.href,sourceSHA256:sourceHashes(),expectedScenes:focusBagels?2:16,scenes:focusBagels?['bagels']:scenes,declaredAppSourceSHA256:declaredSource,viewportSizes:[{width:390,height:844},{width:320,height:700}],criteria:{canvasFree:.45,productROIFree:.90,productCentres:1,otherROIFree:.60,otherCentres:.75,tapCSSPixels:44,numericTolerance:.01,minTextContrast:4.5},measurementLimit:'Opaque DOM occlusion only: projected plate anchors and live Canvas do not measure mesh-on-mesh occlusion. Physical POS blocking a bowl or a cropped logo requires separate manual pixel review.',focus:focusBagels?'bagels-only':'all-eight-scenes',scope:'Real WebGL plus opaque DOM occlusion, native touch scroll/taps and catalog text; not final photorealism, physical-device or payment validation.'},status:'prepared',results:[],extras:[],catalog:[],failures:[],events:[],network:[]}
const persist=()=>{const p=resolve(output,'mobile-vitrina-results.json');writeFileSync(p+'.tmp',JSON.stringify(report,null,2));renameSync(p+'.tmp',p)}
function record(type,details={}){const e={at:new Date().toISOString(),type,...details};report.events.push(e);console.log(JSON.stringify(e));persist()}
const delay=ms=>new Promise(done=>setTimeout(done,ms))
async function frames(page,n=3){let timer;try{await Promise.race([page.evaluate(n=>new Promise(done=>{let count=0;function frame(){if(++count===n)done();else requestAnimationFrame(frame)}requestAnimationFrame(frame)}),n),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Real frames timed out')),45000)})])}finally{clearTimeout(timer)}}
async function swipe(page,cdp,scrollable,axis,sign){
 const r=scrollable.rect,x=Math.max(12,Math.min(page.viewportSize().width-12,r.x+r.width*.5)),y=Math.max(80,Math.min(page.viewportSize().height-80,r.y+r.height*.5))
 const start=axis==='x'?{x:sign<0?r.right-16:r.x+16,y}:{x,y:sign<0?r.bottom-12:r.y+12},end=axis==='x'?{x:sign<0?r.x+16:r.right-16,y}:{x,y:sign<0?r.y+12:r.bottom-12}
 assert.ok(Math.abs(end[axis]-start[axis])>=24,'A real scroll viewport must have room for a native gesture')
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]})
 for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/6,y:start.y+(end.y-start.y)*i/6,id:1}]});await delay(25)}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(180)
 record('native-scroll',{axis,sign,ancestorDepth:scrollable.depth,start,end})
}
async function reach(page,cdp,locator,fullHorizontal=false){
 for(let attempt=0;attempt<18;attempt++){
  const m=await locator.evaluate(inspectTapTarget),s=m.scrollables[0]
  const fullX=!fullHorizontal||!s?.horizontal||m.rect.x>=s.rect.x-1&&m.rect.right<=s.rect.right+1
  const fullY=!s?.vertical||m.rect.y>=s.rect.y-1&&m.rect.bottom<=s.rect.bottom+1
  if(m.visible&&m.clip.width>=43.99&&m.clip.height>=43.99&&m.hit&&fullX&&fullY)return m
  assert.ok(s,'Target is clipped/covered without a native scroll path: '+JSON.stringify(m))
  let axis=s.horizontal?'x':'y'
  if(s.vertical&&(!s.horizontal||m.rect.bottom>s.rect.bottom||m.rect.y<s.rect.y))axis='y'
  const sign=axis==='x'?(m.rect.right>s.rect.right?-1:1):(m.rect.bottom>s.rect.bottom?-1:1)
  await swipe(page,cdp,s,axis,sign)
 }
 throw Error('Native scroll could not reveal a 44px hittable target: '+await locator.getAttribute('aria-label'))
}
async function tap(page,cdp,locator,{fullHorizontal=false,label='control'}={}){
 const m=await reach(page,cdp,locator,fullHorizontal)
 assert.ok(m.rect.width>=43.99&&m.rect.height>=43.99,label+': full target must be44px')
 await page.touchscreen.tap(m.point.x,m.point.y)
 record('native-tap',{label:m.label,point:m.point,raw:m.rect,clipped:m.clip})
 return m
}
async function textCheck(button,expectedName,expectedNote){
 const content=await button.evaluate(inspectCardContent)
 assert.ok(content.texts.some(t=>t.text===expectedName),'Full product name must be rendered: '+expectedName)
 if(expectedNote)assert.ok(content.texts.some(t=>t.text===expectedNote),'The published note must remain rendered: '+expectedName)
 for(const text of content.texts)assert.ok(text.complete&&!text.ellipsis&&!text.overlapsMinus,'Catalog text is hidden/truncated/overlapped: '+JSON.stringify(text))
 return content
}
function colorContrast(foreground,background){
 const parse=value=>{const v=(value.match(/[\d.]+/g)||[]).map(Number);return{rgb:v.slice(0,3),alpha:v[3]??1}}
 const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
 const fg=parse(foreground),bg=parse(background||'rgb(255,255,255)'),ratios=[0,255].map(back=>{const b=bg.rgb.map(v=>v*bg.alpha+back*(1-bg.alpha)),f=fg.rgb.map((v,i)=>v*fg.alpha+b[i]*(1-fg.alpha)),a=lum(f),c=lum(b);return(Math.max(a,c)+.05)/(Math.min(a,c)+.05)})
 return Math.min(...ratios)
}
async function tabCatalog(page,width,kind,items){
 const seen=new Set(),entries=[]
 for(let step=0;step<70&&seen.size<items.length;step++){
  await page.keyboard.press('Tab')
  const focus=await page.evaluate(()=>{const e=document.activeElement;return e?.matches('.mobile-bagel-card>button,.mobile-schmear-card>button')?{label:e.getAttribute('aria-label'),outline:getComputedStyle(e).outlineStyle,outlineWidth:getComputedStyle(e).outlineWidth,outlineOffset:getComputedStyle(e).outlineOffset,outlineColor:getComputedStyle(e).outlineColor,background:getComputedStyle(e).backgroundColor,boxShadow:getComputedStyle(e).boxShadow}:null})
  if(!focus)continue
  const item=items.find(i=>'Agregar '+i.name===focus.label);if(!item||seen.has(item.id))continue
  const button=page.getByRole('button',{name:focus.label,exact:true}),target=await button.evaluate(inspectTapTarget),text=await textCheck(button,item.name,item.note)
  assert.ok(target.clip.width>=43.99&&target.clip.height>=43.99,'Tab focus must reveal a44px catalog target')
  assert.ok(focus.outline!=='none'&&parseFloat(focus.outlineWidth)>0||focus.boxShadow!=='none','Tab focus must have a visible indicator')
  const focusContrast=colorContrast(focus.outlineColor,focus.background);assert.ok(focusContrast>=3,'Catalog focus indicator must reach3:1');seen.add(item.id);entries.push({name:item.name,target,text,focus,focusContrast})
 }
 assert.equal(seen.size,items.length,'Real Tab navigation must reveal every full catalog name')
 report.extras.push({width,kind:'real-tab-'+kind,entries});record('tab-catalog-pass',{width,kind,count:seen.size})
}
async function controlContrast(page,width,selector,label){
 const styles=await page.locator(selector).evaluate(e=>{let bg=null,p=e;while(p){const s=getComputedStyle(p),v=s.backgroundColor;if(v!=='rgba(0, 0, 0, 0)'&&v!=='transparent'){bg=v;break}p=p.parentElement}const s=getComputedStyle(e);return{color:s.color,background:bg,fontSize:s.fontSize,fontWeight:s.fontWeight}})
 const ratio=colorContrast(styles.color,styles.background)
 report.extras.push({width,kind:'computed-contrast',label,...styles,ratio});record('contrast',{width,label,...styles,ratio});assert.ok(ratio>=4.5,label+': contrast below fixed4.5')
}
async function count(page,selector,text){await page.waitForFunction(({selector,text})=>document.querySelector(selector)?.textContent===text,{selector,text},{polling:100,timeout:10000})}
async function capture(page,width,scene,extra=false){
 await page.locator('.guided-commerce[data-scene="'+scene+'"]').waitFor()
 await page.waitForFunction(expected=>document.querySelector('.playable-shell')?.getAttribute('data-world-scene')===expected,scene,{polling:100})
 await frames(page)
 const metrics=await page.evaluate(measureMobileLayout,{scene}),failures=[]
 const check=(condition,message)=>{if(!condition)failures.push(message)}
 check(metrics.liveWorld==='true','Live-world mode is required');check(metrics.canvas.count===1&&metrics.canvas.webgl&&!metrics.canvas.lost&&metrics.canvas.bufferWidth>0&&metrics.canvas.bufferHeight>0&&!metrics.canvas.hidden.length,'A visible live WebGL Canvas is required')
 check(metrics.overflow<=0,'Horizontal document overflow');check(metrics.canvasFreeFraction>=.45,'Less than45% clear Canvas');check(metrics.targets.length>=3,'No vacuous target sampling')
 const products=scene==='bagels'||scene==='schmears'
 for(const group of metrics.groups){
  check(group.anchors.length===group.expectedCount,'Wrong physical anchor count: '+group.kind)
  check([group.roi.x,group.roi.y,group.roi.width,group.roi.height].every(Number.isFinite)&&group.roi.width>0&&group.roi.height>0,'Invalid/empty physical ROI: '+group.kind)
  check(group.anchors.every(a=>a.inside&&[a.rect.x,a.rect.y,a.rect.width,a.rect.height].every(Number.isFinite)&&a.rect.width>0&&a.rect.height>0),'Offscreen/invalid physical labels: '+group.kind)
  check(typeof group.clearFraction==='number'&&group.clearFraction>=(products ? .90 : .60),'Physical ROI occluded: '+group.kind)
  const free=group.anchors.filter(a=>a.free).length,required=products?group.expectedCount:Math.ceil(group.expectedCount*.75)
  check(free>=required,'Physical plate centres covered: '+group.kind+' '+free+'/'+group.expectedCount)
 }
 for(const target of metrics.targets)check(target.size44,'Enabled target below44px: '+target.label)
 const file=width+'-'+scene+(extra?'-extra-'+report.extras.length:'')+'.png';await page.screenshot({path:resolve(output,file),animations:'disabled'})
 const result={width,scene,file,sha256:hash(readFileSync(resolve(output,file))),metrics,failures,pass:failures.length===0}
 ;(extra?report.extras:report.results).push(result);report.failures.push(...failures.map(message=>({width,scene,message})));record('scene-captured',{width,scene,extra,pass:result.pass,canvasFree:metrics.canvasFreeFraction,groups:metrics.groups.map(g=>({kind:g.kind,clear:g.clearFraction,free:g.anchors.filter(a=>a.free).length,total:g.expectedCount}))})
 return result
}
async function selector(page,cdp){await tap(page,cdp,page.getByRole('button',{name:'Abrir menú',exact:true}));await tap(page,cdp,page.locator('.guided-store-menu-panel').getByRole('button',{name:'Packs · Combos · Schmears',exact:true}));await page.locator('[data-scene="selector"]').waitFor();await page.locator('.guided-store-menu-panel').waitFor({state:'hidden'})}
async function audit(){
 const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.QA_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});report.metadata.browserVersion=browser.version();report.status='running';persist()
 try{for(const {width,height}of report.metadata.viewportSizes){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'})
  const guard=await installLoopbackGuard(context,{base,hdr,onFailure:e=>{report.failures.push({width,network:e});persist()},onEvent:e=>record('network',{width,...e})});report.network.push({width,traffic:guard.traffic})
  const page=await context.newPage(),cdp=await context.newCDPSession(page);page.setDefaultTimeout(45000)
  page.on('pageerror',e=>{report.failures.push({width,pageError:e.message});persist()});page.on('console',e=>{if(e.type()==='error'){report.failures.push({width,consoleError:e.text()});persist()}})
  await page.addInitScript(()=>{window.__qaMobileTaps=[];window.__qaMobileTabs=[];document.addEventListener('keyup',event=>{if(event.key==='Tab')window.__qaMobileTabs.push({trusted:event.isTrusted,label:document.activeElement?.getAttribute('aria-label')})},{capture:true});document.addEventListener('pointerup',event=>{const e=event.target instanceof Element?event.target.closest('.guided-commerce button,.guided-commerce a'):null;if(e)window.__qaMobileTaps.push({pointerType:event.pointerType,trusted:event.isTrusted,label:e.getAttribute('aria-label')||e.textContent.trim()})},{capture:true})})
  try{
   const config=await page.request.get(new URL('/api/payments/culqi/config',base).href,{maxRedirects:0});assert.equal(config.status(),200);const payment=await config.json();for(const key of['enabled','configured','intakeEnabled'])assert.equal(payment[key],false);assert.equal(payment.mode,'disabled');assert.equal(payment.visualQaAllowed,true)
   await page.goto(new URL('/?qa=1',base).href,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Empezar pedido',exact:true}).tap();if(!focusBagels)await capture(page,width,'selector')
   await tap(page,cdp,page.getByRole('button',{name:'Packs',exact:true}));if(!focusBagels)await capture(page,width,'pack-size');if(!focusBagels)for(const button of await page.locator('.pack-format-grid>button').all())await reach(page,cdp,button)
   await tap(page,cdp,page.getByRole('button',{name:/Bagels grandes/}));if(!focusBagels)await capture(page,width,'pack-qty');if(!focusBagels)for(const button of await page.locator('.guided-pack-mix>button,.pack-choice-grid>button,.panel-back').all())await reach(page,cdp,button)
   const mix=page.locator('.guided-pack-mix>button');if(!focusBagels){await tap(page,cdp,mix.nth(1));assert.equal(await mix.nth(1).getAttribute('aria-pressed'),'true');await tap(page,cdp,mix.first());assert.equal(await mix.first().getAttribute('aria-pressed'),'true')}
   await tap(page,cdp,page.locator('.pack-choice-grid>button').first());await capture(page,width,'bagels');if(focusBagels){assert.ok(guard.traffic.fixtureReads>0);continue}await tabCatalog(page,width,'bagels',menu.bagels)
   for(const item of menu.bagels){
    const button=page.getByRole('button',{name:'Agregar '+item.name,exact:true});await reach(page,cdp,button,true);const before=await textCheck(button,item.name)
    await tap(page,cdp,button,{fullHorizontal:true});await count(page,'.bagel-live-summary>b','1/6');await textCheck(button,item.name)
    const minus=page.getByRole('button',{name:'Quitar '+item.name,exact:true});const minusMetrics=await tap(page,cdp,minus);await count(page,'.bagel-live-summary>b','0/6')
    report.catalog.push({width,kind:'bagel',id:item.id,name:item.name,text:before,minus:minusMetrics,pass:true});record('catalog-item-pass',{width,kind:'bagel',name:item.name})
   }
   const last=menu.bagels.at(-1),lastButton=page.getByRole('button',{name:'Agregar '+last.name,exact:true})
   for(let i=1;i<=6;i++){await tap(page,cdp,lastButton,{fullHorizontal:true});await count(page,'.bagel-live-summary>b',i+'/6')}
   await tap(page,cdp,lastButton,{fullHorizontal:true});await count(page,'.bagel-live-summary>b','6/6');await capture(page,width,'bagels',true);await controlContrast(page,width,'.guided-primary-next','primary-next');await controlContrast(page,width,'.guided-progress-master [aria-current="step"] span','active-progress')
   await tap(page,cdp,page.locator('.guided-primary-next'));await capture(page,width,'schmears');await tabCatalog(page,width,'schmears',menu.schmears)
   for(const item of menu.schmears){const button=page.getByRole('button',{name:'Agregar '+item.name,exact:true});await reach(page,cdp,button,true);const text=await textCheck(button,item.name,item.note);await tap(page,cdp,button,{fullHorizontal:true});await count(page,'.guided-store-cart-button>span','Tu pedido (7)');await textCheck(button,item.name,item.note);await tap(page,cdp,button,{fullHorizontal:true});await count(page,'.guided-store-cart-button>span','Tu pedido (6)');report.catalog.push({width,kind:'schmear',id:item.id,name:item.name,text,pass:true});record('catalog-item-pass',{width,kind:'schmear',name:item.name})}
   await tap(page,cdp,page.locator('.guided-primary-next'));await capture(page,width,'cashier')
   for(const button of await page.locator('.guided-cashier-action>button').all())await reach(page,cdp,button);const inquiry=page.locator('.guided-launch-contact>a');await reach(page,cdp,inquiry);const href=await inquiry.getAttribute('href');assert.ok(href?.startsWith('https://wa.me/51917547745?text='));assert.ok(decodeURIComponent(href).includes(last.name));assert.ok(decodeURIComponent(href).includes('no confirma ni paga el pedido'))
   // Never follow the external inquiry, payment, wallet or provider links.
   await selector(page,cdp);await tap(page,cdp,page.getByRole('button',{name:'Combos',exact:true}));await capture(page,width,'combos');await tap(page,cdp,page.locator('.approved-combo-overlay>button').first())
   const first=page.getByRole('button',{name:'Agregar '+menu.bagels[0].name,exact:true});for(let i=1;i<=2;i++){await tap(page,cdp,first,{fullHorizontal:true});await count(page,'.bagel-live-summary>b',i+'/2')}await tap(page,cdp,page.locator('.guided-primary-next'));await page.locator('[data-scene="schmears"]').waitFor()
   for(const name of['Classic Strawberry','Herb & Roasted Garlic']){const item=menu.schmears.find(i=>i.name===name),button=page.getByRole('button',{name:'Agregar '+name,exact:true});await tap(page,cdp,button,{fullHorizontal:true});const text=await textCheck(button,name,item.note);const minus=page.getByRole('button',{name:'Quitar '+name,exact:true});const minusMetrics=await reach(page,cdp,minus);assert.ok(minusMetrics.rect.width>=43.99&&minusMetrics.rect.height>=43.99);report.catalog.push({width,kind:'combo-schmear',name,text,minus:minusMetrics,pass:true});await capture(page,width,'schmears',true);await tap(page,cdp,minus);await page.waitForFunction(()=>document.querySelectorAll('.mobile-schmear-card[data-selected="true"]').length===0,undefined,{polling:100})}
   await selector(page,cdp);await tap(page,cdp,page.getByRole('button',{name:'Schmears',exact:true}));await capture(page,width,'schmear-size');for(const button of await page.locator('.guided-size-cards>button').all())await reach(page,cdp,button)
   const taps=await page.evaluate(()=>window.__qaMobileTaps);assert.ok(taps.length>20&&taps.every(t=>t.pointerType==='touch'&&t.trusted),'All commerce taps must be native trusted touch');const tabs=await page.evaluate(()=>window.__qaMobileTabs);assert.ok(tabs.length>=13&&tabs.every(t=>t.trusted),'Catalog Tab events must be trusted browser events');report.extras.push({width,kind:'native-taps',taps,tabs})
   assert.ok(guard.traffic.fixtureReads>0);assert.equal(report.results.filter(r=>r.width===width).length,8)
  }catch(error){report.failures.push({width,message:String(error.stack||error)});record('mode-failed',{width,message:String(error)});try{const file=width+'-failure.png';await page.screenshot({path:resolve(output,file),animations:'disabled',timeout:10000});report.extras.push({width,kind:'failure',file,sha256:hash(readFileSync(resolve(output,file)))})}catch{}}
  finally{await cdp.detach().catch(()=>{});await guard.close();persist()}
 }}finally{await browser.close();report.metadata.finalSourceSHA256=sourceHashes();report.metadata.sourceChangedDuringRun=JSON.stringify(report.metadata.sourceSHA256)!==JSON.stringify(report.metadata.finalSourceSHA256);if(report.metadata.sourceChangedDuringRun)report.failures.push({message:'Source changed during the run'});report.status=report.failures.length?'failed':'passed';report.metadata.finishedAt=new Date().toISOString();persist()}
 console.log(report.results.length+' mobile scene checks; '+report.catalog.length+' catalog checks; '+report.failures.length+' failures');if(report.failures.length)process.exitCode=1
}
if(process.env.QA_PREFLIGHT_ONLY==='1'){report.status='preflight-passed';report.metadata.browserExecuted=false;persist();console.log('Mobile vitrina metadata preflight PASS; no browser launched')}
else audit().catch(error=>{report.failures.push({message:String(error.stack||error)});report.status='failed';persist();console.error(error);process.exitCode=1})
