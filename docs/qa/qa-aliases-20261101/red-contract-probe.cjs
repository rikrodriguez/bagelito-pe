'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process')
const repo=process.env.QA_REPO_ROOT,base=new URL(process.env.BASE_URL),out=process.env.QA_OUTPUT_DIR
assert.ok(repo&&out&&base.origin==='http://127.0.0.1:3237')
const code=process.env.QA_CODE_SHA,serverCode='79e484ca37ae151781cc647e5d8096ffce67cc89'
assert.equal(code,'2a824c5b29bb85a41b616d20286ed29295e80ed7')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),fileHash=file=>hash(fs.readFileSync(file))
const scripts=['qa-reference-card-text.cjs','qa-reference-secondary-text.cjs','qa-reference-direct-entry.cjs']
process.env.QA_OUTPUT=out
const old=scripts.map(file=>({file,inspect:require(path.join(repo,'scripts',file)).inspectImageAndHotspots}))
const {inspectNoZoomPresentation}=require(path.join(repo,'scripts/qa-reference-entry-geometry.cjs'))
const {installSafety}=require(path.join(repo,'scripts/qa-rebuilt-safety.cjs'))
const {chromium}=require('playwright')
const helperFiles=[...scripts,'qa-reference-entry-geometry.cjs','qa-rebuilt-safety.cjs']
const sourceHashes=Object.fromEntries(helperFiles.map(file=>[file,fileHash(path.join(repo,'scripts',file))]))
const uiFiles=['src/reference/ReferenceScene.tsx','src/reference/ReferenceStorefront.tsx','src/reference/rebuilt-storefront.css','src/reference/rebuilt-flow.css','src/playable/GuidedCommerce.tsx','src/routes/index.tsx','src/routes/playable.tsx']
const uiHashes=Object.fromEntries(uiFiles.map(file=>{
 const bytes=fs.readFileSync(path.join(repo,file)),declared=execFileSync('git',['show',code+':'+file],{cwd:repo,maxBuffer:32*1024*1024}),servedEpoch=execFileSync('git',['show',serverCode+':'+file],{cwd:repo,maxBuffer:32*1024*1024})
 assert.equal(hash(bytes),hash(declared));assert.equal(hash(bytes),hash(servedEpoch));return[file,hash(bytes)]
}))
fs.mkdirSync(out,{recursive:true})
const target=path.join(out,'red-contract-results.json');assert.ok(!fs.existsSync(target))
const report={metadata:{declaredUISHA:code,compiledSnapshotSHA:serverCode,uiHashes,legacyHelperHashes:sourceHashes,driverSHA256:fileHash(__filename),startedAt:new Date().toISOString(),scope:'Exact old browser predicates on the new real DOM, without invoking impossible image-response waits. Expected contract failures, not application failures; no npm legacy launcher is claimed here.'},cases:[],failures:[],status:'running'}
const persist=()=>fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n')
;(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu']})
 report.metadata.browserVersion=browser.version();persist()
 try{
  for(const viewport of [{width:320,height:700},{width:390,height:844},{width:1280,height:800}]){
   const record={viewport,expectedLegacyFailures:[],pass:false};report.cases.push(record);persist()
   const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:viewport.width<600,hasTouch:viewport.width<600,serviceWorkers:'block'})
   const safety=await installSafety(context,base,error=>report.failures.push({viewport,safety:error}))
   try{
    const page=await context.newPage();page.setDefaultTimeout(10000)
    await page.goto(base.href,{waitUntil:'networkidle'});await page.locator('.rebuilt-store[data-rebuilt-scene="live-components"]').waitFor()
    await page.evaluate(()=>document.fonts.ready)
    assert.equal(await page.locator('.guided-commerce[data-review-only="true"][data-reference-mode="true"]').count(),1)
    assert.equal(await page.locator('canvas').count(),0)
    record.capture=viewport.width+'-actual-rebuilt.png';await page.screenshot({path:path.join(out,record.capture),fullPage:true});record.captureSHA256=fileHash(path.join(out,record.capture))
    for(const legacy of old){
     let observed
     try{await page.evaluate(legacy.inspect)}catch(error){observed={script:legacy.file,message:error.message,stack:error.stack}}
     assert.ok(observed,'Old exact-image predicate must fail on rebuilt mode: '+legacy.file)
     assert.match(observed.message,/The approved image must be a visible real image element/)
     record.expectedLegacyFailures.push(observed)
    }
    record.oldNoZoom=await page.evaluate(inspectNoZoomPresentation)
    assert.equal(record.oldNoZoom.pass,false);assert.ok(record.oldNoZoom.failures.some(f=>['native-card-photo','hero-and-vitrina-crops-required','desktop-full-image'].includes(f.type)))
    assert.equal(safety.traffic.reads.some(entry=>entry.url.includes('store-reference-approved')),false)
    record.pass=true
   }catch(error){record.error=String(error.stack||error);report.failures.push({viewport,error:record.error})}
   finally{await safety.close();record.network=safety.traffic;record.capabilityAudit=safety.auditCapabilities();persist()}
   console.log(JSON.stringify({width:viewport.width,probePass:record.pass,legacyPredicateErrors:record.expectedLegacyFailures.length,noZoomFailures:record.oldNoZoom?.failures.map(f=>f.type),blocked:record.network.blocked.length}))
  }
 }finally{
  await browser.close()
  for(const [file,expected]of Object.entries(sourceHashes))if(fileHash(path.join(repo,'scripts',file))!==expected)report.failures.push({helperChanged:file})
  for(const [file,expected]of Object.entries(uiHashes))if(fileHash(path.join(repo,file))!==expected)report.failures.push({uiChanged:file})
  report.metadata.finishedAt=new Date().toISOString();report.status=report.failures.length?'failed':'red-reproduced';persist()
 }
 console.log(JSON.stringify({status:report.status,cases:report.cases.length,unexpectedFailures:report.failures.length,output:target}));if(report.failures.length)process.exitCode=1
})().catch(error=>{report.status='failed';report.failures.push({fatal:String(error.stack||error)});persist();console.error(error);process.exitCode=1})
