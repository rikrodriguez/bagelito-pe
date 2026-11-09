/** Bagelito order intent: a NON-BINDING request, not an order or payment. */
export const CATALOG_VERSION = 'bagelito.catalog.prices.2026-11-06.v1' as const;
export const ALLOWED_PACKS = Object.freeze([
  'pack-grande-6-mixto', 'pack-grande-6-un-sabor',
  'pack-grande-12-mixto', 'pack-grande-12-un-sabor',
  'pack-mini-6-mixto', 'pack-mini-6-un-sabor',
  'pack-mini-12-mixto', 'pack-mini-12-un-sabor',
  'pack-mini-24-mixto', 'pack-mini-24-un-sabor',
]);
export const ALLOWED_SCHMEARS = Object.freeze([
  'schmear-120g-original', 'schmear-120g-saborizado',
  'schmear-180g-original', 'schmear-180g-saborizado',
  'schmear-240g-original', 'schmear-240g-saborizado',
]);
export const REVIEW_ONLY_CATEGORIES = Object.freeze([
  'combo-perfect-pair', 'combo-schmear-lover', 'combo-brunch-pack', 'custom-colors',
]);
const SKU_SET = new Set([...ALLOWED_PACKS,...ALLOWED_SCHMEARS,...REVIEW_ONLY_CATEGORIES]);
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z0-9][a-z0-9-]{0,79}$/;
const object=(x:unknown): x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const only=(x:Record<string,unknown>, allowed:string[])=>Object.keys(x).every(key=>allowed.includes(key));
const str=(x:unknown,max:number,min=1)=>typeof x==='string'&&x.trim().length>=min&&x.trim().length<=max&& !/[\u0000-\u001f\u007f]/.test(x);
function fail():never {throw new TypeError('Invalid request for manual review');}
export type IntentLine={sku:string;quantity:number;flavors?:{flavor:string;quantity:number}[];schmearFlavor?:string};
export type OrderIntentPayload={idempotencyKey:string;customerName:string;whatsapp:string;email:string;district:string;deliveryAddress:string|null;notes:string;consentAccepted:true;marketingOptIn:boolean;lines:IntentLine[]};
export function validateOrderIntent(input:unknown):OrderIntentPayload {
  if(!object(input)||!only(input,['idempotencyKey','customerName','whatsapp','email','district','deliveryAddress','notes','consentAccepted','marketingOptIn','lines','website']))fail();
  if(input.website!==undefined&&input.website!=='')fail();
  if(typeof input.idempotencyKey!=='string'||!UUID_PATTERN.test(input.idempotencyKey))fail();
  if(!str(input.customerName,100,2)||!str(input.whatsapp,25,7)||!str(input.email,150,5)||!str(input.district,80,2))fail();
  const email=(input.email as string).trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail();
  const phone=(input.whatsapp as string).replace(/\D/g,'');
  if(phone.length<7||phone.length>15)fail();
  if(input.consentAccepted!==true)fail();
  if(input.marketingOptIn!==undefined&&typeof input.marketingOptIn!=='boolean')fail();
  if(input.deliveryAddress!=null&&!str(input.deliveryAddress,200,5))fail();
  if(input.notes!==undefined&&input.notes!==''&&!str(input.notes,350))fail();
  if(!Array.isArray(input.lines)||input.lines.length<1||input.lines.length>20)fail();
  let units=0;const seen=new Set<string>();
  const lines:IntentLine[]=input.lines.map((value:unknown)=>{
    if(!object(value)||!only(value,['sku','quantity','flavors','schmearFlavor'])||typeof value.sku!=='string'||!SKU_SET.has(value.sku)||!Number.isSafeInteger(value.quantity)||Number(value.quantity)<1||Number(value.quantity)>20)fail();
    const sku=value.sku as string;const quantity=value.quantity as number;units+=quantity;
    if(units>40)fail();
    const pack=sku.startsWith('pack-');
    if(!pack&&value.flavors!==undefined)fail();
    if(pack&&value.schmearFlavor!==undefined)fail();
    if(value.schmearFlavor!==undefined&&(!sku.startsWith('schmear-')||!str(value.schmearFlavor,80)||!SLUG.test(value.schmearFlavor as string)))fail();
    let flavors:IntentLine['flavors'];
    if(value.flavors!==undefined){
      if(!Array.isArray(value.flavors)||value.flavors.length<1||value.flavors.length>24)fail();
      const fSeen=new Set<string>();let count=0;
      flavors=value.flavors.map((f:unknown)=>{
        if(!object(f)||!only(f,['flavor','quantity'])||!str(f.flavor,80)||!SLUG.test(f.flavor as string)||!Number.isSafeInteger(f.quantity)||Number(f.quantity)<1)fail();
        const slug=f.flavor as string,n=f.quantity as number;
        if(fSeen.has(slug))fail();fSeen.add(slug);count+=n;
        if(sku.startsWith('pack-mini-')&&['cheddar','jalapeno-cheddar'].includes(slug))fail();
        return {flavor:slug,quantity:n};
      });
      const countExpected=Number(sku.match(/^pack-(?:grande|mini)-(6|12|24)-/)?.[1]);
      if(count!==countExpected)fail();
      if(sku.endsWith('-un-sabor')&&flavors!.length!==1)fail();
      if(sku.endsWith('-mixto')&&flavors!.length<2)fail();
    }
    const canonical={sku,quantity,...(flavors?{flavors}:{}),...(value.schmearFlavor?{schmearFlavor:value.schmearFlavor as string}:{})};
    // Allow separate custom compositions of the same pack SKU; reject exact duplicates.
    const signature=JSON.stringify(canonical);if(seen.has(signature))fail();seen.add(signature);
    return canonical;
  });
  return {idempotencyKey:input.idempotencyKey.toLowerCase(),customerName:(input.customerName as string).trim().replace(/\s+/g,' '),whatsapp:phone,email,district:(input.district as string).trim(),deliveryAddress:input.deliveryAddress?(input.deliveryAddress as string).trim():null,notes:input.notes?(input.notes as string).trim():'',consentAccepted:true,marketingOptIn:input.marketingOptIn===true,lines};
}
