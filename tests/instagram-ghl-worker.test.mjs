import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(
  new URL("../supabase/functions/instagram-ghl-sync/index.ts", import.meta.url),
  "utf8",
);

test("IG-only contacts use create-contact instead of upsert", () => {
  assert.match(worker, /const hasEmailOrPhone/);
  assert.match(worker, /path: "\/contacts\/"/);
  assert.match(worker, /path: "\/contacts\/upsert"/);
});

test("IG-only contact creation checks deterministic contact name before creating", () => {
  assert.match(worker, /path: "\/contacts\/search"/);
  assert.match(worker, /contactName/);
  assert.match(worker, /instagramUserIdFieldId/);
});
