import './rebuilt-storefront.css'

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
  {letter:'B', x:100, y:170, rotate:-17}, {letter:'A', x:211, y:145, rotate:-12},
  {letter:'G', x:326, y:128, rotate:-7}, {letter:'E', x:441, y:119, rotate:-2},
  {letter:'L', x:544, y:121, rotate:4}, {letter:'I', x:635, y:133, rotate:9},
  {letter:'T', x:731, y:153, rotate:14}, {letter:'O', x:849, y:178, rotate:20},
]

function BagelPhoto({id, className = ''}: {id: string; className?: string}) {
  return <img className={'rebuilt-bagel-photo ' + className} src={`/images/bagel-${id}.webp`}
    alt="" width={id === 'sesame' ? 1000 : 900} height={id === 'sesame' ? 1000 : 900} loading={className.includes('pile') ? 'lazy' : 'eager'} decoding="async" draggable={false} />
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

function Wordmark() {
  return <div className="rebuilt-brand">
    <svg className="rebuilt-wordmark" viewBox="0 0 960 235" role="img" aria-label="Bagelito">
      <g textAnchor="middle" paintOrder="stroke fill" strokeLinejoin="round" strokeLinecap="round">
        {logoLetters.map(item => <text key={item.letter} x={item.x} y={item.y}
          transform={`rotate(${item.rotate} ${item.x} ${item.y - 60})`}>{item.letter}</text>)}
      </g>
    </svg>
    <p>Classic Gringo Bagels</p>
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
      <div className="rebuilt-pendant rebuilt-pendant-left"><i /><span /></div>
      <div className="rebuilt-pendant rebuilt-pendant-right"><i /><span /></div>
      <span className="rebuilt-wall-shadow" />
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
    <p className="rebuilt-wall-copy rebuilt-wall-copy-left" aria-hidden="true">Fresh bagels.<br />Happier days.</p>
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
          <BagelPhoto id="everything" className="rebuilt-combo-one" />
          <BagelPhoto id="sesame" className="rebuilt-combo-two" />
          <SchmearPhoto className="rebuilt-combo-schmear" />
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
      <section className="rebuilt-display rebuilt-bagel-display" aria-label="Vitrina de bagels">
        <header className="rebuilt-case-header"><h2>Bagels</h2><span>Encuentra tu favorito</span></header>
        <div className="rebuilt-case-glass" aria-hidden="true" />
        <div className="rebuilt-bagel-trays">
          {bagels.map(item => <figure className="rebuilt-bagel-tray" key={item.id}>
            <span className="rebuilt-bagel-pile">
              <BagelPhoto id={item.id} className="rebuilt-pile-front" />
            </span>
            <figcaption>{item.name}</figcaption>
          </figure>)}
        </div>
        <button type="button" className="rebuilt-case-link" onClick={() => props.onCategory('packs')}>Elige tus bagels <Arrow /></button>
      </section>
      <section className="rebuilt-display rebuilt-schmear-display" aria-label="Vitrina de schmears">
        <header className="rebuilt-case-header"><h2>Schmears</h2><span>Un buen bagel pide uno</span></header>
        <div className="rebuilt-case-glass" aria-hidden="true" />
        <div className="rebuilt-schmear-trays">
          {schmears.map(item => <figure key={item.id} className={`rebuilt-schmear-tray rebuilt-flavour-${item.id}`}>
            <SchmearPhoto variant={item.id === 'strawberry' ? 'strawberry' : 'neutral'} />
            <figcaption>{item.name}</figcaption>
          </figure>)}
        </div>
        <button type="button" className="rebuilt-case-link" onClick={() => props.onCategory('schmears')}>Descubre los sabores <Arrow /></button>
      </section>
    </div>

    <nav className="rebuilt-progress" aria-label="Pasos de compra">
      {steps.map((label, index) => <button type="button" key={label} aria-label={`Ir a ${label}`}
        disabled={!props.accessibleSteps[index]} aria-current={props.progressIndex === index ? 'step' : undefined}
        onClick={() => props.onStep(index)}>
        <i aria-hidden="true">{index + 1}</i><span>{label === 'Selecciona' ? 'Elige' : label}</span>
      </button>)}
    </nav>
  </section>
}
