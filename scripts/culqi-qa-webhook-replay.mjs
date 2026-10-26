import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const QA_ORIGIN = "https://bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const QA_DB = "https://qaahskendqdkynwtylho.supabase.co";
const CULQI = "https://api.culqi.com";
const CODE = "BAG-000013";
const EVENT_ID = /^evt_test_[A-Za-z0-9]{16}$/;
const MESSAGE = "qa: replay verified Culqi webhook in sandbox";

export function allowedQA(env) {
  try {
    return env.VERCEL === "1" && env.VERCEL_ENV === "preview"
      && (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV === "preview")
      && env.VERCEL_PROJECT_ID === "prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0"
      && env.VERCEL_GIT_COMMIT_REF === "codex/culqi-payment-split-20261021"
      && env.VERCEL_GIT_COMMIT_MESSAGE === MESSAGE
      && env.VERCEL_GIT_REPO_OWNER === "rikrodriguez"
      && env.VERCEL_GIT_REPO_SLUG === "bagelito-pe"
      && env.VERCEL_BRANCH_URL === new URL(QA_ORIGIN).host
      && new URL(env.NEXT_PUBLIC_SITE_URL).origin === QA_ORIGIN
      && new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin === QA_DB
      && env.CULQI_MODE === "sandbox" && env.PAYMENT_PROVIDER === "culqi"
      && env.CULQI_ENABLED === "true" && env.CULQI_LIVE_APPROVED === "false"
      && typeof env.CULQI_SECRET_KEY === "string" && /^sk_test_[A-Za-z0-9]+$/.test(env.CULQI_SECRET_KEY)
      && typeof env.SUPABASE_SERVICE_ROLE_KEY === "string" && env.SUPABASE_SERVICE_ROLE_KEY.length > 30;
  } catch { return false; }
}
const record = v => v!==null && typeof v==="object" && !Array.isArray(v);
function resource(value) {
  if(typeof value==="string"){if(Buffer.byteLength(value,"utf8")>250000)return null;
    try{value=JSON.parse(value)}catch{return null}}
  return record(value)?value:null;
}
async function getJson(fetcher,url,headers,limit=300000) {
  if (!(url.startsWith(CULQI+"/v2/events") || url.startsWith(QA_DB+"/rest/v1/orders?"))) throw Error("unapproved URL");
  try {
    const response=await fetcher(url,{method:"GET",redirect:"error",credentials:"omit",cache:"no-store",
      headers,signal:AbortSignal.timeout(7500)});
    if(response.redirected||(response.url&&response.url!==url)||!response.body?.getReader)return null;
    const reader=response.body.getReader();let bytes=0;const chunks=[];
    try {
      for (;;) {
        const c=await reader.read();if(c.done)break;
        if(!(c.value instanceof Uint8Array)||chunks.length>=1000||(bytes+=c.value.byteLength)>limit)throw Error("invalid read");
        chunks.push(c.value);
      }
    }finally{void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}
    return response.status===200&&response.ok
      ? JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))) : null;
  } catch { return null; }
}
function financialMatches(event, order) {
  if(!record(event)||event.object!=="event"||event.type!=="charge.creation.succeeded"||!EVENT_ID.test(event.id))return false;
  const r=resource(event.data);
  const amount=order.payment_amount_minor;
  if(!record(r)||r.object!=="charge"||r.id!==order.payment_charge_id
    ||!Number.isSafeInteger(amount)||amount<1
    ||r.amount!==amount
    ||(r.currency_code??r.currency)!=="PEN"
    ||r.currency_code!==undefined&&r.currency_code!=="PEN"
    ||r.currency!==undefined&&r.currency!=="PEN"
    ||!record(r.metadata)||r.metadata.bagelito_order_code!==CODE
    ||!record(r.source)||r.source.id!==order.payment_charge_source_id
    ||r.dispute===true||typeof r.amount_refunded==="number"&&r.amount_refunded!==0)return false;
  if(typeof r.current_amount==="number"&&r.current_amount!==amount)return false;
  return true;
}
function paymentStateOK(order) {
  return record(order)&&order.order_code===CODE&&order.payment_provider==="culqi"
    &&order.payment_lane==="token"&&order.payment_status==="paid"
    &&order.status==="payment_confirmed"&&order.payment_charge_state==="submitted"
    &&order.payment_reconciliation_required===false
    &&typeof order.payment_charge_id==="string"&&/^chr_test_[A-Za-z0-9_-]{8,100}$/.test(order.payment_charge_id)
    &&typeof order.payment_charge_source_id==="string"
    &&Number.isSafeInteger(order.payment_amount_minor)&&order.payment_amount_minor>0
    &&order.payment_currency==="PEN";
}

export async function runReplay({env,fetcher,post}) {
  const result={allowed:false,qaOrderValidated:false,eventListed:false,providerEventVerified:false,
    financialsMatched:false,firstHttp:null,firstOK:false,secondHttp:null,duplicate:false,
    attemptedChargePOST:false,attemptedWebhookPOST:false,verdict:"skipped"};
  if(!allowedQA(env))return result;
  result.allowed=true;
  const sup=env.SUPABASE_SERVICE_ROLE_KEY;
  const select="order_code,payment_provider,payment_lane,payment_status,status,payment_charge_state,payment_reconciliation_required,payment_charge_id,payment_charge_source_id,payment_amount_minor,payment_currency";
  const orderUrl=QA_DB+"/rest/v1/orders?order_code=eq."+CODE+"&select="+encodeURIComponent(select)+"&limit=1";
  const rows=await getJson(fetcher,orderUrl,{apikey:sup,Authorization:"Bearer "+sup,Accept:"application/json"});
  const order=Array.isArray(rows)&&rows.length===1?rows[0]:null;
  if(!paymentStateOK(order)){result.verdict="qa_order_ineligible";return result;}
  result.qaOrderValidated=true;
  const auth={Authorization:"Bearer "+env.CULQI_SECRET_KEY,Accept:"application/json"};
  const events=await getJson(fetcher,CULQI+"/v2/events?type=charge.creation.succeeded&limit=100",auth,1200000);
  if(!record(events)||!Array.isArray(events.data)||events.data.length>100) {
    result.verdict="events_unavailable";return result;
  }
  const candidates=events.data.filter(e=>record(e)&&EVENT_ID.test(e.id)&&e.type==="charge.creation.succeeded"
    &&financialMatches(e,order));
  if(!candidates.length){result.verdict="no_matching_event";return result;}
  result.eventListed=true;
  // Provider list items never authorize a DB mutation. Re-fetch the exact
  // event by ID over authenticated TLS and validate every financial binding.
  const chosen=candidates[0];
  const detail=await getJson(fetcher,CULQI+"/v2/events/"+encodeURIComponent(chosen.id),
    {...auth,"x-api-version":"2","x-culqi-env":"test"});
  if(!record(detail)||detail.id!==chosen.id||detail.type!==chosen.type) {
    result.verdict="provider_identity_failed";return result;
  }
  result.providerEventVerified=true;
  if(!financialMatches(detail,order)){result.verdict="financial_binding_failed";return result;}
  result.financialsMatched=true;
  // This is the exact already-compiled App Router webhook POST. It only reads
  // the authentic event by GET and invokes the existing transactional RPC.
  // Unlike /payments/culqi/charge, it NEVER creates a new provider charge.
  // No event ID, token, email, payload or DB response enters our output.
  const request=()=>new Request(QA_ORIGIN+"/api/webhooks/culqi",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:chosen.id}),
  });
  result.attemptedWebhookPOST=true;
  const first=await post(request());
  result.firstHttp=first.status;
  const firstJson=await first.json().catch(()=>null);
  result.firstOK=first.status===200&&firstJson?.ok===true;
  if(!result.firstOK){result.verdict="first_webhook_failed";return result;}
  const second=await post(request());
  result.secondHttp=second.status;
  const secondJson=await second.json().catch(()=>null);
  result.duplicate=second.status===200&&secondJson?.ok===true&&secondJson.duplicate===true;
  result.verdict=result.duplicate?"webhook_applied_then_idempotent":"second_webhook_not_idempotent";
  return result;
}
async function main(){
  if(!allowedQA(process.env)){
    console.info("culqi_qa_webhook_replay_v1 "+JSON.stringify({verdict:"skipped"}));return;
  }
  const require=createRequire(import.meta.url);
  let report;
  try {
    const route=require("../.next/server/app/api/webhooks/culqi/route.js");
    if(typeof route.routeModule?.userland?.POST!=="function")throw Error("compiled_route_missing");
    report=await runReplay({env:process.env,fetcher:fetch,post:route.routeModule.userland.POST});
  }catch{report={verdict:"unexpected_failure",attemptedChargePOST:false};}
  console.info("culqi_qa_webhook_replay_v1 "+JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
