# Historical driver fixture

`qa-world-tour.925c050.cjs.txt` is the exact, unmodified UTF-8 blob from
`925c050659ac7682488a9bc9c9c4906787663eb1:scripts/qa-world-tour.cjs` in this repository.

SHA256: `1451c7fec8951f160689f4db1667c8a524f7e1183f0423556d9d06f819578230`.

It is inert test data, never imported as executable application code. The existing
VM driver tests use it to preserve unchanged readiness/strafe logic assertions and
to opt into the intentionally failing historical replay with
`QA_DRIVER_TEST_ORIGINAL=true`. The hash is asserted before those comparisons.

Keeping the original blob here makes both modes work without Git history. Do not
regenerate it from the current driver or weaken the pinned checksum to make a test
pass. Retrieval is not part of a test run and makes no online request.
