# Local regression, security review and real-browser evidence

Application tested: remote `84425e3a09ab9a8f27d63af219d50b4d34e789ca`, tree `8459ffc1fc3ae8d844daa9d0e3deaaf20fc1273e`, local equivalent `9050a330e955fd552bf1c16494aad4b83ecc2368`. No application changes were made for these results.

| Check | Result | Boundary |
|---|---|---|
| Top-level Node suite | **255/255 PASS, exit 0, zero skips** | Actual modules/HTTP handler/config/client parser with injected DB/rate-limit doubles; no processor |
| Original endpoint regression on predecessor | **9 PASS / 17 FAIL**, 26 cases | First 26 case harness archived; later 27th deadline case not claimed as RED |
| TypeScript scoped to service/config/contracts | **PASS, exit 0**, heap320 | Excludes route/global router augmentation; not a substitute for full typecheck |
| Original local full TypeScript attempt | **SIGKILL**, no diagnostic | Not retried under unchanged conditions; independent cloud full checks reported separately |
| Actual Chrome and ReactDOM | **10/10 PASS** | Permanently mocked fetch/SDK/3DS; memory storage; no real backend |

Node includes **27 new endpoint/contract cases** plus the preceding 228. The 36 SQL cases and cloud build checks are separate counts; no totals are added together. An initial experimental narrow config included the route without generated global router augmentation, producing TS2345/TS2353/TS7031; that incomplete-context log is retained. The final scoped check intentionally excluded the route, without changing application code or compiler strictness. The independent full-project typecheck is authoritative for the route. Independent cloud typecheck/build results are in this directory's README and logs.

## What was exercised

The HTTP tests execute the actual route and injected service. The response is consumed by the actual client receipt parser. They verify default-closed/exact flag semantics; no live/production disclosure; same-origin and rate-limit rejection before DB access; both halves of the capability; bounded JSON; untrusted payload fields; legacy missing detail; v4 disclosure; all payment states; integer money; snapshot identity/integrity; sanitized transport failure without retry; final identity/refund/cancellation/reconciliation checks; allowlisted product projection; every confirmed pot size/flavor and supported pack quantity/mix; and rejection of malformed or ambiguous public detail.

A real timer test leaves a mocked snapshot transport unsettled despite abort: the request fails generically after roughly 2 s with no next operation or retry. A simulated clock verifies the shared 5 s database budget and rejects even a final response arriving after its deadline before the timer callback runs. These do not prove cancellation or rollback of a real database transaction. The existing rate limiter remains outside that database budget.

The predecessor RED run used the exact source tree from remote `e85c984d079b3f5f4bb62a76affbba4a00764d68` (local `e4952eb8f7bda447dd45dac4afaa077d0aede96e`). The archived RED harness SHA-256 is `6780c0f9d873f2ac850f4f937776d15ab151e795e2b8855ce5368373bd913d1e`. Logs normalize checkout/fixture path prefixes and trailing whitespace; they retain individual failures and case counts.

## Browser fixture

A separate private static fixture bundled the unchanged real `CulqiBrowserCheckout` and `PaidOrderReceiptDetails` with ReactDOM. The visible **Run isolated QA** button started all 10 cases. Results were read from the actual Chrome accessibility tree and the screenshot was visually inspected at 2026-11-02 15:40 UTC. No screenshot file is included; the observed AX result and exact fixture source/hash record are retained.

The two new browser cases reject a corrupt minimized `productReceipt` and recover the valid minimized wire shape without a raw snapshot or private fields. Final rendered detail showed **6 × Sesame**, **1 × Whipped Original · 120 g**, products **S/62**, delivery **S/8**, total **S/70**, and the non-fiscal/no-dispatch disclaimer. The current editable fixture cart contained Plain and did not replace the recovered products. The amounts and identities are test data, not a sale or price approval.

Fetch was intercepted for the entire page lifetime, SDK/3DS constructors were inert mocks, and localStorage was replaced by a fresh memory map before mounting (no actual recovery read or removal). Empty ready-marker scripts had no external sources. Both server and page CSP denied connections, frames, images and forms. The fixture is an archive of a test, not a production route or checkout demo. It does not test actual HTTP/Supabase transport, Culqi callbacks, network authorization, production styling or responsive storefront fidelity.

Private Sites preview was stopped before the test and stopped afterward. Only the owned QA tab was closed; existing tabs and the published site were untouched.

## Security review and outstanding limits

An independent source review found no blocking issue in the closed sandbox scope. It identified accumulation of five separate deadlines; that was corrected to a shared 5 s service budget and post-await expiry verification before the final candidate. It confirmed server-derived identity, AND capability checks, minimal projection, generic errors, no retries and false fiscal/dispatch flags.

Remaining boundaries are explicit: the existing UUID+code is bearer possession, not a user login and not protection against stolen localStorage/XSS; proxy header trust and the existing rate limiter's own timeout need separate review; multiple observations are not an atomic transaction. Real Culqi/3DS/webhook/refund acceptance, native PG concurrency, production activation, fiscal receipt generation and fulfillment authorization remain unverified/unenabled. No prices, SQL policy, payment configuration, credentials, deployment or merge changed.

## Local commands

```sh
NODE_OPTIONS='--max-old-space-size=320 --max-semi-space-size=4' \
  QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr \
  node --test --test-concurrency=1 tests/*.test.cjs
node --max-old-space-size=320 --max-semi-space-size=4 \
  node_modules/typescript/bin/tsc --noEmit --project <isolated-fixture>/tsconfig-scoped.json
```
