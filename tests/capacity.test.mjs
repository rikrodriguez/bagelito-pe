import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {consumesBatchCapacity,isBatchAcceptingOrders} from '../src/lib/batch-availability.ts';
const source=fs.readFileSync(new URL('../src/lib/admin/queries.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('queries.ts',source,ts.ScriptTarget.Latest,true);
const names=['getBatchStats','filterActiveOrders','getOrderArchiveState','isOrderArchived','isBatchAcceptingReservations'];
const pure=ast.statements.filter(n=>(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))||(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='productionStatuses'))).map(n=>n.getText(ast)).join('\n');
const js=ts.transpileModule(pure,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const scope={exports:{},consumesBatchCapacity,isBatchAcceptingOrders};vm.runInNewContext(js,scope);
const batch={id:'synthetic',status:'orders_open',orders_open_at:null,orders_close_at:null,capacity_packs:20,capacity_bagels:220};
test('archiving a reservation does not silently release its capacity',()=> {
 const order={batch_id:'synthetic',status:'payment_confirmed',pack_units:6,order_status_history:[{new_status:'archived',created_at:'2026-01-01T00:00:00Z'}]};
 const stats=scope.exports.getBatchStats(batch,[order]);
 assert.equal(stats.reservedPacks,1);assert.equal(stats.remainingPacks,19);
});
test('expired unpaid Culqi holds do not consume displayed capacity',()=> {
 const order={batch_id:'synthetic',status:'payment_pending_review',pack_units:6,payment_provider:'culqi',payment_status:'pending',payment_expires_at:'2000-01-01T00:00:00Z'};
 assert.equal(scope.exports.getBatchStats(batch,[order]).reservedPacks,0);
});
