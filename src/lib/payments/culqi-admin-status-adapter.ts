import { getCulqiReadonlyDiagnosticScope } from "./culqi-readonly-diagnostic";

const ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const HOST = new URL(ORIGIN).host;
const ORDER_CODES = ["BAG-000001", "BAG-000002", "BAG-000004"] as const;
const PAYMENT_STATUSES = ["pending", "paid", "failed", "expired", "refunded"] as const;
const ORDER_STATUSES = ["payment_pending_review", "payment_confirmed", "needs_correction",
  "in_production", "ready_for_delivery", "delivered", "cancelled"] as const;
const RECOVERY_STATES = ["skipped", "deferred", "review_required", "confirmed", "already_paid", "unavailable"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORWARDED_HEADERS = ["origin", "host", "x-forwarded-host", "x-forwarded-proto", "sec-fetch-site", "referer"] as const;

type Environment = Readonly<Record<string, string | undefined>>;
type HeaderSource = { get(name: string): string | null };
type Awaitable<T> = T | Promise<T>;

export type CulqiAdminStatusResult = {
  // A successful authoritative status read does not by itself mean payment.
  ok: boolean;
  paymentStatus?: typeof PAYMENT_STATUSES[number];
  orderStatus?: typeof ORDER_STATUSES[number];
  reconciliationRequired?: boolean;
  recoveryState?: typeof RECOVERY_STATES[number];
  retryAfterSeconds?: number;
};

export type CulqiAdminStatusDependencies = {
  requireAdmin(): Promise<void>;
  readHeaders(): Awaitable<HeaderSource>;
  readConfig(): Awaitable<Environment>;
  readOrderPair(orderCode: string, signal: AbortSignal): Promise<unknown>;
  postStatus(request: Request): Promise<Response>;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function member<T extends string>(choices: readonly T[], value: unknown): value is T {
  return typeof value === "string" && choices.some((choice) => choice === value);
}

export function isCulqiAdminStatusOrderCodeAllowed(orderCode: unknown): boolean {
  return member(ORDER_CODES, orderCode);
}

// Rendering may inspect only non-secret metadata. The action repeats all gates
// and checks the test keys before resolving a checkout capability.
export function getCulqiAdminStatusUiScope(env: Environment): Record<string, boolean> {
  return { ...getCulqiReadonlyDiagnosticScope(env), recoveryApproved: env.CULQI_STATUS_RECOVERY_APPROVED === "true" };
}

function validatedHeaders(incoming: HeaderSource): Headers | null {
  const raw = new Map<string, string | null>();
  for (const name of FORWARDED_HEADERS) {
    raw.set(name, incoming.get(name));
  }
  if (raw.get("origin") !== ORIGIN || raw.get("host") !== HOST) return null;
  const forwardedHost = raw.get("x-forwarded-host");
  const protocol = raw.get("x-forwarded-proto");
  const fetchSite = raw.get("sec-fetch-site");
  if (forwardedHost !== null && forwardedHost !== HOST || protocol !== null && protocol !== "https"
    || fetchSite !== null && fetchSite !== "same-origin") return null;
  const referer = raw.get("referer");
  if (referer != null) {
    const ref = new URL(referer);
    if (ref.origin !== ORIGIN || ref.username || ref.password) return null;
  }
  const copied = new Headers();
  for (const [name, value] of raw) {
    if (value !== null) {
      copied.set(name, value);
      if (copied.get(name) !== value) return null;
    }
  }
  return copied;
}

function allowedInput(input: unknown): input is { orderCode: string } {
  if (!record(input) || Reflect.ownKeys(input).length !== 1) return false;
  const descriptor = Object.getOwnPropertyDescriptor(input, "orderCode");
  return !!descriptor && "value" in descriptor && isCulqiAdminStatusOrderCodeAllowed(descriptor.value);
}

async function readPair(dependencies: CulqiAdminStatusDependencies, orderCode: string): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // The race bounds an uncooperative dependency as well as a real query. The
    // very same abort signal is passed to the minimal Supabase SELECT.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("status_unavailable")); }, 2000);
    });
    return await Promise.race([deadline, dependencies.readOrderPair(orderCode, controller.signal)]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function sanitizedReply(response: Response): Promise<CulqiAdminStatusResult> {
  if (!response.ok) return { ok: false };
  const payload: unknown = await response.json();
  if (!record(payload) || payload.ok !== true || !member(PAYMENT_STATUSES, payload.paymentStatus)
    || !member(ORDER_STATUSES, payload.orderStatus) || typeof payload.reconciliationRequired !== "boolean"
    || payload.recoveryState !== undefined && !member(RECOVERY_STATES, payload.recoveryState)
    || payload.retryAfterSeconds !== undefined && (!Number.isSafeInteger(payload.retryAfterSeconds)
      || (payload.retryAfterSeconds as number) < 0 || (payload.retryAfterSeconds as number) > 15)) return { ok: false };
  return {
    ok: true,
    paymentStatus: payload.paymentStatus,
    orderStatus: payload.orderStatus,
    reconciliationRequired: payload.reconciliationRequired,
    ...(member(RECOVERY_STATES, payload.recoveryState) ? { recoveryState: payload.recoveryState } : {}),
    ...(typeof payload.retryAfterSeconds === "number" ? { retryAfterSeconds: payload.retryAfterSeconds } : {}),
  };
}

// No configuration, clients or dependencies are evaluated until invocation.
export function createCulqiAdminStatusAction(dependencies: CulqiAdminStatusDependencies) {
  return async function run(_previousState: unknown, input: unknown): Promise<CulqiAdminStatusResult> {
    try {
      await dependencies.requireAdmin();
      const incoming = await dependencies.readHeaders();
      const delegatedHeaders = validatedHeaders(incoming);
      if (!delegatedHeaders || !allowedInput(input)) return { ok: false };

      const env = await dependencies.readConfig();
      if (!Object.values(getCulqiAdminStatusUiScope(env)).every(Boolean)
        || !/^pk_test_[A-Za-z0-9]+$/.test(env.NEXT_PUBLIC_CULQI_PUBLIC_KEY ?? "")
        || !/^sk_test_[A-Za-z0-9]+$/.test(env.CULQI_SECRET_KEY ?? "")) return { ok: false };

      const pair = await readPair(dependencies, input.orderCode);
      if (!record(pair) || pair.order_code !== input.orderCode
        || typeof pair.checkout_session_id !== "string" || !UUID.test(pair.checkout_session_id)) return { ok: false };

      delegatedHeaders.set("content-type", "application/json");
      const request = new Request(`${ORIGIN}/api/payments/culqi/status`, {
        method: "POST", headers: delegatedHeaders,
        body: JSON.stringify({ orderCode: pair.order_code, checkoutSessionId: pair.checkout_session_id }),
        cache: "no-store", credentials: "omit", redirect: "error",
      });
      return await sanitizedReply(await dependencies.postStatus(request));
    } catch {
      // Includes authentication redirects, transport failures and raw errors.
      return { ok: false };
    }
  };
}
