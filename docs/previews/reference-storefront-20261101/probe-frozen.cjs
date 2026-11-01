const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const {spawn} = require('node:child_process')
const path = require('node:path')
const artifact = '/tmp/bagelito-reference-artifact-6f765ce/bagelito-reference-review'
const out = '/workspace/bagelito-pe/docs/previews/reference-storefront-20261101'
const report = {applicationSHA:'6f765cee68f4c4d2f013a1082b497a73b5191bd7',archiveSHA256:'a8429039f9b911094b76dfb794692c6d1f07750ded8dddf16d3607ebf86c9f48',node:process.version,startedAt:new Date().toISOString(),requests:[],directEntryLog:''}
async function probe(port, route, expected) {
  const response = await fetch('http://127.0.0.1:'+port+route,{redirect:'error'})
  const data=Buffer.from(await response.arrayBuffer())
  const entry={port,route,status:response.status,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),cacheControl:response.headers.get('cache-control'),setCookie:response.headers.get('set-cookie')}
  report.requests.push(entry);assert.equal(entry.status,expected);assert.equal(entry.setCookie,null)
  if(route.startsWith('/api')) {assert.equal(JSON.parse(data).reviewOnly,true);assert.equal(entry.cacheControl,'private, no-store, max-age=0')}
  return data
}
;(async()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(artifact,'manifest.json')))
  for(const [name,item] of Object.entries(manifest.files)) {const data=fs.readFileSync(path.join(artifact,name));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256);assert.equal(data.length,item.bytes)}
  report.verifiedFiles=Object.keys(manifest.files).length
  const html=(await probe(3210,'/',200)).toString()
  assert.ok(html.includes('/images/store-reference-approved.webp'));assert.ok(!html.includes('<canvas'))
  const image=await probe(3210,'/images/store-reference-approved.webp',200)
  assert.equal(crypto.createHash('sha256').update(image).digest('hex'),'0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9')
  for(const asset of [...html.matchAll(/(?:src|href)="(\/assets\/[^"<>]+)"/g)].map(x=>x[1]))await probe(3210,asset,200)
  await probe(3210,'/api/batch',503)
  await probe(3210,'/api/payments/culqi/config',503)
  const child=spawn(process.execPath,[path.join(artifact,'server/index.mjs')],{cwd:artifact,env:{PATH:process.env.PATH,HOME:process.env.HOME,PORT:'3211',BAGELITO_REFERENCE_REVIEW_ONLY:'false',NITRO_HOST:'0.0.0.0',HOST:'0.0.0.0'},stdio:['ignore','pipe','pipe']})
  child.stdout.on('data',c=>report.directEntryLog+=c);child.stderr.on('data',c=>report.directEntryLog+=c)
  try {await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Direct entry not ready')),10000);child.stdout.on('data',()=>{if(report.directEntryLog.includes('127.0.0.1:3211')){clearTimeout(timer);resolve()}});child.on('exit',code=>reject(new Error('Direct entry exited '+code)))})
    await probe(3211,'/api/batch',503)
    assert.ok(report.directEntryLog.includes('http://127.0.0.1:3211/'));report.forcedReviewAndLoopback=true
  }finally{child.kill('SIGTERM')}
  report.status='passed'
})().catch(error=>{report.status='failed';report.error=String(error.stack||error);process.exitCode=1}).finally(()=>{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'artifact-probe.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))})
