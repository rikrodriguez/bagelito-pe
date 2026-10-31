import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { sourceModule } from './load-ts.mjs';

export const operationId = '00000000-0000-4000-8000-000000000001';
export const secondOperationId = '00000000-0000-4000-8000-000000000002';

export function manualForm(id = operationId, overrides = {}) {
  const form = new FormData();
  const fields = {
    operationId: id,
    packSlug: '6-single', items: JSON.stringify([{ flavorSlug: 'plain', quantity: 6 }]),
    customerName: 'Synthetic Customer', whatsapp: '000000000', email: 'qa@example.invalid',
    deliveryAddress: 'Synthetic address 123', district: 'Lince', paymentMethod: 'Yape',
    paymentTransactionNumber: 'SYNTHETIC-001', paymentHolderName: 'Synthetic Customer',
    paymentPhoneNumber: '000000000', exactAmountConfirmed: 'true', termsAccepted: 'true',
    paymentScreenshot: new File(['synthetic proof'], 'proof.png', { type: 'image/png' }),
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) form.set(key, value);
  }
  return form;
}

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function dbError(error, status = 400) {
  return Response.json({ details: null, hint: null, ...error }, { status });
}

function sameIdentity(operation, input) {
  return operation.ownerHash === input.p_owner_hash && operation.requestHash === input.p_request_hash;
}

// A mutable transaction model complements the separate PostgreSQL tests. The
// production service, schema, catalog, pricing and installed Supabase SDK run
// unchanged. Every SDK fetch is intercepted here; no provider is reachable.
export function manualFixture(options = {}) {
  const operations = new Map(), objects = new Map();
  const orders = [], items = [], history = [], writes = [], uploads = [], downloads = [], removed = [];
  const rpcCalls = [], rateCalls = [], fetchCalls = [], errors = [], warnings = [], infos = [];
  const rateLimits = new Map();
  const controls = {
    prepareFaults: [...(options.prepareFaults ?? [])],
    finalizeFaults: [...(options.finalizeFaults ?? [])],
    uploadFaults: [...(options.uploadFaults ?? [])],
    downloadFaults: [...(options.downloadFaults ?? [])],
    prepareError: options.prepareError ?? null,
    finalizeError: options.finalizeError ?? null,
    prepareThrow: options.prepareThrow ?? false,
    finalizeThrow: options.finalizeThrow ?? false,
    uploadError: options.uploadError ?? null,
    downloadError: options.downloadError ?? null,
    cleanupThrow: options.cleanupThrow ?? true,
  };
  const batch = {
    id: 'synthetic-batch', status: 'orders_open', capacity_packs: 1, capacity_bagels: 6,
    orders_open_at: null, orders_close_at: null,
    ...options.batch,
  };
  let sequence = 0;
  let preparedCount = 0, releasePrepared;
  const preparedBarrier = new Promise(resolve => { releasePrepared = resolve; });

  function rejectBatch(packUnits) {
    const now = Date.now();
    if (batch.status !== 'orders_open'
      || (batch.orders_open_at && Date.parse(batch.orders_open_at) > now)
      || (batch.orders_close_at && Date.parse(batch.orders_close_at) <= now)) {
      return dbError({ code: 'P0001', message: 'Synthetic batch is not open for orders.' });
    }
    const activeOrders = orders.filter(order => order.status !== 'cancelled');
    const units = activeOrders.reduce((sum, order) => sum + order.pack_units, 0);
    if ((batch.capacity_packs != null && activeOrders.length + 1 > batch.capacity_packs)
      || (batch.capacity_bagels != null && units + packUnits > batch.capacity_bagels)) {
      return dbError({ code: '23514', message: 'Synthetic batch capacity exhausted.' });
    }
    return null;
  }

  function operationRow(operation, replayed) {
    return {
      operation_id: operation.id, state: operation.state, order_code: operation.orderCode,
      proof_path: operation.proofPath, amount: operation.payload.total_amount,
      pack_slug: operation.payload.pack_slug, replayed,
    };
  }

  function prepare(input) {
    assert.match(input.p_operation_id, /^[0-9a-f-]{36}$/i);
    for (const field of ['p_owner_hash', 'p_request_hash', 'p_proof_sha256']) assert.match(input[field], /^[0-9a-f]{64}$/);
    const existing = operations.get(input.p_operation_id);
    if (existing) {
      if (!sameIdentity(existing, input)) return dbError({ code: 'P4090', message: 'Manual reservation operation conflict.' }, 409);
      if (existing.state !== 'completed' && !isDeepStrictEqual(existing.payload, input.p_order_payload)) {
        return dbError({ code: 'P4091', message: 'Manual reservation quote changed.' }, 409);
      }
      return Response.json(operationRow(existing, true));
    }
    // Fresh operations must reject an unavailable batch before allocating their
    // stable order code or permitting an evidence upload. Existing completion
    // above still recovers before any mutable stock/window check.
    const unavailable = rejectBatch(input.p_order_payload.pack_units);
    if (unavailable) return unavailable;
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[input.p_proof_type];
    assert.ok(extension, 'proof MIME must be canonical');
    assert.ok(input.p_proof_size > 0);
    const operation = {
      id: input.p_operation_id, state: 'awaiting_proof', ownerHash: input.p_owner_hash,
      requestHash: input.p_request_hash, proofSha256: input.p_proof_sha256,
      proofType: input.p_proof_type, proofSize: input.p_proof_size,
      proofPath: `manual/${input.p_operation_id}/${input.p_proof_sha256}.${extension}`,
      orderCode: `BAG-SYNTHETIC-${++sequence}`, batchId: batch.id,
      payload: structuredClone(input.p_order_payload),
    };
    operations.set(operation.id, operation);
    return Response.json(operationRow(operation, false));
  }

  function finalize(input) {
    const operation = operations.get(input.p_operation_id);
    if (!operation || !sameIdentity(operation, input)) return dbError({ code: 'P4090', message: 'Manual reservation operation conflict.' }, 409);
    // As in SQL, idempotent completion is checked before current batch capacity.
    if (operation.state === 'completed') return Response.json(operationRow(operation, true));
    const unavailable = rejectBatch(operation.payload.pack_units);
    if (unavailable) return unavailable;
    const order = { ...structuredClone(operation.payload), id: `synthetic-order-${orders.length + 1}`,
      batch_id: operation.batchId, order_code: operation.orderCode, payment_screenshot_path: operation.proofPath,
      status: 'payment_pending_review' };
    // One synchronous critical section models the serialized SQL operation/batch
    // locks. No client inserts or compensation deletes implement this commit.
    orders.push(order);
    items.push(...operation.payload.items.map(item => ({ ...item, order_id: order.id })));
    history.push({ order_id: order.id, new_status: order.status, changed_by: 'customer' });
    operation.state = 'completed';
    return Response.json(operationRow(operation, false));
  }

  function faultFor(stage) {
    const queue = controls[`${stage}Faults`];
    if (queue.length) return queue.shift();
    if (controls[`${stage}Throw`]) return { throw: `Synthetic ${stage} transport failure` };
    if (controls[`${stage}Error`]) return { error: controls[`${stage}Error`] };
    return null;
  }

  function faultResponse(fault) {
    if (!fault) return null;
    if (fault.throw) throw new TypeError(fault.throw);
    if (fault.error) return dbError(fault.error, fault.status ?? 400);
    if (Object.hasOwn(fault, 'row')) return Response.json(fault.row);
    return null;
  }

  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://synthetic.invalid');
    const method = init.method ?? 'GET';
    fetchCalls.push({ method, path: parsed.pathname });
    if (parsed.pathname.startsWith('/rest/v1/rpc/')) {
      const name = parsed.pathname.split('/').pop();
      const input = JSON.parse(init.body);
      rpcCalls.push({ name, input });
      assert.equal(method, 'POST');
      if (name === 'consume_api_rate_limit') {
        rateCalls.push(input);
        const bucket = `${input.p_scope}:${input.p_identifier}`;
        const hits = Math.min(rateLimits.get(bucket) ?? 0, input.p_limit) + 1;
        rateLimits.set(bucket, hits);
        return Response.json({ allowed: hits <= input.p_limit, hits,
          retry_after_seconds: hits <= input.p_limit ? 0 : input.p_window_seconds });
      }
      const stage = { prepare_manual_reservation_v1: 'prepare', finalize_manual_reservation_v1: 'finalize' }[name];
      assert.ok(stage, `Unexpected RPC ${name}; no legacy fallback is allowed`);
      const fault = faultFor(stage);
      if (fault?.when !== 'after') {
        const response = faultResponse(fault);
        if (response) return response;
      }
      const result = stage === 'prepare' ? prepare(input) : finalize(input);
      if (stage === 'prepare' && result.ok && preparedCount < (options.prepareBarrier ?? 0)) {
        if (++preparedCount === options.prepareBarrier) releasePrepared();
        await preparedBarrier;
      }
      if (fault?.when === 'after') {
        const response = faultResponse(fault);
        if (response) return response;
      }
      return result;
    }
    const prefix = '/storage/v1/object/payment-proofs/';
    if (parsed.pathname.startsWith(prefix)) {
      const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
      if (method === 'POST') {
        const file = init.body.get('');
        assert.ok(file instanceof Blob);
        const entry = { path, file, options: { contentType: file.type,
          upsert: new Headers(init.headers).get('x-upsert') === 'true' } };
        uploads.push(entry);
        const fault = faultFor('upload');
        if (fault?.when !== 'after') {
          const response = faultResponse(fault);
          if (response) return response;
        }
        if (objects.has(path)) return dbError({ code: 'Duplicate', message: 'The resource already exists.' }, 409);
        objects.set(path, new Blob([await file.arrayBuffer()], { type: file.type }));
        if (fault?.when === 'after') {
          const response = faultResponse(fault);
          if (response) return response;
        }
        return Response.json({ Id: path, Key: `payment-proofs/${path}` });
      }
      if (method === 'GET') {
        downloads.push(path);
        const response = faultResponse(faultFor('download'));
        if (response) return response;
        if (!objects.has(path)) return dbError({ code: '404', message: 'Object not found.' }, 404);
        return new Response(objects.get(path), { headers: { 'Content-Type': objects.get(path).type } });
      }
    }
    if (method === 'DELETE' && parsed.pathname === '/storage/v1/object/payment-proofs') {
      const paths = JSON.parse(init.body).prefixes;
      removed.push(...paths);
      if (controls.cleanupThrow) throw new Error('Cleanup must never be attempted for a bound operation.');
      for (const path of paths) objects.delete(path);
      return Response.json([]);
    }
    writes.push({ method, path: parsed.pathname });
    assert.fail(`Unexpected direct database/storage write: ${method} ${parsed.pathname}`);
  };

  const db = createClient('https://synthetic.invalid', 'synthetic-key-not-a-credential', {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch },
  });
  const cache = new Map();
  const quote = { amount: null };
  const catalog = sourceModule('src/lib/catalog.ts');
  const overrides = {
    '@/lib/env': { getMissingReservationEnv: () => [] },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => db },
    '@/lib/catalog': { ...catalog, getPackBySlug(slug) {
      const pack = catalog.getPackBySlug(slug);
      return pack && quote.amount !== null ? { ...pack, amount: quote.amount } : pack;
    } },
    '@/lib/monitoring': {
      logError: (...args) => errors.push(args), logWarn: (...args) => warnings.push(args),
      logInfo: (...args) => infos.push(args), getDurationMs: started => Date.now() - started,
      getRequestId: request => request.headers.get('x-request-id') ?? undefined,
    },
  };
  const load = (relative, extraOverrides = {}) => sourceModule(relative, { ...overrides, ...extraOverrides }, cache);
  const service = load('src/lib/reservations/service.ts');
  return { ...service, db, operations, objects, orders, items, history, writes, uploads, downloads, removed,
    rpcCalls, rateCalls, fetchCalls, errors, warnings, infos, controls, batch, quote, load };
}
