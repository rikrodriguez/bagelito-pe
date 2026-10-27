# Packs → Grandes / Minis — QA evidence

**Date:** 2026-10-27  
**Branch:** `feat/packs-size-choice-v1-20261027`  
**Scope:** first-stage storefront only. No flavor configuration, combo configuration, schmear configuration or payment changes.

## Automated verification

- `node --test tests/*.test.mjs`: **88/88 PASS**, 0 failures.
- `npm run lint`: PASS.
- `npm run build`: PASS, including Next.js production compilation and TypeScript validation.
- TDD evidence:
  - Flow model test failed first because `src/lib/storefront-first-stage.ts` did not exist, then passed 3/3 after implementation.
  - UI contract test failed first because `FirstStageChoice.tsx` did not exist, then passed after implementation.
  - Contrast regression test failed first against the original future-step color, then passed after changing it to `#56677f`.

## Browser verification

Executed in an isolated Vercel Sandbox using Chromium with:
`BAGELITO_MERCHANT_REVIEW_ONLY=true`, `CULQI_ENABLED=false`, `PAYMENT_PROVIDER=manual`.

Viewports:
- 1440×900
- 390×844
- 320×700

For every viewport:
1. Entry → display counter.
2. Category heading: **¿Qué te provoca hoy?**
3. Packs visible and interactive.
4. Combos and Schmears visible, keyboard-focusable, and marked `aria-disabled=true` for this implementation increment.
5. Packs → **¿Grandes o Minis?** with URL hash `#packs`.
6. Select **Bagels grandes** → `aria-pressed=true`.
7. Back → category state / `#mostrador`.
8. Packs → **Mini bagels** → `aria-pressed=true`.
9. Browser Back → category state / `#mostrador`.
10. Progress indicator contains: Entrada · Categoría · Tamaño · Selecciona · Revisa · Pago.

Results:
- Horizontal overflow: **0 px** at all three viewports.
- JavaScript page errors: **0**.
- Observed POST/PUT/PATCH/DELETE requests during journey: **0**.
- Axe WCAG A/AA violations after final contrast fix: **0** at 1440, 390 and 320 in the tested state.
- Entry door and primary CTA have native `#mostrador` href fallbacks, so an immediate click before React hydration still reaches the category stage.

## Product truth in this increment

This stage shows only the fork:
- **Bagels grandes** — 6 or 12.
- **Mini bagels** — 6, 12 or 24.

Prices and mixed/single-flavor rules are intentionally reserved for the next configuration increment and are not newly calculated here.

## Limitations

- Automated Chromium is not a physical iPhone/Safari test.
- The visual scene remains the existing isolated store implementation; this increment validates the category/size interaction before flavor configuration.
- Combos and Schmears are visible but intentionally unavailable until their own implementation increments.
- Culqi Live, webhooks and production charging are not part of this test and are not claimed ready.
