import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const text = (filename) => readFileSync(path.join(root, filename), "utf8");
const visit = text("src/components/ShopVisit.tsx");
const flow = text("src/app/reserve/ReservationFlow.tsx");
const home = text("src/app/page.tsx");
const imageMap = text("src/data/flavor-images.ts");
const packSource = text("src/data/packs.ts");

test("home continues the current Next app with real shared catalog and original checkout", () => {
  assert.match(home, /import \{ ShopVisit \}/);
  assert.match(home, /getPublicPaymentConfig\(\)\.enabled/);
  assert.match(home, /<Header\s*\/>/);
  assert.match(visit, /import \{ flavors \} from "@\/data\/flavors"/);
  assert.match(visit, /import \{ packs, type PackSlug \} from "@\/data\/packs"/);
  assert.match(visit, /window\.location\.assign\("\/checkout\?pack="/);
  assert.doesNotMatch(visit, /fetch\s*\(|createReservation|\/api\/payments|\/api\/reservations|CulqiCheckoutButton/);
});

test("existing four prices and pack formats remain the only selection options", () => {
  const matches = [...packSource.matchAll(/slug: "(12-mixed|6-mixed|12-single|6-single)"[^}]+?units: (\d+), amount: (\d+), packType: "(mixed|single)"/g)];
  assert.equal(matches.length, 4);
  assert.deepEqual(Object.fromEntries(matches.map(([, slug, units, amount, type]) => [slug, [Number(units), Number(amount), type]])), {
    "12-mixed": [12, 115, "mixed"], "6-mixed": [6, 60, "mixed"],
    "12-single": [12, 100, "single"], "6-single": [6, 50, "single"],
  });
  assert.match(visit, /remaining === 0/);
  assert.match(visit, /pack\.units - total \+ old/);
  assert.match(visit, /Array\.from\(\{ length: pack\.units \}/);
});

test("all catalog entries have real checked-in photographs and the storefront uses those paths", async () => {
  const mapped = [...imageMap.matchAll(/:\s*"(\/images\/bagel-[\w-]+\.webp)"/g)].map((match) => match[1]);
  assert.equal(mapped.length, 10);
  assert.equal(new Set(mapped).size, 10);
  for (const img of mapped) await access(path.join(root, "public", img));
  assert.match(visit, /src=\{flavorImages\[flavor\.slug\]\}/);
  assert.match(visit, /src=\{flavorImages\[slug\]\}/);
});

test("store box selection is restored into the same checkout without personal information", () => {
  const key = "bagelito:shop-box:v1";
  assert.ok(visit.includes(key));
  assert.ok(flow.includes(key));
  assert.match(flow, /draft\.packSlug !== pack\.slug/);
  assert.match(flow, /Number\.isInteger\(rawCount\)/);
  assert.match(flow, /setQuantities\(cleaned\)/);
  assert.match(flow, /setSingleFlavor\(draft\.singleFlavor\)/);
  assert.doesNotMatch(visit, /localStorage\.setItem\([^;]*(?:customerName|whatsapp|email|deliveryAddress)/s);
});

test("review mode is explicit, no simulated payment gets treated as an order", () => {
  assert.match(visit, /batch\.merchantReviewOnly \|\| !paymentEnabled/);
  assert.match(visit, /no orders or payments are created here/);
  assert.match(flow, /getCheckoutSessionId/);
  assert.match(flow, /CulqiCheckoutButton/);
  assert.match(text("src/lib/payments/config.ts"), /process\.env\.BAGELITO_MERCHANT_REVIEW_ONLY !== "true"/);
});

test("brand, accessibility, languages and truth-in-advertising are retained", () => {
  const logo = text("public/images/bagelito-logo.svg");
  assert.match(logo, /#f28d7d/i);
  assert.match(logo, /#0751ae/i);
  assert.match(visit, /aria-live="polite"/);
  assert.match(visit, /aria-modal="true"/);
  assert.match(text("src/app/shop-visit.css"), /prefers-reduced-motion/);
  assert.match(text("src/lib/i18n.ts"), /defaultLocale: Locale = "es"/);
  assert.match(text("src/app/layout.tsx"), /<html lang="es"/);
  assert.doesNotMatch(home, /BatchInfo|PurchaseActivityToast/);
});
