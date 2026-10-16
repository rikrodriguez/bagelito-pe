# Expired reservation: recheck before retrying checkout

Base: PR10 `b86bc62a129a3bbcfb70844b4eb5e7a995a7e09a`, which already contains completed PR9 `8015614875aa8bce787f849b8d0cce9ed018795e`. The separate branch `fix/checkout-expired-retry-20261016` preserves both heads and disables its own automatic deployment before publication. No merge, deployment, account access or provider transaction is performed.

## Existing behavior retained

The original idle-expiry case is already implemented in `80233bc`: it closes Culqi, removes the embed and shows the expiry notice. Token/device/3DS, focus/pageshow/visibility, late-response and unresolved-payment guards are already tested. The existing checkout component suite passes 60 cases before this change. This patch does not duplicate that implementation or change late-payment settlement, SQL capacity or durable recovery.

## Reproduced gap

1. A synthetic reservation is prepared with a fixed expiry; the embedded SDK opens.
2. A pre-charge SDK error exposes the existing retry button. No token/charge has been submitted.
3. The clock reaches expiry while the browser timer is delayed; no focus/visibility callback runs.
4. Clicking Retry checked only the cached expired flag, not the actual clock, before preparing again. Two new es/en regressions show an extra reservation request and another token-session preparation on the same expired capability. Server-side expiry validation still prevents charging; this does not prove an extra persisted hold or an oversell.

`initializeCheckout` now checks the existing `checkReservationExpiry()` guard before any preparation. It takes the same established expired-state path: clear the timer, close/disable the SDK callback, remove the embed, show the localized expiry alert and offer explicit navigation to start another reservation. Repeated stale retry/token callbacks cause no requests. No automatic reservation renewal or capacity mutation is introduced.

A retry immediately before expiry remains available, reuses the same checkout capability and retains the original deadline. It cannot extend that deadline through repeated preparation. If payment/3DS is already unresolved, the existing review lock and status recovery remain authoritative; expiry does not create a fresh-payment option or release capacity by itself.

## Local verification

```bash
npm ci
node --test tests/payments/checkout-review.test.mjs
npm test
npm run lint
NEXT_TELEMETRY_DISABLED=1 npm run build
```

The new component regressions run actual ReservationFlow and CulqiCheckoutButton callbacks with deterministic clocks, a synthetic SDK and in-memory browser/network fixtures. They count reservation/order/charge/status requests, verify localized notices and restart/retry visibility, preserve recovery and test the deadline boundary. No real SDK, bank, charge or hosted reservation is invoked. Existing full SQL profiles and native HTTP/restore/operator checks remain in exact-head CI to cover capacity, late payment, idempotency and settlement independently.

Publishing the draft is code review only. A separately approved deployment and hosted smoke check are still needed to make the change visible in Preview. The unresolved real webhook HTTP400 and provider/release certification gates documented in [the confirmation checkpoint](culqi-webhook-confirmation-checkpoint.md) remain separate; this fix needs no CulqiPanel access and does not claim to resolve them.
