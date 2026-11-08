/** Offline checkout readiness gate. Pure function: no payment, CRM or inventory writes. */
export function evaluateCheckoutReadiness({items, catalog, delivery, customer, paymentEnabled=false}) {
  const reasons=[];
  if (!Array.isArray(items)||items.length===0) reasons.push('EMPTY_CART');
  const known = catalog && typeof catalog==='object' ? catalog : {};
  for(const item of Array.isArray(items)?items:[]) {
    if(!item || typeof item.sku!=='string' || !Number.isInteger(item.quantity) || item.quantity<=0) {reasons.push('INVALID_LINE');continue;}
    const product=known[item.sku];
    if(!product) {reasons.push('UNKNOWN_SKU');continue;}
    if(product.available!==true) reasons.push('UNCONFIRMED_AVAILABILITY');
    if(!Number.isInteger(product.priceCents)||product.priceCents<0) reasons.push('UNAPPROVED_PRICE');
  }
  if(delivery?.addressVerified!==true || !Number.isInteger(delivery?.feeCents) || delivery.feeCents<0) reasons.push('DELIVERY_NOT_VERIFIED');
  if(!customer?.contactConsent) reasons.push('CONTACT_CONSENT_MISSING');
  if(paymentEnabled!==true) reasons.push('PAYMENTS_DISABLED');
  return Object.freeze({ready:reasons.length===0,reasons:Object.freeze([...new Set(reasons)])});
}
