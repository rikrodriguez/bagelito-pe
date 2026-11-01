/** Actual before/after helper on the same about:blank DOM. No application URL. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process')
const repo=path.resolve(process.env.QA_REPO_ROOT||path.join(__dirname,'..'))
const baselineGitSHA='e27ab1b63f5fe519670fe7f31410d85ae66602de'
const baselineFile='scripts/qa-rebuilt-geometry.cjs'
const beforePath=process.env.QA_BEFORE?path.resolve(process.env.QA_BEFORE):'git:'+baselineGitSHA+':'+baselineFile
const beforeBytes=process.env.QA_BEFORE?fs.readFileSync(beforePath):execFileSync('git',['show',baselineGitSHA+':'+baselineFile],{cwd:repo,maxBuffer:32*1024*1024})
const baseline=new Module(path.join(repo,'scripts/qa-rebuilt-geometry.before.cjs'),module)
baseline.filename=path.join(repo,'scripts/qa-rebuilt-geometry.before.cjs');baseline.paths=Module._nodeModulePaths(path.dirname(baseline.filename));baseline._compile(beforeBytes.toString('utf8'),baseline.filename)
const afterPath=path.join(__dirname,'qa-rebuilt-geometry.cjs')
const before=baseline.exports.inspectRebuiltGeometry,after=require(afterPath).inspectRebuiltGeometry
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const beforeSHA256=createHash('sha256').update(beforeBytes).digest('hex')
const outputDir=process.env.QA_OUTPUT_DIR?path.resolve(process.env.QA_OUTPUT_DIR):fs.mkdtempSync(path.join(os.tmpdir(),'bagelito-rebuilt-geometry-fixtures-'))
fs.mkdirSync(outputDir,{recursive:true})
const out=path.join(outputDir,'results.json')
assert.ok(!fs.existsSync(out),'Use a fresh QA_OUTPUT_DIR to preserve earlier fixture evidence')
const base=`<style>*{box-sizing:border-box}html,body{margin:0;padding:0;font:16px/20px Arial,sans-serif}button{font:16px/20px Arial,sans-serif;border:0;padding:0;background:#fff}.safe{position:fixed;right:20px;bottom:20px;width:100px;height:44px}.fixture{margin:20px}</style><button class="safe">Control</button>`
const cases=[
 {name:'visible-lineheight-glyph-spill',html:'<h1 class="fixture" style="font:32px/8px Arial;margin-top:100px;width:250px;overflow:visible">Ágypy título</h1>',oldKind:'text-clipped',newKind:null},
 {name:'decorative-hidden-overflow-no-pan-no-text',html:'<div class="fixture" style="position:relative;width:80px;height:20px;overflow:hidden"><div aria-hidden="true" style="position:absolute;width:89px;height:20px;background:#004aad"></div></div>',oldKind:'horizontal-overflow',newKind:null},
 {name:'real-text-clipping-remains-failure',html:'<p class="fixture" style="width:80px;height:20px;overflow:hidden;white-space:nowrap">Texto largo que realmente queda cortado</p>',newKind:'text-clipped'},
 {name:'native-horizontal-scroll-remains-failure',html:'<div class="fixture" style="width:80px;height:30px;overflow-x:auto;overflow-y:hidden"><div style="width:120px;height:20px;background:#004aad"></div></div>',newKind:'horizontal-overflow'},
 {name:'document-overflow-remains-failure',html:'<div style="width:500px;height:1px"></div>',newKind:'horizontal-document-overflow'},
 {name:'font-eleven-remains-failure',html:'<p class="fixture" style="font-size:11px;line-height:16px">Texto de once píxeles</p>',newKind:'font-below-readable-minimum'},
 {name:'target-fortythree-remains-failure',html:'<button class="fixture" style="width:43px;height:43px">A</button>',newKind:'target-below-44'},
 {name:'range-text-overlap-remains-failure',html:'<div class="pack-format-grid fixture"><button style="display:block;width:180px;height:120px;text-align:left;overflow:visible"><b style="display:block;font-size:28px;line-height:18px">Bagels<br>grandes</b><small style="display:block;font-size:14px;line-height:18px">6 o 12 bagels</small></button></div>',newKind:'comparable-text-overlap'},
]
;(async()=>{
 const report={beforePath,afterPath,beforeSHA256,baselineGitSHA:process.env.QA_BEFORE?null:baselineGitSHA,driverSHA256:hash(__filename),afterSHA256:hash(afterPath),scope:'Only deterministic about:blank fixtures; same DOM is audited before and after; no app server, app edits, external requests or images',results:[],failures:[],requests:[]}
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu']})
 report.browserVersion=browser.version()
 try{
  const context=await browser.newContext({viewport:{width:320,height:700},serviceWorkers:'block'})
  await context.route('**/*',route=>{report.requests.push(route.request().url());return route.abort('blockedbyclient')})
  const page=await context.newPage()
  for(const fixture of cases){
   await page.setContent(base+fixture.html,{waitUntil:'domcontentloaded'})
   const oldResult=await page.evaluate(before),newResult=await page.evaluate(after)
   const entry={...fixture,dom:base+fixture.html,before:oldResult,after:newResult,pass:false}
   try{
    if(fixture.oldKind)assert.ok(oldResult.failures.some(f=>f.kind===fixture.oldKind),'BEFORE must reproduce '+fixture.oldKind)
    if(fixture.newKind)assert.ok(newResult.failures.some(f=>f.kind===fixture.newKind),'AFTER must keep rejecting '+fixture.newKind)
    else assert.equal(newResult.failures.length,0,'AFTER must accept truly unmasked visible content: '+JSON.stringify(newResult.failures))
    assert.equal(newResult.thresholds.target,44);assert.equal(newResult.thresholds.bodyFont,12);assert.equal(newResult.thresholds.titleFont,16)
    entry.pass=true
   }catch(error){entry.error=String(error.stack||error);report.failures.push({name:fixture.name,message:String(error)})}
   report.results.push(entry);console.log(JSON.stringify({name:fixture.name,pass:entry.pass,before:oldResult.failures.map(f=>f.kind),after:newResult.failures.map(f=>f.kind)}))
  }
  assert.deepEqual(report.requests,[],'No network request may leave the isolated fixtures')
  await context.close()
 }finally{await browser.close();report.status=report.failures.length?'failed':'passed';report.sourceUnchanged=hash(afterPath)===report.afterSHA256;fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n')}
 console.log(JSON.stringify({status:report.status,fixtures:report.results.length,failures:report.failures,sourceUnchanged:report.sourceUnchanged,output:out}));if(report.failures.length)process.exitCode=1
})().catch(error=>{console.error(error);process.exitCode=1})
