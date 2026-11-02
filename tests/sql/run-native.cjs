// Isolated native PostgreSQL harness. Never accepts a connection URL or ambient PG/DB settings.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const crypto = require('node:crypto'), net = require('node:net'), {spawn, spawnSync} = require('node:child_process')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..')
const bin = path.resolve(process.argv[2] || '/tmp/ten-pg17-apt-20261101/extracted/usr/lib/postgresql/17/bin')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bagelito-native-'))
const data = path.join(home, 'data'), marker = crypto.randomUUID()
fs.writeFileSync(path.join(home, 'OWNER'), marker, {mode:0o600})
const env = {PATH:'/usr/bin:/bin', HOME:home, TMPDIR:home, LANG:'C', LC_ALL:'C'}
const sessions = new Set(); let server, port, stopped = false
const log = fs.openSync(path.join(home,'postgres.log'),'a')
function owned() {assert.equal(fs.readFileSync(path.join(home,'OWNER'),'utf8'),marker)}
function command(name,args) {
  const r = spawnSync(path.join(bin,name),args,{env,cwd:home,encoding:'utf8',timeout:30000})
  fs.appendFileSync(path.join(home,'commands.log'), `${name}: ${r.stdout || ''}${r.stderr || ''}\n`)
  if(r.error || r.status!==0) throw Error(`${name} failed: ${r.error?.message || r.stderr}`)
  return r.stdout
}
class Session {
  constructor(name) {
    this.name=name; this.buffer=''; this.errors=''; this.current=null
    this.child=spawn(path.join(bin,'psql'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','fixture_owner','-d','postgres'],{env,cwd:home,stdio:['pipe','pipe','pipe']})
    sessions.add(this)
    this.child.stdout.on('data',bytes=>{this.buffer+=bytes;this.flush()})
    this.child.stderr.on('data',bytes=>{this.errors+=bytes;fs.appendFileSync(path.join(home,'sessions.log'),`${name}: ${bytes}`)})
    this.child.on('error',e=>this.fail(e));this.child.on('exit',(code,signal)=>{this.ended=true;sessions.delete(this);this.fail(Error(`${name} psql exit ${code}/${signal}: ${this.errors}`))})
  }
  fail(e) {if(this.current){clearTimeout(this.current.timer);this.current.reject(e);this.current=null}}
  flush() {if(!this.current)return;const at=this.buffer.indexOf(this.current.token+'\n');if(at<0)return
    const c=this.current;this.current=null;clearTimeout(c.timer);const output=this.buffer.slice(0,at).trim();this.buffer=this.buffer.slice(at+c.token.length+1);c.resolve(output)}
  query(sql) {
    assert.equal(this.current,null,'one statement at a time per real connection')
    if(this.ended)return Promise.reject(Error(`Session ${this.name} already ended: ${this.errors}`))
    return new Promise((resolve,reject)=>{const token='DONE_'+crypto.randomBytes(12).toString('hex')
      this.current={token,resolve,reject,timer:setTimeout(()=>{this.fail(Error(`Session timeout: ${this.name}`));this.child.kill('SIGTERM')},12000)}
      this.child.stdin.write(sql+'\n\\echo '+token+'\n')})
  }
  async ready() {await this.query(`set application_name='${this.name}'; set statement_timeout='8s'; set lock_timeout='7s';`);return this}
  async close() {if(this.ended)return;this.child.stdin.end('\\q\n');await new Promise(resolve=>{this.child.once('exit',resolve);setTimeout(()=>{if(!this.ended)this.child.kill('SIGTERM');resolve()},1000).unref()})}
}
async function session(name) {return new Session(name).ready()}
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function cleanup() {
  if(stopped)return;stopped=true
  await Promise.all([...sessions].map(s=>s.close()))
  if(server && server.exitCode===null && server.signalCode===null) {
    owned();const pidfile=path.join(data,'postmaster.pid')
    if(fs.existsSync(pidfile)){const fields=fs.readFileSync(pidfile,'utf8').split('\n');assert.equal(Number(fields[0]),server.pid);assert.equal(fields[1],data)}
    // Only the child process created by this runner; never pg_ctl against ambient PGDATA.
    server.kill('SIGTERM')
    await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(10000)])
    if(server.exitCode===null && server.signalCode===null)throw Error('Owned PostgreSQL did not stop; retained data/logs for inspection')
  }
  owned();if(fs.existsSync(data))fs.rmSync(data,{recursive:true});fs.closeSync(log)
  console.log('# Isolated logs retained: '+home)
}
async function main() {
  console.log('# '+command('postgres',['--version']).trim())
  command('initdb',['-D',data,'-U','fixture_owner','--auth=trust','--encoding=UTF8','--no-locale'])
  port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p))})})
  server=spawn(path.join(bin,'postgres'),['-D',data,'-p',String(port),'-h','127.0.0.1','-k',home,'-c','fsync=off','-c','max_connections=12'],{env,cwd:home,stdio:['ignore',log,log]})
  let startupError;server.on('error',e=>{startupError=e})
  for(let i=0;i<100;i++) {
    if(startupError)throw startupError
    if(server.exitCode!==null)throw Error('Owned PostgreSQL startup failed: '+fs.readFileSync(path.join(home,'postgres.log'),'utf8'))
    if(fs.existsSync(path.join(data,'postmaster.pid')) && fs.readFileSync(path.join(data,'postmaster.pid'),'utf8').includes('ready'))break
    await delay(50)
  }
  owned();const fields=fs.readFileSync(path.join(data,'postmaster.pid'),'utf8').split('\n')
  assert.equal(Number(fields[0]),server.pid);assert.equal(fields[1],data);assert.equal(Number(fields[3]),port)
  const observer=await session('bagelito_native_observer')
  assert.equal(await observer.query('show data_directory;'),data)
  assert.equal(await observer.query('select inet_server_addr()::text;'),'127.0.0.1')
  await observer.query(`create role anon;create role authenticated;create role service_role;create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`)
  const dir=path.join(__dirname,'fixtures/financial-core'), manifest=JSON.parse(fs.readFileSync(path.join(dir,'SOURCE.json')))
  for(const file of manifest.files){const bytes=fs.readFileSync(path.join(dir,file.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256)
    // Core PG17 supplies gen_random_uuid; no extension package installation required.
    await observer.query(bytes.toString().replace(/^create extension if not exists pgcrypto;\r?\n/m,''))}
  for(const file of ['add-checkout-legal-evidence.sql','add-guided-product-lines.sql'])await observer.query(fs.readFileSync(path.join(root,'supabase',file),'utf8'))
  console.log('# Core fixture '+manifest.ref+'; '+manifest.files.length+' SHA256-verified SQL files')
  await require('./native-concurrency.cjs')({observer,session,delay})
}
main().catch(e=>{console.error(e.stack || e);process.exitCode=1}).finally(()=>cleanup().catch(e=>{console.error('Cleanup failed: '+e.stack);process.exitCode=1}))
