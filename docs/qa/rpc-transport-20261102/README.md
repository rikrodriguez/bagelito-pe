# Product RPC transport boundary — 2026-11-02

Application commit `13e0cc398c2fcb701854a62dd7c4317765fddf06` (local `87e75eb8e71d6dcae68e59c3c0d75dd7e728593d`), exact tree `38b91416ffa33a744f1b5068953425698a491d8a`.

- **177/177 Node tests PASS**, zero skipped.
- **Full build PASS**, including TypeScript and existing structural/manual/movement gates. Movement14 are already counted above.
- Regression against the preceding implementation: **13 PASS /2 FAIL**. A rejected RPC promise propagated raw internal transport diagnostics for both write and read.
- Three new tests cover asynchronous transport rejection, absence of automatic retry, and malformed RPC response envelopes. These are injected offline tests, not database or provider requests.

The adapter now sanitizes both returned RPC errors and rejected promises. A missing/malformed envelope is not success or a missing snapshot. Write failures explicitly say that the reservation **could not be confirmed**: a lost response might follow a committed write, so the adapter neither claims rollback nor automatically retries or creates another session. Payment must not start on that result. Reads fail explicitly rather than falling back to incomplete products.

No SQL, route, payment configuration, price or storefront behavior changed in this patch. The new product path remains unexposed and disabled. No real database, migration, credential, charge or deployment was used.

At publication, the prior SQL SIGKILL blocker remained unresolved in the original executor. An independent in-memory validation on a separate existing Bagelito coding environment was pending; **no SQL success is claimed by this report**. See [the preceding evidence](../packing-preview-20261102/README.md) for its exact boundary. Native sockets were not retried.

Commands:

```sh
NODE_OPTIONS='--max-old-space-size=320 --max-semi-space-size=4' \
  QA_HDR_FIXTURE_PATH=/tmp/bagelito-lebombo_1k.hdr \
  node --test --test-concurrency=1 tests/*.test.cjs
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=4' \
  CIRCLE_NODE_TOTAL=2 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 \
  npm_config_cache=/workspace/scratch/241128f28314/bagelito-npm-cache npm run build
```
