import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import {
  getVerifiedDisplayMenu,
  quotePublishedPack,
  quotePublishedSchmear,
  quoteTwoBagelCombo,
  canProceedToCheckout,
  type BagelSelection,
  type BagelFormat,
  type PackMix,
} from '../domain/lib/approved-shop-contract'
import type { BatchAvailability } from '../domain/lib/batch-types'

export const Route = createFileRoute('/')({ component: BagelitoPreview })

type Tab = 'packs' | 'combos' | 'schmears'
const menu = getVerifiedDisplayMenu()
const firstFlavor = menu.bagels[0]?.id ?? 'plain'
const secondFlavor = menu.bagels[1]?.id ?? 'sesame'
const firstSchmear = menu.schmears[0]?.id ?? 'whipped-original'

function BagelitoPreview() {
  const [tab, setTab] = useState<Tab>('packs')
  const [format, setFormat] = useState<BagelFormat>('grande')
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
    const timer = setInterval(refresh, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  const selection: BagelSelection[] = mix === 'single' || flavorA === flavorB
    ? [{ flavorId: flavorA, quantity }]
    : [
      { flavorId: flavorA, quantity: quantity - Math.min(secondUnits, quantity - 1) },
      { flavorId: flavorB, quantity: Math.min(secondUnits, quantity - 1) },
    ]
  const comboSelection: BagelSelection[] = flavorA === flavorB
    ? [{ flavorId: flavorA, quantity: 2 }]
    : [{ flavorId: flavorA, quantity: 1 }, { flavorId: flavorB, quantity: 1 }]

  const quote = tab === 'packs'
    ? quotePublishedPack({ format, quantity, mix, selection })
    : tab === 'combos'
      ? quoteTwoBagelCombo({ bagels: comboSelection, schmearId, schmearGrams })
      : quotePublishedSchmear({ flavorId: schmearId, grams: schmearGrams })

  // This technical preview can never authorize a real purchase.
  const canCheckout = canProceedToCheckout(quote, {
    liveInventoryAvailable: Boolean(availabilityLoaded && batch?.accepting),
    currentOfferApproved: false,
  })

  function changeFormat(value: BagelFormat) {
    setFormat(value)
    if (value === 'grande' && quantity === 24) setQuantity(12)
  }

  return <div className="site">
    <div className="top-alert">VISTA TÉCNICA · no acepta pedidos ni cobros · precios publicados como referencia</div>
    <header className="header">
      <a className="brand" href="#inicio">bagelito<span>✳</span></a>
      <nav><a href="#sabores">Sabores</a><a href="#configurador">Configurar</a></nav>
      <span className="chip">Vista previa</span>
    </header>
    <main id="inicio">
      <section className="hero">
        <div>
          <p className="eyebrow">BAGELITO · LIMA</p>
          <h1>Tu antojo.<br /><em>Tu Bagelito.</em></h1>
          <p className="subtitle">Explora nuestros bagels, minis y schmears. Configura lo que más te provoca para el próximo batch.</p>
          <a className="primary-link" href="#configurador">Ver menú <span>↗</span></a>
          <p className="availability" role="status"><span className="status-dot" />{availabilityLoaded
            ? batch?.accepting ? 'Batch abierto (consulta)' : 'Pedidos cerrados: disponibilidad por confirmar'
            : 'Disponibilidad real aún no conectada'}</p>
        </div>
        <div className="hero-art" aria-label="Fotografías reales de Bagelito">
          <img src="https://bagelito.pe/images/bagel-everything.webp" alt="Bagel Everything" />
          <img src="https://bagelito.pe/images/bagel-jalapeno-cheddar.webp" alt="Bagel Jalapeño Cheddar" />
        </div>
      </section>

      <section className="catalog" id="sabores">
        <p className="eyebrow">LA VITRINA</p>
        <h2>Sabores para cada antojo</h2>
        <p className="muted">Catálogo documentado el 21 de octubre. Stock y promociones actuales sujetos a validación.</p>
        <div className="flavors">
          {menu.bagels.map(bagel => <article key={bagel.id} className="flavor-card">
            <div className="flavor-image"><img src={bagel.website_image} loading="lazy" alt={bagel.name} /></div>
            <strong>{bagel.name}</strong>{bagel.premium ? <small>Premium</small> : null}
          </article>)}
        </div>
      </section>

      <section className="config" id="configurador">
        <p className="eyebrow">ELIGE TU CAMINO</p>
        <h2>¿Packs, combos o schmears?</h2>
        <div className="tabs" role="tablist" aria-label="Categoría">
          {(['packs','combos','schmears'] as const).map(value => <button
            key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''}
            onClick={() => setTab(value)}>{value === 'packs' ? 'Packs' : value === 'combos' ? 'Combos' : 'Schmears'}</button>)}
        </div>
        <div className="config-columns">
          <div className="selections">
            {tab === 'packs' ? <>
              <h3>Personaliza tu pack</h3>
              <Field label="Formato"><div className="choices">
                {(['grande','mini'] as const).map(value => <button key={value} className={format === value ? 'chosen' : ''} onClick={() => changeFormat(value)}>{value === 'grande' ? 'Grandes' : 'Mini bagels'}</button>)}
              </div></Field>
              <Field label="Cantidad"><div className="choices">
                {(format === 'mini' ? [6,12,24] : [6,12]).map(n => <button key={n} className={quantity === n ? 'chosen' : ''} onClick={() => setQuantity(n)}>{n}</button>)}
              </div></Field>
              <Field label="Sabores"><div className="choices">
                {(['mixed','single'] as const).map(value => <button key={value} className={mix === value ? 'chosen' : ''} onClick={() => setMix(value)}>{value === 'mixed' ? 'Mixto' : 'Un sabor'}</button>)}
              </div></Field>
              <FlavorSelect label="Sabor principal" value={flavorA} onChange={setFlavorA} />
              {mix === 'mixed' ? <>
                <FlavorSelect label="Segundo sabor" value={flavorB} onChange={setFlavorB} />
                <Field label={'Unidades del segundo sabor: ' + Math.min(secondUnits, quantity - 1)}>
                  <input type="range" min={1} max={quantity - 1} value={Math.min(secondUnits, quantity - 1)}
                    onChange={e => setSecondUnits(Number(e.target.value))} />
                </Field>
              </> : null}
            </> : tab === 'combos' ? <>
              <h3>Dos bagels + schmear</h3>
              <p className="muted">Sin sándwich y sin bebida. Precio del combo pendiente de aprobación.</p>
              <FlavorSelect label="Primer bagel" value={flavorA} onChange={setFlavorA} />
              <FlavorSelect label="Segundo bagel" value={flavorB} onChange={setFlavorB} />
              <SchmearSelect value={schmearId} onChange={setSchmearId} />
            </> : <>
              <h3>Solo schmear</h3>
              <SchmearSelect value={schmearId} onChange={setSchmearId} />
              <Field label="Tamaño"><div className="choices">
                {menu.schmearSizes.map(size => <button key={size.grams}
                  className={schmearGrams === size.grams ? 'chosen' : ''}
                  onClick={() => setSchmearGrams(size.grams)}>{size.grams} g</button>)}
              </div></Field>
            </>}
          </div>
          <aside className="quote" aria-live="polite">
            <p className="eyebrow">TU SELECCIÓN</p>
            <h3>{tab === 'packs' ? quantity + ' bagels ' + (format === 'mini' ? 'minis' : 'grandes')
              : tab === 'combos' ? 'Dos bagels + schmear' : 'Schmear'}</h3>
            <p className="total">{quote.publishedBasePen === null ? 'Por confirmar' : 'S/ ' + quote.publishedBasePen.toFixed(2)}</p>
            <p className="quote-note">Referencia de la carta; no constituye cotización vigente.</p>
            <div className="quote-status">{quote.status === 'ready' ? 'Selección registrada' : quote.status === 'invalid' ? 'Corrige la selección' : 'Requiere confirmación comercial'}</div>
            {quote.reasons.map(message => <p className="quote-reason" key={message}>{message}</p>)}
            <button className="checkout" disabled={!canCheckout}>Checkout aún no habilitado</button>
            <small>No es posible cobrar hasta verificar precio, capacidad, vigencia y pagos del servidor.</small>
          </aside>
        </div>
      </section>
    </main>
    <footer><strong>bagelito✳</strong><span>Prueba técnica independiente · Sin cobros · Sin envíos</span></footer>
  </div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><div className="field-label">{label}</div>{children}</div>
}
function FlavorSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><select value={value} onChange={event => onChange(event.target.value)}>
    {menu.bagels.map(bagel => <option key={bagel.id} value={bagel.id}>{bagel.name}{bagel.premium ? ' (Premium)' : ''}</option>)}
  </select></Field>
}
function SchmearSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Field label="Schmear"><select value={value} onChange={event => onChange(event.target.value)}>
    {menu.schmears.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
  </select></Field>
}
