import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEmailLinkIntegrity } from '../scripts/qa-ghl-email-link-integrity.mjs';
const data = (subject='Bagelito',body='<p>Hola</p>') => ({templates:[{id:'tpl',subject,editorContent:body}],workflows:[{data:{status:'draft',definition:{name:'Recovery ES',actions:[{type:'email',name:'Email 1',attributes:{template_id:'tpl',subject}}]}}}]});

test('matching subject and template body still never certify activation',()=>{
  const x=auditEmailLinkIntegrity(data());
  assert.equal(x.emailActionsChecked,1);
  assert.equal(x.failedChecks,0);
  assert.equal(x.checks[0].subjectMatches,true);
  assert.equal(x.safeToActivate,false);
});
test('detects workflow subject drift without rewriting anything',()=>{
  const x=data();x.workflows[0].data.definition.actions[0].attributes.subject='Outdated';
  assert.ok(auditEmailLinkIntegrity(x).checks[0].findings.includes('SUBJECT_DRIFT'));
});
test('missing referenced template is inconclusive, not falsely claimed deleted',()=>{
  const x=data();x.templates=[];
  assert.ok(auditEmailLinkIntegrity(x).checks[0].findings.includes('TEMPLATE_NOT_IN_SNAPSHOT'));
});
test('catches literal order placeholders',()=>{
  const x=data('Pedido','<p>[[ORDER_TOTAL]]</p>');
  assert.ok(auditEmailLinkIntegrity(x).checks[0].findings.includes('LITERAL_MERGE_PLACEHOLDER'));
});
test('missing template content means export is incomplete',()=>{
  const x=data();delete x.templates[0].editorContent;
  assert.ok(auditEmailLinkIntegrity(x).checks[0].findings.includes('TEMPLATE_BODY_NOT_EXPORTED'));
});
test('malformed snapshot fails closed',()=>{
  assert.throws(()=>auditEmailLinkIntegrity({}),/Expected/);
});
test('normalizes GHL data envelopes',()=>{
  const x=data();x.templates=[{data:x.templates[0]}];
  assert.equal(auditEmailLinkIntegrity(x).failedChecks,0);
});
test('no emails never implies release approval',()=>{
  const x=auditEmailLinkIntegrity({workflows:[],templates:[]});
  assert.equal(x.safeToActivate,false);
});
