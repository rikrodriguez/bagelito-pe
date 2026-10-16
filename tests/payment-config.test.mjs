import test from 'node:test';
import assert from 'node:assert/strict';
import { getPaymentConfig, getPublicPaymentConfig } from '../src/lib/payments/config.ts';

// Synthetic strings only; this suite never contacts a provider.
const names = ['PAYMENT_PROVIDER','CULQI_ENABLED','CULQI_MODE','CULQI_LIVE_APPROVED','NEXT_PUBLIC_CULQI_PUBLIC_KEY','CULQI_SECRET_KEY','NEXT_PUBLIC_CULQI_RSA_ID','NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY','VERCEL_ENV','VERCEL_URL','VERCEL_BRANCH_URL','NEXT_PUBLIC_SITE_URL'];
function config(overrides = {}) {
  for (const name of names) delete process.env[name];
  Object.assign(process.env, { NEXT_PUBLIC_SITE_URL:'http://localhost:3000', PAYMENT_PROVIDER:'culqi', CULQI_ENABLED:'true', CULQI_MODE:'sandbox', NEXT_PUBLIC_CULQI_PUBLIC_KEY:'pk_test_synthetic', CULQI_SECRET_KEY:'sk_test_synthetic', NEXT_PUBLIC_CULQI_RSA_ID:'synthetic', NEXT_PUBLIC_CULQI_RSA_PUBLIC_KEY:'synthetic', ...overrides });
  return getPaymentConfig();
}
test('sandbox mode exposes its identity to the checkout', () => {
  assert.equal(config().enabled, true);
  assert.equal(getPublicPaymentConfig().mode, 'sandbox');
  assert.equal('hasSecretKey' in getPublicPaymentConfig(), false);
});
test('missing mode fails closed even with keys configured', () => {
  assert.equal(config({CULQI_MODE:''}).enabled, false);
});
test('mismatched live/test credentials fail closed', () => {
  assert.equal(config({CULQI_SECRET_KEY:'sk_live_synthetic'}).enabled, false);
});
test('sandbox cannot run on a production deployment', () => {
  assert.equal(config({VERCEL_ENV:'production'}).enabled, false);
});
test('live mode requires explicit release approval', () => {
  assert.equal(config({CULQI_MODE:'live',NEXT_PUBLIC_CULQI_PUBLIC_KEY:'pk_live_synthetic',CULQI_SECRET_KEY:'sk_live_synthetic'}).enabled, false);
});
test('approved matching live mode can run', () => {
  const result=config({CULQI_MODE:'live',CULQI_LIVE_APPROVED:'true',NEXT_PUBLIC_CULQI_PUBLIC_KEY:'pk_live_synthetic',CULQI_SECRET_KEY:'sk_live_synthetic'});
  assert.equal(result.enabled,true);
  assert.equal(result.mode,'live');
});
test('sandbox requires explicit localhost or preview site origin', () => {
  assert.equal(config({NEXT_PUBLIC_SITE_URL:'https://bagelito.pe'}).enabled,false);
  assert.equal(config({NEXT_PUBLIC_SITE_URL:'https://www.bagelito.pe'}).enabled,false);
  assert.equal(config({NEXT_PUBLIC_SITE_URL:'https://bagelito-pe.vercel.app'}).enabled,false);
});
test('sandbox request to the public site is rejected even if configured for localhost', async () => {
  config();
  const payments = await import('../src/lib/payments/config.ts');
  assert.equal(payments.isCulqiRequestAllowed?.(new Request('https://bagelito.pe/api/payments/culqi/charge')),false);
});
test('sandbox request must match the allowed configured origin', async () => {
  config();
  const payments = await import('../src/lib/payments/config.ts');
  assert.equal(payments.isCulqiRequestAllowed?.(new Request('http://localhost:3000/api/payments/culqi/charge')),true);
  assert.equal(payments.isCulqiRequestAllowed?.(new Request('https://other.example.invalid/api/payments/culqi/charge')),false);
});

test('matching preview host enables sandbox and mismatched preview host fails closed', async () => {
  const payments = await import('../src/lib/payments/config.ts');
  assert.equal(config({VERCEL_ENV:'preview',VERCEL_URL:'review.example.invalid',NEXT_PUBLIC_SITE_URL:'https://review.example.invalid'}).enabled,true);
  assert.equal(payments.isCulqiRequestAllowed(new Request('https://review.example.invalid/api/payments/culqi/charge')),true);
  assert.equal(payments.isCulqiRequestAllowed(new Request('https://bagelito.pe/api/payments/culqi/charge')),false);
  assert.equal(config({VERCEL_ENV:'preview',VERCEL_URL:'review.example.invalid',NEXT_PUBLIC_SITE_URL:'https://different.example.invalid'}).enabled,false);
});

test('stable preview branch origin works across deployments but not another branch', async () => {
 const {isCulqiRequestAllowed}=await import('../src/lib/payments/config.ts');
 const scoped={VERCEL_ENV:'preview',VERCEL_BRANCH_URL:'sandbox-git-payments.example.invalid',NEXT_PUBLIC_SITE_URL:'https://sandbox-git-payments.example.invalid'};
 for(const VERCEL_URL of ['deploy-one.example.invalid','deploy-two.example.invalid']) {
  assert.equal(config({...scoped,VERCEL_URL}).enabled,true);
  assert.equal(isCulqiRequestAllowed(new Request(scoped.NEXT_PUBLIC_SITE_URL+'/api/webhooks/culqi')),true);
  assert.equal(isCulqiRequestAllowed(new Request('https://'+VERCEL_URL+'/api/webhooks/culqi')),false);
 }
 assert.equal(config({...scoped,VERCEL_BRANCH_URL:'other-branch.example.invalid',VERCEL_URL:'other-deployment.example.invalid'}).enabled,false);
});
test('branch URL never authorizes production, another origin or port', async () => {
 const {isCulqiRequestAllowed}=await import('../src/lib/payments/config.ts');
 const scoped={VERCEL_ENV:'preview',VERCEL_BRANCH_URL:'sandbox.example.invalid',NEXT_PUBLIC_SITE_URL:'https://sandbox.example.invalid'};
 config(scoped);
 for(const origin of ['http://sandbox.example.invalid','https://sandbox.example.invalid:444','https://sandbox.example.invalid.evil.invalid'])assert.equal(isCulqiRequestAllowed(new Request(origin+'/api/webhooks/culqi')),false);
 assert.equal(config({...scoped,VERCEL_ENV:'production'}).enabled,false);
 assert.equal(config({...scoped,VERCEL_BRANCH_URL:'bagelito.pe',NEXT_PUBLIC_SITE_URL:'https://bagelito.pe'}).enabled,false);
});
