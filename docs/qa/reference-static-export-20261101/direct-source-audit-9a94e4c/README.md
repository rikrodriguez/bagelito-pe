# Final direct-entry static export: source, CSP, inventory and HTTP audit

**PASS for the checks below.** Application source:
`9a94e4cfc5a043726f643d3a9c546f096007bd94`; exporter:
`281b85d6bf80eb9f564af987a1fd21b8fbcd1318`. The isolated export is
`/tmp/bagelito-reference-static-direct-9a94e4c`, captured from the immutable
candidate at `http://127.0.0.1:3218`. This audit used the static server at
`http://127.0.0.1:3216`. It ran no browser or build and changed no application,
configuration, provider, hosting, or credential.

## File and source integrity

- All 82 manifest entries match their SHA256 and size; 83 files exist when the
  manifest itself is included. No extra or missing paths were found.
- All 79 copied public assets match
  `/tmp/bagelito-reference-direct-candidate-v3-3218/public` byte for byte,
  including all six JavaScript and both CSS files. The other three manifest
  entries are the exported HTML pages.
- No symlinks, special files, server/API/env/database files, Node runtime,
  package files, or node_modules were included. Serving these files does not
  require the build's Nitro server.
- The approved WebP is unchanged across source, build, export, and manifest:
  `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`.
  This verifies the local WebP, not byte identity with a separate parent JPEG.
- Compared with `d43cc5f77df6ccea7161ecb190d91631108f9d02`, only
  `ReferenceScene.tsx` and `reference-storefront.css` change in `src/` or
  `public/`. The other 125 tracked source/public files match the base,
  application commit, and current checkout. Catalog, prices, GuidedCommerce,
  checkout controllers/routes, customer inputs, and consent fields are included.

Final presentation SHA256 values:

| File | SHA256 |
| --- | --- |
| ReferenceScene.tsx | `723ca7bad1c9cbf466fb0c8ef60145f79c9df727d29d2a9a3fc92928c8be9d93` |
| reference-storefront.css | `10877671b42927f6ad1bbb855ee7b769ffa9fddb41b4419739832d2986d0f160` |

`Props` and the four callback expressions remain unchanged. One category map
renders the same three IDs (`packs`, `combos`, `schmears`); one step map renders
the same five indexed steps. Menu and cart each retain one button. Alternate
step-label spans share the same button and are hidden by the relevant media
rules. The image crops are hidden by default and enabled only at <=800px;
desktop retains the full approved image. The image-enlargement state/button is
removed. All image href values remain the same root-relative local WebP.

The compiled CSS contains all five checked final signatures: category title
16px, category description 12px, cashier line names 13px, full-width wrapping
bagel names 14px, and 72px bagel images. Property order was normalized for this
check. These are compiled rule checks; browser computed styles and pixels are
covered by separate QA evidence.

## HTML and CSP

All three HTML files match the manifest. Each CSP is the first node in head,
before resources and scripts. Each page has two inline script hashes; both
match the actual script bytes and the manifest. Script policy permits only
self plus those hashes, with no script unsafe-inline or unsafe-eval. The
connect, form-action, frame, object, worker, base-uri, script-src-attr and
default directives remain none. Images permit self/data, including the new
same-origin SVG image references. Existing style unsafe-inline remains for
the original hotspot style attributes; no CSP permission was expanded.

Removing only the added CSP and referrer meta nodes reconstructs each captured
SSR source HTML SHA256, 3/3. Original markup, script references and hydration
payload are retained. All pages remain noindex. Store pages remain review-only
with no canvas element in their HTML. The export can retain dormant payment,
API, and WhatsApp code strings through existing imports; this audit does not
claim those strings are absent or that the source has been rewritten as a new
checkout implementation.

## Static loopback GET results

| Requested path | Result | Evidence |
| --- | --- | --- |
| / | 200 | Body equals exported index.html |
| /legal | 301 to /legal/, then 200 | Body equals exported legal/index.html |
| /playable | 301 to /playable/, then 200 | Body equals exported playable/index.html |
| /api/batch | 404 | API route absent from static server |

All redirects stay on the same loopback origin. No response includes Set-Cookie.
The audit sent only these four named GET route probes, with same-origin redirect
follow-up, and no POST or provider call. Runtime browser behavior was not
rerun here. The export expects directory indexes at an origin root, rather than
file:// or deployment beneath a subpath.

The source matrix records the later architecture authorization: backend as
source of truth and GHL reflecting progress. Implementation, audit,
credentials, dependencies and integration remain pending. This presentation
patch does not activate GHL, payments, loyalty tracking or redemption.

## Evidence and reproduction

`source-proof.json` records all 125 protected hashes and callback/source checks.
`inventory.json` and `inventory-notes.md` record the file/build comparison.
`compiled-css-proof.json` records the five final compiled CSS signatures.
`csp-http-audit.json` records the HTML/CSP checks and local responses;
`http-*.body` preserves the returned bytes. The original export manifest is
copied here as `static-export-manifest.json`.

To repeat only the CSP/static GET checks while this isolated server exists:

```sh
node docs/qa/reference-static-export-20261101/direct-source-audit-9a94e4c/audit-static.cjs
```

The script accepts `QA_STATIC_EXPORT_PATH` and `QA_STATIC_AUDIT_ORIGIN` and
rejects non-loopback or non-root audit origins. No publication, deployment or
hosting access occurred in this audit.
