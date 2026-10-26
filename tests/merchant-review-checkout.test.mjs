import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read = async path => readFile(new URL("../"+path,import.meta.url),"utf8");
const [reserve,button,manual,culqi,header,images] = await Promise.all([
 read("src/app/reserve/ReservationFlow.tsx"),
 read("src/components/payments/CulqiCheckoutButton.tsx"),
 read("src/app/api/reservations/route.ts"),
 read("src/app/api/reservations/culqi/route.ts"),
 read("src/components/Header.tsx"),
 read("src/data/flavor-images.ts")
]);
test("the four-step checkout uses actual photos from the same product catalog",()=>{
 assert.match(reserve,/src=\{flavorImages\[flavor\.slug\]\}/);
 assert.match(reserve,/className="flavor-select-photo"/);
 assert.match(images,/bagel-sesame\.webp/);
 assert.match(images,/bagel-rainbow\.webp/);
 assert.doesNotMatch(reserve,/variant=\{flavor\.variant as BagelVariant\} size="sm" label=\{flavorLabel\}/);
});
test("the merchant checkout review is discoverable from the header",()=>{
 assert.match(header,/href="\/checkout\?pack=6-mixed"/);
 assert.match(header,/useBatchAvailability/);
 assert.match(reserve,/Review preview — No real payments/);
});
test("the review form never accepts a card, CVV, phone, or OTP input",()=>{
 const start=button.indexOf("{showDemo ? (");
 const end=button.indexOf(") : showLockedPreview ? (",start);
 const body=button.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.doesNotMatch(body,/<input\b/i);
 assert.doesNotMatch(body,/demo-cvv|demo-card-number|demo-approval-code/);
 assert.match(body,/No charges processed/);
 assert.match(body,/onSubmit=\{handleDemoSubmit\}/);
 assert.match(body,/Preview S\/\$\{amount\} checkout \(no payment\)/);
});
test("purchase terms must be voluntarily checked before review completion",()=>{
 assert.match(reserve,/useState\(false\)/);
 assert.match(reserve,/id="bagelito-purchase-terms"/);
 assert.match(reserve,/disabled=\{!termsAccepted\}/);
});
test("backend denies all public order creation while review-only flag is on",()=>{
 for(const route of [manual,culqi]){
   assert.match(route,/BAGELITO_MERCHANT_REVIEW_ONLY/);
   assert.match(route,/status: 503/);
   assert.match(route,/Cache-Control/);
 }
});
