import { strict as assert } from "node:assert";
import { test } from "node:test";
import { POST } from "../src/app/api/delivery/preview/route";

function send(body: unknown, type = "application/json") {
  return POST(new Request("http://localhost/api/delivery/preview", {
    method: "POST",
    headers: { "Content-Type": type },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}
test("Lince estimate is S/8 but never a payable quote", async () => {
  const response = await send({ district: "Lince" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.delivery.estimatedFeeMinor, 800);
  assert.equal(body.delivery.payable, false);
  assert.equal(body.delivery.totalMinor, null);
  assert.equal(body.delivery.deliveryMinor, null);
  assert.equal(body.delivery.tariffVersion, "BAGELITO-DELIVERY-2026-11-06-v2");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
test("far district still only shows an estimate", async () => {
  const response = await send({ district: "La Molina" });
  const json = await response.json();
  assert.equal(json.delivery.estimatedFeeMinor, 1500);
  assert.equal(json.delivery.payable, false);
});
test("remote districts require manual pricing", async () => {
  const response = await send({ district: "Pucusana" });
  const json = await response.json();
  assert.equal(json.delivery.estimatedFeeMinor, null);
  assert.equal(json.delivery.reason, "MANUAL_DELIVERY_REVIEW");
});
test("unknown district gets a safe 422", async () => {
  assert.equal((await send({ district: "No existe" })).status, 422);
});
test("forged price or destination proof in payload is rejected", async () => {
  for (const body of [
    { district: "Lince", deliveryMinor: 0 },
    { district: "Lince", verifiedDestination: { source: "internal-geocode-or-operator" } },
    { district: "Lince", payable: true },
    { district: "Lince", customerAddress: "Calle inventada 123" },
  ]) {
    assert.equal((await send(body)).status, 400);
  }
});
test("invalid JSON, missing or wrong media type blocked", async () => {
  assert.equal((await send("not-json")).status, 400);
  assert.equal((await send({ district: "Lince" }, "text/plain")).status, 415);
  assert.equal((await send({ district: "Lince" }, "")).status, 415);
});
test("oversized request rejected with 413", async () => {
  assert.equal((await send({ district: "X".repeat(1200) })).status, 413);
});
test("prototype or shape tricks are rejected", async () => {
  for (const body of [null, [], { district: { toString: "Lince" } }, {}]) {
    assert.equal((await send(body)).status, 400);
  }
});
test("response never includes kitchen origin or coordinates", async () => {
  const response = await send({ district: "Miraflores" });
  const body = JSON.stringify(await response.json());
  assert.equal(body.includes('"origin"'), false);
  assert.equal(body.includes('"coordinates"'), false);
  assert.equal(body.includes('"deliveryAddress"'), false);
});
