// Optional Node preload for running the established product SQL suites against
// the forward proposal. The fixture still creates only a fresh in-memory PGlite.
const fs = require('node:fs'), path = require('node:path')
const fixture = require('./fixture.cjs')
const createFixture = fixture.createFixture
const directory = path.join(fixture.root, 'supabase/migrations')
const files = fs.readdirSync(directory).filter(n=>n.endsWith('_culqi_pending_charge_guard.sql'))
if(files.length!==1)throw Error('Exactly one pending-charge guard migration is required')
const sql=fs.readFileSync(path.join(directory,files[0]),'utf8')
fixture.createFixture=async()=>{
  const db=await createFixture()
  try {await db.exec(sql);return db}
  catch(error) {await db.close();throw error}
}
