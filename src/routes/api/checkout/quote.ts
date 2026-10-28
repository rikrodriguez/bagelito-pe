import { createFileRoute } from '@tanstack/react-router'
import { quoteGuidedOrder } from '../../../server/checkout-quote.server'

export const Route = createFileRoute('/api/checkout/quote')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json()
          const quote = await quoteGuidedOrder(payload)
          return Response.json(quote, {
            status: quote.status === 'invalid' ? 400 : quote.status === 'unavailable' ? 503 : 200,
            headers: { 'Cache-Control': 'no-store, max-age=0' },
          })
        } catch {
          return Response.json({
            status: 'invalid',
            checkoutAllowed: false,
            amountPen: null,
            reasons: ['No se pudo validar el pedido.'],
            batchAccepting: false,
          }, { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } })
        }
      },
    },
  },
})
