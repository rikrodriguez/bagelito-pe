import test from "node:test";
import assert from "node:assert/strict";
import {loadTs} from "./helpers/load-ts.mjs";
import {readFileSync} from "node:fs";
const view=readFileSync(new URL("../src/components/visit/PhotoVisit.tsx",import.meta.url),"utf8");
const builder=readFileSync(new URL("../src/components/visit/PackVisitBuilder.tsx",import.meta.url),"utf8");
test("Packs selected within the same photographic scene",()=>{
 assert.match(view,/showPacks/);assert.match(view,/PackVisitBuilder/);assert.match(view,/pv-start-packs/);
 assert.match(builder,/flavorImages/);assert.match(builder,/SHOP_DRAFT_KEY/);assert.match(builder,/PACK_VISIT_KEY/);
 assert.doesNotMatch(builder,/\/api\/|fetch\(/);
});
test("Real pack constraints and safe persisted data",()=>{
 const m=loadTs("src/components/visit/PackVisitBuilder.tsx",{
  "@/data/packs":loadTs("src/data/packs.ts"),
  "@/data/flavors":loadTs("src/data/flavors.ts"),
  "@/data/flavor-images":loadTs("src/data/flavor-images.ts"),
  "@/lib/shop-draft":loadTs("src/lib/shop-draft.ts"),
  "next/image":{default:()=>null},
  "lucide-react":{ArrowLeft:()=>null,ArrowRight:()=>null,Check:()=>null,Minus:()=>null,Plus:()=>null,ShoppingBag:()=>null},
});
 assert.equal(typeof m.readPackDraft,"function");
 assert.equal(typeof m.changeFlavor,"function");
 assert.equal(typeof m.packCount,"function");
 assert.equal(m.readPackDraft("{").packSlug,"6-mixed");
 const d=m.readPackDraft(JSON.stringify({version:1,packSlug:"6-mixed",quantities:{"plain":100,"some-random-flavor":4},singleFlavor:""}));
 assert.equal(m.packCount(d),6);
 assert.equal(m.changeFlavor(d,"sesame",1).quantities.sesame,undefined);
 const s=m.readPackDraft(JSON.stringify({version:1,packSlug:"6-single",quantities:{},singleFlavor:"plain"}));
 assert.equal(m.packCount(s),6);
 assert.equal(m.changeFlavor(s,"sesame",1).singleFlavor,"sesame");
});
