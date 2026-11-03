# Final Node verification — 2 November 2026

**319/319 PASS**, zero failures, cancellations or skips, on checkout
`dc75a0e9dda5b5989470af56ea578b01ae4b8368`. Its application/test bytes match
verified code `0e3f5be2778f3892661d4260fecc37f740604ce5`; the intervening commit
contains independent evidence only. This closes the HDR-dependent Node gap in
[the independent report](../product-checkout-independent-20261102/README.md).

The exact approved fixture SHA256 was checked before running the complete serial
Node suite. Invocation, source tree, runtime, counts and log hashes are recorded
in `results.json`; the actual terminal output is in `node-full.log`. The log has
ANSI removed and its final newline normalized; no result or failure is omitted.
319 cases = prior 285 + 14 session + 12 payment gate + 5 sandbox contact/render +
3 entry availability cases. SQL suites are separate, not double-counted here.

Also verified all 40 files in the independent evidence SHA256/length manifest
and source equality for the protected public pages/reference UI, catalog, SQL,
provider/coordinator/status and deployment configuration against `f4283fd`.
Source/test/template `git diff --check` passes. Independent raw evidence remains
unaltered (including build ANSI/trailing whitespace and patch context spaces).

Combined with the independent execution: route/service/SQL **7/7**, existing
product SQL **36/36**, TypeScript/full build **PASS**, closed-state HTTP smoke
**12 responses PASS** and **zero outgoing connection attempts**. Eight client
bundles were checked for private markers. See that report for commands, provenance,
failed earlier attempts, output hashes and limitations; none are erased.

This verifies draft code, not a real sale. No production, payment, schema, secret,
provider, fulfillment or CRM configuration was changed. Public storefront remains
review-only; the separate sandbox lane and SQL policy remain default-off. Real
isolated configuration and Culqi/3DS/Yape/webhook acceptance, stock by pot variant,
unconfirmed product prices and release authorization remain outstanding.
