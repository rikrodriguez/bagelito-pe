# SDD ledger — plan: docs/superpowers/plans/2026-10-27-packs-size-choice.md

Isolation: GitHub feature branch `feat/packs-size-choice-v1-20261027` + Vercel Sandbox; no main/master worktree is modified.
Pre-flight: Task 2 consumes Task 1's `FirstStageStep`, `PackFamily`, progress labels and hash helpers. Task 3 consumes Task 2 UI only.
Execution: native/inline per user's explicit “go”.

Task 1: complete (RED: missing `src/lib/storefront-first-stage.ts`; GREEN: 3/3 targeted tests; suite: 80/80 PASS). Commits: 67ad326..c545189.

Task 2: complete (RED: FirstStageChoice.tsx missing; GREEN: 11/11 targeted contract/regression tests; suite: 85/85 PASS; lint PASS; Next build/types PASS). Commits: d16903f..a18ab6a.
