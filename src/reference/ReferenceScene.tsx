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

const referenceImage = '/images/store-reference-approved.webp'
const categories: Array<{ id: Category; label: string; description: string; left: number; right: number }> = [
  { id: 'packs', label: 'Packs', description: 'Grandes o minis', left: 396, right: 660 },
  { id: 'combos', label: 'Combos', description: '2 bagels + 1 schmear', left: 674, right: 951 },
  { id: 'schmears', label: 'Schmears', description: '120, 180 o 240 g', left: 966, right: 1230 },
]
const steps = ['Entrada', 'Categoría', 'Selecciona', 'Revisa', 'Pago']
const stepCentres = [540, 658, 775, 892, 1013]

export function ReferenceScene(props: Props) {
  return <section className="reference-presentation" aria-label="Vitrina Bagelito">
    <div className="reference-scroll">
      <div className="reference-art" data-reference-art="exact-approved-image">
        <img className="reference-image" src={referenceImage}
          width={1536} height={1024} alt="Bagelito: vitrina de bagels y schmears con opciones Packs, Combos y Schmears"
          fetchPriority="high" draggable={false} />
        <div className="reference-top-controls">
          <button type="button" className="reference-hotspot reference-menu"
            aria-label={props.menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={!!props.menuOpen}
            onClick={props.onMenu}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <span className="reference-sr-only">Menú</span>
          </button>
          <button type="button" className={'reference-hotspot reference-cart' + (props.cartCount > 0 ? ' is-dynamic' : '')}
            aria-label={`Ver tu pedido: ${props.cartCount} productos`} aria-expanded={!!props.cartOpen}
            onClick={props.onCart}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>
            <span>Tu pedido ({props.cartCount})</span>
          </button>
        </div>
        <svg className="reference-mobile-hero" viewBox="400 0 840 340" role="img"
          aria-label="Bagelito. ¿Qué te provoca hoy?" data-reference-crop="hero">
          <image href={referenceImage} x="0" y="0" width="1536" height="1024" />
        </svg>
        {categories.map(item => <button key={item.id} type="button"
          className="reference-hotspot reference-category" aria-label={item.label}
          data-reference-category={item.id}
          style={{ left: `${item.left / 1536 * 100}%`, top: `${350 / 1024 * 100}%`,
            width: `${(item.right - item.left) / 1536 * 100}%`, height: `${234 / 1024 * 100}%` }}
          onClick={() => props.onCategory(item.id)}>
          <svg className="reference-category-art" viewBox={`${item.left} 350 ${item.right - item.left} 146`}
            aria-hidden="true" data-reference-crop={item.id}>
            <image href={referenceImage} x="0" y="0" width="1536" height="1024" />
          </svg>
          <span className="reference-category-copy reference-sr-only"><strong>{item.label}</strong><small>{item.description}</small></span>
        </button>)}
        <svg className="reference-mobile-vitrine" viewBox="95 600 1435 310" role="img"
          aria-label="Vitrina de bagels y schmears" data-reference-crop="vitrine">
          <image href={referenceImage} x="0" y="0" width="1536" height="1024" />
        </svg>
        <nav className={'reference-progress ' + (props.dynamicChrome ? 'reference-progress-live' : 'reference-progress-hotspots')}
          aria-label="Pasos de compra">
          {steps.map((label, index) => <button key={label} type="button"
            className={props.dynamicChrome ? undefined : 'reference-hotspot reference-step'}
            style={{ '--step-x': `${stepCentres[index] / 1536 * 100}%` } as CSSProperties}
            aria-label={`Ir a ${label}`} disabled={!props.accessibleSteps[index]}
            aria-current={props.progressIndex === index ? 'step' : undefined} onClick={() => props.onStep(index)}>
            <i aria-hidden="true">{index + 1}</i>
            <span className="reference-step-desktop-label">{label}</span>
            <span className="reference-step-mobile-label">{label === 'Selecciona' ? 'Elige' : label}</span>
          </button>)}
        </nav>
      </div>
    </div>
  </section>
}
