export const SALES_STAGES = [
  "new_inquiry","menu_discovery","recommendation","order_configuration","details_collection",
  "quote_ready","payment_pending","payment_evidence_received","confirmed","production","delivery",
  "completed","lost","human_review",
] as const;

const HIGH_RISK_INTENT_REASONS: Record<string,string> = {
  complaint:"complaint", refund:"refund", missing_item:"missing_or_damaged_order",
  damaged_order:"missing_or_damaged_order", food_safety:"food_safety", allergy:"allergy",
  payment_dispute:"payment_dispute", fraud:"fraud", custom_order:"custom_feasibility",
  discount_exception:"discount_exception",
};
const CUSTOM_REQUEST_PATTERN = /\b(birthday|cumplea[nñ]os|cumple|custom|personaliz|forma especial|shape|color especial|logo|tem[aá]tico)\b/i;
const HUMAN_REQUEST_PATTERN = /\b(humano|persona real|hablar con (alguien|una persona)|asesor|dawn|human|real person|talk to someone)\b/i;
const MENU_INTENTS = new Set(["menu","flavors","price","product_photo","how_to_order","delivery_area","batch_status"]);
const ACTIVE_STAGES = new Set(SALES_STAGES);
const OBJECTION_RESUME_ACTION: Record<string,string> = {
  price: "recommend_pack",
  minimum_order: "recommend_pack",
  availability: "ask_quantity_flavors",
  delivery: "ask_contact_delivery",
  timing: "ask_quantity_flavors",
  choice_overload: "recommend_pack",
  trust: "ask_quantity_flavors",
  other: "answer_question",
};

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}
function roundMoney(value:number){ return Math.round((value + Number.EPSILON)*100)/100; }
function mergeScalar(current:any, patch:any) {
  if (patch === undefined || patch === null) return current ?? null;
  if (typeof patch === "string" && !patch.trim()) return current ?? null;
  return patch;
}
function mergeItems(current:any[] = [], patch:any[] = [], kind:"bagel"|"schmear") {
  const merged = new Map<string,any>(); const order:string[]=[];
  for (const item of current.filter((x:any)=>x.item_kind===kind)) {
    const key=normalize(text(item.item_key)||text(item.item_name)); if(!key) continue;
    const mapKey=`${kind}:${key}`; merged.set(mapKey,{...item,item_key:key}); order.push(mapKey);
  }
  for (const line of patch ?? []) {
    const key=normalize(text(line.key)||text(line.name)); const quantity=Number(line.quantity);
    if(!key || !Number.isFinite(quantity)) continue;
    const mapKey=`${kind}:${key}`;
    if(quantity<=0){merged.delete(mapKey);continue;}
    if(!merged.has(mapKey)) order.push(mapKey);
    const prior=merged.get(mapKey);
    merged.set(mapKey,{item_kind:kind,item_key:key,item_name:text(line.name)||prior?.item_name||key,quantity,unit_price:prior?.unit_price??null,metadata:prior?.metadata??{}});
  }
  return order.filter(k=>merged.has(k)).map(k=>merged.get(k));
}
function mergeAllItems(current:any[] = [], patch:any) {
  const bagels=mergeItems(current,patch?.items??[],"bagel");
  const schmears=mergeItems(current,patch?.schmears??[],"schmear");
  const addons=current.filter((x:any)=>x.item_kind==="addon");
  return [...bagels,...schmears,...addons];
}
function materialPatch(patch:any) {
  if(!patch) return false;
  const scalar=["bagel_size","pack_slug","pack_name","units","district","address","custom_request","requested_date"];
  if(scalar.some(k=>patch[k]!==null && patch[k]!==undefined && !(typeof patch[k]==="string" && !patch[k].trim()))) return true;
  return (patch.items?.length??0)>0 || (patch.schmears?.length??0)>0;
}
export function getMissingFields(order:any,items:any[]) {
  const missing:string[]=[];
  if(!items.some(x=>x.item_kind==="bagel" && Number(x.quantity)>0)) missing.push("items");
  if(!text(order.customer_name)) missing.push("customer_name");
  if(!text(order.phone)) missing.push("phone");
  if(!text(order.district)) missing.push("district");
  if(!text(order.delivery_address)) missing.push("address");
  return missing;
}
export function calculateDeliveryFee(district:string,fact:any) {
  if(!district || !fact?.district_distances_km) return null;
  const found=Object.entries(fact.district_distances_km).find(([name])=>normalize(name)===normalize(district));
  const distance=found?Number(found[1]):NaN; if(!Number.isFinite(distance)) return null;
  const rate=Number(fact.rate_per_km??3), minimum=Number(fact.minimum_fee??8), threshold=Number(fact.long_distance_threshold??15), discount=Number(fact.long_distance_discount_rate??0.3);
  const base=Math.ceil(distance*rate); const adjusted=base>=threshold?Math.ceil(base*(1-discount)):base;
  return Math.max(minimum,adjusted);
}
function findPack(facts:any,order:any,items:any[]) {
  const size=text(order.bagel_size)==="mini" ? "mini" : "regular";
  const catalog=(size==="mini"
    ? (Array.isArray(facts?.mini_bagel_packs)?facts.mini_bagel_packs:[])
    : (Array.isArray(facts?.packs)?facts.packs:[])
  ).filter((x:any)=>Number(x.units)>0 && Number.isFinite(Number(x.amount)));

  const bagels=items.filter(x=>x.item_kind==="bagel"&&Number(x.quantity)>0);
  const units=bagels.reduce((s,x)=>s+Number(x.quantity),0);
  if(!Number.isFinite(units) || units<=0 || units>600) return null;
  const packType=bagels.length>1?"mixed":"single";
  const eligible=catalog
    .filter((x:any)=>text(x.packType)===packType)
    .sort((a:any,b:any)=>Number(b.units)-Number(a.units));

  const slug=text(order.pack_slug), name=text(order.pack_name);
  const explicit=eligible.find((x:any)=>
    (slug && normalize(text(x.slug))===normalize(slug)) ||
    (name && normalize(text(x.name))===normalize(name))
  );
  if(explicit && Number(explicit.units)===units) {
    return {
      ...explicit,
      components:[{...explicit,quantity:1}],
      derived:false,
      bagelSize:size,
    };
  }

  type PackPlan={amount:number;count:number;picks:Record<string,{pack:any;quantity:number}>};
  const dp:Array<PackPlan|null>=Array(units+1).fill(null);
  dp[0]={amount:0,count:0,picks:{}};

  for(let target=1;target<=units;target+=1){
    let best:PackPlan|null=null;
    for(const pack of eligible){
      const packUnits=Number(pack.units), amount=Number(pack.amount);
      if(target<packUnits || !dp[target-packUnits]) continue;
      const prev=dp[target-packUnits]!;
      const key=text(pack.slug)||normalize(text(pack.name))||String(packUnits);
      const picks={...prev.picks};
      const prior=picks[key];
      picks[key]={pack,quantity:(prior?.quantity??0)+1};
      const candidate={amount:roundMoney(prev.amount+amount),count:prev.count+1,picks};
      if(
        !best ||
        candidate.amount<best.amount ||
        (candidate.amount===best.amount && candidate.count<best.count)
      ){
        best=candidate;
      }
    }
    dp[target]=best;
  }

  const plan=dp[units];
  if(!plan) return null;
  const components=Object.values(plan.picks)
    .sort((a:any,b:any)=>Number(b.pack.units)-Number(a.pack.units))
    .map((entry:any)=>({...entry.pack,quantity:entry.quantity}));
  const nameParts=components.map((entry:any)=>
    entry.quantity>1 ? `${entry.quantity} × ${text(entry.name)}` : text(entry.name)
  );
  const slugParts=components.map((entry:any)=>
    `${text(entry.slug) || Number(entry.units)}x${entry.quantity}`
  );
  return {
    slug:`bundle:${slugParts.join("+")}`,
    name:nameParts.join(" + "),
    units,
    amount:plan.amount,
    packType,
    bagelSize:size,
    components,
    derived:true,
  };
}
export function deterministicHandoff(input:any, order:any, materialChange:boolean) {
  if(text(order.handoff_reason)) return text(order.handoff_reason);
  const high=HIGH_RISK_INTENT_REASONS[text(input.intent)]; if(high)return high;
  if(text(order.custom_request)||CUSTOM_REQUEST_PATTERN.test(text(input.latestMessage))) return "custom_feasibility";
  if(input.customer_requested_human||HUMAN_REQUEST_PATTERN.test(text(input.latestMessage))) return "customer_requested_human";
  if(input.conflicting_data) return "conflicting_data";
  if(typeof input.confidence==="number" && input.confidence<0.78) return "low_confidence";
  if(text(input.model_handoff_reason)) return text(input.model_handoff_reason);
  if(materialChange && text(order.payment_status)==="confirmed") return "conflicting_data";
  return null;
}
function calculateQuote(order:any,items:any[],facts:any,handoffReason:string|null,missing:string[]) {
  const schmearFacts=Array.isArray(facts?.schmears)?facts.schmears:[];
  const pack=findPack(facts,order,items);
  const bagels=items.filter(x=>x.item_kind==="bagel"&&Number(x.quantity)>0);
  const schmears=items.filter(x=>x.item_kind==="schmear"&&Number(x.quantity)>0);
  const bagelQuantity=bagels.reduce((s,x)=>s+Number(x.quantity),0);
  const deliveryFee=calculateDeliveryFee(text(order.district),facts?.delivery_pricing);
  const smap=new Map(schmearFacts.map((x:any)=>[normalize(text(x.slug)||text(x.name)),x]));
  let schmearsSubtotal=0, unpricedSchmear=false;
  for(const item of schmears){const f:any=smap.get(normalize(text(item.item_key)));const p=f?num(f.price):null;if(p===null)unpricedSchmear=true;else schmearsSubtotal+=p*Number(item.quantity);}
  const packUnits=pack?Number(pack.units):null;
  const verified=Boolean(pack && packUnits===bagelQuantity && deliveryFee!==null && !unpricedSchmear && !text(order.custom_request) && !handoffReason && missing.length===0);
  const itemsSubtotal=pack?Number(pack.amount):null;
  const total=verified && itemsSubtotal!==null ? roundMoney(itemsSubtotal+schmearsSubtotal+Number(deliveryFee)) : null;
  const reason=verified?null:(!pack?"pack_not_resolved":packUnits!==bagelQuantity?"item_quantity_mismatch":missing.length?"missing_order_fields":deliveryFee===null?"delivery_fee_unavailable":unpricedSchmear?"schmear_price_unavailable":text(order.custom_request)?"custom_request_requires_review":handoffReason||"quote_not_verified");
  return {verified,pack,bagelSize:text(order.bagel_size)==="mini"?"mini":"regular",bagelQuantity,itemsSubtotal,schmearsSubtotal:roundMoney(schmearsSubtotal),deliveryFee,total,reason};
}
function actionForStage(stage:string,intent:string,quoteVerified:boolean){
  if(stage==="menu_discovery") return ["menu","flavors","price","product_photo"].includes(intent)?"send_menu":"ask_quantity_flavors";
  if(stage==="recommendation")return "recommend_pack";
  if(stage==="order_configuration")return "ask_quantity_flavors";
  if(stage==="details_collection")return "ask_contact_delivery";
  if(stage==="quote_ready")return quoteVerified?"quote_order":"wait";
  if(stage==="payment_pending")return "request_payment";
  if(stage==="payment_evidence_received")return "acknowledge_payment_evidence";
  if(["confirmed","production","delivery"].includes(stage))return "confirm_fulfillment";
  if(["completed","lost"].includes(stage))return "wait";
  if(stage==="human_review")return "handoff";
  return "answer_question";
}
function stageFromStatus(status:string){
  if(["payment_confirmed","confirmed"].includes(status))return "confirmed";
  if(status==="in_production")return "production";
  if(status==="ready_for_delivery")return "delivery";
  if(status==="delivered")return "completed";
  if(["cancelled","lost"].includes(status))return "lost";
  if(status==="human_review")return "human_review";
  return null;
}
function classifyStage(order:any,items:any[],input:any,quote:any,handoffReason:string|null,materialChange:boolean){
  if(handoffReason)return "human_review";
  const ops=stageFromStatus(text(order.status)); if(ops)return ops;
  if(text(order.payment_status)==="confirmed")return "confirmed";
  if(text(order.payment_status)==="evidence_received")return "payment_evidence_received";
  if(order.quote_sent_at && !materialChange)return "payment_pending";
  const missing=getMissingFields(order,items); const hasBagels=!missing.includes("items");
  if(hasBagels && missing.length===0) return quote.verified?"quote_ready":"human_review";
  if(hasBagels)return "details_collection";
  if(num(order.units)||text(order.pack_slug))return "order_configuration";
  if(MENU_INTENTS.has(text(input.intent)))return "menu_discovery";
  if(/\b(recomienda|recomiendas|recommend|dulce|salado|sweet|savory)\b/i.test(text(input.latestMessage)))return "recommendation";
  const current=text(order.sales_stage); return ACTIVE_STAGES.has(current as any)?current:"new_inquiry";
}
export function projectSalesState(args:any){
  const current=args.currentOrder??{}; const patch=args.extraction?.order_patch??{};
  const projectedItems=mergeAllItems(args.currentItems??[],patch);
  const bagelQuantity=projectedItems.filter((x:any)=>x.item_kind==="bagel").reduce((s:number,x:any)=>s+Number(x.quantity),0);
  const latestMessage=text(args.latestMessage);
  const explicitBagelSize =
    /\bmini(?:s)?\b/i.test(latestMessage) ? "mini"
    : /\b(regular(?:es|s)?|grande(?:s)?|full[ -]?size|standard)\b/i.test(latestMessage) ? "regular"
    : null;
  const modelBagelSize=text(patch.bagel_size);
  const currentBagelSize=text(current.bagel_size);
  const nextBagelSize=explicitBagelSize || (["regular","mini"].includes(modelBagelSize) ? modelBagelSize : null) || currentBagelSize || null;
  const sizeChanged=Boolean(
    nextBagelSize &&
    nextBagelSize !== (currentBagelSize || "regular")
  );
  const changed=materialPatch(patch) || sizeChanged;
  const projectedOrder={...current,
    bagel_size:nextBagelSize,pack_slug:mergeScalar(current.pack_slug,patch.pack_slug),pack_name:mergeScalar(current.pack_name,patch.pack_name),units:mergeScalar(current.units,patch.units),
    customer_name:mergeScalar(current.customer_name,patch.customer_name),phone:mergeScalar(current.phone,patch.phone),email:mergeScalar(current.email,patch.email),district:mergeScalar(current.district,patch.district),
    delivery_address:mergeScalar(current.delivery_address,patch.address),address_reference:mergeScalar(current.address_reference,patch.address_reference),delivery_notes:mergeScalar(current.delivery_notes,patch.delivery_notes),
    requested_delivery_at:mergeScalar(current.requested_delivery_at,patch.requested_date),custom_request:mergeScalar(current.custom_request,patch.custom_request),
    payment_status:text(current.payment_status)||"none",
    quote_sent_at: changed ? null : (current.quote_sent_at??null), quote_verified: changed ? false : current.quote_verified===true,
  };
  if(!num(projectedOrder.units) && [6,12].includes(bagelQuantity))projectedOrder.units=bagelQuantity;
  if(projectedOrder.payment_status!=="confirmed" && args.extraction?.payment_evidence_claimed)projectedOrder.payment_status="evidence_received";
  const handoffReason=deterministicHandoff({...args.extraction,latestMessage:args.latestMessage},projectedOrder,changed);
  const missingFields=getMissingFields(projectedOrder,projectedItems);
  const quote=calculateQuote(projectedOrder,projectedItems,args.facts??{},handoffReason,missingFields);
  let effectiveHandoff=handoffReason;
  if(!effectiveHandoff && missingFields.length===0 && projectedItems.some((x:any)=>x.item_kind==="bagel") && !quote.verified){
    effectiveHandoff=quote.reason==="delivery_fee_unavailable"?"delivery_exception":"conflicting_data";
  }
  if(effectiveHandoff!==handoffReason){
    Object.assign(quote,calculateQuote(projectedOrder,projectedItems,args.facts??{},effectiveHandoff,missingFields));
  }
  const stage=classifyStage(projectedOrder,projectedItems,{intent:args.extraction?.intent,latestMessage:args.latestMessage},quote,effectiveHandoff,changed);
  const baseAction=actionForStage(stage,text(args.extraction?.intent),quote.verified);
  const rawObjection=text(args.extraction?.objection_type);
  const objectionType=rawObjection && rawObjection!=="custom_request" ? rawObjection : "none";
  const action=objectionType!=="none" && !effectiveHandoff ? "handle_objection" : baseAction;
  const resumeAction=objectionType!=="none" ? (OBJECTION_RESUME_ACTION[objectionType] || baseAction) : null;
  const paymentStatus=text(projectedOrder.payment_status)||"none";
  const buyerSignal=paymentStatus==="evidence_received"?"payment_sent":effectiveHandoff==="custom_feasibility"?"custom_request":effectiveHandoff?"support":objectionType!=="none"?"objection":stage==="quote_ready"?"order_complete":["order_configuration","details_collection"].includes(stage)?"selection_started":"interested";
  return {projectedOrder,projectedItems,missingFields,quote,handoffReason:effectiveHandoff,stage,action,resumeAction,objectionType,buyerSignal,paymentStatus,materialChange:changed};
}
