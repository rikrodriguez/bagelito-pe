import { createFileRoute } from '@tanstack/react-router'
import { getPrivatePaymentConfig } from '../../../../server/payment-config.server'
import { createSupabaseAdminClient } from '../../../../server/supabase-admin.server'

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export const Route = createFileRoute('/api/payments/culqi/status')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = {
          'Cache-Control': 'private, no-store, max-age=0',
          'CDN-Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        }
        try {
          const cfg = getPrivatePaymentConfig()
          if (!cfg.enabled || !cfg.bridgeReady) {
            return Response.json({ ok: false, error: 'Culqi payments are not enabled yet.' }, { status: 503, headers })
          }

          const payload = await request.json() as { checkoutSessionId?: unknown; orderCode?: unknown }
          const checkoutSessionId = String(payload.checkoutSessionId ?? '').trim()
          const orderCode = String(payload.orderCode ?? '').trim().toUpperCase()
          if (!validUuid(checkoutSessionId) || !/^BAG-[A-Z0-9_-]{1,80}$/.test(orderCode)) {
            return Response.json({ ok: false, error: 'Invalid payment status request.' }, { status: 400, headers })
          }

          const supabase = createSupabaseAdminClient()
          const { data, error } = await supabase
            .from('orders')
            .select('id,order_code,payment_status,payment_expires_at,status')
            .eq('order_code', orderCode)
            .eq('checkout_session_id', checkoutSessionId)
            .maybeSingle()

          if (error) throw new Error('state_unavailable')
          if (!data) return Response.json({ ok: false, error: 'Payment not found.' }, { status: 404, headers })

          const state = await supabase.rpc('expire_culqi_token_session', {
            p_order_id: data.id,
            p_checkout_session_id: checkoutSessionId,
          })
          if (state.error || !state.data || typeof state.data !== 'object') throw new Error('state_unavailable')

          const payment = state.data as {
            paymentStatus?: unknown
            orderStatus?: unknown
            reconciliationRequired?: unknown
          }
          if (typeof payment.paymentStatus !== 'string'
            || typeof payment.orderStatus !== 'string'
            || typeof payment.reconciliationRequired !== 'boolean') {
            throw new Error('state_unavailable')
          }

          return Response.json({
            ok: true,
            orderCode: data.order_code,
            expiresAt: data.payment_expires_at ? String(data.payment_expires_at) : null,
            paymentStatus: payment.paymentStatus,
            orderStatus: payment.orderStatus,
            reconciliationRequired: payment.reconciliationRequired,
          }, { headers })
        } catch {
          return Response.json({ ok: false, error: 'Could not read payment status.' }, { status: 500, headers })
        }
      },
    },
  },
})
