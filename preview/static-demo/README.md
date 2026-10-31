# Bagelito — isolated static store demonstration

This is a separate demonstration variant based on PR43 source
`97b4ae91798ab82b1b379000ba3be9b8b8495b45`. It is not that application's
deployment and does not modify `bagelito.pe`, PR43, or its financial routes.

The downloadable deliverable is `dist/index.html`. It contains its own CSS,
catalog data, original embedded image bytes, and two hash-authorized inline
scripts. It needs no server, package installation, secret, database or external
resource to run in a browser that permits local HTML scripts.

## What is preserved

- The actual PR43 homepage components are rendered to static HTML in ES/EN,
  retaining their branding, layout and approved public copy.
- The four packs, ten flavors, photos, localized names, quantities, prices,
  district fees and existing extra-pack calculation come from the source.
- The local checkout uses the existing layout classes and catalog assets. Pack,
  flavor, quantity, district and extra-pack choices change only in browser memory.

## Deliberate differences from PR43

- A permanent demonstration label identifies the variant. Availability/customer
  state is synthetic. Do not enter real personal information.
- The checkout interaction is a separate local simulator. It never imports the
  real reservation, session, charge, status or webhook handlers.
- Its final action explicitly says that no order or payment was created. There
  is no confirmed-order/payment screen, banking input, provider SDK or proof.
- Contact, waitlist, complaints, legal navigation and other external destinations
  are disabled and show a local explanation. No form submits anywhere.
- Telemetry and browser persistence are absent. Language and selections reset
  when the document is reopened; no cookie, storage, service worker or backend
  is used. Decorative motion is frozen rather than driven by Framer Motion.

## Safety boundary

The artifact is one static HTML file, not a Next/Vercel build. The generator does
not include `.next`, environment files, server imports/functions or credentials.
Only original public assets and literal/public source data are embedded.

Its CSP denies connections, forms, frames, workers, objects and base URLs. Images
are data URIs; executable scripts must match the exact embedded SHA256 hashes.
There are no external scripts, fonts, stylesheets, payment or analytics SDKs.

The download does not create a website, hosting plan, production alias, runtime
environment or new permissions. Any later hosted publication requires a
separate verified static-only path within the user's no-cost/access constraints.

## Reproduce and check

From this checkout with its existing PR43 development dependencies:

```sh
node preview/static-demo/build.mjs
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --test preview/static-demo/test.mjs
```

The generator verifies that `src/` and `public/` still match the pinned source.
The browser tests use their own loopback static fixture, reject writes and
external requests, inspect the actual artifact/CSP, compare embedded assets and
catalog values, and exercise the memory-only journeys in ES/EN and mobile/desktop.

The managed Chromium environment may block `file://` navigation administratively;
do not disable that policy. A local HTTP test is not evidence that the same
managed environment permits opening files or that a chat viewer executes HTML.
No production, real-provider or real-database behavior is asserted.
