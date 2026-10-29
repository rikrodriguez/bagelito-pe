type JsonRecord = Record<string, unknown>

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseCulqiEventResource(value: unknown): JsonRecord | null {
  let resource = value
  if (typeof resource === 'string') {
    try { resource = JSON.parse(resource) } catch { return null }
  }
  return record(resource) ? resource : null
}

export function verifyCulqiEventIdentity(
  requestedId: string,
  event: { id?: string; type?: string },
) {
  if (event.id !== requestedId || typeof event.type !== 'string' || !event.type.trim()) {
    throw new Error('Culqi returned an invalid event identity or type.')
  }
  return event.type
}

export async function resolveVerifiedCulqiChargeCurrency(
  eventType: string,
  eventResource: JsonRecord,
  getCharge: (chargeId: string) => Promise<unknown>,
): Promise<JsonRecord> {
  if (eventType !== 'charge.creation.succeeded'
    || eventResource.object !== 'charge'
    || Object.prototype.hasOwnProperty.call(eventResource, 'currency_code')
    || Object.prototype.hasOwnProperty.call(eventResource, 'currency')) {
    return eventResource
  }

  const id = eventResource.id
  const amount = eventResource.amount
  const source = eventResource.source
  const metadata = eventResource.metadata

  if (typeof id !== 'string' || !/^chr_(test|live)_[A-Za-z0-9_-]{8,100}$/.test(id)
    || !Number.isSafeInteger(amount) || Number(amount) <= 0
    || !record(source) || typeof source.id !== 'string'
    || !/^(?:tkn|ype)_(test|live)_[A-Za-z0-9_-]{8,100}$/.test(source.id)
    || id.split('_')[1] !== source.id.split('_')[1]
    || !record(metadata) || typeof metadata.bagelito_order_code !== 'string'
    || !/^BAG-[A-Z0-9_-]{1,80}$/.test(metadata.bagelito_order_code)) {
    throw new Error('Authenticated Culqi charge evidence is incomplete or inconsistent.')
  }

  const charge = await getCharge(id)
  if (!record(charge)
    || charge.object !== 'charge'
    || charge.id !== id
    || charge.amount !== amount
    || charge.currency_code !== 'PEN'
    || (Object.prototype.hasOwnProperty.call(charge, 'currency') && charge.currency !== 'PEN')
    || !record(charge.metadata)
    || charge.metadata.bagelito_order_code !== metadata.bagelito_order_code
    || !record(charge.source)
    || charge.source.id !== source.id
    || charge.capture !== true
    || charge.current_amount !== amount
    || charge.amount_refunded !== 0
    || charge.dispute !== false) {
    throw new Error('Authenticated Culqi charge evidence is incomplete or inconsistent.')
  }

  return { ...eventResource, currency_code: 'PEN' }
}
