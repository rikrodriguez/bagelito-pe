import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {previewDeliveryV2, DELIVERY_V2} from './delivery-v2-preview.mjs';

test('neighbor district gives S/8 estimate only', () => {
  const q=previewDeliveryV2('  JESÚS MARÍA ');
  assert.equal(q.estimatedFeeMinor,800);
  assert.equal(q.payable,false);
  assert.equal(q.addressVerified,false);
  assert.equal(q.version,DELIVERY_V2);
});
test('standard district S/10 estimate only',()=>{
  const q=previewDeliveryV2('Miraflores');
  assert.equal(q.estimatedFeeMinor,1000);
  assert.equal(q.payable,false);
});
test('far sector requires review, not false exact quote',()=>{
  const q=previewDeliveryV2('La Molina');
  assert.equal(q.estimatedFeeMinor,null);
  assert.deepEqual(q.rangeMinor,[1500,2000]);
  assert.equal(q.payable,false);
});
test('unknown district fails closed',()=>{
  const q=previewDeliveryV2('Unknown');
  assert.equal(q.estimatedFeeMinor,null);
  assert.equal(q.status,'coverage_review_required');
  assert.equal(q.payable,false);
});
test('forged address verification objects cannot grant payment',()=>{
  const q=previewDeliveryV2({district:'Lince',verified:true,feeMinor:0});
  assert.equal(q.addressVerified,false);
  assert.equal(q.payable,false);
  assert.equal(q.estimatedFeeMinor,null);
});
test('empty and malicious district inputs fail closed',()=>{
  for(const input of ['',null,'<script>',12,'a'.repeat(200)]){
    const q=previewDeliveryV2(input);
    assert.equal(q.payable,false);
    assert.equal(q.estimatedFeeMinor,null);
  }
});
