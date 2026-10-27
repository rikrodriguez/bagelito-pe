# Packs Grandes / Minis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved `Packs → Grandes / Minis` fork inside the existing Bagelito store scene without building flavor configuration or touching payments.

**Architecture:** Keep `StoreWalkthrough` as the spatial shell, but move first-stage commerce state into a small pure flow module and two focused UI components: a category/pack-family overlay and a six-step progress indicator. The existing counter remains as the visual background. Only the Packs branch advances to the new pack-family step; later configuration remains explicitly out of scope.

**Tech Stack:** Next.js 15, React, TypeScript, existing CSS/HTML scene, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-27-packs-size-choice-design.md`

## Global Constraints

- Preserve the existing V3 branch isolation; no merge or production deploy.
- Do not modify Culqi/payment endpoints, credentials, database writes, CRM records, or historical orders.
- Category choices remain visually `Packs · Combos · Schmears`.
- Packs advances to exactly two families: `Bagels grandes` and `Mini bagels`.
- Large-family helper copy: `6 o 12 bagels`.
- Mini-family helper copy: `6, 12 o 24 mini bagels`.
- Do not implement flavor, combo, schmear, custom-color, cart, or payment configuration in this increment.
- Progress language: `Entrada → Categoría → Tamaño → Selecciona → Revisa → Pago`.
- Same scene; no route change to a generic ecommerce page.

## Review Focus

- Browser Back from `#packs` should restore the category prompt rather than leave stale Grandes/Minis state.
- A reload at the first-stage storefront must not create a reservation/order or call payment APIs.
- 320px controls must not overflow or cover the display case.
- Disabled future-category controls must remain keyboard-readable and clearly unavailable, not silently fail.
- Repeated Packs/back/Packs transitions must not duplicate history or corrupt the selected pack family.

---

### Task 1: Pure storefront first-stage flow

**Files:**
- Create: `src/lib/storefront-first-stage.ts`
- Test: `tests/storefront-first-stage.test.mjs`

**Interfaces:**
- Produces: `type FirstStageStep = "entry" | "category" | "pack-size"`
- Produces: `type PackFamily = "large" | "mini"`
- Produces: `FIRST_STAGE_PROGRESS: readonly string[]`
- Produces: `getFirstStageFromHash(hash: string): FirstStageStep`
- Produces: `hashForFirstStage(step: FirstStageStep): string`
- Produces: `progressPosition(step: FirstStageStep): number`

- [ ] **Step 1: Write the failing tests** for the three hashes, six exact progress labels, and indexes 0/1/2.
- [ ] **Step 2: Run** `node --test tests/storefront-first-stage.test.mjs` and verify RED because the module does not exist.
- [ ] **Step 3: Implement** the pure types/constants/functions with no browser or payment dependencies.
- [ ] **Step 4: Run** the targeted test and verify PASS.
- [ ] **Step 5: Commit** `test/feat: add first-stage storefront flow model`.

### Task 2: Category and pack-family overlay

**Files:**
- Create: `src/components/store/FirstStageChoice.tsx`
- Create: `src/components/store/FirstStageProgress.tsx`
- Create: `src/app/first-stage-choice.css`
- Modify: `src/components/StoreWalkthrough.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/first-stage-choice-contract.test.mjs`

**Interfaces:**
- Consumes: `FirstStageStep`, `PackFamily`, `FIRST_STAGE_PROGRESS`.
- Produces: `FirstStageChoice({step, selectedFamily, onPacks, onBack, onFamily})`.
- Produces: `FirstStageProgress({step, onEntry, onCategory})`.

- [ ] **Step 1: Write the failing contract test** asserting exact category copy, Grandes/Minis copy, no sandwich/beverage combo copy, six progress labels, and no payment/fetch imports.
- [ ] **Step 2: Run** `node --test tests/first-stage-choice-contract.test.mjs` and verify RED because the components do not exist.
- [ ] **Step 3: Implement** the overlay components. Packs advances; Combos and Schmears stay visible and explicitly marked for the next increment. Grandes/Minis selection is stateful and shows a concise selected-state confirmation, not the flavor configurator.
- [ ] **Step 4: Integrate** with `StoreWalkthrough`: entering the counter lands on `category`; Packs pushes `#packs`; Back pushes/returns `#mostrador`; popstate/hashchange rehydrates first-stage state.
- [ ] **Step 5: Add CSS** so the overlay reads as part of the glass/steel counter, uses cobalt/white/coral branding, and the progress bar remains unobtrusive on the same scene.
- [ ] **Step 6: Run** targeted contract tests and the existing `spatial-v3-contract.test.mjs`; verify PASS.
- [ ] **Step 7: Commit** `feat: add packs grandes/minis choice in store scene`.

### Task 3: Responsive and safety verification

**Files:**
- Modify if required by failures: `src/app/first-stage-choice.css`, `src/components/store/*.tsx`
- Test: existing Node suite plus browser QA in isolated Vercel Sandbox.
- Document: `docs/qa/packs-size-choice-v1-20261027.md`

**Interfaces:**
- Consumes the completed first-stage UI.
- Produces no production interface; only QA evidence.

- [ ] **Step 1: Run full suite** `node --test tests/*.test.mjs`, `npm run lint`, and `npm run build`.
- [ ] **Step 2: Browser QA** at 1440×900, 390×844 and 320×700: enter counter → Packs → Grandes → Back → Packs → Minis; verify no horizontal overflow and no clipped controls.
- [ ] **Step 3: Verify safety** by observing no POST/PUT/PATCH/DELETE requests during this first-stage journey.
- [ ] **Step 4: Verify accessibility**: keyboard activation, focus visibility, reduced motion, and Axe A/AA on the category and pack-size states.
- [ ] **Step 5: Record results** in the QA doc with explicit limitations.
- [ ] **Step 6: Commit** `docs/test: verify packs size first-stage journey`.
- [ ] **Step 7: Create a Vercel Preview only** with `BAGELITO_MERCHANT_REVIEW_ONLY=true`; do not merge or deploy production.
