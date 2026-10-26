import test from "node:test";
import assert from "node:assert/strict";
import { sourceModule } from "./helpers/load-ts.mjs";
import { CHECKOUT_LEGAL_VERSION } from "../src/lib/legal-terms.ts";

const catalog = {
  getFlavorBySlug: slug => slug === "plain" ? { slug, name: "Plain" } : null,
  getPackBySlug: slug => slug === "6-single" ? { slug, units: 6, packType: "single" } : null,
  isPackSlug: slug => slug === "6-single",
};
const { culqiReservationPayloadSchema } = sourceModule("src/lib/reservations/schema.ts",{
  "@/lib/catalog": catalog,
  "@/lib/delivery-pricing": {districtOptions:["Miraflores"]},
});
const input={
  packSlug:"6-single",
  items:[{flavorSlug:"plain",quantity:6}],
  customerName:"Synthetic Tester",
  whatsapp:"999999999",
  email:"synthetic@example.invalid",
  deliveryAddress:"Test street number 100",
  district:"Miraflores",
  checkoutSessionId:"00000000-0000-4000-8000-000000000001",
  extraPack:false,
  termsAccepted:true,
  termsVersion:CHECKOUT_LEGAL_VERSION,
};
test("accepted current-version terms and independent marketing preference validate",()=>{
 const result=culqiReservationPayloadSchema.parse({...input,marketingOptIn:false});
 assert.equal(result.termsAccepted,true);
 assert.equal(result.termsVersion,"2026-08-20");
 assert.equal(result.marketingOptIn,false);
});
test("declined, missing and stale policy consent are all rejected",()=>{
 for(const change of [
  {termsAccepted:false},
  {termsAccepted:undefined},
  {termsVersion:"2025-01-01"},
  {termsVersion:undefined},
 ])assert.equal(culqiReservationPayloadSchema.safeParse({...input,...change}).success,false);
});
test("marketing opt-in cannot count as legal consent",()=>{
 assert.equal(culqiReservationPayloadSchema.safeParse({...input,marketingOptIn:true,termsAccepted:false}).success,false);
});
