import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read = async path => readFile(new URL("../"+path,import.meta.url),"utf8");
const [reserve,button,manual,culqi,header,images,paymentConfig] = await Promise.all([
 read("src/app/reserve/ReservationFlow.tsx"),
 read("src/components/payments/CulqiCheckoutButton.tsx"),
 read("src/app/api/reservations/route.ts"),
 read("src/app/api/reservations/culqi/route.ts"),
 read("src/components/Header.tsx"),
 read("src/data/flavor-images.ts"),
 read("src/lib/payments/config.ts")
]);
test("the four-step checkout uses actual photos from the same product catalog",()=>{
 assert.match(reserve,/src=\{flavorImages\[flavor\.slug\]\}/);
 assert.match(reserve,/className="flavor-select-photo"/);
 assert.match(images,/bagel-sesame\.webp/);
 assert.match(images,/bagel-rainbow\.webp/);
 assert.doesNotMatch(reserve,/variant=\{flavor\.variant as BagelVariant\} size="sm" label=\{flavorLabel\}/);
});
test("the merchant checkout review is discoverable from the header",()=>{
 assert.match(header,/className="header-checkout-link"/);
 assert.match(header,/reserveHref\("6-mixed"\)\.replace\("\/reserve", "\/checkout"\)/);
 assert.match(header,/useBatchAvailability/);
 assert.match(reserve,/Review preview — No real payments/);
});
test("the review form never accepts a card, CVV, phone, or OTP input",()=>{
 const start=button.indexOf("{!config.enabled && onDemoComplete ? (");
 const end=button.indexOf(") : !config.enabled ? (",start);
 const body=button.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.doesNotMatch(body,/<input\b/i);
 assert.doesNotMatch(body,/demo-cvv|demo-card-number|demo-approval-code/);
 assert.match(body,/No charges processed/);
 assert.match(body,/return onDemoComplete\(\)/);
 assert.doesNotMatch(body,/prepareCheckout|handleCheckout|onToken|fetch\(/);
 assert.match(body,/Preview S\/\$\{amount\} checkout \(no payment\)/);
});
test("purchase terms must be voluntarily checked before review completion",()=>{
 assert.match(reserve,/const \[termsAccepted, setTermsAccepted\] = useState\(false\)/);
 assert.match(reserve,/id="checkout-terms-consent"/);
 assert.match(reserve,/disabled=\{!termsAccepted\}/);
});
test("review closes new intake while preserving a separate private manual recovery path",()=>{
 assert.match(manual,/BAGELITO_MERCHANT_REVIEW_ONLY/);
 assert.match(manual,/\? await recoverManualReservationForReview\(formData\)/);
 assert.match(manual,/: await createReservation\(formData\)/);
 assert.match(manual,/Cache-Control/);
 assert.match(culqi,/BAGELITO_MERCHANT_REVIEW_ONLY/);
 assert.match(culqi,/status: 503/);
 assert.match(culqi,/Cache-Control/);
});

test("review disables the public checkout without making the presentation flag a settlement guard",()=>{
 const publicConfig=paymentConfig.slice(paymentConfig.indexOf("export function getPublicPaymentConfig"));
 const serverConfig=paymentConfig.slice(0,paymentConfig.indexOf("export function getPublicPaymentConfig"));
 assert.match(publicConfig,/enabled: enabled && process\.env\.BAGELITO_MERCHANT_REVIEW_ONLY !== "true"/);
 assert.doesNotMatch(serverConfig,/BAGELITO_MERCHANT_REVIEW_ONLY/);
});


test("demo remains explicit after commercial approval without claiming live payments",()=>{
 assert.match(reserve,/Los pedidos y pagos online siguen deshabilitados en esta demostración/);
 assert.match(reserve,/Online orders and payments remain disabled in this demonstration/);
 assert.doesNotMatch(reserve,/cuando Culqi apruebe el comercio|Payments activate only after merchant approval/);
});
