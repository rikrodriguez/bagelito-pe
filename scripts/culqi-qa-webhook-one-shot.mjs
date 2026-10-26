import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const QA_HOST = "bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const QA_ORIGIN = "https://" + QA_HOST;
const QA_DB = "https://qaahskendqdkynwtylho.supabase.co";
const PROVIDER = "https://api.culqi.com/v2";
const QA_ORDER = "BAG-000013";
const COMMIT_MESSAGE = "qa: apply verified Culqi event once and test duplicate";
const CHARGE_ID = /^chr_test_[A-Za-z0-9_-]{8,100}$/;
const SOURCE_ID = /^(?:tkn|ype)_test_[A-Za-z0-9_-]{8,100}$/;
const EVENT_ID = /^evt_test_[A-Za-z0-9]{16}$/;
const obj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const parseResource = raw => {
  if(typeof raw==="string") {
    if(Buffer.byteLength(raw,"utf8")>250000)return null;
    try { raw=JSON.parse(raw); } catch { return null; }
  }
  return obj(raw)?raw:null;
};

export function allowed(env) {
  try {
    return env.VERCEL==="1"
      && env.VERCEL_ENV==="preview"
      && (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV==="preview")
      && env.VERCEL_PROJECT_ID==="prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0"
      && env.VERCEL_GIT_COMMIT_REF==="codex/culqi-payment-split-20261021"
      && env.VERCEL_GIT_COMMIT_MESSAGE===COMMIT_MESSAGE
      && env.VERCEL_GIT_REPO_OWNER==="rikrodriguez"
      && env.VERCEL_GIT_REPO_SLUG==="bagelito-pe"
      && env.VERCEL_BRANCH_URL===QA_HOST
      && new URL(env.NEXT_PUBLIC_SITE_URL).origin===QA_ORIGIN
      && new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin===QA_DB
      && env.PAYMENT_PROVIDER==="culqi" && env.CULQI_MODE==="sandbox"
      && env.CULQI_ENABLED==="true" && env.CULQI_LIVE_APPROVED==="false"
      && typeof env.CULQI_SECRET_KEY==="string"
      && /^sk_test_[A-Za-z0-9]+$/.test(env.CULQI_SECRET_KEY)
      && typeof env.SUPABASE_SERVICE_ROLE_KEY==="string"
      && env.SUPABASE_SERVICE_ROLE_KEY.length>30;
  } catch { return false; }
}

async function read(fetcher,url,headers,maxBytes=350000) {
  if(!(url.startsWith(QA_DB+"/rest/v1/")||url.startsWith(PROVIDER+"/events")||url.startsWith(PROVIDER+"/charges/")))return null;
  try {
    const res=await fetcher(url,{
      method:"GET",headers,redirect:"error",credentials:"omit",cache:"no-store",
      signal:AbortSignal.timeout(8000),
    });
    if(res.status!==200||!res.ok||res.redirected||(res.url&&res.url!==url)||!res.body?.getReader)return null;
    const stream=res.body.getReader(),chunks=[];let total=0;
    try {
      for(;;) {
        const item=await stream.read();
        if(item.done)break;
        if(!(item.value instanceof Uint8Array)||(total+=item.value.byteLength)>maxBytes||chunks.length>1024)throw Error("bounded body");
        chunks.push(item.value);
      }
    } finally {
      void stream.cancel().catch(()=>{});
      try {stream.releaseLock();} catch{}
    }
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));
  }catch{return null;}
}

const sameSource = (resource,order) => obj(resource?.source)
  && resource.source.id===order.payment_charge_source_id;
const sameMetadata = (resource,order) => obj(resource?.metadata)
  && resource.metadata.bagelito_order_code===order.order_code;
const sameBase = (resource,order) => obj(resource)
  && resource.object==="charge"
  && resource.id===order.payment_charge_id
  && Number.isSafeInteger(resource.amount)
  && resource.amount===order.payment_amount_minor
  && sameSource(resource,order)
  && sameMetadata(resource,order);

function isEligibleOrder(order) {
  return obj(order)&&order.order_code===QA_ORDER
    && typeof order.id==="string"
    && /^[a-f0-9-]{36}$/i.test(order.id)
    && order.payment_provider==="culqi" && order.payment_lane==="token"
    && order.payment_status==="paid" && order.status==="payment_confirmed"
    && order.payment_reconciliation_required===false
    && order.payment_charge_state==="submitted"
    && order.payment_currency==="PEN"
    && CHARGE_ID.test(order.payment_charge_id)
    && SOURCE_ID.test(order.payment_charge_source_id)
    && Number.isSafeInteger(order.payment_amount_minor)
    && order.payment_amount_minor>0;
}

function isEligibleEvent(event,order) {
  if(!obj(event)||!EVENT_ID.test(event.id)||event.type!=="charge.creation.succeeded")return false;
  const resource=parseResource(event.data);
  if(!sameBase(resource,order))return false;
  return !Object.hasOwn(resource,"currency_code")&&!Object.hasOwn(resource,"currency")
    || (resource.currency_code??resource.currency)==="PEN"
      && (!Object.hasOwn(resource,"currency_code")||resource.currency_code==="PEN")
      && (!Object.hasOwn(resource,"currency")||resource.currency==="PEN");
}

function verifiedCharge(charge,order) {
  return sameBase(charge,order) && charge.currency_code==="PEN"
    && (!Object.hasOwn(charge,"currency")||charge.currency==="PEN")
    && charge.capture===true
    && Number.isSafeInteger(charge.current_amount)
    && charge.current_amount===order.payment_amount_minor
    && charge.amount_refunded===0 && charge.dispute===false;
}

function safeResult() {
  return {scope:"skipped",eligibleOrder:false,candidateFound:false,verifiedEvent:false,
    verifiedFinancials:false,existingEvent:false,attemptedChargeCreate:false,
    invokedWebhook:false,firstStatus:null,firstApplied:false,recordConfirmed:false,
    secondStatus:null,secondDuplicate:false,orderStillPaid:false,
    receiptUnchanged:false,attemptsUnchanged:false,verdict:"not_started"};
}
async function recordList(fetcher,dbHeaders,table,where,select,limit) {
  return read(fetcher,QA_DB+"/rest/v1/"+table+"?"+where+"&select="+encodeURIComponent(select)+"&limit="+limit,dbHeaders);
}

/**
 * Only the historical successful sandbox charge can be used, not an arbitrary ID.
 * Mutates only the QA payment_webhook_events row through the real POST route.
 */
export async function run({env,fetcher,post}) {
  const report=safeResult();
  if(!allowed(env))return report;
  report.scope="qa_only";
  const h={Authorization:"Bearer "+env.CULQI_SECRET_KEY,Accept:"application/json"};
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  const db={apikey:key,Authorization:"Bearer "+key,Accept:"application/json"};
  const fields="id,order_code,payment_provider,payment_lane,payment_status,status,payment_reconciliation_required,payment_charge_state,payment_currency,payment_charge_id,payment_charge_source_id,payment_amount_minor";
  const rows=await recordList(fetcher,db,"orders","order_code=eq."+QA_ORDER,fields,2);
  if(!Array.isArray(rows)||rows.length!==1||!isEligibleOrder(rows[0])) {
    report.verdict="order_ineligible";return report;
  }
  const order=rows[0];report.eligibleOrder=true;
  const receiptsBefore=await recordList(fetcher,db,"culqi_charge_confirmation_receipts",
    "order_id=eq."+order.id,"provider_charge_id",20);
  const attemptsBefore=await recordList(fetcher,db,"payment_attempts",
    "order_id=eq."+order.id,"id",20);
  if(!Array.isArray(receiptsBefore)||!Array.isArray(attemptsBefore)) {
    report.verdict="baseline_unavailable";return report;
  }
  const list=await read(fetcher,PROVIDER+"/events?type=charge.creation.succeeded&limit=100",h,1200000);
  if(!obj(list)||!Array.isArray(list.data)||list.data.length>100) {
    report.verdict="event_list_unavailable";return report;
  }
  const candidates=list.data.filter(event=>isEligibleEvent(event,order)).slice(0,5);
  if(!candidates.length) {report.verdict="no_matching_events";return report;}
  report.candidateFound=true;

  let event=null;
  for(const candidate of candidates) {
    const detail=await read(fetcher,PROVIDER+"/events/"+encodeURIComponent(candidate.id),
      {...h,"x-api-version":"2","x-culqi-env":"test"});
    if(obj(detail)&&detail.id===candidate.id&&detail.type===candidate.type
      &&isEligibleEvent(detail,order)) {
      const old=await recordList(fetcher,db,"payment_webhook_events",
        "provider=eq.culqi&provider_event_id=eq."+encodeURIComponent(candidate.id),
        "provider_event_id,processed_at,event_type",2);
      if(!Array.isArray(old)) {report.verdict="event_marker_unavailable";return report;}
      if(old.length>0)continue;
      event=detail;break;
    }
  }
  if(!event) {report.verdict="no_new_verified_event";return report;}
  report.verifiedEvent=true;
  const charge=await read(fetcher,PROVIDER+"/charges/"+encodeURIComponent(order.payment_charge_id),
    {...h,"x-api-version":"2","x-culqi-env":"test"});
  if(!verifiedCharge(charge,order)) {report.verdict="financial_evidence_incomplete";return report;}
  report.verifiedFinancials=true;

  if(typeof post!=="function"){report.verdict="no_route";return report;}
  const request=()=>new Request(QA_ORIGIN+"/api/webhooks/culqi",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:event.id}),
  });

  report.invokedWebhook=true;
  const first=await post(request());
  report.firstStatus=first.status;
  const firstBody=await first.json().catch(()=>null);
  report.firstApplied=first.status===200&&firstBody?.ok===true&&firstBody?.status==="paid"
    &&firstBody?.duplicate!==true;
  if(!report.firstApplied){report.verdict="first_webhook_failed";return report;}
  const markers=await recordList(fetcher,db,"payment_webhook_events",
    "provider=eq.culqi&provider_event_id=eq."+encodeURIComponent(event.id),
    "provider_event_id,processed_at,event_type",2);
  report.recordConfirmed=Array.isArray(markers)&&markers.length===1
    &&markers[0]?.event_type==="charge.creation.succeeded"
    &&typeof markers[0]?.processed_at==="string";
  if(!report.recordConfirmed){report.verdict="marker_missing";return report;}
  const second=await post(request());
  report.secondStatus=second.status;
  const secondBody=await second.json().catch(()=>null);
  report.secondDuplicate=second.status===200&&secondBody?.ok===true
    &&secondBody?.duplicate===true;

  const final=await recordList(fetcher,db,"orders",
    "order_code=eq."+QA_ORDER,fields,2);
  report.orderStillPaid=Array.isArray(final)&&final.length===1&&isEligibleOrder(final[0])
    &&final[0].payment_charge_id===order.payment_charge_id
    &&final[0].payment_amount_minor===order.payment_amount_minor;
  const receiptsAfter=await recordList(fetcher,db,"culqi_charge_confirmation_receipts",
    "order_id=eq."+order.id,"provider_charge_id",20);
  const attemptsAfter=await recordList(fetcher,db,"payment_attempts",
    "order_id=eq."+order.id,"id",20);
  report.receiptUnchanged=Array.isArray(receiptsAfter)&&JSON.stringify(receiptsAfter)===JSON.stringify(receiptsBefore);
  report.attemptsUnchanged=Array.isArray(attemptsAfter)&&JSON.stringify(attemptsAfter)===JSON.stringify(attemptsBefore);
  report.verdict=report.secondDuplicate&&report.orderStillPaid&&report.receiptUnchanged&&report.attemptsUnchanged
    ?"event_applied_and_duplicate_safe":"incomplete_replay_check";
  return report;
}

async function main() {
  if(!allowed(process.env)){
    console.info("bagelito_culqi_webhook_qa_v3 "+JSON.stringify({scope:"skipped"}));return;
  }
  try {
    const req=createRequire(import.meta.url);
    const route=req("../.next/server/app/api/webhooks/culqi/route.js");
    const post=route.routeModule?.userland?.POST;
    const report=await run({env:process.env,fetcher:fetch,post});
    console.info("bagelito_culqi_webhook_qa_v3 "+JSON.stringify(report));
  }catch {
    console.info("bagelito_culqi_webhook_qa_v3 "+JSON.stringify({verdict:"unexpected_error_no_raw_log"}));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
