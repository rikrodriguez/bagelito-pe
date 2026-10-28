import { useMemo, useRef, useState } from 'react'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'
import './guided-commerce.css'

const menu = getVerifiedDisplayMenu()
const combos = menu.historicalPublishedCombos

type Category = 'packs' | 'combos' | 'schmears'
type PackFormat = 'grande' | 'mini'
type Scene =
  | 'selector'
  | 'packs'
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

type BagelMode = 'pack' | 'combo' | 'upsell8' | 'downsell2'

const BAGEL_SPOTS = [
  { left: '10.5%', top: '24%', width: '18.5%', height: '29%' },
  { left: '30.5%', top: '24%', width: '18.5%', height: '29%' },
  { left: '50.5%', top: '24%', width: '18.5%', height: '29%' },
  { left: '70.5%', top: '24%', width: '18.5%', height: '29%' },
  { left: '10.5%', top: '55%', width: '18.5%', height: '29%' },
  { left: '30.5%', top: '55%', width: '18.5%', height: '29%' },
  { left: '50.5%', top: '55%', width: '18.5%', height: '29%' },
  { left: '70.5%', top: '55%', width: '18.5%', height: '29%' },
] as const

const SCHMEAR_SPOTS = [
  { left: '5%', top: '20%', width: '17%', height: '61%' },
  { left: '23%', top: '20%', width: '17%', height: '61%' },
  { left: '41%', top: '20%', width: '17%', height: '61%' },
  { left: '59%', top: '20%', width: '17%', height: '61%' },
  { left: '77%', top: '20%', width: '17%', height: '61%' },
] as const

export function GuidedCommerce({ onExit }: { onExit: () => void }) {
  const [scene, setScene] = useState<Scene>('selector')
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
  const receiptDrag = useRef({ startY: 0, offset: 0 })

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

  const progressIndex = scene === 'selector' || scene === 'packs' || scene === 'combos' || scene === 'schmear-size'
    ? 0
    : scene === 'bagels'
      ? 1
      : scene === 'schmears' || scene === 'cross-sell'
        ? 2
        : scene === 'cashier'
          ? 3
          : 4

  const sceneImage = useMemo(() => {
    if (scene === 'selector') return '/scenes/selector.webp'
    if (scene === 'packs') return '/scenes/packs.webp'
    if (scene === 'combos') return '/scenes/combos.webp'
    if (scene === 'schmear-size') return '/scenes/schmears.webp'
    if (scene === 'bagels') return '/scenes/bagels-vitrina.webp'
    if (scene === 'schmears') return '/scenes/schmears-vitrina.webp'
    if (scene === 'cross-sell') return '/scenes/cross-sell.webp'
    if (scene === 'cashier') return '/scenes/cashier.webp'
    if (scene === 'pay') return '/scenes/pay.webp'
    if (scene === 'receipt') return '/scenes/receipt.webp'
    if (scene === 'wallet') return '/scenes/wallet.webp'
    if (scene === 'handoff') return '/scenes/bag-handoff.webp'
    return '/scenes/goodbye.webp'
  }, [scene])

  function resetSelections() {
    setBagelCounts({})
    setSchmearCounts({})
  }

  function chooseCategory(value: Category) {
    setCategory(value)
    resetSelections()
    if (value === 'packs') setScene('packs')
    if (value === 'combos') setScene('combos')
    if (value === 'schmears') setScene('schmear-size')
  }

  function choosePack(format: PackFormat, qty: number, mix: 'mixed'|'single') {
    setPackFormat(format)
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

  function declinePrimaryUpsell() {
    document.documentElement.dataset.bagelitoOffer = 'downsell'
  }

  function toPay() {
    setScene('pay')
  }

  function fakePay() {
    setScene('receipt')
  }

  function pullReceipt() {
    setReceiptPulled(true)
    window.setTimeout(() => setScene('wallet'), 700)
  }

  function saveWallet() {
    setWalletSaved(true)
    window.setTimeout(() => setScene('handoff'), 650)
  }

  function skipWallet() {
    setScene('handoff')
  }

  function finishHandoff() {
    setScene('goodbye')
  }

  return <div className="guided-commerce">
    <img className="guided-scene-image" src={sceneImage} alt="" />
    <div className="guided-scene-vignette" />

    <button className="guided-close" type="button" onClick={onExit}>×</button>

    <div className="guided-progress-master">
      {['Elige', 'Bagels', 'Schmears', 'Caja', 'Pago'].map((label, index) => <div
        key={label}
        data-active={progressIndex === index}
        data-done={progressIndex > index}
      >
        <i>{progressIndex > index ? '✓' : index + 1}</i>
        <span>{label}</span>
      </div>)}
    </div>

    {scene === 'selector' && <div className="guided-selector-hitboxes">
      <button aria-label="Packs" onClick={() => chooseCategory('packs')} />
      <button aria-label="Combos" onClick={() => chooseCategory('combos')} />
      <button aria-label="Schmears" onClick={() => chooseCategory('schmears')} />
    </div>}

    {scene === 'packs' && <div className="guided-floating-panel pack-config-panel">
      <small>PACKS</small>
      <h2>Elige tu pack</h2>
      <div className="pack-choice-grid">
        <button onClick={() => choosePack('grande', 6, 'mixed')}><b>Grandes · 6</b><span>S/60 mixto</span></button>
        <button onClick={() => choosePack('grande', 12, 'mixed')}><b>Grandes · 12</b><span>S/115 mixto</span></button>
        <button onClick={() => choosePack('mini', 6, 'mixed')}><b>Minis · 6</b><span>S/25 mixto</span></button>
        <button onClick={() => choosePack('mini', 12, 'mixed')}><b>Minis · 12</b><span>S/40 mixto</span></button>
        <button onClick={() => choosePack('mini', 24, 'mixed')}><b>Minis · 24</b><span>S/75 mixto</span></button>
      </div>
      <p>En la siguiente escena eliges los sabores directamente de la vitrina.</p>
    </div>}

    {scene === 'combos' && <div className="guided-combo-overlay">
      {combos.map((combo) => <button key={combo.id} onClick={() => chooseCombo(combo.id)} aria-label={combo.name} />)}
    </div>}

    {scene === 'schmear-size' && <div className="guided-size-overlay">
      {menu.schmearSizes.map((size) => <button key={size.grams} onClick={() => chooseSchmearSize(size.grams)} aria-label={size.grams + ' gramos'} />)}
    </div>}

    {scene === 'bagels' && <>
      <div className="guided-product-hotspots bagel-hotspots">
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
      </div>
      <div className="guided-order-counter">
        <small>{bagelMode === 'upsell8' ? '6 + 2 GRATIS' : bagelMode === 'downsell2' ? 'PRUEBA CON 2' : category === 'combos' ? selectedCombo?.name : packFormat === 'mini' ? 'MINIS' : 'PACK'}</small>
        <b>{bagelTotal}/{bagelTarget}</b>
        <span>{bagelTotal === bagelTarget ? 'Listo para continuar' : 'Toca los sabores en la vitrina'}</span>
      </div>
      {bagelTotal === bagelTarget && <button className="guided-primary-next" onClick={nextFromBagels}>Continuar <b>→</b></button>}
    </>}

    {scene === 'schmears' && <>
      <div className="guided-product-hotspots schmear-hotspots">
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
      </div>
      <div className="guided-order-counter">
        <small>SCHMEARS · {schmearSize} g</small>
        <b>{category === 'combos' ? schmearTotal + '/' + schmearTarget : schmearTotal ? '✓' : '0/1'}</b>
        <span>{category === 'packs' ? 'Opcional' : 'Elige directamente de la estación'}</span>
      </div>
      {(category === 'packs' || schmearTotal === schmearTarget) && <button className="guided-primary-next" onClick={nextFromSchmears}>
        {category === 'schmears' ? 'Continuar' : 'Ir a caja'} <b>→</b>
      </button>}
    </>}

    {scene === 'cross-sell' && <CrossSellPanel onPrimary={acceptPrimaryUpsell} onDownsell={acceptDownsell} onSkip={() => setScene('cashier')} onRevealDownsell={declinePrimaryUpsell} />}

    {scene === 'cashier' && <div className="guided-cashier-action">
      <button onClick={toPay}>Revisar pedido y pagar <b>→</b></button>
    </div>}

    {scene === 'pay' && <button className="guided-pay-hotspot" onClick={fakePay} aria-label="Pagar con Culqi">
      <span>Pagar</span>
    </button>}

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
      <button onClick={skipWallet}>Ahora no</button>
    </div>}

    {scene === 'handoff' && <button className="handoff-action" onClick={finishHandoff}>Recibir pedido <b>→</b></button>}

    {scene === 'goodbye' && <div className="goodbye-actions">
      <button onClick={onExit}>Salir de Bagelito</button>
      <button onClick={() => { setScene('selector'); setCategory(null); resetSelections() }}>Seguir explorando</button>
    </div>}
  </div>
}

function CrossSellPanel({ onPrimary, onDownsell, onSkip, onRevealDownsell }: {
  onPrimary: () => void
  onDownsell: () => void
  onSkip: () => void
  onRevealDownsell: () => void
}) {
  const [showDownsell, setShowDownsell] = useState(false)
  return <div className="cross-sell-actions">
    {!showDownsell ? <>
      <button className="primary" onClick={onPrimary}>Sí, quiero 8 🥯</button>
      <button onClick={() => { setShowDownsell(true); onRevealDownsell() }}>Solo el schmear</button>
    </> : <>
      <button className="primary" onClick={onDownsell}>Sí, agregar 2</button>
      <button onClick={onSkip}>No, gracias</button>
    </>}
  </div>
}
