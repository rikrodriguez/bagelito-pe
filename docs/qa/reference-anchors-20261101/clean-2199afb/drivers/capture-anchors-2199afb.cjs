'use strict'
const fs = require('node:fs'), path = require('node:path'), {createHash} = require('node:crypto'), {execFileSync} = require('node:child_process')
const {chromium} = require('playwright')
const repo = '/workspace/bagelito-rebuilt-storefront'
const {installSafety} = require(repo + '/scripts/qa-rebuilt-safety.cjs')
const {inspectRebuiltGeometry} = require(repo + '/scripts/qa-rebuilt-geometry.cjs')
const out = '/workspace/bagelito-boutique-evidence-20261101/anchors-2199afb/read-only'
const sha = '2199afb6b51a3321259f512242bd47268ac3300c', hash = value => createHash('sha256').update(value).digest('hex')
fs.mkdirSync(out,{recursive:true})
const sourceFiles = ['src/playable/GuidedCommerce.tsx','scripts/qa-rebuilt-safety.cjs','scripts/qa-rebuilt-geometry.cjs']
function collect(dir) { for(const item of fs.readdirSync(repo+'/'+dir,{withFileTypes:true})) {const file=dir+'/'+item.name;if(item.isDirectory())collect(file);else if(/\.(tsx?|css)$/.test(item.name))sourceFiles.push(file)}}
collect('src/reference')
for(const name of fs.readdirSync(repo+'/public/images'))if(/^rebuilt[-.]/.test(name))sourceFiles.push('public/images/'+name)

const report = {status:'WIP-not-final', codeSHA:sha, observedHEAD:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(), startedAt:new Date().toISOString(), sourceHashes:Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(repo+'/'+file))])), scope:'Read-only first visual capture, Chromium emulation; no purchase cases or interaction coverage. No assertions removed or lowered.',cases:[], failures:[]}
const save = () => fs.writeFileSync(out+'/capture-results.json',JSON.stringify(report,null,2))
save()
;(async()=>{
 const browser = await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu']})
 try {
  for(const size of [{width:1536,height:1024,touch:false},{width:390,height:844,touch:true},{width:320,height:700,touch:true}]){
   const record={...size,safetyFailures:[],captures:[]};report.cases.push(record);save()
   const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:1,hasTouch:size.touch,isMobile:size.touch,serviceWorkers:'block'})
   const safety=await installSafety(context,new URL('http://127.0.0.1:3250/'),detail=>{record.safetyFailures.push(detail);save()})
   try {
    const page=await context.newPage()
    await page.goto('http://127.0.0.1:3250/',{waitUntil:'networkidle',timeout:30000})
    await page.locator('.rebuilt-store').waitFor()
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})
    record.images=await page.locator('.rebuilt-store img').evaluateAll(images=>images.map(i=>({source:i.currentSrc||i.src,complete:i.complete,width:i.naturalWidth,height:i.naturalHeight})))
    if(record.images.length !== 5)throw Error('Expected5currentHTMLimages,got'+record.images.length)
    record.retiredCopy=await page.evaluate(()=>{const normalizedText=document.body.innerText.replace(/\s+/g,' ');return{forbiddenCopyPresent:/Fresh\s+bagels|Happier\s+days/i.test(normalizedText),pattern:'Fresh\\s+bagels|Happier\\s+days',normalizedBodySHA256:null}})
    if(record.retiredCopy.forbiddenCopyPresent)throw Error('Forbidden retiredFresh/Happiercopy is present')
    record.retiredProps=await page.evaluate(()=>({toteMarkDOMCount:document.querySelectorAll('.rebuilt-tote-mark').length,propsPixelAssessment:'Pending manual actual screenshot inspection; DOM absence is not an image object detector'}))
    if(record.retiredProps.toteMarkDOMCount !== 0)throw Error('Retired tote-mark DOM must be absent')
    record.geometry=await page.evaluate(inspectRebuiltGeometry)
    record.nativeText=await page.evaluate(()=>[...document.querySelectorAll('.rebuilt-category-copy strong,.rebuilt-category-copy small,.rebuilt-hero h1,.rebuilt-brand>p')].map(e=>{const range=document.createRange();range.selectNodeContents(e);const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);const rangeFragmentTops=[...new Set(rects.map(r=>Math.round(r.top*10)/10))];const lineTops=[];for(const top of rangeFragmentTops.sort((a,b)=>a-b))if(!lineTops.length||top-lineTops[lineTops.length-1]>2)lineTops.push(top);return{selector:e.className||e.tagName,text:e.textContent.trim(),lineCount:lineTops.length,lineTops,rangeFragmentTops,lineCountMethod:'Range fragments clustered at <=2 CSSpx top difference to avoid nested span duplicates',fontSize:getComputedStyle(e).fontSize}}))
    record.composition=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};const selectors=['.rebuilt-brand','.rebuilt-wordmark','.rebuilt-hero h1','.rebuilt-categories','.rebuilt-category','.rebuilt-counter','.rebuilt-display','.rebuilt-counter-photo','.rebuilt-mobile-case-art','.rebuilt-progress'];const boxes=Object.fromEntries(selectors.map(s=>[s,[...document.querySelectorAll(s)].map(rect)]));const food=[...document.querySelectorAll('.rebuilt-counter-photo,.rebuilt-mobile-case-art')].map(rect);const display=[...document.querySelectorAll('.rebuilt-display')].map(rect);return{viewport:{width:innerWidth,height:innerHeight},boxes,foodCompleteWithinViewport:food.every(r=>r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight),casesCompleteWithinViewport:display.every(r=>r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight),scope:'Factual geometry, no acceptance threshold changed; ordinary vertical scroll retained'}})
    for(const fullPage of [false,true]){
     const filename=size.width+'-entry'+(fullPage?'-full':'')+'.png', file=out+'/'+filename
     await page.screenshot({path:file,fullPage,animations:'disabled'})
     record.captures.push({file,sha256:hash(fs.readFileSync(file)),sizeBytes:fs.statSync(file).size})
    }
    record.captionAudit=await page.evaluate(expected=>{
     const failures=[], rect=r=>({x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
     const nodes=[...document.querySelectorAll('.rebuilt-product-placard figcaption')];
     const native=nodes.map(e=>{const range=document.createRange();range.selectNodeContents(e);const glyphs=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(rect);return{text:e.textContent.trim(),font:parseFloat(getComputedStyle(e).fontSize),htmlTextNode:[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()),glyphs,box:rect(e.getBoundingClientRect()),caseBox:rect(e.closest('.rebuilt-display').getBoundingClientRect())}});
     const minimum=innerWidth<=640?16:innerWidth<=1050?14:12;
     const bagels=[...document.querySelectorAll('.rebuilt-bagel-tray figcaption')].map(e=>e.textContent.trim()).sort(),schmears=[...document.querySelectorAll('.rebuilt-schmear-tray figcaption')].map(e=>e.textContent.trim()).sort();
     if(JSON.stringify(bagels)!==JSON.stringify(expected.bagels)||JSON.stringify(schmears)!==JSON.stringify(expected.schmears))failures.push({kind:'catalog-caption-count-or-text',bagels,schmears,expected});
     for(const n of native){if(!n.htmlTextNode||n.font<minimum-.01)failures.push({kind:'native-caption-font',minimum,node:n});for(const g of n.glyphs)if(g.x<n.caseBox.x-.5||g.right>n.caseBox.right+.5||g.y<n.caseBox.y-.5||g.bottom>n.caseBox.bottom+.5)failures.push({kind:'caption-glyph-outside-case',node:n,glyph:g});}
     for(let i=0;i<native.length;i++)for(let j=i+1;j<native.length;j++)for(const a of native[i].glyphs)for(const b of native[j].glyphs){const w=Math.min(a.right,b.right)-Math.max(a.x,b.x),h=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);if(w>.5&&h>.5)failures.push({kind:'caption-glyph-overlap',first:native[i].text,second:native[j].text,width:w,height:h});}
     return{minimumFontCSSPx:minimum,captionCount:native.length,bagelCount:bagels.length,schmearCount:schmears.length,native,failures};
    },(()=>{const m=JSON.parse(fs.readFileSync(repo+'/src/domain/data/verified-menu-2026-10-21.json','utf8'));return{bagels:m.bagels.map(x=>x.name).sort(),schmears:m.schmears.map(x=>x.name).sort()}})());
    if(record.captionAudit.failures.length)report.failures.push({width:size.width,captionFailures:record.captionAudit.failures});
    console.log(JSON.stringify({event:'captured',width:size.width,path:record.captures[0].file,geometryFailures:record.geometry.failures.length,images:record.images.length}))
   } catch(error){record.error=String(error);report.failures.push({width:size.width,error:String(error)})}
   finally {await safety.close();record.traffic=safety.traffic;record.capabilityAudit=safety.auditCapabilities();save()}
  }
 } finally {await browser.close();report.finishedAt=new Date().toISOString();save()}
 console.log(JSON.stringify({event:'terminal',cases:report.cases.length,errors:report.failures.length,report:out+'/capture-results.json'}))
 if(report.failures.length)process.exitCode=1
})().catch(error=>{report.failures.push({error:String(error)});save();console.error(error);process.exitCode=1})
