import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac, webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../supabase/functions/instagram-webhook/index.ts", import.meta.url), "utf8");
const executable = ts.transpileModule(source.replace(/^import .*;\n/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

// Run the real Deno request/background handler and gates. Deterministic draft/judge
// boundaries replace LLM work; persistence and Meta are isolated in-memory doubles.
// No production service or real customer is contacted by this test.
function harness(options = {}) {
  const tables = new Map();
  const rows = (name) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };
  let sequence = 0;
  const settings = {
    id: "default", enabled: true, mode: "test_auto",
    test_recipient_igsids: ["synthetic-allowed"], min_confidence: 0.92,
    auto_intents: ["menu"], max_text_messages: 2, media_enabled: false,
    sales_judge_enabled: true, sales_judge_min_score: 85, ...options.settings
  };
  rows("instagram_runtime_settings").push(settings);
  const unique = {
    instagram_webhook_events: ["event_key"],
    instagram_accounts: ["instagram_user_id"],
    instagram_contacts: ["account_id", "instagram_user_id"],
    instagram_conversations: ["account_id", "contact_id"],
    instagram_messages: ["provider_event_key"]
  };
  const db = {
    storage: { getBucket: async () => ({ data: { id: "synthetic-bucket" } }) },
    from(name) {
      let operation = "select", payload, single = false, limit;
      const filters = [], sort = [];
      const query = {
        select() { return query; },
        insert(value) { operation = "insert"; payload = value; return query; },
        upsert(value) { operation = "upsert"; payload = value; return query; },
        update(value) { operation = "update"; payload = value; return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        order(key, { ascending }) { sort.push({ key, ascending }); return query; },
        limit(value) { limit = value; return query; },
        single() { single = true; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const table = rows(name);
            let selected = table.filter((row) => filters.every((filter) => filter(row)));
            if (operation === "insert" || operation === "upsert") {
              const fields = unique[name] ?? ["id"];
              const existing = table.find((row) => fields.every((key) => row[key] === payload[key]));
              if (existing && operation === "insert") return { data: null, error: { code: "23505" } };
              const row = existing ?? { id: "synthetic-" + ++sequence };
              Object.assign(row, payload);
              if (name === "instagram_conversations") row.mode ??= "review_required";
              if (!existing) table.push(row);
              selected = [row];
            } else if (operation === "update") {
              selected.forEach((row) => Object.assign(row, payload));
            }
            selected = [...selected].sort((a, b) => {
              for (const { key, ascending } of sort) {
                if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1);
              }
              return 0;
            });
            if (limit != null) selected = selected.slice(0, limit);
            // Return a snapshot as PostgREST does, not a mutable DB object.
            return { data: single ? structuredClone(selected[0] ?? null) : structuredClone(selected), error: null };
          }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  const background = [], sends = [], drafts = [], judges = [];
  let handler;
  const context = vm.createContext({
    URL, Request, Response, TextEncoder, crypto: webcrypto,
    console: { log() {}, error() {} },
    createClient: () => db,
    Deno: {
      env: { get: (key) => ({
        INSTAGRAM_APP_SECRET: "synthetic-test-secret",
        INSTAGRAM_ACCOUNT_ID: "synthetic-business",
        OPENAI_API_KEY: "synthetic-test-key",
        INSTAGRAM_ACCESS_TOKEN: "synthetic-test-token",
        SUPABASE_URL: "https://synthetic.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-key"
      })[key] },
      serve: (callback) => { handler = callback; }
    },
    EdgeRuntime: { waitUntil: (promise) => background.push(promise) },
    fetch: async (url, init) => {
      assert.match(String(url), /^https:\/\/graph\.facebook\.com\//);
      sends.push(JSON.parse(init.body));
      return new Response(JSON.stringify(options.sendFailure ? { error: { message: "synthetic provider failure" } } : { message_id: "synthetic-send-" + sends.length }), { status: options.sendFailure ? 500 : 200 });
    },
    draftBoundary: async (input) => {
      drafts.push(input);
      return {
        generated: true, aiRunId: "synthetic-run", intent: "menu",
        confidence: 0.99, risk: "auto", proposedReply: "Dime qué pack prefieres.",
        proposedMessages: ["Dime qué pack prefieres."], proposedMedia: [],
        currentOrder: null, ...options.draft
      };
    },
    judgeBoundary: async (input) => {
      judges.push(input);
      if (options.afterJudge) options.afterJudge({ rows, input });
      return { pass: true, overallScore: 99, issues: [], ...options.judge };
    }
  });
  vm.runInContext(executable, context);
  vm.runInContext("generateShadowDraft = draftBoundary; evaluateSalesDraft = judgeBoundary;", context);
  async function deliver(events, extra = {}) {
    const body = JSON.stringify({ object: "instagram", entry: [{ id: "synthetic-business", messaging: events }], ...extra });
    const signature = createHmac("sha256", "synthetic-test-secret").update(body).digest("hex");
    const response = await handler(new Request("https://synthetic.invalid/webhook", {
      method: "POST", headers: { "x-hub-signature-256": "sha256=" + signature }, body
    }));
    await Promise.all(background.splice(0));
    return { status: response.status, body: await response.json() };
  }
  return { rows, sends, drafts, judges, deliver };
}

function inbound(mid, text, extra = {}) {
  return {
    sender: { id: "synthetic-allowed" }, recipient: { id: "synthetic-business" },
    timestamp: 1700000000000, message: { mid, ...(text === undefined ? {} : { text }), ...extra }
  };
}
function assertProcessed(h) {
  assert.equal(h.rows("instagram_webhook_events").length, 1);
  assert.equal(h.rows("instagram_webhook_events")[0].processing_error, null);
}

test("ordinary text reaches judge and sends once without the out-of-scope ReferenceError", async () => {
  const h = harness();
  assert.equal((await h.deliver([inbound("text", "Hola, menú")])).status, 200);
  assertProcessed(h);
  assert.equal(h.judges.length, 1);
  assert.equal(h.sends.length, 1);
});

test("custom request remains held before judge even with an otherwise safe draft", async () => {
  const h = harness();
  await h.deliver([inbound("custom", "Es para un cumpleaños")]);
  assertProcessed(h);
  assert.equal(h.judges.length, 0);
  assert.equal(h.sends.length, 0);
});

test("image-only and missing media text process safely with review fallback", async () => {
  for (const attachments of [[{ type: "image", payload: {} }], []]) {
    const h = harness({ draft: { risk: "review" } });
    await h.deliver([inbound("image", undefined, { attachments })]);
    assertProcessed(h);
    assert.equal(h.rows("instagram_messages")[0].text_content, null);
    assert.equal(h.sends.length, 0);
  }
});

test("burst events use their own text; a custom event cannot inherit the ordinary event gate", async () => {
  const h = harness();
  await h.deliver([
    inbound("first", "Hola, menú"),
    inbound("second", "birthday custom shape")
  ]);
  assertProcessed(h);
  assert.equal(h.drafts.length, 2);
  assert.equal(h.judges.length, 1);
  assert.equal(h.sends.length, 1);
});

test("duplicate payload and repeated MID never produce a second reply", async () => {
  const h = harness();
  const event = inbound("duplicate", "Hola, menú");
  await h.deliver([event]);
  assert.equal((await h.deliver([event])).body.duplicate, true);
  await h.deliver([event], { syntheticRetryEnvelope: true });
  assert.equal(h.rows("instagram_messages").length, 1);
  assert.equal(h.drafts.length, 1);
  assert.equal(h.sends.length, 1);
});

test("provider failure stays recorded and exact-payload retry suppresses a resend", async () => {
  const h = harness({ sendFailure: true });
  const event = inbound("provider-error", "Hola, menú");
  await h.deliver([event]);
  assertProcessed(h);
  assert.equal(h.rows("instagram_conversation_events").some((row) => row.event_type === "auto_send_error"), true);
  assert.equal((await h.deliver([event])).body.duplicate, true);
  await h.deliver([event], { syntheticRetryEnvelope: true });
  assert.equal(h.drafts.length, 1);
  assert.equal(h.sends.length, 1);
});

test("outbound missing media is skipped while the text reply remains successful", async () => {
  const h = harness({
    settings: { media_enabled: true, max_media: 1 },
    draft: { proposedMedia: [{ sendable: true, asset_key: "synthetic-missing" }] }
  });
  await h.deliver([inbound("missing-outbound-media", "Hola, menú")]);
  assertProcessed(h);
  assert.equal(h.sends.length, 1);
  assert.deepEqual(h.sends[0].message, { text: "Dime qué pack prefieres." });
  assert.equal(h.rows("instagram_outbound_sends").length, 1);
  assert.equal(h.rows("instagram_outbound_sends")[0].kind, "text");
});

test("judge hold is a safe fallback with no attempted send", async () => {
  const h = harness({ judge: { pass: false, issues: ["judge_error"] } });
  await h.deliver([inbound("judge-error", "Hola, menú")]);
  assertProcessed(h);
  assert.equal(h.judges.length, 1);
  assert.equal(h.sends.length, 0);
  assert.equal(h.rows("instagram_conversation_events")[0].reason, "sales_judge_needs_review");
});

test("human takeover during judge work prevents sending", async () => {
  const h = harness({ afterJudge: ({ rows }) => { rows("instagram_conversations")[0].mode = "human_active"; } });
  await h.deliver([inbound("human", "Hola, menú")]);
  assertProcessed(h);
  assert.equal(h.sends.length, 0);
  assert.equal(h.rows("instagram_conversation_events")[0].reason, "stale_conversation_needs_review");
});

test("newer inbound during judge work prevents a stale send", async () => {
  const h = harness({ afterJudge: ({ rows }) => {
    rows("instagram_messages").push({ id: "newer", direction: "inbound", conversation_id: rows("instagram_conversations")[0].id, sent_at: "2030-01-01T00:00:00Z" });
  } });
  await h.deliver([inbound("stale", "Hola, menú")]);
  assertProcessed(h);
  assert.equal(h.sends.length, 0);
});

test("test_auto never sends to a recipient outside its existing allowlist", async () => {
  const h = harness();
  const event = inbound("outside", "Hola, menú");
  event.sender.id = "synthetic-not-allowed";
  await h.deliver([event]);
  assertProcessed(h);
  assert.equal(h.judges.length, 0);
  assert.equal(h.sends.length, 0);
});
