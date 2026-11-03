# Stable Bagelito flavour selection — 2 November 2026

Published application: **`08916b0ed895f252a0162a41094508bb78577d13`**.
Tested local application `7ba7a5b98c3a25907583a1b72cf04befd23ef9d0` has
the exact same Git tree `2e1e635e9c34446e72f1bfe3ae674694ebe93646`. Based on PR47
`59fb43102f950a9ed1437134f598b1fa53e1a75e`. Isolated branch
`feat/storefront-selection-20261102`; this does not modify PR47 or the parallel
checkout work. Draft proposal, not deployment or final design approval.

## Verified improvement

The original selection tiles had white button surfaces obscuring the intended
rounded/pastel cards. Adding Plain inserted a quantity row in normal flow: the
first desktop row grew **182 → 238 CSS px (+56)**. The viewport also scrolled,
so raw viewport Y differences are not used as the layout-shift measurement.

The reference-only stylesheet now reserves a bottom action area before selection.
Cream bagel and blush schmear cards echo the approved storefront categories;
selected cards use the existing blue palette. A visible quantity replaces the
redundant check in the blue circle, with a separate 44 px remove button. Product
photos, typography hierarchy and the selection-count badge are clearer. Cards
are intentionally taller than the old collapsed tiles; this is a readability
trade-off, not a claim of improved conversion.

- [Desktop before](captures/before-desktop-selected.jpg)
- [Desktop after](captures/final-desktop-selected.jpg)
- [Narrow final](captures/final-334-selected.jpg)
- [Keyboard remove](captures/final-334-keyboard.jpg)
- [Schmears desktop](captures/final-desktop-schmears.jpg)

Only `src/reference/rebuilt-flow.css` changes application code. It is scoped to
`reference-mode` and does not modify handlers, markup, labels, products, prices,
logo, counter geometry, image files, checkout, consent or production settings.
[139 protected files](protected-audit.json) are byte-identical to the base.
No dependency, asset or font was introduced.

## Actual browser evidence

Native Chromium window resizing/zoom via CUA, not mobile/touch emulation:

| CSS viewport | Test | Result |
|---|---|---|
|1180 × 757, 100%|Empty → one Plain; all 8 cards relative to their grid|0 px height change; 0 px row movement; document overflow 0|
|334 × 505, 150%|Empty → one Plain; all 8 cards|0 px height change; <0.001 px floating-point position difference; overflow 0|
|787 × 505, 150%|Fresh empty → one Plain|0 px height change; <0.001 px position difference; overflow 0|

At 334 CSS px, product labels measured 18 px and the remove button 44 × 44 px.
Tab from Add Plain reached Remove Plain with a visible blue inset focus outline;
Enter removed it. Six bagels (2 Everything, 2 Sesame, 2 Plain) were selected.
The optional Original 120 g schmear was added, then declined by a second tap.
The summary retained exactly those six bagels. Delivery/review opened with
**Pago no activo disabled**, `reviewOnly=true`, no horizontal overflow, and the
explicit no-order/no-charge status. No customer data was entered or submitted.

The desktop combo reached two bagels plus Herb & Roasted Garlic, with a readable
selected card and 44 px controls. The remove/re-add interaction ran. Its later
journey is **not credited complete**: an authored locator incorrectly expected
“Continuar” where the unchanged UI says “Ir a caja”.

The 501 px trial started with an already-full retained pack, so its zero movement
was not a true empty-to-selected test and is excluded from the pass table.
The remaining 501 px baseline capture is only a visual reference.

Screenshots preserve the tool's exact JPEG bytes. Full-page captures at 150%
zoom were returned at 216 px width for the 334 CSS-px document, not as native
334 px full-page images; the keyboard viewport capture is 334 × 505.
See `capture-manifest.json`. DOM measurements, not resized screenshot pixels,
support the geometry claims. No Safari, physical device, full browser matrix,
screen-reader announcement or performance/conversion claim is made.

## Tests and limits

- `npm run build`: PASS (including TypeScript and inherited static/launch/movement checks).
- `QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr node --test tests/*.test.cjs`:
  **150/150 PASS**, zero skips. Three new tests are structural CSS regression
  guards, not browser tests. Logs are included; inherited checks are not counted twice.
- Runtime measurements above are actual independent browser observations.
- A legacy `color:#fff!important` initially left the check under the quantity;
  visual QA detected it. Final code explicitly suppresses that aria-hidden check
  only when the real quantity is present. Final captures show the number alone.

The standalone Playwright launch was blocked by sandbox socket permissions.
Escalated launch failed in bwrap before running; it was not used to bypass the
sandbox. Supported `sites-preview` served a local-only compiled copy with both
`BAGELITO_REFERENCE_REVIEW_ONLY` and `BAGELITO_MERCHANT_REVIEW_ONLY` set true.
There were three native browser/connection failures (including Aw Snap code 9),
recovered before the credited runs; the cause is unestablished. One stale tab was
replaced with a fresh tab. No comprehensive browser network audit is claimed.

At the final attempted state read, CUA's approval review returned “authorization
changed before approval could be applied” and confirmed that the action did not
execute. Browser operations stopped; no retry through another mechanism.
The remaining combo completion/standalone-schmear/250 px reflow checks are not
claimed. These limits do not erase the completed, saved selection and Pack evidence.

## Design sources and provenance

The supplied authentic Bagelito JPEG was visually inspected, as were current
storefront and selection renders. Its shop identity governs this change; there
is no generic hero, game, screenshot-as-background or new generated food.

[21st.dev](https://21st.dev/) was consulted as requested. Its category/card
catalog is a research input, not a blanket asset licence; no catalog code,
preview image, prompt, or dependency was incorporated. A component preview URL
was unavailable during this check. Existing native components needed a layout
fix, not a new library. No code or private reference was uploaded to 21st.

The official [Anthropic frontend-design guide](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
and its folder's [Apache-2.0 licence](https://github.com/anthropics/skills/blob/main/skills/frontend-design/LICENSE.txt)
were inspected as external design research. The implementation is original CSS;
no external instructions were installed or copied into project instructions.
No purported leaked prompt was adopted. Existing Fredoka and its OFL notice
remain unchanged.

No merge, deployment, Site registration/save/publication, production change,
credential/permission change, spending, provider/DB write or third-party message.
Autodeploy remains disabled. This evidence is not a payment certification.

Cleanup: local preview stopped, isolated Node preview stopped, native browser
viewport last verified at 1180 × 757 / 100%. The final CUA tab was not touched
after its approval-review failure. Build log is ANSI/line-end-whitespace normalized
for readability; raw local log SHA256 `79d45d631e8ae5c58eb50a06570d9ce876271ebb4714cbda1450d29fe089e4f4`.

Publication uses the authenticated GitHub connector because ordinary Git push
had no write credential; no credential was requested or configured. The current
PR47 base advanced to `543113b2e46b2e722937ba299b276380bdad8875`; its new
checkout/SQL changes do not overlap this stylesheet or test.
