import { createFileRoute } from '@tanstack/react-router'
import { readBoundedJsonObject } from '../../../server/http-json.server'
import { getPrivatePaymentConfig } from '../../../server/payment-config.server'
import { fetchCulqiCharge, fetchCulqiEvent } from '../../../server/culqi.server'
import {
  parseCulqiEventResource,
  resolveVerifiedCulqiChargeCurrency,
  verifyCulqiEventIdentity,
} from '../../../server/culqi-event-evidence.server'
import { createSupabaseAdminClient } from '../../../server/supabase-admin.server'

const supportedEvents = new Set([
  'order.status.changed',
  'charge.creation.succeeded',
  'charge.creation.failed',
  'charge.expired',
])

export const Route = createFileRoute('/api/webhooks/culqi')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = {
          'Cache-Control': 'no-store, max-age=0',
          'CDN-Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        }

        try {
          const cfg = getPrivatePaymentConfig()
          if (!cfg.configured || !cfg.bridgeReady || !cfg.webhookReady || !cfg.secretKey) {
            return Response.json({ ok: false, error: 'Culqi webhook is not enabled yet.' }, { status: 503, headers })
          }

          const received = await readBoundedJsonObject(request, 8 * 1024)
          const eventId = String(received.id ?? '').trim()
          const env = cfg.mode === 'sandbox' ? 'test' : cfg.mode === 'live' ? 'live' : null
          if (!env || !new RegExp('^evt_' + env + '_[A-Za-z0-9_-]{8,40}$').test(eventId)) {
            return Response.json({ ok: false, error: 'A valid Culqi event ID is required.' }, { status: 400, headers })
          }

          // The incoming webhook body is never trusted as payment evidence.
          // Re-read the event from Culqi using the server secret key.
          const verified = await fetchCulqiEvent(eventId)
          const eventType = verifyCulqiEventIdentity(eventId, verified)

          if (!supportedEvents.has(eventType)) {
            return Response.json({ ok: true, ignored: true }, { headers })
          }

          const resource = parseCulqiEventResource(verified.data)
          if (eventType.startsWith('refund.') || resource?.object === 'refund') {
            return Response.json({ ok: false, error: 'Refund reconciliation requires review.' }, { status: 501, headers })
          }
          if (!resource || typeof resource.id !== 'string' || !resource.id) {
            return Response.json({ ok: false, error: 'Webhook payment data is missing.' }, { status: 400, headers })
          }

          const reconciledResource = await resolveVerifiedCulqiChargeCurrency(
            eventType,
            resource,
            fetchCulqiCharge,
          )

          const supabase = createSupabaseAdminClient()
          const { data, error } = await supabase.rpc('apply_culqi_payment_event', {
            p_event_id: eventId,
            p_event_type: eventType,
            p_resource: reconciledResource,
            p_verified_payload: verified,
          })

          if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
            // Do not acknowledge an event whose DB transaction did not commit.
            return Response.json({ ok: false, error: 'Could not process Culqi webhook.' }, { status: 500, headers })
          }

          return Response.json({ ok: true, ...data as Record<string, unknown> }, { headers })
        } catch {
          // Culqi should retry a 5xx. Never acknowledge an unverified event.
          return Response.json({ ok: false, error: 'Could not process Culqi webhook.' }, { status: 500, headers })
        }
      },
    },
  },
})
