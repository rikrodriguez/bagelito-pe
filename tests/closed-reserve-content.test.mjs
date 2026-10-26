import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const src = await readFile(new URL("../src/app/reserve/ReservationFlow.tsx", import.meta.url), "utf8");

test("closed /reserve no longer advertises old order close or delivery dates", () => {
  const start = src.indexOf("if (!batchAvailability.accepting && !checkoutPage)");
  const after = src.slice(start, start + 1700);
  assert.ok(start >= 0);
  assert.match(after, /reserve-closed-card/);
  assert.doesNotMatch(after.slice(after.indexOf("reserve-closed-card"), after.indexOf("</section>")),
    /formatPublicDate\(batchAvailability\.(deliveryDate|ordersCloseAt)\)/);
  assert.match(after, /Próxima apertura por anunciar/);
  assert.match(after, /joinWaitlist/);
});

test("generic batch card shows dates and remaining inventory only when accepting orders", () => {
  const start = src.indexOf("reserve-batch-card");
  const section = src.slice(start, start + 1800);
  assert.ok(start >= 0);
  assert.match(section, /batchAvailability\.accepting \? \(/);
  assert.match(section, /formatPublicDate\(batchAvailability\.ordersCloseAt\)/);
  assert.match(section, /batchAvailability\.remainingPacks/);
  assert.match(section, /Orders are closed; the next batch date has not been announced/);
});

test("checkout summary cannot claim a stale delivery after the batch closes", () => {
  const start = src.indexOf('className="checkout-summary-detail"');
  assert.ok(start >= 0);
  assert.match(src.slice(start - 130, start + 180),
    /batchAvailability\.accepting && batchAvailability\.deliveryDate/);
});
