import { createFileRoute } from '@tanstack/react-router'
import { getPrivatePaymentConfig, isPaymentRequestAllowed } from '../../../../server/payment-config.server'
import { enforcePublicApiSecurity, PublicApiError } from '../../../../server/public-api-security.server'
import { createSupabaseAdminClient } from '../../../../server/supabase-admin.server'

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export const Route = createFileRoute('/api/payments/culqi/order')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isPaymentRequestAllowed(request)) throw new PublicApiError('Culqi payments are not enabled yet.', 503)
          const cfg = getPrivatePaymentConfig()
          const payload = await request.json() as {
            checkoutSessionId?: unknown
            orderCode?: unknown
            email?: unknown
          }

          const checkoutSessionId = String(payload.checkoutSessionId ?? '').trim().toLowerCase()
          const orderCode = String(payload.orderCode ?? '').trim().toUpperCase()
          const email = String(payload.email ?? '').trim().toLowerCase()
          if (!validUuid(checkoutSessionId) || !/^BAG-[A-Z0-9_-]{1,80}$/.test(orderCode) || !email) {
            throw new PublicApiError('Order code, checkout session and email are required.', 400)
          }

          await enforcePublicApiSecurity({ request, scope: 'payments', email })

          const supabase = createSupabaseAdminClient()
          const { data: order, error } = await supabase
            .from('orders')
            .select('id,order_code,checkout_session_id,email,payment_provider,payment_lane,payment_order_id,payment_status,status')
            .eq('order_code', orderCode)
            .eq('checkout_session_id', checkoutSessionId)
            .maybeSingle()

          if (error) throw new PublicApiError('Could not verify order.', 500)
          if (!order
            || String(order.checkout_session_id).toLowerCase() !== checkoutSessionId
            || String(order.email).trim().toLowerCase() !== email) {
            throw new PublicApiError('Order not found.', 404)
          }
          if (order.payment_status === 'paid') {
            throw new PublicApiError('This order is already paid.', 409)
          }
          if (order.status === 'cancelled' || order.status === 'delivered'
            || order.payment_provider !== 'culqi'
            || order.payment_lane !== 'token'
            || order.payment_order_id) {
            throw new PublicApiError('This reservation cannot enter token checkout.', 409)
          }

          const { data: session, error: sessionError } = await supabase.rpc('prepare_culqi_token_session', {
            p_order_id: order.id,
          })
          if (sessionError || !session || typeof session !== 'object') {
            throw new PublicApiError('Payment is in progress, expired or requires review. Do not pay again.', 409)
          }
          const prepared = session as { sessionId?: unknown; amount?: unknown; expiresAt?: unknown }
          if (typeof prepared.sessionId !== 'string' || !prepared.sessionId
            || !Number.isSafeInteger(Number(prepared.amount)) || Number(prepared.amount) <= 0) {
            throw new PublicApiError('Payment session could not be prepared.', 409)
          }

          return Response.json({
            ok: true,
            sessionId: prepared.sessionId,
            amount: Number(prepared.amount),
            expiresAt: typeof prepared.expiresAt === 'string' ? prepared.expiresAt : null,
            currency: cfg.currency,
            publicKey: cfg.publicKey,
          }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
        } catch (error) {
          const status = error instanceof PublicApiError ? error.status : 500
          const retryAfter = error instanceof PublicApiError ? error.retryAfterSeconds : null
          return Response.json({
            ok: false,
            error: error instanceof PublicApiError ? error.message : 'Could not prepare token checkout.',
          }, {
            status,
            headers: {
              'Cache-Control': 'no-store, max-age=0',
              ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
            },
          })
        }
      },
    },
  },
})
