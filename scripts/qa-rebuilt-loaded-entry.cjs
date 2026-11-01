'use strict'

// Supplement to cold first-pixel captures: reveal lazy products by native scroll,
// await their decoded pixels, return to the top, then preserve the full gallery.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {createHash} = require('node:crypto')
const {execFileSync} = require('node:child_process')
const {chromium} = require('playwright')
const {installSafety} = require('./qa-rebuilt-safety.cjs')
const {inspectRebuiltGeometry} = require('./qa-rebuilt-geometry.cjs')
const sha = data => createHash('sha256').update(data).digest('hex')
const repo = path.resolve(__dirname, '..')
const base = new URL(process.env.BASE_URL)
const code = process.env.QA_CODE_SHA
const out = path.resolve(process.env.QA_OUTPUT_DIR)
assert.match(code || '', /^[a-f0-9]{40}$/)
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(), code)
assert.equal(base.protocol, 'http:')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
const files = ['src/reference/ReferenceScene.tsx', 'src/reference/ReferenceStorefront.tsx', 'src/reference/rebuilt-storefront.css', 'src/reference/rebuilt-flow.css', 'src/playable/GuidedCommerce.tsx']
const sourceHashes = Object.fromEntries(files.map(file => {
  const bytes = fs.readFileSync(path.join(repo, file))
  assert.equal(sha(bytes), sha(execFileSync('git', ['show', code + ':' + file], {cwd: repo, maxBuffer: 32 * 1024 * 1024})))
  return [file, sha(bytes)]
}))
const viewports = [{width:320,height:700,touch:true},{width:390,height:844,touch:true},{width:768,height:1024,touch:true},
  {width:1024,height:768,touch:true},{width:844,height:390,touch:true},{width:1280,height:800,touch:false},{width:1920,height:1080,touch:false}]
const report = {codeSHA:code, sourceHashes, driverSHA256:sha(fs.readFileSync(__filename)), startedAt:new Date().toISOString(),
  scope:'Loopback Chromium DPR1 emulation. Real scroll reveals lazy images; no loading attributes or DOM/app state changed. Selected resource body sizes are local-file bytes, not a device speed benchmark.', cases:[], failures:[]}
assert.ok(!fs.existsSync(path.join(out,'loaded-entry-results.json')),'Use a new QA_OUTPUT_DIR; preserve prior evidence')
fs.mkdirSync(out, {recursive:true})
const persist = () => fs.writeFileSync(path.join(out, 'loaded-entry-results.json'), JSON.stringify(report,null,2))
async function main() {
  const browser = await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu']})
  try {
    for (const viewport of viewports) {
      const record = {viewport,pass:true,failures:[]}; report.cases.push(record);persist()
      const context = await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,hasTouch:viewport.touch,isMobile:viewport.touch,serviceWorkers:'block'})
      const safety = await installSafety(context, base, issue => {record.failures.push({safety:issue});record.pass=false})
      try {
        const page = await context.newPage()
        await page.goto(base.href,{waitUntil:'networkidle',timeout:30000})
        await page.locator('.rebuilt-wordmark').waitFor()
        await page.evaluate(() => document.fonts.ready)
        const photos = page.locator('.rebuilt-store img')
        assert.equal(await page.locator('.rebuilt-bagel-tray img').count(), 8)
        assert.equal(await page.locator('.rebuilt-schmear-tray img').count(), 5)
        for (const photo of await photos.all()) {
          await photo.scrollIntoViewIfNeeded()
          await photo.evaluate(async image => {await image.decode(); if (!image.complete || !image.naturalWidth) throw new Error('Product did not decode: '+image.currentSrc)})
        }
        await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}))
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        record.photos = await photos.evaluateAll(images => images.map(image => {
          const rect = image.getBoundingClientRect()
          return {className:image.className,currentSrc:image.currentSrc,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,
            complete:image.complete,displayWidth:rect.width,displayHeight:rect.height,objectFit:getComputedStyle(image).objectFit}
        }))
        record.geometry = await page.evaluate(inspectRebuiltGeometry)
        assert.deepEqual(record.geometry.failures, [])
        const stem = viewport.width + '-entry-loaded'
        await page.screenshot({path:path.join(out,stem+'.png')})
        await page.screenshot({path:path.join(out,stem+'-full.png'),fullPage:true})
        record.captures = [stem+'.png',stem+'-full.png'].map(file => ({file,sha256:sha(fs.readFileSync(path.join(out,file)))}))
        record.resources = [...new Set(record.photos.map(photo=>new URL(photo.currentSrc).pathname))].map(url => {
          const file = path.join(repo,'public',decodeURIComponent(url))
          const bytes = fs.readFileSync(file)
          const hash = sha(bytes)
          assert.equal(hash,sha(execFileSync('git',['show',code+':public'+url],{cwd:repo,maxBuffer:32*1024*1024})))
          const response = safety.traffic.assets.find(asset=>new URL(asset.url).pathname===url)
          assert.equal(response?.sha256,hash,'Decoded asset must match the observed HTTP response and committed file')
          return {url,bodyBytes:bytes.length,sha256:hash,httpResponseHashMatched:true}
        })
        record.selectedConceptBodyBytes = record.resources.filter(resource=>resource.url.includes('/rebuilt-')).reduce((n,resource)=>n+resource.bodyBytes,0)
        assert.equal(await page.locator('canvas,iframe,.reference-image,[data-reference-crop],button[aria-label="Ampliar imagen"]').count(),0)
      } catch (error) {record.pass=false;record.failures.push({message:error.message,stack:error.stack})}
      finally {await safety.close();record.network=safety.traffic}
      if (!record.pass) report.failures.push({viewport:viewport.width,failures:record.failures})
      console.log(JSON.stringify({viewport:viewport.width,pass:record.pass,photos:record.photos?.length,conceptBodyBytes:record.selectedConceptBodyBytes,failures:record.failures.length}));persist()
    }
  } finally {await browser.close()}
  for (const [file, hash] of Object.entries(sourceHashes)) assert.equal(sha(fs.readFileSync(path.join(repo,file))),hash,'App changed during QA')
  report.finishedAt=new Date().toISOString();report.status=report.failures.length?'failed':'passed';persist()
  process.exitCode=report.failures.length?1:0
}
main().catch(error => {report.status='failed';report.failures.push({fatal:error.message,stack:error.stack});persist();console.error(error);process.exitCode=1})
