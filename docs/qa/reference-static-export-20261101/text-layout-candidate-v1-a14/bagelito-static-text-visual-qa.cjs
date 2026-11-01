/** Static-image storefront smoke; no WebGL, app hooks, writes, providers or framework. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process')
const {inspectProductText}=require('/tmp/bagelito-text-geometry-audit.cjs')
const steps=require('/tmp/bagelito-reference-review-steps.cjs'),scenario=process.env.QA_E2E_SCENARIO||'pack-decline'
assert.ok(['pack-decline','pack-original','pack-flavoured','combo','schmear'].includes(scenario))
const hash=b=>createHash('sha256').update(b).digest('hex'),repo=process.env.QA_REPO_ROOT||process.cwd(),base=new URL(process.env.BASE_URL||'http://127.0.0.1:4173'),out=path.resolve(process.env.QA_OUTPUT||'/tmp/bagelito-exact-image-qa')
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname),'Loopback only')
const reference='0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9',asset=fs.readFileSync(path.join(repo,'public/images/store-reference-approved.webp'))
assert.equal(hash(asset),reference,'Approved image bytes must remain exact')
fs.mkdirSync(out,{recursive:true})
const sizes=[{width:390,height:844},{width:320,height:700},{width:1280,height:800}]
const selected=process.env.QA_EXACT_WIDTH?sizes.filter(s=>s.width===Number(process.env.QA_EXACT_WIDTH)):sizes
assert.ok(selected.length)
const report={metadata:{textAuditHelperSHA256:hash(fs.readFileSync('/tmp/bagelito-text-geometry-audit.cjs')),staticExportSHA:process.env.QA_EXPORT_SHA||null,originalNodeBase:'http://127.0.0.1:3210/',startedAt:new Date().toISOString(),base:base.href,declaredCodeSHA:process.env.QA_CODE_SHA||null,repositorySHA:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),driverSHA256:hash(fs.readFileSync(__filename)),referenceSHA256:reference,viewports:selected,scope:'Exact approved image bytes, uncropped image and accessible category hotspots; existing commercial review-only flow smoke. No3D, fetch/XHR/API/provider requests, application storage reads or writes. One exact-key TanStack initialization read per document is recorded, not claimed absent.'},criteria:{knownFrameworkReadKey:'tsr-scroll-restoration-v1_3',maxInitializationReadsPerDocument:1,applicationStorageReads:0,storageWrites:0,apiFetchXHR:0},scenario,helperSHA256:hash(fs.readFileSync('/tmp/bagelito-reference-review-steps.cjs')),status:'prepared',cases:[],failures:[],network:[],events:[]}
const persist=()=>fs.writeFileSync(path.join(out,'exact-image-results.json'),JSON.stringify(report,null,2))
const event=(type,data={})=>{const e={at:new Date().toISOString(),type,...data};report.events.push(e);console.log(JSON.stringify(e));persist()}
function inspectImageAndHotspots(){
 const image=[...document.images].find(i=>{const u=new URL(i.currentSrc,location.href);return u.pathname==='/images/store-reference-approved.webp'&&!u.search&&!u.hash&&i.getBoundingClientRect().width>0&&getComputedStyle(i).visibility!=='hidden'})
 if(!image)throw Error('The approved image must be a visible real image element')
 const r=image.getBoundingClientRect(),s=getComputedStyle(image),scale=s.objectFit==='contain'?Math.min(r.width/image.naturalWidth,r.height/image.naturalHeight):s.objectFit==='cover'?Math.max(r.width/image.naturalWidth,r.height/image.naturalHeight):null
 const position=s.objectPosition.split(/\s+/),offset=(space,value)=>value?.endsWith('%')?space*parseFloat(value)/100:parseFloat(value)||0
 const painted=scale?{x:r.x+offset(r.width-image.naturalWidth*scale,position[0]),y:r.y+offset(r.height-image.naturalHeight*scale,position[1]),width:image.naturalWidth*scale,height:image.naturalHeight*scale}:{x:r.x,y:r.y,width:r.width,height:r.height}
 const clip={x:0,y:0,right:innerWidth,bottom:innerHeight},ancestorIssues=[]
 for(let e=image;e;e=e.parentElement){
  const c=getComputedStyle(e),b=e.getBoundingClientRect()
  if(c.display==='none'||c.visibility==='hidden'||Number(c.opacity)<.99||c.filter!=='none'||c.clipPath!=='none')ancestorIssues.push({tag:e.tagName,className:e.className,display:c.display,visibility:c.visibility,opacity:c.opacity,filter:c.filter,clipPath:c.clipPath})
  if(e===image||e.tagName==='BODY'||e.tagName==='HTML')continue
  if(/hidden|clip|auto|scroll/.test(c.overflowX)){clip.x=Math.max(clip.x,b.x+e.clientLeft);clip.right=Math.min(clip.right,b.x+e.clientLeft+e.clientWidth)}
  if(/hidden|clip|auto|scroll/.test(c.overflowY)){clip.y=Math.max(clip.y,b.y+e.clientTop);clip.bottom=Math.min(clip.bottom,b.y+e.clientTop+e.clientHeight)}
 }
 const entireImageVisible=painted.x>=clip.x-.5&&painted.y>=clip.y-.5&&painted.x+painted.width<=clip.right+.5&&painted.y+painted.height<=clip.bottom+.5

 const expected={Packs:{x:396,y:350,right:660,bottom:584},Combos:{x:674,y:350,right:950,bottom:584},Schmears:{x:965,y:350,right:1229,bottom:584}}
 const buttons=Object.entries(expected).map(([name,source])=>{
  const e=[...document.querySelectorAll('button,a')].find(e=>(e.getAttribute('aria-label')||e.textContent).trim()===name&&e.getBoundingClientRect().width>0)
  if(!e)return{name,missing:true}
  const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,hit=document.elementFromPoint(x,y)
  const sourceRect={x:painted.x+source.x/1536*painted.width,y:painted.y+source.y/1024*painted.height,right:painted.x+source.right/1536*painted.width,bottom:painted.y+source.bottom/1024*painted.height}
  return{name,tag:e.tagName,role:e.getAttribute('role'),disabled:e.disabled||e.getAttribute('aria-disabled')==='true',rect:{x:b.x,y:b.y,width:b.width,height:b.height},inside:b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight,size44:b.width>=43.99&&b.height>=43.99,hittable:hit===e||e.contains(hit),centerMatchesPaintedCard:x>=sourceRect.x&&x<=sourceRect.right&&y>=sourceRect.y&&y<=sourceRect.bottom}
 })
 return{source:image.currentSrc,complete:image.complete,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,rect:{x:r.x,y:r.y,width:r.width,height:r.height},painted,clip,entireImageVisible,ancestorIssues,objectFit:s.objectFit,objectPosition:s.objectPosition,filter:s.filter,opacity:s.opacity,canvasCount:document.querySelectorAll('canvas').length,overflowX:document.documentElement.scrollWidth-innerWidth,buttons}
}
function auditCapabilities(events){
 const byDocument=new Map(),knownFrameworkReads=[],errors=[]
 for(const event of events){const key=String(event.documentId||'current');if(!byDocument.has(key))byDocument.set(key,[]);byDocument.get(key).push(event)}
 for(const [documentId,entries]of byDocument){let reads=0
  for(let i=0;i<entries.length;i++){const e=entries[i],next=entries[i+1]
   if(e.kind==='storage-access'&&e.name==='sessionStorage'&&next?.kind==='storage-method'&&next.name==='getItem'&&next.key==='tsr-scroll-restoration-v1_3'&&e.stack&&next.stack){
    reads++;knownFrameworkReads.push({documentId,key:next.key,accessStack:e.stack,readStack:next.stack,url:next.url});if(reads>1)errors.push({documentId,message:'More than one known framework initialization read'});i++;continue
   }
   errors.push({documentId,event:e,message:'Forbidden fetch/XHR/application-storage access or write'})
  }
 }
 return{knownFrameworkReads,errors}
}
async function main(){
 persist();if(process.env.QA_PREFLIGHT_ONLY==='1'){report.status='preflight-passed';report.metadata.browserExecuted=false;persist();return}
 const {chromium}=require('playwright'),browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-gpu']})
 try{
  report.metadata.browserVersion=browser.version()
  for(const viewport of selected){
   const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:viewport.width<600,isMobile:viewport.width<600,serviceWorkers:'block'}),pending=new Set(),traffic={reads:[],imageBodies:[],capabilities:[],blocked:[],errors:[]};let closing=false
   report.network.push({viewport,traffic})
   const fail=e=>{report.failures.push({viewport,...e});persist()}
   await context.route('**/*',route=>{
    const work=(async()=>{const q=route.request(),url=q.url(),target=new URL(url),allowed=q.method()==='GET'&&target.origin===base.origin&&!target.pathname.startsWith('/api/')
     try{
      if(!allowed){traffic.blocked.push({url,method:q.method()});fail({network:'Forbidden request',url,method:q.method()});return await route.abort()}
      if(closing)return await route.abort()
      const response=await route.fetch({maxRedirects:0}),status=response.status();traffic.reads.push({url,status})
      if(status>=300){fail({network:'Local HTTP/redirect error',url,status});return await route.abort()}
      if(target.pathname==='/images/store-reference-approved.webp')traffic.imageBodies.push({url,sha256:hash(await response.body())})
      await route.fulfill({response})
     }catch(error){const message=String(error),expected=closing&&allowed&&/disposed|(?:page|browser|context).*closed|net::ERR_ABORTED/i.test(message)&&!/timeout|timed out/i.test(message);if(!expected){traffic.errors.push({url,message});fail({network:message,url})}try{await route.abort()}catch{}}
    })();pending.add(work);work.finally(()=>pending.delete(work));return work
   })
   await context.addInitScript(()=>{
    const events=window.__qaExactCapabilities=[]
    const emit=event=>{const entry={...event,documentId:performance.timeOrigin,url:location.href};events.push(entry);console.debug('__qaExactCapability:'+JSON.stringify(entry))}
    const originalFetch=window.fetch;window.fetch=function(...args){emit({kind:'fetch',target:String(args[0]?.url||args[0])});return originalFetch.apply(this,args)}
    const originalOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(...args){emit({kind:'xhr',target:String(args[1])});return originalOpen.apply(this,args)}
    for(const name of ['localStorage','sessionStorage']){const descriptor=Object.getOwnPropertyDescriptor(window,name);if(descriptor?.get&&descriptor.configurable)Object.defineProperty(window,name,{...descriptor,get(){emit({kind:'storage-access',name,stack:new Error().stack});return descriptor.get.call(this)}})}
    for(const name of ['getItem','setItem','removeItem','clear','key']){const original=Storage.prototype[name];Storage.prototype[name]=function(...args){emit({kind:'storage-method',name,key:String(args[0]||''),stack:new Error().stack});return original.apply(this,args)}}
   })
   const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>fail({pageError:e.message}));page.on('console',e=>{const value=e.text();if(e.type()==='debug'&&value.startsWith('__qaExactCapability:')){try{traffic.capabilities.push(JSON.parse(value.slice('__qaExactCapability:'.length)));persist()}catch(error){fail({capabilityTraceError:String(error)})}return}if(e.type()==='error')fail({consoleError:value})})
   try{
    await page.goto(new URL('/?qa=1',base).href,{waitUntil:'domcontentloaded'})
    await page.locator('img[src*="store-reference-approved.webp"]').first().waitFor({state:'visible'})
    await page.waitForFunction(()=>[...document.images].some(i=>i.currentSrc.includes('/images/store-reference-approved.webp')&&i.complete&&i.naturalWidth===1536))
    const metrics=await page.evaluate(inspectImageAndHotspots)
    const file=viewport.width+'-exact-storefront.png';await page.screenshot({path:path.join(out,file),animations:'disabled'});report.cases.push({viewport,file,sha256:hash(fs.readFileSync(path.join(out,file))),metrics,pass:null});event('exact-image-captured',{width:viewport.width,file})
    assert.equal(metrics.source,new URL('/images/store-reference-approved.webp',base).href);assert.ok(traffic.imageBodies.some(r=>r.url===metrics.source&&r.sha256===reference),'Actually rendered URL must deliver the exact approved bytes');assert.ok(metrics.entireImageVisible,'Image must be fully inside viewport and ancestor clips');assert.equal(metrics.ancestorIssues.length,0,'Image ancestors must preserve visibility/filter/opacity');
    assert.equal(metrics.naturalWidth,1536);assert.equal(metrics.naturalHeight,1024);assert.equal(metrics.canvasCount,0,'User cancelled3D; no Canvas should mount');assert.equal(metrics.filter,'none');assert.ok(Number(metrics.opacity)>=.99);assert.ok(Math.abs(metrics.painted.width/metrics.painted.height-1.5)<.005,'Image aspect must remain3:2')
    assert.ok(metrics.painted.x>=metrics.rect.x-.5&&metrics.painted.y>=metrics.rect.y-.5&&metrics.painted.x+metrics.painted.width<=metrics.rect.x+metrics.rect.width+.5&&metrics.painted.y+metrics.painted.height<=metrics.rect.y+metrics.rect.height+.5,'Image must not be cropped inside its element')
    assert.ok(metrics.overflowX<=1,'No horizontal document overflow')
    for(const b of metrics.buttons)assert.ok(!b.missing&&!b.disabled&&b.inside&&b.size44&&b.hittable&&b.centerMatchesPaintedCard,'Accessible44px hotspot must match drawn card: '+JSON.stringify(b))
    const focused=[]
    for(let i=0;i<30&&focused.length<3;i++){await page.keyboard.press('Tab');const f=await page.evaluate(()=>{const e=document.activeElement,name=e?.getAttribute('aria-label')||e?.textContent?.trim();return ['Packs','Combos','Schmears'].includes(name)?{name,outline:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth,shadow:getComputedStyle(e).boxShadow}:null});if(f&&!focused.some(x=>x.name===f.name)){assert.ok(f.outline!=='none'&&parseFloat(f.width)>0||f.shadow!=='none','Focused hotspot needs visible indicator');focused.push(f)}}
    assert.equal(focused.length,3,'All category hotspots must be reached by real Tab');report.cases.at(-1).focus=focused
    const flow=[];report.cases.at(-1).flow=flow
    const act=async locator=>viewport.width<600?locator.tap():locator.click()
    const scene=async name=>page.locator('.guided-commerce[data-reference-mode="true"][data-review-only="true"][data-scene="'+name+'"]').waitFor({state:'visible'})
    const shot=async(name,selector)=>{const file=viewport.width+'-'+name+'.png';await page.locator(selector).screenshot({path:path.join(out,file)});const layout=await page.evaluate(()=>Object.fromEntries(['.guided-journey-back','.bagel-live-summary','.guided-order-counter','.guided-primary-next','.guided-cashier-action','.guided-payment-gate','.guided-payment-sheet'].map(selector=>{const e=document.querySelector(selector);if(!e)return[selector,null];const r=e.getBoundingClientRect(),c=getComputedStyle(e);return[selector,{rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},position:c.position,top:c.top,left:c.left,right:c.right,bottom:c.bottom,zIndex:c.zIndex,display:c.display,overflow:c.overflow}]})))
     const full=viewport.width+'-'+name+'-full.png';await page.screenshot({path:path.join(out,full),fullPage:true});const entry={name,file,sha256:hash(fs.readFileSync(path.join(out,file))),full,fullSHA256:hash(fs.readFileSync(path.join(out,full))),layout};flow.push(entry);event('flow-captured',{width:viewport.width,...entry})
     const back=layout['.guided-journey-back']?.rect,target=layout[selector]?.rect
     if(back&&target){const area=Math.max(0,Math.min(back.right,target.right)-Math.max(back.x,target.x))*Math.max(0,Math.min(back.bottom,target.bottom)-Math.max(back.y,target.y));assert.equal(area,0,'Back must not overlap active commerce panel')}
     for(const key of ['.guided-order-counter','.guided-primary-next','.guided-cashier-action','.guided-payment-gate','.guided-payment-sheet'])if(layout[key]){const m=layout[key];assert.ok(['relative','static'].includes(m.position),'Reference control must stay in document flow: '+key);assert.equal(m.overflow,'visible','Reference content must not clip/scroll internally: '+key);if(m.position==='relative')assert.ok(m.top==='auto'||m.top==='0px','Legacy negative top must not shift reference control: '+key)}
}
    report.cases.at(-1).textAudit=[]
    const auditState=async name=>{
     await shot('text-'+name,'.mobile-product-stage')
     const audit=await page.evaluate(inspectProductText,{selector:'.mobile-schmear-card',expectedCount:5,minFont:12})
     report.cases.at(-1).textAudit.push({state:name,...audit})
     for(const failure of audit.failures)report.failures.push({width:viewport.width,state:name,visual:failure})
     event('text-audited',{width:viewport.width,state:name,pass:audit.pass,failures:audit.failures.length,overlaps:audit.failures.filter(f=>f.type==='text-overlap').length})
    }
    await steps.choosePack(page,{},act);await steps.fillBagels(page,{flavors:['Plain']},act)
    await act(page.locator('.guided-primary-next'));await scene('schmears')
    await auditState('all-unselected')
    for(const name of ['Whipped Original','Ají Amarillo','Herb & Roasted Garlic','Honey Cinnamon','Classic Strawberry']){
     const button=page.getByRole('button',{name:'Agregar '+name,exact:true});await act(button);assert.equal(await page.locator('.mobile-schmear-card[data-selected="true"]').count(),1)
     await auditState(name.toLowerCase().replace(/[^a-z]+/g,'-'))
     await act(button);assert.equal(await page.locator('.mobile-schmear-card[data-selected="true"]').count(),0)
    }
    const capabilities=await page.evaluate(()=>window.__qaExactCapabilities),capabilityAudit=auditCapabilities(capabilities);assert.equal(capabilityAudit.errors.length,0,JSON.stringify(capabilityAudit.errors))
    report.cases.at(-1).capabilityAudit=capabilityAudit;report.cases.at(-1).pass=report.cases.at(-1).textAudit.every(a=>a.pass)


   }catch(error){if(report.cases.at(-1)?.viewport.width===viewport.width){report.cases.at(-1).pass=false;report.cases.at(-1).error=String(error)}fail({message:String(error.stack||error)});event('case-failed',{width:viewport.width,message:String(error)});try{await page.screenshot({path:path.join(out,viewport.width+'-failure.png')})}catch{}}
   finally{try{await page.goto('about:blank',{waitUntil:'load'});const audit=auditCapabilities(traffic.capabilities);traffic.capabilityAudit=audit;if(audit.errors.length)fail({capabilities:audit.errors});event('capabilities-drained',{width:viewport.width,knownFrameworkReads:audit.knownFrameworkReads.length,forbidden:audit.errors.length})}catch(error){fail({capabilityDrainError:String(error)})}closing=true;await Promise.allSettled([...pending]);await context.close();await Promise.allSettled([...pending]);persist()}
  }
 }finally{await browser.close();report.status=report.failures.length?'failed':'passed';report.metadata.finishedAt=new Date().toISOString();persist()}
 console.log(report.cases.length+' image cases; '+report.failures.length+' failures');if(report.failures.length)process.exitCode=1
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1})
module.exports={inspectImageAndHotspots,auditCapabilities}
