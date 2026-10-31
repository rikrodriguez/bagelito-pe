# Store to checkout selection — 31 October 2026

This is a stacked draft on PR #27, commit
`506a54c15ed44272ef68dee923df52c1afcca3c1`. It stays in the existing Next.js
store and keeps its catalog prices. It does not import the 3D store or the
separate financial release candidate from PR #23.

## Reproduced defects

- Every flavor card linked to the same `6-single` checkout without its flavor.
  Clicking Cheddar therefore opened an empty flavor selection.
- Clicking the checkout header from a single-flavor checkout changed the URL to
  `pack=6-mixed` while the component retained the old single-flavor cart.
- Clicking the already selected pack erased the chosen flavor.
- Fifteen synchronous plus clicks on a six-bagel mixed pack produced
  **15 / 6 selected**. The increment updater used the total from its earlier render,
  ignoring already queued changes. Both desktop EN and mobile ES browser regressions
  failed with `15 !== 6` before the correction.

## Resulting behavior

Flavor cards carry their own catalog slug to checkout. Both `/checkout` and
`/reserve` accept a single scalar flavor slug only for a valid single-flavor pack.
Unknown, repeated or incompatible parameters cannot preselect an arbitrary item.
The catalog remains the source of pack prices, quantities and flavor identities.

The flow's React identity follows the validated URL selection, so a real change
of pack/flavor URL also changes the cart. Selecting the same pack preserves the
current selection; selecting a different pack retains the existing resets.
Mixed flavor increments calculate capacity from the current updater state, so
queued changes cannot exceed the selected pack size or create negative counts.

## Local verification

Verified with Node 24.19.0: **93/93 Node tests PASS**, ESLint PASS,
Next production build/TypeScript PASS, and **6/6 Chromium scenarios PASS**
against the compiled local server. The test suite includes the existing
review-only API guards; browser runs observed zero writes and zero runtime errors.
An independent read-only review found no blocking issue.

Use locked dependencies without install scripts:

```sh
npm ci --ignore-scripts --cache /tmp/bagelito-npm-cache
node --test tests/*.test.mjs
npm run lint
BAGELITO_MERCHANT_REVIEW_ONLY=true NEXT_TELEMETRY_DISABLED=1 npm run build
```

For the actual browser flow, start the compiled server without database or
provider credentials in one terminal:

```sh
BAGELITO_MERCHANT_REVIEW_ONLY=true NEXT_TELEMETRY_DISABLED=1 npm run start -- --hostname 127.0.0.1 --port 3108
```

Then use an existing local Chromium installation:

```sh
BAGELITO_TEST_URL=http://127.0.0.1:3108 CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:checkout-browser
```

`playwright-core` is pinned as a development dependency; no browser download or
provider transaction occurs during install. The browser suite only accepts a
loopback URL, aborts external requests and non-GET/HEAD requests, uses synthetic
contact details, and checks that editing produces no writes or runtime errors.
It covers EN desktop and ES mobile: all ten flavor links, repeated pack/flavor
clicks, back/edit, pack changes, delivery totals, add/remove extra pack, query
navigation, browser Back/Forward and invalid/repeated URL parameters.

## Publication boundaries

`vercel.json` disables automatic deployment for
`fix/catalog-checkout-consistency-20261031` before publication. This draft targets
the PR #27 branch, so its diff contains only this follow-up. Neither PR is merged
or deployed by this work.

GitHub Actions is still blocked by the account billing issue documented in PR #27
([run 40902536697](https://github.com/rikrodriguez/bagelito-pe/actions/runs/40902536697)).
No job is retried, billing setting changed or CI pass claimed. The existing
branch-scoped workflow is unchanged. Local checks do not substitute for remote CI.

Payments stay review-only. No Supabase migration, remote data write, credential
change, provider call, test charge, webhook replay, production cutover or
third-party message is performed. These browser tests do not verify real payments,
the external Culqi webhook, Yape/3DS, or production delivery availability.
