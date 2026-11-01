import { useEffect, useRef, useState, type CSSProperties } from 'react'

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

const categories: Array<{ id: Category; label: string; left: number; right: number }> = [
  { id: 'packs', label: 'Packs', left: 396, right: 660 },
  { id: 'combos', label: 'Combos', left: 674, right: 951 },
  { id: 'schmears', label: 'Schmears', left: 966, right: 1230 },
]
const steps = ['Entrada', 'Categoría', 'Selecciona', 'Revisa', 'Pago']
const stepCentres = [540, 658, 775, 892, 1013]

export function ReferenceScene(props: Props) {
  const [expanded, setExpanded] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!expanded || !scroll.current) return
    const box = scroll.current
    box.scrollLeft = Math.max(0, box.scrollWidth * (813 / 1536) - box.clientWidth / 2)
  }, [expanded])
  return <section className="reference-presentation" aria-label="Vitrina Bagelito">
    <div className={'reference-scroll' + (expanded ? ' is-expanded' : '')} ref={scroll}
      onFocusCapture={event => {
        if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')
          && event.currentTarget.scrollWidth > event.currentTarget.clientWidth) {
          event.target.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' })
        }
      }}>
      <div className="reference-art" data-reference-art="exact-approved-image">
        <img className="reference-image" src="/images/store-reference-approved.webp"
          width={1536} height={1024} alt="Bagelito: vitrina de bagels y schmears con opciones Packs, Combos y Schmears"
          fetchPriority="high" draggable={false} />
        {categories.map(item => <button key={item.id} type="button"
          className="reference-hotspot reference-category" aria-label={item.label}
          data-reference-category={item.id}
          style={{ left: `${item.left / 1536 * 100}%`, top: `${350 / 1024 * 100}%`,
            width: `${(item.right - item.left) / 1536 * 100}%`, height: `${234 / 1024 * 100}%` }}
          onClick={() => props.onCategory(item.id)}><span className="reference-sr-only">{item.label}</span></button>)}
        <button type="button" className="reference-hotspot reference-menu"
          aria-label={props.menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={!!props.menuOpen}
          onClick={props.onMenu}><span className="reference-sr-only">Menú</span></button>
        <button type="button" className={'reference-hotspot reference-cart' + (props.cartCount > 0 ? ' is-dynamic' : '')}
          aria-label={`Ver tu pedido: ${props.cartCount} productos`} aria-expanded={!!props.cartOpen}
          onClick={props.onCart}>
          {props.cartCount > 0 ? <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg><span>Tu pedido ({props.cartCount})</span></>
            : <span className="reference-sr-only">Tu pedido (0)</span>}
        </button>
        {props.dynamicChrome ? <nav className="reference-progress-live" aria-label="Pasos de compra">
          {steps.map((label, index) => <button key={label} type="button" aria-label={`Ir a ${label}`}
            disabled={!props.accessibleSteps[index]} aria-current={props.progressIndex === index ? 'step' : undefined}
            onClick={() => props.onStep(index)}><i aria-hidden="true">{index + 1}</i><span>{label}</span></button>)}
        </nav> : <nav className="reference-progress-hotspots" aria-label="Pasos de compra">
          {steps.map((label, index) => <button key={label} type="button"
            className="reference-hotspot reference-step" style={{ '--step-x': `${stepCentres[index] / 1536 * 100}%` } as CSSProperties}
            aria-label={`Ir a ${label}`} disabled={!props.accessibleSteps[index]}
            aria-current={props.progressIndex === index ? 'step' : undefined} onClick={() => props.onStep(index)}>
            <span className="reference-sr-only">{label}</span></button>)}
        </nav>}
      </div>
    </div>
    <div className="reference-mobile-tools">
      <button type="button" onClick={() => setExpanded(value => !value)} aria-pressed={expanded}>
        {expanded ? 'Ver imagen completa' : 'Ampliar imagen para leer'}
      </button>
      {expanded && <span>Desliza horizontalmente para recorrer la imagen.</span>}
    </div>
  </section>
}
