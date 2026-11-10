import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {DeliveryV2VerificationRequired,requireVerifiedDeliveryV2Pricing} from './delivery-v2-hard-stop.ts';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'service.ts'), 'utf8');

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
  assert.match(source, /import \{ requireVerifiedDeliveryV2Pricing \} from "\.\/delivery-v2-hard-stop";/);
});
