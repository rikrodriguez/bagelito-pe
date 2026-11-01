'use strict'
const fs = require('node:fs'), path = require('node:path'), {createHash} = require('node:crypto'), {execFileSync} = require('node:child_process')
const {chromium} = require('playwright')
const repo = '/workspace/bagelito-rebuilt-storefront'
const {installSafety} = require(repo + '/scripts/qa-rebuilt-safety.cjs')
const {inspectRebuiltGeometry} = require(repo + '/scripts/qa-rebuilt-geometry.cjs')
const out = '/workspace/bagelito-boutique-evidence-20261101/wip-c9c51ec'
const sha = 'c9c51ec821a157b0e8c5a112e763f8850992c633', hash = value => createHash('sha256').update(value).digest('hex')
fs.mkdirSync(out,{recursive:true})
const sourceFiles = ['src/reference/ReferenceScene.tsx','src/reference/rebuilt-storefront.css','public/images/rebuilt-boutique-room.png','public/images/rebuilt-bagel-trays.png','src/playable/GuidedCommerce.tsx','src/reference/ReferenceStorefront.tsx','scripts/qa-rebuilt-safety.cjs','scripts/qa-rebuilt-geometry.cjs']
const report = {status:'WIP-not-final', codeSHA:sha, observedHEAD:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(), startedAt:new Date().toISOString(), sourceHashes:Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(repo+'/'+file))])), scope:'Read-only first visual capture, Chromium emulation; no purchase cases or interaction coverage. No assertions removed or lowered.',cases:[], failures:[]}
const save = () => fs.writeFileSync(out+'/capture-results.json',JSON.stringify(report,null,2))
save()
;(async()=>{
 const browser = await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu']})
 try {
  for(const size of [{width:390,height:844,touch:true},{width:320,height:700,touch:true},{width:768,height:1024,touch:true},{width:1280,height:800,touch:false}]){
   const record={...size,safetyFailures:[],captures:[]};report.cases.push(record);save()
   const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:1,hasTouch:size.touch,isMobile:size.touch,serviceWorkers:'block'})
   const safety=await installSafety(context,new URL('http://127.0.0.1:3241/'),detail=>{record.safetyFailures.push(detail);save()})
   try {
    const page=await context.newPage()
    await page.goto('http://127.0.0.1:3241/',{waitUntil:'networkidle',timeout:30000})
    await page.locator('.rebuilt-store').waitFor()
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})
    record.images=await page.locator('.rebuilt-store img').evaluateAll(images=>images.map(i=>({source:i.currentSrc||i.src,complete:i.complete,width:i.naturalWidth,height:i.naturalHeight})))
    record.geometry=await page.evaluate(inspectRebuiltGeometry)
    for(const fullPage of [false,true]){
     const filename=size.width+'-entry'+(fullPage?'-full':'')+'.png', file=out+'/'+filename
     await page.screenshot({path:file,fullPage,animations:'disabled'})
     record.captures.push({file,sha256:hash(fs.readFileSync(file)),sizeBytes:fs.statSync(file).size})
    }
    console.log(JSON.stringify({event:'captured',width:size.width,path:record.captures[0].file,geometryFailures:record.geometry.failures.length,images:record.images.length}))
   } catch(error){record.error=String(error);report.failures.push({width:size.width,error:String(error)})}
   finally {await safety.close();record.traffic=safety.traffic;record.capabilityAudit=safety.auditCapabilities();save()}
  }
 } finally {await browser.close();report.finishedAt=new Date().toISOString();save()}
 console.log(JSON.stringify({event:'terminal',cases:report.cases.length,errors:report.failures.length,report:out+'/capture-results.json'}))
 if(report.failures.length)process.exitCode=1
})().catch(error=>{report.failures.push({error:String(error)});save();console.error(error);process.exitCode=1})
