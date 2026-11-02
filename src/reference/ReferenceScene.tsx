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
// Font-derived native vector B with two counters; no image tracing or raster logo.
const logoInitialBPath = 'M82.49336747153498 220.3078438940554Q78.0401503455094 220.3078438940554 75.95060142038088 218.82476008896936Q73.86105249525237 217.3416762838833 73.30014426333193 214.84610440899516Q72.73923603141151 212.35053253410703 72.73923603141151 209.4350739836744V120.09556819191555Q72.73923603141151 117.26567250244365 73.33658706134486 114.88576765406172Q73.93393809127822 112.5058628056798 76.03338882369992 111.02277900059374Q78.13283955612162 109.5396951955077 82.65181592852154 109.5396951955077H134.27866153713904Q143.60572191009663 109.5396951955077 150.86520841250098 113.70413401824429Q158.12469491490532 117.86857284098087 162.32284332364006 124.904099786878Q166.5209917323748 131.93962673277514 166.44484630854384 140.38810401280287Q166.5209917323748 144.52355294753377 165.4029474642025 148.32827055295Q164.2849031960302 152.1329881583662 162.27255842875775 155.27977696953548Q160.2602136614853 158.42656578070478 157.5751756894399 160.68369300094875Q161.38500668875497 163.27674280271597 164.21204346032746 167.40942833542897Q167.03908023189996 171.54211386814194 168.591612064191 176.49807273694574Q170.144143896482 181.45403160574958 170.1272744482613 186.75078066164923Q169.98553669694962 193.9189930208495 167.33698927208036 200.04422417118406Q164.68844184721107 206.1694553215186 159.95325012553815 210.6975246370526Q155.2180584038652 215.22559395258656 149.0359713727668 217.76671892332098Q142.8538843416684 220.3078438940554 135.86314610700475 220.3078438940554ZM92.69748975274842 200.71401815284773H134.55591214134833Q138.79913196936593 200.71401815284773 142.4003107371339 199.11528467595477Q146.00148950490188 197.5165511990618 148.15814071193898 193.98158243710876Q150.31479191897608 190.4466136751557 150.31479191897608 184.71079341600128Q150.31479191897608 180.37883273343962 149.12343633156445 177.67096005764068Q147.93208074415284 174.96308738184172 145.93089726247382 173.47209330219584Q143.92971378079477 171.98109922254997 141.56048878662205 171.36632129200598Q139.19126379244935 170.75154336146198 136.86709622765545 170.62953770248834Q134.54292866286158 170.50753204351471 132.63628248802024 170.50753204351471H119.436533296653H92.69748975274842ZM92.69748975274842 156.24717091472337H132.8201050151721Q134.72706860746138 153.43306106497255 137.10549484439696 153.27461260798597Q139.48392108133254 153.1161641509994 141.68937696802948 152.15438514093677Q143.89483285472645 151.19260613087417 145.3381138269209 148.87451596507418Q146.7813947991154 146.55642579927422 146.7813947991154 142.23714238164746Q146.7813947991154 135.3858616458189 142.94871184122724 132.29613408928006Q139.11602888333906 129.20640653274123 130.48696131943697 129.20640653274123H92.69748975274842Z'
const logoLetters = [
  {letter:'A', x:231, y:182, rotate:-8, width:94, size:160, weight:650},
  {letter:'G', x:337.6, y:152.5, rotate:-7, width:100, size:166, weight:600},
  {letter:'E', x:441.3, y:144.5, rotate:-2, width:97, size:169, weight:600},
  {letter:'L', x:545.8, y:149, rotate:4, width:102, size:171, weight:640},
  {letter:'I', x:626.7, y:159.2, rotate:9, width:100, size:169, weight:650},
  {letter:'T', x:704.2, y:174.8, rotate:14, width:100, size:164, weight:700},
  {letter:'O', x:816.7, y:215.5, rotate:18, width:101, size:164, weight:600},
]
const placardCenters: Record<string, [number, number]> = {
  plain:[216,361],everything:[481,361],sesame:[747,361],'classic-onion':[1014,361],
  'jalapeno-cheddar':[192,567],cheddar:[480,567],'cinnamon-raisin':[746,567],blueberry:[1021,567],
  original:[1328,414],aji:[1575,414],herbs:[1842,414],honey:[1373,585],strawberry:[1748,585],
}
// Independent uniform case fits to the same front-plane reference landmarks.
// The mobile art and its source coordinates stay unchanged.
const desktopPlacardCenters: Record<string, [number, number]> = {
  plain:[207,372.5],everything:[453.5,372],sesame:[702,372],'classic-onion':[956,373.5],
  'jalapeno-cheddar':[188,556.5],cheddar:[439,557],'cinnamon-raisin':[696.5,556.5],blueberry:[956.5,557],
  original:[1248.5,413],aji:[1513,413.5],herbs:[1795,413.5],honey:[1314.5,560.5],strawberry:[1742.5,560.5],
}
const desktopCases = {
  bagel:{scale:779/1023, x:62.59530791788856, y:428.9956989247312},
  schmear:{scale:608/860, x:124.3767441860465, y:466.1451162790698},
}
function placardStyle(id: string, kind: 'bagel' | 'schmear'): CSSProperties {
  const [x,y] = desktopPlacardCenters[id]
  const [mobileX,mobileY] = placardCenters[id]
  const layout = desktopCases[kind]
  return {'--label-x': `${(layout.x + x * layout.scale - 90) / 1440 * 100}%`,
    '--label-y': `${(layout.y + y * layout.scale - 600) / 1440 * 100}cqw`,
    '--mobile-label-x': `${(kind === 'bagel' ? mobileX / 1165 : (mobileX - 1165) / 855) * 100}%`,
    '--mobile-label-y': `${(mobileY - 169) / 493 * 100}%`} as CSSProperties
}

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
    <svg className="rebuilt-wordmark" viewBox="0 0 960 300" role="img" aria-label="Bagelito">
      <defs>
        <path id="bagelito-tagline-curve" d="M170 251.2 Q440 146.2 730 251.2" />
        <mask id="bagelito-a-counter" maskUnits="userSpaceOnUse" x="0" y="0" width="960" height="300">
          <rect width="960" height="300" fill="white" />
          <path d="M230.316 103.106 215.769 135.861 244.314 136.145Z" fill="black" />
        </mask>
      </defs>
      <g textAnchor="middle" paintOrder="stroke fill" strokeLinejoin="round" strokeLinecap="round">
        <path className="rebuilt-initial-b" d={logoInitialBPath} fillRule="evenodd" transform="rotate(-24 116.2876 158.8216)" />
        {logoLetters.map(item => <g key={item.letter} transform={`rotate(${item.rotate} ${item.x} ${item.y - 60})`}
          mask={item.letter === 'A' ? 'url(#bagelito-a-counter)' : undefined}>
          <text x={item.x} y={item.y}
            style={{'--letter-width': item.width, '--letter-weight': item.weight, fontSize: item.size} as CSSProperties}>{item.letter}</text>
          {item.letter === 'A' && <path className="rebuilt-a-counter-edge" d="M230.316 103.106 215.769 135.861 244.314 136.145Z" />}
        </g>)}
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

    <div className="rebuilt-counter" aria-label="Nuestros bagels y schmears">
      <img className="rebuilt-counter-photo" src="/images/rebuilt-aligned-counter-desktop.webp" width={2020} height={778} alt="" decoding="async" data-art-medium="reference-guided-product-concept" />
      <svg className="rebuilt-desktop-case-art" viewBox="1080 0 940 624" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <image href="/images/rebuilt-aligned-counter-desktop.webp" width={2020} height={778} />
      </svg>
      <section className="rebuilt-display rebuilt-bagel-display" aria-label="Vitrina de bagels">
        <button type="button" className="rebuilt-case-link" onClick={() => props.onCategory('packs')}><span className="rebuilt-case-label">Elige tus bagels</span><Arrow /></button>
        <svg className="rebuilt-mobile-case-art" viewBox="0 169 1165 493" aria-hidden="true"><image href="/images/rebuilt-aligned-counter.webp" width={2020} height={778} /></svg>
        <div className="rebuilt-bagel-trays">
          {bagels.map(item => <figure className="rebuilt-bagel-tray rebuilt-product-placard" key={item.id} style={placardStyle(item.id, 'bagel')}>
            <figcaption>{item.name}</figcaption>
          </figure>)}
        </div>
      </section>
      <section className="rebuilt-display rebuilt-schmear-display" aria-label="Vitrina de schmears">
        <button type="button" className="rebuilt-case-link" onClick={() => props.onCategory('schmears')}><span className="rebuilt-case-label">Descubre los sabores</span><Arrow /></button>
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
        <i aria-hidden="true"><StepIcon index={index} /></i>{label === 'Selecciona'
          ? <><span className="rebuilt-step-label-wide">Selecciona</span><span className="rebuilt-step-label-short">Elige</span></>
          : <span>{label}</span>}
      </button>)}
    </nav>
  </section>
}
