import type { H3Event } from 'nitro'

/** Runtime-only preview boundary; the financial handlers remain unchanged. */
export default function referenceReviewGuard(event: H3Event): Response | undefined {
  if (process.env.BAGELITO_REFERENCE_REVIEW_ONLY !== 'true') return

  // H3 canonicalizes harmless escapes before middleware. Also reserve opaque
  // encoded separators so an API-shaped URL cannot fall into the app renderer.
  if (!/^\/+api(?:\/|$|%2f|%5c)/i.test(event.url.pathname)) return

  return Response.json({
    ok: false,
    reviewOnly: true,
    error: 'API disabled in image reference review.',
  }, {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
