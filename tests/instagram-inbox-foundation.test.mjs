import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(
  new URL("../src/app/api/instagram/webhook/route.ts", import.meta.url),
  "utf8",
);
const webhook = await readFile(
  new URL("../src/lib/instagram/webhook.ts", import.meta.url),
  "utf8",
);
const service = await readFile(
  new URL("../src/lib/instagram/service.ts", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../supabase/add-instagram-inbox.sql", import.meta.url),
  "utf8",
);

test("Instagram webhook verifies Meta subscription token and HMAC signature", () => {
  assert.match(route, /hub\.verify_token/);
  assert.match(route, /x-hub-signature-256/);
  assert.match(route, /verifyInstagramWebhookSignature/);
  assert.match(webhook, /createHmac\("sha256"/);
  assert.match(webhook, /timingSafeEqual/);
});

test("Instagram shadow collector is idempotent", () => {
  assert.match(service, /instagram_webhook_events/);
  assert.match(service, /provider_event_key/);
  assert.match(service, /duplicateWebhook/);
  assert.match(migration, /event_key text not null unique/);
  assert.match(migration, /provider_event_key text not null unique/);
});

test("Instagram inbox tables are service-role only with RLS enabled", () => {
  const expectedTables = [
    "instagram_accounts",
    "instagram_contacts",
    "instagram_conversations",
    "instagram_webhook_events",
    "instagram_messages",
    "instagram_ai_runs",
    "instagram_media_assets",
    "instagram_conversation_events",
  ];

  for (const table of expectedTables) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from anon, authenticated`),
    );
  }
});

test("phase 1 cannot send Instagram messages", () => {
  const implementation = [route, webhook, service].join("\n");
  assert.doesNotMatch(implementation, /graph\.facebook\.com/i);
  assert.doesNotMatch(implementation, /graph\.instagram\.com/i);
  assert.doesNotMatch(implementation, /\/messages\b/);
  assert.doesNotMatch(implementation, /access_token/i);
});

test("webhook claims can recover after a stale in-progress delivery", async () => {
  const service = await readFile(
    new URL("../src/lib/instagram/service.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /2 \* 60 \* 1000/);
  assert.match(service, /received_at/);
  assert.match(service, /processing_error/);
});

test("admin inbox is read-only and bilingual-aware", async () => {
  const query = await readFile(
    new URL("../src/lib/admin/instagram-inbox.ts", import.meta.url),
    "utf8",
  );
  const panel = await readFile(
    new URL("../src/app/admin/InstagramInboxPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(query, /detectedLanguage/);
  assert.match(panel, /ES\/EN/);
  assert.match(panel, /Shadow mode/i);
  assert.match(panel, /Read only/i);
  assert.doesNotMatch(panel, /type="submit"/);
});
