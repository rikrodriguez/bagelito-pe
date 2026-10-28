/** Server-only Supabase adapter. Does not create, update or charge anything. */
import { createClient } from '@supabase/supabase-js'
import {
  fallbackBatchAvailability,
  projectBatchAvailability,
  type CurrentBatchRow,
  type CapacityOrderRow,
} from '../domain/lib/batch-read'
import type { BatchAvailability } from '../domain/lib/batch-types'

export type SafeBatchResponse = { batch: BatchAvailability; status: 200 | 503 }
const currentBatchSelect =
  'id, name, status, orders_open_at, orders_close_at, delivery_date, capacity_packs, capacity_bagels'

export async function getBatchReadOnly(nextPackUnits = 6): Promise<SafeBatchResponse> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secret) {
    // Missing secrets must NEVER open checkout or invent live stock.
    return { batch: fallbackBatchAvailability('closed'), status: 503 }
  }

  try {
    const client = createClient(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: current, error: currentError } = await client
      .from('batches')
      .select(currentBatchSelect)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (currentError) throw currentError
    const batch = current as CurrentBatchRow | null
    if (!batch?.id) {
      return { batch: fallbackBatchAvailability('closed'), status: 200 }
    }

    let { data: orders, error: orderError } = await client
      .from('orders')
      .select('pack_units, status, payment_provider, payment_status, payment_expires_at')
      .eq('batch_id', batch.id)
      .neq('status', 'cancelled')

    if (orderError?.code === '42703') {
      const legacy = await client
        .from('orders')
        .select('pack_units, status')
        .eq('batch_id', batch.id)
        .neq('status', 'cancelled')
      orders = legacy.data as typeof orders
      orderError = legacy.error
    }
    if (orderError) throw orderError
    return {
      batch: projectBatchAvailability(batch, (orders ?? []) as CapacityOrderRow[], Date.now(), nextPackUnits),
      status: 200,
    }
  } catch (error) {
    console.error('[Bagelito batch read] unavailable', error instanceof Error ? error.name : 'UnknownError')
    return { batch: fallbackBatchAvailability('closed'), status: 503 }
  }
}
