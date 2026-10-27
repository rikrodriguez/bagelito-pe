"use client";
import Image from "next/image";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Check,Minus,Plus,ShoppingBag} from "lucide-react";
import {packs,type PackSlug} from "@/data/packs";
import {flavors} from "@/data/flavors";
import {flavorImages} from "@/data/flavor-images";
import {SHOP_DRAFT_KEY,SHOP_DRAFT_UPDATED_EVENT} from "@/lib/shop-draft";
export const PACK_VISIT_KEY="bagelito:photo-visit:packs:v1";
type Draft={version:1;packSlug:PackSlug;quantities:Record<string,number>;singleFlavor:string};
const fallback:Draft={version:1,packSlug:"6-mixed",quantities:{},singleFlavor:""};
const known=new Set(flavors.map(f=>f.slug));
export function readPackDraft(raw:string|null):Draft{
 try{
  const v:unknown=JSON.parse(raw||"null");if(!v||typeof v!=="object")return fallback;
  const d=v as Partial<Draft>,p=packs.find(p=>p.slug===d.packSlug);if(d.version!==1||!p)return fallback;
  if(p.packType==="single")return {version:1,packSlug:p.slug,quantities:{},singleFlavor:typeof d.singleFlavor==="string"&&known.has(d.singleFlavor)?d.singleFlavor:""};
  const out:Record<string,number>={},values=d.quantities&&typeof d.quantities==="object"?d.quantities:{};
  let left=p.units;for(const f of flavors){const n=values[f.slug];const c=typeof n==="number"&&Number.isInteger(n)?Math.max(0,Math.min(left,n)):0;if(c)out[f.slug]=c;left-=c;}
  return {version:1,packSlug:p.slug,quantities:out,singleFlavor:""};
 }catch{return fallback;}
}
export function packCount(d:Draft){const p=packs.find(p=>p.slug===d.packSlug)!;return p.packType==="single"?(d.singleFlavor?p.units:0):Object.values(d.quantities).reduce((a,b)=>a+b,0);}
export function changeFlavor(d:Draft,slug:string,delta:number):Draft{
 const p=packs.find(p=>p.slug===d.packSlug);if(!p||!known.has(slug)||!Number.isInteger(delta)||delta===0)return d;
 if(p.packType==="single")return {...d,singleFlavor:delta>0?slug:(d.singleFlavor===slug?"":d.singleFlavor)};
 const prev=d.quantities[slug]||0,used=packCount(d),next=Math.max(0,Math.min(prev+delta,p.units-used+prev));
 const q={...d.quantities};if(next)q[slug]=next;else delete q[slug];return {...d,quantities:q};
}
export function PackVisitBuilder({locale,onBack}:{locale:"es"|"en";onBack:()=>void}){
 const es=locale==="es";const [draft,setDraft]=useState<Draft>(fallback);const [ready,setReady]=useState(false);
 const [step,setStep]=useState<"pack"|"bagels"|"finished">("pack");const [focus,setFocus]=useState("");
 const p=packs.find(x=>x.slug===draft.packSlug)!,used=packCount(draft),left=p.units-used;
 const selected=p.packType==="single"?(draft.singleFlavor?Array(p.units).fill(draft.singleFlavor):[]):flavors.flatMap(f=>Array(draft.quantities[f.slug]||0).fill(f.slug));
 useEffect(()=>{try{setDraft(readPackDraft(sessionStorage.getItem(PACK_VISIT_KEY)));}catch{}setReady(true);},[]);
 useEffect(()=>{if(!ready)return;try{sessionStorage.setItem(PACK_VISIT_KEY,JSON.stringify(draft));localStorage.setItem(SHOP_DRAFT_KEY,JSON.stringify(draft));window.dispatchEvent(new Event(SHOP_DRAFT_UPDATED_EVENT));}catch{}},[draft,ready]);
 const remove=(slug:string)=>setDraft(v=>changeFlavor(v,slug,-1));
 const add=(slug:string)=>setDraft(v=>changeFlavor(v,slug,1));
 return <section className="pv-config" aria-label={es?"Armar pack":"Build pack"}>
  <header className="pv-config-heading">
   <button type="button" className="pv-config-back" aria-label={es?"Regresar":"Back"} onClick={step==="pack"?onBack:()=>setStep(step==="finished"?"bagels":"pack")}><ArrowLeft size={19}/></button>
   <div><span>{es?"EN EL MOSTRADOR":"AT THE COUNTER"} / {step==="pack"?"01":step==="bagels"?"02":"03"}</span><h2>{step==="pack"?(es?"Elige tu caja":"Choose your box"):step==="bagels"?(es?"Elige tus bagels":"Choose your bagels"):(es?"Caja completa":"Box complete")}</h2></div>
   <span className="pv-config-basket"><ShoppingBag size={16}/>{used}/{p.units}</span>
  </header>
  {step==="pack"&&<>
   <div className="pv-pack-shelf" role="group" aria-label={es?"Formatos de pack":"Pack sizes"}>
    {packs.map(option=><button key={option.slug} type="button" aria-pressed={draft.packSlug===option.slug} className={"pv-pack-choice"+(draft.packSlug===option.slug?" chosen":"")}
      onClick={()=>setDraft({version:1,packSlug:option.slug,quantities:{},singleFlavor:""})}>
     <span>{option.units} BAGELS</span><strong>{option.packType==="mixed"?(es?"Surtidos":"Mixed"):(es?"Un sabor":"Single flavor")}</strong><b>S/{option.amount}</b>{draft.packSlug===option.slug&&<Check size={18}/>}
    </button>)}
   </div>
   <p className="pv-config-caption">{es?"Precios de packs existentes. No añadimos suplementos ni extras.":"Existing pack prices. No extras or surcharges."}</p>
   <button className="pv-config-next" type="button" onClick={()=>setStep("bagels")}>{es?"Elegir bagels":"Choose bagels"}<ArrowRight size={17}/></button>
  </>}
  {step==="bagels"&&<>
   <div className="pv-bagel-rail" aria-label={es?"Sabores disponibles en el catálogo":"Existing flavors"}>
    {flavors.map(f=>{const qty=p.packType==="single"?(draft.singleFlavor===f.slug?p.units:0):(draft.quantities[f.slug]||0);
     return <article className="pv-bagel-product" key={f.slug}>
      <button type="button" className="pv-bagel-zoom" onClick={()=>setFocus(focus===f.slug?"":f.slug)} aria-label={(es?"Ver ":"See ")+f.name}>
       <Image src={flavorImages[f.slug]} alt={f.name} width={145} height={145} quality={75}/>
      </button>
      <strong>{f.name}</strong>
      <div className="pv-bagel-quantity">
       <button type="button" disabled={!qty} onClick={()=>remove(f.slug)} aria-label={(es?"Quitar ":"Remove ")+f.name}><Minus size={15}/></button>
       <span>{qty}</span>
       <button type="button" disabled={left===0&&(p.packType==="mixed"||draft.singleFlavor===f.slug)} onClick={()=>add(f.slug)} aria-label={(es?"Agregar ":"Add ")+f.name}><Plus size={15}/></button>
      </div>
     </article>})}
   </div>
   {focus&&<p className="pv-config-focus" role="status">{flavors.find(f=>f.slug===focus)?.name} · {es?"Foto del producto":"Product photo"}</p>}
   <div className="pv-box-preview" aria-label={es?"Tu caja":"Your box"}>
    <span>{es?"TU CAJA":"YOUR BOX"} · {left===0?(es?"COMPLETA":"COMPLETE"):(left+" "+(es?"ESPACIOS DISPONIBLES":"EMPTY SPACES"))}</span>
    <div className="pv-box-slots">
     {Array.from({length:p.units},(_,i)=><button key={i} type="button" className={selected[i]?"filled":""}
      aria-label={selected[i]?(es?"Quitar ":"Remove ")+(flavors.find(f=>f.slug===selected[i])?.name||"bagel"):(es?"Espacio vacío":"Empty slot")}
      onClick={()=>{if(selected[i])remove(selected[i]);}}>
      {selected[i]?<Image src={flavorImages[selected[i]]} alt="" fill sizes="(max-width:600px) 16vw,70px" quality={70}/>:<Plus size={15}/>}
     </button>)}
    </div>
   </div>
   <button type="button" className="pv-config-next" disabled={left!==0} onClick={()=>setStep("finished")}>
    {left===0?(es?"Revisar mi caja":"Review my box"):(es?"Faltan ":"Remaining ")+left+" bagels"}<ArrowRight size={17}/>
   </button>
  </>}
  {step==="finished"&&<div className="pv-pack-complete">
   <Check size={30}/><strong>{p.units} {es?"bagels elegidos":"bagels selected"}</strong>
   <p>{es?"Tu selección está guardada. En el siguiente tramo conectaremos los schmears y el resumen final. No hay pedidos ni cobros.":"Your selections are saved. Schmears and order summary come in the next stage. No orders or payments."}</p>
   <button type="button" onClick={()=>setStep("bagels")}>{es?"Editar sabores":"Edit flavors"}</button>
  </div>}
 </section>;
}
