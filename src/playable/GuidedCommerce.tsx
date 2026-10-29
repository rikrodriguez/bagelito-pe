import { useEffect, useMemo, useRef, useState } from 'react'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'
import { deliveryDistricts } from '../domain/data/delivery-districts'
import { CHECKOUT_LEGAL_VERSION } from '../domain/lib/legal-version'
import {
  CulqiBrowserCheckout,
  type CheckoutCustomer,
  type CulqiPublicConfig,
} from './CulqiBrowserCheckout'
import './guided-commerce.css'

const menu = getVerifiedDisplayMenu()
const combos = [{ id: 'two-bagel-schmear', name: '2 Bagels + Schmear', bagels: 2, schmear_count: 1, price: null }] as const

type Category = 'packs' | 'combos' | 'schmears'
type PackFormat = 'grande' | 'mini'
type Scene =
  | 'entrance'
  | 'selector'
  | 'pack-size'
  | 'pack-qty'
  | 'combos'
  | 'schmear-size'
  | 'bagels'
  | 'schmears'
  | 'cross-sell'
  | 'cashier'
  | 'pay'
  | 'receipt'
  | 'wallet'
  | 'handoff'
  | 'goodbye'
  | 'returning'

type BagelMode = 'pack' | 'combo' | 'upsell8' | 'downsell2'

// Spatial order from the approved 1800 × 666 vitrina artwork, NOT catalog order.
// Left→right: Plain, Everything, Sesame, Classic Onion / Jalapeño Cheddar,
// Cheddar, Cinnamon Raisin, Blueberry. Keep hotspots aligned to artwork trays.
export const BAGEL_SHOWCASE_ORDER = [
  'plain', 'everything', 'sesame', 'classic-onion',
  'jalapeno-cheddar', 'cheddar', 'cinnamon-raisin', 'blueberry',
] as const

const BAGEL_SPOTS = [
  { left: '6%', top: '7%', width: '19%', height: '43%' },
  { left: '25%', top: '7%', width: '25%', height: '43%' },
  { left: '50%', top: '7%', width: '25%', height: '43%' },
  { left: '75%', top: '7%', width: '25%', height: '43%' },
  { left: '6%', top: '53%', width: '19%', height: '44%' },
  { left: '25%', top: '53%', width: '25%', height: '44%' },
  { left: '50%', top: '53%', width: '25%', height: '44%' },
  { left: '75%', top: '53%', width: '25%', height: '44%' },
] as const

/** Blue-on-white inverted label plates, aligned to the printed labels
 * in /images/bagel-vitrina-photo.webp (800 × 300 photograph). These are
 * presentation only; product selection remains on the existing hotspots.
 */
export const BAGEL_SIGN_POSITIONS = [
  { left: '6%', top: '32.5%', width: '21%', height: '12%' },
  { left: '29%', top: '32.5%', width: '21%', height: '12%' },
  { left: '52.5%', top: '32.5%', width: '21%', height: '12%' },
  { left: '76%', top: '32.5%', width: '21.5%', height: '12%' },
  { left: '5%', top: '77.5%', width: '22.5%', height: '12%' },
  { left: '28.5%', top: '77.5%', width: '22%', height: '12%' },
  { left: '52%', top: '77.5%', width: '22%', height: '12%' },
  { left: '75.5%', top: '77.5%', width: '22%', height: '12%' },
] as const

const SCHMEAR_SPOTS = [
  { left: '5%', top: '20%', width: '17%', height: '61%' },
  { left: '23%', top: '20%', width: '17%', height: '61%' },
  { left: '41%', top: '20%', width: '17%', height: '61%' },
  { left: '59%', top: '20%', width: '17%', height: '61%' },
  { left: '77%', top: '20%', width: '17%', height: '61%' },
] as const

export function GuidedCommerce({ onExit, customerName }: { onExit: () => void; customerName?: string | null }) {
  const [scene, setScene] = useState<Scene>('entrance')
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [category, setCategory] = useState<Category | null>(null)
  const [packFormat, setPackFormat] = useState<PackFormat>('grande')
  const [packQty, setPackQty] = useState(6)
  const [packMix, setPackMix] = useState<'mixed'|'single'>('mixed')
  const [comboId, setComboId] = useState<string | null>(null)
  const [schmearSize, setSchmearSize] = useState(120)
  const [bagelMode, setBagelMode] = useState<BagelMode>('pack')
  const [bagelCounts, setBagelCounts] = useState<Record<string, number>>({})
  const [schmearCounts, setSchmearCounts] = useState<Record<string, number>>({})
  const [receiptPulled, setReceiptPulled] = useState(false)
  const [walletSaved, setWalletSaved] = useState(false)
  const [paidOrderCode, setPaidOrderCode] = useState<string | null>(null)
  const [paidAmountPen, setPaidAmountPen] = useState<number | null>(null)
  const [paymentReviewMessage, setPaymentReviewMessage] = useState('')
  const [checkoutCustomer, setCheckoutCustomer] = useState<CheckoutCustomer>({
    customerName: customerName ?? '',
    email: '',
    whatsapp: '',
    deliveryAddress: '',
    district: '',
    addressReference: '',
    deliveryNotes: '',
    termsAccepted: false,
    termsVersion: CHECKOUT_LEGAL_VERSION,
  })
  const [paymentConfig, setPaymentConfig] = useState<CulqiPublicConfig | null>(null)
  const [checkoutQuote, setCheckoutQuote] = useState<{status:string;checkoutAllowed:boolean;amountPen:number|null;reasons:string[]}|null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const qaRequested = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1'
  const qaMode = qaRequested && paymentConfig?.visualQaAllowed === true
  const receiptDrag = useRef({ startY: 0, offset: 0 })
  const receiptPulledRef = useRef(false)

  // Navigation and order drawer stay in their own layer while walking.
  // Close both when the customer moves to a new scene.
  useEffect(() => {
    setMenuOpen(false)
    setCartOpen(false)
  }, [scene])

  useEffect(() => {
    if (customerName) {
      setCheckoutCustomer((current) => current.customerName.trim()
        ? current
        : { ...current, customerName })
    }
  }, [customerName])

  useEffect(() => {
    let active = true
    fetch('/api/payments/culqi/config', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('payment-config-unavailable')
        return await response.json() as {
          enabled?: boolean
          configured?: boolean
          intakeEnabled?: boolean
          bridgeReady?: boolean
          webhookReady?: boolean
          clientReady?: boolean
          visualQaAllowed?: boolean
          mode?: string
          currency?: 'PEN'
          publicKey?: string
          rsaId?: string
          rsaPublicKey?: string
        }
      })
      .then((config) => {
        if (active) setPaymentConfig({
          enabled: config.enabled === true,
          configured: config.configured === true,
          intakeEnabled: config.intakeEnabled === true,
          bridgeReady: config.bridgeReady === true,
          webhookReady: config.webhookReady === true,
          clientReady: config.clientReady === true,
          visualQaAllowed: config.visualQaAllowed === true,
          mode: typeof config.mode === 'string' ? config.mode : 'disabled',
          currency: config.currency === 'PEN' ? 'PEN' : 'PEN',
          publicKey: typeof config.publicKey === 'string' ? config.publicKey : '',
          rsaId: typeof config.rsaId === 'string' ? config.rsaId : '',
          rsaPublicKey: typeof config.rsaPublicKey === 'string' ? config.rsaPublicKey : '',
        })
      })
      .catch(() => {
        if (active) setPaymentConfig({
          enabled: false,
          configured: false,
          intakeEnabled: false,
          bridgeReady: false,
          webhookReady: false,
          clientReady: false,
          visualQaAllowed: false,
          mode: 'disabled',
          currency: 'PEN',
          publicKey: '',
          rsaId: '',
          rsaPublicKey: '',
        })
      })
    return () => { active = false }
  }, [])


  useEffect(() => {
    if (scene !== 'cashier' || paymentConfig === null) return

    if (qaMode) {
      setQuoteLoading(false)
      setCheckoutQuote({
        status: 'review_required',
        checkoutAllowed: false,
        amountPen: null,
        reasons: ['Preview visual · el precio final se valida en servidor antes de cobrar.'],
      })
      return
    }

    let active = true
    setQuoteLoading(true)
    setCheckoutQuote(null)
    fetch('/api/checkout/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        category,
        packFormat,
        packQty,
        packMix,
        bagels: bagelCounts,
        schmears: schmearCounts,
        schmearSize,
        comboId,
        bagelMode,
      }),
    })
      .then(async (response) => {
        const result = await response.json() as { status?: string; checkoutAllowed?: boolean; amountPen?: number | null; reasons?: string[] }
        return {
          status: typeof result.status === 'string' ? result.status : 'invalid',
          checkoutAllowed: result.checkoutAllowed === true,
          amountPen: typeof result.amountPen === 'number' ? result.amountPen : null,
          reasons: Array.isArray(result.reasons) ? result.reasons.filter((x): x is string => typeof x === 'string') : [],
        }
      })
      .then((quote) => { if (active) setCheckoutQuote(quote) })
      .catch(() => {
        if (active) setCheckoutQuote({ status: 'invalid', checkoutAllowed: false, amountPen: null, reasons: ['No se pudo validar el pedido.'] })
      })
      .finally(() => { if (active) setQuoteLoading(false) })
    return () => { active = false }
  }, [scene, category, packFormat, packQty, packMix, bagelCounts, schmearCounts, schmearSize, comboId, bagelMode, paymentConfig, qaMode])

  const selectedCombo = combos.find((c) => c.id === comboId) ?? null
  const bagelTotal = Object.values(bagelCounts).reduce((sum, n) => sum + n, 0)
  const schmearTotal = Object.values(schmearCounts).reduce((sum, n) => sum + n, 0)
  const selectedBagelSummary = menu.bagels
    .filter((item) => (bagelCounts[item.id] ?? 0) > 0)
    .map((item) => ({ name: item.name, quantity: bagelCounts[item.id] ?? 0 }))
  const selectedSchmearSummary = menu.schmears
    .filter((item) => (schmearCounts[item.id] ?? 0) > 0)
    .map((item) => ({ name: item.name, quantity: schmearCounts[item.id] ?? 0 }))

  const bagelTarget = bagelMode === 'upsell8'
    ? 8
    : bagelMode === 'downsell2'
      ? 2
      : category === 'packs'
        ? packQty
        : selectedCombo?.bagels ?? 0

  const schmearTarget = category === 'combos' ? selectedCombo?.schmear_count ?? 0 : 1

  const progressIndex = scene === 'selector' || scene === 'pack-size' || scene === 'pack-qty' || scene === 'combos' || scene === 'schmear-size'
    ? 0
    : scene === 'bagels'
      ? 1
      : scene === 'schmears' || scene === 'cross-sell'
        ? 2
        : scene === 'cashier'
          ? 3
          : 4

  const sceneImage = useMemo(() => {
    const base = '/master-scenes-clean/'
    if (scene === 'entrance') return '/store-entry-door.webp'
    if (scene === 'selector') return base + 'selector.webp'
    if (scene === 'pack-size' || scene === 'pack-qty') return base + 'packs.webp'
    if (scene === 'combos') return base + 'combos.webp'
    if (scene === 'schmear-size') return base + 'schmears.webp'
    if (scene === 'bagels') return '/images/bagel-vitrina-photo.webp'
    if (scene === 'schmears') return base + 'schmears-vitrina.webp'
    if (scene === 'cross-sell') return base + 'cross-sell.webp'
    if (scene === 'cashier') return base + 'cashier.webp'
    if (scene === 'pay') return base + 'pay.webp'
    if (scene === 'receipt') return base + 'receipt.webp'
    if (scene === 'wallet') return '/store-entry-door.webp'
    if (scene === 'handoff') return base + 'bag-handoff.webp'
    if (scene === 'returning') return '/store-entry-door.webp'
    if (scene === 'goodbye') return '/store-entry-door.webp'
    return base + 'goodbye.webp'
  }, [scene])

  // Load the next physical set-piece while the customer is still interacting
  // with the current scene. In particular, bag handoff cannot flash blank
  // after the customer skips the Wallet preview.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const base = '/master-scenes-clean/'
    const upcoming = scene === 'pay' ? [base + 'receipt.webp']
      : scene === 'receipt' ? ['/store-entry-door.webp']
      : scene === 'wallet' ? [base + 'bag-handoff.webp']
      : scene === 'handoff' ? ['/store-entry-door.webp']
      : scene === 'selector' ? [base + 'packs.webp', base + 'combos.webp', base + 'schmears.webp']
      : []
    const assets = upcoming.map((src) => {
      const image = new window.Image()
      image.src = src
      return image
    })
    return () => { assets.length = 0 }
  }, [scene])

  function resetSelections() {
    setBagelCounts({})
    setSchmearCounts({})
  }

  function chooseCategory(value: Category) {
    setCategory(value)
    resetSelections()
    if (value === 'packs') setScene('pack-size')
    if (value === 'combos') setScene('combos')
    if (value === 'schmears') setScene('schmear-size')
  }

  function choosePackFormat(format: PackFormat) {
    setPackFormat(format)
    setPackQty(format === 'mini' ? 6 : 6)
    setPackMix('mixed')
    setScene('pack-qty')
  }

  function choosePack(qty: number, mix: 'mixed'|'single') {
    setPackQty(qty)
    setPackMix(mix)
    setBagelMode('pack')
    setBagelCounts({})
    setScene('bagels')
  }

  function chooseCombo(id: string) {
    setComboId(id)
    setBagelMode('combo')
    resetSelections()
    setScene('bagels')
  }

  function chooseSchmearSize(grams: number) {
    setSchmearSize(grams)
    setSchmearCounts({})
    setScene('schmears')
  }

  function addBagel(id: string) {
    setBagelCounts((current) => {
      if (bagelMode === 'pack' && packMix === 'single') return { [id]: bagelTarget }
      const total = Object.values(current).reduce((sum, n) => sum + n, 0)
      if (total >= bagelTarget) return current
      return { ...current, [id]: (current[id] ?? 0) + 1 }
    })
  }

  function removeBagel(id: string) {
    setBagelCounts((current) => {
      const n = current[id] ?? 0
      if (!n) return current
      const next = { ...current }
      if (n === 1) delete next[id]
      else next[id] = n - 1
      return next
    })
  }

  function addSchmear(id: string) {
    setSchmearCounts((current) => {
      if (category !== 'combos') return { [id]: 1 }
      const total = Object.values(current).reduce((sum, n) => sum + n, 0)
      if (total >= schmearTarget) return current
      return { ...current, [id]: (current[id] ?? 0) + 1 }
    })
  }

  function removeSchmear(id: string) {
    setSchmearCounts((current) => {
      const n = current[id] ?? 0
      if (!n) return current
      const next = { ...current }
      if (n === 1) delete next[id]
      else next[id] = n - 1
      return next
    })
  }

  function nextFromBagels() {
    if (bagelTotal !== bagelTarget) return
    if (bagelMode === 'upsell8' || bagelMode === 'downsell2') {
      setScene('cashier')
      return
    }
    setScene('schmears')
  }

  function nextFromSchmears() {
    if (category === 'schmears') {
      setScene(qaMode ? 'cross-sell' : 'cashier')
      return
    }
    if (category === 'packs') {
      setScene('cashier')
      return
    }
    if (schmearTotal === schmearTarget) setScene('cashier')
  }

  function acceptPrimaryUpsell() {
    setBagelMode('upsell8')
    setBagelCounts({})
    setScene('bagels')
  }

  function acceptDownsell() {
    setBagelMode('downsell2')
    setBagelCounts({})
    setScene('bagels')
  }

  function pullReceipt() {
    if (receiptPulledRef.current) return
    receiptPulledRef.current = true
    setReceiptPulled(true)
    window.setTimeout(() => setScene('wallet'), 700)
  }

  function saveWallet() {
    setWalletSaved(true)
    window.setTimeout(() => setScene('handoff'), 650)
  }

  const showProgress = !['entrance', 'pay', 'receipt', 'wallet', 'handoff', 'goodbye', 'returning'].includes(scene)
  const visibleCartCount = bagelTotal + schmearTotal

  function goToEntrance() {
    setCategory(null)
    setComboId(null)
    resetSelections()
    setReceiptPulled(false)
    receiptPulledRef.current = false
    setWalletSaved(false)
    setPaidOrderCode(null)
    setPaidAmountPen(null)
    setCheckoutQuote(null)
    setScene('entrance')
  }

  return <div className="guided-commerce" data-scene={scene} data-qa={qaMode ? 'true' : 'false'}>
    <div key={'backdrop-' + scene} className="guided-scene-backdrop" style={{ backgroundImage: 'url("' + sceneImage + '")' }} />
    {scene !== 'bagels' && scene !== 'schmears' && <img key={'master-' + scene} className="guided-scene-image" src={sceneImage} alt="" />}
    <div className="guided-scene-vignette" />

    <header className="guided-store-topbar">
      <button
        type="button"
        className="guided-store-menu-button"
        aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={menuOpen}
        onClick={() => { setMenuOpen((open) => !open); setCartOpen(false) }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16"/>
        </svg>
      </button>
      <button
        type="button"
        className="guided-store-cart-button"
        aria-label={'Ver tu pedido: ' + visibleCartCount + ' productos'}
        aria-expanded={cartOpen}
        onClick={() => { setCartOpen((open) => !open); setMenuOpen(false) }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
          <path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>
        </svg>
        <span>Tu pedido ({visibleCartCount})</span>
      </button>
    </header>

    {menuOpen && <nav className="guided-store-menu-panel" aria-label="Menú Bagelito">
      <strong>Bagelito</strong>
      <button type="button" onClick={goToEntrance}>Inicio</button>
      <button type="button" onClick={() => setScene('selector')}>Packs · Combos · Schmears</button>
      <button type="button" onClick={onExit}>Explorar tienda 3D</button>
    </nav>}

    {cartOpen && <aside className="guided-store-cart-panel" aria-label="Resumen de tu pedido">
      <strong>Tu pedido</strong>
      {visibleCartCount === 0 && <p>Aún no has elegido productos.</p>}
      {selectedBagelSummary.map((item) => <div key={'bagel-' + item.name}><span>{item.name}</span><b>× {item.quantity}</b></div>)}
      {selectedSchmearSummary.map((item) => <div key={'schmear-' + item.name}><span>{item.name}</span><b>× {item.quantity}</b></div>)}
      <small>{checkoutQuote?.checkoutAllowed && checkoutQuote.amountPen != null ? 'Subtotal verificado: S/ ' + checkoutQuote.amountPen.toFixed(2) : 'Importe validado al pasar por caja.'}</small>
      <button type="button" onClick={() => setCartOpen(false)}>Cerrar resumen</button>
    </aside>}

    {showProgress && <div className="guided-progress-master">
      {['Elige', 'Bagels', 'Schmears', 'Caja', 'Pago'].map((label, index) => <div
        key={label}
        data-active={progressIndex === index}
        data-done={progressIndex > index}
      >
        <i>{progressIndex > index ? '✓' : index + 1}</i>
        <span>{label}</span>
      </div>)}
    </div>}

    {scene === 'entrance' && <div className="guided-entrance-action">
      <div>
        <small>BAGELITO STORE</small>
        <h1>Entra. Elige. Disfruta.</h1>
        <p>Una visita guiada, como entrar al Bagelito real.</p>
      </div>
      <button onClick={() => setScene('selector')}>Entrar a Bagelito <b>→</b></button>
    </div>}

    {scene === 'selector' && <>
      {customerName && <div className="guided-welcome">Hola {customerName}. ¿Qué te provoca hoy?</div>}
      <div className="guided-selector-hitboxes live-selector-cards">
        <button aria-label="Packs" onClick={() => chooseCategory('packs')}>
          <img src="/images/pack-6-mixed.webp" alt="" />
          <span><b>Packs</b><small>Grandes o minis</small></span>
        </button>
        <button aria-label="Combos" onClick={() => chooseCategory('combos')}>
          <span className="selector-combo-art"><img src="/images/bagel-everything.webp" alt="" /><i className="approved-schmear" /></span>
          <span><b>Combos</b><small>2 bagels + schmear</small></span>
        </button>
        <button aria-label="Schmears" onClick={() => chooseCategory('schmears')}>
          <span className="selector-schmear-art" />
          <span><b>Schmears</b><small>120 g · 180 g · 240 g</small></span>
        </button>
      </div>
    </>}

    {scene === 'pack-size' && <div className="guided-floating-panel pack-size-panel">
      <small>PACKS · PASO 1</small>
      <h2>¿Grandes o minis?</h2>
      <p>Primero eliges el formato. Después cantidad y sabores.</p>
      <div className="pack-format-grid">
        <button onClick={() => choosePackFormat('grande')}>
          <span className="pack-format-art"><img src="/images/bagel-everything.webp" alt="" /></span>
          <span><b>Bagels grandes</b><small>6 o 12 bagels</small></span><i>→</i>
        </button>
        <button onClick={() => choosePackFormat('mini')}>
          <span className="pack-format-art mini"><img src="/images/bagel-plain.webp" alt="" /></span>
          <span><b>Mini bagels</b><small>6, 12 o 24 minis</small></span><i>→</i>
        </button>
      </div>
    </div>}

    {scene === 'pack-qty' && <div className="guided-floating-panel pack-config-panel">
      <button className="panel-back" onClick={() => setScene('pack-size')}>←</button>
      <small>PACKS · {packFormat === 'mini' ? 'MINIS' : 'GRANDES'}</small>
      <h2>¿Cuántos quieres?</h2>
      <div className="pack-choice-grid">
        {(packFormat === 'mini' ? [6, 12, 24] : [6, 12]).map((qty) => <button key={qty} onClick={() => choosePack(qty, 'mixed')}>
          <b>{qty}</b><span>{packFormat === 'mini' ? 'mini bagels' : 'bagels'}</span><small>Elige sabores</small>
        </button>)}
      </div>
      <p>En la siguiente escena eliges los sabores directamente de la vitrina.</p>
    </div>}

    {scene === 'combos' && <div className="guided-combo-overlay approved-combo-overlay">
      {combos.map((combo) => <button key={combo.id} onClick={() => chooseCombo(combo.id)} aria-label={combo.name}>
        <span className="approved-combo-art">
          <img src="/images/bagel-everything.webp" alt="" />
          <img src="/images/bagel-sesame.webp" alt="" />
          <i className="approved-schmear" />
        </span>
        <span className="approved-combo-copy">
          <small>COMBO BAGELITO</small>
          <b>{combo.name}</b>
          <em>Elige 2 bagels + 1 schmear</em>
          <strong>Precio por confirmar</strong>
        </span>
        <span className="approved-combo-arrow">→</span>
      </button>)}
    </div>}

    {scene === 'schmear-size' && <section className="guided-floating-panel schmear-size-panel">
      <small>SCHMEARS</small><h2>Elige tamaño</h2>
      <div className="guided-size-cards">{menu.schmearSizes.map((size) => <button key={size.grams} onClick={() => chooseSchmearSize(size.grams)}>
        <b>{size.grams} g</b><span>Original S/{size.original_price} · Sabores S/{size.flavoured_price}</span>
      </button>)}</div>
    </section>}

    {scene === 'bagels' && <>
      <section className="mobile-product-stage mobile-bagel-stage" data-format={category === 'packs' ? packFormat : 'grande'} aria-label="Selecciona sabores de bagels">
        <header>
          <small>VITRINA BAGELITO · {packFormat === 'mini' && category === 'packs' ? 'MINIS' : 'GRANDES'}</small>
          <h2>Elige tus sabores</h2>
          <span>{bagelTotal} de {bagelTarget} seleccionados</span>
        </header>
        <div className="mobile-bagel-grid">
          {menu.bagels.map((bagel) => {
            const count = bagelCounts[bagel.id] ?? 0
            return <article key={bagel.id} className="mobile-bagel-card" data-selected={count > 0}>
              <button type="button" onClick={() => addBagel(bagel.id)} aria-label={'Agregar ' + bagel.name}>
                <img src={'/images/bagel-' + bagel.id + '.webp'} alt={bagel.name} loading="eager" />
                <span className="mobile-bagel-sign">{bagel.name}</span>
                {bagel.premium && <small>Premium</small>}
                <b aria-hidden="true">{count > 0 ? '✓' : '+'}</b>
              </button>
              {count > 0 && <div className="mobile-product-count">
                <button type="button" onClick={() => removeBagel(bagel.id)} aria-label={'Quitar ' + bagel.name}>−</button>
                <strong>{count}</strong>
              </div>}
            </article>
          })}
        </div>
      </section>
      <div className="guided-product-frame bagel-product-frame">
        <img src={sceneImage} alt="Vitrina con ocho sabores de bagels" />
        <div className="bagel-vitrina-blue-labels" aria-hidden="true">
          {BAGEL_SHOWCASE_ORDER.map((flavorId, index) => {
            const bagel = menu.bagels.find((item) => item.id === flavorId)
            return bagel ? <span key={flavorId} className="bagel-vitrina-label" style={BAGEL_SIGN_POSITIONS[index]}>{bagel.name}</span> : null
          })}
        </div>
        <div className="guided-product-hotspots bagel-hotspots">
        {BAGEL_SHOWCASE_ORDER.map((flavorId, index) => {
          const bagel = menu.bagels.find((item) => item.id === flavorId)
          if (!bagel) return null
          const count = bagelCounts[bagel.id] ?? 0
          return <button
            key={bagel.id}
            style={BAGEL_SPOTS[index]}
            data-selected={count > 0}
            onClick={() => addBagel(bagel.id)}
            aria-label={'Agregar ' + bagel.name}
          >
            {count > 0 && <span>{count}</span>}
            {count > 0 && <i role="button" onClick={(e) => { e.stopPropagation(); removeBagel(bagel.id) }}>−</i>}
          </button>
        })}
      </div></div>
      <div className="guided-order-counter bagel-live-summary">
        <small>{bagelMode === 'upsell8' ? '6 + 2 GRATIS' : bagelMode === 'downsell2' ? 'PRUEBA CON 2' : category === 'combos' ? selectedCombo?.name : packFormat === 'mini' ? 'MINIS' : 'TU PACK'}</small>
        <b>{bagelTotal}/{bagelTarget}</b>
        <div className="bagel-summary-lines">
          {selectedBagelSummary.map((item) => <span key={item.name}><i>{item.quantity}</i>{item.name}</span>)}
          {bagelTotal < bagelTarget && <span className="pending"><i>{bagelTarget - bagelTotal}</i>por elegir</span>}
        </div>
        <em>{bagelTotal === bagelTarget ? 'Listo para continuar' : 'Toca los sabores en la vitrina'}</em>
      </div>
      {bagelTotal === bagelTarget && <button className="guided-primary-next" onClick={nextFromBagels}>Continuar <b>→</b></button>}
    </>}

    {scene === 'schmears' && <>
      <section className="mobile-product-stage mobile-schmear-stage" aria-label="Selecciona sabores de schmears">
        <header>
          <small>ESTACIÓN DE SCHMEARS · {schmearSize} G</small>
          <h2>Elige tu schmear</h2>
          <span>{category === 'packs' ? 'Un toque extra, opcional' : schmearTotal + ' de ' + schmearTarget + ' seleccionados'}</span>
        </header>
        <div className="mobile-schmear-grid">
          {menu.schmears.map((item, index) => {
            const count = schmearCounts[item.id] ?? 0
            return <article key={item.id} className="mobile-schmear-card" data-selected={count > 0}>
              <button type="button" onClick={() => addSchmear(item.id)} aria-label={'Agregar ' + item.name}>
                <span className="mobile-schmear-pot" style={{backgroundImage: 'url("' + sceneImage + '")', backgroundPosition: (index * 25) + '% center'}} />
                <span className="mobile-schmear-label">{item.name}</span>
                {item.note && <small>{item.note}</small>}
                <b aria-hidden="true">{count ? '✓' : '+'}</b>
              </button>
              {count > 0 && category === 'combos' && <div className="mobile-product-count">
                <button type="button" onClick={() => removeSchmear(item.id)} aria-label={'Quitar ' + item.name}>−</button>
                <strong>{count}</strong>
              </div>}
            </article>
          })}
        </div>
      </section>
      <div className="guided-product-frame schmear-product-frame"><img src={sceneImage} alt="Estación de schmears" /><div className="guided-product-hotspots schmear-hotspots">
        {menu.schmears.map((item, index) => {
          const count = schmearCounts[item.id] ?? 0
          return <button
            key={item.id}
            style={SCHMEAR_SPOTS[index]}
            data-selected={count > 0}
            onClick={() => addSchmear(item.id)}
            aria-label={'Agregar ' + item.name}
          >
            {count > 0 && <span>{count}</span>}
            {count > 0 && category === 'combos' && <i role="button" onClick={(e) => { e.stopPropagation(); removeSchmear(item.id) }}>−</i>}
          </button>
        })}
      </div></div>
      <div className="guided-order-counter">
        <small>SCHMEARS · {schmearSize} g</small>
        <b>{category === 'combos' ? schmearTotal + '/' + schmearTarget : schmearTotal ? '✓' : '0/1'}</b>
        <span>{category === 'packs' ? 'Opcional' : 'Elige directamente de la estación'}</span>
      </div>
      {(category === 'packs' || schmearTotal === schmearTarget) && <button className="guided-primary-next" onClick={nextFromSchmears}>
        {category === 'schmears' ? 'Continuar' : 'Ir a caja'} <b>→</b>
      </button>}
    </>}

    {scene === 'cross-sell' && <CrossSellPanel onPrimary={acceptPrimaryUpsell} onDownsell={acceptDownsell} onSkip={() => setScene('cashier')} />}

    {scene === 'cashier' && <div className="guided-cashier-action">
      <div className="guided-cashier-copy">
        <small>CAJA BAGELITO</small>
        <h2>Tu pedido</h2>
        <div className="guided-cashier-lines">
          {selectedBagelSummary.map((item) => <span key={item.name}><i>{item.quantity} ×</i><b>{item.name}</b></span>)}
          {selectedSchmearSummary.map((item) => <span key={item.name}><i>{item.quantity} ×</i><b>{item.name}{category === 'schmears' ? ' · ' + schmearSize + ' g' : ''}</b></span>)}
        </div>
        <div className="guided-cashier-quote">
          <span>{quoteLoading ? 'Validando precio e inventario…' : checkoutQuote?.checkoutAllowed ? 'Subtotal verificado' : 'Revisión requerida'}</span>
          {checkoutQuote?.amountPen != null && <strong>S/ {checkoutQuote.amountPen}</strong>}
        </div>
        {!quoteLoading && checkoutQuote?.reasons?.length
          ? <p>{checkoutQuote.reasons[0]}</p>
          : <p>El delivery se calcula con tu dirección antes de crear la reserva.</p>}
      </div>
      <button
        disabled={quoteLoading || (!checkoutQuote?.checkoutAllowed && !qaMode)}
        onClick={() => { if (checkoutQuote?.checkoutAllowed || qaMode) setScene('pay') }}
      >
        {qaMode && !checkoutQuote?.checkoutAllowed ? 'Continuar QA' : checkoutQuote?.checkoutAllowed ? 'Continuar al checkout' : 'Checkout bloqueado'} <b>→</b>
      </button>
    </div>}

    {scene === 'pay' && <div className="guided-payment-gate">
      <div className="guided-payment-sheet">
        <div className="guided-payment-copy">
          <small>PAGO SEGURO</small>
          <b>Completa tu delivery</b>
          <span>{paymentConfig?.enabled
            ? 'El total final se valida en servidor antes de abrir Culqi.'
            : paymentConfig?.configured && paymentConfig?.bridgeReady && paymentConfig?.webhookReady && !paymentConfig?.clientReady
              ? 'El checkout del navegador está en validación final.'
              : paymentConfig?.configured && paymentConfig?.bridgeReady && !paymentConfig?.webhookReady
                ? 'El checkout permanece cerrado hasta terminar webhook y reconciliación.'
                : paymentConfig?.configured
                  ? 'Culqi está configurado, pero el bridge transaccional sigue cerrado.'
                  : 'El pedido solo avanza cuando el servidor confirme el cobro.'}</span>
        </div>

        <div className="checkout-customer-grid">
          <label><span>Nombre</span><input value={checkoutCustomer.customerName} onChange={(e) => setCheckoutCustomer((v) => ({...v, customerName:e.target.value}))} autoComplete="name" /></label>
          <label><span>Email</span><input type="email" value={checkoutCustomer.email} onChange={(e) => setCheckoutCustomer((v) => ({...v, email:e.target.value}))} autoComplete="email" /></label>
          <label><span>WhatsApp</span><input inputMode="tel" value={checkoutCustomer.whatsapp} onChange={(e) => setCheckoutCustomer((v) => ({...v, whatsapp:e.target.value}))} autoComplete="tel" /></label>
          <label><span>Distrito</span><select value={checkoutCustomer.district} onChange={(e) => setCheckoutCustomer((v) => ({...v, district:e.target.value}))}><option value="">Elige distrito</option>{deliveryDistricts.map((district) => <option key={district} value={district}>{district}</option>)}</select></label>
          <label className="wide"><span>Dirección de delivery</span><input value={checkoutCustomer.deliveryAddress} onChange={(e) => setCheckoutCustomer((v) => ({...v, deliveryAddress:e.target.value}))} autoComplete="street-address" /></label>
          <label><span>Referencia</span><input value={checkoutCustomer.addressReference} onChange={(e) => setCheckoutCustomer((v) => ({...v, addressReference:e.target.value}))} /></label>
          <label><span>Notas</span><input value={checkoutCustomer.deliveryNotes} onChange={(e) => setCheckoutCustomer((v) => ({...v, deliveryNotes:e.target.value}))} /></label>
        </div>

        <label className="checkout-terms-check">
          <input type="checkbox" checked={checkoutCustomer.termsAccepted} onChange={(e) => setCheckoutCustomer((v) => ({...v, termsAccepted:e.target.checked}))} />
          <span>Acepto los <a href="/legal" target="_blank" rel="noreferrer">términos vigentes</a> del checkout y delivery.</span>
        </label>

        {paymentReviewMessage && <div className="checkout-review-message">{paymentReviewMessage}</div>}

        {paymentConfig && checkoutQuote?.amountPen != null && <CulqiBrowserCheckout
          config={paymentConfig}
          customer={checkoutCustomer}
          subtotalPen={checkoutQuote.amountPen}
          order={{
            category,
            packFormat,
            packQty,
            packMix,
            bagels: bagelCounts,
            schmears: schmearCounts,
            schmearSize,
            comboId,
            bagelMode,
          }}
          onReview={setPaymentReviewMessage}
          onPaid={({ orderCode, amountPen }) => {
            setPaidOrderCode(orderCode)
            setPaidAmountPen(amountPen)
            setPaymentReviewMessage('')
            setScene('receipt')
          }}
        />}

        {qaMode && <button className="guided-pay-hotspot qa-only-pay" onClick={() => setScene('receipt')} aria-label="Continuar en modo QA">
          <span>Continuar QA →</span>
        </button>}
      </div>
    </div>}

    {scene === 'receipt' && <>
      <div className={'live-receipt-sheet' + (receiptPulled ? ' pulled' : '')}>
        <div className="live-receipt-brand">
          <small>{qaMode ? 'PREVIEW VISUAL · SIN COBRO' : 'BAGELITO'}</small>
          <b>{paidOrderCode ?? (qaMode ? 'QA PREVIEW' : 'PEDIDO CONFIRMADO')}</b>
        </div>
        <div className="live-receipt-lines">
          {selectedBagelSummary.map((item) => <span key={'receipt-'+item.name}><i>{item.quantity} ×</i><b>{item.name}</b></span>)}
          {selectedSchmearSummary.map((item) => <span key={'receipt-'+item.name}><i>{item.quantity} ×</i><b>{item.name}</b></span>)}
        </div>
        <div className="live-receipt-total">
          <span>TOTAL</span>
          <strong>{paidAmountPen != null ? 'S/ ' + paidAmountPen.toFixed(2) : qaMode ? 'Validado al pagar' : 'Confirmado'}</strong>
        </div>
        <p>{qaMode ? 'Este recibo es solo una vista de QA.' : 'Gracias por tu compra.'}</p>
      </div>
      <div className={'receipt-interaction' + (receiptPulled ? ' pulled' : '')}
        role="button"
        tabIndex={0}
        aria-label="Jalar o tocar para retirar tu recibo"
        onPointerDown={(e) => {
          receiptDrag.current.startY = e.clientY
          receiptDrag.current.offset = 0
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!receiptDrag.current.startY) return
          receiptDrag.current.offset = Math.max(0, e.clientY - receiptDrag.current.startY)
          if (receiptDrag.current.offset > 80) pullReceipt()
        }}
        onPointerUp={(e) => {
          if (receiptDrag.current.offset > 60) pullReceipt()
          receiptDrag.current.startY = 0
          receiptDrag.current.offset = 0
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
        }}
        onPointerCancel={() => {
          receiptDrag.current.startY = 0
          receiptDrag.current.offset = 0
        }}
        onClick={pullReceipt}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            pullReceipt()
          }
        }}
      >
        <span>Jala tu recibo ↓</span>
      </div>
    </>}

    {scene === 'wallet' && <>
      <div className="wallet-screen-live">
        <small>{qaMode ? 'PREVIEW VISUAL' : 'BAGELITO CLUB'}</small>
        <b>Bagelito Club</b>
        <span>{qaMode ? 'Sin puntos ni saldo ficticio · no genera un pass real.' : 'Tu tarjeta digital aparecerá aquí cuando Wallet esté habilitado.'}</span>
      </div>
      <div className="wallet-actions">
        <div className="wallet-copy"><small>BAGELITO CLUB</small><b>{qaMode ? 'Así se verá tu tarjeta' : 'Tu tarjeta Bagelito Club'}</b><span>{qaMode ? 'Preview de interacción. No se guarda ningún pass.' : 'La integración con Wallet todavía no está habilitada.'}</span></div>
        <button className="wallet-primary" disabled={!qaMode} onClick={() => { if (qaMode) saveWallet() }}>{walletSaved ? 'Preview completado ✓' : qaMode ? 'Preview Apple Wallet' : 'Apple Wallet · en integración'}</button>
        <button className="wallet-secondary" disabled={!qaMode} onClick={() => { if (qaMode) saveWallet() }}>{qaMode ? 'Preview Google Wallet' : 'Google Wallet · en integración'}</button>
        <button className="wallet-skip" onClick={() => setScene('handoff')}>Ahora no</button>
      </div>
    </>}

    {scene === 'handoff' && <div className="handoff-actions">
      <div>
        <small>{qaMode ? 'LISTO PARA TI' : 'PEDIDO CONFIRMADO'}</small>
        <b>{qaMode ? 'Tu Bagelito está listo.' : 'Ya recibimos tu pedido.'}</b>
        <span>{qaMode ? 'Toca para recibir la bolsa.' : 'Lo prepararemos para el delivery del batch confirmado.'}</span>
      </div>
      <button className="handoff-action" onClick={() => setScene('goodbye')}>{qaMode ? 'Recibir pedido' : 'Continuar'} <b>→</b></button>
    </div>}

    {scene === 'goodbye' && <div className="goodbye-panel">
      <div>
        <small>BAGELITO</small>
        <h2>Nos vemos pronto.</h2>
        <p>{qaMode ? 'Fin del recorrido visual de QA.' : 'Tu pedido quedó registrado. Te avisaremos según el batch confirmado.'}</p>
      </div>
      <div className="goodbye-actions">
        <button onClick={onExit}>Salir de Bagelito</button>
        <button onClick={() => setScene('returning')}>Seguir explorando</button>
      </div>
    </div>}

    {scene === 'returning' && <div className="guided-returning-action">
      <div><small>CLIENTE RECURRENTE</small><h2>Ya conoces el camino.</h2><p>El local sigue vivo alrededor de ti mientras vuelves a pedir.</p></div>
      <button onClick={() => { setScene('selector'); setCategory(null); resetSelections(); setReceiptPulled(false); receiptPulledRef.current = false; setWalletSaved(false); setPaidOrderCode(null); setPaidAmountPen(null) }}>Volver al tótem <b>→</b></button>
    </div>}
  </div>
}

function CrossSellPanel({ onPrimary, onDownsell, onSkip }: {
  onPrimary: () => void
  onDownsell: () => void
  onSkip: () => void
}) {
  const [showDownsell, setShowDownsell] = useState(false)
  return <div className="cross-sell-actions">
    {!showDownsell ? <>
      <button className="primary" onClick={onPrimary}>Sí, quiero 8 🥯</button>
      <button onClick={() => setShowDownsell(true)}>Solo el schmear</button>
    </> : <>
      <button className="primary" onClick={onDownsell}>Sí, agregar 2</button>
      <button onClick={onSkip}>No, gracias</button>
    </>}
  </div>
}
