import { getCulqiReadonlyDiagnosticScope } from "./culqi-readonly-diagnostic";
import type { CulqiReadonlyDiagnosticRequest } from "./culqi-readonly-diagnostic";
import { validateCulqiCapturedCharge } from "./culqi-capture-evidence";
import type { CulqiCaptureBinding, CulqiCaptureEvidenceResult, CulqiKnownRefund } from "./culqi-capture-evidence";

// Unwired server routine proposal. No environment, DB client or global fetch is
// accessed here. No browser IDs, provider payloads or approval knobs are inputs.
const ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const HOST = new URL(ORIGIN).host;
const API = "https://api.culqi.com";
const TARGETS = Object.freeze([
  Object.freeze({ orderCode: "BAG-000001", label: "qa_yape", chargeId: "chr_test_WIu0Hn7e9r2MqEue" }),
  Object.freeze({ orderCode: "BAG-000002", label: "qa_visa", chargeId: "chr_test_BGmSf0LA6lKdxdcz" }),
  Object.freeze({ orderCode: "BAG-000004", label: "qa_3ds", chargeId: "chr_test_SA3U26iSk7KDn0BI" }),
] as const);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_ID = /^(?:tkn|ype)_test_[A-Za-z0-9_-]{8,100}$/;
const BODY_LIMIT = 256 * 1024;
const ORDER_STATES = new Set(["payment_confirmed", "cancelled", "in_production", "ready_for_delivery", "delivered"]);

type Environment = Readonly<Record<string, string | undefined>>;
type Label = typeof TARGETS[number]["label"];
type Target = typeof TARGETS[number];
type Awaitable<T> = T | Promise<T>;

export type CulqiReconciliationSnapshot = {
  order: {
    id: string;
    checkout_session_id: string | null;
    order_code: string;
    payment_provider: string;
    payment_lane: string;
    payment_order_id: string | null;
    payment_charge_id: string | null;
    payment_charge_attempt_id: string | null;
    payment_charge_source_id: string | null;
    payment_amount_minor: number | null;
    payment_currency: string | null;
    payment_charge_state: string;
    payment_status: string;
    payment_reconciliation_required: boolean;
    payment_reconciliation_reason: string | null;
    status: string;
  };
  attempt: {
    id: string;
    order_id: string;
    provider: string;
    provider_order_id: string | null;
    provider_charge_id: string | null;
    amount_minor: number;
    currency_code: string;
    status: string;
  };
  // Optional internal evidence for this case; absence is not a global claim
  // that no refund exists or will ever occur. Never accept this from a caller.
  knownRefund?: CulqiKnownRefund | null;
};

// Closed evidence envelope for a future service-role RPC. No entire provider
// body, customer data, browser state or invented event may reach that adapter.
export type CulqiChargeGetEvidence = {
  orderId: string;
  checkoutSessionId: string;
  paymentAttemptId: string;
  chargeAttemptId: string;
  contractMarker: string;
  observedAtISO: string;
  observation: {
    chargeId: string;
    sourceId: string;
    amountMinor: 6600;
    currencyCode: "PEN";
    capture: true;
    currentAmountMinor: 6600;
    amountRefundedMinor: 0;
    dispute: false;
    captureDatePresent: boolean;
  };
};

type CaptureContract = {
  verified: boolean;
  marker: string | null;
  parse(charge: unknown, expected: CulqiCaptureBinding, knownRefund?: CulqiKnownRefund | null): CulqiCaptureEvidenceResult;
};

// BEGIN_CAPTURE_CONTRACT
// Reviewed point-in-time capture evidence. This does not assert absence of
// future adverse operations, and needs no operations-empty or date-unit claim.
const CAPTURE_CONTRACT: CaptureContract = Object.freeze({
  verified: true,
  marker: "culqi_charge_get_reviewed_net_v1",
  parse: validateCulqiCapturedCharge,
});
// END_CAPTURE_CONTRACT

// BEGIN_APPLICATION_APPROVAL
// Separate operational barrier: no environment, payload or dependency can open
// it. Enabling requires an explicitly reviewed source change and approved RPC.
const APPLICATION_APPROVED = false;
// END_APPLICATION_APPROVAL

export type CulqiChargeReconciliationStatus = "not_started" | "blocked" | "lookup_failed"
  | "identity_mismatch" | "stale_attempt" | "capture_contract_unverified"
  | "capture_not_confirmed" | "evidence_incomplete" | "approval_required"
  | "adapter_unavailable" | "transaction_failed" | "transaction_invalid" | "applied" | "duplicate" | "already_paid";

export type CulqiChargeReconciliationResult = {
  status: CulqiChargeReconciliationStatus;
  rowReadAttempted: boolean;
  rowReadFailed: boolean;
  snapshotMatchesPins: boolean;
  currentAttemptPresent: boolean;
  persistedPaymentPaid: boolean;
  chargeQueryAttempted: boolean;
  chargeQueryFailed: boolean;
  chargeFetched: boolean;
  objectMatches: boolean;
  chargeIdentityMatches: boolean;
  amountMatches: boolean;
  currencyMatches: boolean;
  orderMetadataMatches: boolean;
  sourceMatchesPersisted: boolean;
  attemptReReadAttempted: boolean;
  attemptReReadFailed: boolean;
  attemptStable: boolean;
  captureFlagTrue: boolean;
  captureDatePresent: boolean;
  captureDateContractVerified: false;
  currentAmountPresent: boolean;
  currentAmountMatches: boolean;
  amountRefundedPresent: boolean;
  amountRefundedZero: boolean;
  disputePresent: boolean;
  disputeClear: boolean;
  operationsVerified: false;
  captureContractVerified: boolean;
  captureEvidenceVerified: boolean;
  transactionAttempted: boolean;
  transactionFailed: boolean;
  transactionApplied: boolean;
  duplicate: boolean;
  alreadyPaid: boolean;
  requiresReview: boolean;
};

export type CulqiChargeReconciliationReport = {
  ok: boolean;
  completed: boolean;
  contractVerified: boolean;
  captureDefinitionVerified: true;
  automaticConfirmationContractVerified: boolean;
  applicationApproved: boolean;
  merchantAssociationVerified: false;
  stage: "authentication" | "csrf" | "origin" | "scope" | "test_keys" | "order_lookup"
    | "charge_lookup" | "attempt_recheck" | "capture_contract" | "approval" | "transaction" | "complete";
  checks: Record<string, boolean>;
  results: Record<Label, CulqiChargeReconciliationResult>;
};

export type CulqiChargeReconciliationDependencies = {
  requireAdmin(): Promise<void>;
  verifyActionCsrf(request: CulqiReadonlyDiagnosticRequest): Awaitable<boolean>;
  readConfig(): Awaitable<Environment>;
  readPersistedOrder(orderCode: string): Promise<CulqiReconciliationSnapshot | null>;
  fetch(url: string, init: RequestInit): Promise<Response>;
  applyVerifiedCharge?(evidence: CulqiChargeGetEvidence): Promise<unknown>;
  safeLog?(label: "culqi_charge_reconciliation", report: CulqiChargeReconciliationReport): void;
  now?(): number;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function requestAllowed(request: CulqiReadonlyDiagnosticRequest) {
  if (!record(request) || request.method !== "POST" || request.origin !== ORIGIN || request.host !== HOST) return false;
  if (request.forwardedHost != null && request.forwardedHost !== HOST) return false;
  if (request.fetchSite != null && request.fetchSite !== "same-origin") return false;
  if (request.referer != null) {
    try {
      const ref = new URL(request.referer);
      if (ref.origin !== ORIGIN || ref.username || ref.password) return false;
    } catch { return false; }
  }
  return true;
}

function snapshotCopy(value: CulqiReconciliationSnapshot | null): CulqiReconciliationSnapshot | null {
  if (!record(value) || !record(value.order) || !record(value.attempt)) return null;
  if (value.knownRefund != null && (!record(value.knownRefund)
    || typeof value.knownRefund.chargeId !== "string"
    || !/^chr_test_[A-Za-z0-9_-]{8,100}$/.test(value.knownRefund.chargeId)
    || !["pending", "completed", "rejected", "unknown"].includes(value.knownRefund.state))) return null;
  const { order, attempt } = value;
  return Object.freeze({
    order: Object.freeze({
      id: order.id, checkout_session_id: order.checkout_session_id, order_code: order.order_code,
      payment_provider: order.payment_provider, payment_lane: order.payment_lane,
      payment_order_id: order.payment_order_id, payment_charge_id: order.payment_charge_id,
      payment_charge_attempt_id: order.payment_charge_attempt_id, payment_charge_source_id: order.payment_charge_source_id,
      payment_amount_minor: order.payment_amount_minor, payment_currency: order.payment_currency,
      payment_charge_state: order.payment_charge_state, payment_status: order.payment_status, status: order.status,
      payment_reconciliation_required: order.payment_reconciliation_required,
      payment_reconciliation_reason: order.payment_reconciliation_reason,
    }),
    attempt: Object.freeze({
      id: attempt.id, order_id: attempt.order_id, provider: attempt.provider,
      provider_order_id: attempt.provider_order_id, provider_charge_id: attempt.provider_charge_id,
      amount_minor: attempt.amount_minor, currency_code: attempt.currency_code, status: attempt.status,
    }),
    knownRefund: value.knownRefund ? Object.freeze({ chargeId: value.knownRefund.chargeId, state: value.knownRefund.state }) : null,
  });
}

function snapshotAllowed(snapshot: CulqiReconciliationSnapshot | null, target: Target): snapshot is CulqiReconciliationSnapshot {
  if (!snapshot) return false;
  const { order, attempt } = snapshot;
  // Stable identifiers alone do not authorize a financial transition. A
  // reversal or mismatched attempt committed during GET must fail closed.
  const pendingOrderStateAllowed = ["payment_pending_review", "cancelled"].includes(order.status)
    || order.status === "needs_correction" && order.payment_reconciliation_required === true
      && order.payment_reconciliation_reason === "charge_result_uncertain";
  const financialStateAllowed = order.payment_status === "pending" && attempt.status === "pending"
    && pendingOrderStateAllowed
    || order.payment_status === "paid" && attempt.status === "paid" && ORDER_STATES.has(order.status);
  return typeof order.id === "string" && UUID.test(order.id)
    && typeof order.checkout_session_id === "string" && UUID.test(order.checkout_session_id)
    && typeof order.payment_charge_attempt_id === "string" && UUID.test(order.payment_charge_attempt_id)
    && order.order_code === target.orderCode && order.payment_provider === "culqi"
    && order.payment_lane === "token" && order.payment_order_id === null
    && order.payment_charge_id === target.chargeId
    && typeof order.payment_charge_source_id === "string" && SOURCE_ID.test(order.payment_charge_source_id)
    && order.payment_amount_minor === 6600 && order.payment_currency === "PEN"
    && typeof order.payment_reconciliation_required === "boolean"
    && (order.payment_reconciliation_reason === null || typeof order.payment_reconciliation_reason === "string")
    && ["submitted", "uncertain"].includes(order.payment_charge_state)
    && typeof attempt.id === "string" && UUID.test(attempt.id)
    && attempt.order_id === order.id && attempt.provider === "culqi" && attempt.provider_order_id === null
    && attempt.provider_charge_id === target.chargeId && attempt.amount_minor === 6600 && attempt.currency_code === "PEN"
    && financialStateAllowed;
}

function attemptStable(before: CulqiReconciliationSnapshot, after: CulqiReconciliationSnapshot) {
  const beforeRefund = before.knownRefund?.chargeId === before.order.payment_charge_id ? before.knownRefund : null;
  const afterRefund = after.knownRefund?.chargeId === after.order.payment_charge_id ? after.knownRefund : null;
  return before.order.id === after.order.id
    && before.order.checkout_session_id === after.order.checkout_session_id
    && before.order.payment_charge_attempt_id === after.order.payment_charge_attempt_id
    && before.order.payment_charge_source_id === after.order.payment_charge_source_id
    && before.order.payment_charge_id === after.order.payment_charge_id
    && before.attempt.id === after.attempt.id && before.attempt.provider_charge_id === after.attempt.provider_charge_id
    && before.order.payment_reconciliation_required === after.order.payment_reconciliation_required
    && before.order.payment_reconciliation_reason === after.order.payment_reconciliation_reason
    && beforeRefund?.chargeId === afterRefund?.chargeId && beforeRefund?.state === afterRefund?.state;
}

function paymentMatches(charge: Record<string, unknown>, snapshot: CulqiReconciliationSnapshot, target: Target) {
  const metadata = record(charge.metadata) ? charge.metadata : null;
  const source = record(charge.source) ? charge.source : null;
  return {
    objectMatches: charge.object === "charge",
    chargeIdentityMatches: charge.id === target.chargeId,
    amountMatches: Number.isSafeInteger(charge.amount) && charge.amount === snapshot.order.payment_amount_minor,
    currencyMatches: (charge.currency_code ?? charge.currency) === "PEN"
      && (charge.currency_code === undefined || charge.currency_code === "PEN")
      && (charge.currency === undefined || charge.currency === "PEN"),
    orderMetadataMatches: metadata?.bagelito_order_code === target.orderCode,
    sourceMatchesPersisted: source?.id === snapshot.order.payment_charge_source_id,
  };
}

async function readJson(response: Response, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (!response?.ok || !response.body?.getReader) throw new Error("read_failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const abort = () => reject(new Error("read_failed"));
        if (signal.aborted) { abort(); return; }
        signal.addEventListener("abort", abort, { once: true });
        reader.read().then((value) => { signal.removeEventListener("abort", abort); resolve(value); },
          () => { signal.removeEventListener("abort", abort); reject(new Error("read_failed")); });
      });
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw new Error("read_failed");
      size += chunk.value.byteLength;
      if (size > BODY_LIMIT || chunks.length >= 4096) throw new Error("read_failed");
      chunks.push(chunk.value);
    }
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!record(parsed)) throw new Error("read_failed");
    return parsed;
  } catch {
    void reader.cancel().catch(() => undefined);
    throw new Error("read_failed");
  } finally {
    try { reader.releaseLock(); } catch { /* No raw errors. */ }
  }
}

function emptyResult(): CulqiChargeReconciliationResult {
  return {
    status: "not_started", rowReadAttempted: false, rowReadFailed: false,
    snapshotMatchesPins: false, currentAttemptPresent: false, persistedPaymentPaid: false,
    chargeQueryAttempted: false, chargeQueryFailed: false, chargeFetched: false,
    objectMatches: false, chargeIdentityMatches: false, amountMatches: false,
    currencyMatches: false, orderMetadataMatches: false, sourceMatchesPersisted: false,
    attemptReReadAttempted: false, attemptReReadFailed: false, attemptStable: false,
    captureFlagTrue: false, captureDatePresent: false, captureDateContractVerified: false,
    currentAmountPresent: false, currentAmountMatches: false,
    amountRefundedPresent: false, amountRefundedZero: false,
    disputePresent: false, disputeClear: false, operationsVerified: false,
    captureContractVerified: false, captureEvidenceVerified: false,
    transactionAttempted: false, transactionFailed: false, transactionApplied: false,
    duplicate: false, alreadyPaid: false, requiresReview: true,
  };
}

export function createCulqiChargeReconciliation(dependencies: CulqiChargeReconciliationDependencies) {
  return async function run(request: CulqiReadonlyDiagnosticRequest): Promise<CulqiChargeReconciliationReport> {
    const report: CulqiChargeReconciliationReport = {
      ok: false, completed: false, contractVerified: CAPTURE_CONTRACT.verified,
      captureDefinitionVerified: true, automaticConfirmationContractVerified: CAPTURE_CONTRACT.verified,
      applicationApproved: APPLICATION_APPROVED, merchantAssociationVerified: false,
      stage: "authentication", checks: {},
      results: { qa_yape: emptyResult(), qa_visa: emptyResult(), qa_3ds: emptyResult() },
    };
    const finish = () => {
      try { dependencies.safeLog?.("culqi_charge_reconciliation", structuredClone(report)); } catch { /* No raw logging. */ }
      return report;
    };
    try {
      await dependencies.requireAdmin();
      report.stage = "csrf";
      if (await dependencies.verifyActionCsrf(request) !== true) return finish();
      report.stage = "origin";
      if (!requestAllowed(request)) return finish();
      report.stage = "scope";
      const env = await dependencies.readConfig();
      report.checks = getCulqiReadonlyDiagnosticScope(env);
      if (!Object.values(report.checks).every(Boolean)) return finish();
      report.stage = "test_keys";
      const publicKey = env.NEXT_PUBLIC_CULQI_PUBLIC_KEY;
      const secretKey = env.CULQI_SECRET_KEY;
      report.checks.publicTestKey = typeof publicKey === "string" && /^pk_test_[A-Za-z0-9]+$/.test(publicKey);
      report.checks.secretTestKey = typeof secretKey === "string" && /^sk_test_[A-Za-z0-9]+$/.test(secretKey);
      if (!report.checks.publicTestKey || !report.checks.secretTestKey || typeof secretKey !== "string") return finish();

      const now = dependencies.now ?? Date.now;
      const started = now();
      for (const target of TARGETS) {
        const result = report.results[target.label];
        report.stage = "order_lookup";
        result.rowReadAttempted = true;
        let before: CulqiReconciliationSnapshot | null;
        try { before = snapshotCopy(await dependencies.readPersistedOrder(target.orderCode)); }
        catch { result.rowReadFailed = true; result.status = "blocked"; continue; }
        result.snapshotMatchesPins = snapshotAllowed(before, target);
        if (!snapshotAllowed(before, target)) { result.status = "blocked"; continue; }
        result.currentAttemptPresent = true;
        result.persistedPaymentPaid = before.order.payment_status === "paid";

        report.stage = "charge_lookup";
        result.chargeQueryAttempted = true;
        const controller = new AbortController();
        let charge: Record<string, unknown>;
        try {
          const remaining = 30_000 - (now() - started);
          if (remaining <= 0 || !Number.isFinite(remaining)) throw new Error("read_failed");
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.min(10_000, Math.ceil(remaining)))]);
          const response = await dependencies.fetch(`${API}/v2/charges/${encodeURIComponent(before.order.payment_charge_id!)}`, {
            method: "GET", credentials: "omit", redirect: "error", cache: "no-store",
            headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" }, signal,
          });
          charge = await readJson(response, signal);
          if (signal.aborted || now() - started >= 30_000) throw new Error("read_failed");
        } catch {
          result.chargeQueryFailed = true; result.status = "lookup_failed"; continue;
        } finally { controller.abort(); }
        result.chargeFetched = true;
        const matches = paymentMatches(charge, before, target);
        Object.assign(result, matches);
        result.captureFlagTrue = charge.capture === true;
        result.captureDatePresent = charge.capture_date !== null && charge.capture_date !== undefined;
        result.currentAmountPresent = charge.current_amount !== null && charge.current_amount !== undefined;
        result.currentAmountMatches = Number.isSafeInteger(charge.current_amount) && charge.current_amount === 6600;
        result.amountRefundedPresent = charge.amount_refunded !== null && charge.amount_refunded !== undefined;
        result.amountRefundedZero = Number.isSafeInteger(charge.amount_refunded) && charge.amount_refunded === 0;
        result.disputePresent = charge.dispute !== null && charge.dispute !== undefined;
        result.disputeClear = charge.dispute === false;
        if (!Object.values(matches).every(Boolean)) { result.status = "identity_mismatch"; continue; }

        report.stage = "attempt_recheck";
        result.attemptReReadAttempted = true;
        let after: CulqiReconciliationSnapshot | null;
        try { after = snapshotCopy(await dependencies.readPersistedOrder(target.orderCode)); }
        catch { result.attemptReReadFailed = true; result.status = "stale_attempt"; continue; }
        result.attemptStable = snapshotAllowed(after, target) && attemptStable(before, after);
        if (!snapshotAllowed(after, target) || !attemptStable(before, after)) { result.status = "stale_attempt"; continue; }

        report.stage = "capture_contract";
        result.captureContractVerified = CAPTURE_CONTRACT.verified;
        if (charge.capture !== true) { result.status = "capture_not_confirmed"; continue; }
        if (!result.currentAmountMatches || !result.amountRefundedZero || !result.disputeClear) {
          result.status = "evidence_incomplete"; continue;
        }
        if (!CAPTURE_CONTRACT.verified || !CAPTURE_CONTRACT.marker) {
          result.status = "capture_contract_unverified"; continue;
        }
        const evaluation = CAPTURE_CONTRACT.parse(charge, {
          chargeId: target.chargeId, sourceId: after.order.payment_charge_source_id!,
          orderCode: after.order.order_code, amountMinor: after.order.payment_amount_minor!, currencyCode: "PEN",
        }, after.knownRefund);
        if (!evaluation.verified || evaluation.evidence.currentAmountMinor !== 6600
          || evaluation.evidence.amountMinor !== 6600 || evaluation.evidence.currencyCode !== "PEN"
          || evaluation.evidence.capture !== true || evaluation.evidence.amountRefundedMinor !== 0
          || evaluation.evidence.dispute !== false) {
          result.status = "evidence_incomplete"; continue;
        }
        result.captureEvidenceVerified = true;
        report.stage = "approval";
        if (!APPLICATION_APPROVED) { result.status = "approval_required"; continue; }
        if (!dependencies.applyVerifiedCharge) { result.status = "adapter_unavailable"; continue; }

        // Operational application approval remains closed in this source.
        // The future SQL adapter must revalidate identities under its locks;
        // this fresh read is useful evidence, never a substitute for that lock.
        const observedAt = now();
        if (!Number.isSafeInteger(observedAt) || now() - started >= 30_000) {
          result.status = "evidence_incomplete"; continue;
        }
        const evidence: CulqiChargeGetEvidence = Object.freeze({
          orderId: after.order.id, checkoutSessionId: after.order.checkout_session_id!,
          paymentAttemptId: after.attempt.id, chargeAttemptId: after.order.payment_charge_attempt_id!,
          contractMarker: CAPTURE_CONTRACT.marker, observedAtISO: new Date(observedAt).toISOString(),
          observation: Object.freeze({
            chargeId: target.chargeId, sourceId: after.order.payment_charge_source_id!,
            amountMinor: 6600, currencyCode: "PEN", capture: true,
            currentAmountMinor: 6600, amountRefundedMinor: 0, dispute: false,
            captureDatePresent: result.captureDatePresent,
          }),
        });
        report.stage = "transaction";
        result.transactionAttempted = true;
        let transaction: unknown;
        try { transaction = await dependencies.applyVerifiedCharge(evidence); }
        catch { result.transactionFailed = true; result.status = "transaction_failed"; continue; }
        if (!record(transaction) || typeof transaction.applied !== "boolean"
          || typeof transaction.duplicate !== "boolean" || typeof transaction.alreadyPaid !== "boolean"
          || !(transaction.applied && !transaction.duplicate && !transaction.alreadyPaid
            || !transaction.applied && transaction.duplicate
            || !transaction.applied && !transaction.duplicate && transaction.alreadyPaid)
          || typeof transaction.requiresReview !== "boolean" || transaction.paymentState !== "paid"
          || typeof transaction.orderState !== "string" || !ORDER_STATES.has(transaction.orderState)
          // A prior paid snapshot is monotonic. Pending can become paid while
          // waiting for SQL, so only the already-paid case constrains causality.
          || (after.order.payment_status === "paid" && (transaction.applied || !transaction.alreadyPaid))
          || (transaction.orderState === "cancelled" && transaction.requiresReview !== true)) {
          result.status = "transaction_invalid"; continue;
        }
        result.transactionApplied = transaction.applied;
        result.duplicate = transaction.duplicate;
        result.alreadyPaid = transaction.alreadyPaid;
        result.requiresReview = transaction.requiresReview;
        result.status = transaction.duplicate ? "duplicate" : transaction.alreadyPaid ? "already_paid" : "applied";
      }
      report.stage = "complete";
      report.ok = true;
      report.completed = true;
      return finish();
    } catch {
      // A rejected admin session has no diagnostic authority. Do not emit a
      // log or access configuration while handling that authentication error.
      return report.stage === "authentication" ? report : finish();
    }
  };
}
