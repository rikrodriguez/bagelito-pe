-- Bagelito checkout legal evidence (first install only, forward-only).
-- Deploy with the reviewed checkout build, not while the legacy build
-- auto-sends terms_accepted=true without a customer checkbox.
--
-- Existing historical orders are deliberately left NULL: retroactive timestamps
-- would falsely claim that an explicit acceptance occurred.
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_legal_version text,
  ADD COLUMN IF NOT EXISTS checkout_legal_accepted_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_bagelito_checkout_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Checkout terms evidence is insert-only';
  END IF;
  IF NEW.terms_accepted IS TRUE THEN
    NEW.checkout_legal_version := '2026-10-26';
    NEW.checkout_legal_accepted_at := clock_timestamp();
  ELSE
    NEW.checkout_legal_version := NULL;
    NEW.checkout_legal_accepted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_bagelito_checkout_terms() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_bagelito_checkout_terms() FROM anon, authenticated;
DROP TRIGGER IF EXISTS bagelito_checkout_terms_on_insert ON public.orders;
CREATE TRIGGER bagelito_checkout_terms_on_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_bagelito_checkout_terms();

COMMENT ON COLUMN public.orders.checkout_legal_version IS
  'Policy version recorded at INSERT if terms_accepted was true. Historical rows are not backfilled.';
COMMENT ON COLUMN public.orders.checkout_legal_accepted_at IS
  'Server-side timestamp of a new order with affirmative terms_accepted. Not a substitute for proof of the actual UI click.';

COMMIT;
