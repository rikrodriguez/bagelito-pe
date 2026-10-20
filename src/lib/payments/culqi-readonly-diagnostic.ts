// Bounded evidence collection only. No environment, database client, payment
// coordinator or global fetch is imported; the authenticated server action
// supplies those capabilities. Reports never contain IDs or provider payloads.
const ORIGIN = "https://bagelito-pe-git-fix-80c94a-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const HOST = new URL(ORIGIN).host;
const API = "https://api.culqi.com";
const QA_URL = "https://qaahskendqdkynwtylho.supabase.co";
const BRANCH = "fix/culqi-payment-coordination-20261012";
const PROJECT = "prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0";
const TARGETS = Object.freeze([
  Object.freeze({ orderCode: "BAG-000001", label: "qa_yape", chargeId: "chr_test_WIu0Hn7e9r2MqEue" }),
  Object.freeze({ orderCode: "BAG-000002", label: "qa_visa", chargeId: "chr_test_BGmSf0LA6lKdxdcz" }),
  Object.freeze({ orderCode: "BAG-000004", label: "qa_3ds", chargeId: "chr_test_SA3U26iSk7KDn0BI" }),
] as const);
const ORDER_CODES = Object.freeze(TARGETS.map((target) => target.orderCode));
const TYPES = Object.freeze(["charge.creation.succeeded", "charge.creation.failed"]);
const FROM_SEC = 1792009200;
const TO_SEC = 1792011300;
const SOURCE_ID = /^(?:tkn|ype)_test_[A-Za-z0-9_-]{8,100}$/;
const EVENT_ID = /^evt_test_[A-Za-z0-9_-]{8,40}$/;
const BODY_LIMIT = 256 * 1024;
const LIST_LIMIT = 2 * 1024 * 1024;
const MAX_CANDIDATES = 20;

type Environment = Readonly<Record<string, string | undefined>>;
type Target = typeof TARGETS[number];
type Label = Target["label"];
type Awaitable<T> = T | Promise<T>;

export type CulqiReadonlyDiagnosticRequest = {
  method: string;
  origin: string | null;
  host: string | null;
  forwardedHost?: string | null;
  referer?: string | null;
  fetchSite?: string | null;
};

// Deliberately excludes customer identity, full payloads and checkout/session
// secrets. The adapter may only SELECT these fields for the supplied codes.
export type CulqiReadonlyDiagnosticOrder = {
  order_code: string;
  payment_provider: string;
  payment_lane: string;
  payment_order_id: string | null;
  payment_charge_id: string | null;
  payment_charge_source_id: string | null;
  payment_amount_minor: number | null;
  payment_currency: string | null;
};

export type CulqiReadonlyDiagnosticResult = {
  chargeQueryAttempted: boolean;
  chargeQueryFailed: boolean;
  chargeFetched: boolean;
  objectMatches: boolean;
  chargeIdentityMatches: boolean;
  amountMatches: boolean;
  currencyMatches: boolean;
  orderMetadataMatches: boolean;
  sourceMatchesPersisted: boolean;
  captureFlagTrue: boolean;
  captureDatePresent: boolean;
  captureDateContractVerified: false;
  capturedPaymentConfirmed: false;
  candidatesFound: boolean;
  eventDetailQueryAttempted: boolean;
  eventDetailQueryFailed: boolean;
  candidateRejected: boolean;
  noCandidatesInScannedPages: boolean;
  eventVerifiedById: boolean;
  eventTimestampUnitsVerified: boolean;
  eventMatchesPersistedCharge: boolean;
  successfulEventVerified: boolean;
  failedEventVerified: boolean;
  conflictingEventsPresent: boolean;
  requiresReview: true;
};

export type CulqiReadonlyDiagnosticStage = "authentication" | "csrf" | "origin" | "scope"
  | "test_keys" | "persisted_orders" | "charge_lookup" | "event_list"
  | "event_lookup" | "complete_partial";

export type CulqiReadonlyDiagnosticReport = {
  ok: boolean;
  dryRun: true;
  completed: boolean;
  scanComplete: false;
  cursorContractVerified: false;
  captureSemanticsVerified: false;
  merchantAssociationVerified: false;
  paidConfirmed: false;
  writesAttempted: false;
  reconciliationApplied: false;
  candidateLimitReached: boolean;
  rejectedCandidatePresent: boolean;
  stage: CulqiReadonlyDiagnosticStage;
  checks: Record<string, boolean>;
  eventListQueries: Record<"succeeded" | "failed", {
    attempted: boolean;
    succeeded: boolean;
    failed: boolean;
  }>;
  results: Record<Label, CulqiReadonlyDiagnosticResult>;
};

export type CulqiReadonlyDiagnosticDependencies = {
  requireAdmin(): Promise<void>;
  verifyActionCsrf(request: CulqiReadonlyDiagnosticRequest): Awaitable<boolean>;
  readConfig(): Awaitable<Environment>;
  readOrders(orderCodes: readonly string[]): Promise<readonly CulqiReadonlyDiagnosticOrder[]>;
  fetch(url: string, init: RequestInit): Promise<Response>;
  safeLog?(label: "culqi_readonly_dryrun", report: CulqiReadonlyDiagnosticReport): void;
  now?(): number;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactUrl(value: unknown, expected: string) {
  return value === expected || value === `${expected}/`;
}

function timestampMatches(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= FROM_SEC * 1000 && value <= TO_SEC * 1000;
}

// Safe for UI gating: metadata only. Never reads payment key material or clients.
export function getCulqiReadonlyDiagnosticScope(env: Environment): Record<string, boolean> {
  return {
    preview: env.VERCEL === "1" && env.VERCEL_ENV === "preview"
      && (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV === "preview"),
    projectMatches: env.VERCEL_PROJECT_ID === PROJECT,
    branchMatches: env.VERCEL_GIT_COMMIT_REF === BRANCH
      && env.VERCEL_GIT_REPO_OWNER === "rikrodriguez"
      && env.VERCEL_GIT_REPO_SLUG === "bagelito-pe",
    branchOriginMatches: env.VERCEL_BRANCH_URL === HOST,
    siteOriginMatches: exactUrl(env.NEXT_PUBLIC_SITE_URL, ORIGIN),
    databaseMatches: exactUrl(env.NEXT_PUBLIC_SUPABASE_URL, QA_URL),
    sandbox: env.CULQI_MODE === "sandbox" && env.CULQI_LIVE_APPROVED === "false",
    enabled: env.PAYMENT_PROVIDER === "culqi" && env.CULQI_ENABLED === "true",
  };
}

function explicitOriginMatches(request: CulqiReadonlyDiagnosticRequest) {
  if (!record(request) || request.method !== "POST" || request.origin !== ORIGIN || request.host !== HOST) return false;
  if (request.forwardedHost !== undefined && request.forwardedHost !== null && request.forwardedHost !== HOST) return false;
  if (request.fetchSite !== undefined && request.fetchSite !== null
    && request.fetchSite !== "same-origin") return false;
  if (request.referer !== undefined && request.referer !== null) {
    try {
      const ref = new URL(request.referer);
      if (ref.origin !== ORIGIN || ref.username || ref.password) return false;
    } catch { return false; }
  }
  return true;
}

function parseResource(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > BODY_LIMIT) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  return record(value) ? value : null;
}

function matches(resource: Record<string, unknown> | null, order: CulqiReadonlyDiagnosticOrder, target: Target) {
  const metadata = record(resource?.metadata) ? resource.metadata : null;
  const source = record(resource?.source) ? resource.source : null;
  return {
    objectMatches: resource?.object === "charge",
    chargeIdentityMatches: resource?.id === target.chargeId,
    amountMatches: typeof resource?.amount === "number" && Number.isSafeInteger(resource.amount) && resource.amount === 6600,
    currencyMatches: resource?.currency_code === "PEN" && (resource.currency === undefined || resource.currency === "PEN"),
    orderMetadataMatches: metadata?.bagelito_order_code === target.orderCode,
    sourceMatchesPersisted: source?.id === order.payment_charge_source_id,
  };
}

function readWithAbort<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      signal.removeEventListener("abort", aborted);
      reject(new Error("read_failed"));
    };
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw new Error("read_failed");
      return operation();
    }).then((value) => {
      signal.removeEventListener("abort", aborted);
      resolve(value);
    }, () => {
      signal.removeEventListener("abort", aborted);
      reject(new Error("read_failed"));
    });
  });
}

async function limitedJson(response: Response, maxBytes: number, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (!response?.ok || !response.body?.getReader) throw new Error("read_failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await readWithAbort(() => reader.read(), signal);
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("read_failed");
      size += value.byteLength;
      if (size > maxBytes || chunks.length >= 4096) throw new Error("read_failed");
      chunks.push(value);
    }
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!record(payload)) throw new Error("read_failed");
    return payload;
  } catch {
    // Cancel without waiting for an uncooperative source to settle its cancel.
    // The GET controller is aborted by the caller's finally block as well.
    void reader.cancel().catch(() => undefined);
    throw new Error("read_failed");
  } finally {
    try { reader.releaseLock(); } catch { /* No raw errors escape. */ }
  }
}

function emptyResult(): CulqiReadonlyDiagnosticResult {
  return {
    chargeQueryAttempted: false, chargeQueryFailed: false,
    chargeFetched: false, objectMatches: false, chargeIdentityMatches: false,
    amountMatches: false, currencyMatches: false, orderMetadataMatches: false,
    sourceMatchesPersisted: false, captureFlagTrue: false, captureDatePresent: false,
    captureDateContractVerified: false, capturedPaymentConfirmed: false,
    candidatesFound: false, eventDetailQueryAttempted: false, eventDetailQueryFailed: false,
    candidateRejected: false, noCandidatesInScannedPages: false,
    eventVerifiedById: false, eventTimestampUnitsVerified: false,
    eventMatchesPersistedCharge: false, successfulEventVerified: false,
    failedEventVerified: false, conflictingEventsPresent: false, requiresReview: true,
  };
}

// Only the server wrapper may construct these dependencies and the request
// descriptor from authenticated headers. There are no caller-selected IDs.
export function createCulqiReadonlyDiagnostic(dependencies: CulqiReadonlyDiagnosticDependencies) {
  return async function run(request: CulqiReadonlyDiagnosticRequest): Promise<CulqiReadonlyDiagnosticReport> {
    const report: CulqiReadonlyDiagnosticReport = {
      ok: false, dryRun: true, completed: false, scanComplete: false,
      cursorContractVerified: false, captureSemanticsVerified: false,
      // Authenticated resource access does not identify the intended panel.
      merchantAssociationVerified: false,
      paidConfirmed: false, writesAttempted: false, reconciliationApplied: false,
      candidateLimitReached: false, rejectedCandidatePresent: false,
      stage: "authentication", checks: {},
      eventListQueries: {
        succeeded: { attempted: false, succeeded: false, failed: false },
        failed: { attempted: false, succeeded: false, failed: false },
      },
      results: { qa_yape: emptyResult(), qa_visa: emptyResult(), qa_3ds: emptyResult() },
    };
    const finish = () => {
      try { dependencies.safeLog?.("culqi_readonly_dryrun", structuredClone(report)); } catch { /* No raw logging. */ }
      return report;
    };
    try {
      await dependencies.requireAdmin();
      report.stage = "csrf";
      if (await dependencies.verifyActionCsrf(request) !== true) return finish();
      report.stage = "origin";
      if (!explicitOriginMatches(request)) return finish();
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
      report.stage = "persisted_orders";
      const rows = await dependencies.readOrders([...ORDER_CODES]);
      if (!Array.isArray(rows) || rows.length !== 3 || rows.some((row) => !record(row))) return finish();
      const orders = new Map<string, CulqiReadonlyDiagnosticOrder>(rows.map((row) => [row.order_code, Object.freeze({
        order_code: row.order_code, payment_provider: row.payment_provider, payment_lane: row.payment_lane,
        payment_order_id: row.payment_order_id, payment_charge_id: row.payment_charge_id,
        payment_charge_source_id: row.payment_charge_source_id,
        payment_amount_minor: row.payment_amount_minor, payment_currency: row.payment_currency,
      })]));
      if (orders.size !== 3 || TARGETS.some((target) => {
        const row = orders.get(target.orderCode);
        return !row || row.payment_charge_id !== target.chargeId || row.payment_provider !== "culqi"
          || row.payment_lane !== "token" || row.payment_order_id !== null
          || row.payment_amount_minor !== 6600 || row.payment_currency !== "PEN"
          || typeof row.payment_charge_source_id !== "string" || !SOURCE_ID.test(row.payment_charge_source_id);
      })) return finish();

      const now = dependencies.now ?? (() => performance.now());
      const started = now();
      let calls = 0;
      const allowedPaths = new Set<string>(TARGETS.map((target) => `/v2/charges/${encodeURIComponent(target.chargeId)}`));
      const eventPaths = new Set<string>();
      const listPaths = TYPES.map((type) => `/v2/events?${new URLSearchParams({
        type, creation_date_from: String(FROM_SEC), creation_date_to: String(TO_SEC), limit: "100",
      })}`);
      for (const path of listPaths) allowedPaths.add(path);
      const get = async (path: string, bodyLimit: number) => {
        if (!allowedPaths.has(path) && !eventPaths.has(path)) throw new Error("read_failed");
        const requestStarted = now();
        const remaining = 90_000 - (requestStarted - started);
        if (++calls > 25 || remaining <= 0 || !Number.isFinite(remaining)) throw new Error("read_failed");
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.min(10_000, Math.ceil(remaining)))]);
        const expiresAt = Math.min(requestStarted + 10_000, started + 90_000);
        const assertInBudget = () => {
          const current = now();
          if (signal.aborted || !Number.isFinite(current) || current >= expiresAt) throw new Error("read_failed");
        };
        try {
          // Close our wait even if the transport ignores cancellation. A late
          // timer must not authorize accepting headers or JSON outside budget.
          const response = await readWithAbort(() => {
            assertInBudget();
            return dependencies.fetch(`${API}${path}`, {
              method: "GET", credentials: "omit", redirect: "error", cache: "no-store",
              headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" }, signal,
            });
          }, signal);
          assertInBudget();
          const payload = await limitedJson(response, bodyLimit, signal);
          assertInBudget();
          return payload;
        } finally { controller.abort(); }
      };
      const verifiedCharges = new Set<string>();
      for (const target of TARGETS) {
        report.stage = "charge_lookup";
        const result = report.results[target.label];
        result.chargeQueryAttempted = true;
        let charge: Record<string, unknown>;
        try { charge = await get(`/v2/charges/${encodeURIComponent(target.chargeId)}`, BODY_LIMIT); }
        catch { result.chargeQueryFailed = true; return finish(); }
        const order = orders.get(target.orderCode)!;
        const checks = matches(charge, order, target);
        result.chargeFetched = true;
        Object.assign(result, checks);
        result.captureFlagTrue = charge.capture === true;
        result.captureDatePresent = charge.capture_date !== undefined && charge.capture_date !== null;
        // Date presence/flag are observations, not an invented capture contract.
        if (Object.values(checks).every(Boolean)) verifiedCharges.add(target.chargeId);
      }
      const seen = new Set<string>();
      let fullyClassifiedPages = true;
      for (let page = 0; page < TYPES.length; page++) {
        report.stage = "event_list";
        const query = report.eventListQueries[page === 0 ? "succeeded" : "failed"];
        query.attempted = true;
        let list: Record<string, unknown>;
        try {
          list = await get(listPaths[page], LIST_LIMIT);
          if (!Array.isArray(list.data) || list.data.length > 100) {
            query.failed = true; return finish();
          }
          query.succeeded = true;
        } catch { query.failed = true; return finish(); }
        // total/current/has_more never infer pagination or absence.
        for (const candidate of list.data as unknown[]) {
          if (!record(candidate)) {
            report.rejectedCandidatePresent = true; fullyClassifiedPages = false; continue;
          }
          const candidateResource = parseResource(candidate.data);
          if (!candidateResource || typeof candidateResource.id !== "string" || !candidateResource.id) {
            report.rejectedCandidatePresent = true; fullyClassifiedPages = false; continue;
          }
          const target = TARGETS.find((item) => item.chargeId === candidateResource?.id);
          if (!target) continue;
          const result = report.results[target.label];
          result.candidatesFound = true;
          if (typeof candidate.id !== "string" || !EVENT_ID.test(candidate.id)
            || candidate.type !== TYPES[page] || !timestampMatches(candidate.creation_date)) {
            result.candidateRejected = true; report.rejectedCandidatePresent = true; continue;
          }
          if (seen.has(candidate.id)) continue;
          if (seen.size >= MAX_CANDIDATES) { report.candidateLimitReached = true; return finish(); }
          seen.add(candidate.id);
          report.stage = "event_lookup";
          const path = `/v2/events/${encodeURIComponent(candidate.id)}`;
          eventPaths.add(path);
          result.eventDetailQueryAttempted = true;
          let verified: Record<string, unknown>;
          try { verified = await get(path, BODY_LIMIT); }
          catch { result.eventDetailQueryFailed = true; return finish(); }
          const resource = parseResource(verified.data);
          const identityValid = verified.id === candidate.id && verified.type === candidate.type
            && typeof verified.id === "string" && EVENT_ID.test(verified.id) && timestampMatches(verified.creation_date);
          const resourceValid = resource && Object.values(matches(resource, orders.get(target.orderCode)!, target)).every(Boolean);
          if (!identityValid || !resourceValid || !verifiedCharges.has(target.chargeId)) {
            result.candidateRejected = true; report.rejectedCandidatePresent = true; continue;
          }
          result.eventVerifiedById = true;
          result.eventTimestampUnitsVerified = true;
          result.eventMatchesPersistedCharge = true;
          if (verified.type === TYPES[0]) result.successfulEventVerified = true;
          if (verified.type === TYPES[1]) result.failedEventVerified = true;
          result.conflictingEventsPresent = result.successfulEventVerified && result.failedEventVerified;
        }
      }
      // This describes only the two pages actually read, never all provider
      // events. An unread, failed or unclassifiable page leaves absence unknown.
      for (const target of TARGETS) {
        const result = report.results[target.label];
        result.noCandidatesInScannedPages = fullyClassifiedPages && !result.candidatesFound;
      }
      report.stage = "complete_partial";
      report.ok = true;
      report.completed = true;
      return finish();
    } catch { return finish(); }
  };
}
