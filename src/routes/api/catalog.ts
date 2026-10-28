import { createFileRoute } from '@tanstack/react-router'
import { getVerifiedDisplayMenu } from '../../domain/lib/approved-shop-contract'

/** Read-only menu provenance; not approval to charge current prices. */
export const Route = createFileRoute('/api/catalog')({
  server: {
    handlers: {
      GET: async () => Response.json({
        purpose: 'published-reference-only',
        checkoutEnabled: false,
        catalog: getVerifiedDisplayMenu(),
      }, { headers: { 'Cache-Control': 'no-store' } }),
    },
  },
})
