// Illustrative TanStack Start port of src/app/api/batch/route.ts
// Not deployed or compiled. Copy into the AI Studio-generated project only after
// migrating and verifying src/lib/reservations/service.ts and its server dependencies.
import { createFileRoute } from '@tanstack/react-router'
import { getReservationBatchAvailability } from '../../../lib/reservations/service'

export const Route = createFileRoute('/api/batch')({
  server: {
    handlers: {
      GET: async () => {
        const batch = await getReservationBatchAvailability()

        return Response.json(batch, {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'CDN-Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
