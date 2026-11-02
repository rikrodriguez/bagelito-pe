-- PROPOSED ONLY. Additive, disabled by default. Never run against a live DB
-- without schema review, backup, explicit deployment/cutover approval and QA.
-- Prerequisites: financial core + current add-checkout-legal-evidence.sql.
-- No core RPC, table constraint, payment state machine or API is replaced.
BEGIN;
DO $$
DECLARE col text;
BEGIN
  IF to_regclass('public.orders') IS NULL OR to_regclass('public.batches') IS NULL
    OR to_regclass('public.order_items') IS NULL OR to_regclass('public.order_status_history') IS NULL
    OR to_regprocedure('public.claim_culqi_charge(uuid,text,text,boolean)') IS NULL
    OR to_regprocedure('public.prepare_culqi_token_session(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Guided product lines require the installed financial core';
  END IF;
  FOREACH col IN ARRAY ARRAY['checkout_session_id','payment_lane','payment_charge_state',
    'payment_amount_minor','payment_reconciliation_required','payment_order_id','payment_charge_id','checkout_legal_version','checkout_legal_accepted_at'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.orders'::regclass
      AND attname=col AND NOT attisdropped) THEN
      RAISE EXCEPTION 'Guided product prerequisite column missing: %',col;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.orders'::regclass
    AND tgname='bagelito_checkout_terms_on_insert' AND tgenabled IN ('O','A')) THEN
    RAISE EXCEPTION 'Current legal evidence trigger is required';
  END IF;
END $$;

-- Fail closed on name collisions or definition drift. Versioned fingerprints
-- cover definitions only, never policy state or snapshot rows. Replays preserve data.
DO $$
DECLARE obj record; fingerprint text;
BEGIN
  FOR obj IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relname IN ('guided_product_reservation_policy','order_guided_product_snapshots') LOOP
    SELECT md5(jsonb_build_object(
      'relation',(SELECT jsonb_build_array(relkind,relowner,relrowsecurity,relforcerowsecurity,relacl) FROM pg_class WHERE oid=obj.oid),
      'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
        a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=obj.oid AND a.attnum>0 AND NOT a.attisdropped),
      'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid,true) ORDER BY conname) FROM pg_constraint WHERE conrelid=obj.oid),
      'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid::regclass::text) FROM pg_index WHERE indrelid=obj.oid),
      'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid,true) ORDER BY tgname) FROM pg_trigger WHERE tgrelid=obj.oid AND NOT tgisinternal),
      'policies',(SELECT jsonb_agg(to_jsonb(pol)-'oid' ORDER BY polname) FROM pg_policy pol WHERE polrelid=obj.oid)
    )::text) INTO fingerprint;
    IF obj_description(obj.oid,'pg_class') IS DISTINCT FROM 'bagelito-guided-products-v1:'||fingerprint THEN
      RAISE EXCEPTION 'Unknown or altered guided-product relation collision: %',obj.relname;
    END IF;
  END LOOP;
  FOR obj IN SELECT p.oid,p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='public' AND p.proname IN ('create_guided_product_reservation','read_guided_product_reservation') LOOP
    fingerprint:=md5(pg_get_functiondef(obj.oid));
    IF obj_description(obj.oid,'pg_proc') IS DISTINCT FROM 'bagelito-guided-products-v1:'||fingerprint THEN
      RAISE EXCEPTION 'Unknown or altered guided-product function collision: %',obj.signature;
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.guided_product_reservation_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.guided_product_reservation_policy(singleton,enabled) VALUES(true,false)
  ON CONFLICT(singleton) DO NOTHING;
ALTER TABLE public.guided_product_reservation_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guided_product_reservation_policy FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.order_guided_product_snapshots (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
  lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 2),
  subtotal_minor integer NOT NULL CHECK(subtotal_minor>0),
  delivery_fee_minor integer NOT NULL CHECK(delivery_fee_minor>=0),
  terms_version text NOT NULL CHECK(terms_version='2026-10-28'),
  price_source_date date NOT NULL DEFAULT DATE '2026-10-14',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.order_guided_product_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_guided_product_snapshots FROM PUBLIC,anon,authenticated,service_role;
-- Only the definer RPC writes/reads snapshots. No PII, tokens or payment evidence
-- is copied here. Product snapshots cannot authorize or confirm a payment.

CREATE OR REPLACE FUNCTION public.create_guided_product_reservation(
  p_order_code text,p_checkout_session_id uuid,p_batch_id uuid,p_customer jsonb,
  p_lines jsonb,p_delivery_fee_minor integer,p_terms_version text,p_payment_expires_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  line jsonb; item jsonb; lines_snapshot jsonb:='[]'; bagels_snapshot jsonb;
  item_id text; item_qty integer; line_amount integer; subtotal integer:=0; units integer:=0;
  pack_seen boolean:=false; pot_seen boolean:=false; mix text:='single'; slug text:='schmear-120';
  pack_name_value text:='Schmear 120 g'; n integer; distinct_n integer; grams integer;
  customer_name_value text; email_value text; whatsapp_value text; address_value text;
  district_value text; reference_value text; notes_value text; distance numeric;
  delivery_minor integer; total_minor integer; now_ts timestamptz;
  batch_row public.batches%rowtype; existing public.orders%rowtype;
  snap public.order_guided_product_snapshots%rowtype; created_id uuid;
  reserved_orders bigint; reserved_bagels bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.guided_product_reservation_policy WHERE singleton AND enabled FOR SHARE) THEN
    RAISE EXCEPTION 'Guided product reservations are disabled';
  END IF;
  IF p_checkout_session_id IS NULL OR p_batch_id IS NULL OR p_order_code IS NULL
    OR p_order_code !~ '^BAG-[A-Z0-9_-]{1,80}$' THEN RAISE EXCEPTION 'Invalid reservation identity'; END IF;
  IF p_terms_version IS DISTINCT FROM '2026-10-28' OR p_customer->'termsAccepted' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'Explicit current legal acceptance is required';
  END IF;
  IF jsonb_typeof(p_customer) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_customer) k WHERE k NOT IN
      ('customerName','email','whatsapp','deliveryAddress','district','addressReference','deliveryNotes','termsAccepted')) THEN
    RAISE EXCEPTION 'Invalid customer shape';
  END IF;
  FOREACH item_id IN ARRAY ARRAY['customerName','email','whatsapp','deliveryAddress','district'] LOOP
    IF jsonb_typeof(p_customer->item_id) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid customer field'; END IF;
  END LOOP;
  FOREACH item_id IN ARRAY ARRAY['addressReference','deliveryNotes'] LOOP
    IF p_customer ? item_id AND jsonb_typeof(p_customer->item_id) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid optional customer field'; END IF;
  END LOOP;
  customer_name_value:=btrim(p_customer->>'customerName'); email_value:=lower(btrim(p_customer->>'email'));
  whatsapp_value:=btrim(p_customer->>'whatsapp'); address_value:=btrim(p_customer->>'deliveryAddress');
  district_value:=btrim(p_customer->>'district'); reference_value:=nullif(btrim(p_customer->>'addressReference'),'');
  notes_value:=nullif(btrim(p_customer->>'deliveryNotes'),'');
  IF length(customer_name_value) NOT BETWEEN 2 AND 120 OR length(email_value)>160
    OR email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR length(whatsapp_value)>40 OR length(regexp_replace(whatsapp_value,'[^0-9]','','g'))<7
    OR length(address_value) NOT BETWEEN 5 AND 220 OR length(coalesce(reference_value,''))>160
    OR length(coalesce(notes_value,''))>500 THEN RAISE EXCEPTION 'Invalid customer values'; END IF;

  -- Exact existing server district tariff. Caller cannot lower delivery or use an unknown district.
  distance:=CASE district_value
    WHEN 'Lince' THEN 1.3 WHEN 'Jesus Maria' THEN 1.5 WHEN 'San Isidro' THEN 3.3
    WHEN 'Miraflores' THEN 7.1 WHEN 'San Borja' THEN 7.4 WHEN 'Pueblo Libre' THEN 3.7
    WHEN 'Magdalena' THEN 4.4 WHEN 'Surquillo' THEN 7.9 WHEN 'La Victoria' THEN 3.3
    WHEN 'Cercado de Lima' THEN 5.2 WHEN 'Brena' THEN 3.8 WHEN 'Barranco' THEN 10.4
    WHEN 'San Miguel' THEN 6.4 WHEN 'Surco' THEN 10.8 WHEN 'Santiago de Surco' THEN 10.8
    WHEN 'San Luis' THEN 6.6 WHEN 'Chorrillos' THEN 17.1 WHEN 'La Molina' THEN 17
    WHEN 'Rimac' THEN 8.6 WHEN 'San Juan de Miraflores' THEN 12.9 WHEN 'Ate' THEN 20
    WHEN 'Los Olivos' THEN 16.5 WHEN 'San Martin de Porres' THEN 16.3
    WHEN 'Villa El Salvador' THEN 22.4 WHEN 'Villa Maria del Triunfo' THEN 21.1 WHEN 'Other' THEN 10 ELSE NULL END;
  IF distance IS NULL THEN RAISE EXCEPTION 'Unsupported delivery district'; END IF;
  delivery_minor:=ceil(distance*3)::integer;
  IF delivery_minor>=15 THEN delivery_minor:=ceil(delivery_minor*0.7)::integer; END IF;
  delivery_minor:=greatest(8,delivery_minor)*100;
  IF p_delivery_fee_minor IS DISTINCT FROM delivery_minor THEN RAISE EXCEPTION 'Delivery amount mismatch'; END IF;

  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'Complete product lines required';
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR
      EXISTS(SELECT 1 FROM jsonb_object_keys(line) k WHERE k NOT IN ('kind','id','quantity','bagels','schmears','publishedAmountPen'))
      OR line->'quantity' IS DISTINCT FROM '1'::jsonb
      OR jsonb_typeof(line->'bagels') IS DISTINCT FROM 'array'
      OR jsonb_typeof(line->'schmears') IS DISTINCT FROM 'array'
      OR jsonb_typeof(line->'publishedAmountPen') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid product line'; END IF;
    IF line->>'kind'='pack' THEN
      IF pack_seen OR pot_seen OR jsonb_array_length(line->'schmears')<>0
        OR jsonb_array_length(line->'bagels') NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'Invalid pack composition'; END IF;
      pack_seen:=true; units:=0; bagels_snapshot:='[]';
      FOR item IN SELECT value FROM jsonb_array_elements(line->'bagels') ORDER BY value->>'flavorId' LOOP
        IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('flavorId','quantity'))
          OR jsonb_typeof(item->'flavorId') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number'
          OR (item->>'quantity') !~ '^[1-9][0-9]?$' THEN RAISE EXCEPTION 'Invalid bagel selection'; END IF;
        item_id:=item->>'flavorId'; item_qty:=(item->>'quantity')::integer;
        IF item_id NOT IN ('everything','sesame','plain','classic-onion','cinnamon-raisin','blueberry') OR item_qty>12 THEN
          RAISE EXCEPTION 'Unapproved bagel flavor or count'; END IF;
        units:=units+item_qty;
        bagels_snapshot:=bagels_snapshot||jsonb_build_array(jsonb_build_object('flavorId',item_id,'quantity',item_qty));
      END LOOP;
      SELECT count(*),count(DISTINCT value->>'flavorId') INTO n,distinct_n FROM jsonb_array_elements(bagels_snapshot);
      IF n<>distinct_n OR units NOT IN (6,12) THEN RAISE EXCEPTION 'Invalid pack size or duplicate flavor'; END IF;
      mix:=CASE WHEN n=1 THEN 'single' ELSE 'mixed' END;
      slug:=units::text||'-'||mix; pack_name_value:=units::text||' '||mix;
      IF line->>'id' IS DISTINCT FROM 'grande-'||slug THEN RAISE EXCEPTION 'Pack identity mismatch'; END IF;
      line_amount:=CASE WHEN units=6 THEN CASE WHEN mix='single' THEN 5000 ELSE 6000 END ELSE CASE WHEN mix='single' THEN 10000 ELSE 11500 END END;
      line:=jsonb_build_object('kind','pack','id','grande-'||slug,'quantity',1,'bagels',bagels_snapshot,'schmears','[]'::jsonb,
        'publishedAmountPen',line->'publishedAmountPen');
    ELSIF line->>'kind'='schmear' THEN
      IF pot_seen OR jsonb_array_length(line->'bagels')<>0 OR jsonb_array_length(line->'schmears')<>1 THEN
        RAISE EXCEPTION 'Invalid schmear composition'; END IF;
      pot_seen:=true; item:=line->'schmears'->0;
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('flavorId','quantity','grams'))
        OR item->'quantity' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(item->'grams') IS DISTINCT FROM 'number'
        OR (item->>'grams') NOT IN ('120','180','240')
        OR jsonb_typeof(item->'flavorId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Only approved schmear sizes are supported'; END IF;
      grams:=(item->>'grams')::integer;
      IF pack_seen AND grams<>120 THEN RAISE EXCEPTION 'The optional pack pot must be 120 g'; END IF;
      IF NOT pack_seen THEN slug:='schmear-'||grams::text; pack_name_value:='Schmear '||grams::text||' g'; END IF;
      item_id:=item->>'flavorId';
      IF item_id NOT IN ('whipped-original','aji-amarillo','herb-roasted-garlic','honey-cinnamon','classic-strawberry')
        OR line->>'id' IS DISTINCT FROM item_id THEN RAISE EXCEPTION 'Schmear identity mismatch'; END IF;
      -- Original published menu re-confirmed by user image IMG_4455 on 2026-11-02.
      line_amount:=CASE grams WHEN 120 THEN CASE WHEN item_id='whipped-original' THEN 1200 ELSE 1600 END
        WHEN 180 THEN CASE WHEN item_id='whipped-original' THEN 1800 ELSE 2300 END
        WHEN 240 THEN CASE WHEN item_id='whipped-original' THEN 2200 ELSE 2900 END END;
    ELSE RAISE EXCEPTION 'Unpriced combos, extras, minis and unsupported lines cannot be reserved'; END IF;
    IF (line->>'publishedAmountPen')::numeric*100 IS DISTINCT FROM line_amount::numeric THEN
      RAISE EXCEPTION 'Published product amount mismatch'; END IF;
    subtotal:=subtotal+line_amount; lines_snapshot:=lines_snapshot||jsonb_build_array(line);
  END LOOP;
  total_minor:=subtotal+delivery_minor;

  -- Same lock as the untouched legacy RPC: serialize cross-version retries.
  PERFORM pg_advisory_xact_lock(hashtext(p_checkout_session_id::text)::bigint);
  SELECT * INTO existing FROM public.orders WHERE checkout_session_id=p_checkout_session_id FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO snap FROM public.order_guided_product_snapshots WHERE order_id=existing.id;
    IF NOT FOUND OR snap.lines IS DISTINCT FROM lines_snapshot OR snap.subtotal_minor IS DISTINCT FROM subtotal
      OR snap.delivery_fee_minor IS DISTINCT FROM delivery_minor OR snap.terms_version IS DISTINCT FROM p_terms_version
      OR existing.batch_id IS DISTINCT FROM p_batch_id
      OR existing.customer_name IS DISTINCT FROM customer_name_value OR existing.email IS DISTINCT FROM email_value
      OR existing.whatsapp IS DISTINCT FROM whatsapp_value OR existing.delivery_address IS DISTINCT FROM address_value
      OR existing.district IS DISTINCT FROM district_value OR existing.address_reference IS DISTINCT FROM reference_value
      OR existing.delivery_notes IS DISTINCT FROM notes_value OR existing.terms_accepted IS DISTINCT FROM true
      OR existing.checkout_legal_version IS DISTINCT FROM p_terms_version OR existing.checkout_legal_accepted_at IS NULL
      OR existing.payment_provider IS DISTINCT FROM 'culqi' OR existing.payment_lane IS DISTINCT FROM 'token'
      OR existing.pack_units IS DISTINCT FROM units OR existing.pack_slug IS DISTINCT FROM 'guided-v1:'||slug
      OR existing.pack_name IS DISTINCT FROM pack_name_value OR existing.pack_type IS DISTINCT FROM mix
      OR existing.payment_amount_minor IS DISTINCT FROM total_minor
      OR existing.total_amount IS DISTINCT FROM total_minor::numeric/100 OR existing.payment_currency IS DISTINCT FROM 'PEN' THEN
      RAISE EXCEPTION 'Checkout replay does not match the complete original reservation'; END IF;
    IF (SELECT coalesce(jsonb_agg(jsonb_build_object('flavorId',flavor_slug,'quantity',quantity) ORDER BY flavor_slug),'[]'::jsonb)
      FROM public.order_items WHERE order_id=existing.id) IS DISTINCT FROM coalesce(bagels_snapshot,'[]'::jsonb) THEN
      RAISE EXCEPTION 'Persisted bagel items do not match the complete reservation snapshot';
    END IF;
    IF existing.status<>'payment_pending_review' OR existing.payment_status<>'pending'
      OR existing.payment_charge_state IS DISTINCT FROM 'idle' OR existing.payment_reconciliation_required IS DISTINCT FROM false
      OR existing.payment_order_id IS NOT NULL OR existing.payment_charge_id IS NOT NULL
      OR existing.payment_expires_at IS NULL OR existing.payment_expires_at<=clock_timestamp() THEN
      RAISE EXCEPTION 'Existing reservation is expired, closed or already in payment; do not retry payment';
    END IF;
    -- New generated order code/expiry are ignored on an exact commercial replay.
    -- Never reset charge/status/expiry or create another attempt.
    RETURN jsonb_build_object('orderId',existing.id,'orderCode',existing.order_code,'expiresAt',existing.payment_expires_at,
      'checkoutSessionId',existing.checkout_session_id,'amountMinor',total_minor,'subtotalMinor',subtotal,
      'deliveryFeeMinor',delivery_minor,'currency','PEN','lines',snap.lines);
  END IF;

  SELECT * INTO batch_row FROM public.batches WHERE id=p_batch_id FOR UPDATE;
  now_ts:=clock_timestamp();
  IF NOT FOUND OR batch_row.status<>'orders_open'
    OR (batch_row.orders_open_at IS NOT NULL AND batch_row.orders_open_at>now_ts)
    OR (batch_row.orders_close_at IS NOT NULL AND batch_row.orders_close_at<=now_ts)
    OR batch_row.delivery_date IS NULL OR NOT isfinite(batch_row.delivery_date::timestamptz)
    OR p_payment_expires_at IS NULL OR NOT isfinite(p_payment_expires_at) OR p_payment_expires_at<=now_ts
    OR p_payment_expires_at>now_ts+interval '30 minutes' THEN
    RAISE EXCEPTION 'Reservation batch, delivery date or payment deadline is unavailable'; END IF;
  SELECT count(*),coalesce(sum(pack_units),0) INTO reserved_orders,reserved_bagels FROM public.orders
    WHERE batch_id=p_batch_id AND status<>'cancelled' AND NOT(payment_provider='culqi' AND payment_status IN ('pending','failed')
      AND payment_expires_at IS NOT NULL AND payment_expires_at<=now_ts);
  IF (batch_row.capacity_packs IS NOT NULL AND reserved_orders+1>batch_row.capacity_packs)
    OR (batch_row.capacity_bagels IS NOT NULL AND reserved_bagels+units>batch_row.capacity_bagels) THEN
    RAISE EXCEPTION 'Batch capacity exceeded'; END IF;

  -- A distinct pack_slug namespace makes the current legacy HTTP adapter reject
  -- every v2 order, even a bagel-only order with the same amount. The raw legacy
  -- RPC still trusts its service-role caller: never expose it directly to clients.
  -- pack_type='single' is a legacy required compatibility field for a standalone
  -- pot, NOT a fictitious bagel. Its authoritative product kind is in the snapshot;
  -- pack_units=0 and no order_items are inserted in that case. One order slot is used.
  INSERT INTO public.orders(order_code,checkout_session_id,batch_id,pack_slug,pack_name,pack_units,pack_type,
    customer_name,whatsapp,email,delivery_address,district,address_reference,delivery_notes,marketing_opt_in,
    total_amount,payment_method,payment_provider,payment_status,payment_currency,payment_amount_minor,payment_expires_at,
    terms_accepted,exact_amount_confirmed,status,payment_lane,payment_charge_state)
  VALUES(p_order_code,p_checkout_session_id,p_batch_id,'guided-v1:'||slug,pack_name_value,units,mix,
    customer_name_value,whatsapp_value,email_value,address_value,district_value,reference_value,notes_value,false,
    total_minor::numeric/100,'Culqi','culqi','pending','PEN',total_minor,p_payment_expires_at,true,true,
    'payment_pending_review','token','idle') RETURNING id INTO created_id;
  IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=created_id AND checkout_legal_version=p_terms_version
    AND checkout_legal_accepted_at IS NOT NULL) THEN RAISE EXCEPTION 'Legal evidence version mismatch'; END IF;
  IF pack_seen THEN
    FOR item IN SELECT value FROM jsonb_array_elements(bagels_snapshot) LOOP
      INSERT INTO public.order_items(order_id,flavor_slug,flavor_name,quantity)
      VALUES(created_id,item->>'flavorId',CASE item->>'flavorId' WHEN 'everything' THEN 'Everything' WHEN 'sesame' THEN 'Sesame'
        WHEN 'plain' THEN 'Plain' WHEN 'classic-onion' THEN 'Classic Onion' WHEN 'cinnamon-raisin' THEN 'Cinnamon Raisin'
        WHEN 'blueberry' THEN 'Blueberry' END,(item->>'quantity')::integer);
    END LOOP;
  END IF;
  INSERT INTO public.order_guided_product_snapshots(order_id,lines,subtotal_minor,delivery_fee_minor,terms_version)
    VALUES(created_id,lines_snapshot,subtotal,delivery_minor,p_terms_version);
  INSERT INTO public.order_status_history(order_id,old_status,new_status,changed_by)
    VALUES(created_id,NULL,'payment_pending_review','guided_product_reservation');
  RETURN jsonb_build_object('orderId',created_id,'orderCode',p_order_code,'expiresAt',p_payment_expires_at,
    'checkoutSessionId',p_checkout_session_id,'amountMinor',total_minor,'subtotalMinor',subtotal,
    'deliveryFeeMinor',delivery_minor,'currency','PEN','lines',lines_snapshot);
END $$;
REVOKE ALL ON FUNCTION public.create_guided_product_reservation(text,uuid,uuid,jsonb,jsonb,integer,text,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_guided_product_reservation(text,uuid,uuid,jsonb,jsonb,integer,text,timestamptz) TO service_role;
-- Read immutable commercial detail after payment or after intake is closed.
-- Only a trusted backend may call this; no consumer API is introduced here.
CREATE OR REPLACE FUNCTION public.read_guided_product_reservation(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE o public.orders%rowtype; s public.order_guided_product_snapshots%rowtype;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO s FROM public.order_guided_product_snapshots WHERE order_id=p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF o.pack_slug NOT LIKE 'guided-v1:%' OR o.payment_currency IS DISTINCT FROM 'PEN'
    OR o.payment_amount_minor IS DISTINCT FROM s.subtotal_minor+s.delivery_fee_minor
    OR o.total_amount IS DISTINCT FROM (s.subtotal_minor+s.delivery_fee_minor)::numeric/100
    OR (SELECT sum((value->>'publishedAmountPen')::numeric*100) FROM jsonb_array_elements(s.lines))
      IS DISTINCT FROM s.subtotal_minor::numeric THEN
    RAISE EXCEPTION 'Persisted commercial snapshot is inconsistent';
  END IF;
  RETURN jsonb_build_object('orderId',o.id,'orderCode',o.order_code,'schemaVersion',s.schema_version,
    'lines',s.lines,'subtotalMinor',s.subtotal_minor,'deliveryFeeMinor',s.delivery_fee_minor,
    'amountMinor',o.payment_amount_minor,'currency',o.payment_currency,'termsVersion',s.terms_version,
    'paymentStatus',o.payment_status,'createdAt',s.created_at);
END $$;
REVOKE ALL ON FUNCTION public.read_guided_product_reservation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_guided_product_reservation(uuid) TO service_role;

-- Record fingerprints only after all object definitions and grants are complete.
-- Fail closed on name collisions or definition drift. Versioned fingerprints
-- cover definitions only, never policy state or snapshot rows. Replays preserve data.
DO $$
DECLARE obj record; fingerprint text;
BEGIN
  FOR obj IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relname IN ('guided_product_reservation_policy','order_guided_product_snapshots') LOOP
    SELECT md5(jsonb_build_object(
      'relation',(SELECT jsonb_build_array(relkind,relowner,relrowsecurity,relforcerowsecurity,relacl) FROM pg_class WHERE oid=obj.oid),
      'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
        a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=obj.oid AND a.attnum>0 AND NOT a.attisdropped),
      'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid,true) ORDER BY conname) FROM pg_constraint WHERE conrelid=obj.oid),
      'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid::regclass::text) FROM pg_index WHERE indrelid=obj.oid),
      'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid,true) ORDER BY tgname) FROM pg_trigger WHERE tgrelid=obj.oid AND NOT tgisinternal),
      'policies',(SELECT jsonb_agg(to_jsonb(pol)-'oid' ORDER BY polname) FROM pg_policy pol WHERE polrelid=obj.oid)
    )::text) INTO fingerprint;
    EXECUTE format('COMMENT ON TABLE public.%I IS %L',obj.relname,'bagelito-guided-products-v1:'||fingerprint);
  END LOOP;
  FOR obj IN SELECT p.oid,p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='public' AND p.proname IN ('create_guided_product_reservation','read_guided_product_reservation') LOOP
    fingerprint:=md5(pg_get_functiondef(obj.oid));
    EXECUTE format('COMMENT ON FUNCTION %s IS %L',obj.signature,'bagelito-guided-products-v1:'||fingerprint);
  END LOOP;
END $$;
COMMIT;
