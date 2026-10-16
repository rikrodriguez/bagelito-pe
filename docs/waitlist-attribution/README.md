# Waitlist campaign attribution

Home waitlist links now retain validated UTM labels from Instagram/TikTok links through the selected pack to the form, existing `waitlist_signups.source` field, admin lead row and authenticated CSV export. Existing CSV columns keep their positions; five UTM columns are appended. This branch is based on main and contains no payment/reservation implementation changes, database migrations or dependency changes.

Example campaign URLs (use the intended hosting origin when released):

```
/?utm_source=instagram&utm_medium=social&utm_campaign=october&utm_content=reel-1
/?utm_source=tiktok&utm_medium=social&utm_campaign=october&utm_content=video-2
```

All home-to-waitlist entry points preserve these labels: hero, pack cards, final CTA, deadline banner and mobile sticky CTA. A selected `6-single`, `6-mixed`, `12-single` or `12-mixed` pack is preserved. Existing language selection and explicit consent remain independent of campaign attribution. Consent starts unchecked and is required by the form and backend.

Attribution is URL-only and declarative, not proof of a provider-verified conversion. No attribution cookie, local/session storage, third-party tracker or new analytics event is added. Language continues to use its existing storage. A later direct visit has `waitlist_page` as its source; there is no cross-session attribution or backfill of earlier leads. Campaign links must target home or waitlist directly; unrelated navigation does not retain campaign labels.

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

The Node tests use the actual TypeScript source with mocked network/storage dependencies. They cover URL validation and limits, all five CTA locations, open-batch destination preservation, form pack/language/consent, simulated service persistence, admin labels, CSV column compatibility and authentication before reads.

For browser checks, use installed Python Playwright and `/usr/bin/chromium`. Start the built app with an empty environment except PATH/NODE_ENV/telemetry setting, bound to localhost:

```
env -i PATH="$PATH" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3107
python tests/browser-waitlist-attribution.py
```

The browser runner blocks every external request and intercepts every waitlist POST with a synthetic response. Six scenarios (Instagram/TikTok/direct × desktop/mobile) check navigation, selected pack, persisted language and explicit consent; no real lead is inserted. The admin screenshots show the actual source component and app CSS in an explicitly labeled local synthetic fixture, not a live authenticated admin session. No session cookies are exported.

Screenshots:

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Home | [Screenshot](screenshots/home-desktop.png) | [Screenshot](screenshots/home-mobile.png) |
| Waitlist form | [Screenshot](screenshots/waitlist-desktop.png) | [Screenshot](screenshots/waitlist-mobile.png) |
| Source component fixture | [Screenshot](screenshots/admin-sources-desktop.png) | [Screenshot](screenshots/admin-sources-mobile.png) |

The branch-specific `vercel.json` disables automatic deployment of `fix/waitlist-campaign-attribution-20261016` before publication, using Vercel's documented [git.deploymentEnabled](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled). CI checks out the exact requested head and runs tests, lint and build with read-only GitHub permissions and no app credentials or deployment step. Publishing this draft PR does not authorize a merge or deployment.
