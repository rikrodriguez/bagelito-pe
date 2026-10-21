# Validated Culqi charge confirmation

The prior coordinator persisted a successful charge as submitted and returned awaiting_webhook without directly confirming the order. This change closes that demonstrated application gap. The historical event-lookup HTTP 400 / application HTTP 500 remains unexplained.

## Evidence and transitions

The server derives money, order, checkout capability and mode from persisted state/configuration. The database claims the attempt before one charge POST. HTTP success, an ID, paid or authorization alone is insufficient: confirmation requires matching charge/source/order, integer minor units, PEN, capture=true, the full current amount, zero refunded amount and no dispute.

Only missing evidence permits one bounded authenticated GET of the same returned charge ID. Explicit contradictions cannot be overwritten by retrieval. POST and GET each enforce a ten-second headers/body budget, reject redirects and do not retry. Ordinary 3DS remains pending. REVIEW mixed with a charge identity or capture evidence stays uncertain, retains a valid known ID and cannot authorize payment or another POST.

The application persists fixed lifecycle/provenance markers instead of full provider responses. Dedicated columns retain charge/source/attempt/money bindings; the typed receipt records validated financial evidence and distinct POST/GET provenance. Card, antifraud and contact objects are not copied into this flow's metadata.

The confirmation RPC locks batch, order and attempts, rechecks capability/claim/source/charge/money/current state, and atomically writes receipt, paid state and history. Receipt uniqueness and unchanged webhook checks prevent another confirmation. A capture after reservation release becomes paid + cancelled + review required without reacquiring capacity. Existing paid fulfillment is preserved. Trusted refund/dispute/net-amount contradictions remain under review; generic uncertainty cannot clear them.

Last-slot checkout preserves its current capability/fingerprint while preparation is pending, then only until the server's original reservation/session expiry. Both checkout routes close without valid preparation or existing payment recovery. Cart changes invalidate the exception. No reload/session-recovery architecture is added.

## Provenance

The ZIP SHA-256 is 00282010ebe9837d5272b6a145f3105d2c9645db17b4b035952f1f76eee18d41; all 39 manifest entries match. Declared base 4f9dbf3f508e1d26216f6da41e794e2a1f57c1ac and change c4621ba4ecc1202a239883e1b15dac50b9497d30 were unavailable from GitHub (404; explicit Git fetch rejected).

The patch applies cleanly to reference Preview base aba57373376245f6be071ec8b168f25e0bed06f1. The absent prior ReservationFlow last-slot correction was reconstructed with behavioral regressions. This is a new candidate with its own real SHA, not either historical commit. It does not import PR #13.

## QA rollout and recovery

The only authorized remote SQL is supabase/add-culqi-charge-confirmation.sql, unchanged SHA-256 f89d6ea4838a60d316de238c867f5b97cbd8a56f8aa62259dcce44e5abd3c11f, on QA qaahskendqdkynwtylho. It adds RLS-protected receipts and a service-only confirmation RPC, and replaces finish while retaining its signature. It does not enable either recovery policy.

Before application, retain the installed finish definition, owner/ACL and core schema/trigger metadata; verify absent receipt/RPC collision and compatible core. After application, inspect actual definitions, RLS, table/column privileges, PUBLIC grants, inherited/effective execution rights and unchanged prior financial data. Direct client receipt access and anon/authenticated privileged execution are prohibited.

Deploy only after exact-head CI succeeds. Vercel documents redeploying from an existing deployment ID while inheriting settings/environment and overriding Git source; this avoids copying/configuring credentials. Verify the resulting SHA, Preview target, QA URL, sandbox gates, health and closed-batch behavior. Build/health does not prove a payment.

Application rollback must retain additive schema, financial states and receipts. The original finish definition is a recovery reference, not an automatic restore over subsequent adverse observations. Do not delete receipts, unpay orders, resend events or retry charges to undo a rollout.

## Validation and limits

Run npm test, npm run lint, npm run build and both isolated tests/run-sql-tests.sh profiles (--core-only / full) with PostgreSQL 17. CI checks the requested head and existing pinned isolated PostgreSQL image. Local SQL uses private PostgreSQL 17.11 on macOS arm64, different from Linux CI. Retain original stdout, internal/race logs, commands, exit codes, source hashes and deployment identity.

Synthetic tests exercise the actual parser/coordinator/validator, checkout lifecycle, wrong money/bindings, rejects/timeouts, persistence failures, duplicate/late webhook and concurrent SQL transactions. They do not establish merchant-account behavior, real 3DS/Yape or provider acceptance. One sandbox purchase requires separate approval of method, amount, fictitious details and before/after order/charge/capacity/duplicate checks.

Official sources: [charges](https://apidocs.culqi.com/#tag/Cargos), [capture](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/captura/), [3DS](https://docs.culqi.com/es/documentacion/culqi-3ds/flujo-con-3ds/), [database function security](https://supabase.com/docs/guides/database/functions), [Vercel redeployment inheritance](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment). Direct confirmation from fully validated capture is an architectural inference from these flows; documentation is not runtime evidence.
