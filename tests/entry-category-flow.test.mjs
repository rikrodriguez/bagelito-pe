import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "./helpers/load-ts.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
const read=(p)=>readFileSync(path.join(root,p),"utf8");

test("home is the store journey, not the old four-room walkthrough",()=>{
  const home=read("src/app/page.tsx");
  assert.match(home,/StoreEntryFlow/);
  assert.doesNotMatch(home,/<StoreWalkthrough/);
  assert.match(home,/store-entry-flow\.css/);
});

test("first purchase decision is exactly Packs Combos Schmears",()=>{
  const source=read("src/components/StoreEntryFlow.tsx");
  assert.match(source,/Packs/);
  assert.match(source,/Combos/);
  assert.match(source,/Schmears/);
  assert.doesNotMatch(source,/Sandwich/);
  assert.doesNotMatch(source,/Bebida/);
  assert.doesNotMatch(source,/2 bagels\s*\+\s*1 schmear/i);
  assert.match(source,/Bagels \+ schmears/);
});

test("packs branch asks Grandes or Minis before any flavor selection",()=>{
  const source=read("src/components/StoreEntryFlow.tsx");
  assert.match(source,/Grandes/);
  assert.match(source,/Minis/);
  assert.match(source,/6 o 12 bagels/);
  assert.match(source,/6, 12 o 24 mini bagels/);
  assert.doesNotMatch(source,/changeFlavor|singleFlavor|quantities/);
});

test("progress bar represents the agreed buying journey and supports back",()=>{
  const source=read("src/components/StoreEntryFlow.tsx");
  for(const label of ["Entrada","Categoría","Selecciona","Revisa","Pago"]) assert.ok(source.includes(label),label);
  assert.match(source,/goBack|Volver/);
});

test("first segment is review-only and contains no order/payment API action",()=>{
  const source=read("src/components/StoreEntryFlow.tsx");
  assert.doesNotMatch(source,/fetch\s*\(|\/api\/payments|\/api\/reservations|CulqiCheckoutButton|createReservation/);
  assert.match(source,/No se registran pedidos ni cobros/);
});

test("visual layer supports full viewport and reduced motion",()=>{
  const css=read("src/app/store-entry-flow.css");
  assert.match(css,/100dvh/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/object-fit:\s*cover/);
  assert.match(css,/object-fit:\s*contain/);
  assert.match(css,/background-image:\s*url\("\/images\/store-category-flow\.webp"\)/);
});

test("pure entry flow only allows approved first-segment transitions",()=>{
  const { nextEntryState, categoryOptions, packSizeOptions }=loadTs("src/lib/store-entry-flow.ts");
  assert.deepEqual(categoryOptions.map((item)=>item.id),["packs","combos","schmears"]);
  assert.deepEqual(packSizeOptions.map((item)=>item.id),["large","mini"]);
  assert.equal(nextEntryState("entry","enter"),"categories");
  assert.equal(nextEntryState("categories","packs"),"pack-size");
  assert.equal(nextEntryState("pack-size","back"),"categories");
  assert.equal(nextEntryState("categories","back"),"entry");
  assert.equal(nextEntryState("categories","combos"),"categories");
  assert.equal(nextEntryState("categories","schmears"),"categories");
});

test("entry flow owns the viewport without legacy review or WhatsApp overlays",()=>{
  const css=read("src/app/store-entry-flow.css");
  assert.match(css,/body:has\(\.entry-flow\) \.batch-deadline-banner\s*\{[^}]*display:\s*none/);
  assert.match(css,/body:has\(\.entry-flow\) \.floating-whatsapp\s*\{[^}]*display:\s*none/);
});

test("mobile combo helper copy uses accessible dark blue",()=>{
  const css=read("src/app/store-entry-flow.css");
  assert.match(css,/\.entry-flow-category-hotspot\.combos::after\s*\{[^}]*content:"Bagels \+ schmears"/);
  assert.match(css,/entry-flow-category-hotspot\.packs::after,[\s\S]*color:#4c6684/);
});

test("entry and counter use distinct approved store scenes",()=>{
  const source=read("src/components/StoreEntryFlow.tsx");
  assert.match(source,/store-entry-door\.webp/);
  assert.match(source,/store-category-flow\.webp/);
});

test("approved composition uses the store scene itself as the category interface",()=>{
  const source=read("src/components/StoreEntryFlow.tsx");
  assert.match(source,/entry-flow-category-hotspots/);
  assert.match(source,/entry-flow-entry-hotspot/);
  assert.doesNotMatch(source,/entry-flow-category-grid/);
  assert.doesNotMatch(source,/entry-flow-entry-copy/);
});

test("pack size is integrated into the counter with real product artwork, not a giant modal or fake bagel drawing",()=>{
  const source=read("src/components/StoreEntryFlow.tsx");
  assert.match(source,/entry-flow-pack-selector/);
  assert.match(source,/entry-flow-pack-hotspots/);
  assert.match(source,/pack-6-mixed\.webp/);
  assert.match(source,/bagel-everything\.webp/);
  assert.match(source,/bagel-sesame\.webp/);
  assert.match(source,/bagel-blueberry\.webp/);
  assert.doesNotMatch(source,/entry-flow-size-bagels/);
  assert.doesNotMatch(source,/entry-flow-size-card/);
  assert.doesNotMatch(source,/entry-flow-panel/);
});

test("only lightweight accessible hit areas sit above the approved store artwork",()=>{
  const css=read("src/app/store-entry-flow.css");
  assert.match(css,/\.entry-flow-category-hotspots/);
  assert.match(css,/\.entry-flow-hotspot-label/);
  assert.match(css,/opacity:\s*0/);
  assert.match(css,/pointer-events:\s*auto/);
});
