import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const shadow = await readFile(
  new URL("../src/lib/instagram/shadow.ts", import.meta.url),
  "utf8",
);
const route = await readFile(
  new URL("../src/app/api/admin/instagram/shadow/route.ts", import.meta.url),
  "utf8",
);
const liveContext = await readFile(
  new URL("../src/lib/instagram/live-context.ts", import.meta.url),
  "utf8",
);

test("shadow generation never sends an Instagram message", () => {
  assert.doesNotMatch(shadow, /graph\.facebook\.com/i);
  assert.doesNotMatch(route, /graph\.facebook\.com/i);
  assert.doesNotMatch(route, /\/messages\b/i);
  assert.match(route, /execution_mode: "shadow"/);
  assert.match(route, /shadowMode: true/);
});

test("shadow generation uses current Bagelito facts instead of historical prices", () => {
  assert.match(liveContext, /from\("batches"\)/);
  assert.match(liveContext, /from\("orders"\)/);
  assert.match(liveContext, /getDeliveryFee/);
  assert.match(liveContext, /flavors\.map/);
  assert.match(liveContext, /packs\.map/);
  assert.match(shadow, /operational facts must come ONLY from LIVE_FACTS/);
});

test("model calls use structured output and disable response storage", () => {
  assert.match(shadow, /type: "json_schema"/);
  assert.match(shadow, /strict: true/);
  assert.match(shadow, /store: false/);
});

test("shadow admin endpoint requires the existing admin session", () => {
  assert.match(route, /createAdminToken/);
  assert.match(route, /getAdminCookieName/);
  assert.match(route, /status: 401/);
});
