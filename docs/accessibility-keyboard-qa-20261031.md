# Focus, keyboard and mobile QA of the integrated storefront

Baseline: PR43 `2b1674a9017fa0925b0232919938819e609dcae1`.
The browser uses the actual local production candidate, synthetic customer data,
and a loopback-only network boundary. POSTs, external requests and redirected
reads outside the fixture are blocked. No new scanner dependency is installed.

## Reproduced defects and narrow changes

- After changing checkout steps, keyboard focus remained on Continue or fell to
  BODY when the button disappeared. Step changes now focus the new step content;
  focus placement bypasses the page's smooth scrolling so the target is visible
  immediately. Scroll rechecks stop as soon as the user moves focus elsewhere.
- Invalid flavor/delivery progression displayed an unannounced message while
  focus stayed on Continue. The error is now an alert/focus target, including
  repeated identical errors. Empty fields already rejected by the existing
  validation reference that error; validation rules are unchanged.
- Ten single-flavor buttons had the same Select/Seleccionar accessible name and
  no announced selected state. Names now include their existing flavor label;
  pack/flavor choices expose pressed state. Quantity +/- buttons already had
  flavor-specific names and retained their existing handlers and bounds.
- Delivery handoff declared a radiogroup containing ordinary buttons without
  radio/checked semantics. It now uses a labeled group with mutually exclusive
  pressed buttons, retaining the existing Tab/Enter/Space interaction and data.
- The Spanish complaints form/receipt inherited English document language when
  the site locale was EN. Both existing main containers now declare lang=es.
  Legal copy, submission/receipt data and policies are unchanged.
- The closed English mobile CTA's accessible name differed from its visible
  Join waitlist label. It now uses the same computed label; URLs, campaigns and
  click handlers are unchanged.

These are existing UI defects observed on the baseline, not evidence of a
production incident or necessarily regressions introduced by PR43.

## Local probes

Checkout: ES/EN, desktop1440x1000 and mobile390x844. Enter/Space/Tab exercise
step changes, flavor selection, handoff state, empty/repeated errors, invalid
field associations and quantity limits. Focus assertions check the active
element and viewport position after160ms, beyond the existing90ms scroll timer,
including that a later Tab is not pulled back to a heading.

Store/legal/complaints: ES/EN at320,360,390 and1440px, checking24 page/locale/
viewport combinations, names, keyboard links, legal/contact destinations and
horizontal document/control overflow. The complaints receipt is rendered from
the actual component with a synthetic state boundary, without submitting a real
complaint. All six locale/intake combinations of the mobile CTA are checked.

Before the changes, the checkout focus/name/selection assertions and English
complaints/closed-CTA assertions failed against the baseline. Existing quantity
keyboard probes passed and were preserved. The source changes are presentation
and accessibility semantics only; no payment contract, catalog price, consent
rule, legal text or remote configuration changes.

```sh
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  BAGELITO_TEST_URL=http://127.0.0.1:3107 npm run test:accessibility-browser
npm test
npm run lint
npm run build
npx --no-install tsc --noEmit --incremental false
```

Use the synthetic loopback build/server setup in
`docs/local-store-finance-integration-20261031.md`, with review=true for the
accessibility/storefront journeys. Existing financial browser regressions run
separately with review=false and synthetic SDK/API boundaries. Vercel global
autodeploy remains false; workflow allowlists must not be expanded.

## Limits

These probes use Chromium and its accessibility tree. They do not certify WCAG
conformance, replace manual screen-reader testing, or establish complete color
contrast, zoom, engine/device or third-party SDK accessibility. No current
provider, database, production accessibility or deployment state is inferred.
