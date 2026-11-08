/** Offline pre-check only. Inputs must be server-authenticated snapshots, never raw client payloads. */
export function evaluateCheckoutReadiness({items, catalog, delivery, customer, paymentEnabled=false, trustedSnapshot=false, maxItems=100}={}) {
  const reasons=[];
  if(trustedSnapshot!==true) reasons.push('UNTRUSTED_SNAPSHOT');
  if(!Array.isArray(items)||items.length===0) reasons.push('EMPTY_CART');
  const known = catalog && typeof catalog==='object' && !Array.isArray(catalog) ? catalog : {};
  const seen=new Set();
  let totalQuantity=0;
  for(const item of Array.isArray(items)?items:[]) {
    if(!item || typeof item.sku!=='string' || !item.sku.trim() || !Number.isSafeInteger(item.quantity) || item.quantity<=0) {reasons.push('INVALID_LINE');continue;}
    if(seen.has(item.sku)) reasons.push('DUPLICATE_SKU');
    seen.add(item.sku);
    totalQuantity+=item.quantity;
    const product=Object.hasOwn(known,item.sku)?known[item.sku]:null;
    if(!product || typeof product!=='object') {reasons.push('UNKNOWN_SKU');continue;}
    if(product.available!==true) reasons.push('UNCONFIRMED_AVAILABILITY');
    if(!Number.isSafeInteger(product.priceCents)||product.priceCents<0) reasons.push('UNAPPROVED_PRICE');
    if(!Number.isSafeInteger(product.maxQuantity)||product.maxQuantity<=0||item.quantity>product.maxQuantity) reasons.push('QUANTITY_NOT_VERIFIED');
  }
  if(!Number.isSafeInteger(maxItems)||maxItems<=0||totalQuantity>maxItems) reasons.push('CAPACITY_NOT_VERIFIED');
  if(delivery?.addressVerified!==true || delivery?.tariffVerified!==true || !Number.isSafeInteger(delivery?.feeCents) || delivery.feeCents<0) reasons.push('DELIVERY_NOT_VERIFIED');
  if(customer?.transactionalContactAllowed!==true) reasons.push('TRANSACTIONAL_CONTACT_UNVERIFIED');
  // Marketing opt-in is intentionally NOT required to purchase.
  if(paymentEnabled!==true) reasons.push('PAYMENTS_DISABLED');
  return Object.freeze({ready:reasons.length===0,reasons:Object.freeze([...new Set(reasons)])});
}
