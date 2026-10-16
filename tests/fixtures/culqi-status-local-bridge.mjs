// Transport-only preload for the native Next HTTP fixture. It never replaces
// application source, the capture parser, hosting guards, or the SQL function.
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const container = process.env.CULQI_HTTP_FIXTURE_CONTAINER;
const directory = process.env.CULQI_HTTP_FIXTURE_DIRECTORY;
if (!/^bagelito-status-http-[a-f0-9]{16}$/.test(container ?? "")
  || !directory?.startsWith("/tmp/bagelito-status-http-")) throw new Error("Invalid isolated HTTP fixture");
const qa = "https://qaahskendqdkynwtylho.supabase.co";
const auditFile = `${directory}/audit.jsonl`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const columns = {
  orders: new Set(["id", "batch_id", "checkout_session_id", "order_code", "total_amount", "status",
    "payment_provider", "payment_lane", "payment_order_id", "payment_charge_id", "payment_charge_attempt_id",
    "payment_charge_source_id", "payment_amount_minor", "payment_currency", "payment_charge_state", "payment_status",
    "payment_expires_at", "payment_paid_at", "payment_reconciliation_required", "payment_reconciliation_reason"]),
  payment_attempts: new Set(["id", "order_id", "provider", "provider_order_id", "provider_charge_id",
    "amount_minor", "currency_code", "status", "expires_at", "paid_at"]),
};
let releaseProvider;
function audit(kind) { appendFileSync(auditFile, `${JSON.stringify({ kind })}\n`, { mode: 0o600 }); }
function sql(statement, owner = false) {
  try {
    const text = execFileSync("docker", ["--config", `${directory}/docker-config`, "exec", "-i", container,
      "/usr/lib/postgresql/17/bin/psql", "-X", "-qAt", "-h", "/tmp", "-U", "postgres", "-d", "bagelito_test",
      "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      input: `${owner ? "" : "set role service_role;"} set search_path=pg_catalog,public; ${statement}`,
      encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, DOCKER_HOST: "unix:///var/run/docker.sock" },
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return text ? JSON.parse(text) : null;
  } catch { throw new Error("Isolated fixture database operation failed"); }
}
function control() { return JSON.parse(readFileSync(`${directory}/control.json`, "utf8")); }
function checkedUuid(value) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("Invalid fixture binding");
  return `${quote(value)}::uuid`;
}
function selected(url, headers) {
  const table = url.pathname.slice("/rest/v1/".length);
  const allowed = columns[table];
  if (!allowed) throw new Error("Unapproved fixture table");
  const fields = (url.searchParams.get("select") ?? "").split(",");
  if (!fields.length || fields.some((field) => !allowed.has(field))) throw new Error("Unapproved fixture projection");
  const predicates = [];
  const bindings = new Set();
  for (const [key, value] of url.searchParams) {
    if (key === "select") continue;
    if (key === "limit") {
      if (!/^[1-4]$/.test(value)) throw new Error("Unapproved fixture limit");
      continue;
    }
    if (!allowed.has(key)) throw new Error("Unapproved fixture filter");
    if (value === "is.null" && key === "provider_order_id") { predicates.push(`${key} is null`); continue; }
    if (!value.startsWith("eq.")) throw new Error("Unapproved fixture filter");
    const raw = value.slice(3);
    if (["id", "order_id", "checkout_session_id"].includes(key)) {
      predicates.push(`${key}=${checkedUuid(raw)}`); bindings.add(key);
    } else if (key === "order_code" && /^BAG-HTTP-[A-Z0-9_-]{1,50}$/.test(raw)) {
      predicates.push(`${key}=${quote(raw)}`); bindings.add(key);
    } else if (key === "provider" && raw === "culqi") predicates.push(`${key}='culqi'`);
    else throw new Error("Unapproved fixture binding");
  }
  if (table === "orders" && (!bindings.has("checkout_session_id") || !bindings.has("order_code") && !bindings.has("id"))
    || table === "payment_attempts" && !bindings.has("order_id")) throw new Error("Owned fixture pair is required");
  const limit = Number(url.searchParams.get("limit") ?? 4);
  const rows = sql(`select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from
    (select ${fields.join(",")} from public.${table} where ${predicates.join(" and ")} limit ${limit}) r;`);
  audit("select");
  if (headers.get("accept")?.includes("vnd.pgrst.object+json")) {
    return rows.length === 1 ? Response.json(rows[0])
      : Response.json({ code: "PGRST116", message: "Synthetic missing row" }, { status: 406 });
  }
  return Response.json(rows);
}
function rpc(name, body, headers) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Unapproved fixture RPC body");
  const keys = Object.keys(body).sort().join(",");
  if (name === "apply_culqi_payment_event") {
    if (keys !== "p_event_id,p_event_type,p_resource,p_verified_payload"
      || !/^evt_test_SYNTHETICHttp[0-9]{3}$/.test(body.p_event_id)
      || body.p_event_type !== "charge.creation.succeeded"
      || body.p_verified_payload?.id !== body.p_event_id
      || body.p_verified_payload?.type !== body.p_event_type
      || JSON.stringify(body.p_resource) !== body.p_verified_payload?.data) throw new Error("Unapproved synthetic event transaction");
    audit("event_apply");
    try {
      return Response.json(sql(`select public.apply_culqi_payment_event(${quote(body.p_event_id)},${quote(body.p_event_type)},
        ${quote(JSON.stringify(body.p_resource))}::jsonb,${quote(JSON.stringify(body.p_verified_payload))}::jsonb);`));
    } catch { return Response.json({ code: 'P0001', message: 'Synthetic event transaction rejected' }, { status: 400 }); }
  }
  if (name === "consume_api_rate_limit") {
    if (keys !== "p_identifier,p_limit,p_scope,p_window_seconds"
      || !/^culqi_status[a-z_]{0,70}$/.test(body.p_scope)
      || !/^[A-Za-z0-9_:-]{1,100}$/.test(body.p_identifier)
      || !Number.isSafeInteger(body.p_limit) || body.p_limit < 1 || body.p_limit > 1000
      || !Number.isSafeInteger(body.p_window_seconds) || body.p_window_seconds < 1 || body.p_window_seconds > 3600) {
      throw new Error("Unapproved fixture budget");
    }
    audit("rate");
    if (control().mode === "rate_fail") return Response.json({ code: "42883", message: "PRIVATE_SYNTHETIC_HTTP_ERROR" }, { status: 400 });
    const rows = sql(`select jsonb_agg(to_jsonb(r)) from public.consume_api_rate_limit(${quote(body.p_scope)},
      ${quote(body.p_identifier)},${body.p_limit},${body.p_window_seconds}) r;`);
    if (control().mode === "parallel" && rows[0]?.allowed === false && releaseProvider) {
      audit("parallel_budget_rejected"); releaseProvider();
    }
    return Response.json(headers.get("accept")?.includes("vnd.pgrst.object+json") ? rows[0] : rows);
  }
  if (name === "expire_culqi_token_session") {
    if (keys !== "p_checkout_session_id,p_order_id") throw new Error("Unapproved fixture expiry");
    audit("expiry");
    return Response.json(sql(`select public.expire_culqi_token_session(${checkedUuid(body.p_order_id)},
      ${checkedUuid(body.p_checkout_session_id)});`));
  }
  if (name !== "confirm_culqi_status_charge_get"
    || keys !== "p_charge_attempt_id,p_checkout_session_id,p_contract_marker,p_observation,p_observed_at,p_order_id,p_payment_attempt_id"
    || body.p_contract_marker !== "culqi_charge_get_reviewed_net_v1"
    || typeof body.p_observed_at !== "string" || !Number.isFinite(Date.parse(body.p_observed_at))) {
    throw new Error("Unapproved fixture transaction");
  }
  audit("confirm");
  if (control().mode === "rpc_fail") return Response.json({ code: "P0001", message: "PRIVATE_SYNTHETIC_HTTP_ERROR" }, { status: 400 });
  const statement = `select public.confirm_culqi_status_charge_get(${checkedUuid(body.p_order_id)},
    ${checkedUuid(body.p_checkout_session_id)},${checkedUuid(body.p_payment_attempt_id)},${checkedUuid(body.p_charge_attempt_id)},
    ${quote(body.p_contract_marker)},${quote(body.p_observed_at)}::timestamptz,${quote(JSON.stringify(body.p_observation))}::jsonb);`;
  if (control().mode === "sql_known_refund") {
    // Emulate a trusted concurrent writer AFTER the second application SELECT
    // and BEFORE the actual SQL locks. No application/contract code is changed.
    sql(`update public.orders set payment_reconciliation_required=true,
      payment_reconciliation_reason='known_pending_refund' where id=${checkedUuid(body.p_order_id)}
      and order_code like 'BAG-HTTP-%';`, true);
  }
  try { return Response.json(sql(statement)); }
  catch { return Response.json({ code: "P0001", message: "PRIVATE_SYNTHETIC_HTTP_ERROR" }, { status: 400 }); }
}
globalThis.fetch = async (input, init) => {
  try {
    const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === qa && !url.username && !url.password && !url.hash) {
      if (request.headers.get("authorization") !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
        throw new Error("Unapproved fixture authorization");
      }
      if (request.method === "GET" && ["/rest/v1/orders", "/rest/v1/payment_attempts"].includes(url.pathname)) {
        return selected(url, request.headers);
      }
      if (request.method === "POST" && /^\/rest\/v1\/rpc\/[a-z_]+$/.test(url.pathname) && !url.search) {
        return rpc(url.pathname.split("/").at(-1), await request.json(), request.headers);
      }
    }
    if (url.origin === "https://api.culqi.com" && request.method === "GET" && !url.search && !url.hash
      && /^\/v2\/events\/evt_test_SYNTHETICHttp[0-9]{3}$/.test(url.pathname)
      && request.headers.get("authorization") === `Bearer ${process.env.CULQI_SECRET_KEY}`) {
      if (request.headers.get("accept") !== "application/json"
        || request.headers.get("x-api-version") !== "2" || request.headers.get("x-culqi-env") !== "test") throw new Error("Unexpected event request contract");
      audit("event_get");
      const { mode } = control();
      if (mode === "event_400") return Response.json({ type: "parameter_error", param: "PRIVATE_SYNTHETIC_HTTP_ERROR",
        merchant_message: "PRIVATE_SYNTHETIC_HTTP_ERROR" }, { status: 400 });
      if (mode === "event_stall") return new Promise(() => {}); // Deliberately ignores abort; no socket or external fetch.
      const id = url.pathname.split("/").at(-1);
      const charge = id.replace('evt_test_', 'chr_test_');
      const row = sql(`select jsonb_build_object('object','charge','id',payment_charge_id,'amount',payment_amount_minor,
        'currency_code',payment_currency,'source',jsonb_build_object('id',payment_charge_source_id),
        'metadata',jsonb_build_object('bagelito_order_code',order_code)) from public.orders where payment_charge_id=${quote(charge)};`);
      if (!row) throw new Error("Unknown synthetic event resource");
      if (mode === "event_amount_mismatch") row.amount++;
      return Response.json({ id: mode === "event_identity_mismatch" ? "evt_test_SYNTHETICWrongId" : id,
        type: "charge.creation.succeeded", data: JSON.stringify(row) });
    }
    if (url.origin === "https://api.culqi.com" && request.method === "GET" && !url.search && !url.hash
      && /^\/v2\/charges\/chr_test_SYNTHETICHttp[A-Z0-9]+$/.test(url.pathname)
      && request.headers.get("authorization") === `Bearer ${process.env.CULQI_SECRET_KEY}`) {
      audit("provider_get");
      const id = url.pathname.split("/").at(-1);
      const row = sql(`select jsonb_build_object('object','charge','id',payment_charge_id,'amount',payment_amount_minor,
        'currency_code',payment_currency,'source',jsonb_build_object('id',payment_charge_source_id),
        'metadata',jsonb_build_object('bagelito_order_code',order_code),'capture',true,
        'current_amount',payment_amount_minor,'amount_refunded',0,'dispute',false,'paid',false,
        'capture_date','opaque-response-unit') from public.orders where payment_charge_id=${quote(id)};`);
      const { mode } = control();
      if (mode === "parallel") {
        audit("provider_wait");
        let timeout;
        await new Promise((resolve) => {
          releaseProvider = resolve; timeout = setTimeout(resolve, 2000);
        });
        clearTimeout(timeout); releaseProvider = undefined;
      }
      if (mode === "provider_fail") return Response.json({ message: "PRIVATE_SYNTHETIC_HTTP_ERROR" }, { status: 500 });
      if (mode === "provider_oversized") return new Response("x".repeat(256 * 1024 + 1));
      if (mode === "provider_malformed") return new Response("{");
      if (!row) throw new Error("Unapproved fixture charge");
      if (mode === "refund") row.amount_refunded = 1;
      if (mode === "dispute") row.dispute = true;
      if (mode === "capture_false") row.capture = false;
      if (mode === "missing_financial") delete row.current_amount;
      if (mode === "source_mismatch") row.source.id = "tkn_test_SYNTHETICWrongSource";
      if (mode === "amount_mismatch") row.amount++;
      if (mode === "stale_attempt") sql(`update public.orders set
        payment_charge_attempt_id='99999999-9999-4999-8999-999999999999' where payment_charge_id=${quote(id)};`, true);
      return Response.json(row);
    }
    throw new Error("Unapproved fixture transport");
  } catch {
    audit("denied");
    throw new Error("Isolated HTTP fixture transport rejected");
  }
};
