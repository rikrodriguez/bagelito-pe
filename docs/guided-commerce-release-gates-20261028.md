# Bagelito Guided Commerce — Release Gates

Branch: `feat/guided-playable-commerce-v1-20261028`

This document is intentionally fail-closed. Passing a visual QA does not authorize payments.

## Culqi merchant activation — confirmation received 2026-10-28

The merchant shared a confirmation email headed **“Comercio activado”**, stating that Culqi successfully activated their online merchant account. **Merchant onboarding approval is no longer pending.**

This is NOT proof that payment processing is configured, that checkout/3DS/webhooks are tested, or that the TanStack branch is safe for live charges. The commercial-approval milestone and production charge authorization are separate controls.

### Action sequence after merchant approval

1. In the approved CulqiPanel, retrieve the **test** public/private keys and RSA ID/public key under Desarrollo → API Keys / RSA Keys. Never share private keys in chat or commit them to Git.
2. Put test secrets in the dedicated **preview/test** Vercel environment for this branch (not production), using the matching keys and the exact preview site origin; keep live production intake disabled.
3. Verify actual server-side reservation, card/Yape tokenization, 3D Secure, webhook lookup, charge confirmation, failure and duplicate retry handling, and refund reconciliation using Culqi's **integration** environment.
4. Complete and verify the approved checkout policy/migration with affirmative legal acceptance, plus a real delivery date/batch and commercial price rules.
5. Set production `CULQI_PUBLIC_KEY`, `CULQI_SECRET_KEY`, `CULQI_RSA_ID`, `CULQI_RSA_PUBLIC_KEY`, `PAYMENT_PROVIDER=culqi`, `CULQI_MODE=live`, and exact `PUBLIC_SITE_URL=https://bagelito.pe` using protected Vercel settings only. Keep `BAGELITO_MERCHANT_REVIEW_ONLY=true` and `CULQI_ENABLED=false` until end-to-end acceptance.
6. Only after production environment verification, enable the audited TanStack bridge/webhook/client readiness flags and deliberately lift the merchant-review kill switch during a controlled live release. Live approval should never be inferred merely from the merchant-activation email.

Verified deployment configuration at this checkpoint (keys only, no values): this branch's Vercel preview contains `BAGELITO_VISUAL_QA_ENABLED`, `BAGELITO_MERCHANT_REVIEW_ONLY`, `CULQI_ENABLED`, `PAYMENT_PROVIDER`. The branch-specific test and live Culqi API/RSA credentials are **not configured there yet**. Production still has `BAGELITO_MERCHANT_REVIEW_ONLY` and no evidenced complete Culqi credential set.

Useful official docs:
- https://docs.culqi.com/es/documentacion/pagos-online/llaves
- https://docs.culqi.com/es/documentacion/pagos-online/llaves_rsa
- https://docs.culqi.com/es/documentacion/checkout/checkout-custom
- https://docs.culqi.com/es/documentacion/pagos-online/webhooks/

## Current release state

- Primary Vercel project: `bagelito-pe`
- Duplicate preview project `bagelito-playable-v1`: preview deployments disabled
- Visual QA branch: enabled with `BAGELITO_VISUAL_QA_ENABLED=true`
- Merchant review kill switch: `BAGELITO_MERCHANT_REVIEW_ONLY=true`
- Culqi intake on this branch: `CULQI_ENABLED=false`
- Reconciliation/status is intentionally designed to remain available after intake is closed, once the provider environment is configured.
- Production legal-evidence migration: NOT applied
- Current production review batch: NOT checkout-ready while `delivery_date` is null

## Required gates before any real charge

All gates below must be true at the same time:

1. **Build**
   - `npm run build` passes on the exact release commit.
   - Generated `src/routeTree.gen.ts` is current.
   - No duplicate Vercel project is consuming the same branch build.

2. **Commercial truth**
   - Batch has a real delivery date.
   - Pack pricing rules are approved.
   - Any premium-flavor surcharge rule is explicit.
   - Minis, combos, standalone schmears and cross-sells remain blocked unless their persistence + pricing rules are approved.

3. **Legal**
   - `/legal` is reviewed.
   - `CHECKOUT_LEGAL_VERSION` matches the published policy.
   - Apply `supabase/add-checkout-legal-evidence.sql` only after the reviewed checkout UI requires an affirmative customer checkbox.
   - Verify new orders persist `checkout_legal_version` and `checkout_legal_accepted_at`.

4. **Database**
   - Required RPCs exist and remain service-role only:
     - `create_culqi_reservation_order`
     - `prepare_culqi_token_session`
     - `claim_culqi_charge`
     - `finish_culqi_charge`
     - `confirm_culqi_charge_result`
     - `expire_culqi_token_session`
     - `apply_culqi_payment_event`
     - `consume_api_rate_limit`
   - Checkout session, provider order and provider charge unique indexes remain enabled.

5. **Culqi server**
   - `PAYMENT_PROVIDER=culqi`
   - `CULQI_ENABLED=true`
   - `CULQI_MODE=sandbox` for test, then `live` only after approval.
   - Public and secret keys are from the same environment.
   - RSA ID + RSA public key are configured.
   - `PUBLIC_SITE_URL` or `NEXT_PUBLIC_SITE_URL` equals the exact allowed checkout origin.
   - `CULQI_TANSTACK_BRIDGE_READY=true`

6. **Webhook**
   - Endpoint: `/api/webhooks/culqi`
   - Configure the final URL in CulqiPanel.
   - The endpoint must re-fetch the event from Culqi; the inbound body is never accepted as payment evidence.
   - Confirm a sandbox event commits through `apply_culqi_payment_event`.
   - Only then set `CULQI_TANSTACK_WEBHOOK_READY=true`.

7. **Browser checkout**
   - Custom Checkout loads from `https://js.culqi.com/checkout-js`.
   - Culqi3DS loads from `https://3ds.culqi.com`.
   - Device fingerprint is generated for card tokens.
   - The exact same token + device fingerprint are reused after 3DS.
   - A payment is never considered successful from browser state alone.
   - `/api/payments/culqi/status` must report persisted `paid` before moving to receipt.
   - Only then set `CULQI_TANSTACK_CLIENT_READY=true`.

8. **Final safety**
   - Keep `BAGELITO_MERCHANT_REVIEW_ONLY=true` during visual QA and all non-transactional review.
   - For an intentionally approved isolated sandbox transaction, review-only may be disabled **only on that sandbox preview branch** while production stays locked.
   - Turning `CULQI_ENABLED=false` must stop new payment intake without disabling webhook/status reconciliation for already-started payments.
   - For live activation, remove/disable production review-only only after every gate above passes.
   - Production `CULQI_LIVE_APPROVED=true` is the final live-mode gate.

## Visual QA

Use `?qa=1` only on the branch preview. This bypass is visual-only and is disabled in production.

Audit each scene:
1. Entrance
2. Selector
3. Packs size
4. Packs quantity
5. Combos
6. Bagels
7. Schmears
8. Cashier
9. Payment
10. Receipt
11. Wallet
12. Handoff
13. Goodbye / returning customer

The current entrance and goodbye storyboard images contain obsolete baked-in UI/avatar content and require replacement masters before visual sign-off.
