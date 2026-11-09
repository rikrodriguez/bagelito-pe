import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createVerifiedDeliveryV2Service,
  DeliveryV2ReviewRequiredError,
  requireVerifiedDeliveryV2,
} from "../src/lib/delivery-v2/server-quote";
import type { TrustedDestinationEvidence } from "../src/lib/delivery-v2/delivery-private-tiers";

const address = "Av. Ejemplo 123, Lima"; // Synthetic CUSTOMER address only
const request = (district = "Lince") => ({
  district,
  deliveryAddress: address,
  addressReference: "Portería",
});
function verified(
  district: string,
  sector?: string,
): TrustedDestinationEvidence {
  return {
    source: "internal-geocode-or-operator",
    verifiedDistrict: district,
    verifiedFullAddress: address,
    ...(sector ? { verifiedSector: sector } : {}),
  };
}

test("unconfigured default verifier requires human review", async () => {
  await assert.rejects(
    requireVerifiedDeliveryV2(request()),
    DeliveryV2ReviewRequiredError,
  );
});
test("trusted Lince address produces approved S/8 without authorizing payment", async () => {
  const quote = createVerifiedDeliveryV2Service(async () => verified("Lince"));
  const result = await quote(request());
  assert.equal(result.feeMinor, 800);
  assert.equal(result.feeSoles, 8);
  assert.equal(result.tariffVersion, "BAGELITO-DELIVERY-2026-11-06-v2");
  assert.equal("paymentStatus" in result, false);
  assert.equal("payable" in result, false);
});
test("trusted Miraflores address has S/10", async () => {
  const quote = createVerifiedDeliveryV2Service(async () => verified("Miraflores"));
  assert.equal((await quote(request("Miraflores"))).feeMinor, 1000);
});
test("La Molina verified far sector has S/20", async () => {
  const quote = createVerifiedDeliveryV2Service(
    async () => verified("La Molina", "La Planicie"),
  );
  assert.equal((await quote(request("La Molina"))).feeMinor, 2000);
});
test("La Molina with no sector verification requires review", async () => {
  const quote = createVerifiedDeliveryV2Service(async () => verified("La Molina"));
  await assert.rejects(
    quote(request("La Molina")),
    DeliveryV2ReviewRequiredError,
  );
});
test("manual remote coverage cannot auto-quote", async () => {
  const quote = createVerifiedDeliveryV2Service(async () => verified("Pucusana"));
  await assert.rejects(quote(request("Pucusana")), DeliveryV2ReviewRequiredError);
});
test("missing destination evidence requires review", async () => {
  const quote = createVerifiedDeliveryV2Service(async () => null);
  await assert.rejects(quote(request()), DeliveryV2ReviewRequiredError);
});
test("invalid street address is rejected before verifier", async () => {
  let called = false;
  const quote = createVerifiedDeliveryV2Service(async () => {
    called = true;
    return verified("Lince");
  });
  await assert.rejects(
    quote({ district: "Lince", deliveryAddress: "" }),
    DeliveryV2ReviewRequiredError,
  );
  assert.equal(called, false);
});
test("browser-injected verification is not passed to resolver", async () => {
  let seen: unknown = null;
  const quote = createVerifiedDeliveryV2Service(async (details) => {
    seen = details;
    return null;
  });
  await assert.rejects(quote({
    ...request(),
    verifiedDestination: verified("Lince"),
    payment_status: "paid",
  } as ReturnType<typeof request>), DeliveryV2ReviewRequiredError);
  assert.deepEqual(seen, request());
});
test("district mismatch is rejected; caller cannot use another district fee", async () => {
  const quote = createVerifiedDeliveryV2Service(async () => verified("Lince"));
  await assert.rejects(quote(request("Miraflores")));
});
test("wrong verified address is rejected before any payment", async () => {
  const quote = createVerifiedDeliveryV2Service(async () => ({
    ...verified("Lince"),
    verifiedFullAddress: "Av. Cliente Distinto 456",
  }));
  await assert.rejects(quote(request()));
});
test("source selection cannot be injected as public verifier", () => {
  assert.throws(
    () => createVerifiedDeliveryV2Service(null as never),
    TypeError,
  );
});
