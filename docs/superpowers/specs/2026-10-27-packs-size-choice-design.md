# Bagelito Packs Size Choice — Design

**Date:** 2026-10-27

## Intent

Implement only the next approved step of the Bagelito digital-store journey: after the customer approaches the display case and chooses **Packs**, the same in-store scene asks whether they want **Bagels grandes** or **Mini bagels**. The customer should not be sent to a generic ecommerce page and should not yet enter flavor configuration in this increment.

## Approved journey

1. Full-screen Bagelito store / display case.
2. Category prompt: **Packs · Combos · Schmears**.
3. Choose **Packs**.
4. Same scene transitions to: **¿Grandes o Minis?**
5. Choice cards:
   - **Bagels grandes** — sizes available later: 6 or 12.
   - **Mini bagels** — sizes available later: 6, 12 or 24.
6. Selecting either family visibly records the choice and advances the progress indicator to **Tamaño**. It does not invent the next flavor configurator in this increment.
7. Back returns to the category prompt without reloading the page.

## Product truth used in this step

- Large packs eventually support:
  - 6 mixed S/60
  - 6 one flavor S/50
  - 12 mixed S/115
  - 12 one flavor S/100
- Mini packs eventually support:
  - 6 mixed S/25
  - 6 one flavor S/20
  - 12 mixed S/40
  - 12 one flavor S/35
  - 24 mixed S/75
  - 24 one flavor S/70

Those prices are source data for later configuration; this increment only presents the **Grandes / Minis** fork so the next implementation can branch correctly.

## Visual constraints

- Preserve the approved New York–style shop language: white square tile, stainless steel, cobalt Bagelito branding, glass display case.
- Bagels remain behind glass and proportionally realistic.
- Schmears remain in deli/gelato-style wells.
- No cups on the left, no branded shopping bag on the right, and no “Fresh Bagels Happier Days” wall copy in the first-stage composition.
- Keep the bottom progress bar. For this increment its meaningful states are:
  **Entrada → Categoría → Tamaño → Selecciona → Revisa → Pago**.
- The product family choice appears over the same shop scene; no page navigation.

## Approaches considered

### A. Same-scene state transition — selected
The customer stays in the counter scene; category cards transition to the Grandes/Minis choice. Lowest friction and closest to the approved “walk into the shop” metaphor.

### B. Dedicated packs page
Simpler routing, but breaks the feeling of staying inside the store.

### C. Bottom sheet over the shop
Good on mobile but visually weaker on desktop and too close to a conventional ecommerce drawer.

**Selected:** A.

## Non-goals for this increment

- No flavor selection.
- No schmear configuration.
- No combo configuration.
- No mini custom-colors configuration.
- No cart/payment mutations.
- No Culqi changes.
- No production deploy or merge.

## Acceptance

- Packs click changes the same scene to Grandes/Minis.
- Back returns to Packs/Combos/Schmears.
- Choosing Grandes or Minis is reflected in state and progress.
- Reload/back-forward do not create an order.
- Keyboard and touch controls work.
- Mobile 320/390 and desktop 1440 do not overflow horizontally.
