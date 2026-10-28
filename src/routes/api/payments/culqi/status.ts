import { createFileRoute } from '@tanstack/react-router'
import { readBoundedJsonObject } from '../../../../server/http-json.server'
import { getPrivatePaymentConfig, isPaymentStatusRequestAllowed } from '../../../../server/payment-config.server'
import { createSupabaseAdminClient } from '../../../../server/supabase-admin.server'
import { enforcePublicApiSecurity, PublicApiError } from '../../../../server/public-api-security.server'

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
          if (!isPaymentStatusRequestAllowed(request)) {
            return Response.json({ ok: false, error: 'Culqi payments are not enabled yet.' }, { status: 503, headers })
          }
          const cfg = getPrivatePaymentConfig()
          if (!cfg.configured || !cfg.bridgeReady) {
            return Response.json({ ok: false, error: 'Culqi payments are not enabled yet.' }, { status: 503, headers })
          }

          const payload = await readBoundedJsonObject(request, 4 * 1024) as { checkoutSessionId?: unknown; orderCode?: unknown }
          const checkoutSessionId = String(payload.checkoutSessionId ?? '').trim()
          const orderCode = String(payload.orderCode ?? '').trim().toUpperCase()
          if (!validUuid(checkoutSessionId) || !/^BAG-[A-Z0-9_-]{1,80}$/.test(orderCode)) {
            return Response.json({ ok: false, error: 'Invalid payment status request.' }, { status: 400, headers })
          }

          await enforcePublicApiSecurity({ request, scope: 'payments' })

          const supabase = createSupabaseAdminClient()
          const { data, error } = await supabase
            .from('orders')
            .select('id,order_code,payment_status,payment_expires_at,status,total_amount')
            .eq('order_code', orderCode)
            .eq('checkout_session_id', checkoutSessionId)
            .abortSignal(AbortSignal.timeout(2000))
            .maybeSingle()

          if (error) throw new Error('state_unavailable')
          if (!data) return Response.json({ ok: false, error: 'Payment not found.' }, { status: 404, headers })

          const state = await supabase.rpc('expire_culqi_token_session', {
            p_order_id: data.id,
            p_checkout_session_id: checkoutSessionId,
          }).abortSignal(AbortSignal.timeout(2000))
          if (state.error || !state.data || typeof state.data !== 'object') throw new Error('state_unavailable')

          const payment = state.data as {
            paymentStatus?: unknown
            orderStatus?: unknown
            reconciliationRequired?: unknown
          }
          if (typeof payment.paymentStatus !== 'string'
            || !['pending','paid','failed','expired','refunded'].includes(payment.paymentStatus)
            || typeof payment.orderStatus !== 'string'
            || !['payment_pending_review','payment_confirmed','needs_correction','in_production','ready_for_delivery','delivered','cancelled'].includes(payment.orderStatus)
            || typeof payment.reconciliationRequired !== 'boolean') {
            throw new Error('state_unavailable')
          }

          return Response.json({
            ok: true,
            orderCode: data.order_code,
            expiresAt: data.payment_expires_at ? String(data.payment_expires_at) : null,
            paymentStatus: payment.paymentStatus,
            orderStatus: payment.orderStatus,
            amountPen: Number.isFinite(Number(data.total_amount)) ? Number(data.total_amount) : null,
            reconciliationRequired: payment.reconciliationRequired,
          }, { headers })
        } catch (error) {
          const status = error instanceof PublicApiError ? error.status : 500
          return Response.json({
            ok: false,
            error: error instanceof PublicApiError ? error.message : 'Could not read payment status.',
          }, { status, headers })
        }
      },
    },
  },
})
