/**
 * Bagelito read-only, portable shop-selection contract.
 * Published menu evidence: catalog-verified-for-design.md (2026-10-21)
 * Menu screenshots reconfirmed by the user on 2026-11-03: Packs, published Combos, Schmears.
 * DO NOT charge from this module. All commerce amounts must be server-verified.
 */
import verifiedMenu from '../data/verified-menu-2026-10-21.json'

export type BagelFormat = 'grande' | 'mini'
export type PackMix = 'mixed' | 'single'
export type BagelSelection = { flavorId: string; quantity: number }
export type QuoteStatus = 'ready' | 'review_required' | 'invalid'
export type ShopQuote = {
  status: QuoteStatus
  publishedBasePen: number | null
  checkoutAllowed: boolean
  reasons: string[]
}

const regularFlavorIds = new Set(verifiedMenu.bagels.map((item) => item.id))
const miniPackSizes = new Set([6, 12, 24])
const regularPackSizes = new Set([6, 12])
const priceForRegular = new Map(verifiedMenu.packs.map((p) => [`${p.quantity}:${p.mix}`, p.price]))
const miniPrice = new Map(verifiedMenu.mini_packs.flatMap((p) => [
  [`${p.quantity}:mixed`, p.mixed_price] as const,
  [`${p.quantity}:single`, p.single_price] as const,
]))

function invalid(reason: string): ShopQuote {
  return { status: 'invalid', publishedBasePen: null, checkoutAllowed: false, reasons: [reason] }
}
function review(pricePen: number | null, reason: string): ShopQuote {
  return { status: 'review_required', publishedBasePen: pricePen, checkoutAllowed: false, reasons: [reason] }
}
function ready(pricePen: number): ShopQuote {
  return { status: 'ready', publishedBasePen: pricePen, checkoutAllowed: true, reasons: [] }
}

function validBagelSelection(selection: BagelSelection[], units: number, mix: PackMix): string | null {
  if (!Array.isArray(selection) || selection.length === 0) return 'Select at least one bagel flavor.'
  if (!selection.every((s) => s && regularFlavorIds.has(s.flavorId) && Number.isInteger(s.quantity) && s.quantity > 0)) {
    return 'Bagel flavors and quantities must match the verified regular menu.'
  }
  const seen = new Set(selection.map((s) => s.flavorId))
  if (seen.size !== selection.length) return 'Duplicate flavor rows are not supported; combine quantities.'
  if (selection.reduce((sum, s) => sum + s.quantity, 0) !== units) return `Select exactly ${units} bagels.`
  if (mix === 'single' && selection.length !== 1) return 'Single-flavor packs must contain exactly one flavor.'
  // Published menu does NOT require two distinct flavors in mixed packs.
  return null
}

export function getVerifiedDisplayMenu() {
  // Reference inventory only. Not proof of current stock or prices.
  return {
    sourceDate: verifiedMenu.source_date,
    verifiedAt: verifiedMenu.verified_at,
    currency: verifiedMenu.currency,
    bagels: verifiedMenu.bagels,
    schmears: verifiedMenu.schmears,
    schmearSizes: verifiedMenu.schmear_sizes,
    largePacks: verifiedMenu.packs,
    miniPacks: verifiedMenu.mini_packs,
    publishedCombos: verifiedMenu.combos,
    // Compatibility alias for older preview consumers.
    historicalPublishedCombos: verifiedMenu.combos,
    customColors: verifiedMenu.custom_colors,
    comboUpgrades: verifiedMenu.combo_upgrades,
  }
}

/** Preview only: this pure function never reserves stock or charges a customer. */
export function quotePublishedPack(input: {
  format: BagelFormat
  quantity: number
  mix: PackMix
  selection: BagelSelection[]
}): ShopQuote {
  const { format, quantity, mix, selection } = input
  if (format !== 'grande' && format !== 'mini') return invalid('Invalid pack format.')
  if (mix !== 'mixed' && mix !== 'single') return invalid('Invalid mix type.')
  const allowed = format === 'grande' ? regularPackSizes : miniPackSizes
  if (!allowed.has(quantity)) return invalid('Unsupported pack quantity for selected format.')
  const bad = validBagelSelection(selection, quantity, mix)
  if (bad) return invalid(bad)
  const price = (format === 'grande' ? priceForRegular : miniPrice).get(`${quantity}:${mix}`)
  if (typeof price !== 'number') return invalid('No published base price for this format.')
  if (format === 'mini') {
    return review(price, 'Mini flavor availability and compatibility are not confirmed for the selected varieties.')
  }
  const premiumSelected = selection.some((item) => verifiedMenu.bagels.some((b) => b.id === item.flavorId && b.premium))
  if (premiumSelected) {
    return review(price, 'Published menu does not define premium flavor surcharge or inclusion in packs.')
  }
  return ready(price)
}

/** Only printed individual schmear-pot prices are used for preview. */
export function quotePublishedSchmear(input: { flavorId: string; grams: number }): ShopQuote {
  const flavor = verifiedMenu.schmears.find((s) => s.id === input.flavorId)
  const size = verifiedMenu.schmear_sizes.find((s) => s.grams === input.grams)
  if (!flavor || !size) return invalid('Unknown schmear flavor or size.')
  const price = flavor.price_class === 'original' ? size.original_price : size.flavoured_price
  return ready(price)
}

/** Published bundle composition only. Unsupported transactions remain closed.
 * Printed upgrades do not specify per-pot versus per-combo pricing.
 */
export function quotePublishedCombo(input: {
  comboId: string
  bagels: BagelSelection[]
  schmears: BagelSelection[]
  schmearGrams?: number
}): ShopQuote {
  const combo = verifiedMenu.combos.find(item => item.id === input.comboId)
  if (!combo) return invalid('Unknown published combo.')
  const bad = validBagelSelection(input.bagels, combo.bagels, 'mixed')
  if (bad) return invalid(bad)
  if (!Array.isArray(input.schmears) || !input.schmears.every(item => item
    && verifiedMenu.schmears.some(flavor => flavor.id === item.flavorId)
    && Number.isSafeInteger(item.quantity) && item.quantity > 0)
    || new Set(input.schmears.map(item => item.flavorId)).size !== input.schmears.length
    || input.schmears.reduce((sum, item) => sum + item.quantity, 0) !== combo.schmear_count) {
    return invalid(`Select exactly ${combo.schmear_count} schmear pots from the published flavors.`)
  }
  const grams = input.schmearGrams ?? combo.schmear_grams_each
  if (!verifiedMenu.schmear_sizes.some(item => item.grams === grams)) return invalid('Unknown schmear size.')
  if (grams !== combo.schmear_grams_each) {
    return review(null, 'Combo upgrade pricing per pot or per bundle is not confirmed.')
  }
  if (input.bagels.some(item => verifiedMenu.bagels.some(flavor => flavor.id === item.flavorId && flavor.premium))) {
    return review(null, 'Published menu does not define premium flavor surcharge or inclusion in combos.')
  }
  return review(combo.price, 'Published combo reference only; combo stock and transactional support are not confirmed.')
}

/** Compatibility preview for older saved two-bagel selections. It is not commercial
 * approval to replace historical bundles or assign their prices to this offer.
 */
export function quoteTwoBagelCombo(input: {
  bagels: BagelSelection[]
  schmearId: string
  schmearGrams?: number
}): ShopQuote {
  const bad = validBagelSelection(input.bagels, 2, 'mixed')
  if (bad) return invalid(bad)
  if (!verifiedMenu.schmears.some((s) => s.id === input.schmearId)) return invalid('Unknown schmear.')
  const grams = input.schmearGrams ?? 120
  if (!verifiedMenu.schmear_sizes.some((s) => s.grams === grams)) return invalid('Unknown schmear size.')
  return review(null, 'The legacy two-bagel combo has no confirmed selling price or upgrade rules.')
}

/** A UI quote is not payment authorization. Server must always recheck price and inventory. */
export function canProceedToCheckout(
  quote: ShopQuote,
  { liveInventoryAvailable, currentOfferApproved }: { liveInventoryAvailable: boolean; currentOfferApproved: boolean },
): boolean {
  return quote.status === 'ready' && quote.checkoutAllowed && liveInventoryAvailable && currentOfferApproved
}
