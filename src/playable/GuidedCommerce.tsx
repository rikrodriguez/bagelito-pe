import { useEffect, useMemo, useRef, useState } from 'react'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'
import './guided-commerce.css'

const menu = getVerifiedDisplayMenu()
const combos = menu.historicalPublishedCombos

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

const BAGEL_SPOTS = [
  { left: '2.5%', top: '12%', width: '19%', height: '34%' },
  { left: '23%', top: '12%', width: '19%', height: '34%' },
  { left: '43%', top: '12%', width: '19%', height: '34%' },
  { left: '63%', top: '12%', width: '19%', height: '34%' },
  { left: '2.5%', top: '52%', width: '19%', height: '39%' },
  { left: '23%', top: '52%', width: '19%', height: '39%' },
  { left: '43%', top: '52%', width: '19%', height: '39%' },
  { left: '63%', top: '52%', width: '19%', height: '39%' },
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
  const [paymentConfig, setPaymentConfig] = useState<{enabled:boolean;bridgeReady:boolean;mode:string}|null>(null)
  const qaMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1'
  const receiptDrag = useRef({ startY: 0, offset: 0 })

  useEffect(() => {
    let active = true
    fetch('/api/payments/culqi/config', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('payment-config-unavailable')
        return await response.json() as { enabled?: boolean; bridgeReady?: boolean; mode?: string }
      })
      .then((config) => {
        if (active) setPaymentConfig({
          enabled: config.enabled === true,
          bridgeReady: config.bridgeReady === true,
          mode: typeof config.mode === 'string' ? config.mode : 'disabled',
        })
      })
      .catch(() => {
        if (active) setPaymentConfig({ enabled: false, bridgeReady: false, mode: 'disabled' })
      })
    return () => { active = false }
  }, [])

  const selectedCombo = combos.find((c) => c.id === comboId) ?? null
  const bagelTotal = Object.values(bagelCounts).reduce((sum, n) => sum + n, 0)
  const schmearTotal = Object.values(schmearCounts).reduce((sum, n) => sum + n, 0)

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
    if (scene === 'entrance') return base + 'entrance.webp'
    if (scene === 'selector') return base + 'selector.webp'
    if (scene === 'pack-size' || scene === 'pack-qty') return base + 'packs.webp'
    if (scene === 'combos') return base + 'combos.webp'
    if (scene === 'schmear-size') return base + 'schmears.webp'
    if (scene === 'bagels') return base + 'bagels-vitrina.webp'
    if (scene === 'schmears') return base + 'schmears-vitrina.webp'
    if (scene === 'cross-sell') return base + 'cross-sell.webp'
    if (scene === 'cashier') return base + 'cashier.webp'
    if (scene === 'pay') return base + 'pay.webp'
    if (scene === 'receipt') return base + 'receipt.webp'
    if (scene === 'wallet') return base + 'wallet.webp'
    if (scene === 'handoff') return base + 'bag-handoff.webp'
    if (scene === 'returning') return base + 'inside.webp'
    return base + 'goodbye.webp'
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
      setScene('cross-sell')
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
    setReceiptPulled(true)
    window.setTimeout(() => setScene('wallet'), 700)
  }

  function saveWallet() {
    setWalletSaved(true)
    window.setTimeout(() => setScene('handoff'), 650)
  }

  const showProgress = !['entrance', 'goodbye', 'returning'].includes(scene)

  return <div className="guided-commerce" data-scene={scene}>
    <div className="guided-scene-backdrop" style={{ backgroundImage: 'url("' + sceneImage + '")' }} />
    {scene !== 'bagels' && scene !== 'schmears' && <img className="guided-scene-image" src={sceneImage} alt="" />}
    <div className="guided-scene-vignette" />

    <button className="guided-close" type="button" onClick={onExit} aria-label="Cerrar experiencia">×</button>

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
      <div className="guided-selector-hitboxes">
        <button aria-label="Packs" onClick={() => chooseCategory('packs')} />
        <button aria-label="Combos" onClick={() => chooseCategory('combos')} />
        <button aria-label="Schmears" onClick={() => chooseCategory('schmears')} />
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
          <b>{qty}</b><span>{packFormat === 'mini' ? 'mini bagels' : 'bagels'}</span><small>Mixto</small>
        </button>)}
      </div>
      <p>En la siguiente escena eliges los sabores directamente de la vitrina.</p>
    </div>}

    {scene === 'combos' && <div className="guided-combo-overlay">
      {combos.map((combo) => <button key={combo.id} onClick={() => chooseCombo(combo.id)} aria-label={combo.name} />)}
    </div>}

    {scene === 'schmear-size' && <section className="guided-floating-panel schmear-size-panel">
      <small>SCHMEARS</small><h2>Elige tamaño</h2>
      <div className="guided-size-cards">{menu.schmearSizes.map((size) => <button key={size.grams} onClick={() => chooseSchmearSize(size.grams)}>
        <b>{size.grams} g</b><span>Original S/{size.original_price} · Sabores S/{size.flavoured_price}</span>
      </button>)}</div>
    </section>}

    {scene === 'bagels' && <>
      <div className="guided-product-frame bagel-product-frame"><img src={sceneImage} alt="Vitrina de bagels" /><div className="guided-product-hotspots bagel-hotspots">
        {menu.bagels.map((bagel, index) => {
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
      <div className="guided-order-counter">
        <small>{bagelMode === 'upsell8' ? '6 + 2 GRATIS' : bagelMode === 'downsell2' ? 'PRUEBA CON 2' : category === 'combos' ? selectedCombo?.name : packFormat === 'mini' ? 'MINIS' : 'PACK'}</small>
        <b>{bagelTotal}/{bagelTarget}</b>
        <span>{bagelTotal === bagelTarget ? 'Listo para continuar' : 'Toca los sabores en la vitrina'}</span>
      </div>
      {bagelTotal === bagelTarget && <button className="guided-primary-next" onClick={nextFromBagels}>Continuar <b>→</b></button>}
    </>}

    {scene === 'schmears' && <>
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
      <div className="guided-cashier-copy"><small>CAJA BAGELITO</small><b>Tu pedido está listo para revisar.</b></div>
      <button onClick={() => setScene('pay')}>Revisar pedido y pagar <b>→</b></button>
    </div>}

    {scene === 'pay' && <div className="guided-payment-gate">
      <div className="guided-payment-copy">
        <small>PAGO SEGURO</small>
        <b>Culqi</b>
        <span>{paymentConfig?.enabled
          ? 'Bridge Culqi disponible. Falta conectar la sesión transaccional del pedido.'
          : paymentConfig?.bridgeReady
            ? 'Culqi está configurado pero no habilitado para este entorno.'
            : 'El pedido solo avanza cuando el servidor confirme el cobro.'}</span>
      </div>
      <button
        className="guided-pay-hotspot"
        onClick={() => { if (qaMode) setScene('receipt') }}
        aria-label={qaMode ? 'Continuar en modo QA' : 'Pago Culqi pendiente de bridge seguro'}
        disabled={!qaMode}
      >
        <span>{qaMode ? 'Continuar QA →' : paymentConfig?.enabled ? 'Preparando checkout seguro' : 'Checkout seguro en integración'}</span>
      </button>
    </div>}

    {scene === 'receipt' && <div className={'receipt-interaction' + (receiptPulled ? ' pulled' : '')}
      onPointerDown={(e) => { receiptDrag.current.startY = e.clientY; receiptDrag.current.offset = 0 }}
      onPointerMove={(e) => {
        if (!receiptDrag.current.startY) return
        receiptDrag.current.offset = Math.max(0, e.clientY - receiptDrag.current.startY)
        if (receiptDrag.current.offset > 80) pullReceipt()
      }}
      onPointerUp={() => { if (!receiptPulled) pullReceipt(); receiptDrag.current.startY = 0 }}
    >
      <span>Jala tu recibo ↓</span>
    </div>}

    {scene === 'wallet' && <div className="wallet-actions">
      <button onClick={saveWallet}>{walletSaved ? 'Guardada ✓' : 'Agregar a Wallet'}</button>
      <button onClick={() => setScene('handoff')}>Ahora no</button>
    </div>}

    {scene === 'handoff' && <button className="handoff-action" onClick={() => setScene('goodbye')}>Recibir pedido <b>→</b></button>}

    {scene === 'goodbye' && <div className="goodbye-actions">
      <button onClick={onExit}>Salir de Bagelito</button>
      <button onClick={() => setScene('returning')}>Seguir explorando</button>
    </div>}

    {scene === 'returning' && <div className="guided-returning-action">
      <div><small>CLIENTE RECURRENTE</small><h2>Ya conoces el camino.</h2><p>El local sigue vivo alrededor de ti mientras vuelves a pedir.</p></div>
      <button onClick={() => { setScene('selector'); setCategory(null); resetSelections(); setReceiptPulled(false); setWalletSaved(false) }}>Volver al tótem <b>→</b></button>
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
