// Requires the native operator journey to run on a real freshly restored fixture.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=spawnSync(process.execPath,['tests/operator-flow-http.mjs','--backup-restore'],{
 cwd:root,env:{PATH:process.env.PATH,NEXT_TELEMETRY_DISABLED:'1'},encoding:'utf8',timeout:120000,maxBuffer:1024*1024,
});
assert.equal(result.status,0,result.stderr);
const scenario=result.stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(row=>row.fixture==='operator-runbook');
assert.equal(scenario?.backupRestored,true,'Native integration must attest that a logical backup was restored');
assert.equal(scenario.database,'bagelito_restored_test');
assert.equal(scenario.snapshotPreserved,true);
assert.equal(scenario.attributionAfterRestore,true);
assert.equal(scenario.externalFetchAttempts,0);
process.stdout.write(result.stdout);
console.log('PASS: logical fixture backup/restore preserves data/catalog/ACLs and the candidate operator code runs on the restored database.');
