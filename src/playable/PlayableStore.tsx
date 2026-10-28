import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, PerformanceMonitor, RoundedBox, useGLTF } from '@react-three/drei'
import { Physics, CuboidCollider, CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'
import './playable.css'

const BLUE = '#004aad'
const CORAL = '#fa967f'
const menu = getVerifiedDisplayMenu()
const combos = menu.historicalPublishedCombos

type Category = 'packs' | 'combos' | 'schmears'
type Step = 'explore' | 'choose-pack' | 'choose-combo' | 'choose-schmear-size' | 'bagels' | 'schmears' | 'cashier'
type Vec3 = [number, number, number]
type MoveInput = { forward: boolean; backward: boolean; left: boolean; right: boolean; run: boolean }

const ZONES = {
  totem: new THREE.Vector3(-3.2, 0, 6.2),
  vitrina: new THREE.Vector3(0, 0, 0.4),
  schmears: new THREE.Vector3(5.0, 0, -0.6),
  cashier: new THREE.Vector3(5.4, 0, 4.2),
} as const

export function PlayableStore() {
  const [mounted, setMounted] = useState(false)
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [player, setPlayer] = useState(new THREE.Vector3(0, 0, 7.3))
  const [category, setCategory] = useState<Category | null>(null)
  const [step, setStep] = useState<Step>('explore')
  const [packFormat, setPackFormat] = useState<'grande' | 'mini'>('grande')
  const [packQty, setPackQty] = useState(6)
  const [comboId, setComboId] = useState<string | null>(null)
  const [schmearSize, setSchmearSize] = useState(120)
  const [bagelCounts, setBagelCounts] = useState<Record<string, number>>({})
  const [schmearCounts, setSchmearCounts] = useState<Record<string, number>>({})
  const [move, setMove] = useState<MoveInput>({ forward: false, backward: false, left: false, right: false, run: false })
  const l...[truncated]  useEffect(() => {
    setMounted(true)
    const name = window.localStorage.getItem('bagelito_customer_name')
    if (name?.trim()) setCustomerName(name.trim())
  }, [])

  useEffect(() => {
    const keys: Record<string, keyof MoveInput> = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'backward', ArrowDown: 'backward',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'run', ShiftRight: 'run',
    }
    const change = (value: boolean) => (event: KeyboardEvent) => {
      const key = keys[event.code]
      if (!key) return
      event.preventDefault()
      setMove((current) => current[key] === value ? current : { ...current, [key]: value })
    }
    const down = change(true)
    const up = change(false)
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up, { passive: false })
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const selectedCombo = combos.find((item) => item.id === comboId) ?? null
  const bagelTarget = category === 'packs' ? packQty : selectedCombo?.bagels ?? 0
  const schmearTarget = category === 'combos' ? selectedCombo?.schmear_count ?? 0 : category === 'schmears' ? 1 : 0
  const bagelTotal = Object.values(bagelCounts).reduce((a, b) => a + b, 0)
  const schmearTotal = Object.values(schmearCounts).reduce((a, b) => a + b, 0)

  const nearest = useMemo(() => {
    let winner: keyof typeof ZONES | null = null
    let best = Infinity
    for (const [key, pos] of Object.entries(ZONES) as [keyof typeof ZONES, THREE.Vector3][]) {
      const d = Math.hypot(player.x - pos.x, player.z - pos.z)
      if (d < best) { best = d; winner = key }
    }
    return best < 2.25 ? winner : null
  }, [player])

  const chooseCategory = useCallback((value: Category) => {
    setCategory(value)
    setBagelCounts({})
    setSchmearCounts({})
    setComboId(null)
    if (value === 'packs') setStep('choose-pack')
    if (value === 'combos') setStep('choose-combo')
    if (value === 'schmears') setStep('choose-schmear-size')
  }, [])

  const addBagel = useCallback((id: string) => {
    if (step !== 'bagels' || bagelTotal >= bagelTarget) return
    setBagelCounts((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }))
  }, [step, bagelTotal, bagelTarget])

  const addSchmear = useCallback((id: string) => {
    if (step !== 'schmears' || schmearTotal >= Math.max(1, schmearTarget)) return
    setSchmearCounts((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }))
  }, [step, schmearTotal, schmearTarget])

  function resetOrder() {
    setCategory(null); setStep('explore'); setBagelCounts({}); setSchmearCounts({}); setComboId(null)
  }

  if (!mounted) return <div className="playable-loading">Preparando Bagelito…</div>

  return <main className="playable-shell">
    <Canvas shadows dpr={[1, 1.6]} camera={{ fov: 67, near: 0.05, far: 70, position: [0, 1.65, 7.3] }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <Suspense fallback={null}>
        <PerformanceMonitor onDecline={() => {}} />
        <Physics gravity={[0, -18, 0]} timeStep="vary">
          <BagelitoWorld step={step} bagelCounts={bagelCounts} schmearCounts={schmearCounts} onBagel={addBagel} onSchmear={addSchmear} />
          <FirstPersonPlayer move={move} look={look} onPosition={setPlayer} />
        </Physics>
        <Environment preset="city" environmentIntensity={0.35} />
      </Suspense>
    </Canvas>

    <LookSurface look={look} />
    <header className="playable-hud-top interactive-ui">
      <button className="playable-logo" type="button" onClick={resetOrder}>bagelito<span>✳</span></button>
      <div className="playable-order-chip"><small>{step === 'explore' ? 'EXPLORA' : 'PEDIDO ACTIVO'}</small><b>{category ? category.toUpperCase() : 'Bagelito Store'}</b></div>
    </header>

    {customerName && step === 'explore' && <div className="returning-greeting interactive-ui">
      <small>RECONOCIDO ✓</small><strong>¡Hola {customerName}!</strong><span>Qué bueno verte de nuevo ;)</span>
    </div>}

    <GuidedHud
      category={category}
      step={step}
      nearest={nearest}
      packFormat={packFormat}
      packQty={packQty}
      comboId={comboId}
      schmearSize={schmearSize}
      bagelTarget={bagelTarget}
      bagelTotal={bagelTotal}
      schmearTarget={schmearTarget}
      schmearTotal={schmearTotal}
      onCategory={chooseCategory}
      onPack={(format, qty) => { setPackFormat(format); setPackQty(qty); setStep('bagels') }}
      onCombo={(id) => { setComboId(id); setStep('bagels') }}
      onSchmearSize={(grams) => { setSchmearSize(grams); setStep('schmears') }}
      onContinueBagels={() => { if (bagelTotal === bagelTarget) setStep('schmears') }}
      onContinueSchmears={() => { if (category === 'packs' || schmearTotal === schmearTarget) setStep('cashier') }}
      onReset={resetOrder}
      selectedCombo={selectedCombo}
    />

    <MobilePad move={move} setMove={setMove} />
    <div className="playable-help interactive-ui"><b>WASD</b> caminar · <b>arrastra</b> para mirar · <b>clic</b> para interactuar</div>
  </main>
}

function FirstPersonPlayer({ move, look, onPosition }: { move: MoveInput; look: React.MutableRefObject<{ yaw: number; pitch: number }>; onPosition: (p: THREE.Vector3) => void }) {
  const body = useRef<RapierRigidBody>(null)
  const { world } = useRapier()
  const { camera } = useThree()
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null)
  const tick = useRef(0)
  const desired = useMemo(() => new THREE.Vector3(), [])
  const forward = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const c = world.createCharacterController(0.025)
    c.enableAutostep(0.3, 0.18, true)
    c.enableSnapToGround(0.25)
    controller.current = c
    return () => {
      world.removeCharacterController(c)
      controller.current = null
    }
  }, [world])

  useFrame((_, delta) => {
    const rb = body.current
    const c = controller.current
    if (!rb || !c || rb.numColliders() === 0) return

    const speed = move.run ? 3.45 : 2.25
    forward.set(-Math.sin(look.current.yaw), 0, -Math.cos(look.current.yaw)).normalize()
    right.set(forward.z, 0, -forward.x).normalize()
    desired.set(0, 0, 0)
    if (move.forward) desired.add(forward)
    if (move.backward) desired.sub(forward)
    if (move.right) desired.add(right)
    if (move.left) desired.sub(right)
    if (desired.lengthSq() > 0) desired.normalize().multiplyScalar(speed * Math.min(delta, 0.05))

    const collider = rb.collider(0)
    c.computeColliderMovement(collider, { x: desired.x, y: -0.015, z: desired.z })
    const correction = c.computedMovement()
    const p = rb.translation()
    rb.setNextKinematicTranslation({ x: p.x + correction.x, y: p.y + correction.y, z: p.z + correction.z })

    const next = rb.translation()
    camera.position.set(next.x, next.y + 0.94, next.z)
    camera.rotation.order = 'YXZ'
    camera.rotation.set(look.current.pitch, look.current.yaw, 0)
    if (++tick.current % 8 === 0) onPosition(new THREE.Vector3(next.x, next.y, next.z))
  })

  return <RigidBody ref={body} type="kinematicPosition" position={[0, .78, 7.3]} colliders={false} enabledRotations={[false,false,false]} canSleep={false}>
    <CapsuleCollider args={[.46,.30]} />
  </RigidBody>
}

function LookSurface({ look }: { look: React.MutableRefObject<{ yaw: number; pitch: number }> }) {
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  return <div className="look-surface"
    onPointerDown={(e) => {
      if ((e.target as HTMLElement).closest('button,.interactive-ui')) return
      dragging.current = true; last.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId)
    }}
    onPointerMove={(e) => {
      if (!dragging.current) return
      const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y
      look.current.yaw -= dx * 0.0042
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - dy * 0.0032, -0.75, 0.55)
      last.current = { x: e.clientX, y: e.clientY }
    }}
    onPointerUp={() => { dragging.current = false }}
    onPointerCancel={() => { dragging.current = false }}
  />
}

function BagelitoWorld(props: { step: Step; bagelCounts: Record<string, number>; schmearCounts: Record<string, number>; onBagel: (id: string) => void; onSchmear: (id: string) => void }) {
  return <group>
    <color attach="background" args={['#f6f7f4']} />
    <fog attach="fog" args={['#f6f7f4', 18, 37]} />
    <ambientLight intensity={1.25} />
    <directionalLight castShadow position={[4, 9, 4]} intensity={2.2} shadow-mapSize={[1024, 1024]} />

    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[8.8, 0.1, 10]} position={[0, -0.1, 0]} />
      <CuboidCollider args={[8.8, 2.5, 0.12]} position={[0, 2.5, -9.2]} />
      <CuboidCollider args={[0.12, 2.5, 10]} position={[-8.8, 2.5, 0]} />
      <CuboidCollider args={[0.12, 2.5, 10]} position={[8.8, 2.5, 0]} />
    </RigidBody>

    <mesh receiveShadow position={[0, -0.11, 0]}><boxGeometry args={[17.6, 0.18, 19.8]} /><meshStandardMaterial color="#cce7e8" roughness={0.9} /></mesh>
    <GridFloor /><BackWall /><Entrance /><Totem />
    <BagelCounter step={props.step} counts={props.bagelCounts} onBagel={props.onBagel} />
    <SchmearStation step={props.step} counts={props.schmearCounts} onSchmear={props.onSchmear} />
    <CashierCounter /><ProductionArea /><AmbientNPCs /><Seating />
  </group>
}

function GridFloor() {
  const lines = []
  for (let i = -8; i <= 8; i += 2) lines.push(<mesh key={'x'+i} position={[i, 0.005, 0]}><boxGeometry args={[0.015, 0.01, 19]} /><meshBasicMaterial color="#a9d1d4" transparent opacity={0.55} /></mesh>)
  for (let z = -9; z <= 9; z += 2) lines.push(<mesh key={'z'+z} position={[0, 0.005, z]}><boxGeometry args={[17, 0.01, 0.015]} /><meshBasicMaterial color="#a9d1d4" transparent opacity={0.55} /></mesh>)
  return <>{lines}</>
}

function BackWall() {
  return <group position={[0, 0, -8.9]}>
    <mesh position={[0, 2.7, 0]}><boxGeometry args={[17.3, 5.4, 0.18]} /><meshStandardMaterial color="#fffdf8" /></mesh>
    <Html transform position={[0, 3.75, 0.12]} distanceFactor={6} className="world-logo-wrap"><img className="world-logo-img" src="/images/bagelito-logo.svg" alt="Bagelito" /></Html>
  </group>
}

function Entrance() {
  return <group position={[0, 0, 9.0]}>
    <mesh position={[-2.1, 2, 0]}><boxGeometry args={[3.5, 4, 0.12]} /><meshPhysicalMaterial color="#d9f2ff" transparent opacity={0.22} transmission={...[truncated]  return <group position={[-3.2, 0, 6.2]} rotation={[0, 0.34, 0]}>
    <mesh position={[0, 0.08, 0]}><cylinderGeometry args={[.62, .75, .16, 24]} /><meshStandardMaterial color="#d9e1e7" metalness={.3} /></mesh>
    <RoundedBox castShadow position={[0, 1.25, 0]} args={[1.45, 2.3, .24]} radius={.14}><meshStandardMaterial color="#ffffff" /></RoundedBox>
    <mesh position={[0, 1.5, .14]}><planeGeometry args={[1.15, 1.5]} /><meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={.1} /></mesh>
    <Html transform position={[0, 1.5, .17]} distanceFactor={1.5} className="totem-ui interactive-ui"><div><b>¿Qué te provoca hoy?</b><span>Packs · Combos · Schmears</span><small>ACÉRCATE PARA ELEGIR</small></div></Html>
  </group>
}

function BagelCounter({ step, counts, onBagel }: { step: Step; counts: Record<string, number>; onBagel: (id: string) => void }) {
  return <group position={[-1.0, 0, .3]}>
    <RoundedBox castShadow receiveShadow position={[0, .75, 0]} args={[8.7, 1.5, 1.8]} radius={.08}><meshStandardMaterial color="#b9c4ca" metalness={.55} roughness={.28} /></RoundedBox>
    <mesh position={[0, 1.18, .55]}><boxGeometry args={[8.3, .75, .05]} /><meshPhysicalMaterial color="#dff4ff" transmission={.75} transparent opacity={.35} roughness={.1} /></mesh>
    {menu.bagels.map((bagel, index) => {
      const row = index < 4 ? 0 : 1, col = index % 4
      const x = -3.2 + col * 2.12, y = row === 0 ? 1.04 : .55
      return <BagelMesh key={bagel.id} id={bagel.id} name={bagel.name} position={[x, y, .35]} active={step === 'bagels'} count={counts[bagel.id] ?? 0} onClick={onBagel} />
    })}
    <Html transform position={[0, 1.8, .05]} distanceFactor={5} className="vitrina-sign interactive-ui"><div><b>¿Qué te provoca hoy?</b><span>Acércate y elige directo de la vitrina</span></div></Html>
  </group>
}

function BagelMesh({ id, name, position, active, count, onClick }: { id: string; name: string; position: Vec3; active: boolean; count: number; onClick: (id: string) =...[truncated]  return <group
    scale={selected ? .405 : .375}
    onClick={(e) => { e.stopPropagation(); if (active) onClick() }}
    onPointerOver={() => { if (active) document.body.style.cursor='pointer' }}
    onPointerOut={() => { document.body.style.cursor='default' }}
  >
    <primitive object={model} />
    {active && <mesh position={[0,.08,0]} scale={1.16}>
      <torusGeometry args={[1.08,.035,10,36]} />
      <meshBasicMaterial color={selected ? CORAL : BLUE} transparent opacity={selected ? .65 : .22} />
    </mesh>}
  </group>
}

function SchmearStation({ step, counts, onSchmear }: { step: Step; counts: Record<string, number>; onSchmear: (id: string) => void }) {
  const colors=['#f2eee2','#e4a452','#d7dfbf','#c8966b','#f0a7ad']
  return <group position={[5.0, 0, -0.6]} rotation={[0, -0.08, 0]}>
    <RoundedBox castShadow position={[0, .8, 0]} args={[4.3, 1.55, 1.8]} radius={.08}><meshStandardMaterial color="#c2ccd2" metalness={.5} roughness={.3} /></RoundedBox>
    {menu.schmears.map((item,index) => {
      const row=index<3?0:1, col=index<3?index:index-3, x=-1.35+col*1.35, y=row===0?1.12:.58, count=counts[item.id]??0
      return <group key={item.id} position={[x,y,.45]}>
        <mesh castShadow onClick={(e)=>{e.stopPropagation(); if(step==='schmears') onSchmear(item.id)}} onPointerOver={()=>{if(step==='schmears') document.body.style.cursor='pointer'}} onPointerOut={()=>{document.body.style.cursor='default'}}>
          <cylinderGeometry args={[.48,.43,.22,32]} /><meshStandardMaterial color="#f7f8f8" metalness={.12} />
        </mesh>
        <mesh position={[0,.13,0]}><cylinderGeometry args={[.41,.41,.08,32]} /><meshStandardMaterial color={colors[index]} roughness={.9} emissive={step==='schmears'?BLUE:'#000'} emissiveIntensity={.04} /></mesh>
        <Html transform position={[0,-.31,.22]} distanceFactor={2.3} className="product-label interactive-ui"><div><b>{item.name}</b>{count>0&&<span>{count}</span>}</div></Html>
      </group>
    })}
  </group>
}

function...[truncated]
function ProductionArea() {
  return <group position={[-2.6,0,-6.2]}>
    <RoundedBox position={[0,.75,0]} args={[5,1.5,1.5]} radius={.08}><meshStandardMaterial color="#d6dde1" metalness={.2} /></RoundedBox>
    <mesh position={[0,1.55,0]}><boxGeometry args={[4.8,.12,1.35]} /><meshStandardMaterial color="#efefea" /></mesh>
    <Worker position={[-1.3,0,0.2]} phase={0} /><Worker position={[1.35,0,.1]} phase={1.7} />
    <mesh position={[3,1.05,-.2]}><cylinderGeometry args={[.78,.78,1.55,28]} /><meshStandardMaterial color="#b7c0c5" metalness={.75} roughness={.2} /></mesh>
  </group>
}

function Worker({ position, phase }: { position: Vec3; phase: number }) {
  const group=useRef<THREE.Group>(null)
  useFrame(({clock})=>{
    if(!group.current) return
    group.current.children[2].rotation.x = -.55 + Math.sin(clock.elapsedTime*3+phase)*.4
    group.current.children[3].rotation.x = -.55 + Math.sin(clock.elapsedTime*3+phase+Math.PI)*.4
  })
  return <group ref={group} position={position}>
    <mesh position={[0,1.75,0]}><sphereGeometry args={[.22,18,18]} /><meshStandardMaterial color="#d7a47e" /></mesh>
    <mesh position={[0,1.15,0]}><capsuleGeometry args={[.32,.72,6,12]} /><meshStandardMaterial color="#f5f5f0" /></mesh>
    <mesh position={[-.34,1.25,.3]} rotation={[-.6,0,.2]}><capsuleGeometry args={[.09,.55,4,8]} /><meshStandardMaterial color="#d7a47e" /></mesh>
    <mesh position={[.34,1.25,.3]} rotation={[-.6,0,-.2]}><capsuleGeometry args={[.09,.55,4,8]} /><meshStandardMaterial color="#d7a47e" /></mesh>
  </group>
}

function AmbientNPCs() {
  return <>
    <MovingNPC from={[0.4,0,8.4]} to={[5.25,0,5.25]} shirt="#2f61a9" backpack="#e24335" duration={8.5} phase={0} />
    <MovingNPC from={[5.1,0,4.5]} to={[0.4,0,8.55]} shirt="#8e6c52" bag duration={10.5} phase={2.2} />
    <NPC position={[3.6,0,3.5]} shirt="#8d735c" /><NPC position={[4.1,0,2.7]} shirt="#668b76" />
    <NPC position={[-5.8,0,4.2]} shirt="#b36a77" seated /><NPC position={[-6.4,0,4.6]} shirt="#4d6d93" ...[truncated]  const dir=useMemo(()=>new THREE.Vector3(),[])
  useFrame(({clock})=>{
    if(!g.current) return
    const raw=(clock.elapsedTime/duration+phase)%2
    const t=raw<1?raw:2-raw
    g.current.position.lerpVectors(a,b,t)
    dir.subVectors(raw<1?b:a,raw<1?a:b)
    g.current.rotation.y=Math.atan2(dir.x,dir.z)
    g.current.position.y=.02+Math.sin(clock.elapsedTime*6+phase)*.012
  })
  return <group ref={g}>
    <mesh position={[0,1.75,0]}><sphereGeometry args={[.2,16,16]} /><meshStandardMaterial color="#c99170" /></mesh>
    <mesh position={[0,1.15,0]}><capsuleGeometry args={[.28,.66,5,10]} /><meshStandardMaterial color={shirt} /></mesh>
    {backpack&&<mesh position={[0,1.18,.28]}><boxGeometry args={[.52,.7,.2]} /><meshStandardMaterial color={backpack} /></mesh>}
    {bag&&<group position={[.42,.82,.05]} rotation={[0,0,-.12]}>
      <mesh><boxGeometry args={[.42,.5,.18]} /><meshStandardMaterial color="#fff7ee" /></mesh>
      <mesh position={[0,.31,0]}><torusGeometry args={[.16,.025,8,16,Math.PI]} /><meshStandardMaterial color={BLUE} /></mesh>
    </group>}
  </group>
}

function NPC({ position, shirt, backpack, seated=false }: { position: Vec3; shirt:string; backpack?:string; seated?:boolean }) {
  const g=useRef<THREE.Group>(null)
  useFrame(({clock})=>{ if(g.current) g.current.position.y=(seated?0:.02)+Math.sin(clock.elapsedTime*1.4+position[0])*.015 })
  return <group ref={g} position={position} scale={seated?.82:1}>
    <mesh position={[0,seated?1.2:1.75,0]}><sphereGeometry args={[.2,16,16]} /><meshStandardMaterial color="#c99170" /></mesh>
    <mesh position={[0,seated?.72:1.15,0]}><capsuleGeometry args={[.28,.66,5,10]} /><meshStandardMaterial color={shirt} /></mesh>
    {backpack&&<mesh position={[0,1.18,.28]}><boxGeometry args={[.52,.7,.2]} /><meshStandardMaterial color={backpack} /></mesh>}
  </group>
}

function Seating() {
  return <group position={[-5.8,0,4.6]}>
    <mesh position={[0,.62,0]}><cylinderGeometry args={[1.1,1.1,.12,32]} /><meshStandardMateria...[truncated]  packFormat:'grande'|'mini'; packQty:number; comboId:string|null; schmearSize:number
  bagelTarget:number; bagelTotal:number; schmearTarget:number; schmearTotal:number
  onCategory:(v:Category)=>void; onPack:(f:'grande'|'mini',q:number)=>void; onCombo:(id:string)=>void; onSchmearSize:(g:number)=>void
  onContinueBagels:()=>void; onContinueSchmears:()=>void; onReset:()=>void
  selectedCombo:(typeof combos)[number]|null
}) {
  const showChooser=!props.category && (props.nearest==='totem'||props.nearest==='vitrina')
  return <div className="guided-hud interactive-ui">
    {showChooser&&<section className="choice-panel">
      <small>{props.nearest==='vitrina'?'EN LA VITRINA':'TÓTEM DE PEDIDOS'}</small>
      <h2>¿Qué te provoca hoy?</h2>
      <div className="choice-row">
        <button onClick={()=>props.onCategory('packs')}>🥯 <b>Packs</b><span>Grandes o minis</span></button>
        <button onClick={()=>props.onCategory('combos')}>✨ <b>Combos</b><span>Elige tu combo</span></button>
        <button onClick={()=>props.onCategory('schmears')}>🥣 <b>Schmears</b><span>Sabor y tamaño</span></button>
      </div>
    </section>}

    {props.step==='choose-pack'&&<section className="choice-panel compact">
      <small>PACKS</small><h2>¿Qué pack quieres?</h2>
      <div className="pack-grid">
        <button onClick={()=>props.onPack('grande',6)}><b>Grandes · 6</b><span>S/50 un sabor · S/60 mixto</span></button>
        <button onClick={()=>props.onPack('grande',12)}><b>Grandes · 12</b><span>S/100 un sabor · S/115 mixto</span></button>
        <button onClick={()=>props.onPack('mini',6)}><b>Minis · 6</b><span>S/20 un sabor · S/25 mixto</span></button>
        <button onClick={()=>props.onPack('mini',12)}><b>Minis · 12</b><span>S/35 un sabor · S/40 mixto</span></button>
        <button onClick={()=>props.onPack('mini',24)}><b>Minis · 24</b><span>S/70 un sabor · S/75 mixto</span></button>
      </div>
    </section>}

    {props.step==='choose-combo'&&<section className="cho...[truncated]
    {props.category&&['bagels','schmears','cashier'].includes(props.step)&&<div className="quest-chip">
      <small>{props.step==='bagels'?'SIGUIENTE · VITRINA':props.step==='schmears'?'SIGUIENTE · SCHMEARS':'SIGUIENTE · CAJA'}</small>
      <b>{props.step==='bagels'
        ? 'Elige bagels ' + props.bagelTotal + '/' + props.bagelTarget
        : props.step==='schmears'
          ? props.category==='packs' ? 'Schmear opcional' : 'Elige schmears ' + props.schmearTotal + '/' + props.schmearTarget
          : 'Acércate a la caja'}</b>
      {props.step==='bagels'&&props.bagelTotal===props.bagelTarget&&<button onClick={props.onContinueBagels}>Continuar →</button>}
      {props.step==='schmears'&&props.category==='packs'&&<button onClick={props.onContinueSchmears}>Ir a caja →</button>}
      {props.step==='schmears'&&props.category!=='packs'&&props.schmearTotal===props.schmearTarget&&<button onClick={props.onContinueSchmears}>Ir a caja →</button>}
      {props.step==='cashier'&&props.nearest==='cashier'&&<button disabled>Revisar pedido · Culqi sandbox</button>}
    </div>}

    {props.category&&<button className="cancel-order" onClick={props.onReset}>Cancelar pedido</button>}
  </div>
}

function MobilePad({ move, setMove }: { move:MoveInput; setMove:(v:MoveInput)=>void }) {
  const set=(key:keyof MoveInput,value:boolean)=>setMove({...move,[key]:value})
  const bind=(key:keyof MoveInput)=>({
    onPointerDown:(e:React.PointerEvent)=>{e.preventDefault();set(key,true)},
    onPointerUp:()=>set(key,false), onPointerLeave:()=>set(key,false), onPointerCancel:()=>set(key,false)
  })
  return <div className="mobile-pad interactive-ui"><button {...bind('forward')}>▲</button><button {...bind('left')}>◀</button><button {...bind('backward')}>▼</button><button {...bind('right')}>▶</button></div>
}

useGLTF.preload('/models/bagel-everything-512.glb')
