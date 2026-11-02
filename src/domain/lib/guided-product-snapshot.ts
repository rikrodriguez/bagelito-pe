/** Versioned, read-only commercial detail. Never reprices or authorizes dispatch. */
import menu from '../data/verified-menu-2026-10-21.json'

type Bagel = {flavorId: string; quantity: number}
type Schmear = Bagel & {grams: 120 | 180 | 240}
export type StoredProductLine = {
  kind: 'pack' | 'schmear'; id: string; quantity: 1
  bagels: Bagel[]; schmears: Schmear[]; publishedAmountPen: number
}
export type GuidedProductSnapshot = {
  orderId: string; orderCode: string; schemaVersion: 1; currency: 'PEN'
  subtotalMinor: number; deliveryFeeMinor: number; amountMinor: number
  lines: StoredProductLine[]; termsVersion: string; createdAt: string
  paymentStatus: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// V1 admits only these original regular SKUs. Do not widen an old schema version
// merely because the current menu gains a flavor. Prices are NEVER read here.
const regularIds = new Set(['everything','sesame','plain','classic-onion','cinnamon-raisin','blueberry'])
const schmearIds = new Set(['whipped-original','aji-amarillo','herb-roasted-garlic','honey-cinnamon','classic-strawberry'])
const labels = new Map([...menu.bagels, ...menu.schmears].map(item => [item.id, item.name]))
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const minor = (value: unknown, minimum: number): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= minimum && value <= 2147483647
const inconsistent = (): never => {throw new Error('Persisted commercial snapshot is inconsistent')}

function parseLine(value: unknown): StoredProductLine {
  if (!record(value) || value.quantity !== 1 || typeof value.id !== 'string'
    || typeof value.publishedAmountPen !== 'number' || !minor(value.publishedAmountPen * 100, 1)
    || !Array.isArray(value.bagels) || !Array.isArray(value.schmears)) return inconsistent()
  if (value.kind === 'pack') {
    const match = /^grande-(6|12)-(single|mixed)$/.exec(value.id)
    if (!match || value.schmears.length || value.bagels.length < 1 || value.bagels.length > 6) return inconsistent()
    const seen = new Set<string>()
    const bagels = value.bagels.map((item: unknown) => {
      if (!record(item) || typeof item.flavorId !== 'string' || !regularIds.has(item.flavorId)
        || seen.has(item.flavorId) || !minor(item.quantity, 1) || item.quantity > 12) return inconsistent()
      seen.add(item.flavorId)
      return {flavorId: item.flavorId, quantity: item.quantity}
    })
    if (bagels.reduce((sum, item) => sum + item.quantity, 0) !== Number(match[1])
      || (match[2] === 'single' ? bagels.length !== 1 : bagels.length < 2)) return inconsistent()
    return {kind: 'pack', id: value.id, quantity: 1, bagels, schmears: [], publishedAmountPen: value.publishedAmountPen}
  }
  if (value.kind === 'schmear') {
    const item: unknown = value.schmears[0]
    if (value.bagels.length || value.schmears.length !== 1 || !record(item)
      || typeof item.flavorId !== 'string' || !schmearIds.has(item.flavorId) || item.flavorId !== value.id
      || item.quantity !== 1 || (item.grams !== 120 && item.grams !== 180 && item.grams !== 240)) return inconsistent()
    return {kind: 'schmear', id: value.id, quantity: 1, bagels: [],
      schmears: [{flavorId: item.flavorId, quantity: 1, grams: item.grams}], publishedAmountPen: value.publishedAmountPen}
  }
  return inconsistent()
}

/** Accept only complete V1 composition and historical stored money. No catalog quote. */
export function parseGuidedProductSnapshot(value: unknown, expectedOrderId?: string): GuidedProductSnapshot {
  if (!record(value) || value.schemaVersion !== 1 || value.currency !== 'PEN'
    || typeof value.orderId !== 'string' || !uuid.test(value.orderId)
    || (expectedOrderId !== undefined && value.orderId !== expectedOrderId.toLowerCase())
    || typeof value.orderCode !== 'string' || !/^BAG-[A-Z0-9_-]{1,80}$/.test(value.orderCode)
    || !minor(value.subtotalMinor, 1) || !minor(value.deliveryFeeMinor, 0) || !minor(value.amountMinor, 1)
    || value.amountMinor !== value.subtotalMinor + value.deliveryFeeMinor
    || typeof value.termsVersion !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.termsVersion)
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.paymentStatus !== 'string' || !['pending','paid','failed','expired','refunded'].includes(value.paymentStatus)
    || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 2) return inconsistent()
  const lines = value.lines.map(parseLine)
  if ((lines.length === 2 && (lines[0].kind !== 'pack' || lines[1].kind !== 'schmear' || lines[1].schmears[0].grams !== 120))
    || lines.reduce((sum, line) => sum + line.publishedAmountPen * 100, 0) !== value.subtotalMinor) return inconsistent()
  return {orderId: value.orderId, orderCode: value.orderCode, schemaVersion: 1, currency: 'PEN',
    subtotalMinor: value.subtotalMinor, deliveryFeeMinor: value.deliveryFeeMinor, amountMinor: value.amountMinor,
    lines, termsVersion: value.termsVersion, createdAt: value.createdAt,
    paymentStatus: value.paymentStatus as GuidedProductSnapshot['paymentStatus']}
}

/** Packing PREVIEW only: paid is an observation, not a dispatch decision or receipt. */
export function buildGuidedPackingPreview(value: unknown) {
  const snapshot = parseGuidedProductSnapshot(value)
  const bagels = snapshot.lines.flatMap(line => line.bagels.map(item => ({...item, name: labels.get(item.flavorId)!})))
  const schmears = snapshot.lines.flatMap(line => line.schmears.map(item => ({...item, name: labels.get(item.flavorId)!})))
  return {...snapshot, viewKind: 'commercial-review' as const, fulfillmentAuthorized: false as const,
    packing: {bagels, schmears, bagelUnits: bagels.reduce((sum, item) => sum + item.quantity, 0),
      schmearPots: schmears.reduce((sum, item) => sum + item.quantity, 0),
      schmearGrams: schmears.reduce((sum, item) => sum + item.quantity * item.grams, 0)}}
}
