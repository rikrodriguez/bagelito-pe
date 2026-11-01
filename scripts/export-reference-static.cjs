#!/usr/bin/env node
// Freeze the existing review-only SSR pages; no alternate UI or commerce data.
const fs=require('node:fs/promises')
const path=require('node:path')
const crypto=require('node:crypto')
const {execFileSync}=require('node:child_process')
const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
const args={}
for(let i=2;i<process.argv.length;i+=2)args[process.argv[i]]=process.argv[i+1]
async function main(){
 const build=path.resolve(args['--build']||''),out=path.resolve(args['--output']||'')
 const sourceSHA=args['--source-sha'],origin=new URL(args['--origin']||'http://127.0.0.1:3210/')
 if(!/^[a-f0-9]{40}$/.test(sourceSHA||''))throw new Error('Use full application source SHA')
 if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw new Error('Capture only an explicit loopback root origin')
 if(out===build||out.startsWith(build+path.sep)||build.startsWith(out+path.sep))throw new Error('Output must be isolated from the build')
 try{await fs.access(out);throw new Error('Output already exists; preserve prior evidence and use a fresh directory')}catch(e){if(e.code!=='ENOENT')throw e}
 const image=await fs.readFile(path.join(build,'public/images/store-reference-approved.webp'))
 if(hash(image)!=='0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9')throw new Error('Approved image hash mismatch')
 const exporterSHA=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
 execFileSync('git',['diff','--exit-code',sourceSHA,'--','src','vite.config.ts','package.json','vercel.json'],{stdio:'pipe'})
 await fs.mkdir(out,{recursive:true})
 await fs.cp(path.join(build,'public'),out,{recursive:true,dereference:false})
 const capture=[]
 for(const [route,file] of [['/','index.html'],['/legal','legal/index.html'],['/playable','playable/index.html']]){
  const response=await fetch(new URL(route,origin),{redirect:'error',headers:{'accept':'text/html'}})
  if(response.status!==200||!(response.headers.get('content-type')||'').includes('text/html')||response.headers.has('set-cookie'))throw new Error('Unexpected SSR response '+route)
  const raw=await response.text()
  if(!raw.includes('$_TSR.router=')||!raw.includes('/assets/index-'))throw new Error('Missing original hydration payload '+route)
  if(route!=='/legal'&&(!raw.includes('data-review-only="true"')||raw.includes('<canvas')))throw new Error('Expected exact image review-only route '+route)
  if(!raw.includes('noindex,nofollow'))throw new Error('Preview must remain noindex')
  const inline=[...raw.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/(?:^|\s)src\s*=/.test(m[1])).map(m=>"'sha256-"+crypto.createHash('sha256').update(m[2]).digest('base64')+"'")
  const csp=["default-src 'none'","script-src 'self' "+[...new Set(inline)].join(' '),"script-src-attr 'none'","style-src 'self' 'unsafe-inline'","img-src 'self' data:","font-src 'self'","connect-src 'none'","form-action 'none'","frame-src 'none'","object-src 'none'","worker-src 'none'","base-uri 'none'"].join('; ')
  const html=raw.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+csp+'"/><meta name="referrer" content="no-referrer"/>')
  const target=path.join(out,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,html)
  capture.push({route,file,status:response.status,sourceHTMLSHA256:hash(raw),exportedHTMLSHA256:hash(html),inlineScriptHashes:inline,csp,changes:'Only CSP and referrer meta inserted; original markup, hydration state and script references retained'})
 }
 const files=[]
 async function walk(dir){for(const name of (await fs.readdir(dir)).sort()){const p=path.join(dir,name),s=await fs.lstat(p);if(s.isSymbolicLink())throw new Error('No symlinks in static export');if(s.isDirectory())await walk(p);else{const rel=path.relative(out,p).split(path.sep).join('/');if(rel.startsWith('server/')||rel.includes('node_modules/')||rel.startsWith('api/')||rel.split('/').some(x=>x.startsWith('.env')))throw new Error('Unexpected server/secret path');const b=await fs.readFile(p);files.push({path:rel,bytes:b.length,sha256:hash(b)})}}}
 await walk(out)
 const manifest={format:'static-html-assets',applicationSHA:sourceSHA,exporterSHA,sourceOrigin:origin.origin,capturedAt:new Date().toISOString(),sourceImageSHA256:hash(image),serverFilesIncluded:false,backend:false,telemetry:false,reviewOnly:true,mount:'origin root; HTTP/HTTPS with directory index support, not file:// or a subpath',knownFrameworkRead:'one sessionStorage cache lookup per document, no writes',routes:capture,files}
 await fs.writeFile(path.join(out,'static-export-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
 console.log(JSON.stringify({out,applicationSHA:sourceSHA,exporterSHA,files:files.length,routes:capture.map(x=>x.route)}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
