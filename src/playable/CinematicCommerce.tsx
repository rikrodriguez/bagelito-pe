import { useMemo, useState } from 'react'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'
import './cinematic.css'

const menu=getVerifiedDisplayMenu()
const combos=menu.historicalPublishedCombos

type Category='packs'|'combos'|'schmears'
type Scene='selector'|'pack-size'|'pack-qty'|'combo'|'schmear-size'|'bagels'|'schmears'|'crosssell'|'downsell'|'cashier'|'payment'|'receipt'|'wallet'|'handoff'|'goodbye'
type PackFormat='grande'|'mini'

const BAGEL_SPOTS=[
  {left:'7%',top:'12%',width:'21%',height:'35%'},{left:'29%',top:'12%',width:'21%',height:'35%'},
  {left:'51%',top:'12%',width:'21%',height:'35%'},{left:'73%',top:'12%',width:'21%',height:'35%'},
  {left:'7%',top:'51%',width:'21%',height:'36%'},{left:'29%',top:'51%',width:'21%',height:'36%'},
  {left:'51%',top:'51%',width:'21%',height:'36%'},{left:'73%',top:'51%',width:'21%',height:'36%'}
] as const

const SCHMEAR_SPOTS=[
  {left:'8%',top:'11%',width:'27%',height:'34%'},{left:'37%',top:'11%',width:'27%',height:'34%'},{left:'66%',top:'11%',width:'27%',height:'34%'},
  {left:'22%',top:'51%',width:'27%',height:'34%'},{left:'51%',top:'51%',width:'27%',height:'34%'}
] as const

export function CinematicCommerce({customerName,onExit}:{customerName:string|null;onExit:()=>void}){
  const [scene,setScene]=useState<Scene>('selector')
  const [category,setCategory]=useState<Category|null>(null)
  const [packFormat,setPackFormat]=useState<PackFormat>('grande')
  const [packQty,setPackQty]=useState(6)
  const [comboId,setComboId]=useState<string|null>(null)
  const [schmearGrams,setSchmearGrams]=useState(120)
  const [bagels,setBagels]=useState<Record<string,number>>({})
  const [schmears,setSchmears]=useState<Record<string,number>>({})
  const [crossSellMode,setCrossSellMode]=useState<'none'|'primary'|'downsell'>('none')
  const [receiptPulled,setReceiptPulled]=useState(false)

  const combo=combos.find(x=>x.id===comboId)??null
  const bagelTarget=useMemo(()=>{
    if(category==='packs') return packQty
    if(category==='combos') return combo?.bagels??0
    if(category==='schmears'&&crossSellMode==='primary') return 8
    if(category==='schmears'&&crossSellMode==='downsell') return 2
    return 0
  },[category,packQty,combo,crossSellMode])
  const schmearTarget=category==='combos'?(combo?.schmear_count??0):1
  const bagelTotal=Object.values(bagels).reduce((a,b)=>a+b,0)
  const schmearTotal=Object.values(schmears).reduce((a,b)=>a+b,0)

  const progress=scene==='selector'||scene==='pack-size'||scene==='pack-qty'||scene==='combo'||scene==='schmear-size'?1:
    scene==='bagels'?2:scene==='schmears'||scene==='crosssell'||scene==='downsell'?3:
    scene==='cashier'?4:scene==='payment'?5:scene==='receipt'?6:scene==='wallet'?7:scene==='handoff'?8:9

  function startCategory(value:Category){
    setCategory(value);setBagels({});setSchmears({});setCrossSellMode('none')
    if(value==='packs')setScene('pack-size')
    if(value==='combos')setScene('combo')
    if(value==='schmears')setScene('schmear-size')
  }

  function addBagel(id:string){
    if(bagelTotal>=bagelTarget)return
    setBagels(v=>({...v,[id]:(v[id]??0)+1}))
  }
  function removeBagel(id:string){
    setBagels(v=>{const n=v[id]??0;if(!n)return v;const next={...v};if(n===1)delete next[id];else next[id]=n-1;return next})
  }
  function addSchmear(id:string){
    if(category==='schmears'){
      setSchmears({[id]:1});return
    }
    if(schmearTotal>=schmearTarget)return
    setSchmears(v=>({...v,[id]:(v[id]??0)+1}))
  }
  function removeSchmear(id:string){
    setSchmears(v=>{const n=v[id]??0;if(!n)return v;const next={...v};if(n===1)delete next[id];else next[id]=n-1;return next})
  }

  function afterBagels(){
    if(category==='packs'||category==='combos')setScene('schmears')
    else setScene('cashier')
  }
  function afterSchmears(){
    if(category==='schmears')setScene('crosssell')
    else setScene('cashier')
  }

  return <div className="cine-root" data-scene={scene}>
    <SceneBackground scene={scene}/>

    <header className="cine-header">
      <button className="cine-brand" onClick={onExit}><img src="/images/bagelito-wordmark.svg" alt="Bagelito"/></button>
      <div className="cine-user">{customerName?<>Hola <b>{customerName}</b> :)</>:<>Bagelito Store</>}</div>
    </header>

    <Progress active={progress}/>

    {scene==='selector'&&<section className="cine-selector glass-card">
      <small>EN LA VITRINA</small>
      <h1>¿Qué te provoca hoy?</h1>
      <div className="cine-categories">
        <button onClick={()=>startCategory('packs')}><img src="/images/pack-6-mixed.webp"/><span><b>Packs</b><small>Grandes o minis</small></span><i>→</i></button>
        <button onClick={()=>startCategory('combos')}><img src="/images/bagel-everything.webp"/><span><b>Combos</b><small>Elige tu combo</small></span><i>→</i></button>
        <button onClick={()=>startCategory('schmears')}><div className="schmear-orb"/><span><b>Schmears</b><small>Sabor y tamaño</small></span><i>→</i></button>
      </div>
    </section>}

    {scene==='pack-size'&&<section className="cine-options glass-card">
      <small>PACKS · PASO 1</small><h1>¿Grandes o minis?</h1><p>Primero el tamaño. Luego eliges cantidad y sabores.</p>
      <div className="two-options">
        <button onClick={()=>{setPackFormat('grande');setScene('pack-qty')}}><img src="/images/bagel-everything.webp"/><b>Bagels grandes</b><span>6 o 12 bagels</span></button>
        <button onClick={()=>{setPackFormat('mini');setScene('pack-qty')}}><img src="/images/bagel-plain.webp"/><b>Mini bagels</b><span>6, 12 o 24 minis</span></button>
      </div>
    </section>}

    {scene==='pack-qty'&&<section className="cine-options glass-card">
      <small>PACKS · {packFormat==='mini'?'MINIS':'GRANDES'}</small><h1>¿Cuántos quieres?</h1>
      <div className="qty-options">{(packFormat==='mini'?[6,12,24]:[6,12]).map(q=><button key={q} onClick={()=>{setPackQty(q);setBagels({});setScene('bagels')}}><b>{q}</b><span>{packFormat==='mini'?'mini bagels':'bagels'}</span></button>)}</div>
    </section>}

    {scene==='combo'&&<section className="cine-options combo-card glass-card">
      <small>COMBOS</small><h1>Elige tu combo</h1><p>Después eliges tus bagels y schmears directamente desde la vitrina.</p>
      <div className="combo-options">{combos.map(c=><button key={c.id} onClick={()=>{setComboId(c.id);setBagels({});setSchmears({});setScene('bagels')}}>
        <img src="/images/pack-6-mixed.webp"/><span><b>{c.name}</b><small>{c.bagels} bagels + {c.schmear_count} schmear{c.schmear_count>1?'s':''} de 120 g</small></span><strong>S/ {c.price}</strong><i>→</i>
      </button>)}</div>
    </section>}

    {scene==='schmear-size'&&<section className="cine-options glass-card">
      <small>SCHMEARS · PASO 1</small><h1>Elige tamaño</h1>
      <div className="qty-options">{[120,180,240].map(g=><button key={g} onClick={()=>{setSchmearGrams(g);setScene('schmears')}}><b>{g} g</b><span>{g===120?'Just a Lil':g===180?'Solid Schmear':'Like NYC'}</span></button>)}</div>
    </section>}

    {scene==='bagels'&&<section className="product-stage">
      <div className="stage-title"><small>{category==='combos'&&combo?combo.name.toUpperCase():category==='schmears'?'OFERTA BAGELS':'ELIGE TUS BAGELS'}</small><h2>Toca directamente en la vitrina</h2></div>
      <div className="bagel-hotspots">{menu.bagels.map((b,i)=>{const n=bagels[b.id]??0;return <button key={b.id} style={BAGEL_SPOTS[i]} data-selected={n>0} onClick={()=>addBagel(b.id)}>
        {n>0&&<span className="minus" onClick={e=>{e.stopPropagation();removeBagel(b.id)}}>−</span>}<span className="plus">{n||'+'}</span><small>{b.name}</small>
      </button>})}</div>
      <div className="stage-counter"><span><small>BAGELS</small><b>{bagelTotal}/{bagelTarget}</b></span><button disabled={bagelTotal!==bagelTarget} onClick={afterBagels}>Continuar →</button></div>
    </section>}

    {scene==='schmears'&&<section className="product-stage">
      <div className="stage-title"><small>{category==='packs'?'SCHMEAR OPCIONAL':category==='combos'?'PASO 2 · SCHMEARS':'ELIGE TU SCHMEAR'}</small><h2>Toca el sabor en la vitrina</h2></div>
      <div className="schmear-hotspots">{menu.schmears.map((s,i)=>{const n=schmears[s.id]??0;return <button key={s.id} style={SCHMEAR_SPOTS[i]} data-selected={n>0} onClick={()=>addSchmear(s.id)}>
        {n>0&&category==='combos'&&<span className="minus" onClick={e=>{e.stopPropagation();removeSchmear(s.id)}}>−</span>}<span className="plus">{n||'+'}</span><small>{s.name}</small>
      </button>})}</div>
      <div className="stage-counter"><span><small>SCHMEARS</small><b>{category==='packs'?(schmearTotal?'1 agregado':'Opcional'):(schmearTotal+'/'+schmearTarget)}</b></span>
        {category==='packs'&&!schmearTotal&&<button onClick={()=>setScene('cashier')}>Sin schmear →</button>}
        {(category==='packs'?schmearTotal>0:schmearTotal===schmearTarget)&&<button onClick={afterSchmears}>Continuar →</button>}
      </div>
    </section>}

    {scene==='crosssell'&&<section className="offer-card glass-card">
      <small>RECOMENDACIÓN BAGELITO</small><h1>Ese schmear pide bagels 👀</h1><p>Compra 6 bagels y te regalamos 2. Te llevas 8.</p>
      <div className="offer-actions"><button className="primary" onClick={()=>{setCrossSellMode('primary');setBagels({});setScene('bagels')}}>Sí, quiero 8 🥯</button><button onClick={()=>setScene('downsell')}>Solo el schmear</button></div>
    </section>}

    {scene==='downsell'&&<section className="offer-card glass-card">
      <small>UNA OPCIÓN MÁS LIGERA</small><h1>¿Prefieres agregar solo 2 bagels?</h1><p>Perfectos para probar tu schmear sin llevar un pack completo.</p>
      <div className="offer-actions"><button className="primary" onClick={()=>{setCrossSellMode('downsell');setBagels({});setScene('bagels')}}>Sí, agregar 2</button><button onClick={()=>setScene('cashier')}>No, voy a pagar</button></div>
    </section>}

    {scene==='cashier'&&<section className="cashier-ui glass-card">
      <small>CAJA BAGELITO</small><h1>Tu pedido</h1>
      <OrderSummary category={category} packFormat={packFormat} packQty={packQty} combo={combo} schmearGrams={schmearGrams} bagels={bagels} schmears={schmears}/>
      <button className="pay-button" onClick={()=>setScene('payment')}>Continuar al pago →</button>
    </section>}

    {scene==='payment'&&<section className="payment-ui glass-card">
      <small>PAGO CON CULQI</small><h1>Todo listo para pagar</h1><div className="pos-terminal"><b>Culqi</b><span>Visa · Mastercard · Apple Pay · Google Pay</span></div>
      <button className="pay-button" onClick={()=>setScene('receipt')}>Simular pago ✓</button><em>Preview comercial: aún no genera un cobro.</em>
    </section>}

    {scene==='receipt'&&<section className="receipt-scene">
      <div className={'receipt-printer '+(receiptPulled?'pulled':'')}><div className="printer-slot"/><div className="receipt-paper"><b>BAGELITO</b><small>ORDER #BG-1048</small><hr/><span>Tu pedido confirmado</span><strong>PAGADO ✓</strong><i>Gracias por tu compra</i></div></div>
      <button className="receipt-action" onClick={()=>receiptPulled?setScene('wallet'):setReceiptPulled(true)}>{receiptPulled?'Continuar →':'Jalar recibo ↓'}</button>
    </section>}

    {scene==='wallet'&&<section className="wallet-card glass-card">
      <small>BAGELITO CLUB</small><h1>Tu tarjeta está lista</h1><div className="wallet-pass"><img src="/images/bagelito-wordmark.svg"/><b>8 / 10 bagel points</b><span>Compra 9 bagels → el próximo va por la casa.</span></div>
      <button onClick={()=>setScene('handoff')}> Add to Apple Wallet</button><button onClick={()=>setScene('handoff')}>G Add to Google Wallet</button>
    </section>}

    {scene==='handoff'&&<section className="handoff-card glass-card"><small>LISTO PARA TI</small><h1>Tu Bagelito está listo 💙</h1><div className="bag-visual">BAGELITO</div><button onClick={()=>setScene('goodbye')}>Recibir mi bolsa →</button></section>}

    {scene==='goodbye'&&<section className="goodbye-card glass-card"><h1>¡Nos vemos pronto!</h1><p>Disfruta tus bagels 💙</p><div><button onClick={onExit}>Salir de Bagelito</button><button onClick={()=>setScene('selector')}>Seguir explorando</button></div></section>}
  </div>
}

function SceneBackground({scene}:{scene:Scene}){
  if(scene==='bagels')return <div className="cine-bg photo bagels-photo"/>
  if(scene==='schmears')return <div className="cine-bg photo schmears-photo"/>
  if(['crosssell','downsell'].includes(scene))return <div className="cine-bg storyboard schmear-story"/>
  if(['cashier','payment','receipt','wallet','handoff','goodbye'].includes(scene))return <div className={'cine-bg storyboard end-story '+scene}/>
  return <div className="cine-bg photo store-photo"/>
}

function Progress({active}:{active:number}){
  const labels=['Elige','Bagels','Schmears','Caja','Pago','Recibo','Club','Entrega']
  return <div className="cine-progress">{labels.map((l,i)=><div key={l} data-active={active===i+1} data-done={active>i+1}><i>{active>i+1?'✓':i+1}</i><span>{l}</span></div>)}</div>
}

function OrderSummary({category,packFormat,packQty,combo,schmearGrams,bagels,schmears}:{category:Category|null;packFormat:PackFormat;packQty:number;combo:(typeof combos)[number]|null;schmearGrams:number;bagels:Record<string,number>;schmears:Record<string,number>}){
  const selectedBagels=menu.bagels.filter(b=>bagels[b.id]).map(b=>({name:b.name,n:bagels[b.id]}))
  const selectedSchmears=menu.schmears.filter(s=>schmears[s.id]).map(s=>({name:s.name,n:schmears[s.id]}))
  return <div className="order-lines">
    <p><b>{category==='combos'&&combo?combo.name:category==='packs'?(packFormat==='mini'?'Pack Minis':'Pack Grandes'):'Schmear'}</b></p>
    {selectedBagels.map(x=><p key={x.name}><span>{x.n} × {x.name}</span></p>)}
    {selectedSchmears.map(x=><p key={x.name}><span>{x.n} × {x.name}{category==='schmears'?' · '+schmearGrams+' g':''}</span></p>)}
    <hr/><p><small>El total final será revalidado por el servidor antes del cobro.</small></p>
  </div>
}
