import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from './helpers/load-ts.mjs';

const batch = { id: 'synthetic-current', name: 'Current synthetic batch' };
const orders = [
  { id: 'synthetic-current-order', batch_id: batch.id, order_code: 'BAG-OPS-CURRENT', status: 'payment_confirmed', customer_name: 'Current Synthetic', district: 'Lince', pack_units: 12, pack_name: '12 mixed', total_amount: 123, delivery_address: 'Synthetic address', whatsapp: '000000000', order_items: [], order_status_history: [] },
  { id: 'synthetic-old-order', batch_id: 'synthetic-old', order_code: 'BAG-OPS-OLD', status: 'payment_confirmed', customer_name: 'Old Batch Synthetic', district: 'Barranco', pack_units: 6, pack_name: '6 single', total_amount: 74, delivery_address: 'Old synthetic address', whatsapp: '000000001', order_items: [], order_status_history: [] },
];
const queries = sourceModule('src/lib/admin/queries.ts');
for (const kind of ['delivery', 'driver']) {
  test(`${kind} CSV contains only the current batch, matching production`, async () => {
    const { GET } = sourceModule(`src/app/admin/export/${kind}/route.ts`, {
      '@/lib/admin/auth': { requireAdmin: async () => {} },
      '@/lib/admin/queries': { ...queries, fetchCurrentBatch: async () => batch, fetchOrders: async () => structuredClone(orders) },
    });
    const response = await GET();
    const csv = await response.text();
    assert.ok(csv.includes('Current Synthetic'));
    assert.ok(!csv.includes('Old Batch Synthetic'), 'A previous unarchived batch must not enter this delivery run');
    assert.ok(!csv.includes('Barranco'));
  });
}

test('saving explicit zero costs preserves zero rather than replacing it with defaults', async () => {
  let saved;
  const redirected = new Error('Synthetic redirect');
  const { updateBatchFinancialCosts } = sourceModule('src/app/admin/actions.ts', {
    '@/lib/admin/auth': { requireAdmin: async () => {} },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => ({ from: () => ({ update: value => { saved = value; return { eq: async () => ({ error: null }) }; } }) }) },
    '@/lib/monitoring': { getDurationMs: () => 0, logInfo() {}, logWarn() {}, logError() {} },
    'next/navigation': { redirect: () => { throw redirected; } },
    'next/cache': { revalidatePath() {} },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({ batchId: batch.id, ingredientCostPerBagel: '0', packagingCostPerPack: '0', actualDeliveryCost: '0', otherBatchCost: '0' })) form.set(key, value);
  await assert.rejects(updateBatchFinancialCosts(form), error => error === redirected);
  assert.deepEqual(saved, { ingredient_cost_per_bagel: 0, packaging_cost_per_pack: 0, actual_delivery_cost: 0, other_batch_cost: 0 });
});
