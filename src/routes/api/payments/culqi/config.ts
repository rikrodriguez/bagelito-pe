import { createFileRoute } from '@tanstack/react-router'
import { getPublicPaymentConfig } from '../../../../server/payment-config.server'

export const Route = createFileRoute('/api/payments/culqi/config')({
  server: {
    handlers: {
      GET: async () => Response.json(getPublicPaymentConfig(), {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'CDN-Cache-Control': 'no-store',
        },
      }),
    },
  },
})
