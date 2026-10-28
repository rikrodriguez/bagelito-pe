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
    <div className="review-ribbon">PREVIEW COMERCIAL · SIN PEDIDOS NI COBROS</div>

    <header className="store-header">
      <button className="wordmark" type="button" onClick={() => { setStage('entry'); setCategory(null); setFormat(null) }} aria-label="Volver al inicio">
        bagelito<span>✳</span>
      </button>
      <div className="batch-pill" data-open={Boolean(availabilityLoaded && batch?.accepting)}>
        <i />
        {availabilityLoaded ? (batch?.accepting ? 'Batch abierto' : 'Batch cerrado') : 'Batch por confirmar'}
      </div>
    </header>

    {stage === 'entry' && <section className="store-scene entry-scene" aria-label="Entrada a Bagelito">
      <img src="/store-entry-door.webp" alt="Entrada conceptual de Bagelito" />
      <div className="scene-shade" />
      <div className="entry-card">
        <span className="scene-kicker">BAGELITO · LIMA</span>
        <h1>Entra a<br />Bagelito.</h1>
        <p>Acércate a la vitrina y arma tu pedido como si estuvieras en la tienda.</p>
        <button className="scene-primary" type="button" onClick={() => setStage('category')}>
          Entrar <b>→</b>
        </button>
      </div>
    </section>}

    {stage === 'category' && <section className="store-scene counter-scene" aria-label="Vitrina de Bagelito">
      <img src="/store-category-flow.webp" alt="Vitrina conceptual de Bagelito" />
      <div className="scene-shade counter-shade" />
      <div className="counter-panel">
        <span className="scene-kicker">EN LA VITRINA</span>
        <h1>¿Qué te provoca hoy?</h1>
        <p>Elige cómo quieres armar tu pedido.</p>
        <div className="category-grid">
          <CategoryCard title="Packs" detail="Grandes o minis" symbol="◫" onClick={() => chooseCategory('packs')} />
          <CategoryCard title="Combos" detail="2 bagels + schmear" symbol="＋" onClick={() => chooseCategory('combos')} />
          <CategoryCard title="Schmears" detail="Elige sabor y tamaño" symbol="◯" onClick={() => chooseCategory('schmears')} />
        </div>
      </div>
    </section>}

    {stage === 'configure' && category && <section className="config-stage">
      <div className="config-backdrop" aria-hidden="true">
        <img src="/store-category-flow.webp" alt="" />
        <div />
      </div>
      <div className="config-wrap">
        <button type="button" className="back-button" onClick={category === 'packs' && format ? () => setFormat(null) : resetCategory}>← {category === 'packs' && format ? 'Cambiar tamaño' : 'Categorías'}</button>

        <div className="config-grid">
          <section className="builder-card">
            {category === 'packs' && <PackBuilder
              format={format}
              onFormat={chooseFormat}
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
            />}
            {category === 'combos' && <ComboBuilder
              flavorA={flavorA}
              onFlavorA={setFlavorA}
              flavorB={flavorB}
              onFlavorB={setFlavorB}
              schmearId={schmearId}
              onSchmear={setSchmearId}
            />}
            {category === 'schmears' && <SchmearBuilder
              schmearId={schmearId}
              onSchmear={setSchmearId}
              grams={schmearGrams}
              onGrams={setSchmearGrams}
            />}
          </section>

          <ReviewCard
            category={category}
            format={format}
            quantity={quantity}
            quote={quote}
            canCheckout={canCheckout}
            availabilityLoaded={availabilityLoaded}
            batch={batch}
          />
        </div>
      </div>
    </section>}

    <Progress active={activeProgress} />
  </main>
}

function CategoryCard({ title, detail, symbol, onClick }: { title: string; detail: string; symbol: string; onClick: () => void }) {
  return <button className="category-card" type="button" onClick={onClick}>
    <span className="category-symbol">{symbol}</span>
    <span><strong>{title}</strong><small>{detail}</small></span>
    <b>→</b>
  </button>
}

function PackBuilder(props: {
  format: BagelFormat | null
  onFormat: (value: BagelFormat) => void
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
  if (!props.format) return <>
    <BuilderHeading step="PACKS · PASO 1" title="¿Grandes o Minis?" copy="Primero elige el tamaño. Luego cantidad y sabores." />
    <div className="format-grid">
      <button type="button" className="format-card" onClick={() => props.onFormat('grande')}>
        <span className="format-art large"><img src="https://bagelito.pe/images/pack-6-mixed.webp" alt="Pack de bagels grandes" /></span>
        <span><strong>Bagels grandes</strong><small>6 o 12 bagels</small></span><b>→</b>
      </button>
      <button type="button" className="format-card" onClick={() => props.onFormat('mini')}>
        <span className="format-art minis">
          {menu.bagels.slice(0, 3).map((bagel) => <img key={bagel.id} src={bagel.website_image} alt="" />)}
        </span>
        <span><strong>Mini bagels</strong><small>6, 12 o 24 minis</small></span><b>→</b>
      </button>
    </div>
  </>

  const quantities = props.format === 'mini' ? [6, 12, 24] : [6, 12]
  return <>
    <BuilderHeading step="PACKS · PASO 2" title={`Arma tus ${props.format === 'mini' ? 'minis' : 'bagels'}`} copy="Elige cantidad, tipo de pack y sabores." />
    <Field label="Cantidad"><div className="option-row">
      {quantities.map((n) => <button type="button" key={n} className={props.quantity === n ? 'selected' : ''} onClick={() => props.onQuantity(n)}>{n}</button>)}
    </div></Field>
    <Field label="Tipo"><div className="option-row">
      <button type="button" className={props.mix === 'mixed' ? 'selected' : ''} onClick={() => props.onMix('mixed')}>Mixtos</button>
      <button type="button" className={props.mix === 'single' ? 'selected' : ''} onClick={() => props.onMix('single')}>Un sabor</button>
    </div></Field>
    <FlavorPicker label="Sabor principal" value={props.flavorA} onChange={props.onFlavorA} />
    {props.mix === 'mixed' && <>
      <FlavorPicker label="Segundo sabor" value={props.flavorB} onChange={props.onFlavorB} />
      <Field label={`Unidades del segundo sabor: ${Math.min(props.secondUnits, props.quantity - 1)}`}>
        <input className="range" type="range" min={1} max={props.quantity - 1} value={Math.min(props.secondUnits, props.quantity - 1)} onChange={(event) => props.onSecondUnits(Number(event.target.value))} />
      </Field>
    </>}
    <ProductRail selected={[props.flavorA, ...(props.mix === 'mixed' ? [props.flavorB] : [])]} />
  </>
}

function ComboBuilder({ flavorA, onFlavorA, flavorB, onFlavorB, schmearId, onSchmear }: {
  flavorA: string; onFlavorA: (value: string) => void
  flavorB: string; onFlavorB: (value: string) => void
  schmearId: string; onSchmear: (value: string) => void
}) {
  return <>
    <BuilderHeading step="COMBOS" title="2 bagels + schmear" copy="Sin sándwich. Sin bebida. El precio final del combo todavía requiere aprobación." />
    <FlavorPicker label="Primer bagel" value={flavorA} onChange={onFlavorA} />
    <FlavorPicker label="Segundo bagel" value={flavorB} onChange={onFlavorB} />
    <SchmearPicker value={schmearId} onChange={onSchmear} />
    <ProductRail selected={[flavorA, flavorB]} />
  </>
}

function SchmearBuilder({ schmearId, onSchmear, grams, onGrams }: {
  schmearId: string; onSchmear: (value: string) => void; grams: number; onGrams: (value: number) => void
}) {
  return <>
    <BuilderHeading step="SCHMEARS" title="Elige tu schmear" copy="Sabor y tamaño según la carta publicada de referencia." />
    <SchmearPicker value={schmearId} onChange={onSchmear} />
    <Field label="Tamaño"><div className="option-row">
      {menu.schmearSizes.map((size) => <button type="button" key={size.grams} className={grams === size.grams ? 'selected' : ''} onClick={() => onGrams(size.grams)}>{size.grams} g</button>)}
    </div></Field>
    <div className="schmear-grid">
      {menu.schmears.map((s) => <button type="button" key={s.id} className={schmearId === s.id ? 'selected' : ''} onClick={() => onSchmear(s.id)}>
        <span className="schmear-scoop" /><strong>{s.name}</strong>
      </button>)}
    </div>
  </>
}

function BuilderHeading({ step, title, copy }: { step: string; title: string; copy: string }) {
  return <header className="builder-heading"><span>{step}</span><h2>{title}</h2><p>{copy}</p></header>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><div className="field-label">{label}</div>{children}</div>
}

function FlavorPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)}>
    {menu.bagels.map((bagel) => <option key={bagel.id} value={bagel.id}>{bagel.name}{bagel.premium ? ' · Premium' : ''}</option>)}
  </select></Field>
}

function SchmearPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Field label="Schmear"><select value={value} onChange={(event) => onChange(event.target.value)}>
    {menu.schmears.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
  </select></Field>
}

function ProductRail({ selected }: { selected: string[] }) {
  return <div className="product-rail" aria-label="Sabores de bagel">
    {menu.bagels.map((bagel) => <article key={bagel.id} className={selected.includes(bagel.id) ? 'active' : ''}>
      <img src={bagel.website_image} alt={bagel.name} loading="lazy" />
      <strong>{bagel.name}</strong>{bagel.premium && <small>Premium</small>}
    </article>)}
  </div>
}

function ReviewCard({ category, format, quantity, quote, canCheckout, availabilityLoaded, batch }: {
  category: Category
  format: BagelFormat | null
  quantity: number
  quote: ShopQuote | null
  canCheckout: boolean
  availabilityLoaded: boolean
  batch: BatchAvailability | null
}) {
  const title = category === 'packs'
    ? format ? `${quantity} ${format === 'mini' ? 'mini bagels' : 'bagels grandes'}` : 'Elige Grandes o Minis'
    : category === 'combos' ? '2 bagels + schmear' : 'Schmear'
  return <aside className="review-card" aria-live="polite">
    <span className="review-label">TU SELECCIÓN</span>
    <h2>{title}</h2>
    <div className="review-price">{quote?.publishedBasePen == null ? 'Por confirmar' : `S/ ${quote.publishedBasePen.toFixed(2)}`}</div>
    <p className="review-caption">Precio publicado de referencia. El servidor volverá a validar oferta, stock y monto antes de cualquier pago.</p>
    <div className="review-line"><span>Disponibilidad</span><strong>{availabilityLoaded ? (batch?.accepting ? 'Batch abierto' : 'Cerrado') : 'Por conectar'}</strong></div>
    <div className="review-line"><span>Estado</span><strong>{quote?.status === 'ready' ? 'Selección válida' : quote?.status === 'invalid' ? 'Revisar selección' : 'Revisión comercial'}</strong></div>
    {quote?.reasons.map((reason) => <p className="review-reason" key={reason}>{reason}</p>)}
    <button className="checkout-button" type="button" disabled={!canCheckout}>Checkout aún no habilitado</button>
    <small>Esta preview no crea pedidos, reservas ni cobros.</small>
  </aside>
}

function Progress({ active }: { active: number }) {
  const steps = ['Entrada', 'Categoría', 'Selecciona', 'Revisa', 'Pago']
  return <nav className="store-progress" aria-label="Progreso del pedido">
    {steps.map((step, index) => <span key={step} data-active={index === active} data-done={index < active}>
      <i>{index < active ? '✓' : index + 1}</i><b>{step}</b>
    </span>)}
  </nav>
}
