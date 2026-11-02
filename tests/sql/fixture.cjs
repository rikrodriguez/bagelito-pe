const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto')
const ts = require('typescript')
const {PGlite} = require('@electric-sql/pglite')
const root = path.resolve(__dirname, '../..')
const fixtureDir = path.join(__dirname, 'fixtures/financial-core')
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'SOURCE.json'), 'utf8'))
function loadTs(file, cache = new Map()) {
  if (cache.has(file)) return cache.get(file)
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'))
  const module = {exports: {}}; cache.set(file, module.exports)
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  }}).outputText
  vm.runInNewContext(compiled, {module, exports: module.exports, Date, require(id) {
    if (!id.startsWith('.')) throw Error('Unexpected dependency: ' + id)
    const target = path.resolve(path.dirname(file), id)
    return loadTs(target + (target.endsWith('.json') ? '' : '.ts'), cache)
  }})
  return module.exports
}
const api = loadTs(path.join(root, 'src/server/guided-product-reservation.server.ts'))
const migration = () => fs.readFileSync(path.join(root, 'supabase/add-guided-product-lines.sql'), 'utf8')
async function createFixture() {
  // No dataDir, URL, environment variable, real credential or socket is accepted.
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`)
    for (const file of manifest.files) {
      const bytes = fs.readFileSync(path.join(fixtureDir, file.path))
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw Error('Fixture SHA mismatch: ' + file.path)
      // Same fixture-only adaptation used by PR23: PG supplies gen_random_uuid.
      await db.exec(bytes.toString().replace(/^create extension if not exists pgcrypto;\r?\n/m, ''))
    }
    await db.exec(fs.readFileSync(path.join(root, 'supabase/add-checkout-legal-evidence.sql'), 'utf8'))
    return db
  } catch (error) {await db.close(); throw error}
}
const batchId = '22222222-2222-4222-8222-222222222222'
const customer = {customerName: 'Fixture Customer', email: 'fixture@example.test', whatsapp: '000000000',
  deliveryAddress: 'Fixture address 123', district: 'Lince', termsAccepted: true, termsVersion: '2026-10-28'}
const pack = overrides => ({category: 'packs', packFormat: 'grande', packQty: 6, packMix: 'single',
  bagels: {plain: 6}, schmears: {'whipped-original': 1}, schmearSize: 120, bagelMode: 'pack', ...overrides})
const pot = overrides => ({category: 'schmears', bagels: {}, schmears: {'whipped-original': 1}, schmearSize: 120, bagelMode: 'pack', ...overrides})
const input = (order = pack(), overrides = {}) => ({order, orderCode: 'BAG-FIXTURE',
  checkoutSessionId: '11111111-1111-4111-8111-111111111111', batchId,
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), customer: {...customer}, ...overrides})
async function call(db, args) {
  const values = ['p_order_code','p_checkout_session_id','p_batch_id','p_customer','p_lines','p_delivery_fee_minor','p_terms_version','p_payment_expires_at']
    .map(key => ['p_customer','p_lines'].includes(key) ? JSON.stringify(args[key]) : args[key])
  const result = await db.query(`select public.create_guided_product_reservation($1,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb,$6::integer,$7,$8::timestamptz) result`, values)
  return result.rows[0].result
}
const rpc = db => ({async rpc(name, args) {
  if (name !== 'create_guided_product_reservation') throw Error('Unexpected RPC')
  try {return {data: await call(db, args), error: null}} catch(error) {return {data: null, error}}
}})
async function reset(db) {
  await db.exec(`reset role; truncate public.orders cascade; delete from public.batches;
    update public.guided_product_reservation_policy set enabled=true;
    insert into public.batches(id,name,status,delivery_date,capacity_packs,capacity_bagels)
    values('${batchId}','Synthetic batch','orders_open',clock_timestamp()+interval '1 day',100,1000);`)
}
module.exports = {createFixture, migration, api, input, pack, pot, call, rpc, reset, batchId, root}
