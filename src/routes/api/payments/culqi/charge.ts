import { createFileRoute } from '@tanstack/react-router'
import { readBoundedJsonObject } from '../../../../server/http-json.server'
import { coordinateCulqiCharge } from '../../../../server/charge-coordinator.server'
import { createCulqiCharge, fetchCulqiCharge, type CulqiAuthentication3DS } from '../../../../server/culqi.server'
import { getPrivatePaymentConfig, isPaymentRequestAllowed } from '../../../../server/payment-config.server'
import { enforcePublicApiSecurity, PublicApiError } from '../../../../server/public-api-security.server'
import { createSupabaseAdminClient } from '../../../../server/supabase-admin.server'

type Payload = {
  authentication3DS?: unknown
  checkoutSessionId?: unknown
  deviceId?: unknown
  email?: unknown
  orderCode?: unknown
  sourceId?: unknown
}

function parse3DS(value: unknown): CulqiAuthentication3DS | undefined {
  if (value == null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) throw new PublicApiError('Invalid 3DS response.', 400)
  const p = value as Record<string, unknown>
  const req = (key: string) => {
    const v = String(p[key] ?? '').trim()
    if (!v || v.length > 512) throw new PublicApiError('Invalid 3DS response.', 400)
    return v
  }
  const directoryServerTransactionId = String(p.directoryServerTransactionId ?? '').trim()
  if (directoryServerTransactionId.length > 512) throw new PublicApiError('Invalid 3DS response.', 400)
  return {
    cavv: req('cavv'),
    eci: req('eci'),
    protocolVersion: req('protocolVersion'),
    xid: req('xid'),
    ...(directoryServerTransactionId ? { directoryServerTransactionId } : {}),
  }
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export const Route = createFileRoute('/api/payments/culqi/charge')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isPaymentRequestAllowed(request)) throw new PublicApiError('Culqi payments are not enabled yet.', 503)
          const cfg = getPrivatePaymentConfig()
          if (!cfg.enabled || !cfg.bridgeReady || (cfg.mode !== 'sandbox' && cfg.mode !== 'live')) {
            throw new PublicApiError('Culqi payments are not enabled yet.', 503)
          }

          const payload = await readBoundedJsonObject(request, 8 * 1024) as Payload
          const checkoutSessionId = String(payload.checkoutSessionId ?? '').trim().toLowerCase()
          const orderCode = String(payload.orderCode ?? '').trim().toUpperCase()
          const email = String(payload.email ?? '').trim().toLowerCase()
          const sourceId = String(payload.sourceId ?? '').trim()
          const deviceId = String(payload.deviceId ?? '').trim()
          const authentication3DS = parse3DS(payload.authentication3DS)
          const env = cfg.mode === 'sandbox' ? 'test' : 'live'

          if (!orderCode || !email || !validUuid(checkoutSessionId)
            || !new RegExp('^(tkn|ype)_' + env + '_[A-Za-z0-9_-]{8,100}$').test(sourceId)
            || (sourceId.startsWith('tkn_') && !/^[A-Za-z0-9_-]{8,160}$/.test(deviceId))
            || (sourceId.startsWith('ype_') && authentication3DS)) {
            throw new PublicApiError('Valid order, checkout session and Culqi token are required.', 400)
          }

          await enforcePublicApiSecurity({ request, scope: 'payments', email })

          const supabase = createSupabaseAdminClient()
          const { data, error } = await supabase
            .from('orders')
            .select('id,order_code,checkout_session_id,customer_name,email,whatsapp,delivery_address,district,total_amount,status,payment_status,payment_lane,payment_order_id,payment_expires_at')
            .eq('order_code', orderCode)
            .eq('checkout_session_id', checkoutSessionId)
            .maybeSingle()

          if (error) throw new PublicApiError('Could not verify order.', 500)
          const order = data as {
            id: string
            order_code: string
            checkout_session_id: string | null
            customer_name: string
            email: string
            whatsapp: string
            delivery_address: string
            district: string
            total_amount: number
            status: string
            payment_status: string | null
            payment_lane: string
            payment_order_id: string | null
            payment_expires_at: string | null
          } | null

          if (!order || order.email.trim().toLowerCase() !== email) {
            throw new PublicApiError('Order not found.', 404)
          }
          if (order.status === 'cancelled' || order.status === 'delivered') {
            throw new PublicApiError('This order cannot accept payment.', 409)
          }
          if (order.payment_status === 'paid') {
            return Response.json({ ok: true, orderCode, paymentStatus: 'paid' }, { headers: { 'Cache-Control': 'no-store' } })
          }
          if (order.payment_expires_at && Date.parse(order.payment_expires_at) <= Date.now()) {
            throw new PublicApiError('This payment session expired.', 410)
          }
          if (order.payment_order_id || order.payment_lane !== 'token') {
            throw new PublicApiError('This reservation cannot accept token charges.', 409)
          }

          const amountMinor = Math.round(Number(order.total_amount) * 100)
          const result = await coordinateCulqiCharge({
            db: supabase,
            orderId: order.id,
            orderCode: order.order_code,
            checkoutSessionId,
            amountMinor,
            mode: env,
            sourceId,
            deviceId,
            has3DS: Boolean(authentication3DS),
            createCharge: () => createCulqiCharge({
              amountPen: Number(order.total_amount),
              authentication3DS,
              sourceId,
              email: order.email,
              orderCode: order.order_code,
              customerName: order.customer_name,
              phoneNumber: order.whatsapp,
              address: order.delivery_address,
              district: order.district,
              deviceId: deviceId || undefined,
            }),
            fetchCharge: fetchCulqiCharge,
          })
          return Response.json(result, {
            status: result.ok ? 200 : 409,
            headers: { 'Cache-Control': 'no-store, max-age=0' },
          })
        } catch (error) {
          const status = error instanceof PublicApiError ? error.status : 500
          const retryAfter = error instanceof PublicApiError ? error.retryAfterSeconds : null
          return Response.json({
            ok: false,
            error: error instanceof PublicApiError ? error.message : 'Could not process Culqi payment.',
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
