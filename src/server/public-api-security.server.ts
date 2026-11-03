import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { createSupabaseAdminClient } from './supabase-admin.server'

type Scope = 'payments' | 'reservations' | 'quotes'
const RATE_LIMIT_BUDGET_MS = 2000
const unavailable = () => new PublicApiError('This service is temporarily unavailable.', 503)

const rules: Record<Scope, { requester: [string, number, number]; contact?: [string, number, number] }> = {
  payments: {
    requester: ['payments_requester', 20, 600],
    contact: ['payments_contact', 10, 3600],
  },
  reservations: {
    requester: ['reservations_requester', 6, 600],
    contact: ['reservations_contact', 4, 43200],
  },
  quotes: {
    requester: ['checkout_quotes_requester', 40, 600],
  },
}

export class PublicApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.name = 'PublicApiError'
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function requesterId(request: Request) {
  const raw = request.headers.get('x-forwarded-for')
    || request.headers.get('x-real-ip')
    || request.headers.get('cf-connecting-ip')
    || ''
  const ip = raw.split(',')[0]?.trim()
  if (ip) return 'ip:' + ip
  return 'ua:' + (request.headers.get('user-agent') || 'unknown').slice(0, 160)
}

function contactId(email: string, whatsapp: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (normalizedEmail) return 'email:' + normalizedEmail
  const digits = whatsapp.replace(/\D/g, '').slice(-9)
  return digits ? 'phone:' + digits : ''
}

async function consume(scope: string, identifier: string, limit: number, windowSeconds: number, deadline: number) {
  let data: unknown
  const remaining = deadline - performance.now()
  if (remaining <= 0) throw unavailable()
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const supabase = createSupabaseAdminClient()
    // Racing also bounds transports that ignore abort. Never retry: the RPC
    // may already have consumed a slot even when its response was lost.
    const result = await Promise.race([
      Promise.resolve().then(() => supabase.rpc('consume_api_rate_limit', {
        p_identifier: hash(identifier),
        p_limit: limit,
        p_scope: scope,
        p_window_seconds: windowSeconds,
      }).abortSignal(controller.signal).single()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(unavailable()) }, remaining)
      }),
    ])
    // An overdue promise can settle before a delayed timer callback runs.
    if (performance.now() >= deadline) { controller.abort(); throw unavailable() }
    if (!result || result.error !== null) throw unavailable()
    data = result.data
  } catch {
    throw unavailable()
  } finally {
    clearTimeout(timer)
  }

  const result = data as { allowed?: unknown; retry_after_seconds?: unknown } | null
  if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.allowed !== 'boolean') throw unavailable()
  if (result.allowed === false) {
    const retry = result.retry_after_seconds ?? windowSeconds
    if (typeof retry !== 'number' || !Number.isSafeInteger(retry) || retry < 0) throw unavailable()
    throw new PublicApiError(
      'Too many attempts. Please try again later.',
      429,
      Math.min(windowSeconds, Math.max(1, retry)),
    )
  }
}

export async function enforcePublicApiSecurity(input: {
  request: Request
  scope: Scope
  email?: string
  whatsapp?: string
  trapValue?: string
}) {
  if ((input.trapValue || '').trim()) throw new PublicApiError('Invalid submission.', 400)
  // One budget for both requester and optional contact, not 2 s per RPC.
  const deadline = performance.now() + RATE_LIMIT_BUDGET_MS
  const rule = rules[input.scope]
  const [rScope, rLimit, rWindow] = rule.requester
  await consume(rScope, requesterId(input.request), rLimit, rWindow, deadline)
  const contact = contactId(input.email || '', input.whatsapp || '')
  if (contact && rule.contact) {
    const [cScope, cLimit, cWindow] = rule.contact
    await consume(cScope, contact, cLimit, cWindow, deadline)
  }
}
