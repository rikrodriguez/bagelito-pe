import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const playbook=await readFile(
  new URL("../src/lib/instagram/sales-playbook.ts",import.meta.url),
  "utf8"
);

test("objection playbook answers clear blockers before asking more questions",()=>{
  assert.match(playbook,/If the blocker is already explicit, answer directly/);
  assert.match(playbook,/If district is known, answer the fee\/coverage directly/);
  assert.match(playbook,/Otherwise answer feasibility from current batch\/schedule facts first/);
});

test("historical human exceptions never become automatic policy",()=>{
  assert.match(playbook,/50\/50 payment arrangements/);
  assert.match(playbook,/rush production/);
  assert.match(playbook,/always require current live approval/i);
});

test("choice overload receives a focused recommendation, not the full menu",()=>{
  assert.match(playbook,/Recommend 2–3 live options/);
  assert.match(playbook,/Repeat the full catalog/);
});
