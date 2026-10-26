// Disposable local fixture only. The dump never leaves the owned container tmpfs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function restoreOperatorFixture({ docker, container, sql, selectDatabase }) {
    assert.match(container, /^bagelito-operator-http-[a-f0-9]{16}$/);
    assert.deepEqual(sql("select jsonb_build_array(current_database(),current_setting('data_directory'),current_setting('server_version_num'));", true), ['bagelito_test', '/tmp/data', '170011']);
    sql(`select setval('public.bagelito_order_code_seq',41,true);
      insert into public.waitlist_signups(customer_name,whatsapp,email,preferred_pack_slug,preferred_pack_name,locale,source,consent_accepted) values
      ('QA Restored Campaign','000000000','campaign@example.invalid','12-mixed','12 mixed','es','utm:v1:utm_source=instagram&utm_medium=social&utm_campaign=delivery-fixture&utm_content=reel-1',true),
      ('QA Restored Direct','000000000','direct@example.invalid','6-single','6 single','en','waitlist_page',true);`);
    const tables = ['public.batches', 'public.orders', 'public.order_items', 'public.order_status_history', 'public.waitlist_signups', 'public.payment_attempts', 'public.payment_webhook_events', 'public.api_rate_limits', 'public.monitoring_alert_events', 'storage.buckets'];
    const rows = tables.map(table => `'${table}',(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) from ${table} r)`).join(',');
    // Compare names/definitions rather than OIDs, which a logical restore replaces.
    const snapshot = () => sql(`select jsonb_build_object(
      'rows',jsonb_build_object(${rows}),
      'sequence',(select jsonb_build_array(last_value,is_called) from public.bagelito_order_code_seq),
      'relations',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),c.relacl) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage') and c.relkind in ('r','S','v')),
      'columns',(select jsonb_agg(to_jsonb(c)-array['table_catalog','udt_catalog','domain_catalog','scope_catalog'] order by table_schema,table_name,ordinal_position) from information_schema.columns c where table_schema in ('public','storage')),
      'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid)) order by n.nspname,c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage')),
      'indexes',(select jsonb_agg(to_jsonb(i) order by schemaname,tablename,indexname) from pg_indexes i where schemaname in ('public','storage')),
      'functions',(select jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl,p.proconfig) order by p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
      'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage') and not t.tgisinternal),
      'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','storage')),
      'schemas',(select jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),nspacl) order by nspname) from pg_namespace where nspname in ('public','storage')),
      'defaultACLs',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,d.defaclacl) order by n.nspname,d.defaclobjtype) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace)
    );`, true);
    const before = snapshot();
    docker(['exec', container, '/usr/lib/postgresql/17/bin/pg_dump', '-h', '/tmp', '-U', 'postgres', '-d', 'bagelito_test', '-Fc', '-f', '/tmp/operator-fixture.dump']);
    docker(['exec', container, '/usr/lib/postgresql/17/bin/psql', '-X', '-h', '/tmp', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'create database bagelito_restored_test;']);
    docker(['exec', container, '/usr/lib/postgresql/17/bin/pg_restore', '--exit-on-error', '--single-transaction', '-h', '/tmp', '-U', 'postgres', '-d', 'bagelito_restored_test', '/tmp/operator-fixture.dump']);
    selectDatabase('bagelito_restored_test');
    assert.equal(sql('select to_jsonb(current_database());', true), 'bagelito_restored_test');
    assert.deepEqual(snapshot(), before, 'Logical restore must preserve fixture data and schema/ACL contracts');
    assert.equal(sql("select to_jsonb(nextval('public.bagelito_order_code_seq'));", true), 42, 'Restored nonempty sequence must continue without reuse');
    return { backupRestored: true, database: 'bagelito_restored_test', snapshotPreserved: true, snapshotSha256: createHash('sha256').update(JSON.stringify(before)).digest('hex') };
}
