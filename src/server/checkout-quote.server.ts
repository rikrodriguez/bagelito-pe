import {
  quotePublishedPack,
  quotePublishedSchmear,
  type BagelSelection,
  type PackMix,
} from '../domain/lib/approved-shop-contract'
import { getBatchReadOnly } from './batch.server'

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

export type GuidedQuoteResponse = {
  status: 'ready' | 'review_required' | 'invalid' | 'unavailable'
  checkoutAllowed: boolean
  amountPen: number | null
  reasons: string[]
  batchAccepting: boolean
}

function bagelSelection(value: unknown): BagelSelection[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rows = Object.entries(value as Record<string, unknown>)
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([flavorId, quantity]) => ({ flavorId, quantity: Number(quantity) }))
  if (!rows.every((row) => Number.isInteger(row.quantity) && row.quantity > 0)) return null
  return rows
}

function schmearSelection(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>)
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([flavorId, quantity]) => ({ flavorId, quantity: Number(quantity) }))
}

function unavailable(reason: string, batchAccepting = false): GuidedQuoteResponse {
  return { status: 'unavailable', checkoutAllowed: false, amountPen: null, reasons: [reason], batchAccepting }
}

function review(amountPen: number | null, reasons: string[], batchAccepting: boolean): GuidedQuoteResponse {
  return { status: 'review_required', checkoutAllowed: false, amountPen, reasons, batchAccepting }
}

export async function quoteGuidedOrder(input: GuidedQuoteRequest): Promise<GuidedQuoteResponse> {
  const category = input.category
  const requestedPackUnits = category === 'packs' && Number.isInteger(Number(input.packQty))
    ? Number(input.packQty)
    : 6
  const batch = await getBatchReadOnly(requestedPackUnits)
  if (batch.status !== 200 || !batch.batch.accepting) {
    return unavailable('El batch actual no tiene capacidad para este pedido.')
  }

  const bagels = bagelSelection(input.bagels)
  const schmears = schmearSelection(input.schmears)
  const schmearSize = Number(input.schmearSize)

  if (category === 'packs') {
    if (!bagels) return { status: 'invalid', checkoutAllowed: false, amountPen: null, reasons: ['Selección de bagels inválida.'], batchAccepting: true }
    const format = input.packFormat === 'mini' ? 'mini' : input.packFormat === 'grande' ? 'grande' : null
    const requestedMix: PackMix | null = input.packMix === 'single' ? 'single' : input.packMix === 'mixed' ? 'mixed' : null
    const quantity = Number(input.packQty)
    if (!format || !requestedMix || !Number.isInteger(quantity)) {
      return { status: 'invalid', checkoutAllowed: false, amountPen: null, reasons: ['Configuración de pack inválida.'], batchAccepting: true }
    }

    const effectiveMix: PackMix = bagels.length === 1 ? 'single' : 'mixed'
    const pack = quotePublishedPack({ format, quantity, mix: effectiveMix, selection: bagels })
    if (pack.status !== 'ready' || typeof pack.publishedBasePen !== 'number') {
      return review(pack.publishedBasePen, pack.reasons, true)
    }

    if (schmears.length === 0) {
      return { status: 'ready', checkoutAllowed: true, amountPen: pack.publishedBasePen, reasons: [], batchAccepting: true }
    }
    if (schmears.length !== 1 || schmears[0]?.quantity !== 1) {
      return review(pack.publishedBasePen, ['El pack solo admite un schmear opcional en este journey.'], true)
    }
    const schmear = quotePublishedSchmear({ flavorId: schmears[0].flavorId, grams: 120 })
    if (schmear.status !== 'ready' || typeof schmear.publishedBasePen !== 'number') {
      return review(pack.publishedBasePen, schmear.reasons, true)
    }
    return review(
      pack.publishedBasePen + schmear.publishedBasePen,
      ['El esquema transaccional actual todavía no persiste schmears dentro del pedido; no se cobrará hasta portar esa línea de producto.'],
      true,
    )
  }

  if (category === 'schmears') {
    if (schmears.length !== 1 || schmears[0]?.quantity !== 1 || !Number.isInteger(schmearSize)) {
      return { status: 'invalid', checkoutAllowed: false, amountPen: null, reasons: ['Selecciona un schmear y tamaño válidos.'], batchAccepting: true }
    }
    const schmear = quotePublishedSchmear({ flavorId: schmears[0].flavorId, grams: schmearSize })
    if (schmear.status !== 'ready' || typeof schmear.publishedBasePen !== 'number') {
      return review(schmear.publishedBasePen, schmear.reasons, true)
    }
    const addOnBagels = bagels?.reduce((sum, row) => sum + row.quantity, 0) ?? 0
    if (addOnBagels > 0) {
      return review(schmear.publishedBasePen, ['El precio del cross-sell de 2 u 8 bagels todavía no está aprobado para cobro automático.'], true)
    }
    return review(
      schmear.publishedBasePen,
      ['El esquema transaccional actual todavía no soporta pedidos standalone de schmear.'],
      true,
    )
  }

  if (category === 'combos') {
    return review(null, ['Los combos del mockup aún usan composición/precio histórico y no están autorizados para cobro automático.'], true)
  }

  return { status: 'invalid', checkoutAllowed: false, amountPen: null, reasons: ['Categoría de pedido inválida.'], batchAccepting: true }
}
