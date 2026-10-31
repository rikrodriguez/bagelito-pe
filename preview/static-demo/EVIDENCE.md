# Static demonstration verification — 2026-10-31

Source UI: PR43 `97b4ae91798ab82b1b379000ba3be9b8b8495b45`.
This is a separate demonstration variant, not an application deployment.

The delivered `dist/index.html` is 2,124,657 bytes with SHA256
`011ad84ec93453f0e4a350abc0e373406c0bf8832ada71719b7a7c29598c27fe`.

Commands:

```sh
node preview/static-demo/build.mjs
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --test preview/static-demo/test.mjs
node_modules/.bin/eslint preview/static-demo/build.mjs preview/static-demo/client.js preview/static-demo/test.mjs
git diff --exit-code 97b4ae91798ab82b1b379000ba3be9b8b8495b45 -- src public .github/workflows vercel.json
```

Results on the delivered bytes: six tests passed, none failed, one explicit
managed-browser file navigation check skipped. The skip reports
`ERR_BLOCKED_BY_ADMINISTRATOR` before execution; no browser policy was changed.
The same bytes passed all local HTTP static-fixture checks.

- Four browser contexts: Spanish/English and 1440/390 pixels wide.
- Sixteen pack journeys, eighty single-flavor selections, eight mixed-quantity
  clamp cases and 416 district/fee checks across the existing four packs,
  ten flavors and twenty-six districts.
- Extra pack add/remove, escaped input and the final explicit no-order/no-payment
  notice checked in every journey.
- Sixteen embedded images compared byte-for-byte with the original public assets.
- Exactly two inline script bodies checked against their CSP hashes; DOM and
  source audits found no imports, backend, transport, persistence, form actions,
  external destinations or image source sets.
- Six fixture GET requests served only `/index.html`; zero POST requests,
  external requests or normal-journey transport attempts. Negative connect,
  form, frame and worker probes were blocked by their corresponding CSP rules.
- ESLint passed. Original application source, public assets, five workflows and
  Vercel global `deploymentEnabled: false` remain unchanged from the pinned base.

No real provider, database, production behavior or general accessibility
compliance is asserted. This change adds only the static artifact, its generator,
local client and tests; it does not rerun or claim a new application/SQL release.

The HTML was saved as `Bagelito-demo-estatica-PR43.html` for download. There is
no hosted preview URL. Existing Vercel tooling could not establish deployment-
specific secret isolation. Alternative hosting paths did not establish the
workspace's no-cost boundary or the required source deployment tooling, so no
site, service, plan, environment, permission or production alias was created.
