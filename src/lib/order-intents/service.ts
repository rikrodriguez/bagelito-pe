import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {previewDeliveryReview} from '@/lib/delivery-v2/review-only';
import type {OrderIntentPayload} from './contract';
import {persistValidatedIntent, type OrderIntentRow} from './repository';

/** Service-role only: schema is separate from paid `orders`/`payment_attempts`. */
export async function createNonPayableOrderIntent(payload:OrderIntentPayload){
  // Verifies only district coverage; actual CUSTOMER address is not geocoded here.
  // This does not establish a payable shipping rate or inventory commitment.
  previewDeliveryReview(payload.district);
  const secret=process.env.BAGELITO_ORDER_INTENT_HMAC_KEY;
  if(!secret||secret.length<32)throw new Error('Order intent service is unavailable');
  const supabase=createSupabaseAdminClient();
  return persistValidatedIntent(payload,{
    insert:async(row:OrderIntentRow)=>{
      const {data,error}=await supabase.from('order_intents').insert(row).select('id').single();
      if(error)throw error;
      if(!data?.id)throw new Error('Order intent storage did not return ID');
      return {id:String(data.id)};
    },
    findByKey:async(key:string)=>{
      const {data,error}=await supabase.from('order_intents')
        .select('id,payload_fingerprint,status')
        .eq('store_id','bagelito-01').eq('source','web')
        .eq('idempotency_key',key).maybeSingle();
      if(error)throw error;
      return data?{id:String(data.id),payload_fingerprint:String(data.payload_fingerprint),status:String(data.status)}:null;
    },
  },secret);
}
