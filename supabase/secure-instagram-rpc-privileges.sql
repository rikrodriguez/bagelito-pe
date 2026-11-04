-- Bagelito security audit remediation (2026-11-04)
-- Supabase may grant direct EXECUTE to anon/authenticated, beyond PUBLIC.
-- All three RPCs use SECURITY DEFINER and must be service-role-only.
BEGIN;
REVOKE ALL ON FUNCTION public.get_instagram_customer_memory(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_instagram_sales_handoff(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_instagram_internal_order_state(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_instagram_customer_memory(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_instagram_sales_handoff(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_instagram_internal_order_state(uuid) TO service_role;
COMMIT;
