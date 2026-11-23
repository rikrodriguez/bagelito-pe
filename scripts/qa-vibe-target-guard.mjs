/**
 * Bagelito P0 read-only target/visual-evidence preflight.
 * Validates a supplied QA manifest, NOT a live Vibe page or Golden pixels.
 * Never publishes, sends, charges or permits activation.
 * Usage: node scripts/qa-vibe-target-guard.mjs manifest.json
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const CANON = Object.freeze({
  locationId: 'AO82PQzM13CKpSZO2hER',
  projectId: '1794259044802846738',
  url: 'https://bagelito-tienda.vibepreview.app/',
  scenes: ['S01','S02A','S02B','S03','S04'],
  viewports: ['1440x900','390x844']
});
const s = x => typeof x === 'string' ? x.trim() : '';
const validPath = x => /^(?!\.)(?!.*\.\.)(?!\/)(?!.*\\)(?!.*:\/\/)[\w./-]{1,256}$/.test(s(x));

export function auditVibeManifest(raw) {
  const m = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const errors = [], warnings = [];
  if (m.locationId !== CANON.locationId) errors.push('WRONG_LOCATION');
  if (String(m.projectId ?? '') !== CANON.projectId) errors.push('WRONG_PROJECT');
  if (m.previewUrl !== CANON.url) errors.push('WRONG_PREVIEW_URL');
  if (m.sourceKind !== 'GHL_AI_STUDIO_VIBE_ORIGINAL') errors.push('WRONG_SOURCE_KIND');
  const build = m.build ?? {};
  if (!s(build.versionId)) errors.push('MISSING_BUILD_VERSION');
  if (!s(build.exportedAt) || Number.isNaN(Date.parse(build.exportedAt))) errors.push('MISSING_OR_INVALID_EXPORT_TIME');
  if (!/^[0-9a-f]{64}$/i.test(s(build.zipSha256))) errors.push('MISSING_BUILD_HASH');
  if (build.concurrentEditingChecked !== true) errors.push('UNVERIFIED_CONCURRENT_EDIT');
  if (build.authenticatedVibeIdConfirmed !== true) errors.push('UNVERIFIED_PROJECT_ID');
  const scenes = Array.isArray(m.scenes) ? m.scenes : [];
  const ids = scenes.map(a => a?.id);
  if (ids.length !== new Set(ids).size) errors.push('DUPLICATE_SCENE');
  for (const id of CANON.scenes) {
    const scene = scenes.find(a => a?.id === id);
    if (!scene) {errors.push('MISSING_SCENE: '+id);continue;}
    if (!s(scene.goldenVersion) || !s(scene.approvalDate)) errors.push('UNVERIFIED_GOLDEN: '+id);
    if (!validPath(scene.componentPath)) errors.push('MISSING_COMPONENT_PATH: '+id);
    if (!s(scene.buildVersion) || scene.buildVersion !== build.versionId) errors.push('SCENE_BUILD_MISMATCH: '+id);
    const qa = Array.isArray(scene.qa) ? scene.qa : [];
    for (const viewport of CANON.viewports) {
      const evidence = qa.find(e => e?.viewport === viewport);
      if (!evidence || !validPath(evidence.screenshotPath) || evidence.verifiedAgainstGolden !== true)
        errors.push('MISSING_VISUAL_QA: '+id+' '+viewport);
    }
    if (scene.published === true && scene.publishAuthorizedForScene !== true)
      errors.push('UNAUTHORIZED_PUBLICATION: '+id);
  }
  const extras = scenes.filter(a => !CANON.scenes.includes(a?.id)).map(a => a?.id);
  if (extras.length) warnings.push('UNKNOWN_SCENES: '+extras.join(', '));
  if (scenes.length && m.testedOnOriginalPreview !== true) warnings.push('PREVIEW_NOT_ATTESTED');
  return {
    scope: 'read-only self-reported manifest QA; NOT authentication, live visual QA, release or payment approval',
    projectId: CANON.projectId, errors, warnings, manifestComplete: errors.length === 0,
    siteVerified: false, safeToPublish: false, safeToActivatePayments: false
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {console.error('Usage: node scripts/qa-vibe-target-guard.mjs manifest.json'); process.exitCode=2;}
  else {
    try {
      const r = auditVibeManifest(JSON.parse(readFileSync(process.argv[2], 'utf8')));
      process.stdout.write(JSON.stringify(r,null,2)+'\n');
      if (r.errors.length) process.exitCode=1;
    } catch(e) {console.error(String(e));process.exitCode=2;}
  }
}
