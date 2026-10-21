// Transport-only preload for the native Next HTTP fixture. It never replaces
// application source, the capture parser, hosting guards, or the SQL function.
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const container = process.env.CULQI_HTTP_FIXTURE_CONTAINER;
const directory = process.env.CULQI_HTTP_FIXTURE_DIRECTORY;
if (!/^bagelito-admin-status-http-[a-f0-9]{16}$/.test(container ?? "")
  || !directory?.startsWith("/tmp/bagelito-admin-status-http-")) throw new Error("Invalid isolated HTTP fixture");
const qa = "https://qaahskendqdkynwtylho.supabase.co";
const auditFile = `${directory}/audit.jsonl`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fixtureCodes = new Set(["BAG-000001", "BAG-000002", "BAG-000003", "BAG-000004", "BAG-000099"]);
const approvedCodes = new Set(["BAG-000001", "BAG-000002", "BAG-000004"]);
const columns = {
  orders: new Set(["id", "batch_id", "checkout_session_id", "order_code", "total_amount", "status",
    "payment_provider", "payment_lane", "payment_order_id", "payment_charge_id", "payment_charge_attempt_id",
    "payment_charge_source_id", "payment_amount_minor", "payment_currency", "payment_charge_state", "payment_status",
    "payment_expires_at", "payment_paid_at", "payment_reconciliation_required", "payment_reconciliation_reason"]),
  payment_attempts: new Set(["id", "order_id", "provider", "provider_order_id", "provider_charge_id",
    "amount_minor", "currency_code", "status", "expires_at", "paid_at"]),
};
function audit(kind, detail = {}) { appendFileSync(auditFile, `${JSON.stringify({ kind, ...detail })}\n`, { mode: 0o600 }); }
function sql(statement) {
  try {
    const text = execFileSync("docker", ["--config", `${directory}/docker-config`, "exec", "-i", container,
      "/usr/lib/postgresql/17/bin/psql", "-X", "-qAt", "-h", "/tmp", "-U", "postgres", "-d", "bagelito_test",
      "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      input: `set role service_role; set search_path=pg_catalog,public; ${statement}`,
      encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, DOCKER_HOST: "unix:///var/run/docker.sock" },
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return text ? JSON.parse(text) : null;
  } catch { throw new Error("Isolated fixture database operation failed"); }
}
function checkedUuid(value) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("Invalid fixture binding");
  return `${quote(value)}::uuid`;
}
function layoutRows(url, headers) {
  // These three exact projections are the existing shared root layout's reads.
  // They expose only isolated synthetic rows and cannot insert a default batch.
  const projection = url.searchParams.get("select");
  const params = [...url.searchParams];
  let statement;
  if (url.pathname === "/rest/v1/batches"
    && projection === "id,name,status,orders_open_at,orders_close_at,delivery_date,capacity_packs,capacity_bagels"
    && params.length === 3 && url.searchParams.get("order") === "created_at.desc" && url.searchParams.get("limit") === "1") {
    statement = `select ${projection} from public.batches order by created_at desc limit 1`;
  } else if (url.pathname === "/rest/v1/orders"
    && projection === "pack_units,status,payment_provider,payment_status,payment_expires_at"
    && params.length === 3 && url.searchParams.get("batch_id")?.startsWith("eq.")
    && url.searchParams.get("status") === "neq.cancelled") {
    statement = `select ${projection} from public.orders where batch_id=${checkedUuid(url.searchParams.get("batch_id").slice(3))}
      and status<>'cancelled' and order_code in ('BAG-000001','BAG-000002','BAG-000003','BAG-000004','BAG-000099')`;
  } else if (url.pathname === "/rest/v1/orders" && projection === "district,pack_slug,pack_name,created_at,payment_paid_at"
    && params.length === 5 && url.searchParams.get("order") === "created_at.desc" && url.searchParams.get("limit") === "16"
    && url.searchParams.get("or") === "(payment_status.eq.paid,status.in.(payment_confirmed,in_production,ready_for_delivery,delivered))"
    && /^gte\.\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(url.searchParams.get("created_at") ?? "")
    && Number.isFinite(Date.parse(url.searchParams.get("created_at").slice(4)))) {
    statement = `select ${projection} from public.orders where created_at>=${quote(url.searchParams.get("created_at").slice(4))}::timestamptz
      and (payment_status='paid' or status in ('payment_confirmed','in_production','ready_for_delivery','delivered'))
      and order_code in ('BAG-000001','BAG-000002','BAG-000003','BAG-000004','BAG-000099') order by created_at desc limit 16`;
  } else return null;
  const rows = sql(`select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (${statement}) r;`);
  audit("layout_select");
  if (headers.get("accept")?.includes("vnd.pgrst.object+json")) {
    return rows.length === 1 ? Response.json(rows[0])
      : Response.json({ code: "PGRST116", message: "Synthetic missing row" }, { status: 406 });
  }
  return Response.json(rows);
}
function pageRows(url, headers) {
  // The exact existing administrative projection has a fixture-only, read-only
  // interpretation. All rows and relations are synthetic local SQL records.
  const params = [...url.searchParams];
  const code = url.searchParams.get("order_code");
  const byCode = params.length === 2 && code?.startsWith("eq.") && fixtureCodes.has(code.slice(3));
  const listing = params.length === 2 && url.searchParams.get("order") === "created_at.desc";
  if ((!byCode && !listing) || params.some(([key]) => !["select", "order_code", "order"].includes(key))) {
    throw new Error("Unapproved fixture page query");
  }
  const rows = sql(`select coalesce(jsonb_agg(r.value),'[]'::jsonb) from (
    select to_jsonb(o) || jsonb_build_object(
      'order_items',coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id=o.id),'[]'::jsonb),
      'order_status_history',coalesce((select jsonb_agg(to_jsonb(h)) from public.order_status_history h where h.order_id=o.id),'[]'::jsonb)) value
    from public.orders o where o.order_code in ('BAG-000001','BAG-000002','BAG-000003','BAG-000004','BAG-000099')
      ${byCode ? `and o.order_code=${quote(code.slice(3))}` : ""} order by o.created_at desc) r;`);
  audit("page_select");
  if (headers.get("accept")?.includes("vnd.pgrst.object+json")) {
    return rows.length === 1 ? Response.json(rows[0])
      : Response.json({ code: "PGRST116", message: "Synthetic missing row" }, { status: 406 });
  }
  return Response.json(rows);
}
function selected(url, headers) {
  const table = url.pathname.slice("/rest/v1/".length);
  const layout = layoutRows(url, headers);
  if (layout) return layout;
  if (table === "orders" && url.searchParams.get("select") === "*,order_items(*),order_status_history(*)") {
    return pageRows(url, headers);
  }
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
    } else if (key === "order_code" && fixtureCodes.has(raw)) {
      predicates.push(`${key}=${quote(raw)}`); bindings.add(key);
    } else if (key === "provider" && raw === "culqi") predicates.push(`${key}='culqi'`);
    else throw new Error("Unapproved fixture binding");
  }
  const administrativePair = table === "orders" && fields.join(",") === "order_code,checkout_session_id"
    && [...url.searchParams].length === 2 && approvedCodes.has(url.searchParams.get("order_code")?.slice(3));
  if (table === "orders" && !administrativePair && (!bindings.has("checkout_session_id") || !bindings.has("order_code") && !bindings.has("id"))
    || table === "payment_attempts" && !bindings.has("order_id")) throw new Error("Owned fixture pair is required");
  const limit = Number(url.searchParams.get("limit") ?? 4);
  const rows = sql(`select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from
    (select ${fields.join(",")} from public.${table} where ${predicates.join(" and ")} limit ${limit}) r;`);
  audit(administrativePair ? "admin_pair_select" : "select");
  if (headers.get("accept")?.includes("vnd.pgrst.object+json")) {
    return rows.length === 1 ? Response.json(rows[0])
      : Response.json({ code: "PGRST116", message: "Synthetic missing row" }, { status: 406 });
  }
  return Response.json(rows);
}
function rpc(name, body, headers) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Unapproved fixture RPC body");
  const keys = Object.keys(body).sort().join(",");
  if (name === "consume_api_rate_limit") {
    if (keys !== "p_identifier,p_limit,p_scope,p_window_seconds"
      || !/^culqi_status[a-z_]{0,70}$/.test(body.p_scope)
      || !/^[A-Za-z0-9_:-]{1,100}$/.test(body.p_identifier)
      || !Number.isSafeInteger(body.p_limit) || body.p_limit < 1 || body.p_limit > 1000
      || !Number.isSafeInteger(body.p_window_seconds) || body.p_window_seconds < 1 || body.p_window_seconds > 3600) {
      throw new Error("Unapproved fixture budget");
    }
    audit("rate");
    const rows = sql(`select jsonb_agg(to_jsonb(r)) from public.consume_api_rate_limit(${quote(body.p_scope)},
      ${quote(body.p_identifier)},${body.p_limit},${body.p_window_seconds}) r;`);
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
  const statement = `select public.confirm_culqi_status_charge_get(${checkedUuid(body.p_order_id)},
    ${checkedUuid(body.p_checkout_session_id)},${checkedUuid(body.p_payment_attempt_id)},${checkedUuid(body.p_charge_attempt_id)},
    ${quote(body.p_contract_marker)},${quote(body.p_observed_at)}::timestamptz,${quote(JSON.stringify(body.p_observation))}::jsonb);`;
  try { return Response.json(sql(statement)); }
  catch { return Response.json({ code: "P0001", message: "PRIVATE_SYNTHETIC_HTTP_ERROR" }, { status: 400 }); }
}
globalThis.fetch = async (input, init) => {
  let deniedUrl;
  try {
    const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
    const url = new URL(request.url);
    deniedUrl = { origin: url.origin, pathname: url.pathname, method: request.method };
    if (url.origin === qa && !url.username && !url.password && !url.hash) {
      if (request.headers.get("authorization") !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
        throw new Error("Unapproved fixture authorization");
      }
      if (request.method === "GET" && ["/rest/v1/orders", "/rest/v1/payment_attempts", "/rest/v1/batches"].includes(url.pathname)) {
        return selected(url, request.headers);
      }
      if (request.method === "POST" && /^\/rest\/v1\/rpc\/[a-z_]+$/.test(url.pathname) && !url.search) {
        return rpc(url.pathname.split("/").at(-1), await request.json(), request.headers);
      }
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
      if (!row) throw new Error("Unapproved fixture charge");
      return Response.json(row);
    }
    throw new Error("Unapproved fixture transport");
  } catch (error) {
    audit("denied", { ...deniedUrl, reason: error instanceof Error ? error.message : "Unknown fixture transport" });
    throw new Error("Isolated HTTP fixture transport rejected");
  }
};
