import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {buildDeliveryPreviewResponse} from './delivery-v2-response.mjs';
for (const district of ['Lince','Miraflores','La Molina','Unknown',null,{district:'Lince',verified:true}]) {
  test('delivery preview response is never payable: '+String(district), () => {
    const result = buildDeliveryPreviewResponse(district);
    assert.equal(result.payable,false);
    assert.equal(result.addressVerified,false);
    assert.equal(result.checkoutEnabled,false);
    assert.equal(result.paymentStatus,'not_requested');
    assert.equal(result.quoteStatus,'review_required');
    assert.equal(Object.hasOwn(result,'totalMinor'),false);
    assert.equal(Object.hasOwn(result,'paymentIntent'),false);
    assert.equal(Object.isFrozen(result),true);
  });
}
