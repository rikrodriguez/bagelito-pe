# Bagelito commerce — independent ChatGPT preflight (2026-11-08)

## Source inspection
- This branch starts at PR #48 head `368f57692a2697c5dbf342d686b2816922b6f442`, which builds on PR #47. It is an **integration candidate**, not the canonical approved cleanroom implementation.
- Repo README describes a portable TanStack Start store with entry, vitrine, packs, combos and schmears. It explicitly blocks checkout until offer, inventory, reservation and payment gates pass. The README's older historical approvals and tests must not be treated as current certification.
- Separate Instagram PR #39 → #49 → #50 chain has distinct release gates; no merging into this branch without code review and safety proof.
- Culqi candidate PR #23 and recovery PR #43 are separate; do not cherry-pick blindly.

## Immediate implementation contract
1. Store UI may use replaceable placeholders until the owner approves canonical scenes. No permanent buttons baked into productive images; desktop/mobile overlay coordinates must be responsive.
2. Product source of truth must be imported from the approved 2026-11-06 versioned commercial contract in Dawn docs. Reject unavailable SKU and unknown delivery zone, rather than inventing prices.
3. Cart must preserve selected flavors and quantities; totals calculated server-side and validated against catalog version.
4. Order, quote and payment states remain distinct. `payment=not_requested` until explicit request. Never claim paid based on screenshot or browser redirect.
5. Idempotency on create/submit and no duplicate inventory reservations; preserve existing Supabase ownership until safe cutover.
6. Human operator can take over Instagram; a newer inbound or opt-out invalidates stale automated sends. Dawn remains Off pending native verification.

## Verification queue
- Identify exact cleanroom package and approved asset matrix; branch selection not final.
- Run existing domain/UI tests and compare against commercial contract; fix discrepancies on this branch only.
- Create preview-only functional checkout path with simulated payment and confirmed stock fixtures; no live Culqi/Yape/Whop calls.
- Record evidence and QA results with SHA and test commands. No merge/deploy/public message.

## Release boundaries
This document is a code integration work order, **not** visual approval, AI activation or payment authorization.
