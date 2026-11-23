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

test('nested email editor JSON is inspected for placeholders, never treated as rendered HTML', () => {
  const result = auditTemplate({data:{name:'TX Nested',subject:'Confirmación',editorContent:{blocks:[{text:'Tu pedido [[ORDER_ID]]'}]}}});
  assert.deepEqual(result.unresolvedPlaceholders,['[[ORDER_ID]]']);
  assert.ok(result.findings.some(x=>x.startsWith('UNVERIFIED_TEMPLATE_STRUCTURE')));
  assert.ok(result.findings.some(x=>x.startsWith('UNRESOLVED_MERGE_DATA')));
});

test('a missing email body is a finding instead of a clean release result', () => {
  const result = auditTemplate({data:{name:'Empty',subject:'Un asunto'}});
  assert.ok(result.findings.some(x=>x.startsWith('MISSING_TEMPLATE_CONTENT')));
  assert.ok(result.findings.some(x=>x.startsWith('EMPTY_EMAIL_CONTENT')));
});

test('generic double-bracket template variables are caught beyond ORDER and CART', () => {
  const result = auditTemplate({data:{name:'Abandono',subject:'Hola [[CUSTOMER_NAME]]',editorContent:'<p>Oferta</p>'}});
  assert.deepEqual(result.unresolvedPlaceholders,['[[CUSTOMER_NAME]]']);
});

test('empty subject is never considered a complete email template', () => {
  const result = auditTemplate({data:{name:'NoSubject',subject:' ',editorContent:'<p>Hola</p>'}});
  assert.ok(result.findings.some(x=>x.startsWith('EMPTY_EMAIL_CONTENT')));
});


test('unrelated conditional cannot conceal unguarded recovery email path', () => {
  const result = auditWorkflow({status:'draft',definition:{
    triggers:[{type:'checkout_abandoned'}],
    actions:[
      {id:'wait',type:'wait',name:'Wait'},
      {id:'mail',type:'email',name:'Recovery 1'},
      {id:'separate',type:'if_else',name:'Unrelated branch'}
    ],
    edges:[{from:'wait',to:'mail'}]
  }});
  assert.ok(result.findings.some(x => x.startsWith('EMAIL_UNGUARDED_PATH')));
  assert.equal(result.safeToActivate,false);
});

test('email downstream of a conditional still needs semantic/E2E verification', () => {
  const result = auditWorkflow({status:'draft',definition:{
    triggers:[{type:'checkout_abandoned'}],
    actions:[
      {id:'gate',type:'if_else',name:'Consent + purchase guard'},
      {id:'mail',type:'email',name:'Recovery'}
    ],
    edges:[{from:'gate',to:'mail'}]
  }});
  assert.equal(result.findings.filter(x => x.startsWith('EMAIL_UNGUARDED_PATH')).length,0);
  assert.ok(result.findings.some(x => x.startsWith('UNVERIFIED_GATES')));
  assert.equal(result.safeToActivate,false);
});

test('branch node without graph edges cannot certify a send path', () => {
  const result = auditWorkflow({status:'draft',definition:{
    triggers:[{type:'event'}],
    actions:[
      {id:'gate',type:'if_else',name:'Guard'},
      {id:'mail',type:'email',name:'Send'}
    ],edges:[]
  }});
  assert.ok(result.findings.some(x => x.startsWith('GATE_GRAPH_UNVERIFIED')));
  assert.equal(result.safeToActivate,false);
});
