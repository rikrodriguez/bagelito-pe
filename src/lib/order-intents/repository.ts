import {createHmac} from 'node:crypto';
import type {OrderIntentPayload} from './contract';

export type OrderIntentStatus='awaiting_human_review';
export type OrderIntentRow={store_id:'bagelito-01';source:'web';idempotency_key:string;payload_fingerprint:string;customer_name:string;whatsapp:string;email:string;district:string;delivery_address:string|null;notes:string;marketing_opt_in:boolean;consent_accepted:true;items:OrderIntentPayload['lines'];status:'awaiting_human_review';quote_status:'review_required';payment_status:'not_requested';catalog_version:'bagelito.catalog.prices.2026-11-06.v1'};
export type StoredIntent={id:string;payload_fingerprint:string;status:string};
export class OrderIntentConflict extends Error {statusCode=409;constructor(){super('This request key was already used for a different request');}}
export type IntentStore={insert:(row:OrderIntentRow)=>Promise<{id:string}>;findByKey:(key:string)=>Promise<StoredIntent|null>};
export async function persistValidatedIntent(payload:OrderIntentPayload,store:IntentStore,hmacKey:string){
  if(typeof hmacKey!=='string'||hmacKey.length<32)throw new Error('Order intent server configuration unavailable');
  const fingerprint=createHmac('sha256',hmacKey).update(JSON.stringify({customerName:payload.customerName,whatsapp:payload.whatsapp,email:payload.email,district:payload.district,deliveryAddress:payload.deliveryAddress,notes:payload.notes,marketingOptIn:payload.marketingOptIn,lines:payload.lines})).digest('hex');
  const row:OrderIntentRow={store_id:'bagelito-01',source:'web',idempotency_key:payload.idempotencyKey,payload_fingerprint:fingerprint,customer_name:payload.customerName,whatsapp:payload.whatsapp,email:payload.email,district:payload.district,delivery_address:payload.deliveryAddress,notes:payload.notes,marketing_opt_in:payload.marketingOptIn,consent_accepted:true,items:payload.lines,status:'awaiting_human_review',quote_status:'review_required',payment_status:'not_requested',catalog_version:'bagelito.catalog.prices.2026-11-06.v1'};
  let id:string;
  try {({id}=await store.insert(row));}
  catch(error){
    if(!error||typeof error!=='object'||!('code' in error)||error.code!=='23505')throw error;
    const existing=await store.findByKey(payload.idempotencyKey);
    if(!existing||existing.payload_fingerprint!==fingerprint)throw new OrderIntentConflict();
    id=existing.id;
  }
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Storage did not return a valid request ID');
  return Object.freeze({requestId:id,status:'awaiting_human_review' as const,quoteStatus:'review_required' as const,paymentStatus:'not_requested' as const,checkoutEnabled:false});
}
