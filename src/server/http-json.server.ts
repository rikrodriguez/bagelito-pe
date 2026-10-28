import { PublicApiError } from './public-api-security.server'

export async function readBoundedJsonObject(request: Request, maxBytes = 16 * 1024) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new PublicApiError('Invalid JSON request.', 400)
  }

  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new PublicApiError('Request body is too large.', 413)
  }

  const reader = request.body?.getReader()
  if (!reader) throw new PublicApiError('Invalid JSON request.', 400)

  const chunks: Uint8Array[] = []
  let total = 0
  const deadline = Date.now() + 2_000
  try {
    for (;;) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new PublicApiError('Request body timed out.', 408)
      let timer: ReturnType<typeof setTimeout> | undefined
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new PublicApiError('Request body timed out.', 408)), remaining)
        }),
      ]).finally(() => clearTimeout(timer))

      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > maxBytes) throw new PublicApiError('Request body is too large.', 413)
      chunks.push(chunk.value)
    }
  } finally {
    try { await reader.cancel() } catch {}
    try { reader.releaseLock() } catch {}
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(merged))
  } catch {
    throw new PublicApiError('Invalid JSON request.', 400)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PublicApiError('Invalid JSON request.', 400)
  }
  return value as Record<string, unknown>
}
