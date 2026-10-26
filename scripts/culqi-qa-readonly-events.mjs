import { pathToFileURL } from "node:url";

const RUN_MESSAGE = "qa: one-shot readonly Culqi event diagnostics";
const QA_BRANCH = "codex/culqi-payment-split-20261021";
const QA_HOST = "bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const QA_DATABASE = "https://qaahskendqdkynwtylho.supabase.co";
const PROVIDER = "https://api.culqi.com";
const TARGET_ORDER_CODE = "BAG-000013";
const EVENT_ID = /^evt_test_[A-Za-z0-9]{16}$/;
const ERROR_TYPES = new Set(["invalid_request_error", "authentication_error", "parameter_error",
  "card_error", "limit_api_error", "resource_error", "api_error"]);
const ERROR_PARAMS = new Set(["id", "environment", "version", "authorization"]);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function allowedQAEnvironment(env) {
  try {
    return env.VERCEL === "1" && env.VERCEL_ENV === "preview"
      && env.VERCEL_PROJECT_ID === "prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0"
      && env.VERCEL_GIT_COMMIT_REF === QA_BRANCH
      && env.VERCEL_GIT_COMMIT_MESSAGE === RUN_MESSAGE
      && env.VERCEL_GIT_REPO_OWNER === "rikrodriguez"
      && env.VERCEL_GIT_REPO_SLUG === "bagelito-pe"
      && env.VERCEL_BRANCH_URL === QA_HOST
      && new URL(env.NEXT_PUBLIC_SITE_URL).origin === "https://" + QA_HOST
      && new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin === QA_DATABASE
      && env.PAYMENT_PROVIDER === "culqi" && env.CULQI_MODE === "sandbox"
      && env.CULQI_ENABLED === "true" && env.CULQI_LIVE_APPROVED === "false"
      && typeof env.CULQI_SECRET_KEY === "string"
      && env.CULQI_SECRET_KEY.startsWith("sk_test_") && env.CULQI_SECRET_KEY.length < 256;
  } catch {
    return false;
  }
}

function classify(payload) {
  const type = object(payload) && ERROR_TYPES.has(payload.type) ? payload.type : "unknown";
  const value = object(payload) ? payload.param : null;
  const param = value == null ? "absent" : ERROR_PARAMS.has(value) ? value
    : value === "x-culqi-env" ? "environment" : value === "x-api-version" ? "version" : "other";
  return { type, param };
}

function eventResource(value) {
  let data = value;
  if (typeof data === "string") {
    if (Buffer.byteLength(data, "utf8") > 512000) return null;
    try { data = JSON.parse(data); } catch { return null; }
  }
  return object(data) ? data : null;
}

async function boundedJson(response, limitBytes) {
  if (!response.body?.getReader) throw new Error("missing_body");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("invalid_body");
      total += value.length;
      if (total > limitBytes) throw new Error("oversized_body");
      chunks.push(value);
    }
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.concat(chunks)));
    return payload;
  } finally {
    try { void reader.cancel().catch(() => undefined); } catch { /* noop */ }
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

async function requestJSON(fetcher, path, secret, sdkHeaders, limitBytes = 2 * 1024 * 1024) {
  const url = PROVIDER + path;
  const headers = {
    Authorization: "Bearer " + secret,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(sdkHeaders ? { "x-api-version": "2", "x-culqi-env": "test" } : {}),
  };
  let response;
  try {
    response = await fetcher(url, {
      method: "GET", redirect: "error", credentials: "omit", cache: "no-store",
      headers, signal: AbortSignal.timeout(8000),
    });
    if (response.redirected || (response.url && response.url !== url)) throw new Error("redirect");
    const body = await boundedJson(response, limitBytes);
    return { status: response.status, ok: response.status === 200 && response.ok,
      body, error: response.ok ? { type: "none", param: "none" } : classify(body) };
  } catch {
    return { status: null, ok: false, body: null, error: { type: "transport", param: "none" } };
  }
}

function eventMatchesOrder(event) {
  if (!object(event)) return false;
  const resource = eventResource(event.data);
  return event.type === "charge.creation.succeeded" && resource?.object === "charge"
    && resource?.metadata && object(resource.metadata)
    && resource.metadata.bagelito_order_code === TARGET_ORDER_CODE
    && resource.currency_code === "PEN";
}

/** Inspect a single bounded provider list page and at most two event GETs. */
export async function inspectQAEvents(fetcher, secret) {
  const report = {
    listStatus: null, listKind: "unavailable", pageCandidates: 0,
    targetFound: false, documentedEventId: null,
    sdkGetStatus: null, sdkErrorParam: "none", fallbackAttempted: false,
    fallbackGetStatus: null, verifiedByGet: false, interpretation: "unavailable",
    writesAttempted: false,
  };
  const params = new URLSearchParams({
    type: "charge.creation.succeeded",
    creation_date_from: "1792540800", // 2026-10-21T00:00:00Z
    creation_date_to: "1792800000",   // 2026-10-24T00:00:00Z
    limit: "100",
  });
  const listed = await requestJSON(fetcher, "/v2/events?" + params, secret, false);
  report.listStatus = listed.status;
  if (!listed.ok || !object(listed.body) || !Array.isArray(listed.body.data)
    || listed.body.data.length > 100) {
    report.listKind = listed.ok ? "invalid_envelope" : "request_failed";
    report.interpretation = report.listKind;
    return report;
  }
  report.listKind = "ok";
  report.pageCandidates = listed.body.data.length;
  const candidate = listed.body.data.find(eventMatchesOrder);
  if (!candidate) {
    report.interpretation = "target_not_in_bounded_page";
    return report;
  }
  report.targetFound = true;
  report.documentedEventId = typeof candidate.id === "string" && EVENT_ID.test(candidate.id);
  if (!report.documentedEventId) {
    report.interpretation = "invalid_event_id_shape";
    return report;
  }
  const path = "/v2/events/" + encodeURIComponent(candidate.id);
  const sdk = await requestJSON(fetcher, path, secret, true, 512000);
  report.sdkGetStatus = sdk.status;
  report.sdkErrorParam = sdk.error.param;
  if (sdk.ok && object(sdk.body) && sdk.body.id === candidate.id
    && sdk.body.type === candidate.type && eventMatchesOrder(sdk.body)) {
    report.verifiedByGet = true;
    report.interpretation = "sdk_get_verified";
    return report;
  }
  const shouldFallback = sdk.status === 400 && sdk.error.type === "parameter_error"
    && ["version", "environment", "absent"].includes(sdk.error.param);
  if (!shouldFallback) {
    report.interpretation = "sdk_get_unverified";
    return report;
  }
  report.fallbackAttempted = true;
  const minimal = await requestJSON(fetcher, path, secret, false, 512000);
  report.fallbackGetStatus = minimal.status;
  report.verifiedByGet = minimal.ok && object(minimal.body) && minimal.body.id === candidate.id
    && minimal.body.type === candidate.type && eventMatchesOrder(minimal.body);
  report.interpretation = report.verifiedByGet ? "auth_only_get_verified" : "fallback_unverified";
  return report;
}

async function main() {
  if (!allowedQAEnvironment(process.env)) {
    console.info("culqi_qa_readonly_event_diagnostic", { status: "skipped" });
    return;
  }
  // Event data/IDs, cards, personal data and secrets never reach logs.
  let result;
  try { result = await inspectQAEvents(fetch, process.env.CULQI_SECRET_KEY); }
  catch { result = { interpretation: "unexpected_failure", writesAttempted: false }; }
  console.info("culqi_qa_readonly_event_diagnostic", result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
