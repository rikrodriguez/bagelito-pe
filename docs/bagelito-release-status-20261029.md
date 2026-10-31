# Bagelito: images and payment readiness — 29 October 2026

## Boundaries

This update stays in draft PR #27 (`fix/culqi-commercial-gaps-20261026`).
No merge, deployment, credentials, database migration, provider operation, real charge,
webhook replay or third-party message is part of this change. The existing branch-specific
Vercel `deploymentEnabled:false` setting is preserved. This is the original Next.js store,
not the 3D/virtual-store branch. Ricardo's latest direction is a simple online store based
on approved mockups; do not advance the 3D experience from this work.

## Verified current evidence

- Culqi commercial approval: ticket **657984**, activation confirmation received
  **29 October 02:59 UTC / 28 October 21:59 Lima**. This closes the *commercial approval*
  gate, not the payment-integration release gates.
- Current production deployment: `dpl_9un1gkBKhhjwkwXjySkajo9f2vDD`, READY,
  `main ca6f5b022864ee2164845f18c1c81f137cf0b108`.
- Production Vercel configuration still has `BAGELITO_MERCHANT_REVIEW_ONLY=true`;
  no `CULQI_SECRET_KEY` has production scope. Secret values were not requested/decrypted.
- Public `GET /` and `GET /checkout?pack=6-mixed`: HTTP 200 on 29 October.
  The homepage still claims open orders, 20/20 capacity and a 2027 closing date;
  checkout explicitly says there are no real payments. PR #27 reconciles this public copy.
- Ten home catalog images request quality 75. The representative public request
  `/_next/image?url=%2Fimages%2Fbagel-cheddar.webp&w=384&q=75`
  returned HTTP 400 `INVALID_IMAGE_OPTIMIZE_REQUEST`. The PR's existing quality allowlist
  fix is retained. Regression coverage now validates all ten images across every configured
  responsive width, and keeps unconfigured quality/width inputs rejected.
- The checkout banner no longer says activation is merely waiting for merchant approval;
  it honestly states that orders and payments remain disabled in this demo, in ES and EN.
- Runtime tests exercise both reservation POST handlers, proving review-only returns 503
  and `no-store` before request parsing, analytics, provider or database boundaries.

## Payment candidate is separate

[PR #23](https://github.com/rikrodriguez/bagelito-pe/pull/23), head
`085f3df93f9d6a2b0f92cbe8ebe8bfef475eefca`, remains draft.
Its latest evidence records a production core migration already installed, an admin secret
configured and 770 isolated tests passing. Do **not** repeat its superseded earlier instruction
to install the financial foundation blindly. Re-read current schema and migration evidence
before proposing any database operation.

The exact head's [GitHub run 40361963771](https://github.com/rikrodriguez/bagelito-pe/actions/runs/40361963771)
reports failure for application, SQL full and SQL core-only, without step records. That is
not a passing CI result and does not establish a source-code test failure. Diagnose Actions
runner/account availability before a bounded retry; do not purchase or alter billing.

## Concrete next gates, in order

1. **Public store correction:** validate and review PR #27, then obtain explicit approval
   before merge/deploy of its exact final head. After deployment, GET the ten production
   image URLs and verify home, checkout, mobile ES/EN and public contact/remedy text.
   Deployment is not performed here.
2. **Exact release candidate:** reconcile PR #23 with the final simple-store UI and current
   legal version. Run all application, native HTTP and both SQL profiles against the exact
   candidate. Do not import old 3D branches or interpret a Vercel build as full payment CI.
3. **External sandbox delivery:** prove an HTTP delivery from CulqiPanel to the intended
   sandbox webhook, correlating the genuine event, charge, order, response and persisted
   result; prove duplicate delivery is idempotent. An in-process handler invocation does
   not satisfy this gate. Any provider replay/test requires its specific authorization.
4. **Sandbox scenarios:** current candidate must cover normal card, required 3DS continuation,
   Yape, provider rejection, expired hold, late payment, duplicate events and refund/reversal.
   Preserve no-double-charge and final-slot ownership rules. No new test charge is created here.
5. **Coordinated cutover plan:** review explicit legal consent and its production trigger,
   active real batch/delivery/capacity, valid production keys/origin and webhook destination,
   plus rollback that preserves in-flight payments/status/receipts. Approval of the commerce
   does not authorize configuring keys, removing review-only or enabling live.
6. **Launch authorization:** ask for the precise production cutover only after evidence above
   is complete. Keep the demo gate on until then. Verify live behavior only under separately
   authorized parameters, with reconciliation and rollback defined beforehand.

## Business facts already provided

Do not re-request the holder name, RUC, address or approved remedy choice: the user supplied
them and PR #27 carries them. `contacto@bagelito.pe` remains the user's selected address;
its operation has not been verified. Complaints Book hosted persistence/admin access and
consumer-copy delivery remain separate checks, not proven by UI/unit tests.

## Verification of this update

- Node 24.22.1, locked dependencies installed without lifecycle scripts.
- Full current-branch suite: **70/70 PASS**, zero skips/failures.
- ESLint: PASS, no errors. Next production build and TypeScript: PASS.
- Compiled local Next server: **20/20 optimizer responses HTTP 200 with nonempty image
  content** (all ten catalog photos, quality 75, widths 384 and 1600).
- Compiled local manual and Culqi reservation POST routes: **503 + no-store** with
  review-only enabled and no Supabase/provider credentials. No external order writes.
- Independent read-only review: no blocking findings; focused tests **10/10 PASS**.
- Branch-only GitHub workflow added for tests/lint/build: immutable action SHAs, exact PR
  head checkout, read-only repository permissions, no credentials, deploy or provider calls.
  Remote outcome must be checked after push; local success is not substituted for CI.

The first dependency install hit an unwritable default npm cache; retry with a cache under
`/tmp` succeeded. No dependency or lockfile changes were necessary.
