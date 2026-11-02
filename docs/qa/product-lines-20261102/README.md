# Product-line and session integrity QA — 2026-11-02

Application commit: `7ab930e989d4a6a6710f0f336288eb2cd713f799` (local equivalent `d3cc0e1b4569f782dd42385e487aae26a889c189`). Exact tree: `ac0d275c2eb2e5ed60697da56cf83a4f77c9489b`. Documentation/logs added afterward do not change executable code.

## Results

- **128/128 Node tests PASS**, 0 skipped, final application tree. This includes 27 new tests: 14 quotes, 9 sessions, 4 category transitions. Existing review-mode/provider/configuration tests remain green.
- **Full `npm run build` PASS**: Vite, `tsc --noEmit`, structural QA 11/11, manual fallback 4/4, movement 14/14. The movement tests are already included in the 128; do not add them twice.
- **RED before fix: 5/5 quote regressions failed** against the preceding application: discarded malformed schmear, coerced/negative bagel quantity, malformed combo misclassified, wrong capacity count, and partial price returned as total.
- Category transitions execute the actual extracted handler with state-setter fixtures, not a copy: Combo → Schmears, Schmears → Packs, entering Combos, same-category preservation. This is **not** mounted React or browser coverage.
- Session tests use the actual session/quote/plan code with a synthetic in-memory Supabase interface and a rate-limit stub. They verify the exact ordinary-pack RPC payload, same-session retry, same-total flavor substitution rejection, adding a pot to an existing session, zero persistence for review/malformed selections, independent lossless projection even with a falsely ready quote, amount mismatch, post-transaction reread, and legal acceptance.
- **No credentials, provider calls, live/sandbox database, charges, migrations, environment changes or deployments.** No new product was made payable.

The initial isolated TypeScript attempt with a 320 MB V8 heap exhausted that heap (exit 134), with no TypeScript diagnostic. The final full build with the previously validated 640 MB limit passed. This is not reported as an application type error or hidden by the PASS.

## Commands

```sh
QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr \
  node --test --test-concurrency=1 tests/*.test.cjs
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
  CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 \
  npm_config_cache=/workspace/scratch/241128f28314/bagelito-npm-cache npm run build
git diff --check
```

No browser or responsive visual QA was rerun for this patch. It changes no CSS/assets/layout; the frontend change is a two-line state reset when switching category. Native browser/visual evidence from earlier commits must not be described as execution of this exact patch.

See [commercial evidence and persistence boundary](../../guided-product-lines-readiness-20261102.md). The 180 g source conflict, unpriced current combo/extras, product-line transaction adapter, and real Culqi E2E remain unresolved. Reference-only mode remains active. Local tests are not GitHub CI or production acceptance.

## Subsequent source clarification

After this checkpoint, Ricardo supplied the published schmear menu image. It confirms all six original/flavored size prices already in the JSON, resolving the 180 g Canva conflict without price changes. See the updated commercial evidence document above. Product persistence and other unpriced offers remain blocked.
