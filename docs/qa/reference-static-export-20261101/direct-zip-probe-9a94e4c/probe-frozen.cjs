// Verify an extracted static archive via actual local HTTP GETs only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const root=process.env.QA_STATIC_ZIP_ROOT||'/tmp/bagelito-static-direct-zip-9a94e4c',base=new URL(process.env.BASE_URL||'http://127.0.0.1:3217/'),out=process.env.QA_OUTPUT||__dirname
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)&&base.pathname==='/'&&!base.search&&!base.username&&!base.password)
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(root,'static-export-manifest.json')))
const report={startedAt:new Date().toISOString(),applicationSHA:manifest.applicationSHA,exporterSHA:manifest.exporterSHA,archiveSHA256:'262b55db494a615299ad9123ac2b82a69b79950f318281d8b5652abe45de5ed6',root,base:base.href,node:process.version,verifiedHashes:0,requests:[],status:'prepared'}
async function main(){
 assert.equal(manifest.applicationSHA,'9a94e4cfc5a043726f643d3a9c546f096007bd94')
 for(const e of manifest.files){const b=fs.readFileSync(path.join(root,e.path));assert.equal(b.length,e.bytes,e.path);assert.equal(hash(b),e.sha256,e.path);report.verifiedHashes++}
 const assets=manifest.files.filter(e=>/\.(js|css)$/.test(e.path)).map(e=>'/'+e.path)
 for(const route of ['/','/legal/','/playable/','/images/store-reference-approved.webp',...assets,'/api/batch']){
  const r=await fetch(new URL(route,base),{redirect:'error'}),b=Buffer.from(await r.arrayBuffer()),expected=route.startsWith('/api/')?404:200
  const e={route,status:r.status,contentType:r.headers.get('content-type'),bytes:b.length,sha256:hash(b),setCookie:r.headers.get('set-cookie')};report.requests.push(e)
  assert.equal(r.status,expected,route);assert.equal(e.setCookie,null,route)
  if(expected===200){const file=route.endsWith('/')?route.slice(1)+'index.html':route.slice(1);assert.equal(e.sha256,hash(fs.readFileSync(path.join(root,file))),route)}
  if(route.endsWith('.js'))assert.match(e.contentType,/javascript/)
  if(route.endsWith('.css'))assert.match(e.contentType,/text\/css/)
  if(route.endsWith('.webp'))assert.equal(e.sha256,'0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9')
 }
 report.status='passed'
}
main().catch(e=>{report.status='failed';report.error=String(e.stack||e);process.exitCode=1}).finally(()=>{report.finishedAt=new Date().toISOString();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))})
