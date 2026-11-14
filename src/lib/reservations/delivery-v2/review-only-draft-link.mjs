/**
 * Staging-only, nonpayable bridge: persisted draft snapshot -> verified route
 * candidate -> destination-bound HMAC review link. Never use this link as a
 * stock hold, order confirmation, payment authorization or reason to remove
 * the unconditional delivery-v2-hard-stop.
 *
 * The host MUST supply a trusted server-only loadDraft(draftId) and a trusted
 * review-only quoteDestination({destinationId}) adapter. This module neither
 * stores drafts nor authenticates a geocoding provider.
 */
import {createHash, createHmac, timingSafeEqual} from 'node:crypto';

const SCHEMA='bagelito.delivery-draft-review.v1';
const TARIFF='bagelito.delivery-tiers.2026-11-06.v2';
const TTL_MS=15*60*1000;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const SHA=/^[0-9a-f]{64}$/;
const FEES=Object.freeze({adjacent:800,regular:1000,distant:1500,very_distant:2000});
const DRAFT_KEYS=['draftId','revision','cartSha256','destinationId','destinationRevision'];
const CANDIDATE_KEYS=['district','province','feeMinor','tier','status','payable','tariffVersion'];
const LINK_KEYS=['schema','draftId','draftRevision','cartSha256','destinationFingerprint',
  'tariffVersion','tier','feeMinor','status','payable','issuedAtMs','expiresAtMs','signature'];
const fail=status=>Object.freeze({ready:false,status,payable:false,quote:null,link:null});
const exact=(obj,keys)=>obj && typeof obj==='object' && !Array.isArray(obj) &&
  Object.keys(obj).length===keys.length && keys.every(k=>Object.hasOwn(obj,k));
const safeId=value=>typeof value==='string' && ID.test(value);
const safeInt=value=>Number.isSafeInteger(value) && value>0;
function keyCheck(key){
  if (!Buffer.isBuffer(key) || key.length<32) throw new TypeError('server-only HMAC key >=32 bytes required');
}
function snapshot(input){
  if (!exact(input,DRAFT_KEYS) || !safeId(input.draftId) ||
      !safeInt(input.revision) || !safeId(input.destinationId) ||
      !safeInt(input.destinationRevision) ||
      typeof input.cartSha256!=='string' || !SHA.test(input.cartSha256)) return null;
  // Never retain an object supplied by a callback across an await boundary.
  return Object.freeze(Object.fromEntries(DRAFT_KEYS.map(k=>[k,input[k]])));
}
function same(a,b){return DRAFT_KEYS.every(k=>a[k]===b[k]);}
function finger(draft){
  return createHash('sha256').update(JSON.stringify([draft.destinationId,draft.destinationRevision])).digest('hex');
}
function candidateValid(q){
  return exact(q,CANDIDATE_KEYS) && q.payable===false && q.status==='candidate_only' &&
    q.tariffVersion===TARIFF && Object.hasOwn(FEES,q.tier) && FEES[q.tier]===q.feeMinor;
}
function payload(snap,quote,at){
  return {schema:SCHEMA,draftId:snap.draftId,draftRevision:snap.revision,
    cartSha256:snap.cartSha256,destinationFingerprint:finger(snap),
    tariffVersion:TARIFF,tier:quote.tier,feeMinor:quote.feeMinor,
    status:'review_only',payable:false,issuedAtMs:at,expiresAtMs:at+TTL_MS};
}
function signature(body,key){
  return createHmac('sha256',key).update(JSON.stringify(body)).digest('hex');
}
function readPayload(link){
  const out={};for(const key of LINK_KEYS.slice(0,-1)) out[key]=link[key];return out;
}
function validLink(link,at){
  return exact(link,LINK_KEYS) && link.schema===SCHEMA &&
    safeId(link.draftId) && safeInt(link.draftRevision) &&
    typeof link.cartSha256==='string' && SHA.test(link.cartSha256) &&
    typeof link.destinationFingerprint==='string' && SHA.test(link.destinationFingerprint) &&
    link.tariffVersion===TARIFF && link.status==='review_only' && link.payable===false &&
    Object.hasOwn(FEES,link.tier) && FEES[link.tier]===link.feeMinor &&
    Number.isSafeInteger(link.issuedAtMs) && link.issuedAtMs>0 && link.issuedAtMs<=at &&
    Number.isSafeInteger(link.expiresAtMs) &&
    link.expiresAtMs===link.issuedAtMs+TTL_MS && at<link.expiresAtMs &&
    typeof link.signature==='string' && SHA.test(link.signature);
}

/** Issues only a REVIEW envelope; the host must supply server-side callbacks. */
export function createReviewOnlyDraftLink({loadDraft,quoteDestination,serverKey,now=Date.now}={}){
  keyCheck(serverKey);
  if(typeof loadDraft!=='function' || typeof quoteDestination!=='function' || typeof now!=='function')
    throw new TypeError('server-owned draft loader, review quote callback and clock required');
  return async function quoteDraftForReview(request){
    if(!exact(request,['draftId']) || !safeId(request.draftId))
      throw new TypeError('only opaque draftId is permitted');
    let first;
    try {first=snapshot(await loadDraft(request.draftId));}
    catch {return fail('draft_unavailable');}
    if(!first || first.draftId!==request.draftId) return fail('draft_unavailable');
    let result;
    try {result=await quoteDestination({destinationId:first.destinationId});}
    catch {return fail('verification_unavailable');}
    if(!result || result.payable!==false || result.ready!==true ||
        result.status!=='review_candidate_only' || !candidateValid(result.quote))
      return fail('manual_review_required');
    let second;
    try {second=snapshot(await loadDraft(request.draftId));}
    catch {return fail('draft_unavailable');}
    if(!second || !same(first,second)) return fail('draft_changed');
    const at=now();
    if(!Number.isSafeInteger(at) || at<=0 || at>Number.MAX_SAFE_INTEGER-TTL_MS)
      return fail('verification_unavailable');
    const safeQuote=Object.freeze(Object.fromEntries(CANDIDATE_KEYS.map(k=>[k,result.quote[k]])));
    const body=payload(first,safeQuote,at);
    const link=Object.freeze({...body,signature:signature(body,serverKey)});
    return Object.freeze({ready:true,status:'review_only',payable:false,quote:safeQuote,link});
  };
}

/**
 * Re-read the server-owned draft before accepting a link as CURRENT FOR HUMAN
 * REVIEW ONLY. This does NOT reverify a route or permit payment/reservation.
 */
export async function isReviewOnlyDraftLinkCurrent({link,loadDraft,serverKey,now=Date.now}={}){
  keyCheck(serverKey);
  if(typeof loadDraft!=='function' || typeof now!=='function')
    throw new TypeError('server-only draft loader and clock required');
  const at=now();
  if(!Number.isSafeInteger(at) || !validLink(link,at)) return false;
  const expected=Buffer.from(signature(readPayload(link),serverKey),'hex');
  const provided=Buffer.from(link.signature,'hex');
  if(!timingSafeEqual(expected,provided)) return false;
  let latest;
  try {latest=snapshot(await loadDraft(link.draftId));} catch {return false;}
  const completedAt=now();
  return Boolean(latest && latest.draftId===link.draftId &&
    latest.revision===link.draftRevision && latest.cartSha256===link.cartSha256 &&
    finger(latest)===link.destinationFingerprint &&
    Number.isSafeInteger(completedAt) && completedAt>=at && completedAt<link.expiresAtMs);
}
