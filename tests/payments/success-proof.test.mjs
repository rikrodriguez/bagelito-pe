import test from "node:test";
import assert from "node:assert/strict";
import { readSuccessProof, saveSuccessProof, SUCCESS_PROOF_KEY, checkServerPaymentStatus } from "../../src/lib/payments/success-proof.ts";

const order = "BAG-TEST-1";
const session = "00000000-0000-4000-8000-000000000001";
function storage() {
 const entries = new Map();
 return {getItem: key=>entries.get(key)??null,setItem:(key,value)=>{entries.set(key,value);}};
}
test("confirmation token never enters URL and is stored per tab for at most thirty minutes",()=>{
 const s=storage();
 assert.equal(saveSuccessProof(s,order,session,1000000),true);
 assert.equal(readSuccessProof(s,order,1000001)?.checkoutSessionId,session);
 assert.equal(readSuccessProof(s,"BAG-DIFFERENT",1000001),null);
 assert.equal(readSuccessProof(s,order,1000000+30*60*1000+1),null);
 assert.equal(JSON.stringify(readSuccessProof(s,order,1000001)).includes("card"),false);
});
test("invalid order, UUID, metadata and time cannot be treated as checkout ownership",()=>{
 const s=storage();
 assert.equal(saveSuccessProof(s,order,"not-a-uuid",10),false);
 assert.equal(saveSuccessProof(s,"not-an-order",session,10),false);
 assert.equal(readSuccessProof(s,order,10),null);
 s.setItem(SUCCESS_PROOF_KEY,"{invalid");
 assert.equal(readSuccessProof(s,order,10),null);
 s.setItem(SUCCESS_PROOF_KEY,JSON.stringify({v:1,orderCode:order,checkoutSessionId:session,createdAt:10,privileged:true}));
 assert.equal(readSuccessProof(s,order,11),null);
 s.setItem(SUCCESS_PROOF_KEY,JSON.stringify({v:1,orderCode:order,checkoutSessionId:session,createdAt:100}));
 assert.equal(readSuccessProof(s,order,50),null);
});
test("verified paid state requires server proof, healthy order and no reconciliation",()=>{
 const status={ok:true,paymentStatus:"paid",reconciliationRequired:false,orderStatus:"payment_confirmed"};
 assert.equal(checkServerPaymentStatus(status),"paid");
 for(const bad of [
  {...status,ok:false},{...status,reconciliationRequired:true},
  {...status,reconciliationRequired:undefined},{...status,paymentStatus:"pending"},
  {...status,orderStatus:"cancelled"},{...status,orderStatus:"payment_pending_review"},
  {paymentStatus:"paid",orderStatus:"payment_confirmed"},null,
 ])assert.notEqual(checkServerPaymentStatus(bad),"paid");
 assert.equal(checkServerPaymentStatus({...status,reconciliationRequired:true}),"review");
 assert.equal(checkServerPaymentStatus({...status,orderStatus:"cancelled"}),"review");
});
