import './rebuilt-storefront.css'
import './reference-aligned.css'
import './boutique-experience.css'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'

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
  hidePaymentStep?: boolean
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
const customColors = getVerifiedDisplayMenu().customColors
function SchmearPhoto({className = '', variant = 'neutral'}: {className?: string; variant?: 'neutral' | 'strawberry'}) {
  const art = variant === 'strawberry' ? 'rebuilt-schmear-bowl' : 'rebuilt-schmear-neutral'
  return <span className={'rebuilt-schmear-photo ' + className} data-art-medium="independent-product-concept">
    <img src={`/images/${art}-480.webp`} srcSet={`/images/${art}-480.webp 480w, /images/${art}-800.webp 800w, /images/${art}.webp 1536w`} sizes="(max-width:800px) 160px, 220px" alt="" width={1536} height={1024} decoding="async" draggable={false} />
  </span>
}

function Arrow({chevron = false}: {chevron?: boolean}) {
  return <span className="rebuilt-arrow" aria-hidden="true">{chevron
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
    : '→'}</span>
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
    <svg className="rebuilt-wordmark boutique-authentic-wordmark" viewBox="110 20 1080 270" role="img" aria-label="Bagelito · Classic Gringo Bagels">
      <defs><clipPath id="bagelito-authentic-crop"><path d="M110 20H1120V85H1190V290H110Z" /></clipPath></defs>
      <image href="/images/bagelito-authentic-logo.jpeg" width="1290" height="306" clipPath="url(#bagelito-authentic-crop)" />
    </svg>
  </div>
}

function DisplayCase({kind, onClick}: {kind: 'bagel' | 'schmear'; onClick: () => void}) {
  const isBagel = kind === 'bagel'
  const items = isBagel ? bagels : schmears
  const title = isBagel ? 'La vitrina de bagels' : 'La estación de schmears'
  return <button type="button" className={'boutique-display boutique-display-' + kind} onClick={onClick}
    aria-describedby={'boutique-flavours-' + kind} aria-label={isBagel ? 'Acercarte a la vitrina de bagels' : 'Acercarte a la vitrina de schmears'}>
    <span className="boutique-display-heading"><span><small>{isBagel ? 'HORNEADOS PARA COMPARTIR' : 'EL TOQUE QUE FALTABA'}</small><strong>{title}</strong></span><span aria-hidden="true">↗</span></span>
    <svg className="boutique-case-photo" viewBox={isBagel ? '0 169 1165 493' : '1165 169 855 493'} aria-hidden="true">
      <image href="/images/rebuilt-aligned-counter.webp" width="2020" height="778" />
      {(isBagel ? [[216,361],[481,361],[747,361],[1014,361],[192,567],[480,567],[746,567],[1021,567]] : [[1328,414],[1575,414],[1842,414],[1373,585],[1748,585]]).map(([x,y],index) =>
        <text key={index} x={x} y={y + 9} textAnchor="middle" className="boutique-tray-number">{String(index + 1).padStart(2, '0')}</text>)}
    </svg>
    <span className="boutique-flavour-legend" id={'boutique-flavours-' + kind}>{items.map((item,index) => <span key={item.id}><i aria-hidden="true">{String(index + 1).padStart(2, '0')}</i>{item.name}</span>)}</span>
    <span className="boutique-display-action">{isBagel ? 'Acércate y arma tu caja' : 'Acércate y elige tu sabor'}<span aria-hidden="true">→</span></span>
  </button>
}

/** A responsive bakery with the authentic brand image and separate, interactive display cases.
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
    <p className="rebuilt-wall-copy rebuilt-wall-copy-right" aria-hidden="true">Hechos para<br />bagel lovers.<span>♡</span></p>

    <div className="rebuilt-hero">
      <h1>¿Qué te provoca hoy?</h1>
      <p>Elige tu antojo. Nosotros ponemos los bagels.</p>
    </div>

    <div className="rebuilt-categories" aria-label="Elige una categoría">
      <button type="button" className="rebuilt-category reference-category rebuilt-category-packs"
        aria-label="Packs" data-reference-category="packs" onClick={() => props.onCategory('packs')}>
        <span className="rebuilt-category-visual rebuilt-pack-visual" aria-hidden="true">
          <img className="rebuilt-pack-photo" src="/images/rebuilt-pack-open-tray-480.webp" srcSet="/images/rebuilt-pack-open-tray-480.webp 480w, /images/rebuilt-pack-open-tray-800.webp 800w, /images/rebuilt-pack-open-tray.webp 1536w" sizes="(max-width:800px) 180px, 300px" fetchPriority="high" alt="" width={1536} height={1024} data-art-medium="reference-guided-product-concept" draggable={false} />
        </span>
        <span className="rebuilt-category-copy"><strong>Packs</strong><small>Grandes o minis.<br />Para compartir.</small></span>
        <Arrow chevron />
      </button>
      <button type="button" className="rebuilt-category reference-category rebuilt-category-combos"
        aria-label="Combos" data-reference-category="combos" onClick={() => props.onCategory('combos')}>
        <span className="rebuilt-category-visual rebuilt-combo-visual" aria-hidden="true">
          <img className="rebuilt-combo-photo" src="/images/rebuilt-aligned-combo.webp" width={1683} height={935} alt="" decoding="async" data-art-medium="reference-guided-product-concept" />
        </span>
        <span className="rebuilt-category-copy"><strong>Combos</strong><small>Bagels + schmears</small></span>
        <Arrow chevron />
      </button>
      <button type="button" className="rebuilt-category reference-category rebuilt-category-schmears"
        aria-label="Schmears" data-reference-category="schmears" onClick={() => props.onCategory('schmears')}>
        <span className="rebuilt-category-visual rebuilt-schmear-visual" aria-hidden="true"><SchmearPhoto variant="strawberry" /></span>
        <span className="rebuilt-category-copy"><strong>Schmears</strong><small><span className="rebuilt-category-intro">El toque que faltaba.</span><span>120, 180 o 240 g.</span></small></span>
        <Arrow chevron />
      </button>
    </div>

    <div className="rebuilt-counter boutique-counter" aria-label="Nuestros bagels y schmears">
      <DisplayCase kind="bagel" onClick={() => props.onCategory('packs')} />
      <DisplayCase kind="schmear" onClick={() => props.onCategory('schmears')} />
    </div>

    {!compact && <details className="boutique-custom-colors">
      <summary><span>¿Los quieres de tus colores?</span><strong>6 bagels desde S/ {customColors.base_price}</strong></summary>
      <p>Colores personalizados · pedido mínimo de {customColors.minimum_quantity} bagels.</p>
      <ul><li>1–2 colores: incluidos en S/ {customColors.base_price}.</li>
        <li>3–5 colores: +S/ {customColors.three_five_colors_extra}.</li>
        <li>6–7 colores (arcoíris): +S/ {customColors.six_seven_rainbow_colors_extra}.</li></ul>
      <p>La combinación de colores y la disponibilidad se coordinan con Bagelito. No se añaden automáticamente a esta caja.</p>
    </details>}

    <nav className="rebuilt-progress" aria-label="Pasos de compra">
      {(props.hidePaymentStep ? steps.slice(0, 4) : steps).map((label, index) => <button type="button" key={label} aria-label={`Ir a ${label}`}
        disabled={!props.accessibleSteps[index]} aria-current={props.progressIndex === index ? 'step' : undefined}
        onClick={() => props.onStep(index)}>
        <i aria-hidden="true"><StepIcon index={index} /></i>{label === 'Selecciona'
          ? <><span className="rebuilt-step-label-wide">Selecciona</span><span className="rebuilt-step-label-short">Elige</span></>
          : <span>{label}</span>}
      </button>)}
    </nav>
  </section>
}
