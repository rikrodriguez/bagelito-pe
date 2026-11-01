import './rebuilt-storefront.css'
import './reference-aligned.css'
import type { CSSProperties } from 'react'

type Category = 'packs' | 'combos' | 'schmears'
type Props = {
  onCategory: (category: Category) => void
  onMenu: () => void
  onCart: () => void
  cartCount: number
  progressIndex: number
  accessibleSteps: boolean[]
  onStep: (index: number) => void
  dynamicChrome: boolean
  menuOpen?: boolean
  cartOpen?: boolean
}

const bagels = [
  {id: 'plain', name: 'Plain'},
  {id: 'everything', name: 'Everything'},
  {id: 'sesame', name: 'Sesame'},
  {id: 'classic-onion', name: 'Classic Onion'},
  {id: 'jalapeno-cheddar', name: 'Jalapeño Cheddar'},
  {id: 'cheddar', name: 'Cheddar'},
  {id: 'cinnamon-raisin', name: 'Cinnamon Raisin'},
  {id: 'blueberry', name: 'Blueberry'},
]
const schmears = [
  {id: 'original', name: 'Whipped Original'},
  {id: 'aji', name: 'Ají Amarillo'},
  {id: 'herbs', name: 'Herb & Roasted Garlic'},
  {id: 'honey', name: 'Honey Cinnamon'},
  {id: 'strawberry', name: 'Classic Strawberry'},
]
const steps = ['Entrada', 'Categoría', 'Selecciona', 'Revisa', 'Pago']
const logoLetters = [
  {letter:'B', x:100, y:230, rotate:-17}, {letter:'A', x:211, y:186, rotate:-12},
  {letter:'G', x:326, y:154, rotate:-7}, {letter:'E', x:441, y:141, rotate:-2},
  {letter:'L', x:544, y:143, rotate:4}, {letter:'I', x:635, y:158, rotate:9},
  {letter:'T', x:731, y:187, rotate:14}, {letter:'O', x:849, y:231, rotate:20},
]
const placardCenters: Record<string, [number, number]> = {
  plain:[216,361],everything:[481,361],sesame:[747,361],'classic-onion':[1014,361],
  'jalapeno-cheddar':[192,567],cheddar:[480,567],'cinnamon-raisin':[746,567],blueberry:[1021,567],
  original:[1328,414],aji:[1575,414],herbs:[1842,414],honey:[1373,585],strawberry:[1748,585],
}
function placardStyle(id: string, kind: 'bagel' | 'schmear'): CSSProperties {
  const [x,y] = placardCenters[id]
  return {'--label-x': `${x / 2020 * 100}%`, '--label-y': `${y / 2020 * 100 - 9.5}cqw`,
    '--mobile-label-x': `${(kind === 'bagel' ? x / 1165 : (x - 1165) / 855) * 100}%`,
    '--mobile-label-y': `${(y - 169) / 493 * 100}%`} as CSSProperties
}

function SchmearPhoto({className = '', variant = 'neutral'}: {className?: string; variant?: 'neutral' | 'strawberry'}) {
  const art = variant === 'strawberry' ? 'rebuilt-schmear-bowl' : 'rebuilt-schmear-neutral'
  return <span className={'rebuilt-schmear-photo ' + className} data-art-medium="independent-product-concept">
    <img src={`/images/${art}-480.webp`} srcSet={`/images/${art}-480.webp 480w, /images/${art}-800.webp 800w, /images/${art}.webp 1536w`} sizes="(max-width:800px) 160px, 220px" alt="" width={1536} height={1024} decoding="async" draggable={false} />
  </span>
}

function Arrow() {
  return <span className="rebuilt-arrow" aria-hidden="true">→</span>
}

function StepIcon({index}: {index: number}) {
  const paths = [
    'M4 10h16l-1-6H5l-1 6ZM5 10v11h14V10M9 21v-7h6v7M8 4v6M12 4v6M16 4v6',
    'M5 16 16 5l3 3L8 19H5v-3ZM13 8l3 3',
    'm8 12 3 3 5-6',
    'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6',
    'M3 6h18v14H3V6ZM3 10h18M6 15h5',
  ]
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {index === 2 && <circle cx="12" cy="12" r="9" />}<path d={paths[index]} />
  </svg>
}

function Wordmark() {
  return <div className="rebuilt-brand">
    <svg className="rebuilt-wordmark" viewBox="0 0 960 300" role="img" aria-label="Bagelito">
      <defs><path id="bagelito-tagline-curve" d="M210 240 Q480 155 770 240" /></defs>
      <g textAnchor="middle" paintOrder="stroke fill" strokeLinejoin="round" strokeLinecap="round">
        {logoLetters.map(item => <text key={item.letter} x={item.x} y={item.y}
          transform={`rotate(${item.rotate} ${item.x} ${item.y - 60})`}>{item.letter}</text>)}
      </g>
      <text className="rebuilt-tagline" textAnchor="middle"><textPath href="#bagelito-tagline-curve" startOffset="50%">Classic Gringo Bagels</textPath></text>
    </svg>
  </div>
}

/** A responsive bakery built from DOM, vector lettering and individual product assets.
 * The approved storefront mockup is a visual reference, never a rendering asset.
 */
export function ReferenceScene(props: Props) {
  const compact = props.progressIndex > 0
  return <section className="reference-presentation rebuilt-store" aria-label="Vitrina Bagelito"
    data-rebuilt-scene="live-components" data-compact={compact ? 'true' : 'false'}>
    <div className="rebuilt-architecture" aria-hidden="true">
      <picture>
        <source media="(max-width:1050px)" srcSet="/images/rebuilt-aligned-room-mobile.webp" width={1024} height={1536} />
        <img className="rebuilt-room-photo" src="/images/rebuilt-aligned-room.webp" width={1536} height={1024}
          alt="" fetchPriority="high" decoding="async" data-art-medium="reference-guided-architectural-concept" />
      </picture>
      <span className="rebuilt-room-shade" />
    </div>
    <header className="rebuilt-topbar">
      <button type="button" className="rebuilt-menu" aria-label={props.menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={!!props.menuOpen} onClick={props.onMenu}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <button type="button" className="rebuilt-cart" aria-label={`Ver tu pedido: ${props.cartCount} productos`}
        aria-expanded={!!props.cartOpen} onClick={props.onCart}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>
        <span>Tu pedido <b>({props.cartCount})</b></span>
      </button>
    </header>

    <Wordmark />
    <aside className="rebuilt-wall-menu" aria-hidden="true">
      <h2>Bagels</h2>{bagels.map(item => <span key={item.id}>{item.name}</span>)}
      <h2>Schmears</h2>{schmears.map(item => <span key={item.id}>{item.name}</span>)}
      <h2>Mini bagels</h2><span>6 bagels</span><span>12 bagels</span><span>24 bagels</span>
    </aside>
    <span className="rebuilt-shirt-mark rebuilt-shirt-mark-left" aria-hidden="true">Bagelito</span>
    <span className="rebuilt-shirt-mark rebuilt-shirt-mark-right" aria-hidden="true">Bagelito</span>
    <span className="rebuilt-tote-mark" aria-hidden="true">Good<br />bagels<br />good<br />days<span>☺</span></span>
    <p className="rebuilt-wall-copy rebuilt-wall-copy-right" aria-hidden="true">Hechos para<br />bagel lovers.<span>♡</span></p>

    <div className="rebuilt-hero">
      <h1>¿Qué te provoca hoy?</h1>
      <p>Elige tu antojo. Nosotros ponemos los bagels.</p>
    </div>

    <div className="rebuilt-categories" aria-label="Elige una categoría">
      <button type="button" className="rebuilt-category reference-category rebuilt-category-packs"
        aria-label="Packs" data-reference-category="packs" onClick={() => props.onCategory('packs')}>
        <span className="rebuilt-category-visual rebuilt-pack-visual" aria-hidden="true">
          <img className="rebuilt-pack-photo" src="/images/rebuilt-pack-bagels-480.webp" srcSet="/images/rebuilt-pack-bagels-480.webp 480w, /images/rebuilt-pack-bagels-800.webp 800w, /images/rebuilt-pack-bagels.webp 1312w" sizes="(max-width:800px) 180px, 300px" fetchPriority="high" alt="" width={1312} height={1199} draggable={false} />
        </span>
        <span className="rebuilt-category-copy"><strong>Packs</strong><small>Grandes o minis.<br />Para compartir.</small></span>
        <Arrow />
      </button>
      <button type="button" className="rebuilt-category reference-category rebuilt-category-combos"
        aria-label="Combos" data-reference-category="combos" onClick={() => props.onCategory('combos')}>
        <span className="rebuilt-category-visual rebuilt-combo-visual" aria-hidden="true">
          <img className="rebuilt-combo-photo" src="/images/rebuilt-aligned-combo.webp" width={1683} height={935} alt="" decoding="async" data-art-medium="reference-guided-product-concept" />
        </span>
        <span className="rebuilt-category-copy"><strong>Combos</strong><small>Bagels + schmears</small></span>
        <Arrow />
      </button>
      <button type="button" className="rebuilt-category reference-category rebuilt-category-schmears"
        aria-label="Schmears" data-reference-category="schmears" onClick={() => props.onCategory('schmears')}>
        <span className="rebuilt-category-visual rebuilt-schmear-visual" aria-hidden="true"><SchmearPhoto variant="strawberry" /></span>
        <span className="rebuilt-category-copy"><strong>Schmears</strong><small><span className="rebuilt-category-intro">El toque que faltaba.</span><span>120, 180 o 240 g.</span></small></span>
        <Arrow />
      </button>
    </div>

    <div className="rebuilt-counter" aria-label="Nuestros bagels y schmears">
      <img className="rebuilt-counter-photo" src="/images/rebuilt-aligned-counter.webp" width={2020} height={778} alt="" decoding="async" data-art-medium="reference-guided-product-concept" />
      <section className="rebuilt-display rebuilt-bagel-display" aria-label="Vitrina de bagels">
        <button type="button" className="rebuilt-case-link" onClick={() => props.onCategory('packs')}><span className="reference-sr-only">Elige tus bagels</span><Arrow /></button>
        <svg className="rebuilt-mobile-case-art" viewBox="0 169 1165 493" aria-hidden="true"><image href="/images/rebuilt-aligned-counter.webp" width={2020} height={778} /></svg>
        <div className="rebuilt-bagel-trays">
          {bagels.map(item => <figure className="rebuilt-bagel-tray rebuilt-product-placard" key={item.id} style={placardStyle(item.id, 'bagel')}>
            <figcaption>{item.name}</figcaption>
          </figure>)}
        </div>
      </section>
      <section className="rebuilt-display rebuilt-schmear-display" aria-label="Vitrina de schmears">
        <button type="button" className="rebuilt-case-link" onClick={() => props.onCategory('schmears')}><span className="reference-sr-only">Descubre los sabores</span><Arrow /></button>
        <svg className="rebuilt-mobile-case-art" viewBox="1165 169 855 493" aria-hidden="true"><image href="/images/rebuilt-aligned-counter.webp" width={2020} height={778} /></svg>
        <div className="rebuilt-schmear-trays">
          {schmears.map(item => <figure key={item.id} className={`rebuilt-schmear-tray rebuilt-product-placard rebuilt-flavour-${item.id}`} style={placardStyle(item.id, 'schmear')}>
            <figcaption>{item.name}</figcaption>
          </figure>)}
        </div>
      </section>
    </div>

    <nav className="rebuilt-progress" aria-label="Pasos de compra">
      {steps.map((label, index) => <button type="button" key={label} aria-label={`Ir a ${label}`}
        disabled={!props.accessibleSteps[index]} aria-current={props.progressIndex === index ? 'step' : undefined}
        onClick={() => props.onStep(index)}>
        <i aria-hidden="true"><StepIcon index={index} /></i><span>{label === 'Selecciona' ? 'Elige' : label}</span>
      </button>)}
    </nav>
  </section>
}
