import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { sourceModule } from './helpers/load-ts.mjs';
import { manualFixture, manualForm, operationId } from './helpers/manual-reservation-fixture.mjs';

const { observeManual } = sourceModule('src/lib/reservations/manual-observation.ts');

test('manual observation contains synchronous throws without recursively logging', () => {
  let calls = 0;
  assert.equal(observeManual(() => { calls++; throw new Error('Synthetic observer failure'); }), undefined);
  assert.equal(calls, 1);
});

test('manual observation handles rejected promises without changing the caller result', async () => {
  assert.equal(observeManual(() => Promise.reject(new Error('Synthetic observer rejection'))), undefined);
  await Promise.resolve();
});

test('manual observation does not wait for a promise that never settles', () => {
  let called = false;
  assert.equal(observeManual(() => { called = true; return new Promise(() => {}); }), undefined);
  assert.equal(called, true);
});

function assertOnePurchase(f) {
  assert.equal(f.orders.length, 1);
  assert.equal(f.items.length, 1);
  assert.equal(f.history.length, 1);
  assert.equal(f.objects.size, 1);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.orders[0].total_amount, 58);
  assert.equal(f.orders[0].pack_units, 6);
  assert.equal(f.orders[0].terms_accepted, true);
  assert.equal(f.orders[0].exact_amount_confirmed, true);
  assert.ok(f.objects.has(f.orders[0].payment_screenshot_path));
  assert.equal(f.rpcCalls.filter(call => call.name === 'finalize_manual_reservation_v1').length, 1);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removed, []);
}

function expectedSuccess() {
  return { ok: true, operationId, orderCode: 'BAG-SYNTHETIC-1' };
}

async function post(route, form = manualForm()) {
  const response = await route.POST(new Request('http://localhost/api/reservations', {
    method: 'POST', body: form,
    headers: { 'x-forwarded-for': '192.0.2.45', 'x-request-id': 'synthetic-observation-request' },
  }));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  return { status: response.status, body: await response.json() };
}

// Run production analytics.ts and, in the console controls, monitoring.ts as
// well. Only the provider, alert dispatcher and selected failure boundary are
// substituted. All reservation I/O uses the real SDK's intercepted fetch.
function observationFixture(mode) {
  const f = manualFixture();
  const logs = [], providerCalls = [], wrapperCalls = [], interceptedAlerts = [];
  let warningFailures = 0, successFailures = 0;
  const monitoring = mode.startsWith('console_')
    ? f.load('src/lib/monitoring.ts', {
      './monitoring-alerts': { dispatchMonitoringAlert: async alert => { interceptedAlerts.push(alert); } },
    })
    : {
      getDurationMs: started => Date.now() - started,
      getRequestId: request => request.headers.get('x-request-id'),
      logInfo(name, context) {
        logs.push({ name, context });
        if (name === 'reservation_api_success' && ['success_info_once', 'catch_log_error_once'].includes(mode)
          && successFailures++ === 0) throw new Error('Synthetic success log failure');
      },
      logWarn(name, context) {
        logs.push({ name, context });
        if (name === 'analytics_event_failed' && mode === 'provider_warn_once' && warningFailures++ === 0) {
          throw new Error('Synthetic analytics warning failure');
        }
        if (name === 'analytics_event_failed' && mode === 'provider_warn_always') throw new Error('Synthetic persistent warning failure');
      },
      logError(name, error, context) {
        logs.push({ name, error, context });
        if (mode === 'catch_log_error_once') throw new Error('Synthetic catch logger failure');
      },
    };
  const realAnalytics = f.load('src/lib/server-analytics.ts', {
    '@/lib/monitoring': monitoring,
    '@vercel/analytics/server': { track: async name => {
      providerCalls.push(name);
      if (mode.startsWith('provider_') || mode === 'console_warn_once') throw new Error('Synthetic provider failure');
    } },
  });
  const analytics = mode.startsWith('wrapper_') ? {
    trackBagelitoServerEvent: async name => {
      wrapperCalls.push(name);
      if (name === 'Reservation Created' || mode === 'wrapper_always') throw new Error('Synthetic wrapper rejection');
    },
  } : realAnalytics;
  const route = f.load('src/app/api/reservations/route.ts', {
    '@/lib/monitoring': monitoring, '@/lib/server-analytics': analytics,
  });
  return { ...f, route, logs, providerCalls, wrapperCalls, interceptedAlerts };
}

for (const mode of [
  'provider_caught', 'wrapper_once', 'provider_warn_once', 'success_info_once',
  'wrapper_always', 'provider_warn_always', 'catch_log_error_once',
]) {
  test(`after commit, ${mode} cannot change success or cause a second purchase`, async () => {
    const f = observationFixture(mode);
    assert.deepEqual(await post(f.route), { status: 200, body: expectedSuccess() });
    assertOnePurchase(f);
    const observed = f.providerCalls.length + f.wrapperCalls.length;
    assert.deepEqual(await post(f.route), { status: 200, body: expectedSuccess() });
    assertOnePurchase(f);
    assert.equal(f.providerCalls.length + f.wrapperCalls.length, observed, 'Replay skips Created telemetry');
    assert.ok(!f.logs.some(log => log.name === 'reservation_api_failed'), 'An observer failure is not a domain failure');
    assert.equal(f.rateCalls.length, 4);
  });
}

for (const mode of ['console_info_once', 'console_warn_once', 'console_info_persistent']) {
  test(`real monitoring ${mode} preserves 200 while the observer fails`, async () => {
    const f = observationFixture(mode);
    const originals = { info: console.info, warn: console.warn, error: console.error };
    let failures = 0, repaired = false;
    try {
      for (const level of Object.keys(originals)) {
        console[level] = line => {
          const entry = JSON.parse(line);
          f.logs.push(entry);
          const selected = mode === 'console_warn_once'
            ? level === 'warn' && entry.msg === 'analytics_event_failed'
            : level === 'info' && entry.msg === 'reservation_api_success';
          if (selected && !repaired && (failures === 0 || mode === 'console_info_persistent')) {
            failures++;
            assertOnePurchase(f);
            throw new Error('Synthetic real structured logger failure');
          }
        };
      }
      assert.deepEqual(await post(f.route), { status: 200, body: expectedSuccess() });
      assert.deepEqual(await post(f.route), { status: 200, body: expectedSuccess() });
      if (mode === 'console_info_persistent') {
        assert.equal(failures, 2);
        repaired = true;
        assert.deepEqual(await post(f.route), { status: 200, body: expectedSuccess() });
      }
      assertOnePurchase(f);
    } finally {
      Object.assign(console, originals);
    }
    assert.equal(failures, mode === 'console_info_persistent' ? 2 : 1);
    assert.ok(!f.logs.some(log => log.msg === 'reservation_api_failed'));
  });
}

for (const behavior of ['throws', 'rejects']) {
  for (const status of [400, 409, 503, 202]) {
    test(`${status} domain result is preserved when catch telemetry and loggers ${behavior}`, async () => {
      const options = {
        400: { finalizeError: { code: '23514', message: 'Synthetic capacity rejection' } },
        409: {},
        503: { prepareError: { code: '42883', message: 'Synthetic missing migration' } },
        202: { finalizeError: { code: 'EPIPE', message: 'Synthetic unknown commit result' } },
      }[status];
      const f = manualFixture(options);
      if (status === 409) await f.createReservation(manualForm());
      const observations = [];
      function failedObserver(name) {
        observations.push(name);
        if (behavior === 'throws') throw new Error('Synthetic observer throw');
        return Promise.reject(new Error('Synthetic observer rejection'));
      }
      const route = f.load('src/app/api/reservations/route.ts', {
        '@/lib/monitoring': {
          getDurationMs: () => 1, getRequestId: () => 'synthetic-observation-request',
          logInfo: () => failedObserver('info'), logWarn: () => failedObserver('warn'), logError: () => failedObserver('error'),
        },
        '@/lib/server-analytics': { trackBagelitoServerEvent: () => failedObserver('analytics') },
      });
      const response = await post(route, status === 409 ? manualForm(operationId, { email: 'different@example.invalid' }) : manualForm());
      assert.equal(response.status, status);
      assert.equal(response.body.ok, false);
      assert.equal(response.body.operationId, operationId);
      assert.equal(response.body.code, {
        400: 'manual_reservation_rejected', 409: 'operation_conflict',
        503: 'manual_reservation_unavailable', 202: 'manual_reservation_pending',
      }[status]);
      if (status === 202) assert.equal(response.body.state, 'pending');
      assert.equal(Object.hasOwn(response.body, 'orderCode'), false);
      assert.equal(Object.hasOwn(response.body, 'proofPath'), false);
      assert.ok(!JSON.stringify(response.body).includes('Synthetic observer'));
      assert.ok(observations.includes('analytics'));
      assert.ok(observations.includes(status === 202 ? 'warn' : 'error'));
      assert.deepEqual(f.writes, []);
      assert.deepEqual(f.removed, []);
      if (status === 409) assertOnePurchase(f);
      else assert.deepEqual([f.orders, f.items, f.history], [[], [], []]);
    });
  }
}

for (const field of ['getRequestId', 'getDurationMs']) {
  for (const behavior of ['throws', 'rejects']) {
    test(`observability metadata ${field} that ${behavior} cannot change success`, async () => {
      const f = manualFixture();
      const metadata = () => {
        if (behavior === 'throws') throw new Error('Synthetic metadata failure');
        return Promise.reject(new Error('Synthetic metadata rejection'));
      };
      const route = f.load('src/app/api/reservations/route.ts', {
        '@/lib/monitoring': {
          getRequestId: () => 'synthetic-observation-request', getDurationMs: () => 1,
          [field]: metadata, logInfo() {}, logWarn() {}, logError() {},
        },
        '@/lib/server-analytics': { trackBagelitoServerEvent: async () => {} },
      });
      assert.deepEqual(await post(route), { status: 200, body: expectedSuccess() });
      assertOnePurchase(f);
    });
  }
}

for (const domain of ['success', 'pending']) {
  test(`never-settling observers do not block the ${domain} HTTP result`, { timeout: 2000 }, async () => {
    const f = manualFixture(domain === 'pending' ? { finalizeError: { code: 'EPIPE', message: 'Synthetic unknown result' } } : {});
    const never = () => new Promise(() => {});
    const route = f.load('src/app/api/reservations/route.ts', {
      '@/lib/monitoring': {
        getRequestId: () => 'synthetic-observation-request', getDurationMs: () => 1,
        logInfo: never, logWarn: never, logError: never,
      },
      '@/lib/server-analytics': { trackBagelitoServerEvent: never },
    });
    const response = await post(route);
    assert.equal(response.status, domain === 'success' ? 200 : 202);
    assert.equal(response.body.operationId, operationId);
    if (domain === 'success') {
      assert.deepEqual(response.body, expectedSuccess());
      assertOnePurchase(f);
    } else {
      assert.equal(response.body.code, 'manual_reservation_pending');
      assert.equal(response.body.state, 'pending');
      assert.equal(f.orders.length, 0);
      assert.equal(f.objects.size, 1);
    }
  });
}

function missingLimiterClient() {
  const calls = [];
  const client = createClient('https://synthetic.invalid', 'synthetic-key-not-a-credential', {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      assert.equal(new URL(url).origin, 'https://synthetic.invalid');
      assert.equal(new URL(url).pathname, '/rest/v1/rpc/consume_api_rate_limit');
      assert.equal(init.method, 'POST');
      calls.push(JSON.parse(init.body));
      return Response.json({ code: '42883',
        message: 'function consume_api_rate_limit does not exist: SYNTHETIC_SQL_INTERNAL_DO_NOT_EXPOSE',
      }, { status: 404 });
    } },
  });
  return { client, calls };
}

for (const behavior of ['throws', 'rejects', 'never settles']) {
  test(`manual missing rate-limit RPC remains 503 when its warning ${behavior}`, { timeout: 2000 }, async () => {
    const f = manualFixture();
    const limiter = missingLimiterClient();
    const warnings = [];
    const monitoring = {
      getRequestId: () => 'synthetic-rate-limit-warning', getDurationMs: () => 1,
      logInfo() {}, logError() {},
      logWarn(name) {
        warnings.push(name);
        if (name !== 'public_rate_limit_rpc_missing') return;
        if (behavior === 'throws') throw new Error('SYNTHETIC_SECURITY_WARNING_FAILURE');
        if (behavior === 'rejects') return Promise.reject(new Error('SYNTHETIC_SECURITY_WARNING_REJECTION'));
        return new Promise(() => {});
      },
    };
    // Load the actual guard, including its actual SDK RPC. Only its database and
    // logging boundaries are replaced; the guard itself is never stubbed.
    f.load('src/lib/public-api-security.ts', {
      '@/lib/supabase/admin': { createSupabaseAdminClient: () => limiter.client },
      '@/lib/monitoring': monitoring,
    });
    const route = f.load('src/app/api/reservations/route.ts', {
      '@/lib/monitoring': monitoring,
      '@/lib/server-analytics': { trackBagelitoServerEvent: async () => {} },
    });
    const response = await post(route);
    assert.deepEqual(response, { status: 503, body: { ok: false,
      error: 'This service is temporarily unavailable. Please try again shortly.',
    } });
    assert.equal(limiter.calls.length, 1);
    assert.equal(limiter.calls[0].p_scope, 'reservations_requester');
    assert.ok(warnings.includes('public_rate_limit_rpc_missing'));
    assert.ok(!JSON.stringify(response.body).includes('SYNTHETIC_'));
    assert.ok(!JSON.stringify(response.body).includes('consume_api_rate_limit'));
    assert.equal(f.fetchCalls.length, 0, 'The reservation service and storage must not be reached');
    assert.equal(f.operations.size, 0);
    assert.equal(f.objects.size, 0);
    assert.deepEqual([f.orders, f.items, f.history, f.uploads, f.removed], [[], [], [], [], []]);
  });
}

test('a default payment guard caller without the manual observer keeps its existing warning behavior', async () => {
  for (const warningThrows of [false, true]) {
    const limiter = missingLimiterClient();
    const warningFailure = new Error('Synthetic default-caller warning failure');
    const guard = sourceModule('src/lib/public-api-security.ts', {
      '@/lib/supabase/admin': { createSupabaseAdminClient: () => limiter.client },
      '@/lib/monitoring': { logWarn() { if (warningThrows) throw warningFailure; } },
    });
    await assert.rejects(guard.enforcePublicApiSecurity({
      email: 'qa@example.invalid', whatsapp: '000000000', scope: 'payments',
      request: new Request('http://localhost/api/payments/culqi/order', {
        headers: { 'x-forwarded-for': '192.0.2.46' },
      }),
    }), error => {
      if (warningThrows) assert.equal(error, warningFailure);
      else {
        assert.ok(error instanceof guard.PublicApiError);
        assert.equal(error.status, 503);
        assert.equal(error.code, 'rate_limit_unavailable');
        assert.equal(error.message, 'This service is temporarily unavailable. Please try again shortly.');
      }
      return true;
    });
    assert.equal(limiter.calls.length, 1);
    assert.equal(limiter.calls[0].p_scope, 'payments_requester');
  }
});
