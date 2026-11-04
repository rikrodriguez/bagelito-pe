import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const webhook=await readFile(new URL("../supabase/functions/instagram-webhook/index.ts",import.meta.url),"utf8");

test("AUTO validates the latest inbound after judge evaluation",()=>{
  assert.match(webhook,/async function isConversationFreshForAuto/);
  assert.match(webhook,/latestInbound\.id !== triggeringMessageId/);
});
test("human takeover and newer outbound make auto stale",()=>{
  assert.match(webhook,/currentConversation\.mode === "human_active"/);
  assert.match(webhook,/lastOutboundAt > triggeredAt/);
});
test("freshness gate is part of safeForAuto, not merely diagnostic",()=>{
  assert.match(webhook,/const preSendFresh =/);
  assert.match(webhook,/const safeForAuto = baseAutoCandidate && salesJudge\.pass && preSendFresh/);
  assert.match(webhook,/stale_conversation_needs_review/);
});
