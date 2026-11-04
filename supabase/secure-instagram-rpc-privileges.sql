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
REVOKE ALL ON FUNCTION public.capture_instagram_ghl_sync_mapping() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_instagram_ghl_sync_mapping() TO service_role;
REVOKE ALL ON FUNCTION public.inherit_lead_ghl_opportunity_on_draft() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inherit_lead_ghl_opportunity_on_draft() TO service_role;
REVOKE ALL ON FUNCTION public.notify_instagram_sales_enrichment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_instagram_sales_enrichment() TO service_role;
REVOKE ALL ON FUNCTION public.trigger_sync_instagram_internal_order_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_sync_instagram_internal_order_state() TO service_role;
REVOKE ALL ON FUNCTION public.trigger_sync_instagram_internal_order_state_item() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_sync_instagram_internal_order_state_item() TO service_role;
COMMIT;
