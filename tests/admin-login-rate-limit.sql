-- Synthetic local-only fixture; never execute against a remote application DB.
begin;
do $$
declare r record; i integer;
begin
 if current_database() <> 'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then raise exception 'Isolated test database required'; end if;
 for i in 1..5 loop
  select * into r from consume_api_rate_limit('admin_login_ip','synthetic-hash',5,900);
  if not r.allowed or r.hits<>i then raise exception 'Expected admitted attempt %',i; end if;
 end loop;
 select * into r from consume_api_rate_limit('admin_login_ip','synthetic-hash',5,900);
 if r.allowed or r.retry_after_seconds<>900 then raise exception 'Sixth attempt must block'; end if;
 update api_rate_limits set window_started_at=now()-interval '901 seconds' where scope='admin_login_ip' and identifier_hash='synthetic-hash';
 select * into r from consume_api_rate_limit('admin_login_ip','synthetic-hash',5,900);
 if not r.allowed or r.hits<>1 then raise exception 'Expired window must recover'; end if;
 for i in 1..20 loop
  select * into r from consume_api_rate_limit('admin_login_global','single-admin',20,900);
  if not r.allowed then raise exception 'Global premature block'; end if;
 end loop;
 select * into r from consume_api_rate_limit('admin_login_global','single-admin',20,900);
 if r.allowed then raise exception 'Global ceiling exceeded'; end if;
 if has_function_privilege('anon','public.consume_api_rate_limit(text,text,integer,integer)','EXECUTE') or has_function_privilege('authenticated','public.consume_api_rate_limit(text,text,integer,integer)','EXECUTE') then raise exception 'Untrusted role may reset counters'; end if;
end $$;
rollback;
