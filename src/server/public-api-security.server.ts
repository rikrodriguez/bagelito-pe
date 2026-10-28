import { createHash } from 'node:crypto'
import { createSupabaseAdminClient } from './supabase-admin.server'

type Scope = 'payments' | 'reservations' | 'quotes'

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

async function consume(scope: string, identifier: string, limit: number, windowSeconds: number) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('consume_api_rate_limit', {
    p_identifier: hash(identifier),
    p_limit: limit,
    p_scope: scope,
    p_window_seconds: windowSeconds,
  }).single()

  if (error) {
    throw new PublicApiError('This service is temporarily unavailable.', 503)
  }

  const result = data as { allowed?: boolean; retry_after_seconds?: number } | null
  if (!result?.allowed) {
    throw new PublicApiError(
      'Too many attempts. Please try again later.',
      429,
      Math.max(1, Number(result?.retry_after_seconds || windowSeconds)),
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
  const rule = rules[input.scope]
  const [rScope, rLimit, rWindow] = rule.requester
  await consume(rScope, requesterId(input.request), rLimit, rWindow)
  const contact = contactId(input.email || '', input.whatsapp || '')
  if (contact && rule.contact) {
    const [cScope, cLimit, cWindow] = rule.contact
    await consume(cScope, contact, cLimit, cWindow)
  }
}
