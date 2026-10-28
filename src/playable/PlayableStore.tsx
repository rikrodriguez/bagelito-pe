import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Html, RoundedBox, useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'
import './playable.css'

const BLUE = '#004aad'
const CORAL = '#fa967f'
const IVORY = '#fffaf4'
const STEEL = '#b9c2c8'
const menu = getVerifiedDisplayMenu()
const combos = menu.historicalPublishedCombos

type Category = 'packs' | 'combos' | 'schmears'
type Step = 'explore' | 'choose-pack' | 'choose-combo' | 'choose-schmear-size' | 'bagels' | 'schmears' | 'cashier'
type Move = { forward:boolean; backward:boolean; left:boolean; right:boolean; run:boolean }
type PackFormat = 'grande' | 'mini'
type V3 = [number,number,number]
type GuideNode = 'totem' | 'vitrina' | 'selector' | 'bagels' | 'schmears' | 'cashier'

const GUIDED_CAMERAS: Record<GuideNode,{position:THREE.Vector3;lookAt:THREE.Vector3}> = {
  totem:{position:new THREE.Vector3(-3.45,1.68,7.25),lookAt:new THREE.Vector3(-4.9,1.55,5.7)},
  vitrina:{position:new THREE.Vector3(0,1.72,4.9),lookAt:new THREE.Vector3(-.3,1.1,.15)},
  selector:{position:new THREE.Vector3(0,1.72,5.35),lookAt:new THREE.Vector3(0,1.25,.1)},
  bagels:{position:new THREE.Vector3(-2.05,1.62,3.15),lookAt:new THREE.Vector3(-2.05,.95,.25)},
  schmears:{position:new THREE.Vector3(4.15,1.62,2.75),lookAt:new THREE.Vector3(4.25,.95,.05)},
  cashier:{position:new THREE.Vector3(5.9,1.68,6.05),lookAt:new THREE.Vector3(5.15,1.15,4.6)},
}

const ZONES = {
  totem: new THREE.Vector3(-4.9, 0, 5.7),
  vitrina: new THREE.Vector3(-1.5, 0, .3),
  schmears: new THREE.Vector3(4.25, 0, -.2),
  cashier: new THREE.Vector3(5.15, 0, 4.6),
}

const BAGEL_COLORS = ['#d5a15d','#c38a4f','#dcb56f','#b97843','#cb793e','#de8a3d','#9f6847','#8b6653']
const SCHMEAR_COLORS = ['#eee8dd','#e3a457','#d8ddc1','#c4936b','#efabb1']

export function PlayableStore() {
  const [ready, setReady] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const [player, setPlayer] = useState(new THREE.Vector3(0, 0, 8.25))
  const [category, setCategory] = useState<Category | null>(null)
  const [step, setStep] = useState<Step>('explore')
  const [introGuide, setIntroGuide] = useState<'totem'|'vitrina'|null>(null)
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
    return best<2.45?winner:null
  },[player])

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
  const reset=()=>{setCategory(null);setStep('explore');setIntroGuide(null);setBagels({});setSchmears({});setComboId(null)}
  const addBagel=(id:string)=>{
    if(step!=='bagels'||bagelTotal>=bagelTarget)return
    setBagels(v=>({...v,[id]:(v[id]??0)+1}))
  }
  const addSchmear=(id:string)=>{
    if(step!=='schmears'||schmearTotal>=Math.max(1,schmearTarget))return
    setSchmears(v=>({...v,[id]:(v[id]??0)+1}))
  }

  if(!ready)return <div className="playable-loading">Preparando Bagelito…</div>

  return <main className="playable-shell">
    <Canvas
      shadows
      dpr={[1,1.5]}
      camera={{fov:60,near:.05,far:70,position:[0,1.68,8.25]}}
      onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.12}}
    >
      <color attach="background" args={['#f3f0e9']}/>
      <fog attach="fog" args={['#f3f0e9',24,42]}/>
      <hemisphereLight args={['#fff8ec','#62717d',1.4]}/>
      <directionalLight castShadow position={[4,9,7]} intensity={2.1} shadow-mapSize={[1536,1536]}/>
      <World step={step} bagels={bagels} schmears={schmears} onBagel={addBagel} onSchmear={addSchmear}/>
      <CameraController move={move} look={look} guidedNode={guideNode} onPosition={setPlayer}/>
      <ContactShadows position={[0,.01,0]} opacity={.22} scale={18} blur={2.2} far={8}/>
      <Environment preset="apartment" environmentIntensity={.42}/>
    </Canvas>

    <LookSurface look={look} disabled={Boolean(guideNode)}/>

    <header className="playable-top interactive-ui">
      <button className="brand-pill" onClick={reset}><img src="/images/bagelito-wordmark.svg" alt="Bagelito"/></button>
      <div className="status-pill"><small>{step==='explore'?'EXPLORA':'PEDIDO ACTIVO'}</small><b>{category?.toUpperCase() ?? 'BAGELITO STORE'}</b></div>
    </header>

    {name&&step==='explore'&&<div className="hello-card interactive-ui"><small>BIENVENIDA DE VUELTA</small><strong>¡Hola {name}!</strong><span>Qué bueno verte de nuevo ;)</span></div>}

    {step==='explore'&&!category&&<div className="waypoint-hint interactive-ui">
      <span>Empieza tu pedido</span>
      <button type="button" onClick={()=>setIntroGuide('totem')}>Ir al tótem</button>
      <button type="button" onClick={()=>setIntroGuide('vitrina')}>Ir a la vitrina →</button>
    </div>}

    {category&&<GuidedProgress step={step}/>} 

    <Hud
      category={category} step={step} nearest={introGuide ?? nearest}
      packFormat={packFormat}
      bagelTotal={bagelTotal} bagelTarget={bagelTarget}
      schmearTotal={schmearTotal} schmearTarget={schmearTarget}
      selectedCombo={selectedCombo}
      onCategory={chooseCategory}
      onPack={(format,q)=>{setPackFormat(format);setPackQty(q);setStep('bagels')}}
      onCombo={(id)=>{setComboId(id);setStep('bagels')}}
      onSchmearSize={(g)=>{setSchmearSize(g);setStep('schmears')}}
      onNextBagels={()=>bagelTotal===bagelTarget&&setStep('schmears')}
      onNextSchmears={()=>{if(category==='packs'||schmearTotal===schmearTarget)setStep('cashier')}}
      onReset={reset}
      schmearSize={schmearSize}
    />

    <MobilePad move={move} setMove={setMove}/>
    <div className="playable-help interactive-ui"><b>WASD</b> caminar · <b>arrastra</b> para mirar · acércate para interactuar</div>
  </main>
}

function CameraController({move,look,guidedNode,onPosition}:{move:Move;look:React.MutableRefObject<{yaw:number;pitch:number}>;guidedNode:GuideNode|null;onPosition:(p:THREE.Vector3)=>void}) {
  const {camera}=useThree()
  const pos=useRef(new THREE.Vector3(0,1.68,8.25))
  const tick=useRef(0)
  const f=useMemo(()=>new THREE.Vector3(),[])
  const r=useMemo(()=>new THREE.Vector3(),[])
  const v=useMemo(()=>new THREE.Vector3(),[])
  const desiredQuat=useMemo(()=>new THREE.Quaternion(),[])
  const dummy=useMemo(()=>new THREE.Object3D(),[])

  useFrame((_,delta)=>{
    if(guidedNode){
      const node=GUIDED_CAMERAS[guidedNode]
      const alpha=1-Math.exp(-delta*4.8)
      camera.position.lerp(node.position,alpha)
      dummy.position.copy(camera.position)
      dummy.lookAt(node.lookAt)
      desiredQuat.copy(dummy.quaternion)
      camera.quaternion.slerp(desiredQuat,alpha)
      pos.current.copy(camera.position)
    }else{
      const speed=(move.run?4:2.45)*Math.min(delta,.05)
      f.set(-Math.sin(look.current.yaw),0,-Math.cos(look.current.yaw))
      r.set(f.z,0,-f.x)
      v.set(0,0,0)
      if(move.forward)v.add(f);if(move.backward)v.sub(f);if(move.right)v.add(r);if(move.left)v.sub(r)
      if(v.lengthSq()){v.normalize().multiplyScalar(speed);pos.current.add(v)}
      pos.current.x=THREE.MathUtils.clamp(pos.current.x,-7.15,7.15)
      pos.current.z=THREE.MathUtils.clamp(pos.current.z,-8.0,8.25)
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

function World({step,bagels,schmears,onBagel,onSchmear}:{step:Step;bagels:Record<string,number>;schmears:Record<string,number>;onBagel:(id:string)=>void;onSchmear:(id:string)=>void}) {
  return <group>
    <StoreArchitecture/>
    <Totem/>
    <MainCounter step={step} bagels={bagels} schmears={schmears} onBagel={onBagel} onSchmear={onSchmear}/>
    <Cashier/>
    <Production/>
    <PickupShelf/>
    <AmbientPeople/>
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

    <TileGrid position={[-6.2,2.65,-8.16]} width={3.4} height={4.5}/>
    <TileGrid position={[6.3,2.65,-8.16]} width={3.0} height={4.5}/>

    <ApprovedBackdrop/>
    <Pendant position={[-4.9,4.0,2.2]}/>
    <Pendant position={[5.0,4.0,2.0]}/>
    <Plant position={[-7.25,0,-6.8]}/>
    <Plant position={[7.2,0,-6.7]}/>
  </group>
}

function ApprovedBackdrop(){
  const source=useTexture('/images/store-reference-approved.webp')
  const texture=useMemo(()=>{
    const t=source.clone()
    t.needsUpdate=true
    t.wrapS=THREE.ClampToEdgeWrapping
    t.wrapT=THREE.ClampToEdgeWrapping
    t.repeat.set(1,.335)
    t.offset.set(0,.665)
    t.colorSpace=THREE.SRGBColorSpace
    return t
  },[source])
  return <group>
    <mesh position={[0,2.68,-8.13]}>
      <planeGeometry args={[15.55,3.47]}/>
      <meshBasicMaterial map={texture} toneMapped={false}/>
    </mesh>
    <mesh position={[0,1.04,-8.08]}>
      <boxGeometry args={[15.5,.11,.08]}/>
      <meshStandardMaterial color="#d2d7d8" metalness={.52} roughness={.3}/>
    </mesh>
  </group>
}

function GuidedProgress({step}:{step:Step}){
  const active=step==='bagels'?2:step==='schmears'?3:step==='cashier'?4:1
  const labels=['Elige','Bagels','Schmears','Caja','Pago']
  return <div className="guided-progress interactive-ui" aria-label="Progreso del pedido">
    {labels.map((label,index)=><div key={label} data-active={active===index+1} data-done={active>index+1}>
      <i>{active>index+1?'✓':index+1}</i><span>{label}</span>
    </div>)}
  </div>
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
    <mesh position={[0,-.05,0]}><sphereGeometry args={[.34,24,24]}/><meshStandardMaterial color="#fff2d6" emissive="#ffd89d" emissiveIntensity={1.4}/></mesh>
    <pointLight position={[0,-.28,0]} intensity={8} distance={5.5} color="#ffd9aa"/>
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
        {menu.bagels.map(b=><p key={b.id}><span>{b.name.toUpperCase()}</span><b>8</b></p>)}
        <h4>SCHMEARS</h4>
        {menu.schmears.map(s=><p key={s.id}><span>{s.name.toUpperCase()}</span><b>7</b></p>)}
      </div>
    </Html>
  </group>
}

function Totem(){
  return <group position={[-4.9,0,5.7]} rotation={[0,.22,0]}>
    <mesh position={[0,.08,0]}><cylinderGeometry args={[.5,.58,.14,24]}/><meshStandardMaterial color="#c8d0d5" metalness={.45}/></mesh>
    <mesh position={[0,.65,0]}><cylinderGeometry args={[.07,.09,1.2,14]}/><meshStandardMaterial color="#b5c0c7" metalness={.7}/></mesh>
    <RoundedBox castShadow position={[0,1.72,0]} args={[1.18,1.92,.18]} radius={.12}><meshStandardMaterial color="#f8f8f6"/></RoundedBox>
    <mesh position={[0,1.72,.105]}><planeGeometry args={[.96,1.62]}/><meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={.09}/></mesh>
    <Html transform position={[0,1.72,.12]} distanceFactor={1.55} className="totem-ui"><div><img src="/images/bagelito-wordmark.svg"/><b>¿Qué te provoca hoy?</b><span>Packs · Combos · Schmears</span><small>ACÉRCATE</small></div></Html>
  </group>
}

function MainCounter(props:{step:Step;bagels:Record<string,number>;schmears:Record<string,number>;onBagel:(id:string)=>void;onSchmear:(id:string)=>void}){
  return <group>
    <BagelCase {...props}/>
    <SchmearCase step={props.step} counts={props.schmears} onSchmear={props.onSchmear}/>
  </group>
}

function BagelCase({step,bagels,onBagel}:{step:Step;bagels:Record<string,number>;onBagel:(id:string)=>void}){
  return <group position={[-2.1,0,.2]}>
    <RoundedBox castShadow receiveShadow position={[0,.72,0]} args={[7.2,1.44,1.95]} radius={.06}><meshStandardMaterial color={STEEL} metalness={.62} roughness={.26}/></RoundedBox>
    <mesh position={[0,1.43,.22]}><boxGeometry args={[7.0,.82,.05]}/><meshPhysicalMaterial color="#dff4ff" transmission={.92} transparent opacity={.19} roughness={.08} metalness={0}/></mesh>
    <mesh position={[0,1.86,-.52]} rotation={[-.52,0,0]}><boxGeometry args={[7.0,.06,1.28]}/><meshPhysicalMaterial color="#eaf7ff" transmission={.88} transparent opacity={.18} roughness={.08}/></mesh>
    <mesh position={[0,1.18,-.9]}><boxGeometry args={[7.0,.06,.06]}/><meshStandardMaterial color="#697983" metalness={.8}/></mesh>
    {menu.bagels.map((b,i)=>{
      const row=i<4?0:1,col=i%4,x=-2.7+col*1.8,y=row===0?1.34:.62,z=.25,count=bagels[b.id]??0
      return <BagelTray key={b.id} bagel={b} index={i} position={[x,y,z]} active={step==='bagels'} count={count} onClick={onBagel}/>
    })}
  </group>
}

function BagelTray({bagel,index,position,active,count,onClick}:{bagel:(typeof menu.bagels)[number];index:number;position:V3;active:boolean;count:number;onClick:(id:string)=>void}){
  const variants=[
    [[-.22,.02,.02],[.18,.02,-.08],[0,.03,.2]],
    [[-.2,.02,.04],[.2,.02,.02],[.02,.03,.22]],
    [[-.24,.02,.02],[.18,.02,-.06],[-.02,.03,.2]]
  ]
  return <group position={position}>
    <mesh position={[0,-.05,0]}><boxGeometry args={[1.48,.08,.74]}/><meshStandardMaterial color="#d1d6d8" metalness={.72} roughness={.2}/></mesh>
    {variants[index%3].map((p,j)=><Bagel3D key={j} variant={bagel.id} color={BAGEL_COLORS[index]} position={[p[0],p[1],p[2]]} active={active} selected={count>0} onClick={()=>onClick(bagel.id)}/>)}
    <Html transform position={[0,-.24,.4]} distanceFactor={2.45} className="product-label"><div><b>{bagel.name}</b>{count>0&&<span>{count}</span>}</div></Html>
  </group>
}

function Bagel3D({variant,color,position,active,selected,onClick}:{variant:string;color:string;position:V3;active:boolean;selected:boolean;onClick:()=>void}){
  const seedColor=variant==='blueberry'?'#5e476a':variant==='cinnamon-raisin'?'#5d4338':variant==='jalapeno-cheddar'?'#4c7f42':variant==='everything'?'#1f2930':variant==='sesame'?'#f0d19c':'#bd7c48'
  const toppingCount=['plain','cheddar'].includes(variant)?0:variant==='jalapeno-cheddar'?3:5
  return <group position={position} rotation={[Math.PI/2,0,0]} scale={selected?1.06:1}>
    <mesh castShadow onClick={e=>{e.stopPropagation();if(active)onClick()}} onPointerOver={()=>{if(active)document.body.style.cursor='pointer'}} onPointerOut={()=>document.body.style.cursor='default'}>
      <torusGeometry args={[.23,.105,18,36]}/>
      <meshStandardMaterial color={variant==='cheddar'?'#e58c38':color} roughness={.58} metalness={.02} emissive={active?BLUE:'#000'} emissiveIntensity={active?.025:0}/>
    </mesh>
    {Array.from({length:toppingCount}).map((_,i)=>{
      const a=(i/toppingCount)*Math.PI*2+.45
      const rr=.19+(i%2)*.025
      return <mesh key={i} position={[Math.cos(a)*rr,Math.sin(a)*rr,.095]}>
        <sphereGeometry args={[variant==='jalapeno-cheddar'?.035:.018,8,8]}/>
        <meshStandardMaterial color={seedColor}/>
      </mesh>
    })}
  </group>
}

function SchmearCase({step,counts,onSchmear}:{step:Step;counts:Record<string,number>;onSchmear:(id:string)=>void}){
  return <group position={[4.25,0,-.05]}>
    <RoundedBox castShadow position={[0,.72,0]} args={[4.25,1.44,1.95]} radius={.06}><meshStandardMaterial color={STEEL} metalness={.62} roughness={.26}/></RoundedBox>
    <mesh position={[0,1.43,.22]}><boxGeometry args={[4.05,.82,.05]}/><meshPhysicalMaterial color="#dff4ff" transmission={.92} transparent opacity={.19} roughness={.08}/></mesh>
    {menu.schmears.map((s,i)=>{const row=i<3?0:1,col=i<3?i:i-3,x=-1.28+col*1.28,y=row===0?1.25:.62,c=counts[s.id]??0;return <group key={s.id} position={[x,y,.2]}>
      <mesh onClick={e=>{e.stopPropagation();if(step==='schmears')onSchmear(s.id)}} onPointerOver={()=>{if(step==='schmears')document.body.style.cursor='pointer'}} onPointerOut={()=>document.body.style.cursor='default'}>
        <cylinderGeometry args={[.48,.44,.2,32]}/><meshStandardMaterial color="#f3f4f2" metalness={.12}/>
      </mesh>
      <mesh position={[0,.12,0]}><cylinderGeometry args={[.405,.405,.075,32]}/><meshStandardMaterial color={SCHMEAR_COLORS[i]} roughness={.88}/></mesh>
      <mesh position={[0,.175,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.16,.025,8,28]}/><meshStandardMaterial color={i===1?'#d78435':i===4?'#df8993':'#d3c3aa'}/></mesh>
      <Html transform position={[0,-.29,.25]} distanceFactor={2.4} className="product-label"><div><b>{s.name}</b>{c>0&&<span>{c}</span>}</div></Html>
    </group>})}
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
  useFrame(({clock})=>{if(g.current){g.current.rotation.z=Math.sin(clock.elapsedTime*2.8+phase)*.035}})
  return <group ref={g} position={position}>
    <mesh position={[0,1.76,0]}><sphereGeometry args={[.2,16,16]}/><meshStandardMaterial color="#c98f6a"/></mesh>
    <mesh position={[0,1.38,0]}><cylinderGeometry args={[.22,.28,.13,16]}/><meshStandardMaterial color={BLUE}/></mesh>
    <mesh position={[0,1.12,0]}><capsuleGeometry args={[.3,.64,5,10]}/><meshStandardMaterial color="#f5f4ef"/></mesh>
    <mesh position={[0,1.02,.27]}><boxGeometry args={[.54,.68,.035]}/><meshStandardMaterial color={BLUE}/></mesh>
    <mesh position={[-.28,1.0,.36]} rotation={[-.65,0,.25]}><capsuleGeometry args={[.07,.42,4,8]}/><meshStandardMaterial color="#c98f6a"/></mesh>
    <mesh position={[.28,1.0,.36]} rotation={[-.65,0,-.25]}><capsuleGeometry args={[.07,.42,4,8]}/><meshStandardMaterial color="#c98f6a"/></mesh>
  </group>
}

function Cashier(){
  return <group position={[5.2,0,4.65]} rotation={[0,-.7,0]}>
    <RoundedBox castShadow position={[0,.66,0]} args={[3.6,1.3,1.4]} radius={.09}><meshStandardMaterial color="#f9f7f2"/></RoundedBox>
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
    <mesh position={[0,1.72,0]}><sphereGeometry args={[.2,16,16]}/><meshStandardMaterial color="#c58b68"/></mesh>
    <mesh position={[0,1.12,0]}><capsuleGeometry args={[.3,.64,5,10]}/><meshStandardMaterial color="#f5f4ef"/></mesh>
    <mesh position={[0,1.02,.26]}><boxGeometry args={[.54,.7,.035]}/><meshStandardMaterial color={BLUE}/></mesh>
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
  return <group position={[-6.0,0,4.4]}>
    <mesh position={[0,.65,0]}><cylinderGeometry args={[.92,.92,.1,28]}/><meshStandardMaterial color="#f2e7da"/></mesh>
    <mesh position={[0,.33,0]}><cylinderGeometry args={[.08,.16,.62,14]}/><meshStandardMaterial color="#71818c" metalness={.55}/></mesh>
    <NPC position={[-.9,0,.2]} shirt="#b36a77" seated/>
    <NPC position={[.85,0,-.15]} shirt="#536f92" seated/>
    <mesh position={[0,.78,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.18,.08,12,24]}/><meshStandardMaterial color="#d69d55"/></mesh>
  </group>
}

function AmbientPeople(){
  return <>
    <MovingNPC from={[.6,0,8.0]} to={[6.25,0,-4.9]} shirt="#22272b" backpack="#f36f21" phase={0}/>
    <MovingNPC from={[4.8,0,4.3]} to={[-.2,0,8.05]} shirt="#8e6c52" bag phase={.95}/>
    <NPC position={[3.7,0,3.45]} shirt="#7a746c"/>
    <NPC position={[4.15,0,2.7]} shirt="#5e826f"/>
  </>
}

function NPC({position,shirt,seated=false}:{position:V3;shirt:string;seated?:boolean}){
  return <group position={position} scale={seated?.84:1}>
    <mesh position={[0,seated?1.18:1.72,0]}><sphereGeometry args={[.2,14,14]}/><meshStandardMaterial color="#c58e6d"/></mesh>
    <mesh position={[0,seated?.68:1.1,0]}><capsuleGeometry args={[.28,.64,5,10]}/><meshStandardMaterial color={shirt}/></mesh>
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
  return <group ref={g}>
    <mesh position={[0,1.72,0]}><sphereGeometry args={[.2,14,14]}/><meshStandardMaterial color="#c58e6d"/></mesh>
    <mesh position={[0,1.1,0]}><capsuleGeometry args={[.28,.64,5,10]}/><meshStandardMaterial color={shirt}/></mesh>
    {backpack&&<RoundedBox position={[0,1.15,.28]} args={[.5,.72,.2]} radius={.05}><meshStandardMaterial color={backpack}/></RoundedBox>}
    {bag&&<Bag position={[.4,.8,.05]}/>}
  </group>
}

function Hud(props:{
  category:Category|null;step:Step;nearest:keyof typeof ZONES|null;packFormat:PackFormat;
  bagelTotal:number;bagelTarget:number;schmearTotal:number;schmearTarget:number;schmearSize:number;
  selectedCombo:(typeof combos)[number]|null;
  onCategory:(c:Category)=>void;onPack:(f:PackFormat,q:number)=>void;onCombo:(id:string)=>void;onSchmearSize:(g:number)=>void;
  onNextBagels:()=>void;onNextSchmears:()=>void;onReset:()=>void
}){
  const showChooser=!props.category&&(props.nearest==='totem'||props.nearest==='vitrina')
  return <div className="hud interactive-ui">
    {showChooser&&<section className="choice-panel"><small>{props.nearest==='vitrina'?'EN LA VITRINA':'TÓTEM DE PEDIDOS'}</small><h2>¿Qué te provoca hoy?</h2><div className="choice-row"><button onClick={()=>props.onCategory('packs')}>🥯 <b>Packs</b><span>Grandes o minis</span></button><button onClick={()=>props.onCategory('combos')}>✨ <b>Combos</b><span>Elige tu combo</span></button><button onClick={()=>props.onCategory('schmears')}>🥣 <b>Schmears</b><span>Sabor y tamaño</span></button></div></section>}

    {props.step==='choose-pack'&&<section className="choice-panel"><small>PACKS</small><h2>Elige tu pack</h2><div className="pack-grid">
      <button onClick={()=>props.onPack('grande',6)}><b>Grandes · 6</b><span>S/50 un sabor · S/60 mixto</span></button>
      <button onClick={()=>props.onPack('grande',12)}><b>Grandes · 12</b><span>S/100 un sabor · S/115 mixto</span></button>
      <button onClick={()=>props.onPack('mini',6)}><b>Minis · 6</b><span>S/20 un sabor · S/25 mixto</span></button>
      <button onClick={()=>props.onPack('mini',12)}><b>Minis · 12</b><span>S/35 un sabor · S/40 mixto</span></button>
      <button onClick={()=>props.onPack('mini',24)}><b>Minis · 24</b><span>S/70 un sabor · S/75 mixto</span></button>
    </div></section>}

    {props.step==='choose-combo'&&<section className="choice-panel"><small>COMBOS</small><h2>Elige tu combo</h2><div className="pack-grid">{combos.map(c=><button key={c.id} onClick={()=>props.onCombo(c.id)}><b>{c.name} · S/{c.price}</b><span>{c.bagels} bagels + {c.schmear_count} schmear{c.schmear_count>1?'s':''}</span></button>)}</div></section>}

    {props.step==='choose-schmear-size'&&<section className="choice-panel"><small>SCHMEARS</small><h2>Elige tamaño</h2><div className="size-row">{menu.schmearSizes.map(s=><button key={s.grams} onClick={()=>props.onSchmearSize(s.grams)}><b>{s.grams} g</b></button>)}</div></section>}

    {props.category&&['bagels','schmears','cashier'].includes(props.step)&&<div className="quest-chip">
      <small>{props.step==='bagels'?'VITRINA DE BAGELS':props.step==='schmears'?'ESTACIÓN DE SCHMEARS':'CAJA'}</small>
      <b>{props.step==='bagels'?('Elige bagels '+props.bagelTotal+'/'+props.bagelTarget):props.step==='schmears'?(props.category==='packs'?('Schmear opcional · '+props.schmearSize+' g'):('Elige schmears '+props.schmearTotal+'/'+props.schmearTarget)):'Acércate a la caja'}</b>
      {props.step==='bagels'&&props.bagelTotal===props.bagelTarget&&<button onClick={props.onNextBagels}>Continuar →</button>}
      {props.step==='schmears'&&(props.category==='packs'||props.schmearTotal===props.schmearTarget)&&<button onClick={props.onNextSchmears}>Ir a caja →</button>}
      {props.step==='cashier'&&props.nearest==='cashier'&&<button disabled>Checkout Culqi · próximamente</button>}
    </div>}

    {props.category&&<button className="cancel-order" onClick={props.onReset}>Cancelar pedido</button>}
  </div>
}

function MobilePad({move,setMove}:{move:Move;setMove:(m:Move)=>void}){
  const set=(k:keyof Move,v:boolean)=>setMove({...move,[k]:v})
  const bind=(k:keyof Move)=>({onPointerDown:()=>set(k,true),onPointerUp:()=>set(k,false),onPointerLeave:()=>set(k,false),onPointerCancel:()=>set(k,false)})
  return <div className="mobile-pad interactive-ui"><button {...bind('forward')}>▲</button><button {...bind('left')}>◀</button><button {...bind('backward')}>▼</button><button {...bind('right')}>▶</button></div>
}
