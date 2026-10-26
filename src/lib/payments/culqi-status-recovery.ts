import { createHash } from "node:crypto";
import { getCulqiReadonlyDiagnosticScope } from "./culqi-readonly-diagnostic";
import { validateCulqiCapturedCharge } from "./culqi-capture-evidence";
import type { CulqiKnownRefund } from "./culqi-capture-evidence";
import type { CulqiReconciliationSnapshot } from "./culqi-charge-reconciliation";

// The status route owns same-origin checks and checkout-capability access.
// This server routine only queries an already persisted charge. It imports no
// configuration, DB client, charge creator, worker or global fetch capability.
const API = "https://api.culqi.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_CODE = /^BAG-[A-Z0-9_-]{1,80}$/;
const CHARGE_ID = /^chr_test_[A-Za-z0-9_-]{8,100}$/;
const SOURCE_ID = /^(?:tkn|ype)_test_[A-Za-z0-9_-]{8,100}$/;
const BODY_LIMIT = 256 * 1024;
const BUDGET_MS = 9_000;
const RETRY_SECONDS = 15;
const CONTRACT_MARKER = "culqi_charge_get_reviewed_net_v1";
const ORDER_STATES = new Set(["payment_confirmed", "cancelled", "in_production", "ready_for_delivery", "delivered"]);

type Awaitable<T> = T | Promise<T>;
type Environment = Readonly<Record<string, string | undefined>>;

export type CulqiStatusRecoveryContext = Readonly<{
  orderCode: string;
  checkoutSessionId: string;
}>;

export type CulqiStatusRecoverySnapshot = {
  order: CulqiReconciliationSnapshot["order"];
  attempt: CulqiReconciliationSnapshot["attempt"] | null;
  knownRefund?: CulqiKnownRefund | null;
};

export type CulqiStatusRecoveryResult = Readonly<{
  state: "skipped" | "deferred" | "review_required" | "confirmed" | "already_paid" | "unavailable";
  retryAfterSeconds?: number;
}>;

export type CulqiStatusRecoveryRateArgs = Readonly<{
  p_scope: "culqi_status_charge_get";
  p_identifier: string;
  p_limit: 1;
  p_window_seconds: 15;
}>;

export type CulqiStatusRecoveryConfirmationArgs = Readonly<{
  p_order_id: string;
  p_checkout_session_id: string;
  p_payment_attempt_id: string;
  p_charge_attempt_id: string;
  p_contract_marker: "culqi_charge_get_reviewed_net_v1";
  p_observed_at: string;
  p_observation: Readonly<{
    chargeId: string;
    sourceId: string;
    amountMinor: number;
    currencyCode: "PEN";
    capture: true;
    currentAmountMinor: number;
    amountRefundedMinor: 0;
    dispute: false;
    captureDatePresent: boolean;
  }>;
}>;

export type CulqiStatusRecoveryDependencies = {
  readConfig(): Awaitable<Environment>;
  readPersistedOrder(orderCode: string, checkoutSessionId: string, signal: AbortSignal): Promise<CulqiStatusRecoverySnapshot | null>;
  consumeRateLimit(args: CulqiStatusRecoveryRateArgs, signal: AbortSignal): Promise<unknown>;
  fetch(url: string, init: RequestInit): Promise<Response>;
  confirmCharge(args: CulqiStatusRecoveryConfirmationArgs, signal: AbortSignal): Promise<unknown>;
  now?(): number;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function result(state: CulqiStatusRecoveryResult["state"], retryAfterSeconds?: number): CulqiStatusRecoveryResult {
  return Object.freeze(retryAfterSeconds === undefined ? { state } : { state, retryAfterSeconds });
}

function copySnapshot(value: CulqiStatusRecoverySnapshot): CulqiStatusRecoverySnapshot | null {
  if (!record(value) || !record(value.order) || (value.attempt !== null && !record(value.attempt))) return null;
  const { order, attempt } = value;
  const normalizeUuid = (id: string | null) => typeof id === "string" ? id.toLowerCase() : id;
  if (value.knownRefund != null && (!record(value.knownRefund)
    || typeof value.knownRefund.chargeId !== "string" || !CHARGE_ID.test(value.knownRefund.chargeId)
    || !["pending", "completed", "rejected", "unknown"].includes(value.knownRefund.state))) return null;
  return Object.freeze({
    order: Object.freeze({
      id: normalizeUuid(order.id)!, checkout_session_id: normalizeUuid(order.checkout_session_id),
      order_code: order.order_code, payment_provider: order.payment_provider, payment_lane: order.payment_lane,
      payment_order_id: order.payment_order_id, payment_charge_id: order.payment_charge_id,
      payment_charge_attempt_id: normalizeUuid(order.payment_charge_attempt_id), payment_charge_source_id: order.payment_charge_source_id,
      payment_amount_minor: order.payment_amount_minor, payment_currency: order.payment_currency,
      payment_charge_state: order.payment_charge_state, payment_status: order.payment_status,
      payment_reconciliation_required: order.payment_reconciliation_required,
      payment_reconciliation_reason: order.payment_reconciliation_reason, status: order.status,
    }),
    attempt: attempt ? Object.freeze({
      id: normalizeUuid(attempt.id)!, order_id: normalizeUuid(attempt.order_id)!, provider: attempt.provider,
      provider_order_id: attempt.provider_order_id, provider_charge_id: attempt.provider_charge_id,
      amount_minor: attempt.amount_minor, currency_code: attempt.currency_code, status: attempt.status,
    }) : null,
    knownRefund: value.knownRefund ? Object.freeze({ chargeId: value.knownRefund.chargeId, state: value.knownRefund.state }) : null,
  });
}

function matchesContext(snapshot: CulqiStatusRecoverySnapshot, context: CulqiStatusRecoveryContext) {
  const { order } = snapshot;
  return typeof order.id === "string" && UUID.test(order.id)
    && order.order_code === context.orderCode && order.checkout_session_id === context.checkoutSessionId
    && order.payment_provider === "culqi" && order.payment_lane === "token" && order.payment_order_id === null
    && typeof order.payment_status === "string" && typeof order.payment_reconciliation_required === "boolean"
    && (order.payment_reconciliation_reason === null || typeof order.payment_reconciliation_reason === "string");
}

function eligible(snapshot: CulqiStatusRecoverySnapshot) {
  const { order, attempt } = snapshot;
  const orderStateAllowed = ["payment_pending_review", "cancelled"].includes(order.status)
    || order.status === "needs_correction" && order.payment_reconciliation_required === true
      && order.payment_reconciliation_reason === "charge_result_uncertain";
  return order.payment_status === "pending" && attempt?.status === "pending" && orderStateAllowed
    && typeof order.payment_charge_id === "string" && CHARGE_ID.test(order.payment_charge_id)
    && typeof order.payment_charge_source_id === "string" && SOURCE_ID.test(order.payment_charge_source_id)
    && typeof order.payment_charge_attempt_id === "string" && UUID.test(order.payment_charge_attempt_id)
    && Number.isSafeInteger(order.payment_amount_minor) && order.payment_amount_minor! > 0 && order.payment_currency === "PEN"
    && ["submitted", "uncertain"].includes(order.payment_charge_state)
    && typeof attempt.id === "string" && UUID.test(attempt.id) && attempt.order_id === order.id
    && attempt.provider === "culqi" && attempt.provider_order_id === null
    && attempt.provider_charge_id === order.payment_charge_id
    && attempt.amount_minor === order.payment_amount_minor && attempt.currency_code === "PEN";
}

function stable(before: CulqiStatusRecoverySnapshot, after: CulqiStatusRecoverySnapshot) {
  const a = before.order;
  const b = after.order;
  return a.id === b.id && a.order_code === b.order_code && a.checkout_session_id === b.checkout_session_id
    && a.payment_charge_id === b.payment_charge_id && a.payment_charge_attempt_id === b.payment_charge_attempt_id
    && a.payment_charge_source_id === b.payment_charge_source_id && a.payment_amount_minor === b.payment_amount_minor
    && a.payment_currency === b.payment_currency && before.attempt?.id === after.attempt?.id
    && a.payment_reconciliation_required === b.payment_reconciliation_required
    && a.payment_reconciliation_reason === b.payment_reconciliation_reason
    && before.knownRefund?.chargeId === after.knownRefund?.chargeId && before.knownRefund?.state === after.knownRefund?.state;
}

function rateDecision(value: unknown): { allowed: boolean; retry: number } | null {
  if (Array.isArray(value)) value = value.length === 1 ? value[0] : null;
  if (!record(value) || Object.keys(value).sort().join(",") !== "allowed,hits,retry_after_seconds"
    || typeof value.allowed !== "boolean" || !Number.isSafeInteger(value.hits) || (value.hits as number) < 1
    || !Number.isSafeInteger(value.retry_after_seconds)) return null;
  if (value.allowed === true) return value.hits === 1 && value.retry_after_seconds === 0 ? { allowed: true, retry: 0 } : null;
  return (value.retry_after_seconds as number) >= 1 && (value.retry_after_seconds as number) <= RETRY_SECONDS
    ? { allowed: false, retry: value.retry_after_seconds as number } : null;
}

async function readCharge(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response?.ok || !response.body?.getReader) throw new Error("unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const abort = () => reject(new Error("unavailable"));
        if (signal.aborted) { abort(); return; }
        signal.addEventListener("abort", abort, { once: true });
        reader.read().then((value) => { signal.removeEventListener("abort", abort); resolve(value); },
          () => { signal.removeEventListener("abort", abort); reject(new Error("unavailable")); });
      });
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw new Error("unavailable");
      size += chunk.value.byteLength;
      if (size > BODY_LIMIT || chunks.length >= 4096) throw new Error("unavailable");
      chunks.push(chunk.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    try { void reader.cancel().catch(() => undefined); } catch { /* No raw errors. */ }
    throw new Error("unavailable");
  } finally {
    try { reader.releaseLock(); } catch { /* No raw errors. */ }
  }
}

function confirmationResult(value: unknown): CulqiStatusRecoveryResult {
  // A case-specific refund observed under SQL's final lock can refuse the
  // transition after our fresh SELECT. Recognize only the closed refusal;
  // it establishes review, never payment or a duplicate application.
  if (record(value) && Object.keys(value).sort().join(",") === "alreadyPaid,applied,duplicate,orderState,paymentState,requiresReview"
    && value.applied === false && value.duplicate === false && value.alreadyPaid === false
    && value.requiresReview === true && value.paymentState === "pending"
    && typeof value.orderState === "string" && ["payment_pending_review", "needs_correction", "cancelled"].includes(value.orderState)) {
    return result("review_required");
  }
  if (!record(value) || Object.keys(value).sort().join(",") !== "alreadyPaid,applied,duplicate,orderState,paymentState,requiresReview"
    || typeof value.applied !== "boolean" || typeof value.duplicate !== "boolean" || typeof value.alreadyPaid !== "boolean"
    || !(value.applied && !value.duplicate && !value.alreadyPaid || !value.applied && value.duplicate
      || !value.applied && !value.duplicate && value.alreadyPaid)
    || typeof value.requiresReview !== "boolean" || value.paymentState !== "paid"
    || typeof value.orderState !== "string" || !ORDER_STATES.has(value.orderState)
    || value.orderState === "cancelled" && value.requiresReview !== true) return result("unavailable", RETRY_SECONDS);
  return result(value.requiresReview ? "review_required" : value.applied ? "confirmed" : "already_paid");
}

export function createCulqiStatusRecovery(dependencies: CulqiStatusRecoveryDependencies) {
  return async function recover(rawContext: CulqiStatusRecoveryContext): Promise<CulqiStatusRecoveryResult> {
    let clock: () => number;
    let started: number;
    let deadline: AbortSignal;
    try { clock = dependencies.now ?? Date.now; started = clock(); deadline = AbortSignal.timeout(BUDGET_MS); }
    catch { return result("unavailable", RETRY_SECONDS); }
    async function step<T>(limitMs: number, operation: (signal: AbortSignal) => Awaitable<T>): Promise<T> {
      const elapsed = clock() - started;
      const remaining = BUDGET_MS - elapsed;
      if (!Number.isSafeInteger(started) || started < 0 || !Number.isFinite(elapsed) || elapsed < 0 || remaining <= 0) {
        throw new Error("unavailable");
      }
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, deadline, AbortSignal.timeout(Math.min(limitMs, Math.ceil(remaining)))]);
      try {
        const value = await new Promise<T>((resolve, reject) => {
          const abort = () => reject(new Error("unavailable"));
          if (signal.aborted) { abort(); return; }
          signal.addEventListener("abort", abort, { once: true });
          Promise.resolve().then(() => operation(signal)).then(
            (answer) => { signal.removeEventListener("abort", abort); resolve(answer); },
            () => { signal.removeEventListener("abort", abort); reject(new Error("unavailable")); },
          );
        });
        if (signal.aborted || clock() - started >= BUDGET_MS) throw new Error("unavailable");
        return value;
      } finally { controller.abort(); }
    }
    try {
      const env = await step(2_000, () => dependencies.readConfig());
      // This trusted server flag is the operational gate. No caller field can
      // enable it, and no environment or credentials are configured here.
      if (env === null || typeof env !== "object" || Array.isArray(env)
        || env.CULQI_STATUS_RECOVERY_APPROVED !== "true") return result("skipped");
      if (!Object.values(getCulqiReadonlyDiagnosticScope(env)).every(Boolean)) return result("skipped");
      if (!record(rawContext) || typeof rawContext.orderCode !== "string" || !ORDER_CODE.test(rawContext.orderCode)
        || typeof rawContext.checkoutSessionId !== "string" || !UUID.test(rawContext.checkoutSessionId)) return result("unavailable", RETRY_SECONDS);
      const context = Object.freeze({ orderCode: rawContext.orderCode, checkoutSessionId: rawContext.checkoutSessionId.toLowerCase() });
      const publicKey = env.NEXT_PUBLIC_CULQI_PUBLIC_KEY;
      const secretKey = env.CULQI_SECRET_KEY;
      if (typeof publicKey !== "string" || !/^pk_test_[A-Za-z0-9]+$/.test(publicKey)
        || typeof secretKey !== "string" || !/^sk_test_[A-Za-z0-9]+$/.test(secretKey)) return result("skipped");

      const first = await step(2_000, (signal) => dependencies.readPersistedOrder(context.orderCode, context.checkoutSessionId, signal));
      if (first === null) return result("skipped");
      const before = copySnapshot(first);
      if (!before || !matchesContext(before, context)) return result("review_required");
      if (before.order.payment_status === "paid") return result(before.order.payment_reconciliation_required ? "review_required" : "already_paid");
      if (before.order.payment_status !== "pending") return result("skipped");
      if (!before.order.payment_charge_id && !before.order.payment_charge_attempt_id
        && !before.order.payment_reconciliation_required && !["submitted", "uncertain"].includes(before.order.payment_charge_state)) return result("skipped");
      if (!eligible(before)) return result("review_required");

      // One read per persisted financial identity in each 15-second window.
      // The existing rate-limit RPC's missing/error case is deliberately closed.
      const rateArgs: CulqiStatusRecoveryRateArgs = Object.freeze({
        p_scope: "culqi_status_charge_get",
        p_identifier: createHash("sha256").update(JSON.stringify([
          before.order.id, context.checkoutSessionId, before.attempt!.id,
          before.order.payment_charge_attempt_id, before.order.payment_charge_id,
        ])).digest("hex"),
        p_limit: 1, p_window_seconds: 15,
      });
      const rate = rateDecision(await step(2_000, (signal) => dependencies.consumeRateLimit(rateArgs, signal)));
      if (!rate) return result("unavailable", RETRY_SECONDS);
      if (!rate.allowed) return result("deferred", rate.retry);

      let charge: unknown;
      try {
        charge = await step(5_000, async (signal) => readCharge(await dependencies.fetch(
          `${API}/v2/charges/${encodeURIComponent(before.order.payment_charge_id!)}`, {
            method: "GET", credentials: "omit", redirect: "error", cache: "no-store",
            headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" }, signal,
          },
        ), signal));
      } catch { return result("deferred", RETRY_SECONDS); }
      const observedAt = clock();
      const fresh = await step(2_000, (signal) => dependencies.readPersistedOrder(context.orderCode, context.checkoutSessionId, signal));
      const after = fresh ? copySnapshot(fresh) : null;
      if (!after || !matchesContext(after, context) || after.order.id !== before.order.id) return result("deferred", RETRY_SECONDS);
      // A concurrent webhook is authoritative. Do not reapply or discard its
      // paid state because flags or fulfillment changed during the provider GET.
      if (after.order.payment_status === "paid") return result(after.order.payment_reconciliation_required ? "review_required" : "already_paid");
      if (!eligible(after) || !stable(before, after)) return result("deferred", RETRY_SECONDS);
      const capture = validateCulqiCapturedCharge(charge, {
        chargeId: after.order.payment_charge_id!, sourceId: after.order.payment_charge_source_id!,
        orderCode: after.order.order_code, amountMinor: after.order.payment_amount_minor!, currencyCode: "PEN",
      }, after.knownRefund);
      if (!capture.verified) {
        const adverse = new Set(["identity_mismatch", "amount_mismatch", "currency_mismatch", "order_mismatch", "source_mismatch",
          "financial_fields_missing", "financial_fields_invalid",
          "refund_observed", "current_amount_mismatch", "dispute_observed", "known_refund_invalid", "known_refund_pending", "known_refund_completed", "known_refund_unknown"]);
        return adverse.has(capture.reason) ? result("review_required") : result("deferred", RETRY_SECONDS);
      }
      const age = clock() - observedAt;
      if (!Number.isSafeInteger(observedAt) || observedAt < 0 || !Number.isFinite(age) || age < 0 || age >= 30_000) return result("deferred", RETRY_SECONDS);
      const args: CulqiStatusRecoveryConfirmationArgs = Object.freeze({
        p_order_id: after.order.id, p_checkout_session_id: context.checkoutSessionId,
        p_payment_attempt_id: after.attempt!.id, p_charge_attempt_id: after.order.payment_charge_attempt_id!,
        p_contract_marker: CONTRACT_MARKER, p_observed_at: new Date(observedAt).toISOString(),
        p_observation: Object.freeze({
          chargeId: after.order.payment_charge_id!, sourceId: after.order.payment_charge_source_id!, ...capture.evidence,
        }),
      });
      // SQL rechecks these identities and the operational policy under its
      // locks. No lock remains held while querying the provider. A timeout may
      // leave an unknown transaction outcome; a later status read recovers it.
      return confirmationResult(await step(2_000, (signal) => dependencies.confirmCharge(args, signal)));
    } catch { return result("unavailable", RETRY_SECONDS); }
  };
}
