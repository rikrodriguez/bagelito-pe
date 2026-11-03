import { createFileRoute } from '@tanstack/react-router'
import { readBoundedJsonObject } from '../../../../server/http-json.server'
import { getPrivatePaymentConfig, isPaymentStatusRequestAllowed, isGuidedReceiptRequestAllowed } from '../../../../server/payment-config.server'
import { createSupabaseAdminClient } from '../../../../server/supabase-admin.server'
import { enforcePublicApiSecurity, PublicApiError } from '../../../../server/public-api-security.server'

import { parsePaymentStatusReference, readBoundPaymentStatus, PaymentStatusNotFoundError } from '../../../../server/payment-status.server'

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

          const payload = await readBoundedJsonObject(request, 4 * 1024)
          const reference = parsePaymentStatusReference(payload)
          if (!reference) {
            return Response.json({ ok: false, error: 'Invalid payment status request.' }, { status: 400, headers })
          }

          await enforcePublicApiSecurity({ request, scope: 'payments' })

          const supabase = createSupabaseAdminClient()
          const result = await readBoundPaymentStatus(supabase, reference, isGuidedReceiptRequestAllowed(request))
          return Response.json(result, { headers })
        } catch (error) {
          const status = error instanceof PublicApiError ? error.status : error instanceof PaymentStatusNotFoundError ? 404 : 500
          return Response.json({
            ok: false,
            error: error instanceof PublicApiError ? error.message : error instanceof PaymentStatusNotFoundError ? 'Payment not found.' : 'Could not read payment status.',
          }, { status, headers })
        }
      },
    },
  },
})
