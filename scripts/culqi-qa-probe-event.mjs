import { pathToFileURL } from "node:url";

const PROJECT = "prj_AG2RGkfuiwmXUObT8Mjc8pcG6Lx0";
const BRANCH = "codex/culqi-payment-split-20261021";
const HOST = "bagelito-pe-git-cod-d9825d-ricardo-rodriguezs-projects-487b7b64.vercel.app";
const QA_URL = "https://qaahskendqdkynwtylho.supabase.co";
const API = "https://api.culqi.com";
const EXPECTED_MESSAGE = "qa: inspect Culqi provider event retrieval";
const ID = /^evt_test_[A-Za-z0-9]{16}$/;
const errorTypes = new Set(["invalid_request_error", "authentication_error", "parameter_error",
  "card_error", "limit_api_error", "resource_error", "api_error"]);
const safeParams = new Set(["id", "authorization", "version", "environment", "x-api-version", "x-culqi-env"]);

export function scope(env) {
  try {
    return env.VERCEL === "1"
      && env.VERCEL_ENV === "preview" && (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV === "preview")
      && env.VERCEL_PROJECT_ID === PROJECT && env.VERCEL_GIT_COMMIT_REF === BRANCH
      && env.VERCEL_GIT_COMMIT_MESSAGE === EXPECTED_MESSAGE
      && env.VERCEL_GIT_REPO_OWNER === "rikrodriguez" && env.VERCEL_GIT_REPO_SLUG === "bagelito-pe"
      && env.VERCEL_BRANCH_URL === HOST
      && new URL(env.NEXT_PUBLIC_SITE_URL).origin === "https://" + HOST
      && new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin === QA_URL
      && env.PAYMENT_PROVIDER === "culqi" && env.CULQI_MODE === "sandbox"
      && env.CULQI_ENABLED === "true" && env.CULQI_LIVE_APPROVED === "false"
      && typeof env.CULQI_SECRET_KEY === "string" && /^sk_test_[A-Za-z0-9]+$/.test(env.CULQI_SECRET_KEY)
      && env.CULQI_SECRET_KEY.length <= 255;
  } catch { return false; }
}

const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const parsedResource = value => {
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > 262144) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  return object(value) ? value : null;
};

function fixedError(body) {
  const kind = object(body) && errorTypes.has(body.type) ? body.type : "unknown";
  const param = object(body) ? body.param : null;
  const category = param == null ? "absent" : safeParams.has(param) ? (
    param === "x-api-version" ? "version" : param === "x-culqi-env" ? "environment" : param
  ) : "other";
  return { type: kind, param: category };
}

async function readJSON(fetcher, url, headers, byteLimit = 300000) {
  let response;
  try {
    if (!(url.startsWith(API + "/v2/events") || url.startsWith(QA_URL + "/rest/v1/orders?")))
      throw Error("unexpected_host");
    response = await fetcher(url, { method: "GET", cache: "no-store",
      redirect: "error", credentials: "omit", headers, signal: AbortSignal.timeout(7500) });
    if (response.redirected || (response.url && response.url !== url)) throw Error("redirect");
    if (!response.body || typeof response.body.getReader !== "function") throw Error("no_body");
    const reader = response.body.getReader();
    const chunks=[]; let bytes=0;
    try {
      for (;;) {
        const next=await reader.read(); if (next.done) break;
        if (!(next.value instanceof Uint8Array)) throw Error("bad_chunk");
        bytes+=next.value.byteLength;
        if (bytes > byteLimit || chunks.length>=1500) throw Error("too_large");
        chunks.push(next.value);
      }
    } finally { void reader.cancel().catch(()=>{}); try { reader.releaseLock(); } catch {} }
    const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));
    return { status: response.status, ok: response.status===200 && response.ok,
      data, error: response.ok ? {type:"none",param:"none"} : fixedError(data) };
  } catch {
    return {status:null,ok:false,data:null,error:{type:"transport",param:"none"}};
  }
}
function eventDateClass(timestamp) {
  if(!Number.isSafeInteger(timestamp))return "unknown";
  const unit=timestamp>=1e12?"milliseconds":timestamp>=1e9?"seconds":"unknown";
  if(unit==="unknown")return "unknown";
  const ms=unit==="milliseconds"?timestamp:timestamp*1000;
  const year=new Date(ms).getUTCFullYear();
  if(year===2026) {
    const month=new Date(ms).getUTCMonth()+1;
    return "2026_"+(month>=10?"oct_dec":"jan_sep")+"_"+unit;
  }
  return year>=2020 && year<=2035?"other_recent_"+unit:"other_"+unit;
}
function tally(out,key){out[key]=(out[key]||0)+1;}
function safeProviderReply(value,selected) {
  const record=object(value.data)?value.data:null;
  const res=parsedResource(record?.data);
  return {http:value.status,errorType:value.error.type,errorParam:value.error.param,
    exactId:Boolean(value.ok&&record&&record.id===selected.id),
    exactType:Boolean(value.ok&&record&&record.type===selected.type),
    resourceObject:res?.object==="charge"?"charge":res?.object==="order"?"order":"other",
    resourceIdMatches:Boolean(value.ok&&res&&res.id===selected.resource?.id&&typeof res.id==="string")};
}

export async function runProbe(fetcher,env) {
  const report={mode:"sandbox",attemptedWrites:false,target:{queried:false,found:false,paid:false},
    list:{http:null,valid:false,count:null,idFormat:{},idPrefix:{},types:{},timestamps:{},
      resourceTypes:{},resourceDataKinds:{},withOrderCode:0,matchedOrderChargeId:0},
    detail:{selected:false,selectedRelatedToOrder:false,sdk:null,minimal:null},
    verdict:"inconclusive"};
  if(!scope(env))return {...report,verdict:"scope_rejected"};
  const secret=env.CULQI_SECRET_KEY;
  const supKey=env.SUPABASE_SERVICE_ROLE_KEY;
  let chargeId=null;
  if(typeof supKey==="string"&&supKey.length>30) {
    const query=QA_URL+"/rest/v1/orders?order_code=eq.BAG-000013&select=order_code,payment_provider,payment_status,payment_charge_id&limit=1";
    const found=await readJSON(fetcher,query,{apikey:supKey,Authorization:"Bearer "+supKey,Accept:"application/json"});
    report.target.queried=true;
    if(found.ok&&Array.isArray(found.data)&&found.data.length===1) {
      const target=found.data[0];
      report.target.found=target?.order_code==="BAG-000013"&&target?.payment_provider==="culqi";
      report.target.paid=report.target.found&&target?.payment_status==="paid";
      if(report.target.found&&typeof target.payment_charge_id==="string")chargeId=target.payment_charge_id;
    }
  }
  const auth={Authorization:"Bearer "+secret,Accept:"application/json"};
  const listed=await readJSON(fetcher,API+"/v2/events?type=charge.creation.succeeded&limit=100",auth,1200000);
  report.list.http=listed.status;
  if(!listed.ok||!object(listed.data)||!Array.isArray(listed.data.data)||listed.data.data.length>100) {
    report.verdict="event_list_unavailable"; return report;
  }
  report.list.valid=true;
  report.list.count=listed.data.data.length;
  let selected=null; let selectedIsRelated=false;
  for (const event of listed.data.data) {
    if(!object(event)) {tally(report.list.idFormat,"unreadable");continue;}
    const id=event.id;
    const validId=typeof id==="string"&&ID.test(id);
    tally(report.list.idFormat,validId?"documented25":"other");
    const idPrefix=typeof id==="string"?(id.startsWith("evt_test_")?"test":id.startsWith("evt_live_")?"live":"other"):"missing";
    tally(report.list.idPrefix,idPrefix);
    const type=event.type==="charge.creation.succeeded"?"charge_success":event.type==="charge.creation.failed"?"charge_failed":event.type==="order.status.changed"?"order_changed":"other";
    tally(report.list.types,type);
    tally(report.list.timestamps,eventDateClass(event.creation_date));
    const dataKind=typeof event.data==="string"?"string":object(event.data)?"object":"other";
    tally(report.list.resourceDataKinds,dataKind);
    const resource=parsedResource(event.data);
    tally(report.list.resourceTypes,resource?.object==="charge"?"charge":resource?.object==="order"?"order":"other");
    const bagelitoOrderCode=object(resource?.metadata)?resource.metadata.bagelito_order_code:null;
    const sameOrder=bagelitoOrderCode==="BAG-000013";
    const sameCharge=chargeId!==null&&resource?.id===chargeId;
    if(sameOrder)report.list.withOrderCode++;
    if(sameCharge)report.list.matchedOrderChargeId++;
    if(validId&&event.type==="charge.creation.succeeded"&&(!selected||((sameOrder||sameCharge)&&!selectedIsRelated))){
      selected={id,type:event.type,resource};
      selectedIsRelated=sameOrder||sameCharge;
    }
  }
  if(!selected) { report.verdict="no_documented_event_id_in_list";return report; }
  report.detail.selected=true;report.detail.selectedRelatedToOrder=selectedIsRelated;
  const detailPath=API+"/v2/events/"+encodeURIComponent(selected.id);
  const sdk=await readJSON(fetcher,detailPath,{...auth,"x-api-version":"2","x-culqi-env":"test"});
  const minimal=await readJSON(fetcher,detailPath,auth);
  report.detail.sdk=safeProviderReply(sdk,selected);
  report.detail.minimal=safeProviderReply(minimal,selected);
  const valid=report.detail.sdk.exactId&&report.detail.sdk.exactType||report.detail.minimal.exactId&&report.detail.minimal.exactType;
  report.verdict=valid?"authentic_provider_event_lookup_worked":"authentic_provider_event_lookup_failed";
  return report;
}

async function main(){
  if(!scope(process.env)) {
    console.info("culqi_event_lookup_qa_probe_v1 "+JSON.stringify({verdict:"skipped"}));return;
  }
  let report;
  try{report=await runProbe(fetch,process.env);}
  catch{report={verdict:"unexpected_failure",attemptedWrites:false};}
  // Logs contain only allowlisted labels, booleans, counts and HTTP status.
  console.info("culqi_event_lookup_qa_probe_v1 "+JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
