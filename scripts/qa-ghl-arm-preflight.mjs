/**
 * Read-only GHL ARM preflight for exported get-workflow-definition and
 * get-email-template responses. Zero network calls; never deploys or sends.
 * An absence of findings NEVER certifies a workflow for release.
 * Usage: node scripts/qa-ghl-arm-preflight.mjs path/to/qa-export.json
 */
import { readFileSync } from 'node:fs';

const EMAIL_ACTION_TYPES = new Set(['email', 'send_email', 'send-email']);
const EXECUTABLE_BRANCH_TYPES = new Set(['if_else', 'if-else', 'condition', 'branch']);
const UNSAFE_PLACEHOLDER = /\[\[(?:ORDER|CART|PENDING_CART|CAMPAIGN)_[A-Z0-9_ -]+\]\]/g;

export function auditWorkflow(source) {
  const envelope = source?.data?.definition ? source.data : source;
  const definition = envelope?.definition ?? envelope;
  const name = String(definition?.name ?? 'Unnamed');
  const status = String(envelope?.status ?? definition?.status ?? 'unknown').toLowerCase();
  const actions = Array.isArray(definition?.actions) ? definition.actions : [];
  const triggers = Array.isArray(definition?.triggers) ? definition.triggers : [];
  const emails = actions.filter(a => EMAIL_ACTION_TYPES.has(a.type));
  const branches = actions.filter(a => EXECUTABLE_BRANCH_TYPES.has(a.type));
  const findings = [];

  if (emails.length) {
    if (!triggers.length) findings.push('NO_TRIGGER: No authenticated order or consent event is connected.');
    if (!branches.length) findings.push('NO_EXECUTABLE_GATE: Email sequence lacks conditional nodes. Action names are not guards.');
    if (branches.length) findings.push('UNVERIFIED_GATES: Conditional nodes exist, but their consent, order and DND semantics require manual E2E QA.');
  }
  if (status === 'published' && actions.some(a => a.type === 'conversationai_objective' && a.attributes?.proceedIfNotMet === true)) {
    findings.push('AI_OBJECTIVE_FALLTHROUGH: Published conversation AI has proceedIfNotMet=true. Inspect actual transitions.');
  }
  if (status === 'published' && triggers.length) {
    findings.push('PUBLISHED_WITH_TRIGGER: A live workflow may run. Published does not prove bot is responding; inspect runtime.');
  }
  return { name, status, actionCount: actions.length, emailCount: emails.length,
    triggerCount: triggers.length, conditionalCount: branches.length,
    findings, safeToActivate: false }; // A static check can never grant release approval.
}

export function auditTemplate(source) {
  const data = source?.data?.editorContent !== undefined ? source.data : source;
  const html = typeof data?.editorContent === 'string' ? data.editorContent : '';
  const subject = String(data?.subject ?? data?.subjectLine ?? '');
  const unresolved = [...new Set(`${subject}\n${html}`.match(UNSAFE_PLACEHOLDER) ?? [])];
  return { name: String(data?.name ?? 'Unnamed'),
    unresolvedPlaceholders: unresolved,
    findings: unresolved.length ? ['UNRESOLVED_MERGE_DATA: Literal staging placeholders remain; do not send.'] : [],
    safeToSend: false }; // Template rendering and data-plane merge are not verified here.
}

export function auditSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.workflows) || !Array.isArray(snapshot.templates)) {
    throw new Error('Expected {workflows: [], templates: []}. No personal/customer data required.');
  }
  return { generatedBy: 'qa-ghl-arm-preflight', scope: 'static read-only; NOT production certification',
    workflows: snapshot.workflows.map(auditWorkflow), templates: snapshot.templates.map(auditTemplate) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write('Usage: node scripts/qa-ghl-arm-preflight.mjs exported.json\n');
    process.exitCode = 2;
  } else {
    const output = auditSnapshot(JSON.parse(readFileSync(path, 'utf8')));
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    const findings = [...output.workflows, ...output.templates].some(x => x.findings.length);
    if (findings) process.exitCode = 1; // Read-only release hold; no side effects.
  }
}
