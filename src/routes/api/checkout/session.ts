import { createFileRoute } from '@tanstack/react-router'
import { createGuidedCheckoutSession } from '../../../server/checkout-session.server'
import { PublicApiError } from '../../../server/public-api-security.server'

export const Route = createFileRoute('/api/checkout/session')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json()
          const result = await createGuidedCheckoutSession(request, payload)
          return Response.json(result, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
        } catch (error) {
          const status = error instanceof PublicApiError ? error.status : 500
          const retryAfter = error instanceof PublicApiError ? error.retryAfterSeconds : null
          return Response.json({
            ok: false,
            error: error instanceof PublicApiError ? error.message : 'No se pudo iniciar el checkout.',
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
