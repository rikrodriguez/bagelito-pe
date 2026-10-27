import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL("../" + path,import.meta.url),"utf8");
const shop=read("src/components/StoreWalkthrough.tsx");
const world=read("src/app/spatial-v3.css");
const checkout=read("src/app/checkout/checkout-bridge.css");
const page=read("src/app/page.tsx");
const checkoutPage=read("src/app/checkout/page.tsx");

test("scene movement and doorway are real interactions, not a decorative slideshow",()=>{
 assert.match(shop,/data-entering=\{entering\}/);
 assert.match(shop,/setEntering\(true\)/);
 assert.match(shop,/window\.setTimeout\(commit, 470\)/);
 assert.match(shop,/aria-pressed=\{scene === s\}/);
 assert.match(world,/data-entering="true".*walk-door-panel\.left/);
 assert.match(world,/walk-door-panel\.right/);
 assert.match(shop,/window\.history\.pushState/);
 assert.match(shop,/window\.addEventListener\("popstate"/);
 assert.match(shop,/querySelector<HTMLElement>\("\.walk-frame\.is-active h1/);
});
test("parallax CSS variables are applied to their actual parent theatre",()=>{
 assert.match(shop,/onPointerMove=\{onMove\}/);
 assert.match(shop,/event\.currentTarget\.style\.setProperty\("--walk-px"/);
 assert.match(shop,/event\.currentTarget\.style\.setProperty\("--walk-py"/);
 assert.doesNotMatch(shop,/stageRef\.current\.style\.setProperty\("--walk-px"/);
 assert.match(world,/--walk-px,0px/);
 assert.match(world,/prefers-reduced-motion/);
});
test("active scenes are naturally sized, not clipped to hard-coded fixed heights",()=>{
 assert.match(world,/walk-theatre\[data-scene="build"\]/);
 assert.match(world,/height: auto !important/);
 assert.match(world,/\.walk-frame\.is-active \{/);
 assert.match(world,/position: relative/);
 assert.match(world,/overflow: visible/);
});
test("products are browsable in a scrollable physical rail, with real box editing",()=>{
 assert.match(shop,/ref=\{rackRef\}/);
 assert.match(shop,/rackRef\.current\?\.scrollBy/);
 assert.match(world,/scroll-snap-type: inline mandatory/);
 assert.match(shop,/ref=\{boxTrayRef\}/);
 assert.match(shop,/\.store-box-slot:not\(\.filled\)/);
 assert.match(shop,/aria-label=\{slug \?/);
 assert.match(shop,/updateFlavor\(slug,-1\)/);
 assert.match(shop,/SHOP_DRAFT_KEY/);
 assert.match(shop,/window\.location\.assign\("\/checkout\?pack="/);
});
test("checkout is visually continuous but the existing financial components remain intact",()=>{
 assert.match(checkoutPage,/ReservationFlow/);
 assert.match(checkoutPage,/checkout-bridge\.css/);
 assert.match(checkout,/\.checkout-page/);
 assert.match(checkout,/\.culqi-preview-pay/);
 assert.match(checkout,/\.checkout-page \.reserve-progress button\.active/);
 assert.match(page,/spatial-v3\.css/);
 assert.doesNotMatch(shop,/fetch\(|createCharge|\/api\/payments\/culqi/);
});
test("mobile does not use opaque fixed overlays on products",()=>{
 assert.doesNotMatch(shop,/className="store-mobile-bag walk-mobile-pocket"/);
 assert.match(world,/body:has\(\.walk-store\) \.floating-whatsapp \{ display: none/);
 assert.match(world,/\.walk-steps button:not\(\.is-active\) span/);
});
