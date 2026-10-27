import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./helpers/load-ts.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(path.join(root, file), "utf8");
const visit = read("src/components/StoreWalkthrough.tsx");
const page = read("src/app/page.tsx");
const flow = read("src/app/reserve/ReservationFlow.tsx");
const packsFile = read("src/data/packs.ts");
const imagesFile = read("src/data/flavor-images.ts");
const css = read("src/app/walkthrough.css");

test("legacy full walkthrough remains intact while the preview homepage uses the scoped entry flow", () => {
  assert.match(page, /StoreEntryFlow/);
  assert.match(page, /store-entry-flow\.css/);
  assert.doesNotMatch(page, /<StoreWalkthrough/);
  for (const room of ["entry", "counter", "build", "cashier"]) {
    assert.ok(visit.includes('"'+room+'"'), room);
    assert.match(css, new RegExp('walk-'+room));
  }
  assert.doesNotMatch(visit,/fetch\s*\(|\/api\/payments|\/api\/reservations|createReservation/);
});

test("all 10 existing photographed flavors are the real product source", async () => {
  const mapped=[...imagesFile.matchAll(/:\s*"(\/images\/bagel-[\w-]+\.webp)"/g)].map(m=>m[1]);
  assert.equal(mapped.length,10);
  assert.equal(new Set(mapped).size,10);
  for(const image of mapped) await access(path.join(root,"public",image));
  assert.match(visit,/flavors\.map\(\(f\)/);
  assert.match(visit,/src=\{flavorImages\[f\.slug\]\}/);
  assert.match(visit,/src=\{flavorImages\[slug\]\}/);
  assert.doesNotMatch(visit,/Math\.random\(\)/);
});

test("only canonical 6/12 mixed/single boxes and approved amounts", () => {
  const match=[...packsFile.matchAll(/slug: "(12-mixed|6-mixed|12-single|6-single)"[^}]+?units: (\d+), amount: (\d+), packType: "(mixed|single)"/g)];
  assert.deepEqual(Object.fromEntries(match.map(([,slug,units,amount,type])=>[slug,[Number(units),Number(amount),type]])),{
    "12-mixed":[12,115,"mixed"],"6-mixed":[6,60,"mixed"],
    "12-single":[12,100,"single"],"6-single":[6,50,"single"],
  });
  assert.match(visit,/const remaining = Math\.max\(0, pack\.units - count\)/);
  assert.match(visit,/pack\.units - currentTotal \+ old/);
  assert.match(visit,/disabled=\{!canAdd\(f\.slug\)\}/);
  assert.match(visit,/disabled=\{!filled\}/);
  assert.match(visit,/changePack\(option\.slug\)/);
});

test("tactile selection and recovery into original checkout without financial writes", () => {
  assert.match(visit,/const \[flying, setFlying\]/);
  assert.match(visit,/walk-flying-bagel/);
  assert.match(css,/@keyframes walk-fly/);
  assert.match(visit,/SHOP_DRAFT_KEY/);
  assert.match(visit,/SHOP_DRAFT_UPDATED_EVENT/);
  assert.match(visit,/safeDraft/);
  assert.match(visit,/window\.location\.assign\("\/checkout\?pack="/);
  assert.match(flow,/setSingleFlavor\(draft\.singleFlavor\)/);
  assert.match(flow,/setQuantities\(cleaned\)/);
  assert.match(flow,/draft\.district/);
  assert.doesNotMatch(visit,/fetch\s*\(|\/api\/payments|\/api\/reservations|createReservation|CulqiCheckoutButton/);
});

test("no deceptive retail/payment claims and intentional accessible motion", () => {
  assert.match(visit,/merchantReviewOnly \|\| !paymentEnabled/);
  assert.match(visit,/No orders or payments are created/);
  assert.match(visit,/recorrido digital ilustrado|Recorrido digital ilustrado/);
  assert.match(visit,/aria-hidden=\{scene !== "counter"\}/);
  assert.match(visit,/aria-pressed=\{scene === s\}/);
  assert.match(visit,/aria-modal="true"/);
  assert.match(visit,/event\.key === "Escape"/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(visit,/window\.addEventListener\("popstate"/);
  assert.match(visit,/getDeliveryFee\(district\)/);
  assert.doesNotMatch(visit,/Próximo batch|Últimas unidades|clientes comprando ahora/);
});

test("direct checkout still uses the current selected box after scene changes",()=>{
  const {getShopCheckoutHref}=loadTs("src/lib/shop-draft.ts");
  for(const slug of ["6-mixed","12-mixed","6-single","12-single"]){
    assert.equal(getShopCheckoutHref(()=>JSON.stringify({version:1,packSlug:slug})),"/checkout?pack="+slug);
  }
  assert.match(visit,/encodeURIComponent\(packSlug\)/);
  assert.match(read("src/components/Header.tsx"),/SHOP_DRAFT_UPDATED_EVENT/);
});
