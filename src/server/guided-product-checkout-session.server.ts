/** Sandbox-only bridge from the actual checkout route to complete product storage.
 * No provider call, legacy fallback, implicit retry or activation belongs here.
 */
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { planGuidedOrder } from '../domain/lib/guided-order-quote'
import { isGuidedProductCheckoutRequestAllowed } from './payment-config.server'
import { enforcePublicApiSecurity, PublicApiError } from './public-api-security.server'
import { createSupabaseAdminClient } from './supabase-admin.server'
import { prepareGuidedProductReservation, persistGuidedProductReservation, type ProductReservationInput } from './guided-product-reservation.server'

const capabilityV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const unavailable = () => new PublicApiError('No se pudo confirmar la reserva completa. No inicies un pago; conserva la misma sesión para verificarla.', 503)

export async function createGuidedProductCheckoutSession(request: Request, input: Record<string, unknown>) {
  // Defense in depth: importing this service must not bypass the route's gate.
  if (!isGuidedProductCheckoutRequestAllowed(request)) {
    throw new PublicApiError('El checkout de productos completos no está habilitado.', 503)
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PublicApiError('Pedido inválido.', 400)
  const checkoutSessionId = typeof input.checkoutSessionId === 'string' ? input.checkoutSessionId.trim().toLowerCase() : ''
  if (!capabilityV4.test(checkoutSessionId)) throw new PublicApiError('Checkout session inválida.', 400)
  if (input.website !== undefined && (typeof input.website !== 'string' || input.website.length > 120)) {
    throw new PublicApiError('Pedido inválido.', 400)
  }
  const plan = planGuidedOrder(input)
  if (plan.status === 'invalid') throw new PublicApiError('Selección de productos inválida.', 400)
  if (plan.amountPen === null || !plan.lines.length || plan.lines.some(line => !['pack', 'schmear'].includes(line.kind))) {
    throw new PublicApiError('Este pedido todavía no tiene productos y precios completos habilitados.', 409)
  }

  const customer: ProductReservationInput['customer'] = {
    customerName: input.customerName, email: input.email, whatsapp: input.whatsapp,
    deliveryAddress: input.deliveryAddress, district: input.district,
    addressReference: input.addressReference, deliveryNotes: input.deliveryNotes,
    termsAccepted: input.termsAccepted, termsVersion: input.termsVersion,
  }
  const candidate: ProductReservationInput = {
    order: input, checkoutSessionId, customer,
    // Preflight-only server placeholders, never sent to the database. This keeps
    // bounded customer/legal/product validation ahead of any remote side effect.
    batchId: '00000000-0000-4000-8000-000000000000', orderCode: 'BAG-PREFLIGHT',
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  }
  let prepared: ReturnType<typeof prepareGuidedProductReservation>
  try { prepared = prepareGuidedProductReservation(candidate) }
  catch { throw new PublicApiError('Completa datos válidos de cliente, delivery y aceptación legal vigente.', 400) }

  await enforcePublicApiSecurity({request, scope: 'reservations',
    email: prepared.args.p_customer.email, whatsapp: prepared.args.p_customer.whatsapp,
    trapValue: input.website as string | undefined,
  })

  // Separate from the limiter's 2 s budget. Request body is bounded by the route.
  const deadline = performance.now() + 5000
  async function bounded<T>(operation: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
    const remaining = deadline - performance.now()
    if (remaining <= 0) throw unavailable()
    const budget = Math.min(2000, remaining)
    const operationDeadline = performance.now() + budget
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => operation(controller.signal)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(unavailable()) }, budget)
        }),
      ])
      if (performance.now() >= operationDeadline || performance.now() >= deadline) {
        controller.abort(); throw unavailable()
      }
      return result
    } finally { clearTimeout(timer) }
  }

  try {
    const db = createSupabaseAdminClient()
    const prior = await bounded(signal => db.from('orders')
      .select('id,batch_id,pack_slug,checkout_session_id')
      .eq('checkout_session_id', checkoutSessionId).abortSignal(signal).maybeSingle())
    if (!prior || prior.error !== null) throw unavailable()
    let batchId: string
    if (prior.data !== null) {
      const existing = prior.data
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)
        || typeof existing.id !== 'string' || !uuid.test(existing.id)
        || typeof existing.batch_id !== 'string' || !uuid.test(existing.batch_id)
        || existing.checkout_session_id !== checkoutSessionId
        || typeof existing.pack_slug !== 'string' || !existing.pack_slug.startsWith('guided-v1:')) throw unavailable()
      // Reuse the original batch on exact replay. A new batch or exhausted last
      // capacity slot must not hide the durable result of a lost response. SQL
      // checks the complete original customer/composition/money and payment state.
      batchId = existing.batch_id
    } else {
      const response = await bounded(signal => db.from('batches')
        .select('id').order('created_at', {ascending: false}).limit(1)
        .abortSignal(signal).maybeSingle())
      if (!response || response.error !== null || !response.data || Array.isArray(response.data)
        || typeof response.data.id !== 'string' || !uuid.test(response.data.id)) throw unavailable()
      batchId = response.data.id
    }

    // SQL rechecks open window and capacity under lock, validates every product,
    // and atomically stores the complete snapshot. Its policy is independently
    // default-off. Exact replay may return an earlier order code/expiry.
    const result = await persistGuidedProductReservation({rpc: (name, args) =>
      bounded(signal => db.rpc(name, args).abortSignal(signal))}, {
      ...candidate, batchId, orderCode: 'BAG-' + randomUUID().toUpperCase(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    if (performance.now() >= deadline) throw unavailable()
    return {
      ok: true as const, amountPen: result.amountMinor / 100, amountMinor: result.amountMinor,
      subtotalMinor: result.subtotalMinor, deliveryFeeMinor: result.deliveryFeeMinor,
      checkoutSessionId: result.checkoutSessionId, expiresAt: result.expiresAt,
      orderCode: result.orderCode, currency: result.currency,
    }
  } catch {
    // A timeout/lost response may follow a committed reservation. Do not retry,
    // regenerate the checkout capability, expose raw diagnostics, or authorize payment.
    throw unavailable()
  }
}
