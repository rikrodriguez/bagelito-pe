import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  getVerifiedDisplayMenu,
  quotePublishedPack,
  quotePublishedSchmear,
  quoteTwoBagelCombo,
  canProceedToCheckout,
  type BagelSelection,
  type BagelFormat,
  type PackMix,
  type ShopQuote,
} from '../domain/lib/approved-shop-contract'
import type { BatchAvailability } from '../domain/lib/batch-types'

export const Route = createFileRoute('/')({ component: BagelitoStore })

type Category = 'packs' | 'combos' | 'schmears'
type Stage = 'entry' | 'category' | 'configure'

const menu = getVerifiedDisplayMenu()
const firstFlavor = menu.bagels[0]?.id ?? 'plain'
const secondFlavor = menu.bagels[1]?.id ?? firstFlavor
const firstSchmear = menu.schmears[0]?.id ?? 'whipped-original'
const localProductImage = (url: string) => url.replace('https://bagelito.pe', '')

function BagelitoStore() {
  const [stage, setStage] = useState<Stage>('entry')
  const [category, setCategory] = useState<Category | null>(null)
  const [format, setFormat] = useState<BagelFormat | null>(null)
  const [quantity, setQuantity] = useState(6)
  const [mix, setMix] = useState<PackMix>('mixed')
  const [flavorA, setFlavorA] = useState(firstFlavor)
  const [flavorB, setFlavorB] = useState(secondFlavor)
  const [secondUnits, setSecondUnits] = useState(2)
  const [schmearId, setSchmearId] = useState(firstSchmear)
  const [schmearGrams, setSchmearGrams] = useState(120)
  const [batch, setBatch] = useState<BatchAvailability | null>(null)
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false)

  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const response = await fetch('/api/batch', { cache: 'no-store' })
        const data = (await response.json()) as BatchAvailability
        if (active) {
          setAvailabilityLoaded(response.ok)
          setBatch(data)
        }
      } catch {
        if (active) setAvailabilityLoaded(false)
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const packSelection = useMemo<BagelSelection[]>(() => {
    if (!format) return []
    if (mix === 'single' || flavorA === flavorB) return [{ flavorId: flavorA, quantity }]
    const unitsB = Math.min(secondUnits, quantity - 1)
    return [
      { flavorId: flavorA, quantity: quantity - unitsB },
      { flavorId: flavorB, quantity: unitsB },
    ]
  }, [format, mix, flavorA, flavorB, quantity, secondUnits])

  const comboSelection = useMemo<BagelSelection[]>(() => flavorA === flavorB
    ? [{ flavorId: flavorA, quantity: 2 }]
    : [{ flavorId: flavorA, quantity: 1 }, { flavorId: flavorB, quantity: 1 }], [flavorA, flavorB])

  const quote: ShopQuote | null = category === 'packs' && format
    ? quotePublishedPack({ format, quantity, mix, selection: packSelection })
    : category === 'combos'
      ? quoteTwoBagelCombo({ bagels: comboSelection, schmearId, schmearGrams: 120 })
      : category === 'schmears'
        ? quotePublishedSchmear({ flavorId: schmearId, grams: schmearGrams })
        : null

  const canCheckout = quote ? canProceedToCheckout(quote, {
    liveInventoryAvailable: Boolean(availabilityLoaded && batch?.accepting),
    currentOfferApproved: false,
  }) : false

  function chooseCategory(value: Category) {
    setCategory(value)
    setStage('configure')
    if (value !== 'packs') setFormat(null)
  }

  function resetCategory() {
    setCategory(null)
    setFormat(null)
    setStage('category')
  }

  function chooseFormat(value: BagelFormat) {
    setFormat(value)
    setQuantity(6)
    setMix('mixed')
    setSecondUnits(2)
  }

  const activeProgress = stage === 'entry' ? 0 : stage === 'category' ? 1 : 2

  return <main className="store-shell" data-stage={stage} data-category={category ?? 'none'}>
    <StoreTopbar
      stage={stage}
      availabilityLoaded={availabilityLoaded}
      batch={batch}
      onHome={() => { setStage('entry'); setCategory(null); setFormat(null) }}
      onCategory={() => { setStage('category'); setCategory(null); setFormat(null) }}
    />

    {stage === 'entry'
      ? <EntryWorld onEnter={() => setStage('category')} />
      : <ShopInterior
          stage={stage}
          category={category}
          format={format}
          onCategory={chooseCategory}
          onBack={category === 'packs' && format ? () => setFormat(null) : resetCategory}
        >
          {stage === 'category'
            ? <CategoryIsland onCategory={chooseCategory} />
            : category === 'packs' && !format
              ? <PackFormatShowcase onFormat={chooseFormat} />
              : <ConfigCounter
                  category={category!}
                  format={format}
                  quantity={quantity}
                  onQuantity={setQuantity}
                  mix={mix}
                  onMix={setMix}
                  flavorA={flavorA}
                  onFlavorA={setFlavorA}
                  flavorB={flavorB}
                  onFlavorB={setFlavorB}
                  secondUnits={secondUnits}
                  onSecondUnits={setSecondUnits}
                  schmearId={schmearId}
                  onSchmear={setSchmearId}
                  schmearGrams={schmearGrams}
                  onSchmearGrams={setSchmearGrams}
                  quote={quote}
                  canCheckout={canCheckout}
                  availabilityLoaded={availabilityLoaded}
                  batch={batch}
                />}
        </ShopInterior>}

    <Progress active={activeProgress} />
  </main>
}

function StoreTopbar({ stage, availabilityLoaded, batch, onHome, onCategory }: {
  stage: Stage
  availabilityLoaded: boolean
  batch: BatchAvailability | null
  onHome: () => void
  onCategory: () => void
}) {
  return <header className="store-topbar">
    <button type="button" className="topbar-icon" aria-label="Abrir menú">☰</button>
    <button type="button" className="brand-logo" onClick={onHome} aria-label="Volver a entrada">
      <span>bagelito</span><i>✳</i>
    </button>
    <nav className="store-wayfinding" aria-label="Recorrido">
      <button type="button" className={stage === 'entry' ? 'active' : ''} onClick={onHome}>Entrada</button>
      <span>›</span>
      <button type="button" className={stage !== 'entry' ? 'active' : ''} onClick={onCategory}>Vitrina</button>
      <span>›</span>
      <b>{stage === 'configure' ? 'Selección' : 'Elige'}</b>
    </nav>
    <div className="topbar-status">
      <span className="status-dot" data-open={Boolean(availabilityLoaded && batch?.accepting)} />
      {availabilityLoaded ? (batch?.accepting ? 'Batch abierto' : 'Batch cerrado') : 'Preview'}
    </div>
    <button type="button" className="topbar-bag" aria-label="Tu pedido">♡</button>
  </header>
}

function EntryWorld({ onEnter }: { onEnter: () => void }) {
  return <section className="entry-world" aria-label="Entrada digital a Bagelito">
    <div className="entry-copy">
      <span className="eyebrow">BAGELITO · LIMA</span>
      <h1>Entra.<br/>La tienda<br/>es el menú.</h1>
      <p>Abre la puerta, acércate a la vitrina y arma tu pedido recorriendo Bagelito.</p>
      <button type="button" className="primary-pill" onClick={onEnter}>Entrar <b>→</b></button>
    </div>
    <div className="storefront">
      <div className="awning"><strong>bagelito</strong><small>CLASSIC GRINGO BAGELS</small></div>
      <div className="facade-wall" />
      <div className="interior-glimpse">
        <div className="glimpse-sign">GOOD BAGELS<br/>GOOD DAYS</div>
        <div className="glimpse-products">
          {menu.bagels.slice(0, 5).map((bagel) => <img key={bagel.id} src={localProductImage(bagel.website_image)} alt="" />)}
        </div>
        <div className="glimpse-counter" />
      </div>
      <button className="glass-door" type="button" onClick={onEnter} aria-label="Entrar a Bagelito">
        <span className="door-panel left"><i /></span>
        <span className="door-panel right"><i /></span>
        <b>ENTRAR</b>
      </button>
      <div className="facade-base" />
    </div>
  </section>
}

function ShopInterior({ stage, category, format, onCategory, onBack, children }: {
  stage: Stage
  category: Category | null
  format: BagelFormat | null
  onCategory: (value: Category) => void
  onBack: () => void
  children: ReactNode
}) {
  return <section className="shop-world" data-mode={stage === 'category' ? 'browse' : category === 'packs' && !format ? 'packs-size' : 'configure'}>
    <div className="shop-ceiling"><span/><span/><span/></div>
    <div className="shop-back-wall">
      <div className="wall-logo">bagelito<i>✳</i></div>
      <div className="wall-tagline">BUENOS BAGELS, BUENOS DÍAS <b>✳</b></div>
      <div className="wall-menu-strip"><span>PACKS</span><span>SCHMEARS</span><span>GOOD TIMES</span></div>
    </div>
    <div className="shop-floor" />
    <SideDisplay side="left" title="Schmears" />
    <SideDisplay side="right" title="Bagels simples" />
    <div className="shop-content">{children}</div>

    {stage !== 'category' && <button className="in-store-back" type="button" onClick={onBack}>← {category === 'packs' && format ? 'Cambiar tamaño' : 'Volver a la vitrina'}</button>}

    <nav className="room-tabs" aria-label="Categorías">
      <button type="button" className={category === 'schmears' ? 'active' : ''} onClick={() => onCategory('schmears')}><span>◉</span>Schmears</button>
      <button type="button" className={category === 'packs' ? 'active' : ''} onClick={() => onCategory('packs')}><span>▣</span>Packs</button>
      <button type="button" className={category === 'combos' ? 'active' : ''} onClick={() => onCategory('combos')}><span>✚</span>Combos</button>
    </nav>
  </section>
}

function SideDisplay({ side, title }: { side: 'left' | 'right'; title: string }) {
  if (side === 'left') {
    return <aside className="side-display left" aria-hidden="true">
      <div className="side-sign">{title}</div>
      <div className="schmear-shelf">
        {menu.schmears.map((s, index) => <span className={'schmear-cup s' + index} key={s.id}><i /></span>)}
      </div>
      <div className="steel-base" />
    </aside>
  }
  return <aside className="side-display right" aria-hidden="true">
    <div className="side-sign">{title}</div>
    <div className="bagel-shelf">
      {menu.bagels.slice(0, 8).map((b) => <img key={b.id} src={localProductImage(b.website_image)} alt="" />)}
    </div>
    <div className="steel-base" />
  </aside>
}

function CategoryIsland({ onCategory }: { onCategory: (value: Category) => void }) {
  return <div className="category-island">
    <div className="island-topline">¿QUÉ TE PROVOCA HOY?</div>
    <div className="display-plinths">
      <button type="button" className="display-plinth" onClick={() => onCategory('packs')}>
        <div className="plinth-art pack-art">
          <img className="pack-box" src="/images/pack-6-mixed.webp" alt="Packs de Bagelito" />
        </div>
        <strong>Packs</strong><small>Grandes o minis</small><span>→</span>
      </button>
      <button type="button" className="display-plinth" onClick={() => onCategory('combos')}>
        <div className="plinth-art combo-art">
          <img src={localProductImage(menu.bagels[0].website_image)} alt="" />
          <img src={localProductImage(menu.bagels[1].website_image)} alt="" />
          <span className="mini-schmear"><i /></span>
        </div>
        <strong>Combos</strong><small>2 bagels + schmear</small><span>→</span>
      </button>
      <button type="button" className="display-plinth" onClick={() => onCategory('schmears')}>
        <div className="plinth-art schmear-art">
          {menu.schmears.slice(0, 3).map((s, i) => <span className={'mini-schmear m' + i} key={s.id}><i /></span>)}
        </div>
        <strong>Schmears</strong><small>5 sabores · 3 tamaños</small><span>→</span>
      </button>
    </div>
    <div className="island-base"><b>bagelito</b><span>ELIGE · COMBINA · DISFRUTA</span></div>
  </div>
}

function PackFormatShowcase({ onFormat }: { onFormat: (value: BagelFormat) => void }) {
  return <div className="format-showcase">
    <div className="showcase-heading"><span>PACKS · PASO 1</span><h2>¿Grandes o Minis?</h2><p>Primero elige el formato. Después eliges cantidad y sabores.</p></div>
    <div className="format-pedestals">
      <button type="button" className="format-pedestal" onClick={() => onFormat('grande')}>
        <div className="pedestal-art"><img src="/images/pack-6-mixed.webp" alt="Bagels grandes" /></div>
        <strong>Bagels grandes</strong><small>6 o 12 bagels</small><b>→</b>
      </button>
      <button type="button" className="format-pedestal" onClick={() => onFormat('mini')}>
        <div className="pedestal-art mini-row">
          {menu.bagels.slice(0, 4).map((bagel) => <img key={bagel.id} src={localProductImage(bagel.website_image)} alt="" />)}
        </div>
        <strong>Mini bagels</strong><small>6, 12 o 24 minis</small><b>→</b>
      </button>
    </div>
    <div className="format-counter-lip">PACKS · HECHOS PARA COMPARTIR</div>
  </div>
}

function ConfigCounter(props: {
  category: Category
  format: BagelFormat | null
  quantity: number
  onQuantity: (value: number) => void
  mix: PackMix
  onMix: (value: PackMix) => void
  flavorA: string
  onFlavorA: (value: string) => void
  flavorB: string
  onFlavorB: (value: string) => void
  secondUnits: number
  onSecondUnits: (value: number) => void
  schmearId: string
  onSchmear: (value: string) => void
  schmearGrams: number
  onSchmearGrams: (value: number) => void
  quote: ShopQuote | null
  canCheckout: boolean
  availabilityLoaded: boolean
  batch: BatchAvailability | null
}) {
  return <div className="config-counter">
    <section className="counter-worktop">
      {props.category === 'packs' && props.format && <PackBuilder {...props} />}
      {props.category === 'combos' && <ComboBuilder
        flavorA={props.flavorA} onFlavorA={props.onFlavorA}
        flavorB={props.flavorB} onFlavorB={props.onFlavorB}
        schmearId={props.schmearId} onSchmear={props.onSchmear}
      />}
      {props.category === 'schmears' && <SchmearBuilder
        schmearId={props.schmearId} onSchmear={props.onSchmear}
        grams={props.schmearGrams} onGrams={props.onSchmearGrams}
      />}
    </section>
    <ReviewReceipt
      category={props.category}
      format={props.format}
      quantity={props.quantity}
      quote={props.quote}
      canCheckout={props.canCheckout}
      availabilityLoaded={props.availabilityLoaded}
      batch={props.batch}
    />
  </div>
}

function PackBuilder(props: {
  format: BagelFormat | null
  quantity: number
  onQuantity: (value: number) => void
  mix: PackMix
  onMix: (value: PackMix) => void
  flavorA: string
  onFlavorA: (value: string) => void
  flavorB: string
  onFlavorB: (value: string) => void
  secondUnits: number
  onSecondUnits: (value: number) => void
}) {
  const quantities = props.format === 'mini' ? [6, 12, 24] : [6, 12]
  return <>
    <BuilderHeading step="PACKS · PASO 2" title={props.format === 'mini' ? 'Arma tus minis' : 'Arma tu pack'} copy="Elige cantidad, tipo de pack y sabores." />
    <div className="control-strip">
      <Field label="Cantidad"><div className="option-row">{quantities.map((n) => <button type="button" key={n} className={props.quantity === n ? 'selected' : ''} onClick={() => props.onQuantity(n)}>{n}</button>)}</div></Field>
      <Field label="Tipo"><div className="option-row">
        <button type="button" className={props.mix === 'mixed' ? 'selected' : ''} onClick={() => props.onMix('mixed')}>Mixtos</button>
        <button type="button" className={props.mix === 'single' ? 'selected' : ''} onClick={() => props.onMix('single')}>Un sabor</button>
      </div></Field>
    </div>
    <FlavorShelf selected={[props.flavorA, ...(props.mix === 'mixed' ? [props.flavorB] : [])]} onFirst={props.onFlavorA} onSecond={props.onFlavorB} first={props.flavorA} second={props.flavorB} mixed={props.mix === 'mixed'} />
    {props.mix === 'mixed' && <Field label={'Unidades del segundo sabor: ' + Math.min(props.secondUnits, props.quantity - 1)}>
      <input className="range" type="range" min={1} max={props.quantity - 1} value={Math.min(props.secondUnits, props.quantity - 1)} onChange={(event) => props.onSecondUnits(Number(event.target.value))} />
    </Field>}
  </>
}

function ComboBuilder({ flavorA, onFlavorA, flavorB, onFlavorB, schmearId, onSchmear }: {
  flavorA: string
  onFlavorA: (value: string) => void
  flavorB: string
  onFlavorB: (value: string) => void
  schmearId: string
  onSchmear: (value: string) => void
}) {
  return <>
    <BuilderHeading step="COMBOS" title="2 bagels + schmear" copy="Sin sándwich. Sin bebida. El precio final todavía está por confirmar." />
    <FlavorShelf selected={[flavorA, flavorB]} onFirst={onFlavorA} onSecond={onFlavorB} first={flavorA} second={flavorB} mixed />
    <SchmearPicker value={schmearId} onChange={onSchmear} />
  </>
}

function SchmearBuilder({ schmearId, onSchmear, grams, onGrams }: {
  schmearId: string
  onSchmear: (value: string) => void
  grams: number
  onGrams: (value: number) => void
}) {
  return <>
    <BuilderHeading step="SCHMEARS" title="Elige tu schmear" copy="Sabor y tamaño según la carta publicada." />
    <Field label="Tamaño"><div className="option-row">{menu.schmearSizes.map((size) => <button type="button" key={size.grams} className={grams === size.grams ? 'selected' : ''} onClick={() => onGrams(size.grams)}>{size.grams} g</button>)}</div></Field>
    <div className="schmear-choice-grid">
      {menu.schmears.map((s, i) => <button type="button" key={s.id} className={schmearId === s.id ? 'selected' : ''} onClick={() => onSchmear(s.id)}>
        <span className={'schmear-cup choice s' + i}><i /></span><strong>{s.name}</strong>
      </button>)}
    </div>
  </>
}

function FlavorShelf({ selected, onFirst, onSecond, first, second, mixed }: {
  selected: string[]
  onFirst: (value: string) => void
  onSecond: (value: string) => void
  first: string
  second: string
  mixed: boolean
}) {
  return <div className="flavor-station">
    <div className="station-label">ELIGE TUS BAGELS</div>
    <div className="flavor-shelf">
      {menu.bagels.map((bagel) => {
        const active = selected.includes(bagel.id)
        return <button type="button" key={bagel.id} className={active ? 'active' : ''} onClick={() => {
          if (first !== bagel.id) onFirst(bagel.id)
          else if (mixed && second !== bagel.id) onSecond(bagel.id)
        }}>
          <img src={localProductImage(bagel.website_image)} alt={bagel.name} />
          <strong>{bagel.name}</strong>
          {bagel.premium && <small>Premium</small>}
        </button>
      })}
    </div>
    <div className="metal-lip"><span>BAGELITO</span><span>BAKED WITH LOVE</span></div>
  </div>
}

function BuilderHeading({ step, title, copy }: { step: string; title: string; copy: string }) {
  return <header className="builder-heading"><span>{step}</span><h2>{title}</h2><p>{copy}</p></header>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><div className="field-label">{label}</div>{children}</div>
}

function SchmearPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Field label="Schmear"><select value={value} onChange={(event) => onChange(event.target.value)}>
    {menu.schmears.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
  </select></Field>
}

function ReviewReceipt({ category, format, quantity, quote, canCheckout, availabilityLoaded, batch }: {
  category: Category
  format: BagelFormat | null
  quantity: number
  quote: ShopQuote | null
  canCheckout: boolean
  availabilityLoaded: boolean
  batch: BatchAvailability | null
}) {
  const title = category === 'packs'
    ? format ? quantity + ' ' + (format === 'mini' ? 'mini bagels' : 'bagels grandes') : 'Packs'
    : category === 'combos' ? '2 bagels + schmear' : 'Schmear'
  return <aside className="receipt-card" aria-live="polite">
    <div className="receipt-teeth" />
    <div className="receipt-brand">BAGELITO<span>✳</span></div>
    <div className="receipt-kicker">TU SELECCIÓN</div>
    <h2>{title}</h2>
    <div className="receipt-row"><span>Precio</span><strong>{quote?.publishedBasePen == null ? 'Por confirmar' : 'S/ ' + quote.publishedBasePen.toFixed(2)}</strong></div>
    <div className="receipt-row"><span>Disponibilidad</span><strong>{availabilityLoaded ? (batch?.accepting ? 'Batch abierto' : 'Cerrado') : 'Por conectar'}</strong></div>
    <div className="receipt-row"><span>Estado</span><strong>{quote?.status === 'ready' ? 'Selección válida' : quote?.status === 'invalid' ? 'Revisar' : 'Revisión comercial'}</strong></div>
    {quote?.reasons.map((reason) => <p className="receipt-note" key={reason}>{reason}</p>)}
    <button type="button" className="checkout-button" disabled={!canCheckout}>Checkout aún no habilitado</button>
    <small>Esta preview no crea pedidos, reservas ni cobros.</small>
  </aside>
}

function Progress({ active }: { active: number }) {
  const steps = ['Entrada', 'Vitrina', 'Selecciona', 'Revisa', 'Pago']
  return <nav className="store-progress" aria-label="Progreso del pedido">
    {steps.map((step, index) => <span key={step} data-active={index === active} data-done={index < active}>
      <i>{index < active ? '✓' : index + 1}</i><b>{step}</b>
    </span>)}
  </nav>
}
