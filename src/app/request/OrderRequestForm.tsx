"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ALLOWED_PACKS, ALLOWED_SCHMEARS, REVIEW_ONLY_CATEGORIES,
  type IntentLine,
} from "@/lib/order-intents/contract";
import { LIMA_DISTRICTS, CALLAO_DISTRICTS } from "@/lib/delivery-v2/delivery-metropolitan";
import "./request.css";

const CORE_FLAVORS = [
  ["plain", "Plain"], ["everything", "Everything"], ["sesame", "Sesame"],
  ["classic-onion", "Classic Onion"], ["jalapeno-cheddar", "Jalapeño Cheddar"],
  ["cheddar", "Cheddar"], ["cinnamon-raisin", "Cinnamon Raisin"],
  ["blueberry", "Blueberry"],
] as const;
const CATALOG_OPTIONS = [
  ...ALLOWED_PACKS, ...ALLOWED_SCHMEARS, ...REVIEW_ONLY_CATEGORIES,
];
const DISTRICTS = [...LIMA_DISTRICTS, ...CALLAO_DISTRICTS].sort((a,b)=>a.localeCompare(b,"es"));
function label(sku:string) {
  return sku.replace(/^pack-/,"Pack ").replace(/^schmear-/,"Schmear ").replace(/^combo-/,"Combo ").replaceAll("-"," ");
}
function sizeOfPack(sku:string) {return Number(sku.match(/^pack-(?:mini|grande)-(6|12|24)-/)?.[1] ?? 0);}
type DeliveryPreview = {estimatedFeeMinor:number|null;status:string;reason?:string};
type SubmitResponse = {ok?:boolean;requestId?:string;error?:string};

export function OrderRequestForm() {
  const [sku,setSku]=useState<string>(ALLOWED_PACKS[0]);
  const [quantity,setQuantity]=useState(1);
  const [flavors,setFlavors]=useState<Record<string,number>>({});
  const [schmearFlavor,setSchmearFlavor]=useState("");
  const [cart,setCart]=useState<IntentLine[]>([]);
  const [district,setDistrict]=useState("Lince");
  const [delivery,setDelivery]=useState<DeliveryPreview|null>(null);
  const [contact,setContact]=useState({customerName:"",whatsapp:"",email:"",deliveryAddress:"",notes:"",marketingOptIn:false,consentAccepted:false});
  const [feedback,setFeedback]=useState("");
  const [requestId,setRequestId]=useState("");
  const [sending,setSending]=useState(false);
  const idempotencyKey=useRef("");
  const isPack=sku.startsWith("pack-");
  const isSchmear=sku.startsWith("schmear-");
  const count=sizeOfPack(sku);
  const selectedCount=Object.values(flavors).reduce((sum,n)=>sum+n,0);
  const flavorChoices=CORE_FLAVORS.filter(([slug])=>!(sku.startsWith("pack-mini-")&&["cheddar","jalapeno-cheddar"].includes(slug)));

  function changed() {idempotencyKey.current="";setRequestId("");setFeedback("");}
  function updateContact(next:Partial<typeof contact>) {changed();setContact(current=>({...current,...next}));}
  function addLine() {
    if(cart.length>=20){setFeedback("Máximo 20 líneas por solicitud.");return;}
    let next:IntentLine={sku,quantity};
    if(isPack){
      const composition=Object.entries(flavors).filter(([,n])=>n>0).map(([flavor,quantity])=>({flavor,quantity}));
      if(selectedCount!==count || (sku.endsWith("-un-sabor")?composition.length!==1:composition.length<2)){
        setFeedback(`Este pack necesita exactamente ${count} bagels y la combinación de sabores indicada.`);
        return;
      }
      next={sku,quantity,flavors:composition};
    } else if(isSchmear&&schmearFlavor.trim()){
      next={sku,quantity,schmearFlavor:schmearFlavor.trim().toLowerCase().replace(/\s+/g,"-")};
    }
    if(cart.some(line=>JSON.stringify(line)===JSON.stringify(next))){
      setFeedback("Ese producto ya está incluido con la misma composición. Modifica la cantidad o selección.");return;
    }
    changed();setCart(current=>[...current,next]);setFlavors({});setSchmearFlavor("");setQuantity(1);
  }
  useEffect(()=>{
    let active=true;setDelivery(null);
    fetch("/api/delivery/preview",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({district}),
    }).then(async res=>{if(!res.ok)throw Error("unavailable");return res.json();})
      .then(data=>{if(active&&data?.ok&&data.delivery)setDelivery(data.delivery);})
      .catch(()=>{if(active)setDelivery(null);});
    return ()=>{active=false;};
  },[district]);

  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(sending||requestId)return;
    if(cart.length===0){setFeedback("Agrega al menos un producto.");return;}
    if(!contact.consentAccepted){setFeedback("Debes aceptar el contacto para responder a tu solicitud.");return;}
    setSending(true);setFeedback("");
    if(!idempotencyKey.current)idempotencyKey.current=crypto.randomUUID();
    try {
      const response=await fetch("/api/order-intents",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          idempotencyKey:idempotencyKey.current,...contact,
          deliveryAddress:contact.deliveryAddress.trim()||null,
          district,lines:cart,
        }),
      });
      const data=await response.json() as SubmitResponse;
      if(!response.ok||!data.ok||!data.requestId){
        setFeedback(response.status===503?"Las solicitudes aún no están habilitadas. No se registró ningún pedido.":data.error??"No pudimos registrar la solicitud.");
      }else{setRequestId(data.requestId);setFeedback("Solicitud recibida para revisión humana. Todavía no hay pedido confirmado ni pago.");}
    }catch {setFeedback("No pudimos confirmar el registro. Puedes reintentar sin duplicar tu solicitud.");}
    finally {setSending(false);}
  }

  return (
    <div className="bagelito-request">
      <div className="bagelito-request-head">
        <p className="kicker">Bagelito · Lima</p>
        <h1>Arma tu solicitud de bagels</h1>
        <p>Elige tus productos y te responderemos después de revisar disponibilidad, precio final y delivery. <strong>Sin pago ni reserva automática.</strong></p>
      </div>
      <div className="bagelito-request-layout">
        <section className="bagelito-request-card" aria-label="Selección de productos">
          <h2>1. Tu selección</h2>
          <label>Producto
            <select value={sku} onChange={e=>{setSku(e.target.value);setFlavors({});setSchmearFlavor("");setFeedback("");}}>
              {CATALOG_OPTIONS.map(option=><option value={option} key={option}>{label(option)}</option>)}
            </select>
          </label>
          <label>Cantidad de packs o unidades
            <input type="number" min={1} max={20} value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(20,Number(e.target.value)||1)))}/>
          </label>
          {isPack?<fieldset className="bagelito-request-flavors">
            <legend>Sabores del pack · {selectedCount} de {count}</legend>
            {flavorChoices.map(([slug,name])=><label key={slug}>{name}
              <input aria-label={name} type="number" min={0} max={count} value={flavors[slug]??0} onChange={e=>setFlavors(cur=>({...cur,[slug]:Math.max(0,Math.min(count,Number(e.target.value)||0))}))}/>
            </label>)}
            <small>Los sabores especiales se revisan antes de confirmar. Los minis no incluyen cheddar ni jalapeño cheddar.</small>
          </fieldset>:null}
          {isSchmear&&sku.endsWith("saborizado")?<label>Sabor del schmear (por confirmar)
            <input value={schmearFlavor} maxLength={80} onChange={e=>setSchmearFlavor(e.target.value)} placeholder="Ej. chicha morada"/>
          </label>:null}
          {REVIEW_ONLY_CATEGORIES.includes(sku as typeof REVIEW_ONLY_CATEGORIES[number])?<p>Esta opción requiere revisión de composición y precio.</p>:null}
          <button type="button" className="bagelito-request-button secondary" onClick={addLine}>Agregar a solicitud</button>
          <h3>Tu carrito para revisión</h3>
          {cart.length===0?<p>No has agregado productos.</p>:(
            <ul className="bagelito-request-cart">{cart.map((line,i)=><li key={i}>
              <span><strong>{line.quantity} × {label(line.sku)}</strong>{line.flavors?.length?<small>{line.flavors.map(f=>`${f.flavor} × ${f.quantity}`).join(", ")}</small>:null}</span>
              <button type="button" onClick={()=>{changed();setCart(current=>current.filter((_,n)=>n!==i));}}>Quitar</button>
            </li>)}</ul>
          )}
          <p className="bagelito-request-warning">Precios, delivery, stock y fecha de entrega pendientes de confirmación.</p>
        </section>
        <section className="bagelito-request-card" aria-label="Datos para seguimiento">
          <h2>2. Datos de contacto y entrega</h2>
          <form onSubmit={submit}>
            <label>Nombre completo<input required minLength={2} maxLength={100} value={contact.customerName} onChange={e=>updateContact({customerName:e.target.value})}/></label>
            <label>WhatsApp<input required type="tel" minLength={7} maxLength={25} value={contact.whatsapp} onChange={e=>updateContact({whatsapp:e.target.value})}/></label>
            <label>Email<input required type="email" maxLength={150} value={contact.email} onChange={e=>updateContact({email:e.target.value})}/></label>
            <label>Distrito<select value={district} onChange={e=>{changed();setDistrict(e.target.value);}}>
              {DISTRICTS.map(d=><option key={d} value={d}>{d}</option>)}
            </select></label>
            <div className="bagelito-request-estimate">
              {delivery?.estimatedFeeMinor!=null?<>Envío orientativo: <strong>S/{(delivery.estimatedFeeMinor/100).toFixed(0)}</strong></>:"Delivery por confirmar"}
              <small>No es una cotización pagable.</small>
            </div>
            <label>Dirección del cliente (opcional por ahora)
              <input maxLength={200} value={contact.deliveryAddress} onChange={e=>updateContact({deliveryAddress:e.target.value})} placeholder="Calle y número para verificar la cobertura"/>
            </label>
            <label>Comentarios<input maxLength={350} value={contact.notes} onChange={e=>updateContact({notes:e.target.value})}/></label>
            <label className="bagelito-request-check"><input type="checkbox" checked={contact.consentAccepted} onChange={e=>updateContact({consentAccepted:e.target.checked})} required/> Acepto que Bagelito use mis datos para responder sobre esta solicitud. No implica una compra.</label>
            <label className="bagelito-request-check"><input type="checkbox" checked={contact.marketingOptIn} onChange={e=>updateContact({marketingOptIn:e.target.checked})}/> Quiero recibir promociones de Bagelito (opcional).</label>
            <button type="submit" disabled={sending||!!requestId||cart.length===0} className="bagelito-request-button">
              {sending?"Registrando…":requestId?"Solicitud registrada":"Enviar solicitud para revisión"}
            </button>
            <p role="status" aria-live="polite">{feedback}</p>
            {requestId?<p><strong>Referencia:</strong> {requestId}</p>:null}
          </form>
        </section>
      </div>
    </div>
  );
}
