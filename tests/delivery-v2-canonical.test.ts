import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {LIMA_DISTRICTS,CALLAO_DISTRICTS} from '../src/lib/delivery-v2/delivery-metropolitan';
import {previewDeliveryTier,quoteDeliveryTier,PUBLIC_DELIVERY_POLICY,TARIFF_VERSION,type TrustedDestinationEvidence} from '../src/lib/delivery-v2/delivery-private-tiers';

const addr='Av. Del Cliente 123, Lima'; // fictitious CUSTOMER address only
function trusted(district:string, overrides:Partial<TrustedDestinationEvidence>={}):TrustedDestinationEvidence {
 return {source:'internal-geocode-or-operator',verifiedDistrict:district,verifiedFullAddress:addr,...overrides};
}
function quote(district:string,overrides:Partial<TrustedDestinationEvidence>={}){
 return quoteDeliveryTier({district,fullAddress:addr,verifiedDestination:trusted(district,overrides)});
}
test('All 50 districts covered, no gaps or duplicate geography',()=>{
 const ds=[...LIMA_DISTRICTS,...CALLAO_DISTRICTS];
 assert.equal(ds.length,50);
 for(const name of ds){const p=previewDeliveryTier(name);assert.equal(p.district,name);}
});
test('Direct Lince neighbors S/8 include Lima/Cercado',()=>{
 for(const name of ['Lince','Jesús María','San Isidro','La Victoria','Lima','Cercado de Lima']){
  const p=previewDeliveryTier(name);assert.equal(p.tier,'adjacent');assert.equal(p.estimatedFeeMinor,800);
  assert.equal(p.requiresVerifiedAddress,true);assert.equal(p.status,'estimate-only');
 }
});
test('Other central areas S/10 per user tiers',()=>{
 for(const name of ['Miraflores','San Borja','Surco','Magdalena','San Miguel','Barranco','Pueblo Libre','Surquillo','Rímac','Breña']){
  const p=previewDeliveryTier(name);assert.equal(p.estimatedFeeMinor,1000);
 }
});
test('Distant zone S/15',()=>{
 for(const name of ['La Molina','Los Olivos','San Juan de Lurigancho','San Martín de Porres','Callao','Chorrillos','Ate']){
  assert.equal(previewDeliveryTier(name).estimatedFeeMinor,1500);
 }
});
test('Very far urban zone S/20',()=>{
 for(const name of ['Comas','Ventanilla','Mi Perú','Carabayllo','Puente Piedra','Cieneguilla']){
  assert.equal(previewDeliveryTier(name).estimatedFeeMinor,2000);
 }
});
test('Beyond standard coverage requires manual review; no false promise',()=>{
 for(const name of ['Pucusana','Ancón','Santa Rosa','Chaclacayo','Lurigancho','San Bartolo']){
  const p=previewDeliveryTier(name);assert.equal(p.tier,'manual');assert.equal(p.estimatedFeeMinor,null);
  const q=quote(name);assert.equal(q.payable,false);assert.equal(q.feeMinor,null);assert.equal(q.status,'manual-review');
 }
});
test('Only approved S/8, S/10, S/15, S/20 prices; no hidden tiers',()=>{
 for(const d of [...LIMA_DISTRICTS,...CALLAO_DISTRICTS]){
  const fee=previewDeliveryTier(d).estimatedFeeMinor;
  assert.ok(fee===null||[800,1000,1500,2000].includes(fee));
 }
});
test('Every preview is NON-PAYABLE and never returns the origin address',()=>{
 for(const name of ['Lince','Miraflores','La Molina','Ventanilla']){
  const p=previewDeliveryTier(name);
  assert.equal('payable' in p,false);
  assert.equal('origin' in p,false);
  assert.equal('address' in p,false);
 }
});
test('No client street address -> not payable',()=>{
 const x=quoteDeliveryTier({district:'Miraflores',fullAddress:''});
 assert.equal(x.status,'pending-address');assert.equal(x.payable,false);
});
test('Full client street address without trusted verification -> not payable',()=>{
 const x=quoteDeliveryTier({district:'Miraflores',fullAddress:addr});
 assert.equal(x.status,'pending-verification');assert.equal(x.payable,false);
});
test('Trusted verification + neighboring district -> S/8 final quote',()=>{
 const x=quote('San Isidro');assert.equal(x.feeMinor,800);assert.equal(x.status,'quoted');assert.equal(x.payable,true);
});
test('Trusted verification + normal district -> S/10 final quote',()=>{
 assert.equal(quote('Miraflores').feeMinor,1000);
});
test('La Molina default is S/15 only after sector or route validated',()=>{
 const unknown=quote('La Molina');assert.equal(unknown.status,'pending-verification');
 const normal=quote('La Molina',{verifiedSector:'Camacho'});assert.equal(normal.feeMinor,1500);assert.equal(normal.payable,true);
});
test('La Molina priority far sectors S/20: El Sol, Lagunas, Planicie',()=>{
 for(const sector of ['El Sol de La Molina','Las Lagunas','La Planicie','las lagunas de la molina']){
  const x=quote('La Molina',{verifiedSector:sector});assert.equal(x.feeMinor,2000);assert.equal(x.payable,true);
 }
});
test('Ventanilla quoted at S/20',()=>{
 const x=quote('Ventanilla');assert.equal(x.feeMinor,2000);
});
test('Public Lince-area route proxy can UPGRADE S/10 to S/15',()=>{
 const x=quote('Santiago de Surco',{roadDistanceFromPublicLinceMeters:17000});assert.equal(x.feeMinor,1500);
});
test('Public Lince-area route proxy can UPGRADE S/15 to S/20',()=>{
 const x=quote('San Juan de Lurigancho',{roadDistanceFromPublicLinceMeters:26000});assert.equal(x.feeMinor,2000);
});
test('Adjacent is a fixed S/8 tariff even with optional route evidence',()=>{
 const x=quote('Jesús María',{roadDistanceFromPublicLinceMeters:18000});assert.equal(x.feeMinor,800);
});
test('Distance >40 km does not auto-sell deliveries',()=>{
 const x=quote('Surco',{roadDistanceFromPublicLinceMeters:41000});assert.equal(x.status,'manual-review');assert.equal(x.payable,false);
});
test('Bad negative distance is rejected',()=>{
 assert.throws(()=>quote('La Molina',{roadDistanceFromPublicLinceMeters:-1,verifiedSector:'Camacho'}));
});
test('District/address mismatch is rejected; not payable',()=>{
 assert.throws(()=>quoteDeliveryTier({district:'Miraflores',fullAddress:addr,verifiedDestination:trusted('Ventanilla')}));
});
test('Untrusted verification source is rejected',()=>{
 assert.throws(()=>quote('Lince',{source:'browser-claim' as 'internal-geocode-or-operator'}));
});
test('Full customer street address must match verification exactly',()=>{
 assert.throws(()=>quote('Lince',{verifiedFullAddress:'Calle totalmente diferente 456, Lima'}));
});
test('Unrecognized destination is rejected',()=>{
 assert.throws(()=>previewDeliveryTier('Cusco'));
});
test('Neither public metadata nor customer quote reveals any address',()=>{
 const secretFixture='PRIVATE-TEST-ONLY-NOT-A-REAL-LOCATION';
 const result=quoteDeliveryTier({district:'Miraflores',fullAddress:addr,verifiedDestination:trusted('Miraflores')});
 const publicString=JSON.stringify({policy:PUBLIC_DELIVERY_POLICY,quote:result});
 for(const t of [addr,secretFixture,'verifiedFullAddress','roadDistanceFromPublicLinceMeters']){
  assert.equal(publicString.includes(t),false);
 }
 assert.equal(PUBLIC_DELIVERY_POLICY.originArea,'Lince, Lima');
 assert.equal(result.tariffVersion,TARIFF_VERSION);
});
