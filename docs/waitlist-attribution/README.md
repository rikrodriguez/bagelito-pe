# Waitlist campaign attribution

Validated UTM labels from Instagram/TikTok links survive both home → waitlist and home → packs → `/reserve` → closed-batch waitlist, through the selected pack to the form, existing `waitlist_signups.source` field, admin lead row and authenticated CSV export. Existing CSV columns keep their positions; five UTM columns are appended. This extension starts at integrated candidate PR8 `afd381a083bba35eb5b88bc3c23303e9e2ec0273`, preserving its payment/operator changes. Only navigation attribution changes; payment coordination, database migrations and dependencies are untouched.

Example campaign URLs (use the intended hosting origin when released):

```
/?utm_source=instagram&utm_medium=social&utm_campaign=october&utm_content=reel-1
/?utm_source=tiktok&utm_medium=social&utm_campaign=october&utm_content=video-2
```

All home-to-waitlist entry points preserve these labels: hero, pack cards, final CTA, deadline banner and mobile sticky CTA. A selected `6-single`, `6-mixed`, `12-single` or `12-mixed` pack is preserved. Existing language selection and explicit consent remain independent of campaign attribution. Consent starts unchecked and is required by the form and backend.

The scope was explicitly expanded on 16 October 2026 to include entry into `/reserve` and its closed-batch exit. Open-batch pack links retain the validated campaign; the open deadline/final/mobile links preserve it while returning to home packs. The hero's same-page `#packs` anchor already retains the current query. A campaign arriving directly on `/reserve` also survives the closed-batch exit. No valid campaign produces exactly the previous destinations and `waitlist_page` fallback.

Attribution is URL-only and declarative, not proof of a provider-verified conversion. No attribution cookie, local/session storage, third-party tracker or new analytics event is added. Language continues to use its existing storage. A later direct visit has `waitlist_page` as its source; there is no cross-session attribution or backfill of earlier leads. This scope covers the explicit home/packs/reserve/waitlist links above; unrelated header/logo/legal/support or payment restart navigation does not gain attribution. No campaign field is added to a reservation, payment, checkout capability or provider request.

Validation:

- Only `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` and `utm_term` propagate. Other parameters, including click IDs, are discarded.
- Source is required, trimmed and lowercased. Source/medium allow at most 32 characters each; campaign/content/term allow 64 each. Labels start with an ASCII letter/digit and otherwise permit ASCII letters, digits, spaces, `.`, `_` and `-`. Use campaign slugs, never personal data or secret tokens.
- Duplicate keys or invalid labels are omitted. Invalid or duplicate source produces the direct fallback. Optional invalid fields do not discard a valid source.
- Storage uses canonical `utm:v1:` plus the URL-encoded labels in a stable key order, bounded to 384 characters. The API rejects malformed, unknown-key or noncanonical encoded sources. Existing safe legacy labels remain supported up to 80 characters; absent/empty source keeps the direct fallback.
- The existing database column is unbounded SQL `text`; no schema change is needed. Admin renders decoded fields as escaped text and handles malformed historical sources as `Unknown`.

Verification in cloud, with synthetic data only:

```
npm ci
node --test tests/*.test.mjs
npm run lint
NEXT_TELEMETRY_DISABLED=1 npm run build
```

The Node tests use the actual TypeScript source with mocked network/storage dependencies. They cover URL validation and limits, all five CTA locations, open-batch campaign and direct destinations, and the actual closed `ReservationFlow` after restoring an empty synthetic recovery store. The complete flow exercises the waitlist page/form, explicit consent, actual service persistence into an in-memory transport, administrative query, source component and authenticated CSV. It covers Instagram/TikTok, no campaign, invalid/duplicate source, invalid/duplicate optional fields, private unknown parameters, all four packs, catalog fallback and es/en. Payment review/3DS/expiry tests remain in the full `npm test` regression.

For browser checks, use installed Python Playwright and `/usr/bin/chromium`. Start the built app with an empty environment except PATH/NODE_ENV/telemetry setting, bound to localhost:

```
env -i PATH="$PATH" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3107
python tests/browser-waitlist-attribution.py
# Optional extended journey; writes screenshots only to the chosen local directory:
python tests/browser-waitlist-attribution.py --via-reserve --output-dir /tmp/bagelito-reserve-attribution-screenshots
```

The browser runner blocks every external request and intercepts every waitlist POST with a synthetic response. Each mode has six scenarios (Instagram/TikTok/direct × desktop/mobile). The extended mode supplies synthetic batch responses, enters `/reserve` from an open home, reloads the existing URL after closing only the browser fixture, and follows the actual closed-batch link. It checks private query fields are discarded, pack/language/consent survive, and renders the submitted source in the actual admin attribution component. No reservation/payment POST or real lead is allowed. The admin screenshots are explicitly labeled local synthetic fixtures, not live admin sessions. No session cookies are exported.

Screenshots:

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Home | [Screenshot](screenshots/home-desktop.png) | [Screenshot](screenshots/home-mobile.png) |
| Waitlist form | [Screenshot](screenshots/waitlist-desktop.png) | [Screenshot](screenshots/waitlist-mobile.png) |
| Source component fixture | [Screenshot](screenshots/admin-sources-desktop.png) | [Screenshot](screenshots/admin-sources-mobile.png) |

The branch-specific `vercel.json` retains all prior exclusions and disables automatic deployment of `fix/waitlist-reserve-attribution-20261016` before publication, using Vercel's documented [git.deploymentEnabled](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled). The extension targets PR8's branch in a separate draft PR, without merging or changing PR8. Integrated CI checks the exact head and runs the full Node suite, lint/build, native HTTP checks, restored operator journey and both isolated SQL profiles with read-only GitHub permissions and no app credentials or deployment step. The browser scenarios are separately run locally. Publishing this draft PR does not authorize a merge, deployment, real payment or live activation; unresolved Culqi webhook/provider and production-release gates remain separate.
