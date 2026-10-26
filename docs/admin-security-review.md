# Admin access hardening — local proposal

Base commit: `8d925ee5bb2a09499b8a951b10e9321d7165c551`. No remote writes, migrations, environment changes or deployment performed for this patch.

## Protection

- All admin login attempts, including successful attempts, consume a persistent budget before password comparison or cookie issuance: 5 per platform IP per 15 minutes, then 20 globally per 15 minutes. A blocked IP does not consume global budget.
- Only runtime `VERCEL=1` permits trusting `x-vercel-forwarded-for`, based on the documented Vercel edge boundary. Other forwarding headers, lists, invalid/missing addresses and client-supplied platform markers cannot select buckets. Outside Vercel requests share a fallback bucket. IPv6 spellings are canonicalized; the global cap covers address rotation.
- Uses existing `consume_api_rate_limit`; missing RPC, database errors, duplicate-insert race or malformed response all deny login. No schema change. RPC privileges remain service-role only.
- `ADMIN_PASSWORD` must contain 16–1024 characters. This length rule does not prove entropy: choose a unique randomly generated password or strong passphrase.
- `ADMIN_SESSION_SECRET` is a separate 32–1024-character random server secret and cannot equal the password. User enters it directly into the hosting settings, restricted to the intended branch; never chat, code or logs. Missing/weak configuration blocks admin, including existing cookies.
- Replaces the old password-derived cookie, which permitted password guessing outside the login limiter. New sessions sign a random nonce, issued time and eight-hour expiry with an independent secret. Verification uses constant-time comparison. Password/secret rotation and a different configured site audience invalidate sessions. Old cookies require a new login.
- Login Origin must exactly match the configured canonical `NEXT_PUBLIC_SITE_URL`; forwarded host is never used as the expected audience. Keep Next.js Server Actions' default Origin/Host validation; do not add broad `allowedOrigins`.
- Cookie remains host-only, HttpOnly, SameSite=Lax, Path=/admin, Secure on deployed NODE_ENV=production, eight-hour browser lifetime. Server independently enforces expiry.

## Risks and limits

The global ceiling can temporarily block the legitimate admin during a distributed attack. Automatic recovery occurs after the fixed 15-minute window; do not disable limiting as a workaround. Shared proxy IPs also share their budget. The existing limiter can reject concurrent first inserts, safely denying extra requests. New sessions are not individually revocable server-side: logout removes the browser cookie; a stolen token remains usable until expiry or password/secret rotation. There is no MFA. This is a focused hardening step, not a complete security audit.

The app trusts Vercel's deployment boundary, not arbitrary proxy headers on a VPS. A future non-Vercel reverse proxy requires a separately reviewed trust configuration; default is shared limiting.

## Validation

76 unit/route-fixture tests including IP spoofing, IPv6 normalization, missing/error/malformed RPCs, failed/blocked/recovered attempts, ordering, weak configuration, legacy and adulterated cookies, expiry, key/password rotation, audience isolation, CSRF and cookie flags. PostgreSQL 17 isolated fixtures cover persistent 5/20 budgets, window recovery, role restrictions and concurrent last-slot admission. Existing payment fixtures run too. Build/lint/types reported separately in supplied logs.

Before public sandbox access: approve publication, user securely supplies the new independent session secret and verifies a strong admin password in branch-only Preview; deploy approved patch; verify anonymous admin/actions/exports/proofs are denied, successful login, failed-attempt limit, recovery and expiration against that deployment. No real user data or live payments.

## Primary sources

- https://vercel.com/docs/headers/request-headers
- https://nextjs.org/docs/15/app/guides/data-security
