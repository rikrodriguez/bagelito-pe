import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'

const BLUE = '#004aad'
const REFERENCE = '/images/store-reference-approved.webp'
// Only the approved wall lettering and its immediate tiled surround. This is
// not the reference's counter, people, product photos, prices, or interface.
const LOGO_CROP = { x: 485, y: 56, width: 730, height: 206 }
const REFERENCE_SIZE = { width: 1536, height: 1024 }
type Position = [number, number, number]

function tileTexture(floor = false): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = floor ? '#c6b9a6' : '#d1c9bc'
  context.fillRect(0, 0, 256, 256)
  const glaze = context.createLinearGradient(5, 5, 251, 251)
  glaze.addColorStop(0, floor ? '#e4d9c7' : '#fffaf0')
  glaze.addColorStop(0.48, floor ? '#e6dccd' : '#f8f3e8')
  glaze.addColorStop(1, floor ? '#ded2c0' : '#ece7dc')
  context.fillStyle = glaze
  context.fillRect(3, 3, 250, 250)
  context.strokeStyle = floor ? '#eee4d3' : '#fffef7'
  context.lineWidth = 2
  context.strokeRect(5, 5, 246, 246)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  return texture
}

function menuTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 1536
  const context = canvas.getContext('2d')
  if (!context) return null
  const menu = getVerifiedDisplayMenu()
  context.fillStyle = '#fffaf1'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = BLUE
  context.textBaseline = 'top'
  let y = 75
  const heading = (text: string) => {
    context.font = '900 65px Arial, sans-serif'
    context.fillText(text, 55, y)
    y += 95
  }
  const name = (text: string) => {
    context.font = '700 39px Arial, sans-serif'
    context.fillText(text.toUpperCase(), 55, y, 660)
    y += 72
  }
  heading('BAGELS')
  menu.bagels.forEach(item => name(item.name))
  y += 45
  heading('SCHMEARS')
  menu.schmears.forEach(item => name(item.name))
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function Globe({ position, drop = 0.8 }: { position: Position; drop?: number }) {
  return <group position={position} name="warm-pendant-globe">
    <mesh position={[0, -drop / 2, 0]}>
      <cylinderGeometry args={[0.018, 0.018, drop, 12]} />
      <meshStandardMaterial color="#30322e" metalness={0.72} roughness={0.35} />
    </mesh>
    <mesh position={[0, -drop - 0.02, 0]}>
      <cylinderGeometry args={[0.1, 0.1, 0.07, 20]} />
      <meshStandardMaterial color="#807258" metalness={0.85} roughness={0.3} />
    </mesh>
    <mesh position={[0, -drop - 0.31, 0]}>
      <sphereGeometry args={[0.38, 32, 24]} />
      <meshPhysicalMaterial color="#fff5df" emissive="#ffdeb0" emissiveIntensity={0.65}
        roughness={0.28} metalness={0} clearcoat={0.2} />
    </mesh>
    <pointLight position={[0, -drop - 0.54, 0]} color="#ffe1b5" intensity={2.0} distance={5} decay={2} />
  </group>
}

/** Physical store shell; all commerce, product displays and NPCs stay outside. */
export function StoreArchitectureVisual() {
  const reference = useTexture(REFERENCE)
  const logo = useMemo(() => {
    const texture = reference.clone()
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
    texture.repeat.set(LOGO_CROP.width / REFERENCE_SIZE.width, LOGO_CROP.height / REFERENCE_SIZE.height)
    texture.offset.set(LOGO_CROP.x / REFERENCE_SIZE.width, 1 - (LOGO_CROP.y + LOGO_CROP.height) / REFERENCE_SIZE.height)
    texture.anisotropy = 4
    texture.needsUpdate = true
    return texture
  }, [reference])
  const textures = useMemo(() => {
    const back = tileTexture()
    const side = tileTexture()
    const floor = tileTexture(true)
    back?.repeat.set(32.8, 16)
    side?.repeat.set(56.8, 16)
    floor?.repeat.set(16.4, 31.2)
    return { back, side, floor, menu: menuTexture() }
  }, [])
  useEffect(() => () => { logo.dispose() }, [logo])
  useEffect(() => () => { Object.values(textures).forEach(texture => texture?.dispose()) }, [textures])

  return <group name="approved-reference-store-architecture" userData={{ visualOnly: true }}>
    <mesh receiveShadow position={[0, -0.09, 6.5]}>
      <boxGeometry args={[16.4, 0.16, 31.2]} />
      <meshStandardMaterial map={textures.floor} color="#f5ede0" roughness={0.87} metalness={0.03} />
    </mesh>
    <mesh receiveShadow position={[0, 4, -8.4]}>
      <boxGeometry args={[16.4, 8, 0.18]} />
      <meshPhysicalMaterial map={textures.back} roughness={0.26} metalness={0.03} clearcoat={0.38} clearcoatRoughness={0.25} />
    </mesh>
    {[-8.1, 8.1].map(x => <group key={x}>
      <mesh receiveShadow position={[x, 4, 5.8]}>
        <boxGeometry args={[0.16, 8, 28.4]} />
        <meshPhysicalMaterial map={textures.side} roughness={0.3} metalness={0.02} clearcoat={0.32} />
      </mesh>
      <mesh position={[x > 0 ? 7.99 : -7.99, 0.18, 5.8]}>
        <boxGeometry args={[0.07, 0.32, 28.4]} />
        <meshStandardMaterial color="#aaa99e" metalness={0.8} roughness={0.34} />
      </mesh>
      {[-6.8, -3.6, -0.4, 2.8, 6, 9.2, 12.4, 15.6, 18.8].map(z => <mesh key={z} position={[x > 0 ? 7.98 : -7.98, 4, z]}>
        <boxGeometry args={[0.04, 7.9, 0.035]} />
        <meshStandardMaterial color="#b7b5ab" metalness={0.85} roughness={0.28} />
      </mesh>)}
    </group>)}
    <mesh position={[0, 8.1, 6.5]}>
      <boxGeometry args={[16.4, 0.18, 31.2]} />
      <meshStandardMaterial color="#e6ddce" roughness={0.79} metalness={0.05} />
    </mesh>
    {[-7, -3.5, 0, 3.5, 7, 10.5, 14, 17.5, 21].map(z => <mesh key={z} position={[0, 7.93, z]}>
      <boxGeometry args={[16.1, 0.13, 0.08]} />
      <meshStandardMaterial color="#b8b2a6" metalness={0.65} roughness={0.41} />
    </mesh>)}
    {[-5.4, 5.4].map(x => <mesh key={x} position={[x, 7.92, 6.5]}>
      <boxGeometry args={[0.1, 0.14, 31.0]} />
      <meshStandardMaterial color="#383b37" metalness={0.72} roughness={0.34} />
    </mesh>)}

    <mesh name="approved-reference-logo-crop" position={[0, 5.8, -8.13]}
      userData={{ assetRole: 'wall-logo-crop-only', source: REFERENCE, sourceRegion: LOGO_CROP, excludesReferenceInterface: true }}>
      <planeGeometry args={[10.5, 10.5 * LOGO_CROP.height / LOGO_CROP.width]} />
      <meshBasicMaterial map={logo} toneMapped={false} />
    </mesh>
    <group name="verified-menu-names-only" position={[-6.65, 2.65, -8.08]}
      userData={{ bagelNames: 8, schmearNames: 5, pricesShown: false }}>
      <mesh><boxGeometry args={[2.45, 4.4, 0.1]} /><meshStandardMaterial color="#bdb7a8" metalness={0.65} roughness={0.35} /></mesh>
      <mesh position={[0, 0, 0.06]}><planeGeometry args={[2.35, 4.3]} /><meshBasicMaterial map={textures.menu} color="#ffffff" toneMapped={false} /></mesh>
    </group>

    {/* Real stainless work-wall details below the sign, not a kitchen photo. */}
    <mesh receiveShadow position={[0, 0.77, -8.15]}>
      <boxGeometry args={[10.9, 1.45, 0.13]} />
      <meshStandardMaterial color="#8f938d" metalness={0.84} roughness={0.32} />
    </mesh>
    {[0.2, 1.5].map(y => <mesh key={y} position={[0, y, -8.02]}>
      <boxGeometry args={[11.2, 0.07, 0.3]} />
      <meshStandardMaterial color="#d5d3c7" metalness={0.88} roughness={0.23} />
    </mesh>)}
    {[-4.7, -2.35, 0, 2.35, 4.7].map(x => <mesh key={x} position={[x, 0.82, -8.05]}>
      <boxGeometry args={[0.025, 1.24, 0.035]} />
      <meshStandardMaterial color="#616861" metalness={0.8} roughness={0.32} />
    </mesh>)}
    <Globe position={[-5.7, 7.81, -3.3]} drop={1.1} />
    <Globe position={[5.7, 7.81, -3.3]} drop={1.1} />
    <Globe position={[-4.7, 7.81, 2.1]} drop={1.1} />
    <Globe position={[4.7, 7.81, 2.1]} drop={1.1} />
    <Globe position={[-4.7, 7.81, 9.2]} drop={1.1} />
    <Globe position={[4.7, 7.81, 9.2]} drop={1.1} />
    <Globe position={[-4.7, 7.81, 16.5]} drop={1.1} />
    <Globe position={[4.7, 7.81, 16.5]} drop={1.1} />
  </group>
}
