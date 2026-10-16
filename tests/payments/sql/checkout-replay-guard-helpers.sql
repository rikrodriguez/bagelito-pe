-- Test helpers only. Snapshots stay inside PostgreSQL and are never printed.
do $$ begin
  if current_database() <> 'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated bagelito_test database and explicit test mode required';
  end if;
end $$;

create or replace function pg_temp.seed_checkout_replay_guard(
  p_tag text, p_state text default 'uncertain', p_known_charge boolean default false
) returns uuid language plpgsql as $$
declare b uuid; o uuid; claim jsonb;
begin
  if p_tag !~ '^[A-Za-z0-9]{1,24}$' or p_state not in
    ('idle','submitting','requires_3ds','submitted','uncertain') then
    raise exception 'Invalid synthetic replay fixture';
  end if;
  insert into public.batches(name,status,orders_open_at,orders_close_at)
    values('SYNTHETIC REPLAY GUARD','orders_open',clock_timestamp()-interval '1 day',
      clock_timestamp()+interval '1 day') returning id into b;
  select order_id into o from public.create_culqi_reservation_order(
    'BAG-SYNTHETIC-RG-'||upper(p_tag),gen_random_uuid(),b,'6-single','Synthetic six',6,'single',
    'Synthetic','000000000','replay@example.invalid','Synthetic','Lince','','',false,66,
    clock_timestamp()+interval '30 minutes',true,
    '[{"flavor_slug":"plain","flavor_name":"Synthetic plain","quantity":6}]'::jsonb);
  perform public.prepare_culqi_token_session(o);
  if p_state='idle' then return o; end if;
  claim := public.claim_culqi_charge(o,'tkn_test_SYNTHETICReplayGuard'||p_tag,'device_synthetic',false);
  if claim->>'claimed' is distinct from 'true' then raise exception 'Synthetic replay claim failed'; end if;
  if p_state <> 'submitting' then
    perform public.finish_culqi_charge(o,(claim->>'attempt_id')::uuid,p_state,
      case when p_known_charge or p_state='submitted' then 'chr_test_SYNTHETICReplayGuard'||p_tag else null end,
      'card','{}');
  end if;
  return o;
end $$;

create or replace function pg_temp.checkout_replay_guard_snapshot()
returns jsonb language sql as $$
select jsonb_build_object(
  'orders',(select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb) from public.orders o),
  'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from public.payment_attempts a),
  'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id),'[]'::jsonb) from public.order_status_history h),
  'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.payment_webhook_events e),
  'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) from public.order_items i),
  'batches',(select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]'::jsonb) from public.batches b),
  'functions',(select coalesce(jsonb_agg(jsonb_build_object(
    'oid',p.oid,'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
    'owner',p.proowner,'return_type',p.prorettype,'acl',p.proacl,
    'configuration',p.proconfig,'security_definer',p.prosecdef) order by p.oid),'[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('enforce_reservation_window','claim_culqi_order_preparation',
        'prepare_culqi_token_session','claim_culqi_charge','finish_culqi_charge',
        'apply_culqi_payment_event','attach_culqi_order','create_culqi_reservation_order',
        'expire_culqi_token_session','guard_culqi_checkout_replay')),
  'triggers',(select coalesce(jsonb_agg(jsonb_build_object('oid',t.oid,
    'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.oid),'[]'::jsonb)
    from pg_trigger t where t.tgrelid in ('public.orders'::regclass,'public.payment_attempts'::regclass)
      and not t.tgisinternal),
  'indexes',(select coalesce(jsonb_agg(jsonb_build_object('oid',i.indexrelid,
    'definition',pg_get_indexdef(i.indexrelid)) order by i.indexrelid),'[]'::jsonb)
    from pg_index i where i.indrelid in ('public.orders'::regclass,'public.payment_attempts'::regclass)),
  'columns',(select coalesce(jsonb_agg(jsonb_build_object(
    'table',a.attrelid,'number',a.attnum,'name',a.attname,'type',a.atttypid,
    'type_modifier',a.atttypmod,'not_null',a.attnotnull,'identity',a.attidentity,
    'generated',a.attgenerated,'collation',a.attcollation,'has_default',a.atthasdef,
    'dropped',a.attisdropped,'default',pg_get_expr(d.adbin,d.adrelid))
    order by a.attrelid,a.attnum),'[]'::jsonb)
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid in ('public.orders'::regclass,'public.payment_attempts'::regclass) and a.attnum>0),
  'constraints',(select coalesce(jsonb_agg(jsonb_build_object(
    'oid',c.oid,'name',c.conname,'table',c.conrelid,'type',c.contype,
    'index',c.conindid,'parent',c.conparentid,'validated',c.convalidated,
    'deferrable',c.condeferrable,'deferred',c.condeferred,'no_inherit',c.connoinherit,
    'columns',c.conkey,'definition',pg_get_constraintdef(c.oid,true)) order by c.oid),'[]'::jsonb)
    from pg_constraint c where c.conrelid in ('public.orders'::regclass,'public.payment_attempts'::regclass))
);
$$;
