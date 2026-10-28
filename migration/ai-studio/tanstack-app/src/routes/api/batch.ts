import { createFileRoute } from '@tanstack/react-router'
import { getBatchReadOnly } from '../../server/batch.server'

/** Read-only batch availability, shape-compatible with the existing Next API. */
export const Route = createFileRoute('/api/batch')({
  server: {
    handlers: {
      GET: async () => {
        const result = await getBatchReadOnly()
        return Response.json(result.batch, {
          status: result.status,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'CDN-Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
