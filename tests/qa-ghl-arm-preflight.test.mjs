import test from 'node:test';
import assert from 'node:assert/strict';
import { auditWorkflow, auditTemplate, auditSnapshot } from '../scripts/qa-ghl-arm-preflight.mjs';

test('abandoned-cart flow: three emails with wait labels is NOT an executable gate', () => {
  const result = auditWorkflow({status:'draft',definition:{name:'CART Recovery ES',triggers:[],actions:[
    {type:'wait',name:'Wait 3h | consent=true'},{type:'email',name:'Gate purchase=0 and consent=true'},
    {type:'wait',name:'Wait 21h'},{type:'email',name:'Second email'},
    {type:'wait',name:'Wait 24h'},{type:'email',name:'Third email'}]}});
  assert.equal(result.emailCount,3);
  assert.equal(result.conditionalCount,0);
  assert.equal(result.safeToActivate,false);
  assert.ok(result.findings.some(x=>x.startsWith('NO_EXECUTABLE_GATE')));
});

test('published Dawn conversation AI: flags proceedIfNotMet fallthrough', () => {
  const result = auditWorkflow({status:'published',definition:{name:'Dawn',triggers:[{type:'conv_ai_trigger'}],actions:[
    {type:'conversationai_objective', attributes:{proceedIfNotMet:true}}]}});
  assert.ok(result.findings.some(x=>x.startsWith('AI_OBJECTIVE_FALLTHROUGH')));
  assert.ok(result.findings.some(x=>x.startsWith('PUBLISHED_WITH_TRIGGER')));
});

test('confirmation template cannot send literal order fields', () => {
  const result = auditTemplate({data:{name:'TX ES',subject:'Pedido',editorContent:'<p>[[ORDER_ID]] / [[ORDER_TOTAL]]</p>'}});
  assert.deepEqual(result.unresolvedPlaceholders,['[[ORDER_ID]]','[[ORDER_TOTAL]]']);
  assert.equal(result.safeToSend,false);
});

test('conditional branches still require semantics and an E2E test', () => {
  const result = auditWorkflow({status:'draft',definition:{triggers:[{type:'verified_event'}],actions:[
    {type:'if_else',name:'Consent'},{type:'email'}]}});
  assert.ok(result.findings.some(x=>x.startsWith('UNVERIFIED_GATES')));
  assert.equal(result.safeToActivate,false);
});

test('malformed export is rejected rather than silently passing', () => {
  assert.throws(()=>auditSnapshot({}),/Expected/);
});

test('static preflight never grants approval for clean-looking inputs', () => {
  const result=auditSnapshot({workflows:[],templates:[]});
  assert.equal(result.scope,'static read-only; NOT production certification');
});

test('published Dawn: detects the actual unmet-order to private-delivery edge', () => {
  const result = auditWorkflow({status:'published',definition:{
    name:'Dawn STAGING',triggers:[{type:'conv_ai_trigger'}],
    actions:[
      {id:'configure',type:'conversationai_objective',name:'04 Configurar pedido',attributes:{proceedIfNotMet:true}},
      {id:'delivery',type:'conversationai_objective',name:'05 Datos privados de entrega',attributes:{proceedIfNotMet:true}},
      {id:'review',type:'goto',name:'07 Revision humana'}
    ],edges:[{from:'configure',to:'delivery'},{from:'delivery',to:'review'}]
  }});
  const paths=result.findings.filter(f=>f.startsWith('OBJECTIVE_UNMET_HAS_DOWNSTREAM'));
  assert.equal(paths.length,2);
  assert.match(paths[0],/Configurar pedido.*Datos privados de entrega/);
  assert.match(paths[1],/Datos privados de entrega.*Revision humana/);
  assert.equal(result.safeToActivate,false);
});

test('draft workflow with unmet objective outgoing edge is held for review too', () => {
  const result=auditWorkflow({status:'draft',definition:{actions:[
    {id:'obj',type:'conversationai_objective',name:'Objective',attributes:{proceedIfNotMet:true}},
    {id:'next',type:'goto',name:'Next'}
  ],edges:[{from:'obj',to:'next'}]}});
  assert.ok(result.findings.some(x=>x.startsWith('OBJECTIVE_UNMET_HAS_DOWNSTREAM')));
});

test('unmet objective without an outgoing edge does not invent a path', () => {
  const result=auditWorkflow({status:'draft',definition:{actions:[
    {id:'obj',type:'conversationai_objective',name:'Objective',attributes:{proceedIfNotMet:true}}
  ],edges:[]}});
  assert.equal(result.findings.filter(x=>x.startsWith('OBJECTIVE_UNMET_HAS_DOWNSTREAM')).length,0);
});
