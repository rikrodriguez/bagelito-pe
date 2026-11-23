import test from 'node:test';
import assert from 'node:assert/strict';
import {auditVibeManifest, CANON} from '../scripts/qa-vibe-target-guard.mjs';

function fixture() {
  const versionId='vibe-authenticated-build-example';
  return {
    locationId:CANON.locationId,projectId:CANON.projectId,previewUrl:CANON.url,
    sourceKind:'GHL_AI_STUDIO_VIBE_ORIGINAL',testedOnOriginalPreview:true,
    build:{versionId,exportedAt:'2026-11-23T12:42:00-05:00',zipSha256:'a'.repeat(64),concurrentEditingChecked:true,authenticatedVibeIdConfirmed:true},
    scenes:CANON.scenes.map(id=>({
      id,goldenVersion:'sample-approved-reference',approvalDate:'2026-11-18',
      componentPath:'scenes/'+id+'.tsx',buildVersion:versionId,published:false,
      qa:CANON.viewports.map(v=>({viewport:v,screenshotPath:'qa/'+id+'_'+v+'.png',verifiedAgainstGolden:true}))
    }))
  };
}
test('blocks alternate numbered Vibe',()=>{
  const x=fixture();x.projectId='1795188404817812459';
  assert.ok(auditVibeManifest(x).errors.includes('WRONG_PROJECT'));
});
test('blocks ClientPortal substitution',()=>{
  const x=fixture();x.projectId='prj_9af5e826-1a4f-4271-8269-1bbfffb6edda';x.sourceKind='CLIENTPORTAL';
  assert.ok(auditVibeManifest(x).errors.includes('WRONG_SOURCE_KIND'));
});
test('fails without original ZIP version/hash',()=>{
  const x=fixture();x.build.zipSha256='';x.build.versionId='';
  assert.ok(auditVibeManifest(x).errors.includes('MISSING_BUILD_HASH'));
  assert.ok(auditVibeManifest(x).errors.includes('MISSING_BUILD_VERSION'));
});
test('requires original editor identity and concurrent editing check',()=>{
  const x=fixture();x.build.concurrentEditingChecked=false;x.build.authenticatedVibeIdConfirmed=false;
  assert.ok(auditVibeManifest(x).errors.includes('UNVERIFIED_PROJECT_ID'));
});
test('fails if mobile QA missing for S02B',()=>{
  const x=fixture();x.scenes[2].qa.pop();
  assert.ok(auditVibeManifest(x).errors.includes('MISSING_VISUAL_QA: S02B 390x844'));
});
test('rejects evidence path escape and remote component URLs',()=>{
  const x=fixture();x.scenes[0].qa[0].screenshotPath='../../wrong.png';x.scenes[1].componentPath='https://example.org/scene';
  assert.ok(auditVibeManifest(x).errors.includes('MISSING_VISUAL_QA: S01 1440x900'));
  assert.ok(auditVibeManifest(x).errors.includes('MISSING_COMPONENT_PATH: S02A'));
});
test('requires scene-specific publish permission',()=>{
  const x=fixture();x.scenes[0].published=true;
  assert.ok(auditVibeManifest(x).errors.includes('UNAUTHORIZED_PUBLICATION: S01'));
});
test('self-declared complete fixture does not authorize release',()=>{
  const r=auditVibeManifest(fixture());
  assert.equal(r.manifestComplete,true);assert.equal(r.siteVerified,false);
  assert.equal(r.safeToPublish,false);assert.equal(r.safeToActivatePayments,false);
});
test('fails missing scene or different build version',()=>{
  const x=fixture();x.scenes.pop();x.scenes[0].buildVersion='other';
  assert.ok(auditVibeManifest(x).errors.includes('MISSING_SCENE: S04'));
  assert.ok(auditVibeManifest(x).errors.includes('SCENE_BUILD_MISMATCH: S01'));
});
