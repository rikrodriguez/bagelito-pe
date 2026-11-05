import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ordersRoute = await readFile(
  new URL("../src/app/api/admin/instagram/orders/route.ts", import.meta.url),
  "utf8",
);
const verifyRoute = await readFile(
  new URL("../src/app/api/admin/instagram/orders/[draftId]/verify-yape/route.ts", import.meta.url),
  "utf8",
);

test("Instagram sales operations feed requires the existing admin session", () => {
  assert.match(ordersRoute, /createAdminToken/);
  assert.match(ordersRoute, /getAdminCookieName/);
  assert.match(ordersRoute, /status: 401/);
  assert.match(ordersRoute, /instagram_sales_pipeline/);
  assert.match(ordersRoute, /instagram_production_requirements/);
  assert.match(ordersRoute, /instagram_crm_sync_health/);
});

test("Yape verification requires admin auth and the verified-payment RPC", () => {
  assert.match(verifyRoute, /createAdminToken/);
  assert.match(verifyRoute, /getAdminCookieName/);
  assert.match(verifyRoute, /verify_instagram_yape_order/);
  assert.match(verifyRoute, /p_verified_by/);
  assert.match(verifyRoute, /status: 401/);
  assert.match(verifyRoute, /status: knownConflict \? 409 : 500/);
});

test("Yape verification requests GHL synchronization after success", () => {
  assert.match(verifyRoute, /functions\/v1\/instagram-ghl-sync/);
  assert.match(verifyRoute, /authorization: `Bearer \$\{serviceRole\}`/);
  assert.match(verifyRoute, /body: JSON\.stringify\(\{ limit: 10 \}\)/);
});
