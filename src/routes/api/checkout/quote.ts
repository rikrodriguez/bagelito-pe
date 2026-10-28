import { createFileRoute } from '@tanstack/react-router'
import { quoteGuidedOrder } from '../../../server/checkout-quote.server'
import { readBoundedJsonObject } from '../../../server/http-json.server'
import { PublicApiError } from '../../../server/public-api-security.server'

export const Route = createFileRoute('/api/checkout/quote')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await readBoundedJsonObject(request, 8 * 1024)
          const quote = await quoteGuidedOrder(payload)
          return Response.json(quote, {
            status: quote.status === 'invalid' ? 400 : quote.status === 'unavailable' ? 503 : 200,
            headers: { 'Cache-Control': 'no-store, max-age=0' },
          })
        } catch (error) {
          const status = error instanceof PublicApiError ? error.status : 400
          return Response.json({
            status: 'invalid',
            checkoutAllowed: false,
            amountPen: null,
            reasons: [error instanceof PublicApiError ? error.message : 'No se pudo validar el pedido.'],
            batchAccepting: false,
          }, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } })
        }
      },
    },
  },
})
