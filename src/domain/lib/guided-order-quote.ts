/** Canonical, side-effect-free selection plan. Never reserves stock or authorizes payment. */
import {
  getVerifiedDisplayMenu,
  quotePublishedPack,
  quotePublishedSchmear,
  quoteTwoBagelCombo,
  type BagelSelection,
  type BagelFormat,
  type PackMix,
} from './approved-shop-contract'

export type GuidedQuoteRequest = {
  category?: unknown
  packFormat?: unknown
  packQty?: unknown
  packMix?: unknown
  bagels?: unknown
  schmears?: unknown
  schmearSize?: unknown
  comboId?: unknown
  bagelMode?: unknown
}

export type GuidedOrderLine = {
  kind: 'pack' | 'schmear' | 'combo' | 'bagel_extra'
  id: string
  quantity: number
  bagels: BagelSelection[]
  schmears: Array<{ flavorId: string; quantity: number; grams: number }>
  /** Dated menu reference, not a payable amount. null means no confirmed price. */
  publishedAmountPen: number | null
}

export type GuidedOrderPlan = {
  status: 'ready' | 'review_required' | 'invalid'
  checkoutAllowed: boolean
  amountPen: number | null
  reasons: string[]
  lines: GuidedOrderLine[]
  bagelUnits: number
  priceSourceDate: string
  /** Only this lossless projection can enter the existing bagel-only RPC. */
  legacyPack: { slug: string; quantity: number; mix: PackMix; bagels: BagelSelection[] } | null
}

/** Capability of the additive product RPC, not payment or stock approval.
 * Price discovery stays in planGuidedOrder; no fallback price is introduced.
 */
export function hasPersistableGuidedProducts(plan: GuidedOrderPlan) {
  if (plan.status === 'invalid' || plan.amountPen === null || !Number.isSafeInteger(plan.amountPen * 100)
    || plan.amountPen <= 0 || plan.lines.length < 1 || plan.lines.length > 2) return false
  return plan.lines.every((line, index) => line.publishedAmountPen !== null && line.publishedAmountPen > 0
    && Number.isSafeInteger(line.publishedAmountPen * 100)
    && (line.kind === 'pack' ? index === 0 && /^grande-(6|12)-(single|mixed)$/.test(line.id)
      : line.kind === 'schmear' && (index === 0 ? plan.lines.length === 1 : plan.lines[0].kind === 'pack')))
}

const menu = getVerifiedDisplayMenu()
const bagelIds = new Set(menu.bagels.map(item => item.id))
const schmearIds = new Set(menu.schmears.map(item => item.id))

function selection(value: unknown, allowed: Set<string>): BagelSelection[] | null {
  // Omission is the optional decline. An explicitly malformed value is not.
  if (value === undefined) return []
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (!entries.every(([id, count]) => allowed.has(id) && typeof count === 'number'
    && Number.isSafeInteger(count) && count >= 0)) return null
  return entries.filter(([, count]) => Number(count) > 0)
    .map(([flavorId, count]) => ({flavorId, quantity: count as number}))
    .sort((a, b) => a.flavorId.localeCompare(b.flavorId))
}

function result(status: GuidedOrderPlan['status'], reasons: string[], lines: GuidedOrderLine[] = [],
  legacyPack: GuidedOrderPlan['legacyPack'] = null): GuidedOrderPlan {
  const allPriced = lines.length > 0 && lines.every(line => line.publishedAmountPen !== null)
  return {
    status, checkoutAllowed: status === 'ready' && legacyPack !== null,
    amountPen: allPriced ? lines.reduce((total, line) => total + line.publishedAmountPen!, 0) : null,
    reasons, lines, legacyPack,
    bagelUnits: lines.reduce((total, line) => total + line.bagels.reduce((n, item) => n + item.quantity, 0), 0),
    priceSourceDate: menu.sourceDate,
  }
}
const invalid = (reason: string) => result('invalid', [reason])

export function planGuidedOrder(input: GuidedQuoteRequest): GuidedOrderPlan {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('Pedido inválido.')
  const bagels = selection(input.bagels, bagelIds)
  const schmears = selection(input.schmears, schmearIds)
  if (!bagels || !schmears) return invalid('Sabores o cantidades inválidos; no se omitirá ningún producto del pedido.')
  if (schmears.length > 1 || schmears.some(item => item.quantity !== 1)) {
    return invalid('Este journey admite un solo pote de schmear.')
  }
  const grams = input.schmearSize === undefined ? 120 : input.schmearSize
  if (typeof grams !== 'number' || !menu.schmearSizes.some(size => size.grams === grams)) {
    return invalid('Tamaño de schmear inválido.')
  }
  const schmear = schmears[0]
  const schmearLine: GuidedOrderLine | null = schmear ? {
    kind: 'schmear', id: schmear.flavorId, quantity: 1, bagels: [],
    schmears: [{...schmear, grams}],
    publishedAmountPen: quotePublishedSchmear({flavorId: schmear.flavorId, grams}).publishedBasePen,
  } : null

  if (input.category === 'packs') {
    if (input.bagelMode !== undefined && input.bagelMode !== 'pack') return invalid('Modo de pack inválido.')
    const format: BagelFormat | null = input.packFormat === 'mini' ? 'mini' : input.packFormat === 'grande' ? 'grande' : null
    const requestedMix: PackMix | null = input.packMix === 'single' ? 'single' : input.packMix === 'mixed' ? 'mixed' : null
    const quantity = input.packQty
    if (!format || !requestedMix || typeof quantity !== 'number' || !Number.isSafeInteger(quantity)) {
      return invalid('Configuración de pack inválida.')
    }
    if (requestedMix === 'single' && bagels.length !== 1) return invalid('Un pack single requiere un solo sabor.')
    if (schmear && grams !== 120) return invalid('El schmear opcional de este pack es de 120 g; no se sustituirá por otro tamaño.')
    const mix: PackMix = bagels.length === 1 ? 'single' : 'mixed'
    const quote = quotePublishedPack({format, quantity, mix, selection: bagels})
    if (quote.status === 'invalid') return invalid(quote.reasons[0])
    const lines: GuidedOrderLine[] = [{
      kind: 'pack', id: `${format}-${quantity}-${mix}`, quantity: 1, bagels, schmears: [],
      // Premium inclusion/surcharge and mini compatibility remain unresolved.
      publishedAmountPen: quote.status === 'ready' ? quote.publishedBasePen : null,
    }, ...(schmearLine ? [schmearLine] : [])]
    const reasons = [...quote.reasons]
    if (schmear) reasons.push('El adaptador transaccional actual todavía no persiste schmears dentro del pedido.')
    if (format !== 'grande' || ![6, 12].includes(quantity)) {
      reasons.push('El adaptador transaccional actual solo soporta packs grandes de 6 o 12 bagels.')
    }
    if (reasons.length) return result('review_required', reasons, lines)
    return result('ready', [], lines, {slug: `${quantity}-${mix}`, quantity, mix, bagels})
  }

  if (input.category === 'schmears') {
    if (!schmearLine) return invalid('Selecciona un schmear.')
    const mode = input.bagelMode ?? 'pack'
    const target = mode === 'upsell8' ? 8 : mode === 'downsell2' ? 2 : mode === 'pack' ? 0 : null
    const count = bagels.reduce((total, item) => total + item.quantity, 0)
    if (target === null || count !== target) return invalid('La selección de bagels no coincide con el extra solicitado.')
    const lines = [schmearLine]
    const reasons = ['El adaptador transaccional actual todavía no soporta pedidos standalone de schmear.']
    if (target > 0) {
      lines.push({kind: 'bagel_extra', id: String(mode), quantity: 1, bagels, schmears: [], publishedAmountPen: null})
      reasons.push('El precio del cross-sell de 2 u 8 bagels todavía no está aprobado para cobro automático.')
    }
    return result('review_required', reasons, lines)
  }

  if (input.category === 'combos') {
    if (input.comboId !== 'two-bagel-schmear' || (input.bagelMode !== undefined && input.bagelMode !== 'combo')) {
      return invalid('Combo no compatible con el journey actual.')
    }
    if (!schmear) return invalid('Selecciona el schmear del combo.')
    const quote = quoteTwoBagelCombo({bagels, schmearId: schmear.flavorId, schmearGrams: grams})
    if (quote.status === 'invalid') return invalid(quote.reasons[0])
    return result('review_required', quote.reasons, [{
      kind: 'combo', id: input.comboId, quantity: 1, bagels,
      schmears: [{...schmear, grams}], publishedAmountPen: null,
    }])
  }
  return invalid('Categoría de pedido inválida.')
}
