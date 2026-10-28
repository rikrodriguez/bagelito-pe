import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, RoundedBox } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'
import './playable.css'

const BLUE = '#004aad'
const CORAL = '#fa967f'
const menu = getVerifiedDisplayMenu()
const combos = menu.historicalPublishedCombos

type Category = 'packs' | 'combos' | 'schmears'
type Step = 'explore' | 'choose-pack' | 'choose-combo' | 'choose-schmear-size' | 'bagels' | 'schmears' | 'cashier'
type Move = { forward:boolean; backward:boolean; left:boolean; right:boolean; run:boolean }

const ZONES = {
  totem: new THREE.Vector3(-3.2, 0, 5.5),
  vitrina: new THREE.Vector3(-.8, 0, .4),
  schmears: new THREE.Vector3(4.5, 0, -.2),
  cashier: new THREE.Vector3(4.8, 0, 4.2),
}

export function PlayableStore() {
  const [ready, setReady] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const [player, setPlayer] = useState(new THREE.Vector3(0, 0, 7))
  const [category, setCategory] = useState<Category | null>(null)
  const [step, setStep] = useState<Step>('explore')
  const [packQty, setPackQty] = useState(6)
  const [comboId, setComboId] = useState<string | null>(null)
  const [schmearSize, setSchmearSize] = useState(120)
  const [bagels, setBagels] = useState<Record<string,number>>({})
  const [schmears, setSchmears] = useState<Record<string,number>>({})
  const [move, setMove] = useState<Move>({forward:false,backward:false,left:false,right:false,run:false})
  const look = useRef({yaw:Math.PI,pitch:-.06})

  useEffect(() => {
    setReady(true)
    const saved = localStorage.getItem('bagelito_customer_name')
    if (saved) setName(saved)
  }, [])

  useEffect(() => {
    const map:Record<string,keyof Move> = {
      KeyW:'forward',ArrowUp:'forward',KeyS:'backward',ArrowDown:'backward',
      KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',
      ShiftLeft:'run',ShiftRight:'run'
    }
    const apply=(value:boolean)=>(e:KeyboardEvent)=>{
      const key=map[e.code]
      if(!key) return
      e.preventDefault()
      setMove(v=>({...v,[key]:value}))
    }
    const down=apply(true), up=apply(false)
    window.addEventListener('keydown',down,{passive:false})
    window.addEventListener('keyup',up,{passive:false})
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up)}
  },[])

  const selectedCombo = combos.find(x=>x.id===comboId) ?? null
  const bagelTarget = category==='packs' ? packQty : selectedCombo?.bagels ?? 0
  const schmearTarget = category==='combos' ? selectedCombo?.schmear_count ?? 0 : category==='schmears' ? 1 : 0
  const bagelTotal = Object.values(bagels).reduce((a,b)=>a+b,0)
  const schmearTotal = Object.values(schmears).reduce((a,b)=>a+b,0)

  const nearest = useMemo(()=>{
    let winner:keyof typeof ZONES|null=null, best=999
    for(const [key,pos] of Object.entries(ZONES) as [keyof typeof ZONES,THREE.Vector3][]) {
      const d=Math.hypot(player.x-pos.x,player.z-pos.z)
      if(d<best){best=d;winner=key}
    }
    return best<2.4?winner:null
  },[player])

  const chooseCategory=(c:Category)=>{
    setCategory(c); setBagels({}); setSchmears({}); setComboId(null)
    setStep(c==='packs'?'choose-pack':c==='combos'?'choose-combo':'choose-schmear-size')
  }
  const reset=()=>{setCategory(null);setStep('explore');setBagels({});setSchmears({});setComboId(null)}
  const addBagel=(id:string)=>{
    if(step!=='bagels'||bagelTotal>=bagelTarget) return
    setBagels(v=>({...v,[id]:(v[id]??0)+1}))
  }
  const addSchmear=(id:string)=>{
    if(step!=='schmears'||schmearTotal>=Math.max(1,schmearTarget)) return
    setSchmears(v=>({...v,[id]:(v[id]??0)+1}))
  }

  if(!ready) return <div className="playable-loading">Preparando Bagelito…</div>

  return <main className="playable-shell">
    <Canvas shadows dpr={[1,1.5]} camera={{fov:68,near:.05,far:60,position:[0,1.65,7]}}>
      <ambientLight intensity={1.35}/>
      <directionalLight castShadow position={[4,9,5]} intensity={2.2}/>
      <World step={step} bagels={bagels} schmears={schmears} onBagel={addBagel} onSchmear={addSchmear}/>
      <CameraController move={move} look={look} onPosition={setPlayer}/>
      <Environment preset="city" environmentIntensity={.28}/>
    </Canvas>

    <LookSurface look={look}/>
    <header className="playable-top interactive-ui">
      <button className="brand-pill" onClick={reset}>bagelito<span>✳</span></button>
      <div className="status-pill"><small>{step==='explore'?'EXPLORA':'PEDIDO ACTIVO'}</small><b>{category?.toUpperCase() ?? 'BAGELITO STORE'}</b></div>
    </header>

    {name&&step==='explore'&&<div className="hello-card interactive-ui"><small>BIENVENIDA DE VUELTA</small><strong>¡Hola {name}!</strong><span>Qué bueno verte de nuevo ;)</span></div>}

    <Hud
      category={category} step={step} nearest={nearest}
      bagelTotal={bagelTotal} bagelTarget={bagelTarget}
      schmearTotal={schmearTotal} schmearTarget={schmearTarget}
      selectedCombo={selectedCombo}
      onCategory={chooseCategory}
      onPack={(q)=>{setPackQty(q);setStep('bagels')}}
      onCombo={(id)=>{setComboId(id);setStep('bagels')}}
      onSchmearSize={(g)=>{setSchmearSize(g);setStep('schmears')}}
      onNextBagels={()=>bagelTotal===bagelTarget&&setStep('schmears')}
      onNextSchmears={()=>{if(category==='packs'||schmearTotal===schmearTarget)setStep('cashier')}}
      onReset={reset}
    />

    <MobilePad move={move} setMove={setMove}/>
    <div className="playable-help interactive-ui"><b>WASD</b> caminar · <b>arrastra</b> para mirar · acércate para interactuar</div>
  </main>
}

function CameraController({move,look,onPosition}:{move:Move;look:React.MutableRefObject<{yaw:number;pitch:number}>;onPosition:(p:THREE.Vector3)=>void}) {
  const {camera}=useThree()
  const pos=useRef(new THREE.Vector3(0,1.65,7))
  const tick=useRef(0)
  const f=useMemo(()=>new THREE.Vector3(),[])
  const r=useMemo(()=>new THREE.Vector3(),[])
  const v=useMemo(()=>new THREE.Vector3(),[])
  useFrame((_,delta)=>{
    const speed=(move.run?4:2.5)*Math.min(delta,.05)
    f.set(-Math.sin(look.current.yaw),0,-Math.cos(look.current.yaw))
    r.set(f.z,0,-f.x)
    v.set(0,0,0)
    if(move.forward)v.add(f);if(move.backward)v.sub(f);if(move.right)v.add(r);if(move.left)v.sub(r)
    if(v.lengthSq()){v.normalize().multiplyScalar(speed);pos.current.add(v)}
    pos.current.x=THREE.MathUtils.clamp(pos.current.x,-7.5,7.5)
    pos.current.z=THREE.MathUtils.clamp(pos.current.z,-8.2,8.4)
    camera.position.copy(pos.current)
    camera.rotation.order='YXZ'
    camera.rotation.set(look.current.pitch,look.current.yaw,0)
    if(++tick.current%8===0)onPosition(new THREE.Vector3(pos.current.x,0,pos.current.z))
  })
  return null
}

function LookSurface({look}:{look:React.MutableRefObject<{yaw:number;pitch:number}>}) {
  const drag=useRef(false),last=useRef({x:0,y:0})
  return <div className="look-surface"
    onPointerDown={e=>{if((e.target as HTMLElement).closest('.interactive-ui,button'))return;drag.current=true;last.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId)}}
    onPointerMove={e=>{if(!drag.current)return;look.current.yaw-=(e.clientX-last.current.x)*.004;look.current.pitch=THREE.MathUtils.clamp(look.current.pitch-(e.clientY-last.current.y)*.003,-.7,.5);last.current={x:e.clientX,y:e.clientY}}}
    onPointerUp={()=>drag.current=false} onPointerCancel={()=>drag.current=false}/>
}

function World({step,bagels,schmears,onBagel,onSchmear}:{step:Step;bagels:Record<string,number>;schmears:Record<string,number>;onBagel:(id:string)=>void;onSchmear:(id:string)=>void}) {
  return <group>
    <color attach="background" args={['#f4f6f3']}/>
    <mesh receiveShadow position={[0,-.08,0]}><boxGeometry args={[17,0.15,19]}/><meshStandardMaterial color="#cfe8e8" roughness={.9}/></mesh>
    <BackWall/><Entrance/><Totem/><BagelCounter step={step} counts={bagels} onBagel={onBagel}/><SchmearStation step={step} counts={schmears} onSchmear={onSchmear}/><Cashier/><Production/><AmbientPeople/><Tables/>
  </group>
}

function BackWall(){
  return <group position={[0,0,-8.7]}>
    <mesh position={[0,2.7,0]}><boxGeometry args={[17,5.4,.2]}/><meshStandardMaterial color="#fffdf9"/></mesh>
    <Html transform position={[0,3.6,.12]} distanceFactor={6} className="world-logo"><img src="/images/bagelito-logo.svg" alt="Bagelito"/></Html>
  </group>
}
function Entrance(){return <group position={[0,0,8.8]}><mesh position={[-2,2,0]}><boxGeometry args={[3.6,4,.1]}/><meshPhysicalMaterial color="#d8eff8" transmission={.8} transparent opacity={.18}/></mesh><mesh position={[2,2,0]}><boxGeometry args={[3.6,4,.1]}/><meshPhysicalMaterial color="#d8eff8" transmission={.8} transparent opacity={.18}/></mesh></group>}
function Totem(){return <group position={[-3.2,0,5.5]} rotation={[0,.3,0]}><RoundedBox castShadow position={[0,1.25,0]} args={[1.45,2.35,.25]} radius={.14}><meshStandardMaterial color="#fff"/></RoundedBox><mesh position={[0,1.5,.14]}><planeGeometry args={[1.12,1.48]}/><meshStandardMaterial color={BLUE}/></mesh><Html transform position={[0,1.5,.17]} distanceFactor={1.5} className="totem-ui"><div><b>¿Qué te provoca hoy?</b><span>Packs · Combos · Schmears</span><small>ACÉRCATE</small></div></Html></group>}

function BagelCounter({step,counts,onBagel}:{step:Step;counts:Record<string,number>;onBagel:(id:string)=>void}) {
  return <group position={[-1,0,.3]}>
    <RoundedBox castShadow position={[0,.72,0]} args={[8.4,1.45,1.8]} radius={.08}><meshStandardMaterial color="#b7c3c9" metalness={.45}/></RoundedBox>
    <mesh position={[0,1.15,.55]}><boxGeometry args={[8,.72,.04]}/><meshPhysicalMaterial color="#dff6ff" transparent opacity={.28} transmission={.7}/></mesh>
    {menu.bagels.map((b,i)=>{const row=i<4?0:1,col=i%4,x=-3.1+col*2.05,y=row?0.55:1.02,c=counts[b.id]??0;return <group key={b.id} position={[x,y,.35]}>
      <mesh castShadow rotation={[Math.PI/2,0,0]} scale={c?1.08:1} onClick={e=>{e.stopPropagation();if(step==='bagels')onBagel(b.id)}} onPointerOver={()=>step==='bagels'&&(document.body.style.cursor='pointer')} onPointerOut={()=>document.body.style.cursor='default'}>
        <torusGeometry args={[.42,.17,16,32]}/><meshStandardMaterial color={['#c99554','#c28a4d','#ddb66f','#b87943','#c9793e','#df8b3e','#9d6949','#80644f'][i]} roughness={.7} emissive={step==='bagels'?BLUE:'#000'} emissiveIntensity={.04}/>
      </mesh>
      <Html transform position={[0,-.3,.25]} distanceFactor={2.5} className="product-label"><div><b>{b.name}</b>{c>0&&<span>{c}</span>}</div></Html>
    </group>})}
  </group>
}

function SchmearStation({step,counts,onSchmear}:{step:Step;counts:Record<string,number>;onSchmear:(id:string)=>void}) {
  const colors=['#eee9dc','#e7a653','#d8dfc3','#c79770','#eda9af']
  return <group position={[4.6,0,-.4]}>
    <RoundedBox castShadow position={[0,.78,0]} args={[4.1,1.5,1.8]} radius={.08}><meshStandardMaterial color="#c2ccd1" metalness={.4}/></RoundedBox>
    {menu.schmears.map((s,i)=>{const row=i<3?0:1,col=i<3?i:i-3,x=-1.3+col*1.3,y=row?.55:1.08,c=counts[s.id]??0;return <group key={s.id} position={[x,y,.4]}>
      <mesh onClick={e=>{e.stopPropagation();if(step==='schmears')onSchmear(s.id)}}><cylinderGeometry args={[.45,.42,.2,28]}/><meshStandardMaterial color="#f5f6f6"/></mesh>
      <mesh position={[0,.12,0]}><cylinderGeometry args={[.39,.39,.07,28]}/><meshStandardMaterial color={colors[i]}/></mesh>
      <Html transform position={[0,-.28,.22]} distanceFactor={2.4} className="product-label"><div><b>{s.name}</b>{c>0&&<span>{c}</span>}</div></Html>
    </group>})}
  </group>
}

function Cashier(){return <group position={[4.8,0,4.2]} rotation={[0,-.7,0]}><RoundedBox castShadow position={[0,.65,0]} args={[3.5,1.3,1.4]} radius={.12}><meshStandardMaterial color="#fafaf7"/></RoundedBox><mesh position={[-.45,1.5,0]}><boxGeometry args={[1.15,.75,.12]}/><meshStandardMaterial color={BLUE}/></mesh><RoundedBox position={[.75,1.18,.22]} args={[.52,.75,.28]} radius={.08}><meshStandardMaterial color="#e2eaf0"/></RoundedBox><Html transform position={[-.45,1.5,.07]} distanceFactor={1.5} className="pos-label"><div><b>bagelito✳</b><small>CAJA</small></div></Html></group>}

function Production(){return <group position={[-2.5,0,-6.2]}><RoundedBox position={[0,.75,0]} args={[5,1.5,1.5]} radius={.08}><meshStandardMaterial color="#d4dce0"/></RoundedBox><Worker position={[-1.25,0,.2]} phase={0}/><Worker position={[1.25,0,.1]} phase={1.6}/></group>}
function Worker({position,phase}:{position:[number,number,number];phase:number}){const g=useRef<THREE.Group>(null);useFrame(({clock})=>{if(g.current){g.current.rotation.z=Math.sin(clock.elapsedTime*2.6+phase)*.04}});return <group ref={g} position={position}><mesh position={[0,1.72,0]}><sphereGeometry args={[.2,16,16]}/><meshStandardMaterial color="#d09b75"/></mesh><mesh position={[0,1.12,0]}><capsuleGeometry args={[.3,.68,5,10]}/><meshStandardMaterial color="#f3f3ee"/></mesh></group>}
function AmbientPeople(){return <><MovingNPC from={[.5,0,8.1]} to={[5.2,0,5.1]} shirt="#2f61a9" bag={false} phase={0}/><MovingNPC from={[5,0,4.4]} to={[.4,0,8.2]} shirt="#8b6d55" bag phase={1.2}/><NPC position={[3.5,0,3.3]} shirt="#7f756a"/><NPC position={[4,0,2.6]} shirt="#62846f"/></>}
function NPC({position,shirt}:{position:[number,number,number];shirt:string}){return <group position={position}><mesh position={[0,1.72,0]}><sphereGeometry args={[.2,14,14]}/><meshStandardMaterial color="#c99170"/></mesh><mesh position={[0,1.1,0]}><capsuleGeometry args={[.28,.65,5,10]}/><meshStandardMaterial color={shirt}/></mesh></group>}
function MovingNPC({from,to,shirt,bag,phase}:{from:[number,number,number];to:[number,number,number];shirt:string;bag:boolean;phase:number}){const g=useRef<THREE.Group>(null),a=useMemo(()=>new THREE.Vector3(...from),[]),b=useMemo(()=>new THREE.Vector3(...to),[]);useFrame(({clock})=>{if(!g.current)return;const raw=(clock.elapsedTime/8+phase)%2,t=raw<1?raw:2-raw;g.current.position.lerpVectors(a,b,t);g.current.rotation.y=Math.atan2((raw<1?b.x-a.x:a.x-b.x),(raw<1?b.z-a.z:a.z-b.z))});return <group ref={g}><mesh position={[0,1.72,0]}><sphereGeometry args={[.2,14,14]}/><meshStandardMaterial color="#c99170"/></mesh><mesh position={[0,1.1,0]}><capsuleGeometry args={[.28,.65,5,10]}/><meshStandardMaterial color={shirt}/></mesh>{bag&&<mesh position={[.4,.75,.05]}><boxGeometry args={[.4,.48,.16]}/><meshStandardMaterial color="#fff7ee"/></mesh>}</group>}
function Tables(){return <group position={[-5.6,0,4.2]}><mesh position={[0,.6,0]}><cylinderGeometry args={[1,1,.12,28]}/><meshStandardMaterial color="#f4eee5"/></mesh><NPC position={[-.8,0,.2]} shirt="#b36a77"/><NPC position={[.7,0,-.15]} shirt="#4d6d93"/></group>}

function Hud(props:{category:Category|null;step:Step;nearest:keyof typeof ZONES|null;bagelTotal:number;bagelTarget:number;schmearTotal:number;schmearTarget:number;selectedCombo:(typeof combos)[number]|null;onCategory:(c:Category)=>void;onPack:(q:number)=>void;onCombo:(id:string)=>void;onSchmearSize:(g:number)=>void;onNextBagels:()=>void;onNextSchmears:()=>void;onReset:()=>void}) {
  const showChooser=!props.category&&(props.nearest==='totem'||props.nearest==='vitrina')
  return <div className="hud interactive-ui">
    {showChooser&&<section className="choice-panel"><small>{props.nearest==='vitrina'?'EN LA VITRINA':'TÓTEM'}</small><h2>¿Qué te provoca hoy?</h2><div className="choice-row"><button onClick={()=>props.onCategory('packs')}>🥯 <b>Packs</b><span>Grandes o minis</span></button><button onClick={()=>props.onCategory('combos')}>✨ <b>Combos</b><span>Elige tu combo</span></button><button onClick={()=>props.onCategory('schmears')}>🥣 <b>Schmears</b><span>Sabor y tamaño</span></button></div></section>}
    {props.step==='choose-pack'&&<section className="choice-panel"><small>PACKS</small><h2>Elige tu pack</h2><div className="pack-grid">{[['Grandes · 6',6],['Grandes · 12',12],['Minis · 6',6],['Minis · 12',12],['Minis · 24',24]].map(([label,q],i)=><button key={i} onClick={()=>props.onPack(Number(q))}><b>{label}</b></button>)}</div></section>}
    {props.step==='choose-combo'&&<section className="choice-panel"><small>COMBOS</small><h2>Elige tu combo</h2><div className="pack-grid">{combos.map(c=><button key={c.id} onClick={()=>props.onCombo(c.id)}><b>{c.name} · S/{c.price}</b><span>{c.bagels} bagels + {c.schmear_count} schmear{c.schmear_count>1?'s':''}</span></button>)}</div></section>}
    {props.step==='choose-schmear-size'&&<section className="choice-panel"><small>SCHMEARS</small><h2>Elige tamaño</h2><div className="size-row">{menu.schmearSizes.map(s=><button key={s.grams} onClick={()=>props.onSchmearSize(s.grams)}><b>{s.grams} g</b></button>)}</div></section>}
    {props.category&&['bagels','schmears','cashier'].includes(props.step)&&<div className="quest-chip"><small>{props.step==='bagels'?'VITRINA':props.step==='schmears'?'SCHMEARS':'CAJA'}</small><b>{props.step==='bagels'?('Elige bagels '+props.bagelTotal+'/'+props.bagelTarget):props.step==='schmears'?(props.category==='packs'?'Schmear opcional':('Elige schmears '+props.schmearTotal+'/'+props.schmearTarget)):'Acércate a la caja'}</b>{props.step==='bagels'&&props.bagelTotal===props.bagelTarget&&<button onClick={props.onNextBagels}>Continuar →</button>}{props.step==='schmears'&&(props.category==='packs'||props.schmearTotal===props.schmearTarget)&&<button onClick={props.onNextSchmears}>Ir a caja →</button>}{props.step==='cashier'&&props.nearest==='cashier'&&<button disabled>Checkout Culqi · próximamente</button>}</div>}
    {props.category&&<button className="cancel-order" onClick={props.onReset}>Cancelar pedido</button>}
  </div>
}

function MobilePad({move,setMove}:{move:Move;setMove:(m:Move)=>void}){const set=(k:keyof Move,v:boolean)=>setMove({...move,[k]:v});const bind=(k:keyof Move)=>({onPointerDown:()=>set(k,true),onPointerUp:()=>set(k,false),onPointerLeave:()=>set(k,false)});return <div className="mobile-pad interactive-ui"><button {...bind('forward')}>▲</button><button {...bind('left')}>◀</button><button {...bind('backward')}>▼</button><button {...bind('right')}>▶</button></div>}
