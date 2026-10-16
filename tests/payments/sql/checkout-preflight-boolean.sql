-- Adversarial legacy contract, only in a fresh isolated foundation clone.
do $$ begin
  if current_database() <> 'bagelito_preflight_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated preflight database and explicit test mode required';
  end if;
end $$;
create function public.claim_culqi_charge(uuid,text,text,boolean)
returns boolean language plpgsql as $$ begin return false; end $$;
revoke all on function public.claim_culqi_charge(uuid,text,text,boolean) from public,anon,authenticated,service_role;
\echo SEEDED incompatible synthetic prior claim contract
