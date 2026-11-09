import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {previewDeliveryReview} from '../src/lib/delivery-v2/review-only';
import {LIMA_DISTRICTS,CALLAO_DISTRICTS} from '../src/lib/delivery-v2/delivery-metropolitan';

test('all 50 districts produce review-only responses, never amounts to charge',()=>{
  const districts=[...LIMA_DISTRICTS,...CALLAO_DISTRICTS];
  assert.equal(districts.length,50);
  for(const district of districts){
    const r=previewDeliveryReview(district);
    assert.equal(r.payable,false);
    assert.equal(r.totalMinor,null);
    assert.equal(r.deliveryMinor,null);
    assert.equal(r.status,'review_required');
    assert.equal(r.tariffVersion,'BAGELITO-DELIVERY-2026-11-06-v2');
  }
});
test('Lince and neighboring official districts preview S/8 only',()=>{
  for(const district of ['Lince','Jesús María','San Isidro','La Victoria','Lima']){
    const r=previewDeliveryReview(district);
    assert.equal(r.estimatedFeeMinor,800);
    assert.equal(r.reason,'ADDRESS_VERIFICATION_REQUIRED');
  }
});
test('Central, distant and very distant examples retain approved V2 bands',()=>{
  assert.equal(previewDeliveryReview('Miraflores').estimatedFeeMinor,1000);
  assert.equal(previewDeliveryReview('La Molina').estimatedFeeMinor,1500);
  assert.equal(previewDeliveryReview('Carabayllo').estimatedFeeMinor,2000);
});
test('Remote areas require human review with no estimated fee',()=>{
  const r=previewDeliveryReview('Pucusana');
  assert.equal(r.reason,'MANUAL_DELIVERY_REVIEW');
  assert.equal(r.estimatedFeeMinor,null);
});
test('Malicious client evidence object cannot authorize payment',()=>{
  assert.throws(()=>previewDeliveryReview({
    district:'Lince',verifiedDestination:true,feeMinor:0,payable:true
  }));
});
test('Unknown or missing district must fail closed',()=>{
  for(const district of ['',null,'Another Planet']){
    assert.throws(()=>previewDeliveryReview(district));
  }
});
test('No private kitchen location, origin coordinates or address is returned',()=>{
  const json=JSON.stringify(previewDeliveryReview('San Isidro'));
  for(const field of ['origin','coordinates','latitude','longitude','address']){
    assert.equal(json.includes('"' + field + '"'),false);
  }
});
test('No marketing opt-in or payment event is implied',()=>{
  const r=previewDeliveryReview('Lince');
  assert.equal('paymentStatus' in r,false);
  assert.equal('marketingOptIn' in r,false);
  assert.equal(Object.isFrozen(r),true);
});
