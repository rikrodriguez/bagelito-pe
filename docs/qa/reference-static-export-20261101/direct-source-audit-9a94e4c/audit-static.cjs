// Read-only static audit. Only four named GET routes on an HTTP loopback
// origin are probed; redirects are followed manually only on that same origin.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const dir = process.env.QA_STATIC_EXPORT_PATH || '/tmp/bagelito-reference-static-direct-9a94e4c'
const out = __dirname
const base = new URL(process.env.QA_STATIC_AUDIT_ORIGIN || 'http://127.0.0.1:3216')
assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
assert.equal(base.pathname, '/'); assert.equal(base.search, ''); assert.equal(base.hash, '')
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const b64hash = bytes => crypto.createHash('sha256').update(bytes).digest('base64')
const manifestBytes = fs.readFileSync(path.join(dir, 'static-export-manifest.json'))
const manifest = JSON.parse(manifestBytes)
const report = {auditedAt: new Date().toISOString(),kind:'read-only-source-CSP-and-static-loopback-GET-audit',browserExecuted:false,buildExecuted:false,applicationSHA:manifest.applicationSHA,exporterSHA:manifest.exporterSHA,exportPath:dir,manifestSHA256:hash(manifestBytes),csp:[],http:[],failures:[]}
const save = () => fs.writeFileSync(path.join(out, 'csp-http-audit.json'), JSON.stringify(report,null,2))
for (const route of manifest.routes) {
  try {
    const bytes = fs.readFileSync(path.join(dir, route.file)), html = bytes.toString('utf8')
    assert.equal(hash(bytes), route.exportedHTMLSHA256)
    const head = html.slice(html.indexOf('<head>')+6, html.indexOf('</head>'))
    const match = head.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?\s*>/i)
    assert.ok(match, 'CSP meta must be inside head')
    assert.equal(match.index, 0, 'Policy must precede resource/script nodes')
    const csp = match[1]
    assert.equal(csp, route.csp)
    const directives = Object.fromEntries(csp.split(';').map(s=>s.trim()).filter(Boolean).map(s=>{const [k,...v]=s.split(/\s+/);return[k,v]}))
    for (const key of ['default-src','connect-src','form-action','frame-src','object-src','worker-src','base-uri','script-src-attr']) assert.deepEqual(directives[key],["'none'"],key)
    assert.ok(!directives['script-src'].includes("'unsafe-inline'"))
    assert.ok(!directives['script-src'].includes("'unsafe-eval'"))
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    const inline = scripts.filter(m=>!/(?:^|\s)src\s*=/.test(m[1])).map(m=>({bytes:Buffer.byteLength(m[2]),hash:"'sha256-"+b64hash(m[2])+"'",hasCRLF:/\r\n/.test(m[2])}))
    assert.deepEqual(inline.map(x=>x.hash), route.inlineScriptHashes)
    assert.deepEqual(directives['script-src'],["'self'",...new Set(inline.map(x=>x.hash))])
    assert.ok(inline.every(x=>!x.hasCRLF),'No parser newline normalization ambiguity')
    const externalScripts = scripts.filter(m=>/(?:^|\s)src\s*=/.test(m[1])).map(m=>m[1].match(/\bsrc="([^"]+)"/)[1])
    assert.ok(externalScripts.every(s=>s.startsWith('/assets/')&&!s.startsWith('//')))
    const inserted = '<meta http-equiv="Content-Security-Policy" content="'+csp+'"/><meta name="referrer" content="no-referrer"/>'
    assert.equal(hash(Buffer.from(html.replace(inserted,''))), route.sourceHTMLSHA256, 'Only the two documented meta nodes may differ from captured SSR')
    report.csp.push({route:route.route,file:route.file,passed:true,inlineScripts:inline,externalScripts,directives,originalSSRReconstructionMatches:true,noindex:html.includes('noindex,nofollow'),reviewOnly:route.route==='/legal'?null:html.includes('data-review-only="true"'),canvasTag:html.includes('<canvas')})
  } catch (error) {report.failures.push({route:route.route,phase:'CSP/source',error:String(error)})}
}
save()
;(async()=>{for(const pathname of ['/','/legal','/playable','/api/batch']){try{let url=new URL(pathname,base),response;const redirects=[];for(let i=0;i<3;i++){response=await fetch(url,{method:'GET',redirect:'manual'});if(response.status<300||response.status>=400)break;const location=response.headers.get('location');assert.ok(location);const next=new URL(location,url);assert.equal(next.origin,base.origin,'External redirect is forbidden');redirects.push({url:url.href,status:response.status,location:next.href});url=next}const bytes=Buffer.from(await response.arrayBuffer()),entry={requestedPath:pathname,finalURL:url.href,method:'GET',status:response.status,redirects,bytes:bytes.length,sha256:hash(bytes),contentType:response.headers.get('content-type'),setCookie:response.headers.has('set-cookie')};assert.equal(entry.setCookie,false);if(pathname==='/api/batch'){assert.equal(response.status,404);entry.staticMissingAPIRoute=true}else{assert.equal(response.status,200);const r=manifest.routes.find(x=>x.route===pathname);assert.equal(hash(bytes),r.exportedHTMLSHA256);entry.matchesExportedHTML=true}fs.writeFileSync(path.join(out,'http-'+(pathname==='/'?'index':pathname.slice(1).replaceAll('/','-'))+'.body'),bytes);report.http.push(entry)}catch(error){report.failures.push({route:pathname,phase:'HTTP GET',error:String(error)})}save()}report.finishedAt=new Date().toISOString();report.passed=report.failures.length===0;save();console.log(JSON.stringify({passed:report.passed,cspPages:report.csp.length,http:report.http.map(x=>({path:x.requestedPath,status:x.status,redirects:x.redirects.length})),failures:report.failures}));if(!report.passed)process.exitCode=1})().catch(error=>{report.failures.push({phase:'audit',error:String(error)});save();console.error(error);process.exitCode=1})
