'use client';

import { useState } from 'react';

type Preview = {
  district: string | null;
  estimatedFeeMinor: number | null;
  rangeMinor: readonly number[] | null;
  status: string;
  payable: false;
  checkoutEnabled: false;
  quoteStatus: 'review_required';
  disclaimer: string;
};

const FLAVORS = ['Plain', 'Everything', 'Sesame', 'Jalapeño Cheddar', 'Cheddar', 'Cinnamon Raisin', 'Blueberry', 'Classic Onion'];
const formatSoles = (minor: number) => 'S/ ' + (minor / 100).toFixed(2);

export default function StoreDemo() {
  const [pack, setPack] = useState<6 | 12>(6);
  const [selection, setSelection] = useState<number[]>([]);
  const [district, setDistrict] = useState('Lince');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);

  function invalidate() {
    setPreview(null);
    setReview(false);
    setError('');
    setRequestVersion(v => v + 1);
  }

  async function checkDelivery() {
    const version = requestVersion;
    setLoading(true);
    setError('');
    setPreview(null);
    setReview(false);
    try {
      const response = await fetch('/api/delivery-preview?district=' + encodeURIComponent(district), {cache:'no-store'});
      if (!response.ok) throw new Error('No se pudo consultar delivery.');
      const result: Preview = await response.json();
      if (result.payable !== false || result.checkoutEnabled !== false || result.quoteStatus !== 'review_required') {
        throw new Error('La cotización recibida no es segura.');
      }
      if (version === requestVersion) setPreview(result);
    } catch (e) {
      if (version === requestVersion) setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }

  const complete = selection.length === pack;
  const counts = FLAVORS.map((flavor, i) => ({flavor, count: selection.filter(v => v === i).length})).filter(x => x.count);
  const canReview = complete && !!preview && !loading;

  return <main style={{maxWidth:850,margin:'auto',padding:'28px 18px',fontFamily:'system-ui',color:'#073e86'}}>
    <header><strong>BAGELITO</strong> <span style={{float:'right'}}>Tienda web · Staging</span></header>
    <h1>Arma tu pack de bagels</h1>
    <p>Selecciona tus sabores y consulta delivery. Este recorrido no crea pedidos ni realiza cobros.</p>
    <section aria-label="Tamaño del pack">
      <h2>1. Elige tu pack</h2>
      {([6,12] as const).map(n => <button key={n} type="button" aria-pressed={pack === n}
        onClick={() => {setPack(n);setSelection([]);invalidate();}}
        style={{marginRight:10,padding:12,background:pack===n?'#073e86':'#ff665d',color:'white',border:0,borderRadius:12}}>
        {n} bagels
      </button>)}
    </section>
    <section aria-label="Selección de sabores">
      <h2>2. Elige sabores ({selection.length}/{pack})</h2>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>
        {FLAVORS.map((flavor,i) => <button key={flavor} type="button" disabled={complete}
          onClick={() => {setSelection(old=>[...old,i]);invalidate();}}
          style={{padding:18,background:'#fff4ed',color:'#073e86',border:'1px solid #ead2c8',borderRadius:14,textAlign:'left'}}>
          🥯 {flavor} · Agregar
        </button>)}
      </div>
      <p><button type="button" disabled={!selection.length} onClick={()=>{setSelection(old=>old.slice(0,-1));invalidate();}}>Quitar último</button></p>
    </section>
    <section>
      <h2>3. Distrito de entrega</h2>
      <label htmlFor="district">Distrito en Lima</label>
      <input id="district" value={district} onChange={e=>{setDistrict(e.target.value);invalidate();}}
        maxLength={100} style={{display:'block',padding:12,width:'100%',maxWidth:400,margin:'8px 0'}}/>
      <button type="button" disabled={loading} onClick={()=>void checkDelivery()}>
        {loading?'Consultando…':'Consultar estimado de delivery'}
      </button>
      {error && <p role="alert">{error}</p>}
      {preview && <div role="status" aria-live="polite" style={{padding:15,background:'#f5f7fb',marginTop:12}}>
        <strong>Delivery: {preview.estimatedFeeMinor!==null?formatSoles(preview.estimatedFeeMinor):
          preview.rangeMinor?'Entre '+formatSoles(preview.rangeMinor[0])+' y '+formatSoles(preview.rangeMinor[1]):'Por confirmar'}</strong>
        <p>{preview.disclaimer}</p>
      </div>}
    </section>
    <section>
      <h2>4. Revisión del pedido</h2>
      <p>{complete?'Pack completo.':'Completa los '+pack+' bagels para continuar.'}</p>
      <button type="button" disabled={!canReview} onClick={()=>setReview(true)}>Ver resumen no pagable</button>
      {review && canReview && <div role="status" style={{padding:20,background:'#f8f4eb',marginTop:12}}>
        <h3>Resumen de selección — sin pedido creado</h3>
        <p>Pack: {pack} bagels</p>
        <ul>{counts.map(x=><li key={x.flavor}>{x.flavor}: {x.count}</li>)}</ul>
        <p>Distrito: {preview.district ?? 'Por confirmar'}</p>
        <p>Subtotal y total: pendientes de validación del servidor.</p>
        <strong>Pago deshabilitado · Revisión humana requerida</strong>
      </div>}
    </section>
  </main>;
}
