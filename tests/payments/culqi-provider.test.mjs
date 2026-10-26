import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source=await readFile(new URL('../../src/lib/payments/culqi.ts',import.meta.url),'utf8');
const body=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'')).replace(/export /g,'');
const load=new Function('assertCulqiEnabled','fetch','process',`${body};return createCulqiCharge;`);
const base={amount:68,customerEmail:'fixture@example.invalid',customerName:'Fixture Person',deliveryAddress:'Fixture',district:'Lince',orderCode:'BAG-TEST',phoneNumber:'000000000',sourceId:'ype_test_fixture123'};
function setup(status=201,payload={object:'charge',id:'chr_test_fixture123'}){const calls=[];const charge=load(()=>({hasSecretKey:true}),async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return {ok:true,status,json:async()=>payload};},{env:{CULQI_SECRET_KEY:'fixture-only-not-a-key'}});return {calls,charge};}
test('Yape creates one charge from ype source, without order or card authentication',async()=>{const {calls,charge}=setup();const r=await charge(base);assert.equal(r.requires3DS,false);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.culqi.com/v2/charges');assert.equal(calls[0].body.source_id,base.sourceId);assert.equal(calls[0].body.amount,6800);assert.equal(calls[0].body.currency_code,'PEN');assert.equal(calls[0].body.authentication_3DS,undefined);assert.equal(calls[0].body.order_id,undefined);});
test('Yape rejects excessive amount or 3DS before contacting provider',async()=>{for(const overrides of [{amount:2000.01},{authentication3DS:{eci:'05'}}]){const {calls,charge}=setup();await assert.rejects(charge({...base,...overrides}));assert.equal(calls.length,0);}});
test('unexpected REVIEW for Yape is not converted into a card 3DS flow',async()=>{const {charge}=setup(200,{action_code:'REVIEW'});await assert.rejects(charge(base),/Unexpected card/);});
test('card REVIEW retains the verified 3DS continuation',async()=>{const {charge}=setup(200,{action_code:'REVIEW'});assert.equal((await charge({...base,sourceId:'tkn_test_fixture123'})).requires3DS,true);});
