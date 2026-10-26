import { pathToFileURL } from "node:url";
const ORIGIN="https://bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const DB="https://qaahskendqdkynwtylho.supabase.co";
const API="https://api.culqi.com/v2";
const CODE="BAG-000013";
const MSG="qa: inspect currency fields in Culqi event and charge";
const goodId=/^evt_test_[A-Za-z0-9]{16}$/;
const rec=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
function isQA(env){
 try{return env.VERCEL==="1"&&env.VERCEL_ENV==="preview"
 &&env.VERCEL_PROJECT_ID==="prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0"
 &&env.VERCEL_GIT_COMMIT_REF==="codex/culqi-payment-split-20261021"
 &&env.VERCEL_GIT_COMMIT_MESSAGE===MSG&&env.VERCEL_GIT_REPO_OWNER==="rikrodriguez"
 &&env.VERCEL_GIT_REPO_SLUG==="bagelito-pe"&&env.VERCEL_BRANCH_URL===new URL(ORIGIN).host
 &&new URL(env.NEXT_PUBLIC_SITE_URL).origin===ORIGIN
 &&new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin===DB
 &&env.CULQI_MODE==="sandbox"&&env.PAYMENT_PROVIDER==="culqi"&&env.CULQI_ENABLED==="true"
 &&env.CULQI_LIVE_APPROVED==="false"&&/^sk_test_[A-Za-z0-9]+$/.test(env.CULQI_SECRET_KEY)
 &&typeof env.SUPABASE_SERVICE_ROLE_KEY==="string"&&env.SUPABASE_SERVICE_ROLE_KEY.length>30;
 }catch{return false}
}
function field(v){return v===undefined||v===null?"missing":v==="PEN"?"PEN":v==="USD"?"USD":"other"}
function parsed(v){
 if(typeof v==="string"){if(Buffer.byteLength(v,"utf8")>250000)return null;
 try{v=JSON.parse(v)}catch{return null}}
 return rec(v)?v:null;
}
async function readJson(fetcher,url,headers,cap=300000) {
 if(!(url.startsWith(DB+"/rest/v1/orders?")||url.startsWith(API+"/events")||url.startsWith(API+"/charges/")))return null;
 try{
  const r=await fetcher(url,{method:"GET",headers,cache:"no-store",redirect:"error",credentials:"omit",signal:AbortSignal.timeout(7500)});
  if(!r.ok||r.status!==200||r.redirected||(r.url&&r.url!==url)||!r.body?.getReader)return null;
  let bytes=0;const chunks=[];const reader=r.body.getReader();
  try{for(;;){const c=await reader.read();if(c.done)break;
   if(!(c.value instanceof Uint8Array)||(bytes+=c.value.byteLength)>cap)throw Error("too large");chunks.push(c.value)}
  }finally{void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));
 }catch{return null}
}
export async function inspect(fetcher,env){
 const result={scope:"denied",orderFound:false,selected:false,eventDetail:false,chargeDetail:false,
  eventCurrencyCode:"unobserved",eventCurrency:"unobserved",
  chargeCurrencyCode:"unobserved",chargeCurrency:"unobserved",
  eventAmountMatches:false,eventSourceMatches:false,
  chargeAmountMatches:false,chargeSourceMatches:false,chargeCapture:null,chargePaid:null,
  eventResourceCharge:true,chargeObjectValid:false,providerIDsMatch:false,reads:0,writes:0};
 if(!isQA(env))return result;
 result.scope="sandbox_qa";
 const sup=env.SUPABASE_SERVICE_ROLE_KEY;
 const select="order_code,payment_status,payment_provider,payment_amount_minor,payment_currency,payment_charge_id,payment_charge_source_id";
 const orderRows=await readJson(fetcher,DB+"/rest/v1/orders?order_code=eq."+CODE+"&select="+encodeURIComponent(select)+"&limit=1",
  {apikey:sup,Authorization:"Bearer "+sup,Accept:"application/json"});result.reads++;
 const order=Array.isArray(orderRows)&&orderRows.length===1?orderRows[0]:null;
 if(!rec(order)||order.order_code!==CODE||order.payment_status!=="paid"||order.payment_provider!=="culqi"
 ||order.payment_currency!=="PEN"||!Number.isSafeInteger(order.payment_amount_minor))return result;
 result.orderFound=true;
 const h={Authorization:"Bearer "+env.CULQI_SECRET_KEY,Accept:"application/json"};
 const listed=await readJson(fetcher,API+"/events?type=charge.creation.succeeded&limit=100",h,1200000);result.reads++;
 const candidate=Array.isArray(listed?.data)?listed.data.find(e=>{
  const r=rec(e)?parsed(e.data):null;
  return goodId.test(e?.id)&&e.type==="charge.creation.succeeded"&&r?.object==="charge"
    &&r.id===order.payment_charge_id&&rec(r.metadata)&&r.metadata.bagelito_order_code===CODE;
 }):null;
 if(!candidate)return result;
 result.selected=true;
 const ev=await readJson(fetcher,API+"/events/"+encodeURIComponent(candidate.id),
  {...h,"x-api-version":"2","x-culqi-env":"test"});result.reads++;
 if(!rec(ev)||ev.id!==candidate.id||ev.type!==candidate.type)return result;
 const er=parsed(ev.data);if(!rec(er)||er.object!=="charge"||er.id!==order.payment_charge_id)return result;
 result.eventDetail=true;result.eventCurrencyCode=field(er.currency_code);result.eventCurrency=field(er.currency);
 result.eventAmountMatches=er.amount===order.payment_amount_minor;
 result.eventSourceMatches=rec(er.source)&&er.source.id===order.payment_charge_source_id;
 const charge=await readJson(fetcher,API+"/charges/"+encodeURIComponent(order.payment_charge_id),
  {...h,"x-api-version":"2","x-culqi-env":"test"});result.reads++;
 if(!rec(charge))return result;
 result.chargeDetail=true;result.chargeCurrencyCode=field(charge.currency_code);
 result.chargeCurrency=field(charge.currency);
 result.chargeAmountMatches=charge.amount===order.payment_amount_minor;
 result.chargeSourceMatches=rec(charge.source)&&charge.source.id===order.payment_charge_source_id;
 result.chargeCapture=charge.capture===true;result.chargePaid=charge.paid===true;
 result.chargeObjectValid=charge.object==="charge";result.providerIDsMatch=charge.id===er.id;
 return result;
}
async function main(){
 if(!isQA(process.env)){console.info("culqi_qa_currency_shape "+JSON.stringify({scope:"denied"}));return}
 let v;try{v=await inspect(fetch,process.env)}catch{v={scope:"sandbox_qa",error:"read_failed",writes:0}}
 console.info("culqi_qa_currency_shape "+JSON.stringify(v));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
