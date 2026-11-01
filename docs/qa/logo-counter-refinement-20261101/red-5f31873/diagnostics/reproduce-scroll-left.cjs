'use strict'
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const {createHash} = require('node:crypto')
const {execFileSync} = require('node:child_process')
const {chromium} = require('playwright')
const repo = '/workspace/bagelito-rebuilt-storefront'
const codeSHA = '5f318730e928fd3e6d05dcdb7b34dbfc13247c59'
const helper = path.join(repo, 'scripts/qa-rebuilt-safety.cjs')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(sha(fs.readFileSync(helper)), sha(execFileSync('git', ['show', codeSHA + ':scripts/qa-rebuilt-safety.cjs'], {cwd: repo})))
const {installSafety} = require(helper)
const output = path.join(__dirname, 'scroll-left-reproduction-5f31873.json')
const report = {codeSHA, servedImmutableArtifact: '/tmp/bagelito-logo-counter-final-3255', baseURL: 'http://127.0.0.1:3255/', viewport: {width: 1536, height: 1024},
  status: 'running-diagnosis', helperSHA256: sha(fs.readFileSync(helper)), sourceFreeze: '../functional/functional-source-freeze.json',
  action: 'Fresh real page, fonts and counter decode; measure; native photo.scrollIntoViewIfNeeded(); measure. No style, layout, app-state, source or driver changes.', errors: []}
async function measure(page) {
  return page.evaluate(() => {
    const rect = element => {const r = element.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height, right: r.right}}
    const stage = document.querySelector('.rebuilt-store'), photo = document.querySelector('.rebuilt-counter-photo')
    return {window: {scrollX, scrollY}, stage: {scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop, scrollWidth: stage.scrollWidth, clientWidth: stage.clientWidth, overflowX: getComputedStyle(stage).overflowX, rect: rect(stage)},
      photo: {rect: rect(photo), clipPath: getComputedStyle(photo).clipPath}, anchors: Object.fromEntries(['.rebuilt-brand', '.rebuilt-hero', '.rebuilt-categories'].map(selector => [selector, rect(document.querySelector(selector))]))}
  })
}
async function main() {
  const browser = await chromium.launch({headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu']})
  const context = await browser.newContext({viewport: report.viewport, serviceWorkers: 'block'})
  const safety = await installSafety(context, report.baseURL, issue => report.errors.push(issue))
  try {
    const page = await context.newPage()
    await page.goto(report.baseURL, {waitUntil: 'networkidle'})
    await page.locator('.rebuilt-store').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.locator('.rebuilt-counter-photo').evaluate(image => image.decode())
    report.before = await measure(page)
    await page.locator('.rebuilt-counter-photo').scrollIntoViewIfNeeded()
    report.after = await measure(page)
    const delta = report.after.stage.scrollLeft - report.before.stage.scrollLeft
    report.reproduced = report.before.stage.scrollLeft === 0 && delta > 0 && report.before.window.scrollX === report.after.window.scrollX
      && Object.keys(report.before.anchors).every(key => Math.abs(report.after.anchors[key].x - report.before.anchors[key].x + delta) <= .5)
    report.status = report.reproduced ? 'reproduced-FAIL' : 'not-reproduced'
    report.stageScrollLeftDelta = delta
  } finally {
    await safety.close()
    report.capabilityAudit = safety.auditCapabilities()
    report.network = safety.traffic
    await browser.close()
    report.finishedAt = new Date().toISOString()
    fs.writeFileSync(output, JSON.stringify(report, null, 2))
  }
  console.log(JSON.stringify({status: report.status, codeSHA, before: report.before, after: report.after, stageScrollLeftDelta: report.stageScrollLeftDelta, errors: report.errors.length, output}))
  assert.ok(report.reproduced && !report.errors.length && !report.capabilityAudit.errors.length, 'Bounded diagnosis must reproduce the preserved failure without safety errors')
}
main().catch(error => {report.fatal = String(error.stack || error); fs.writeFileSync(output, JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1})
