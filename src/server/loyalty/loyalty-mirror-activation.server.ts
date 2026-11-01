import type { MirrorEnvelope, MirrorReceipt, MirrorTransport } from './loyalty-mirror.server'

/** Internal evidence contract only. Not GHL API fields or an identity verifier. */
export type VerificationEvidence = Readonly<{
  status: 'verified' | 'unverified' | 'revoked'; scope: 'local-fixture' | 'remote'; reference: string | null
}>
export type ActivationScope = Readonly<{tenantId: string; subjectId: string}>
export type TargetDescriptor = Readonly<{mode: 'local-fixture' | 'remote'; tenantId: string; locationId: string}>
export type TenantAuthorization = Readonly<{tenantId: string; locationId: string; evidence: VerificationEvidence}>
export type ContactBinding = Readonly<{tenantId: string; subjectId: string; locationId: string; contactId: string; evidence: VerificationEvidence}>
export type ContactObservation = Readonly<{locationId: string; contactId: string; evidence: VerificationEvidence}>
export type UpdateCapability = Readonly<{
  locationId: string; conditionalWrite: 'unknown' | 'unsupported' | 'verified'; evidence: VerificationEvidence
}>
type Awaitable<T> = T | Promise<T>
export interface ActivationTransaction {
  getTenant(tenantId: string): Awaitable<TenantAuthorization | null>
  getBinding(tenantId: string, subjectId: string): Awaitable<ContactBinding | null>
  getContact(locationId: string, contactId: string): Awaitable<ContactObservation | null>
  getCapabilities(locationId: string): Awaitable<UpdateCapability | null>
}
export interface ActivationStore {
  /** Trusted backend read. Never construct these facts from a browser or GHL callback body. */
  transaction<T>(work: (tx: ActivationTransaction) => Promise<T>): Promise<T>
}
export type ActivationReport = Readonly<{status: 'blocked' | 'local-fixture-only'; code: string}>
export type GuardedTarget =
  | (TargetDescriptor & Readonly<{mode: 'local-fixture'; transport: MirrorTransport}>)
  | (TargetDescriptor & Readonly<{mode: 'remote'}>)
export class MirrorActivationError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'MirrorActivationError' }
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value
}
function verified(evidence: VerificationEvidence | undefined, mode: TargetDescriptor['mode']): boolean {
  return evidence?.status === 'verified' && evidence.scope === mode && identifier(evidence.reference)
}
function blocked(code: string): ActivationReport { return {status: 'blocked', code} }
function configError(scope: ActivationScope, target: TargetDescriptor): string | null {
  if (!scope || !target || !identifier(scope.tenantId) || !identifier(scope.subjectId)
    || !identifier(target.tenantId) || !identifier(target.locationId)
    || !['local-fixture', 'remote'].includes(target.mode)) return 'invalid_configuration'
  return scope.tenantId === target.tenantId ? null : 'target_tenant_mismatch'
}
async function inspect(tx: ActivationTransaction, scope: ActivationScope, target: TargetDescriptor) {
  const tenant = await tx.getTenant(scope.tenantId)
  if (!tenant) return {report: blocked('tenant_unverified')}
  if (tenant.tenantId !== scope.tenantId) return {report: blocked('tenant_scope_mismatch')}
  if (tenant.locationId !== target.locationId) return {report: blocked('tenant_location_mismatch')}
  if (!verified(tenant.evidence, target.mode)) return {report: blocked('tenant_unverified')}
  const binding = await tx.getBinding(scope.tenantId, scope.subjectId)
  if (!binding) return {report: blocked('binding_unverified')}
  if (binding.tenantId !== scope.tenantId || binding.subjectId !== scope.subjectId
    || binding.locationId !== target.locationId || !identifier(binding.contactId)) {
    return {report: blocked('binding_scope_mismatch')}
  }
  if (!verified(binding.evidence, target.mode)) return {report: blocked('binding_unverified')}
  const contact = await tx.getContact(binding.locationId, binding.contactId)
  if (!contact) return {report: blocked('contact_unverified')}
  if (contact.locationId !== binding.locationId || contact.contactId !== binding.contactId) {
    return {report: blocked('contact_scope_mismatch')}
  }
  if (!verified(contact.evidence, target.mode)) return {report: blocked('contact_unverified')}
  const capability = await tx.getCapabilities(binding.locationId)
  if (!capability) return {report: blocked('update_capability_unknown')}
  if (capability.locationId !== binding.locationId) return {report: blocked('capability_scope_mismatch')}
  if (capability.conditionalWrite === 'unsupported') return {report: blocked('update_capability_unsupported')}
  if (capability.conditionalWrite !== 'verified') return {report: blocked('update_capability_unknown')}
  if (!verified(capability.evidence, target.mode)) return {report: blocked('capability_unverified')}
  // Even asserted remote evidence cannot install an absent adapter or enable real writes.
  if (target.mode === 'remote') return {report: blocked('real_adapter_absent')}
  return {report: {status: 'local-fixture-only', code: 'local_fixture_only'} as ActivationReport, contactId: binding.contactId}
}

/** Diagnostic readiness only; this function can NEVER return permission for remote writes. */
export async function assessMirrorActivation(store: ActivationStore, scope: ActivationScope, target: TargetDescriptor): Promise<ActivationReport> {
  const invalid = configError(scope, target)
  if (invalid) return blocked(invalid)
  // Copy caller-owned values before any asynchronous storage access.
  const source = {...scope}, destination = {...target}
  return store.transaction(async tx => (await inspect(tx, source, destination)).report)
}

/** Local fixture preflight. No remote transport/HTTP implementation exists in this union. */
export function createGuardedMirrorTransport(store: ActivationStore, scope: ActivationScope, target: GuardedTarget): MirrorTransport {
  const source = Object.freeze({tenantId: scope?.tenantId, subjectId: scope?.subjectId})
  const destination = Object.freeze({mode: target?.mode, tenantId: target?.tenantId, locationId: target?.locationId})
  const localTransport = target?.mode === 'local-fixture' ? target.transport : undefined
  return {async send(incoming: MirrorEnvelope): Promise<MirrorReceipt> {
    const invalid = configError(source, destination)
    if (invalid) throw new MirrorActivationError(invalid)
    // The envelope's recipient must not change while awaiting the trusted facts.
    const envelope = structuredClone(incoming)
    if (envelope.subjectId !== source.subjectId) throw new MirrorActivationError('envelope_subject_mismatch')
    const result = await store.transaction(async tx => inspect(tx, source, destination))
    if (result.report.status !== 'local-fixture-only') throw new MirrorActivationError(result.report.code)
    if (envelope.destinationRef !== result.contactId) throw new MirrorActivationError('envelope_contact_mismatch')
    if (!localTransport || typeof localTransport.send !== 'function') throw new MirrorActivationError('local_transport_absent')
    Object.freeze(envelope.summary.rule); Object.freeze(envelope.summary); Object.freeze(envelope)
    return localTransport.send(envelope)
  }}
}
