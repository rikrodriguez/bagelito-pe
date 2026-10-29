import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

function reviewEnvironment(t) {
  const values = {
    BAGELITO_MERCHANT_REVIEW_ONLY: "true",
    PAYMENT_PROVIDER: "culqi",
    CULQI_ENABLED: "true",
    NEXT_PUBLIC_CULQI_PUBLIC_KEY: "synthetic-public-key",
    NEXT_PUBLIC_CULQI_RSA_ID: "synthetic-rsa-id",
    NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY: "synthetic-rsa-public-key",
    CULQI_SECRET_KEY: "synthetic-secret-not-a-provider-key",
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("review mode disables configured provider and excludes secret from public config", t => {
  reviewEnvironment(t);
  const { getPaymentConfig, getPublicPaymentConfig, assertCulqiEnabled } = loadTs("src/lib/payments/config.ts");
  assert.equal(getPaymentConfig().enabled, false);
  assert.equal(getPaymentConfig().hasSecretKey, true);
  assert.equal(getPublicPaymentConfig().enabled, false);
  assert.equal(Object.hasOwn(getPublicPaymentConfig(), "hasSecretKey"), false);
  assert.ok(!JSON.stringify(getPublicPaymentConfig()).includes(process.env.CULQI_SECRET_KEY));
  assert.throws(assertCulqiEnabled, /not enabled/);
});

for (const route of ["src/app/api/reservations/route.ts", "src/app/api/reservations/culqi/route.ts"]) {
  test(`${route} denies review requests before body parsing or any I/O`, async t => {
    reviewEnvironment(t);
    let boundaryCalls = 0;
    const forbidden = () => { boundaryCalls++; throw new Error("I/O must not be reached"); };
    const { POST } = loadTs(route, {
      "@/lib/monitoring": { getDurationMs: forbidden, getRequestId: forbidden, logError: forbidden, logInfo: forbidden, logWarn: forbidden },
      "@/lib/public-api-security": { PublicApiError: class extends Error {}, enforcePublicApiSecurity: forbidden },
      "@/lib/server-analytics": { trackBagelitoServerEvent: forbidden },
      "@/lib/reservations/service": { createReservation: forbidden, createCulqiReservation: forbidden },
      "@/lib/payments": { getPaymentConfig: forbidden },
    });
    const response = await POST({ formData: forbidden, json: forbidden });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).ok, false);
    assert.equal(boundaryCalls, 0);
  });
}
