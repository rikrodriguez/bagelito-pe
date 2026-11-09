/** Captures NON-BINDING order intentions. No charge, delivery booking or confirmation. */
import {NextResponse} from 'next/server';
import {validateOrderIntent} from '@/lib/order-intents/contract';
import {createNonPayableOrderIntent} from '@/lib/order-intents/service';
import {OrderIntentConflict} from '@/lib/order-intents/repository';
import {DeliveryTierError} from '@/lib/delivery-v2/delivery-private-tiers';
import {enforcePublicApiSecurity, PublicApiError} from '@/lib/public-api-security';

export const runtime='nodejs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const fail=(status:number,message:string)=>NextResponse.json({ok:false,error:message},{status,headers});
async function readLimited(request:Request){
  const contentType=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(contentType!=='application/json')throw Object.assign(new Error('JSON required'),{statusCode:415});
  const declared=request.headers.get('content-length');
  if(declared&&(!/^\d+$/.test(declared)||Number(declared)>16384))throw Object.assign(new Error('Request too large'),{statusCode:413});
  if(!request.body)throw Object.assign(new Error('Missing body'),{statusCode:400});
  const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>16384){await reader.cancel();throw Object.assign(new Error('Request too large'),{statusCode:413});}
    chunks.push(value);
  }
  const buffer=new Uint8Array(size);let offset=0;
  for(const part of chunks){buffer.set(part,offset);offset+=part.byteLength;}
  try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer)) as unknown;}
  catch {throw Object.assign(new Error('Invalid JSON'),{statusCode:400});}
}
export async function POST(request:Request){
  // Commercial activation requires explicit approval and SQL migration.
  if(process.env.BAGELITO_ORDER_INTENTS_ENABLED!=='true')return fail(503,'Order requests are not enabled yet.');
  try {
    const payload=validateOrderIntent(await readLimited(request));
    await enforcePublicApiSecurity({request,scope:'reservations',email:payload.email,whatsapp:payload.whatsapp,trapValue:''});
    const result=await createNonPayableOrderIntent(payload);
    return NextResponse.json({ok:true,...result,message:'Solicitud recibida para revisión; aún no está confirmada.'},{status:202,headers});
  } catch(error) {
    if(error instanceof OrderIntentConflict)return fail(409,'A different request already uses this identifier.');
    if(error instanceof DeliveryTierError)return fail(422,'Please select a valid delivery district.');
    if(error instanceof PublicApiError)return fail(error.status,'Request cannot be accepted now.');
    if(error instanceof TypeError)return fail(400,'Please check the request details.');
    if(error&&typeof error==='object'&&'statusCode' in error&&typeof error.statusCode==='number')return fail(error.statusCode,'Invalid request.');
    // No personal data or raw database/payment errors in public response.
    return fail(503,'Order request review is temporarily unavailable.');
  }
}
