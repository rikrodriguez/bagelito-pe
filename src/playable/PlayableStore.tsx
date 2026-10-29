import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Html, RoundedBox, useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'
import { BAGEL_SHOWCASE_ORDER, GuidedCommerce as GoldenGuidedCommerce } from './GuidedCommerce'
import './playable.css'

const BLUE = '#004aad'
const CORAL = '#fa967f'
const IVORY = '#fffaf4'
const STEEL = '#b9c2c8'
const menu = getVerifiedDisplayMenu()
const combos = [{ id:'two-bagel-schmear', name:'2 Bagels + Schmear', bagels:2, schmear_count:1 }] as const

type Category = 'packs' | 'combos' | 'schmears'
type Step = 'explore' | 'choose-pack' | 'choose-combo' | 'choose-schmear-size' | 'bagels' | 'schmears' | 'cashier'
type Move = { forward:boolean; backward:boolean; left:boolean; right:boolean; run:boolean }
type PackFormat = 'grande' | 'mini'
type V3 = [number,number,number]
type GuideNode = 'totem' | 'vitrina' | 'selector' | 'bagels' | 'schmears' | 'production' | 'cashier' | 'pickup'

const GUIDED_CAMERAS: Record<GuideNode,{position:THREE.Vector3;lookAt:THREE.Vector3}> = {
  // Wide establishing shot: keeps the store readable while the chooser is open.
  // Approach the physical totem on the left — not the back wall.
  totem:{position:new THREE.Vector3(-3.70,1.72,7.78),lookAt:new THREE.Vector3(-5.35,1.42,5.95)},
  vitrina:{position:new THREE.Vector3(0,1.72,5.45),lookAt:new THREE.Vector3(-.35,1.15,.15)},
  selector:{position:new THREE.Vector3(0,1.72,5.65),lookAt:new THREE.Vector3(-.25,1.18,.1)},
  // Keep the eight-bagel case and the entire schmear station in frame.
  bagels:{position:new THREE.Vector3(-2.05,1.58,5.25),lookAt:new THREE.Vector3(-2.05,1.15,.2)},
  schmears:{position:new THREE.Vector3(4.20,1.58,3.70),lookAt:new THREE.Vector3(4.22,1.12,.05)},
  // Counter + worker + POS, without slicing the physical cashier.
  cashier:{position:new THREE.Vector3(5.65,1.65,7.25),lookAt:new THREE.Vector3(5.12,1.2,4.55)},
  // Rise above the glass vitrina to see the production space behind it.
  production:{position:new THREE.Vector3(0,2.62,3.85),lookAt:new THREE.Vector3(0,2.12,-8.0)},
  // Look down the side delivery lane at the real pickup shelf and courier.
  pickup:{position:new THREE.Vector3(6.95,1.70,-1.65),lookAt:new THREE.Vector3(6.68,1.45,-5.72)},
}

const TOUR_STOPS: ReadonlyArray<{node:GuideNode;title:string;description:string}> = [
  {node:'totem', title:'Bienvenido a Bagelito', description:'Mira la tienda antes de elegir.'},
  {node:'vitrina', title:'La vitrina', description:'Bagels y schmears hechos para combinar.'},
  {node:'bagels', title:'Ocho sabores de bagels', description:'Revisa cada bandeja y sus carteles azules.'},
  {node:'schmears', title:'La estación de schmears', description:'Cinco sabores para acompañar tus bagels.'},
  {node:'production', title:'Hechos aquí', description:'Un vistazo al trabajo en la cocina de Bagelito.'},
  {node:'cashier', title:'La caja', description:'Aquí revisas el pedido antes del pago seguro.'},
  {node:'pickup', title:'Retiro y delivery', description:'El área por donde salen los pedidos y llegan los repartidores.'},
]

const ZONES = {
  totem: new THREE.Vector3(-4.9, 0, 5.7),
  vitrina: new THREE.Vector3(-1.5, 0, .3),
  schmears: new THREE.Vector3(4.25, 0, -.2),
  cashier: new THREE.Vector3(5.15, 0, 4.6),
}

const SCHMEAR_COLORS = ['#eee8dd','#e3a457','#d8ddc1','#c4936b','#efabb1']

export function PlayableStore({ initialMode = 'guided' }: { initialMode?: 'guided'|'explore' } = {}) {
  const [ready, setReady] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const [player, setPlayer] = useState(new THREE.Vector3(0, 0, 7.5))
  const [experienceMode, setExperienceMode] = useState<'guided'|'explore'>(initialMode)
  const [guidedStartCategory, setGuidedStartCategory] = useState<Category|null>(null)
  const [skipGuidedEntrance, setSkipGuidedEntrance] = useState(false)
  const [category, setCategory] = useState<Category | null>(null)
  const [step, setStep] = useState<Step>('explore')
  const [introGuide, setIntroGuide] = useState<GuideNode|null>(null)
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const [packFormat, setPackFormat] = useState<PackFormat>('grande')
  const [packQty, setPackQty] = useState(6)
  const [comboId, setComboId] = useState<string | null>(null)
  const [schmearSize, setSchmearSize] = useState(120)
  const [bagels, setBagels] = useState<Record<string,number>>({})
  const [schmears, setSchmears] = useState<Record<string,number>>({})
  const [move, setMove] = useState<Move>({forward:false,backward:false,left:false,right:false,run:false})
  const look = useRef({yaw:0,pitch:-.04})

  useEffect(() => {
    setReady(true)
    const saved = localStorage.getItem('bagelito_customer_name')
    if (saved) setName(saved)
  }, [])

  useEffect(() => {
    if(experienceMode!=='explore' || introGuide!==null || category!==null){
      // A cinematic camera owns movement during the guided tour.
      // Never carry a held key into free roaming when the tour finishes.
      setMove({forward:false,backward:false,left:false,right:false,run:false})
      return
    }
    const map:Record<string,keyof Move> = {
      KeyW:'forward',ArrowUp:'forward',KeyS:'backward',ArrowDown:'backward',
      KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',
      ShiftLeft:'run',ShiftRight:'run'
    }
    const apply=(value:boolean)=>(e:KeyboardEvent)=>{
      const key=map[e.code]
      if(!key) return
      // Focused form controls must be able to type normally, but key releases
      // always clear movement so the avatar never keeps walking on blur.
      if(value && e.target instanceof HTMLElement
        && e.target.closest('input,textarea,select,[contenteditable="true"]')) return
      if(value)e.preventDefault()
      setMove(v=>({...v,[key]:value}))
    }
    const down=apply(true), up=apply(false)
    const release=()=>setMove({forward:false,backward:false,left:false,right:false,run:false})
    window.addEventListener('keydown',down,{passive:false})
    window.addEventListener('keyup',up,{passive:false})
    window.addEventListener('blur',release)
    document.addEventListener('visibilitychange',release)
    return()=>{
      window.removeEventListener('keydown',down)
      window.removeEventListener('keyup',up)
      window.removeEventListener('blur',release)
      document.removeEventListener('visibilitychange',release)
    }
  },[experienceMode,introGuide,category])

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
    return best<2.45?winner:null
  },[player])

  const tourIndex=introGuide ? TOUR_STOPS.findIndex(stop=>stop.node===introGuide) : -1

  const guideNode:GuideNode|null = category
    ? step==='bagels' ? 'bagels'
      : step==='schmears' ? 'schmears'
      : step==='cashier' ? 'cashier'
      : 'selector'
    : introGuide

  const chooseCategory=(c:Category)=>{
    setCategory(c);setBagels({});setSchmears({});setComboId(null);setIntroGuide(null)
    setStep(c==='packs'?'choose-pack':c==='combos'?'choose-combo':'choose-schmear-size')
  }
  const reset=()=>{setCategory(null);setStep('explore');setIntroGuide(null);setWelcomeDismissed(false);setBagels({});setSchmears({});setComboId(null)}
  const enterGuided=(startCategory:Category|null=null)=>{
    reset()
    setGuidedStartCategory(startCategory)
    setSkipGuidedEntrance(true)
    setExperienceMode('guided')
  }
  const addBagel=(id:string)=>{
    if(introGuide==='bagels'){
      // Tapping a physical display begins pack configuration, never invents
      // a quantity or adds an item to an unconfirmed checkout.
      enterGuided('packs')
      return
    }
    if(step!=='bagels'||bagelTotal>=bagelTarget)return
    setBagels(v=>({...v,[id]:(v[id]??0)+1}))
  }
  const addSchmear=(id:string)=>{
    if(introGuide==='schmears'){
      enterGuided('schmears')
      return
    }
    if(step!=='schmears'||schmearTotal>=Math.max(1,schmearTarget))return
    setSchmears(v=>({...v,[id]:(v[id]??0)+1}))
  }

  if(!ready)return <div className="playable-loading">Preparando Bagelito…</div>

  return <main className={'playable-shell'+(guideNode?' guided-mode':'')} data-tour-node={introGuide ?? 'none'} data-player-x={player.x.toFixed(2)}>
    {experienceMode==='guided' ? <GoldenGuidedCommerce
      customerName={name}
      initialCategory={guidedStartCategory}
      skipEntrance={skipGuidedEntrance}
      onExit={()=>setExperienceMode('explore')}
    /> : <>
    <Canvas
      shadows
      dpr={[1,1.5]}
      camera={{fov:56,near:.05,far:70,position:[0,1.68,7.5]}}
      onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.12}}
    >
      <color attach="background" args={['#f3f0e9']}/>
      <fog attach="fog" args={['#f3f0e9',24,42]}/>
      <hemisphereLight args={['#fff8ec','#62717d',1.4]}/>
      <directionalLight castShadow position={[4,9,7]} intensity={2.1} shadow-mapSize={[1536,1536]}/>
      <World step={step} bagels={bagels} schmears={schmears} onBagel={addBagel} onSchmear={addSchmear} touring={tourIndex>=0} tourNode={introGuide}/>
      <CameraController move={move} look={look} guidedNode={guideNode} onPosition={setPlayer}/>
      <ContactShadows position={[0,.01,0]} opacity={.22} scale={18} blur={2.2} far={8}/>
      <Environment preset="apartment" environmentIntensity={.42}/>
    </Canvas>
      <LookSurface look={look} disabled={Boolean(guideNode)}/>
    </>}

    {experienceMode==='explore'&&<header className="playable-top interactive-ui">
      <button className="brand-pill" onClick={()=>enterGuided(null)}><img src="/images/bagelito-wordmark.svg" alt="Bagelito"/></button>
      <div className="status-pill"><small>EXPLORA</small><b>BAGELITO STORE</b></div>
      <button type="button" className="tour-start-button" onClick={()=>{setWelcomeDismissed(true);setIntroGuide('totem')}}>
        Visita guiada 3D
      </button>
    </header>}

    {experienceMode==='explore'&&name&&step==='explore'&&<div className="hello-card interactive-ui"><small>BIENVENIDA DE VUELTA</small><strong>¡Hola {name}!</strong><span>Qué bueno verte de nuevo ;)</span></div>}

    {experienceMode==='explore'&&step==='explore'&&!category&&!welcomeDismissed&&tourIndex<0&&<div className="waypoint-hint interactive-ui">
      <span>¿Qué te provoca hoy?</span>
      <button type="button" className="primary" onClick={()=>enterGuided(null)}>Empezar pedido</button>
      <button type="button" onClick={()=>{setWelcomeDismissed(true);setIntroGuide('totem')}}>Visita guiada 3D</button>
      <button type="button" onClick={()=>setWelcomeDismissed(true)}>Explorar libre</button>
    </div>}

    {experienceMode==='explore'&&tourIndex>=0&&<div className="guided-tour-panel interactive-ui" aria-label="Recorrido guiado por Bagelito">
      <div className="guided-tour-copy">
        <small>RECORRIDO 3D · {tourIndex+1} / {TOUR_STOPS.length}</small>
        <strong>{TOUR_STOPS[tourIndex].title}</strong>
        <span>{TOUR_STOPS[tourIndex].description}</span>
      </div>
      <div className="guided-tour-actions">
        <button type="button" disabled={tourIndex===0} onClick={()=>setIntroGuide(TOUR_STOPS[tourIndex-1].node)}>← Anterior</button>
        <button type="button" className="primary" onClick={()=>{
          if(tourIndex<TOUR_STOPS.length-1)setIntroGuide(TOUR_STOPS[tourIndex+1].node)
          else setIntroGuide(null)
        }}>{tourIndex===TOUR_STOPS.length-1?'Terminar visita':'Siguiente →'}</button>
        <button type="button" onClick={()=>enterGuided(introGuide==='bagels'?'packs':introGuide==='schmears'?'schmears':null)}>Armar pedido</button>
      </div>
    </div>}

    {experienceMode==='explore'&&!guideNode&&<MobilePad move={move} setMove={setMove}/>}
    {experienceMode==='explore'&&!guideNode&&<div className="playable-help interactive-ui"><b>WASD</b> caminar · <b>arrastra</b> para mirar · acércate para interactuar</div>}
</main>
}

// Collision envelopes preserve the shopping lanes while allowing customers
// to approach every vitrina and the register. NPC routes run at the edges.
const WALK_BLOCKERS = [
  { minX:-5.95, maxX:6.65, minZ:-1.35, maxZ:1.52 }, // glass displays
  { minX:3.15, maxX:7.15, minZ:3.42, maxZ:5.94 }, // cashier counter + POS
  { minX:-7.35, maxX:-5.08, minZ:-3.03, maxZ:-.78 }, // seating island
] as const

function canWalkAt(x:number,z:number){
  return !WALK_BLOCKERS.some(box =>
    x>box.minX && x<box.maxX && z>box.minZ && z<box.maxZ
  )
}

function CameraController({move,look,guidedNode,onPosition}:{move:Move;look:React.MutableRefObject<{yaw:number;pitch:number}>;guidedNode:GuideNode|null;onPosition:(p:THREE.Vector3)=>void}) {
  const {camera}=useThree()
  const pos=useRef(new THREE.Vector3(0,1.68,7.5))
  const tick=useRef(0)
  const wasGuided=useRef(false)
  const f=useMemo(()=>new THREE.Vector3(),[])
  const r=useMemo(()=>new THREE.Vector3(),[])
  const v=useMemo(()=>new THREE.Vector3(),[])
  const desiredQuat=useMemo(()=>new THREE.Quaternion(),[])
  const targetCamera=useMemo(()=>new THREE.PerspectiveCamera(),[])

  useFrame((_,delta)=>{
    if(guidedNode){
      wasGuided.current=true
      const node=GUIDED_CAMERAS[guidedNode]
      const alpha=1-Math.exp(-delta*4.8)
      camera.position.lerp(node.position,alpha)
      targetCamera.position.copy(camera.position)
      targetCamera.up.copy(camera.up)
      targetCamera.lookAt(node.lookAt)
      desiredQuat.copy(targetCamera.quaternion)
      camera.quaternion.slerp(desiredQuat,alpha)
      pos.current.copy(camera.position)
    }else{
      if(wasGuided.current){
        // Continue free exploration from the guided camera's real bearing;
        // otherwise the old player yaw snaps the view on the first frame.
        const bearing=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ')
        look.current.yaw=bearing.y
        look.current.pitch=THREE.MathUtils.clamp(bearing.x,-.62,.42)
        wasGuided.current=false
      }
      const speed=(move.run?4:2.45)*Math.min(delta,.05)
      f.set(-Math.sin(look.current.yaw),0,-Math.cos(look.current.yaw))
      r.set(-f.z,0,f.x) // positive strafe really moves right
      v.set(0,0,0)
      if(move.forward)v.add(f);if(move.backward)v.sub(f);if(move.right)v.add(r);if(move.left)v.sub(r)
      if(v.lengthSq()){
        v.normalize().multiplyScalar(speed)
        const nextX=THREE.MathUtils.clamp(pos.current.x+v.x,-7.15,7.15)
        const nextZ=THREE.MathUtils.clamp(pos.current.z+v.z,-8.0,8.25)
        // Separate axes so walking diagonally slides along the glass counter
        // rather than clipping through it or sticking against the corner.
        if(canWalkAt(nextX,pos.current.z))pos.current.x=nextX
        if(canWalkAt(pos.current.x,nextZ))pos.current.z=nextZ
      }
      camera.position.copy(pos.current)
      camera.rotation.order='YXZ'
      camera.rotation.set(look.current.pitch,look.current.yaw,0)
    }
    if(++tick.current%8===0)onPosition(new THREE.Vector3(camera.position.x,0,camera.position.z))
  })
  return null
}

function LookSurface({look,disabled}:{look:React.MutableRefObject<{yaw:number;pitch:number}>;disabled:boolean}) {
  const drag=useRef(false),last=useRef({x:0,y:0})
  return <div className={'look-surface'+(disabled?' is-guided':'')}
    onPointerDown={e=>{if(disabled||(e.target as HTMLElement).closest('.interactive-ui,button'))return;drag.current=true;last.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId)}}
    onPointerMove={e=>{if(!drag.current)return;look.current.yaw-=(e.clientX-last.current.x)*.0038;look.current.pitch=THREE.MathUtils.clamp(look.current.pitch-(e.clientY-last.current.y)*.003,-.62,.42);last.current={x:e.clientX,y:e.clientY}}}
    onPointerUp={()=>drag.current=false}
    onPointerCancel={()=>drag.current=false}
  />
}

function World({step,bagels,schmears,onBagel,onSchmear,touring=false,tourNode=null}:{step:Step;bagels:Record<string,number>;schmears:Record<string,number>;onBagel:(id:string)=>void;onSchmear:(id:string)=>void;touring?:boolean;tourNode?:GuideNode|null}) {
  return <group>
    <StoreArchitecture/>
    <Totem/>
    <MainCounter step={step} bagels={bagels} schmears={schmears} onBagel={onBagel} onSchmear={onSchmear} tourNode={tourNode}/>
    <Cashier/>
    <Production/>
    <PickupShelf/>
    <AmbientPeople step={step} touring={touring}/>
    <Seating/>
  </group>
}

function StoreArchitecture(){
  return <group>
    <mesh receiveShadow position={[0,-.09,0]}><boxGeometry args={[16.4,.16,18.2]}/><meshStandardMaterial color="#e8e2d8" roughness={.93}/></mesh>
    {Array.from({length:9}).map((_,i)=><mesh key={'fx'+i} position={[-8+i*2,.002,0]}><boxGeometry args={[.012,.008,18]}/><meshBasicMaterial color="#d2cbc0" transparent opacity={.55}/></mesh>)}
    {Array.from({length:10}).map((_,i)=><mesh key={'fz'+i} position={[0,.002,-9+i*2]}><boxGeometry args={[16,.008,.012]}/><meshBasicMaterial color="#d2cbc0" transparent opacity={.55}/></mesh>)}

    <mesh position={[0,2.65,-8.4]} receiveShadow><boxGeometry args={[16.4,5.3,.18]}/><meshStandardMaterial color="#fffdf8"/></mesh>
    <mesh position={[-8.1,2.3,0]}><boxGeometry args={[.16,4.6,18]}/><meshStandardMaterial color="#fffdf8"/></mesh>
    <mesh position={[8.1,2.3,0]}><boxGeometry args={[.16,4.6,18]}/><meshStandardMaterial color="#fffdf8"/></mesh>
    <mesh position={[0,4.65,0]}><boxGeometry args={[16.4,.16,18]}/><meshStandardMaterial color="#f3f0ea"/></mesh>

    <mesh position={[0,4.2,-8.27]}><boxGeometry args={[16.2,.16,.12]}/><meshStandardMaterial color={BLUE}/></mesh>
    <mesh position={[0,3.7,-8.25]}><boxGeometry args={[5.9,.08,.08]}/><meshStandardMaterial color={CORAL}/></mesh>

    {/* Layered wall and ceiling construction, not a single bare white box. */}
    <mesh position={[0,.23,-8.27]}><boxGeometry args={[16,.38,.12]}/><meshStandardMaterial color="#e8dfd5" roughness={.95}/></mesh>
    <mesh position={[0,.43,-8.20]}><boxGeometry args={[16,.055,.09]}/><meshStandardMaterial color={BLUE} roughness={.42}/></mesh>
    <mesh position={[0,4.55,-6.45]}><boxGeometry args={[15.8,.16,.13]}/><meshStandardMaterial color="#e0cbbc" roughness={.85}/></mesh>
    <mesh position={[0,4.54,2.2]}><boxGeometry args={[15.8,.16,.13]}/><meshStandardMaterial color="#e0cbbc" roughness={.85}/></mesh>
    {[-7.92,7.92].map(side=><group key={side}>
      <mesh position={[side,2.35,0]}><boxGeometry args={[.06,4.5,17.7]}/><meshStandardMaterial color="#ede4da" roughness={.86}/></mesh>
      {[-6,-3,0,3,6].map(z=><mesh key={z} position={[side>0?7.99:-7.99,2.4,z]}><boxGeometry args={[.035,4.2,.055]}/><meshStandardMaterial color="#cfd9df" metalness={.22} roughness={.62}/></mesh>)}
      <mesh position={[side>0?7.95:-7.95,.22,0]}><boxGeometry args={[.08,.28,17.5]}/><meshStandardMaterial color="#c3d0d8" roughness={.63}/></mesh>
    </group>)}
    {[-5.7,-3.2,-.7,1.8,4.3].map(x=><group key={x}>
      <mesh position={[x,4.52,1.45]}><boxGeometry args={[.08,.09,11.4]}/><meshStandardMaterial color="#dfd1c4" roughness={.92}/></mesh>
      <mesh position={[x,4.43,1.45]}><boxGeometry args={[.032,.018,11.4]}/><meshStandardMaterial color="#ffe1b3" emissive="#f2bf7c" emissiveIntensity={.28}/></mesh>
    </group>)}
    <mesh position={[0,4.05,-8.17]}><boxGeometry args={[16.1,.04,.12]}/><meshStandardMaterial color="#e7bb8d" emissive="#fbc18a" emissiveIntensity={.2}/></mesh>

    <TileGrid position={[-6.2,2.65,-8.16]} width={3.4} height={4.5}/>
    <TileGrid position={[6.3,2.65,-8.16]} width={3.0} height={4.5}/>

    <Html transform position={[0,3.58,-8.12]} distanceFactor={5.5} className="world-logo"><img src="/images/bagelito-wordmark.svg" alt="Bagelito"/></Html>
    <MenuBoard/>
    <ProductionPortal/>
    <Pendant position={[-4.9,4.0,2.2]}/>
    <Pendant position={[-1.8,4.05,1.1]}/>
    <Pendant position={[2.0,4.0,1.0]}/>
    <Pendant position={[5.0,4.0,2.0]}/>
    <Plant position={[-7.25,0,-6.8]}/>
    <Plant position={[7.2,0,-6.7]}/>
  </group>
}

function ProductionPortal(){
  return <group position={[0,2.05,-8.03]}>
    <mesh position={[0,0,0]}><boxGeometry args={[8.6,2.35,.11]}/><meshStandardMaterial color="#e9e5de"/></mesh>
    <mesh position={[0,.95,.075]}><boxGeometry args={[8.4,.11,.08]}/><meshStandardMaterial color={BLUE}/></mesh>
    <mesh position={[0,-.95,.075]}><boxGeometry args={[8.4,.11,.08]}/><meshStandardMaterial color="#d3d9dc" metalness={.55}/></mesh>
    <Html transform position={[0,.25,.09]} distanceFactor={4.6} className="production-copy">
      <div><small>HECHOS AQUÍ</small><b>Hecho a mano, cada día.</b><span>Mira cómo los hacemos mientras armamos tu pedido.</span></div>
    </Html>
  </group>
}

function TileGrid({position,width,height}:{position:V3;width:number;height:number}){
  const lines=[]
  for(let x=-width/2;x<=width/2+.01;x+=.55)lines.push(<mesh key={'v'+x} position={[x,0,.01]}><boxGeometry args={[.012,height,.01]}/><meshBasicMaterial color="#d7e0e5"/></mesh>)
  for(let y=-height/2;y<=height/2+.01;y+=.55)lines.push(<mesh key={'h'+y} position={[0,y,.01]}><boxGeometry args={[width,.012,.01]}/><meshBasicMaterial color="#d7e0e5"/></mesh>)
  return <group position={position}>{lines}</group>
}

function Pendant({position}:{position:V3}){
  return <group position={position}>
    <mesh position={[0,.38,0]}><cylinderGeometry args={[.014,.014,.75,8]}/><meshStandardMaterial color="#1f2b34"/></mesh>
    <mesh position={[0,-.05,0]}><sphereGeometry args={[.25,24,24]}/><meshPhysicalMaterial color="#fff2d6" emissive="#ffd89d" emissiveIntensity={.7} roughness={.24}/></mesh>
    <pointLight position={[0,-.28,0]} intensity={3.1} distance={5.5} color="#ffd9aa"/>
  </group>
}

function Plant({position}:{position:V3}){
  return <group position={position}>
    <mesh position={[0,.28,0]}><cylinderGeometry args={[.32,.24,.56,18]}/><meshStandardMaterial color="#e9e0d4"/></mesh>
    {[-.25,0,.25].map((x,i)=><mesh key={i} position={[x,.92,0]} rotation={[0,0,(i-1)*.35]}><sphereGeometry args={[.22,.48,10,16]}/><meshStandardMaterial color="#4d7b55"/></mesh>)}
  </group>
}

function MenuBoard(){
  return <group position={[-5.95,2.45,-8.03]}>
    <mesh><boxGeometry args={[3.5,3.55,.11]}/><meshStandardMaterial color="#fffaf4"/></mesh>
    <Html transform position={[0,0,.065]} distanceFactor={4.1} className="menu-board">
      <div>
        <h4>BAGELS</h4>
        {menu.bagels.map(b=><p key={b.id}><span>{b.name.toUpperCase()}</span><b>{b.premium ? "PREMIUM" : "BAGEL"}</b></p>)}
        <h4>SCHMEARS</h4>
        {menu.schmears.map(s=><p key={s.id}><span>{s.name.toUpperCase()}</span><b>SCHMEAR</b></p>)}
      </div>
    </Html>
  </group>
}

function Totem(){
  return <group position={[-5.4,0,5.95]} rotation={[0,.16,0]} scale={.86}>
    <mesh position={[0,.08,0]}><cylinderGeometry args={[.5,.58,.14,24]}/><meshStandardMaterial color="#c8d0d5" metalness={.45}/></mesh>
    <mesh position={[0,.65,0]}><cylinderGeometry args={[.07,.09,1.2,14]}/><meshStandardMaterial color="#b5c0c7" metalness={.7}/></mesh>
    <RoundedBox castShadow position={[0,1.72,0]} args={[1.18,1.92,.18]} radius={.12}><meshStandardMaterial color="#f8f8f6"/></RoundedBox>
    <mesh position={[0,1.72,.105]}><planeGeometry args={[.96,1.62]}/><meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={.09}/></mesh>
    <Html transform position={[0,1.72,.12]} distanceFactor={1.55} className="totem-ui"><div><img src="/images/bagelito-wordmark.svg"/><b>¿Qué te provoca hoy?</b><span>Packs · Combos · Schmears</span><small>TOCA PARA PEDIR</small></div></Html>
  </group>
}

function MainCounter(props:{step:Step;bagels:Record<string,number>;schmears:Record<string,number>;onBagel:(id:string)=>void;onSchmear:(id:string)=>void;tourNode?:GuideNode|null}){
  return <group>
    <BagelCase {...props} inspectOnly={props.tourNode==='bagels'}/>
    <SchmearCase step={props.step} counts={props.schmears} onSchmear={props.onSchmear} inspectOnly={props.tourNode==='schmears'}/>
  </group>
}

/** Each SKU is a separate photograph on a physical tray, not a panorama
 * stretched across one wall. Transparent product art keeps its real appearance,
 * while metal dividers, shadows, blue nameplates and parallax provide depth.
 */
function BagelShowcaseProduct({flavorId,position}:{flavorId:string;position:V3}){
  const texture=useTexture('/images/bagel-'+flavorId+'.webp')
  texture.colorSpace=THREE.SRGBColorSpace
  return <group position={position}>
    <mesh castShadow position={[0,-.01,-.18]}>
      <planeGeometry args={[1.36,.83]}/>
      <meshBasicMaterial map={texture} transparent alphaTest={.025} side={THREE.DoubleSide} depthWrite={false} toneMapped={false}/>
    </mesh>
    <mesh position={[0,-.43,-.21]} rotation={[0,0,0]}>
      <planeGeometry args={[1.2,.10]}/>
      <meshBasicMaterial color="#c7a37f" transparent opacity={.20} depthWrite={false}/>
    </mesh>
  </group>
}

function BagelCase({step,bagels,onBagel,inspectOnly=false}:{step:Step;bagels:Record<string,number>;onBagel:(id:string)=>void;inspectOnly?:boolean}){
  const xs=[-2.52,-.84,.84,2.52]
  return <group position={[-2.1,0,.2]}>
    <RoundedBox castShadow receiveShadow position={[0,.34,0]} args={[7.2,.68,1.92]} radius={.05}>
      <meshStandardMaterial color="#c3cbd0" metalness={.72} roughness={.22}/>
    </RoundedBox>

    {/* Eight individual porcelain-lined wells, each a real 3D location. */}
    {BAGEL_SHOWCASE_ORDER.map((flavorId,index)=>{
      const bagel=menu.bagels.find(item=>item.id===flavorId)
      if(!bagel)return null
      const row=index<4?0:1
      const col=index%4
      const x=xs[col]
      const clickY=row===0?1.62:.98
      const signY=row===0?1.45:.73
      const photoY=row===0?1.78:1.10
      const count=bagels[bagel.id]??0
      return <group key={bagel.id}>
        <RoundedBox receiveShadow castShadow position={[x,clickY,-.15]} args={[1.57,.78,1.0]} radius={.055}>
          <meshStandardMaterial color="#eee8df" metalness={.10} roughness={.67}/>
        </RoundedBox>
        <mesh position={[x,clickY,-.147]}>
          <planeGeometry args={[1.48,.69]}/>
          <meshBasicMaterial color="#f8f4ed"/>
        </mesh>
        <BagelShowcaseProduct flavorId={bagel.id} position={[x,photoY,.78]}/>
        <RoundedBox position={[x,signY,1.005]} args={[1.57,.29,.035]} radius={.035}>
          <meshStandardMaterial color={BLUE} roughness={.43} metalness={.05}/>
        </RoundedBox>
        <Html transform position={[x,signY,1.03]} distanceFactor={2.5} className="bagelito-3d-blue-sign">
          <div>{bagel.name.toUpperCase()}</div>
        </Html>
        <PhotoHotspot position={[x,clickY,1.06]} size={[1.50,.58]} active={step==='bagels'||inspectOnly} browseOnly={inspectOnly} selected={count>0} count={count} label={bagel.name} onClick={()=>onBagel(bagel.id)}/>
      </group>
    })}
    {/* Solid shelf structure and slim chrome frames create true perspective. */}
    {[-3.48,-1.68,0,1.68,3.48].map((x)=><mesh key={x} position={[x,1.27,.95]}>
      <boxGeometry args={[.045,1.75,.065]}/>
      <meshStandardMaterial color="#72838e" metalness={.83} roughness={.2}/>
    </mesh>)}
    {[.71,1.32,2.12].map(y=><mesh key={y} position={[0,y,.95]}>
      <boxGeometry args={[7.05,.055,.065]}/>
      <meshStandardMaterial color="#71828b" metalness={.8} roughness={.22}/>
    </mesh>)}
    <mesh position={[0,2.16,.42]} rotation={[-.4,0,0]}>
      <boxGeometry args={[7.1,.04,1.15]}/>
      <meshPhysicalMaterial color="#effaff" transmission={.95} transparent opacity={.11} roughness={.04}/>
    </mesh>
    <mesh position={[0,1.31,.965]}>
      <boxGeometry args={[7.04,1.72,.024]}/>
      <meshPhysicalMaterial color="#effaff" transmission={.95} transparent opacity={.055} roughness={.045} depthWrite={false}/>
    </mesh>
    <mesh position={[0,2.16,.92]}>
      <boxGeometry args={[7.07,.048,.07]}/>
      <meshStandardMaterial color="#687d8c" metalness={.86} roughness={.19}/>
    </mesh>
  </group>
}

/** Whipped product is modeled in five individual chilled pans. No panorama
 * or baked-in menu copy: each pan is an actual 3D object with its own label.
 */
function SchmearBowl({position,color,herbs=false}:{position:V3;color:string;herbs?:boolean}){
  return <group position={position} rotation={[.72,0,0]}>
    <mesh castShadow receiveShadow>
      <cylinderGeometry args={[.38,.33,.19,32]}/>
      <meshStandardMaterial color="#d4dce0" metalness={.78} roughness={.24}/>
    </mesh>
    <mesh position={[0,.108,0]}>
      <cylinderGeometry args={[.345,.345,.035,32]}/>
      <meshStandardMaterial color={color} roughness={.94}/>
    </mesh>
    <mesh position={[0,.13,0]} scale={[1,.25,1]}>
      <sphereGeometry args={[.315,24,14]}/>
      <meshStandardMaterial color={color} roughness={.9}/>
    </mesh>
    {[.245,.16,.085].map((radius,i)=><mesh key={i}
      rotation={[Math.PI/2,0,0]}
      position={[0,.19+i*.035,0]}>
      <torusGeometry args={[radius,.034-i*.004,8,32]}/>
      <meshStandardMaterial color={color} roughness={.96}/>
    </mesh>)}
    {herbs && Array.from({length:11}).map((_,i)=>{
      const angle=i*2.39996
      const radius=.08+(i%4)*.062
      return <mesh key={i} position={[Math.cos(angle)*radius,.22,Math.sin(angle)*radius]}>
        <sphereGeometry args={[.015,6,5]}/>
        <meshStandardMaterial color="#4e7551" roughness={.98}/>
      </mesh>
    })}
  </group>
}

function SchmearCase({step,counts,onSchmear,inspectOnly=false}:{step:Step;counts:Record<string,number>;onSchmear:(id:string)=>void;inspectOnly?:boolean}){
  const positions:V3[]=[
    [-1.22,1.73,.77],[0,1.73,.77],[1.22,1.73,.77],
    [-.64,1.02,.77],[.64,1.02,.77],
  ]
  return <group position={[4.25,0,-.05]}>
    <RoundedBox castShadow position={[0,.34,0]} args={[4.25,.68,1.92]} radius={.05}>
      <meshStandardMaterial color="#c3cbd0" metalness={.72} roughness={.22}/>
    </RoundedBox>
    <mesh position={[0,1.28,-.12]}>
      <boxGeometry args={[4.08,1.80,.08]}/>
      <meshStandardMaterial color="#f5f0e9" roughness={.72}/>
    </mesh>
    {/* Individual wells and whipped cream replace the flat photo surface. */}
    {menu.schmears.map((item,index)=>{
      const count=counts[item.id]??0
      const [x,y,z]=positions[index]
      return <group key={item.id}>
        <RoundedBox position={[x,y,-.07]} args={[1.06,.62,.88]} radius={.065}>
          <meshStandardMaterial color="#e3e5e4" metalness={.56} roughness={.34}/>
        </RoundedBox>
        <SchmearBowl position={[x,y+.05,z]} color={SCHMEAR_COLORS[index]} herbs={index===2}/>
        <RoundedBox position={[x,y-.34,1.02]} args={[1.12,.22,.035]} radius={.025}>
          <meshStandardMaterial color="#fffaf4" roughness={.63}/>
        </RoundedBox>
        <Html transform position={[x,y-.34,1.045]} distanceFactor={2.4} className="schmear-3d-sign">
          <div>{item.name.toUpperCase()}</div>
        </Html>
        <PhotoHotspot position={[x,y,1.08]} size={[1.05,.51]}
          active={step==='schmears'||inspectOnly} browseOnly={inspectOnly} selected={count>0} count={count}
          label={item.name} onClick={()=>onSchmear(item.id)}/>
      </group>
    })}
    <mesh position={[0,.76,.96]}>
      <boxGeometry args={[4.15,.05,.06]}/>
      <meshStandardMaterial color="#6f7d86" metalness={.82}/>
    </mesh>
    <mesh position={[0,2.16,.96]}>
      <boxGeometry args={[4.15,.05,.06]}/>
      <meshStandardMaterial color="#6f7d86" metalness={.82}/>
    </mesh>
    <mesh position={[0,1.28,.965]}>
      <boxGeometry args={[4.12,1.79,.024]}/>
      <meshPhysicalMaterial color="#effaff" transmission={.95}
        transparent opacity={.045} roughness={.04} depthWrite={false}/>
    </mesh>
    <mesh position={[0,2.13,.46]} rotation={[-.38,0,0]}>
      <boxGeometry args={[4.16,.035,1.1]}/>
      <meshPhysicalMaterial color="#effaff" transmission={.94}
        transparent opacity={.11} roughness={.04}/>
    </mesh>
  </group>
}

function PhotoHotspot({position,size,active,selected,count,label,onClick,browseOnly=false}:{position:V3;size:[number,number];active:boolean;selected:boolean;count:number;label:string;onClick:()=>void;browseOnly?:boolean}){
  return <group position={position}>
    <mesh
      onClick={e=>{e.stopPropagation();if(active)onClick()}}
      onPointerOver={()=>{if(active)document.body.style.cursor='pointer'}}
      onPointerOut={()=>document.body.style.cursor='default'}
    >
      <planeGeometry args={size}/>
      <meshBasicMaterial transparent opacity={selected?.11:active?.018:0} color={selected?CORAL:BLUE} depthWrite={false}/>
    </mesh>
    {selected&&<mesh position={[0,0,.012]}>
      <planeGeometry args={[size[0]*.96,size[1]*.92]}/>
      <meshBasicMaterial transparent opacity={.09} color={CORAL} depthWrite={false}/>
    </mesh>}
    {active&&<Html transform position={[size[0]*.34,size[1]*.28,.025]} distanceFactor={2.15} className="vitrina-hotspot">
      <div data-selected={selected}><span>{browseOnly?'→':selected?count:'+'}</span><small>{browseOnly?'Elegir '+label:label}</small></div>
    </Html>}
  </group>
}

function Production(){
  return <group position={[-2.0,0,-5.9]}>
    <mesh position={[0,1.9,-.55]}><boxGeometry args={[8.2,3.4,.16]}/><meshStandardMaterial color="#e6e2db"/></mesh>
    <mesh position={[0,3.25,-.42]}><boxGeometry args={[8.0,.13,.18]}/><meshStandardMaterial color={BLUE}/></mesh>
    <RoundedBox position={[-1.4,.72,0]} args={[5.5,1.32,1.5]} radius={.06}><meshStandardMaterial color="#d5dadd" metalness={.6} roughness={.22}/></RoundedBox>
    <Worker position={[-2.2,0,.2]} phase={0}/>
    <Worker position={[-.35,0,.2]} phase={1.4}/>
    <Oven position={[2.6,0,-.1]}/>
    <DoughBalls/>
  </group>
}

function Oven({position}:{position:V3}){
  return <group position={position}>
    <RoundedBox position={[0,1.2,0]} args={[1.65,2.35,1.2]} radius={.08}><meshStandardMaterial color="#aeb7bd" metalness={.78} roughness={.18}/></RoundedBox>
    <mesh position={[0,1.45,.62]}><boxGeometry args={[1.25,.72,.05]}/><meshStandardMaterial color="#202a30"/></mesh>
    <mesh position={[0,1.45,.65]}><planeGeometry args={[1.06,.54]}/><meshStandardMaterial color="#f0a95b" emissive="#f08b3e" emissiveIntensity={.7}/></mesh>
  </group>
}

function DoughBalls(){
  return <group position={[-1.4,1.46,.2]}>
    {[-1.6,-1.15,-.7,-.25,.2,.65,1.1].map((x,i)=><mesh key={i} position={[x,0,.05+(i%2)*.18]}><sphereGeometry args={[.12,14,14]}/><meshStandardMaterial color="#ead6b4" roughness={.9}/></mesh>)}
  </group>
}

function Worker({position,phase}:{position:V3;phase:number}){
  const g=useRef<THREE.Group>(null)
  useFrame(({clock})=>{if(g.current){g.current.rotation.z=Math.sin(clock.elapsedTime*2.8+phase)*.022}})
  return <group ref={g} position={position}>
    <CharacterBody shirt="#f7f6f3" uniform/>
    <mesh position={[0,2.04,0]}><cylinderGeometry args={[.24,.24,.055,20]}/><meshStandardMaterial color="#fffaf4"/></mesh>
  </group>
}

function Cashier(){
  return <group position={[5.2,0,4.65]} rotation={[0,-.7,0]}>
    <RoundedBox castShadow position={[0,.66,0]} args={[3.6,1.3,1.4]} radius={.09}><meshStandardMaterial color="#f9f7f2" roughness={.78}/></RoundedBox>
    <mesh position={[0,1.33,0]}><boxGeometry args={[3.78,.085,1.56]}/><meshStandardMaterial color="#f2e8df" roughness={.28}/></mesh>
    <mesh position={[0,.68,.716]}><boxGeometry args={[3.46,1.12,.025]}/><meshStandardMaterial color="#e7dbcb" roughness={.92}/></mesh>
    {Array.from({length:18}).map((_,i)=><mesh key={i} position={[-1.62+i*.19,.69,.735]}><boxGeometry args={[.025,1.08,.026]}/><meshStandardMaterial color="#cdbda9" roughness={.92}/></mesh>)}
    <mesh position={[0,1.18,.742]}><boxGeometry args={[3.47,.07,.038]}/><meshStandardMaterial color={BLUE} roughness={.45}/></mesh>
    <mesh position={[-.55,1.48,.02]}><boxGeometry args={[1.18,.76,.12]}/><meshStandardMaterial color={BLUE}/></mesh>
    <mesh position={[-.55,1.04,0]}><boxGeometry args={[.18,.54,.18]}/><meshStandardMaterial color="#aeb8bf" metalness={.7}/></mesh>
    <RoundedBox position={[.72,1.18,.26]} args={[.54,.76,.28]} radius={.08}><meshStandardMaterial color="#e3eaee"/></RoundedBox>
    <ReceiptPrinter position={[1.35,1.08,-.2]}/>
    <Bag position={[-1.28,1.55,-.15]}/>
    <CashierNPC position={[0,0,-.9]}/>
    <Html transform position={[-.55,1.48,.09]} distanceFactor={1.5} className="pos-label"><div><b>bagelito✳</b><small>CAJA</small></div></Html>
  </group>
}

function ReceiptPrinter({position}:{position:V3}){
  return <group position={position}>
    <RoundedBox args={[.58,.38,.55]} radius={.06}><meshStandardMaterial color="#ecefed"/></RoundedBox>
    <mesh position={[0,.23,.06]}><boxGeometry args={[.42,.24,.015]}/><meshStandardMaterial color="#fff"/></mesh>
  </group>
}

function Bag({position}:{position:V3}){
  return <group position={position}>
    <mesh><boxGeometry args={[.62,.82,.18]}/><meshStandardMaterial color="#f8efe4"/></mesh>
    <mesh position={[0,.49,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.18,.025,8,18,Math.PI]}/><meshStandardMaterial color={BLUE}/></mesh>
  </group>
}

function CashierNPC({position}:{position:V3}){
  return <group position={position}>
    <CharacterBody shirt="#f9f7f2" uniform/>
  </group>
}

function PickupShelf(){
  return <group position={[6.75,0,-5.8]}>
    {[-.7,.25,1.2].map((y,i)=><mesh key={i} position={[0,y+.85,0]}><boxGeometry args={[1.9,.08,.72]}/><meshStandardMaterial color="#51616b" metalness={.5}/></mesh>)}
    <mesh position={[0,1.55,-.38]}><boxGeometry args={[1.95,3.1,.08]}/><meshStandardMaterial color="#e9ecec"/></mesh>
    <Html transform position={[0,3.0,-.3]} distanceFactor={2.7} className="pickup-label"><div>PICKUP</div></Html>
    <Bag position={[-.45,1.14,.05]}/><Bag position={[.45,1.14,.05]}/>
  </group>
}

function Seating(){
  return <group position={[-6.25,0,-1.9]}>
    <mesh position={[0,.65,0]}><cylinderGeometry args={[.92,.92,.1,28]}/><meshStandardMaterial color="#f2e7da"/></mesh>
    <mesh position={[0,.33,0]}><cylinderGeometry args={[.08,.16,.62,14]}/><meshStandardMaterial color="#71818c" metalness={.55}/></mesh>
    <NPC position={[-.9,0,.2]} shirt="#b36a77" seated/>
    <NPC position={[.85,0,-.15]} shirt="#536f92" seated/>
    <mesh position={[0,.78,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.18,.08,12,24]}/><meshStandardMaterial color="#d69d55"/></mesh>
  </group>
}

function AmbientPeople({step,touring=false}:{step:Step;touring?:boolean}){
  const guided=touring||step!=='explore'
  return <>
    {/* Rappi stays visible but moves on the far pickup lane, never through the sales camera. */}
    <MovingNPC from={[7.35,0,7.5]} to={[7.35,0,-4.9]} shirt="#22272b" backpack="#f36f21" phase={0}/>
    {/* Customer with bag exits along the opposite wall. */}
    <MovingNPC from={[-6.5,0,-3.8]} to={[-6.6,0,7.7]} shirt="#8e6c52" bag phase={.95}/>
    {!guided&&<>
      <NPC position={[3.7,0,3.45]} shirt="#7a746c"/>
      <NPC position={[4.15,0,2.7]} shirt="#5e826f"/>
    </>}
    {guided&&<>
      <NPC position={[6.6,0,-2.6]} shirt="#7a746c"/>
      <NPC position={[-6.5,0,-2.8]} shirt="#5e826f"/>
    </>}
  </>
}

/* Fully articulated bakery silhouettes replace the old sphere + capsule placeholders.
   Keep the same positions/routes so foreground sales cameras stay unobstructed. */
function CharacterBody({shirt,skin='#c58e6d',uniform=false,seated=false,walking=false}:{shirt:string;skin?:string;uniform?:boolean;seated?:boolean;walking?:boolean}){
  const pants=uniform?'#46566b':'#3b4f65'
  const sole='#29343d'
  return <group>
    <RoundedBox castShadow position={[0,seated?.96:1.18,0]} args={[.53,.72,.33]} radius={.09}><meshStandardMaterial color={shirt} roughness={.88}/></RoundedBox>
    <mesh castShadow position={[0,seated?1.36:1.62,0]}><cylinderGeometry args={[.105,.12,.16,14]}/><meshStandardMaterial color={skin} roughness={.93}/></mesh>
    <mesh castShadow position={[0,seated?1.60:1.85,0]}><sphereGeometry args={[.225,24,18]}/><meshStandardMaterial color={skin} roughness={.93}/></mesh>
    <mesh castShadow position={[0,seated?1.77:2.01,-.02]} scale={[1.02,.35,1]}><sphereGeometry args={[.224,20,12]}/><meshStandardMaterial color={uniform?'#322a29':'#403832'} roughness={.97}/></mesh>
    <mesh position={[-.23,seated?1.60:1.85,0]}><sphereGeometry args={[.037,12,10]}/><meshStandardMaterial color={skin}/></mesh>
    <mesh position={[.23,seated?1.60:1.85,0]}><sphereGeometry args={[.037,12,10]}/><meshStandardMaterial color={skin}/></mesh>
    {[-1,1].map(side=><group key={side}>
      <mesh castShadow position={[side*.37,seated?.98:1.20,.015]} rotation={[0,0,side*.13]}><capsuleGeometry args={[.09,.44,6,12]}/><meshStandardMaterial color={shirt} roughness={.9}/></mesh>
      <mesh position={[side*.42,seated?.70:.91,.035]}><sphereGeometry args={[.095,14,10]}/><meshStandardMaterial color={skin} roughness={.93}/></mesh>
      <mesh castShadow position={[side*.145,seated?.49:.43,seated?.30:.015]} rotation={[seated?1.12:walking?side*.14:0,0,0]}><capsuleGeometry args={[.125,.49,6,12]}/><meshStandardMaterial color={pants} roughness={.94}/></mesh>
      <RoundedBox castShadow position={[side*.15,seated?.22:.08,seated?.53:.12]} args={[.22,.12,.35]} radius={.035}><meshStandardMaterial color={sole} roughness={.8}/></RoundedBox>
    </group>)}
    {uniform&&<>
      <RoundedBox position={[0,1.07,.185]} args={[.42,.64,.038]} radius={.025}><meshStandardMaterial color="#004aad" roughness={.74}/></RoundedBox>
      <mesh position={[0,1.26,.209]}><boxGeometry args={[.27,.055,.014]}/><meshStandardMaterial color="#fffaf4"/></mesh>
      <mesh position={[0,1.05,.21]}><boxGeometry args={[.24,.014,.012]}/><meshStandardMaterial color="#fffaf4"/></mesh>
      <mesh position={[0,.98,.21]}><boxGeometry args={[.24,.014,.012]}/><meshStandardMaterial color="#fffaf4"/></mesh>
    </>}
  </group>
}

function NPC({position,shirt,seated=false}:{position:V3;shirt:string;seated?:boolean}){
  return <group position={position} scale={.83}>
    <CharacterBody shirt={shirt} seated={seated}/>
  </group>
}

function MovingNPC({from,to,shirt,backpack,bag,phase}:{from:V3;to:V3;shirt:string;backpack?:string;bag?:boolean;phase:number}){
  const g=useRef<THREE.Group>(null)
  const a=useMemo(()=>new THREE.Vector3(...from),[])
  const b=useMemo(()=>new THREE.Vector3(...to),[])
  useFrame(({clock})=>{
    if(!g.current)return
    const raw=(clock.elapsedTime/9+phase)%2,t=raw<1?raw:2-raw
    g.current.position.lerpVectors(a,b,t)
    g.current.rotation.y=Math.atan2((raw<1?b.x-a.x:a.x-b.x),(raw<1?b.z-a.z:a.z-b.z))
  })
  return <group ref={g} scale={.82}>
    <CharacterBody shirt={shirt} walking/>
    {backpack&&<RoundedBox castShadow position={[0,1.18,.28]} args={[.45,.77,.26]} radius={.07}><meshStandardMaterial color={backpack} roughness={.76}/></RoundedBox>}
    {bag&&<Bag position={[.48,.76,.12]}/>}
  </group>
}

function MobilePad({move,setMove}:{move:Move;setMove:React.Dispatch<React.SetStateAction<Move>>}){
  const set=(k:keyof Move,v:boolean)=>setMove(prev=>({...prev,[k]:v}))
  const bind=(k:keyof Move)=>({onPointerDown:()=>set(k,true),onPointerUp:()=>set(k,false),onPointerLeave:()=>set(k,false),onPointerCancel:()=>set(k,false)})
  return <div className="mobile-pad interactive-ui"><button {...bind('forward')}>▲</button><button {...bind('left')}>◀</button><button {...bind('backward')}>▼</button><button {...bind('right')}>▶</button></div>
}
