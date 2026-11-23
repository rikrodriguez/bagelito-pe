/**
 * Read-only QA for a snapshot of GHL workflow definitions + email templates.
 * Never sends, publishes, or authorizes activation. Uses no network or SDK.
 * Usage: node scripts/qa-ghl-email-link-integrity.mjs snapshot.json
 * Input: {workflows: [get-workflow-definition responses],
 *         templates: [get-email-template responses]}
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const text = value => typeof value === 'string' ? value : '';
const unwrap = item => item?.data ?? item;
const unresolvedPattern = /\[\[[A-Z][A-Z0-9_ -]{2,}\]\]/g;

export function auditEmailLinkIntegrity(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.workflows) || !Array.isArray(snapshot.templates)) {
    throw new TypeError('Expected {workflows: [], templates: []}; export no customer data.');
  }
  const templates = new Map();
  for (const raw of snapshot.templates) {
    const template = unwrap(raw);
    if (typeof template?.id === 'string' && template.id.trim()) templates.set(template.id, template);
  }
  const checks = [];
  for (const raw of snapshot.workflows) {
    const item = unwrap(raw);
    const definition = item?.definition ?? item;
    const name = text(definition?.name) || 'Unnamed workflow';
    const status = text(item?.status ?? definition?.status) || 'unknown';
    for (const action of Array.isArray(definition?.actions) ? definition.actions : []) {
      if (!['email', 'send_email', 'send-email'].includes(action?.type)) continue;
      const id = text(action?.attributes?.template_id ?? action?.attributes?.templateId);
      const currentSubject = text(action?.attributes?.subject);
      const template = templates.get(id);
      const findings = [];
      if (!id) findings.push('NO_TEMPLATE_ID');
      else if (!template) findings.push('TEMPLATE_NOT_IN_SNAPSHOT');
      if (!currentSubject.trim()) findings.push('EMPTY_WORKFLOW_SUBJECT');
      if (template) {
        if (!text(template.subject).trim()) findings.push('EMPTY_TEMPLATE_SUBJECT');
        else if (currentSubject !== template.subject) findings.push('SUBJECT_DRIFT');
        // Missing body means the template may have been fetched without includeContent=true.
        if (template.editorContent === undefined || template.editorContent === null) {
          findings.push('TEMPLATE_BODY_NOT_EXPORTED');
        } else {
          const body = typeof template.editorContent === 'string'
            ? template.editorContent : JSON.stringify(template.editorContent);
          if (!body.trim()) findings.push('EMPTY_TEMPLATE_BODY');
          if (unresolvedPattern.test(`${template.subject}\n${body}`)) findings.push('LITERAL_MERGE_PLACEHOLDER');
          unresolvedPattern.lastIndex = 0;
        }
      }
      checks.push({workflow:name, workflowStatus:status, action:text(action.name) || text(action.id),
        templateId:id || null, subjectMatches: Boolean(template && currentSubject === template.subject),
        findings});
    }
  }
  return {scope:'offline read-only linkage QA; not delivery or activation certification',
    emailActionsChecked:checks.length, failedChecks:checks.filter(x=>x.findings.length).length,
    checks, safeToActivate:false};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/qa-ghl-email-link-integrity.mjs snapshot.json');
    process.exitCode = 2;
  } else {
    const result = auditEmailLinkIntegrity(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (result.failedChecks) process.exitCode = 1;
  }
}
