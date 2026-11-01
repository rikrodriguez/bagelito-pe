/** Static-image storefront smoke; no WebGL, app hooks, writes, providers or framework. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process')
const {inspectNoZoomPresentation}=require(path.join(__dirname,'qa-reference-entry-geometry.cjs'))
const hash=b=>createHash('sha256').update(b).digest('hex'),repo=process.env.QA_REPO_ROOT||path.resolve(__dirname,'..'),base=new URL(process.env.BASE_URL||'http://127.0.0.1:4173'),out=path.resolve(process.env.QA_OUTPUT||'/tmp/bagelito-exact-image-qa')
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname),'Loopback only')
const reference='0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9',asset=fs.readFileSync(path.join(repo,'public/images/store-reference-approved.webp'))
assert.equal(hash(asset),reference,'Approved image bytes must remain exact')
fs.mkdirSync(out,{recursive:true})
const sizes=[{width:390,height:844},{width:320,height:700},{width:1280,height:800}]
const selected=process.env.QA_EXACT_WIDTH?sizes.filter(s=>s.width===Number(process.env.QA_EXACT_WIDTH)):sizes
assert.ok(selected.length)
const report={metadata:{artifactProvenance:process.env.QA_ARTIFACT_PROVENANCE||null,noZoomAuditSHA256:hash(fs.readFileSync(path.join(__dirname,'qa-reference-entry-geometry.cjs'))),startedAt:new Date().toISOString(),base:base.href,declaredCodeSHA:process.env.QA_CODE_SHA||null,repositorySHA:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),driverSHA256:hash(fs.readFileSync(__filename)),referenceSHA256:reference,viewports:selected,mobileContract:'Explicit user change: no zoom/pan, DOMtitles16/context12, exact-source cropped art without painted-card duplication',scope:'Explicit changed mobile contract: exact-source crops and native readable cards, no zoom or horizontal pan; desktop preserves complete image. Review-only callbacks and noAPI/fetch/XHR/writes; one exact-key framework read per document recorded.'},criteria:{knownFrameworkReadKey:'tsr-scroll-restoration-v1_3',maxInitializationReadsPerDocument:1,applicationStorageReads:0,storageWrites:0,apiFetchXHR:0},status:'prepared',cases:[],failures:[],network:[],events:[]}
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
    const paintedAsset=page.waitForResponse(r=>r.url()===new URL('/images/store-reference-approved.webp',base).href&&r.status()===200)
    await page.goto(new URL('/?qa=1',base).href,{waitUntil:'domcontentloaded'});await paintedAsset
    await page.locator('[data-reference-category="packs"]').filter({visible:true}).first().waitFor({state:'visible'})
    const metrics=await page.evaluate(inspectNoZoomPresentation),file=viewport.width+'-nozoom-presentation.png'
    const full=viewport.width+'-nozoom-presentation-full.png';await page.screenshot({path:path.join(out,file)});await page.screenshot({path:path.join(out,full),fullPage:true});report.cases.push({viewport,file,sha256:hash(fs.readFileSync(path.join(out,file))),full,fullSHA256:hash(fs.readFileSync(path.join(out,full))),metrics,pass:null});event('nozoom-captured',{width:viewport.width,file,failures:metrics.failures.length})
    assert.ok(traffic.imageBodies.some(r=>r.url===new URL('/images/store-reference-approved.webp',base).href&&r.sha256===reference),'Actual source bytes must remain exact');assert.equal(metrics.canvasCount,0)
    for(const visual of metrics.failures)report.failures.push({width:viewport.width,visual})
    const focused=[]
    for(let i=0;i<30&&focused.length<3;i++){await page.keyboard.press('Tab');const f=await page.evaluate(()=>{const e=document.activeElement,name=e?.getAttribute('aria-label')||e?.textContent?.trim();return ['Packs','Combos','Schmears'].includes(name)?{name,outline:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth,shadow:getComputedStyle(e).boxShadow}:null});if(f&&!focused.some(x=>x.name===f.name)){assert.ok(f.outline!=='none'&&parseFloat(f.width)>0||f.shadow!=='none','Focused hotspot needs visible indicator');focused.push(f)}}
    assert.equal(focused.length,3,'All category hotspots must be reached by real Tab');report.cases.at(-1).focus=focused
    const callbacks=[]
    for(const [name,scene] of [['Packs','pack-size'],['Combos','combos'],['Schmears','schmear-size']]){
     if(callbacks.length){await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-reference-category="packs"]').filter({visible:true}).first().waitFor({state:'visible'})}
     const button=page.getByRole('button',{name,exact:true});if(viewport.width<600)await button.tap();else await button.click()
     await page.locator('.guided-commerce[data-reference-mode="true"][data-review-only="true"][data-scene="'+scene+'"]').waitFor({state:'visible'});assert.equal(await page.locator('canvas').count(),0)
     const capabilities=await page.evaluate(()=>window.__qaExactCapabilities),capabilityAudit=auditCapabilities(capabilities);assert.equal(capabilityAudit.errors.length,0,'Forbidden review capability: '+JSON.stringify(capabilityAudit.errors))
     callbacks.push({name,scene,nativeInput:viewport.width<600?'touch':'mouse',capabilities,capabilityAudit});event('category-callback',{width:viewport.width,name,scene})
    }
    report.cases.at(-1).callbacks=callbacks;report.cases.at(-1).pass=metrics.pass

   }catch(error){if(report.cases.at(-1)?.viewport.width===viewport.width){report.cases.at(-1).pass=false;report.cases.at(-1).error=String(error)}fail({message:String(error.stack||error)});event('case-failed',{width:viewport.width,message:String(error)});try{await page.screenshot({path:path.join(out,viewport.width+'-failure.png')})}catch{}}
   finally{try{await page.goto('about:blank',{waitUntil:'load'});const audit=auditCapabilities(traffic.capabilities);traffic.capabilityAudit=audit;if(audit.errors.length)fail({capabilities:audit.errors});event('capabilities-drained',{width:viewport.width,knownFrameworkReads:audit.knownFrameworkReads.length,forbidden:audit.errors.length})}catch(error){fail({capabilityDrainError:String(error)})}closing=true;await Promise.allSettled([...pending]);await context.close();await Promise.allSettled([...pending]);persist()}
  }
 }finally{await browser.close();report.status=report.failures.length?'failed':'passed';report.metadata.finishedAt=new Date().toISOString();persist()}
 console.log(report.cases.length+' image cases; '+report.failures.length+' failures');if(report.failures.length)process.exitCode=1
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1})
module.exports={inspectImageAndHotspots,auditCapabilities}
