// Operator runbook through native compiled Next actions/routes and isolated real SQL.
// No hosted app/QA URL, provider, communication service, session export or remote DB.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { operatorPostgrest } from './fixtures/operator-postgrest.mjs';
import { restoreOperatorFixture } from './fixtures/operator-backup-restore.mjs';
import { sourceModule } from './helpers/load-ts.mjs';
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--backup-restore'), 'Usage: node tests/operator-flow-http.mjs [--backup-restore]');
const backupRestore = process.argv[2] === '--backup-restore';
const root = fileURLToPath(new URL('../', import.meta.url));
const work = await mkdtemp(path.join(tmpdir(), 'bagelito-operator-http-'));
await mkdir(path.join(work, 'docker-config'));
const container = 'bagelito-operator-http-' + randomBytes(8).toString('hex');
const image = 'postgres:17.11-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df';
const quote = v => "'" + String(v).replaceAll("'", "''") + "'";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function docker(args, input, allowFailure = false) {
    const r = spawnSync('docker', ['--config', path.join(work, 'docker-config'), ...args], { input, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024, env: { PATH: process.env.PATH, DOCKER_HOST: 'unix:///var/run/docker.sock' } });
    if (r.status !== 0 && !allowFailure)
        throw new Error('Isolated operator PostgreSQL failed: ' + r.stderr.slice(-600));
    return r;
}
let database = 'bagelito_test';
function sql(statement, json = false) {
    const r = docker(['exec', '-i', container, '/usr/lib/postgresql/17/bin/psql', '-X', '-qAt', '-h', '/tmp', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', '-'], statement);
    return json ? JSON.parse(r.stdout.trim()) : r.stdout;
}
let bridge, child;
let logs = '';
let capabilities = [];
try {
    docker(['run', '--rm', '--pull=never', '--platform', 'linux/amd64', '--name', container, '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,mode=1777', '--user', 'postgres', '--entrypoint', 'bash', '-d', image, '-ceu', `/usr/lib/postgresql/17/bin/initdb -D /tmp/data --auth=trust >/tmp/init.log 2>&1
 exec /usr/lib/postgresql/17/bin/postgres -D /tmp/data -h '' -k /tmp`]);
    let ready = false;
    for (let i = 0; i < 150; i++) {
        if (docker(['exec', container, '/usr/lib/postgresql/17/bin/pg_isready', '-q', '-h', '/tmp', '-U', 'postgres'], undefined, true).status === 0) {
            ready = true;
            break;
        }
        await pause(50);
    }
    assert.ok(ready, 'Owned local PostgreSQL must start');
    docker(['exec', '-i', container, '/usr/lib/postgresql/17/bin/psql', '-X', '-q', '-h', '/tmp', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'], 'create role anon; create role authenticated; create role service_role bypassrls; create database bagelito_test;');
    sql('create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
    for (const file of ['setup-bagelito-reservations.sql', 'add-public-api-hardening.sql', 'add-payment-provider.sql', 'add-checkout-safety.sql', 'add-culqi-session-expiry.sql', 'add-culqi-checkout-replay-guard.sql', 'add-culqi-retry-pending-state.sql', 'add-batch-financial-costs.sql', 'add-monitoring-alerts.sql']) {
        sql((await readFile(path.join(root, 'supabase', file), 'utf8')).replace(/^create extension if not exists pgcrypto;\s*$/gm, ''));
    }
    sql(`truncate public.batches cascade;
 insert into public.batches(id,name,status,capacity_packs,capacity_bagels,created_at,orders_close_at,delivery_date) values
 ('10000000-0000-4000-8000-000000000001','Old isolated batch','orders_open',10,120,now()-interval '2 days',now()+interval '1 day',now()+interval '3 days'),
 ('10000000-0000-4000-8000-000000000002','Current isolated batch','orders_open',6,60,now(),now()+interval '1 day',now()+interval '3 days');`);
    const current = '10000000-0000-4000-8000-000000000002';
    const rows = [['A', '12-mixed', 12, 123, 'Lince', 'payment_confirmed', 'paid', false], ['B', '6-single', 6, 66, 'Miraflores', 'payment_confirmed', 'paid', false], ['PENDING', '6-mixed', 6, 68, 'Lince', 'payment_pending_review', 'pending', false], ['EXPIRED', '6-single', 6, 58, 'Lince', 'payment_pending_review', 'pending', true], ['CANCELLED', '6-single', 6, 58, 'Lince', 'cancelled', 'pending', false], ['OLD', '6-single', 6, 74, 'Barranco', 'payment_confirmed', 'paid', false]];
    for (const [tag, slug, units, amount, district, status, payment, expired] of rows) {
        const batch = tag === 'OLD' ? '10000000-0000-4000-8000-000000000001' : current;
        const name = tag === 'A' ? 'QA "Local", Baker' : tag === 'OLD' ? 'Old Batch Synthetic' : 'QA Local ' + tag;
        sql(`with o as (insert into public.orders(batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,customer_name,whatsapp,email,delivery_address,district,delivery_notes,total_amount,status,payment_provider,payment_lane,payment_status,payment_amount_minor,payment_currency,payment_expires_at,payment_paid_at)
   values(${quote(batch)}::uuid,gen_random_uuid(),${quote('BAG-OPS-' + tag)},${quote(slug)},${quote(tag === 'A' ? '12 mixed' : '6 single')},${units},${quote(slug.includes('mixed') ? 'mixed' : 'single')},${quote(name)},'00000000${tag === 'B' ? 2 : 1}',${quote(tag.toLowerCase() + '@example.invalid')},'Synthetic address',${quote(district)},${quote('Delivery: S/' + (amount - (tag === 'A' ? 115 : tag === 'PENDING' ? 60 : 50)) + (tag === 'B' ? ' | Recibir en porteria' : ''))},${amount},${quote(status)},'culqi','token',${quote(payment)},${amount * 100},'PEN',now()+interval '${expired ? '-1' : '30'} minutes',${payment === 'paid' ? 'now()' : 'null'}) returning id)
   insert into public.order_items(order_id,flavor_slug,flavor_name,quantity) select id,'sesame','Sesame',${units} from o;`);
    }
    sql("update public.batches set status='closed';");
    const serviceKey = 'synthetic-operator-' + randomBytes(20).toString('hex');
    sql('grant usage on schema public to service_role; grant select on public.batches,public.orders,public.order_items,public.order_status_history,public.waitlist_signups to service_role; grant update on public.batches,public.orders to service_role; grant insert on public.order_status_history to service_role;');
    const restoration = backupRestore ? restoreOperatorFixture({ docker, container, sql, selectDatabase(value) { assert.equal(value, 'bagelito_restored_test'); database = value; } }) : {};
    bridge = await operatorPostgrest((statement, json) => sql('set role service_role; ' + statement, json), serviceKey);
    const socket = createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const password = 'Synthetic-Operator1-' + randomBytes(20).toString('hex');
    const secret = randomBytes(32).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const session = `v1.${now}.${now + 28800}.${randomBytes(24).toString('base64url')}`;
    const key = createHmac('sha256', secret).update(password).digest();
    const cookie = session + '.' + createHmac('sha256', key).update(`bagelito-admin:${origin}:${session}`).digest('base64url');
    capabilities = [cookie, password, secret, serviceKey];
    const cwd = path.join(work, 'next');
    await mkdir(cwd);
    await symlink(path.join(root, '.next'), path.join(cwd, '.next'));
    await symlink(path.join(root, 'node_modules'), path.join(cwd, 'node_modules'));
    const runner = path.join(cwd, 'run.cjs');
    await writeFile(runner, `const http=require('node:http');const next=require(${JSON.stringify(path.join(root, 'node_modules/next'))});const app=next({dev:false,dir:${JSON.stringify(cwd)},hostname:'127.0.0.1',port:${port}});app.prepare().then(()=>http.createServer(app.getRequestHandler()).listen(${port},'127.0.0.1',()=>console.log('OPERATOR_READY')));`);
    const audit = path.join(work, 'audit.jsonl');
    await writeFile(audit, '', { mode: 0o600 });
    child = spawn(process.execPath, [runner], { cwd, env: { PATH: process.env.PATH, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.origin, SUPABASE_SERVICE_ROLE_KEY: serviceKey, ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: secret, CULQI_ENABLED: 'false', CULQI_MODE: 'disabled', NODE_OPTIONS: `--import=${path.join(root, 'tests/fixtures/operator-network-guard.mjs')}`, OPERATOR_FIXTURE_ORIGIN: bridge.origin, OPERATOR_FIXTURE_AUDIT: audit }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', v => logs += v);
    child.stderr.on('data', v => logs += v);
    for (let i = 0; !logs.includes('OPERATOR_READY'); i++) {
        if (i > 600 || child.exitCode !== null)
            throw new Error('Local native Next failed: ' + logs.slice(-1500));
        await pause(25);
    }
    const manifest = JSON.parse(await readFile(path.join(root, '.next/server/server-reference-manifest.json'), 'utf8'));
    const actionId = name => { const e = Object.entries(manifest.node).find(([, v]) => v.filename === 'app/admin/actions.ts' && v.exportedName === name); assert.ok(e, `Native action ${name} must be built`); return e[0]; };
    async function call(url, { method = 'GET', body, auth = true, headers = {} } = {}) {
        return new Promise((resolve, reject) => { const req = request({ host: '127.0.0.1', port, path: url, method, headers: { host: `127.0.0.1:${port}`, origin, ...(auth ? { cookie: `bagelito_admin=${cookie}` } : {}), ...headers } }, res => { let text = ''; res.setEncoding('utf8'); res.on('data', v => text += v); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text })); }); req.on('error', reject); req.setTimeout(20000, () => req.destroy(new Error('Local fixture HTTP deadline'))); req.end(body); });
    }
    async function action(name, values, auth = true) {
        const form = new FormData();
        form.set('$ACTION_ID_' + actionId(name), '');
        for (const [key, value] of Object.entries(values))
            form.set(key, value);
        const encoded = new Request(origin + '/admin', { method: 'POST', body: form });
        return call('/admin', { method: 'POST', auth, body: Buffer.from(await encoded.arrayBuffer()), headers: { 'content-type': encoded.headers.get('content-type') } });
    }
    const orderId = code => sql(`select to_jsonb(id) from public.orders where order_code=${quote(code)};`, true);
    const data = () => sql(`select jsonb_build_object('batch',(select to_jsonb(b) from public.batches b where id=${quote(current)}::uuid),'orders',(select jsonb_agg(to_jsonb(o)||jsonb_build_object('order_items',(select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id=o.id),'order_status_history',coalesce((select jsonb_agg(to_jsonb(h)) from public.order_status_history h where h.order_id=o.id),'[]'::jsonb))) from public.orders o));`, true);
    const q = sourceModule('src/lib/admin/queries.ts');
    function state(expectedStage, received = 0) {
        const d = data();
        const plan = q.getProductionOpsPlan(d.batch, d.orders);
        const stats = q.getBatchStats(d.batch, d.orders);
        const finance = q.getFinancialSummary(d.batch, d.orders);
        assert.equal(plan.totalPacks, 2);
        assert.equal(plan.totalBagels, 18);
        assert.equal(plan.stages.find(s => s.key === expectedStage).packs, 2);
        assert.equal(plan.packingList.reduce((n, v) => n + v.quantity, 0), 18);
        assert.equal(stats.reservedPacks, 3);
        assert.equal(stats.reservedBagels, 24);
        assert.equal(stats.remainingPacks, 3);
        assert.equal(finance.confirmedSales, 189);
        assert.equal(finance.confirmedProductSales, 165);
        assert.equal(finance.estimatedNetProfit, 122);
        assert.equal(plan.stages.find(s => s.key === 'done').packs, received);
        assert.ok(plan.orders.every(order => order.payment_status === 'paid'));
        return d;
    }
    const beforeWrites = bridge.writes.length;
    for (const kind of ['production', 'delivery', 'driver', 'orders', 'waitlist']) {
        const denied = await call('/admin/export/' + kind, { auth: false });
        assert.ok([303, 307].includes(denied.status));
        assert.ok(denied.headers.location.includes('/admin/login'));
    }
    assert.equal(bridge.writes.length, beforeWrites);
    if (backupRestore) {
        const waitlist = await call('/admin?section=waitlist');
        assert.equal(waitlist.status, 200);
        for (const label of ['Instagram', 'delivery-fixture', 'reel-1', 'Direct / waitlist']) assert.ok(waitlist.text.includes(label));
        const exported = await call('/admin/export/waitlist');
        assert.equal(exported.status, 200);
        const csv = exported.text.split('\n').map(line => line.split(','));
        assert.deepEqual(csv[0].slice(-5), ['UTM source', 'UTM medium', 'UTM campaign', 'UTM content', 'UTM term']);
        assert.deepEqual(csv.find(row => row.includes('QA Restored Campaign')).slice(-5), ['instagram', 'social', 'delivery-fixture', 'reel-1', '']);
        assert.deepEqual(csv.find(row => row.includes('QA Restored Direct')).slice(-5), ['', '', '', '', '']);
        assert.equal(sql('select to_jsonb(count(*)) from public.waitlist_signups where consent_accepted;', true), 2);
        restoration.attributionAfterRestore = true;
    }
    // Natural hold expiry releases capacity without mutating persisted payment
    // state. A read-only admin render must preserve that distinction and must
    // not claim a webhook was verified merely because the provider is Culqi.
    const beforeExpiredView = data();
    const expiredOrder = beforeExpiredView.orders.find(order => order.order_code === 'BAG-OPS-EXPIRED');
    assert.equal(expiredOrder.status, 'payment_pending_review');
    assert.equal(expiredOrder.payment_status, 'pending');
    assert.equal(expiredOrder.payment_charge_state, 'idle');
    assert.equal(expiredOrder.payment_charge_id, null);
    assert.equal(q.getPaymentDisplay(expiredOrder), 'Culqi · pending');
    assert.equal(q.getBatchStats(beforeExpiredView.batch, [expiredOrder]).reservedPacks, 0);
    assert.equal(q.getDashboardStats([expiredOrder]).confirmedRevenue, 0);
    assert.equal(q.getProductionOpsPlan(beforeExpiredView.batch, [expiredOrder]).totalPacks, 0);
    assert.equal(q.getFinancialSummary(beforeExpiredView.batch, [expiredOrder]).pendingSales, 58);
    const beforeExpiredViewWrites = bridge.writes.length;
    const expiredView = await call('/admin?section=customers&q=BAG-OPS-EXPIRED');
    assert.equal(expiredView.status, 200);
    assert.ok(expiredView.text.includes('BAG-OPS-EXPIRED'));
    assert.ok(expiredView.text.includes('Not confirmed'));
    assert.ok(expiredView.text.includes('Culqi · pending'));
    assert.equal(bridge.writes.length, beforeExpiredViewWrites);
    assert.deepEqual(data(), beforeExpiredView, 'Viewing an expired idle hold must not cancel, renew or settle it');
    assert.ok(!expiredView.text.includes('webhook verified'), 'An expired pending hold without payment evidence must not claim webhook verification');
    assert.ok(expiredView.text.includes('No voucher required · managed by Culqi'));
    const costs = { batchId: current, ingredientCostPerBagel: '2', packagingCostPerPack: '3', actualDeliveryCost: '20', otherBatchCost: '5' };
    let response = await action('updateBatchFinancialCosts', costs, false);
    assert.ok([303, 307].includes(response.status));
    assert.equal(bridge.writes.length, beforeWrites);
    response = await action('updateBatchFinancialCosts', costs);
    assert.equal(response.status, 303, response.text.slice(-300));
    for (const zero of ['ingredientCostPerBagel', 'packagingCostPerPack'])
        costs[zero] = '0';
    assert.equal((await action('updateBatchFinancialCosts', costs)).status, 303);
    let d = data();
    assert.equal(d.batch.ingredient_cost_per_bagel, 0);
    assert.equal(d.batch.packaging_cost_per_pack, 0);
    costs.ingredientCostPerBagel = '2';
    costs.packagingCostPerPack = '3';
    assert.equal((await action('updateBatchFinancialCosts', costs)).status, 303);
    const close = new Date(Date.now() + 86400000).toISOString();
    const delivery = new Date(Date.now() + 3 * 86400000).toISOString();
    assert.equal((await action('updateBatchSettings', { batchId: current, name: 'Current isolated batch', intent: 'open', status: 'orders_open', capacityPacks: '6', capacityBagels: '60', ordersCloseAt: close, deliveryDate: delivery })).status, 303);
    assert.equal(data().batch.status, 'orders_open');
    state('bake');
    assert.equal((await action('closeCurrentBatch', { batchId: current })).status, 303);
    assert.equal(data().batch.status, 'closed');
    assert.equal(q.getBatchStats(data().batch, data().orders).acceptingReservations, false);
    assert.equal((await action('updateBatchSettings', { batchId: current, name: 'Current isolated batch', status: 'in_production', capacityPacks: '6', capacityBagels: '60', deliveryDate: delivery })).status, 303);
    assert.equal(data().batch.status, 'in_production');
    for (const kind of ['production', 'delivery', 'driver', 'orders']) {
        response = await call('/admin/export/' + kind);
        assert.equal(response.status, 200);
        assert.ok(response.headers['content-type'].includes('text/csv'));
        if (kind !== 'orders') {
            assert.ok(!response.text.includes('Old Batch Synthetic'));
            assert.ok(!response.text.includes('BAG-OPS-OLD'));
            assert.ok(!response.text.includes('BAG-OPS-PENDING'));
            assert.ok(!response.text.includes('BAG-OPS-EXPIRED'));
            assert.ok(!response.text.includes('BAG-OPS-CANCELLED'));
        }
        else
            assert.ok(response.text.includes('BAG-OPS-OLD'));
        if (kind === 'driver') {
            assert.ok(response.text.includes('"QA ""Local"", Baker"'));
            assert.ok(response.text.includes('Front desk'));
        }
    }
    response = await call('/admin?section=delivery');
    assert.equal(response.status, 200);
    assert.ok(!response.text.includes('Old Batch Synthetic'), 'Admin delivery must match the current-batch CSV');
    async function track(code, contact) {
        const response = await call('/api/track', { method: 'POST', auth: false,
            body: JSON.stringify({ orderCode: code, contact }), headers: { 'content-type': 'application/json' } });
        assert.equal(response.status, 200, response.text);
        const dto = JSON.parse(response.text).order;
        for (const field of ['email', 'whatsapp', 'deliveryAddress', 'payment_charge_id', 'id']) assert.ok(!(field in dto));
        assert.ok(dto.history.every(item => Object.keys(item).sort().join(',') === 'createdAt,status'));
        return dto;
    }
    assert.equal((await track('BAG-OPS-A')).status, 'payment_confirmed');
    const pending = await action('quickUpdateOrderStatus', { orderId: orderId('BAG-OPS-PENDING'), orderCode: 'BAG-OPS-PENDING', status: 'in_production', returnTo: '/admin?section=production' });
    assert.equal(pending.status, 500);
    assert.equal(sql("select to_jsonb(status) from public.orders where order_code='BAG-OPS-PENDING';", true), 'payment_pending_review');
    for (const [status, stage] of [['in_production', 'pack'], ['ready_for_delivery', 'deliver'], ['delivered', 'done']]) {
        for (const tag of ['A', 'B']) {
            const id = orderId('BAG-OPS-' + tag);
            response = await action('quickUpdateOrderStatus', { orderId: id, orderCode: 'BAG-OPS-' + tag, status, returnTo: '/admin?section=production' });
            assert.equal(response.status, 303, response.text.slice(-300));
        }
        state(stage, status === 'delivered' ? 2 : 0);
        assert.equal((await track('BAG-OPS-A')).status, status);
    }
    const history = sql("select jsonb_agg(new_status order by created_at,id) from public.order_status_history where order_id=(select id from public.orders where order_code='BAG-OPS-A');", true);
    assert.deepEqual(history, ['in_production', 'ready_for_delivery', 'delivered']);
    assert.equal((await action('quickUpdateOrderStatus', { orderId: orderId('BAG-OPS-A'), orderCode: 'BAG-OPS-A', status: 'delivered' })).status, 303);
    assert.equal(sql("select to_jsonb(count(*)) from public.order_status_history where order_id=(select id from public.orders where order_code='BAG-OPS-A');", true), 3);
    response = await call('/admin/export/driver');
    assert.equal((response.text.match(/DONE/g) ?? []).length, 2);
    const missing = await call('/api/track', { method: 'POST', auth: false, body: JSON.stringify({ orderCode: 'BAG-OPS-NOT-FOUND' }), headers: { 'content-type': 'application/json' } });
    assert.equal(missing.status, 404);
    assert.equal((await track('', 'A@EXAMPLE.INVALID')).orderCode, 'BAG-OPS-A');
    assert.equal((await track('', '000000002')).orderCode, 'BAG-OPS-B');
    assert.equal((await track('BAG-OPS-OLD')).orderCode, 'BAG-OPS-OLD');
    assert.equal((await action('updateBatchSettings', { batchId: current, name: 'Current isolated batch', status: 'delivered', capacityPacks: '6', capacityBagels: '60', deliveryDate: delivery })).status, 303);
    assert.equal(data().batch.status, 'delivered');
    state('done', 2);
    assert.deepEqual(bridge.errors, [], 'Transport fixtures must recognize every application operation');
    assert.equal((await readFile(audit, 'utf8')).trim(), '', 'Application fetch must never attempt an external origin');
    assert.equal(sql('select to_jsonb(count(*)) from public.monitoring_alert_events where last_sent_at is not null;', true), 0, 'No monitoring notification can be sent');
    assert.ok(![cookie, password, secret, serviceKey].some(value => logs.includes(value)), 'Local runtime logs must not expose synthetic auth capabilities');
    const final = data();
    const finalFinance = q.getFinancialSummary(final.batch, final.orders);
    const finalCapacity = q.getBatchStats(final.batch, final.orders);
    console.log(JSON.stringify({ fixture: 'operator-runbook', ...restoration, paidOrders: 2, productionBagels: 18, confirmedSales: finalFinance.confirmedSales, netProfit: finalFinance.estimatedNetProfit, reservedPacks: finalCapacity.reservedPacks, reservedBagels: finalCapacity.reservedBagels, received: 2, externalFetchAttempts: 0, notificationsSent: 0, hostedDatabaseAccess: false }));
    console.log('PASS: native operator batch open/close -> production -> packing -> delivery/received; independent tracking, authenticated CSV/current-batch isolation, capacity and financial invariants, zero costs, unpaid/auth guards; isolated PostgreSQL17, no hosted data or external transport.');
}
catch (error) {
    let diagnostic = logs;
    for (const value of capabilities)
        diagnostic = diagnostic.replaceAll(value, '[synthetic-capability-redacted]');
    console.error('Local fixture diagnostics:', JSON.stringify(bridge?.errors ?? []), diagnostic.slice(-5000));
    throw error;
}
finally {
    if (child) {
        child.kill('SIGTERM');
        await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    }
    if (bridge)
        await new Promise(resolve => bridge.server.close(resolve));
    docker(['rm', '-f', container], undefined, true);
    await rm(work, { recursive: true, force: true });
}
