import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {DeliveryV2VerificationRequired,requireVerifiedDeliveryV2Pricing} from './delivery-v2-hard-stop.ts';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'service.ts'), 'utf8');
const guardSource = readFileSync(join(here, 'delivery-v2-hard-stop.ts'), 'utf8');

test('legacy shipping is always blocked before any reservation side effects', () => {
  assert.throws(() => requireVerifiedDeliveryV2Pricing(), error =>
    error instanceof DeliveryV2VerificationRequired &&
    error.message.includes('Delivery V2 verification is required'));
});

test('manual-proof reservation is guarded before environment, uploads or DB operations', () => {
  assert.match(source, /export async function createReservation\(formData: FormData\)\s*\{\s*requireVerifiedDeliveryV2Pricing\(\);/);
});

test('Culqi reservation is guarded before environment, DB or checkout session operations', () => {
  assert.match(source, /export async function createCulqiReservation\(input: unknown\)\s*\{\s*requireVerifiedDeliveryV2Pricing\(\);/);
});

test('guard has an explicit imported dependency, not a client-controlled bypass', () => {
  assert.match(source, /import \{ DeliveryV2VerificationRequired, requireVerifiedDeliveryV2Pricing \} from "\.\/delivery-v2-hard-stop";/);
});

test('every exported reservation mutation entry point is guarded, including future additions', () => {
  const exportedAsyncFunctions = [...source.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_]+)/g)]
    .map(([, name]) => name);
  const mutationEntryPoints = exportedAsyncFunctions
    .filter(name => /^(create|submit|reserve|checkout)/i.test(name));

  assert.deepEqual(
    mutationEntryPoints.sort(),
    ['createCulqiReservation', 'createReservation'],
    'a new exported mutation entry point needs an explicit Delivery V2 guard and review'
  );

  for (const name of mutationEntryPoints) {
    const firstStatementIsGuard = new RegExp(
      `export\\s+async\\s+function\\s+${name}\\s*\\([^)]*\\)\\s*\\{\\s*requireVerifiedDeliveryV2Pricing\\(\\);`
    );
    assert.match(source, firstStatementIsGuard, `${name} must hard-stop before any side effect`);
  }
});

test('temporary hard stop remains unconditional until a trusted server-owned V2 quote replaces it', () => {
  assert.match(
    guardSource,
    /export function requireVerifiedDeliveryV2Pricing\(\): void\s*\{\s*throw new DeliveryV2VerificationRequired\(\);\s*\}/
  );
  assert.doesNotMatch(guardSource, /process\.env|import\.meta\.env|globalThis/);
});

/**
 * Isolated execution of the exact getReservationBatchAvailability body from
 * service.ts. Imports for the Next/Supabase service are intentionally replaced
 * with traps: the unconditional P0 gate must return before any of them run.
 * This is NOT an integration test or a production checkout certification.
 */
function availabilityWithGuard(guard) {
  const start = 'export async function getReservationBatchAvailability(): Promise<BatchAvailability> {';
  const end = '\n}\n\nexport function payloadFromFormData';
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'find actual availability function in service.ts');
  const body = source.slice(from + start.length, to);

  const failOnSideEffect = () => { throw new Error('P0: downstream operation reached'); };
  const create = new Function(
    'requireVerifiedDeliveryV2Pricing', 'DeliveryV2VerificationRequired',
    'fallbackBatchAvailability', 'getMissingReservationEnv',
    'createSupabaseAdminClient', 'readCurrentBatch',
    'getBatchCapacityUsage', 'getBatchBlockReason',
    `return async function isolatedAvailability() {${body}\n};`
  );
  return create(
    guard, DeliveryV2VerificationRequired,
    (options = {}) => ({ accepting: true, status: 'unknown', ...options }),
    failOnSideEffect, failOnSideEffect, failOnSideEffect,
    failOnSideEffect, failOnSideEffect
  );
}

test('batch availability fails closed before environment and database while delivery V2 is blocked', async () => {
  const readAvailability = availabilityWithGuard(requireVerifiedDeliveryV2Pricing);
  assert.deepEqual(await readAvailability(), { accepting: false, status: 'closed' });
});

test('batch availability does not swallow unexpected errors from the verification guard', async () => {
  const readAvailability = availabilityWithGuard(() => {
    throw new Error('unexpected pricing verification failure');
  });
  await assert.rejects(readAvailability(), /unexpected pricing verification failure/);
});
