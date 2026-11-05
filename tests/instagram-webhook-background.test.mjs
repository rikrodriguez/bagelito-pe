import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../supabase/functions/instagram-webhook/index.ts", import.meta.url),
  "utf8",
);

test("Meta webhook persists/dedupes before acknowledging and processes AI in background", () => {
  const insertPos = source.indexOf('from("instagram_webhook_events")');
  const waitPos = source.indexOf("EdgeRuntime.waitUntil");
  const acceptedPos = source.indexOf("accepted: true");
  assert.ok(insertPos >= 0);
  assert.ok(waitPos > insertPos);
  assert.ok(acceptedPos > waitPos);
});

test("background processing records completion or processing errors", () => {
  assert.match(source, /const backgroundTask = \(async \(\) =>/);
  assert.match(source, /processing_error: null/);
  assert.match(source, /processing_error: errorText/);
  assert.match(source, /instagram_webhook_processing_failed/);
});
