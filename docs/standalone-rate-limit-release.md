# Bagelito standalone production rate limiter

**Purpose:** The legacy \`supabase/add-public-api-hardening.sql\` script also replaces \`create_reservation_order\` and \`set_updated_at\`. Do not use that broad script as a quick fix for a missing limiter.

Apply only \`supabase/add-rate-limit-only.sql\` after a review of the target. It creates the single \`api_rate_limits\` table and a \`service_role\`-only \`consume_api_rate_limit\` RPC. It does **not** change business data or orders. Its atomic UPSERT handles the first-hit concurrency race, caps hits, and stores only server-side SHA-256 identifiers; RLS is enabled and neither \`anon\` nor \`authenticated\` can read the bucket table or execute the RPC.

**Preflight:** Confirm target database, check \`to_regclass('public.api_rate_limits')\` and \`to_regprocedure('public.consume_api_rate_limit(text,text,integer,integer)')\` are NULL for a first install. Compare to Vercel production's \`SUPABASE_SERVICE_ROLE_KEY\` configuration by project identity only, never by printing secrets. Verify no existing schema/table conflicts.

**Verify:** In a single manual transaction \`BEGIN;\` + file's SQL + queries for first request, repeats, 429-equivalent \`allowed=false\`, hash isolation, RLS, ACLs + \`ROLLBACK;\`. Repeat read-only schema query to ensure no dry-run changes persisted. Apply only after the same statement succeeds under \`apply_migration\`, with the reviewed production project ID. Then verify the function, grants and a single synthetic bucket using \`BEGIN ... ROLLBACK\` and confirm the original order/batch counts unchanged.

**Rollback:** The function is standalone. Before any production traffic, DROP can reverse an accidentally installed empty limiter table; after traffic starts, do not destroy rate records or alter reservation functions. Prefer \`REVOKE EXECUTE ... FROM service_role\` plus operator review of effects, then a forward-fix migration. A rate limiter error may temporarily cause form requests to return 503 under the new fail-closed code; monitor service availability.

**Release gates:** The checkout confirmation/terms branch (#21) is NOT ready to publish merely because this SQL is installed. It also needs a compatible Culqi core migration, inbound merchant webhook delivery, admin config, Yape/3DS QA, legal trigger cutover and CI checks. The unrelated production batch dates require PR #19.
