-- Bagelito: standalone rate limiting install. No orders, batches, payments,
-- reservation functions, payment webhooks, or customer data are modified.
--
-- Apply to the reviewed production Supabase project only after a dry-run.
-- It provides the exact consume_api_rate_limit(p_scope, p_identifier,
-- p_limit, p_window_seconds) RPC used by src/lib/public-api-security.ts.
--
-- SECURITY DEFINER is intentional: only service_role may execute the
-- RPC. anon/authenticated/PUBLIC are explicitly denied direct access.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  scope text NOT NULL CHECK (length(scope) BETWEEN 1 AND 48),
  identifier_hash text NOT NULL CHECK (identifier_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (scope, identifier_hash)
);

CREATE INDEX IF NOT EXISTS api_rate_limits_window_started_idx
  ON public.api_rate_limits (window_started_at);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_scope text,
  p_identifier text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (
  allowed boolean,
  hits integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  now_ts timestamptz := clock_timestamp();
  started_at timestamptz;
  recorded_hits integer;
  window_span interval;
BEGIN
  -- All callers are server-side. Reject malformed identifiers and
  -- unbounded windows; no user PII is persisted (SHA-256 digest only).
  IF p_scope IS NULL OR p_scope !~ '^[a-z_]{1,48}$'
    OR p_identifier IS NULL OR p_identifier !~ '^[a-f0-9]{64}$'
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000
    OR p_window_seconds IS NULL OR p_window_seconds < 1
    OR p_window_seconds > 604800 THEN
    RAISE EXCEPTION 'Invalid rate-limit arguments' USING ERRCODE = '22023';
  END IF;

  window_span := make_interval(secs => p_window_seconds);

  -- Single upsert serializes both the initial claim and concurrent hits;
  -- no SELECT-then-INSERT race. Cap hits at limit+1 to avoid overflow.
  INSERT INTO public.api_rate_limits AS bucket
    (scope, identifier_hash, window_started_at, hits, created_at, updated_at)
  VALUES (p_scope, p_identifier, now_ts, 1, now_ts, now_ts)
  ON CONFLICT (scope, identifier_hash)
  DO UPDATE
    SET window_started_at = CASE
      WHEN bucket.window_started_at + window_span <= now_ts THEN now_ts
      ELSE bucket.window_started_at END,
      hits = CASE
        WHEN bucket.window_started_at + window_span <= now_ts THEN 1
        ELSE LEAST(bucket.hits, p_limit) + 1 END,
      updated_at = now_ts
  RETURNING bucket.window_started_at, bucket.hits
    INTO started_at, recorded_hits;

  RETURN QUERY SELECT
    recorded_hits <= p_limit,
    recorded_hits,
    CASE WHEN recorded_hits <= p_limit THEN 0
      ELSE GREATEST(1,
        CEIL(EXTRACT(EPOCH FROM (started_at + window_span - now_ts)))::integer)
    END;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(text,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text,text,integer,integer)
  TO service_role;

COMMENT ON TABLE public.api_rate_limits IS
  'Bagelito public API request buckets; hashed identifiers only. Bounded windows and service_role-only RPC access.';
