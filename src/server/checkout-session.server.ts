import { randomBytes } from 'node:crypto'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'
import { quoteGuidedOrder, type GuidedQuoteRequest } from './checkout-quote.server'
import { getDeliveryFee, isSupportedDistrict } from './delivery-pricing.server'
import { enforcePublicApiSecurity, PublicApiError } from './public-api-security.server'
import { createSupabaseAdminClient } from './supabase-admin.server'

export const CHECKOUT_LEGAL_VERSION = '2026-10-26' as const

type CheckoutCustomer = {
  checkoutSessionId?: unknown
  customerName?: unknown
  email?: unknown
  whatsapp?: unknown
  deliveryAddress?: unknown
  district?: unknown
  addressReference?: unknown
  deliveryNotes?: unknown
  termsAccepted?: unknown
  termsVersion?: unknown
  website?: unknown
}

type CheckoutRequest = GuidedQuoteRequest & CheckoutCustomer

function text(value: unknown, max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
function validPhone(value: string) {
  return value.replace(/\D/g, '').length >= 7
}
function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
async function nextOrderCode() {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('next_order_code')
  if (!error && typeof data === 'string' && data.trim()) return data.trim().toUpperCase()
  return 'BAG-' + Date.now().toString(36).toUpperCase() + '-' + randomBytes(2).toString('hex').toUpperCase()
}
function packSlug(quantity: number, mix: string) {
  const slug = quantity + '-' + mix
  return ['6-mixed', '12-mixed', '6-single', '12-single'].includes(slug) ? slug : null
}
function normalizeItems(items: Array<{ flavor_slug: string; quantity: number }>) {
  return [...items]
    .map((item) => ({ flavor_slug: item.flavor_slug, quantity: Number(item.quantity) }))
    .sort((a, b) => a.flavor_slug.localeCompare(b.flavor_slug))
}
function sameItems(
  a: Array<{ flavor_slug: string; quantity: number }>,
  b: Array<{ flavor_slug: string; quantity: number }>,
) {
  return JSON.stringify(normalizeItems(a)) === JSON.stringify(normalizeItems(b))
}

export async function createGuidedCheckoutSession(request: Request, input: CheckoutRequest) {
  const checkoutSessionId = text(input.checkoutSessionId, 80).toLowerCase()
  const customerName = text(input.customerName, 120)
  const email = text(input.email, 160).toLowerCase()
  const whatsapp = text(input.whatsapp, 40)
  const deliveryAddress = text(input.deliveryAddress, 220)
  const district = text(input.district, 80)
  const addressReference = text(input.addressReference, 160)
  const deliveryNotes = text(input.deliveryNotes, 500)
  const trapValue = text(input.website, 120)

  if (!validUuid(checkoutSessionId)) {
    throw new PublicApiError('Checkout session inválida.', 400)
  }
  if (customerName.length < 2 || !validEmail(email) || !validPhone(whatsapp)
    || deliveryAddress.length < 5 || !isSupportedDistrict(district)) {
    throw new PublicApiError('Completa datos válidos de cliente y delivery.', 400)
  }
  if (input.termsAccepted !== true || input.termsVersion !== CHECKOUT_LEGAL_VERSION) {
    throw new PublicApiError('Debes aceptar los términos vigentes antes de pagar.', 400)
  }

  await enforcePublicApiSecurity({
    request,
    scope: 'reservations',
    email,
    whatsapp,
    trapValue,
  })

  const quote = await quoteGuidedOrder(input)
  if (!quote.checkoutAllowed || quote.status !== 'ready' || typeof quote.amountPen !== 'number') {
    throw new PublicApiError(quote.reasons[0] || 'Este pedido no está habilitado para checkout.', 409)
  }
  if (input.category !== 'packs' || input.packFormat !== 'grande') {
    throw new PublicApiError('Este tipo de pedido todavía no está habilitado para checkout automático.', 409)
  }

  const quantity = Number(input.packQty)
  const bagels = input.bagels && typeof input.bagels === 'object' && !Array.isArray(input.bagels)
    ? Object.entries(input.bagels as Record<string, unknown>)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([flavorId, qty]) => ({ flavorId, quantity: Number(qty) }))
    : []
  const effectiveMix = bagels.length === 1 ? 'single' : 'mixed'
  const slug = packSlug(quantity, effectiveMix)
  if (!slug) throw new PublicApiError('Pack no compatible con checkout actual.', 409)

  const menu = getVerifiedDisplayMenu()
  const items = bagels.map((row) => {
    const flavor = menu.bagels.find((item) => item.id === row.flavorId)
    if (!flavor || !Number.isInteger(row.quantity) || row.quantity < 1) {
      throw new PublicApiError('Sabor inválido.', 400)
    }
    return {
      flavor_name: flavor.name,
      flavor_slug: flavor.id,
      quantity: row.quantity,
    }
  })

  const deliveryFee = getDeliveryFee(district)
  const totalAmount = quote.amountPen + deliveryFee
  const supabase = createSupabaseAdminClient()

  async function readExisting() {
    const { data: existing, error } = await supabase
      .from('orders')
      .select('id,order_code,email,pack_slug,total_amount,payment_expires_at,status')
      .eq('checkout_session_id', checkoutSessionId)
      .maybeSingle()
    if (error) {
      const missingMigration = error.code === '42703'
      throw new PublicApiError(
        missingMigration ? 'La migración transaccional de Culqi no está instalada.' : 'No se pudo verificar la sesión.',
        missingMigration ? 503 : 500,
      )
    }
    if (!existing) return null
    const { data: persistedItems, error: itemError } = await supabase
      .from('order_items')
      .select('flavor_slug,quantity')
      .eq('order_id', existing.id)
    if (itemError) throw new PublicApiError('No se pudo verificar la sesión.', 500)

    if (String(existing.email).trim().toLowerCase() !== email
      || existing.pack_slug !== slug
      || Number(existing.total_amount) !== totalAmount
      || !sameItems(items, (persistedItems ?? []) as Array<{ flavor_slug: string; quantity: number }>)) {
      throw new PublicApiError('La sesión de checkout no coincide con este pedido.', 409)
    }
    if (existing.status === 'cancelled') {
      throw new PublicApiError('Esta sesión de pago venció. Inicia una nueva.', 410)
    }
    return {
      ok: true,
      amountPen: Number(existing.total_amount),
      amountMinor: Math.round(Number(existing.total_amount) * 100),
      checkoutSessionId,
      expiresAt: String(existing.payment_expires_at ?? ''),
      orderCode: String(existing.order_code),
      currency: 'PEN' as const,
    }
  }

  const existing = await readExisting()
  if (existing) return existing

  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('id,status,orders_open_at,orders_close_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (batchError || !batch?.id) throw new PublicApiError('No hay un batch disponible.', 503)
  const now = Date.now()
  const opens = batch.orders_open_at ? Date.parse(batch.orders_open_at) : NaN
  const closes = batch.orders_close_at ? Date.parse(batch.orders_close_at) : NaN
  if (batch.status !== 'orders_open'
    || (batch.orders_open_at && (!Number.isFinite(opens) || now < opens))
    || (batch.orders_close_at && (!Number.isFinite(closes) || now >= closes))) {
    throw new PublicApiError('El batch actual no está aceptando pedidos.', 409)
  }

  const orderCode = await nextOrderCode()
  const paymentExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const { error } = await supabase.rpc('create_culqi_reservation_order', {
    p_address_reference: addressReference || null,
    p_batch_id: batch.id,
    p_checkout_session_id: checkoutSessionId,
    p_customer_name: customerName,
    p_delivery_address: deliveryAddress,
    p_delivery_notes: deliveryNotes || null,
    p_district: district,
    p_email: email,
    p_items: items,
    p_marketing_opt_in: false,
    p_order_code: orderCode,
    p_pack_name: quantity + ' ' + effectiveMix,
    p_pack_slug: slug,
    p_pack_type: effectiveMix,
    p_pack_units: quantity,
    p_payment_expires_at: paymentExpiresAt,
    p_terms_accepted: true,
    p_total_amount: totalAmount,
    p_whatsapp: whatsapp,
  }).single()

  if (error) {
    const missingRpc = error.code === '42883' || error.message?.toLowerCase().includes('create_culqi_reservation_order')
    throw new PublicApiError(
      missingRpc ? 'La migración transaccional de Culqi no está instalada.' : 'No se pudo reservar el pedido.',
      missingRpc ? 503 : 500,
    )
  }

  // The RPC is idempotent under an advisory lock. Re-read the persisted order
  // after the transaction so a concurrent mismatched retry cannot be accepted.
  const persisted = await readExisting()
  if (!persisted) throw new PublicApiError('La reserva no devolvió un pedido válido.', 500)
  return persisted
}
