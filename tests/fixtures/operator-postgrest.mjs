// Minimal PostgREST transport for the existing native HTTP fixture pattern.
// Every record belongs to a disposable PostgreSQL container with network=none.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
export async function operatorPostgrest(sql, serviceKey) {
    const tables = new Set(['batches', 'orders', 'order_items', 'order_status_history', 'waitlist_signups']);
    const columns = Object.fromEntries([...tables].map(table => [table, new Set(sql(`select coalesce(jsonb_agg(column_name),'[]'::jsonb) from information_schema.columns where table_schema='public' and table_name='${table}';`, true))]));
    const writes = [];
    const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
    const literal = value => value === null ? 'null' : typeof value === 'boolean' ? String(value) : typeof value === 'number' && Number.isFinite(value) ? String(value) : quote(value);
    const field = (table, name) => { assert.ok(columns[table]?.has(name), `Unapproved fixture column ${table}.${name}`); return `"${name}"`; };
    function filter(table, name, value) {
        const col = field(table, name);
        const dot = value.indexOf('.');
        const op = value.slice(0, dot);
        const operand = value.slice(dot + 1);
        if (['eq', 'neq', 'gte', 'ilike'].includes(op))
            return `${col} ${{ eq: '=', neq: '<>', gte: '>=', ilike: 'ilike' }[op]} ${quote(operand)}`;
        if (op === 'in' && /^\([^()]*\)$/.test(operand))
            return `${col} in (${operand.slice(1, -1).split(',').map(quote).join(',')})`;
        throw new Error('Unapproved fixture filter');
    }
    function projection(table, value = '*', alias = 'r') {
        value ??= '*';
        const relations = ['order_items', 'order_status_history'];
        const pieces = value.match(/[^,()]+\([^()]*\)|[^,()]+/g)?.map(piece => piece.trim()) ?? [];
        const nested = pieces.filter(piece => piece.includes('('));
        const object = pieces.includes('*') ? `to_jsonb(${alias})` : `jsonb_build_object(${pieces.filter(k => k !== '*' && !k.includes('(')).flatMap(k => [quote(k), `${alias}.${field(table, k)}`]).join(',')})`;
        assert.ok(nested.every(piece => table === 'orders' && relations.includes(piece.slice(0, piece.indexOf('(')))));
        return object + nested.map(piece => {
            const rel = piece.slice(0, piece.indexOf('('));
            const inner = piece.slice(piece.indexOf('(') + 1, -1);
            return ` || jsonb_build_object('${rel}',coalesce((select jsonb_agg(${projection(rel, inner, 'i')}) from public.${rel} i where i.order_id=${alias}.id),'[]'::jsonb))`;
        }).join('');
    }
    const server = createServer(async (request, response) => {
        try {
            assert.equal(request.headers.authorization, `Bearer ${serviceKey}`);
            const url = new URL(request.url, 'http://fixture.invalid');
            let body = '';
            for await (const chunk of request)
                body += chunk;
            if (url.pathname === '/rest/v1/rpc/record_monitoring_alert') {
                assert.equal(request.method, 'POST');
                const v = JSON.parse(body);
                assert.equal(v.p_event_name, 'admin_order_status_failed');
                assert.ok(Number.isInteger(v.p_cooldown_minutes));
                const rows = sql(`select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.record_monitoring_alert(${quote(v.p_fingerprint)},${quote(v.p_level)},${quote(v.p_event_name)},${quote(v.p_summary)},${quote(JSON.stringify(v.p_context))}::jsonb,${v.p_cooldown_minutes}) r;`, true);
                writes.push({ table: 'monitoring_alert_events', method: 'RPC' });
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify(rows[0]));
                return;
            }
            if (url.pathname === '/rest/v1/rpc/consume_api_rate_limit') {
                assert.equal(request.method, 'POST');
                const v = JSON.parse(body);
                assert.deepEqual(Object.keys(v).sort(), ['p_identifier', 'p_limit', 'p_scope', 'p_window_seconds']);
                assert.ok(Number.isInteger(v.p_limit) && Number.isInteger(v.p_window_seconds));
                const rows = sql(`select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.consume_api_rate_limit(${quote(v.p_scope)},${quote(v.p_identifier)},${v.p_limit},${v.p_window_seconds}) r;`, true);
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify(String(request.headers.accept).includes('vnd.pgrst.object+json') ? rows[0] : rows));
                return;
            }
            const table = url.pathname.slice('/rest/v1/'.length);
            assert.ok(url.pathname.startsWith('/rest/v1/') && tables.has(table));
            const predicates = [];
            for (const [key, value] of url.searchParams) {
                if (['select', 'order', 'limit'].includes(key))
                    continue;
                if (key === 'or') {
                    assert.equal(value, '(payment_status.eq.paid,status.in.(payment_confirmed,in_production,ready_for_delivery,delivered))');
                    predicates.push("(payment_status='paid' or status in ('payment_confirmed','in_production','ready_for_delivery','delivered'))");
                }
                else
                    predicates.push(filter(table, key, value));
            }
            const where = predicates.length ? ' where ' + predicates.join(' and ') : '';
            let statement;
            if (request.method === 'GET')
                statement = `select * from public.${table}${where}`;
            else if (request.method === 'PATCH') {
                assert.ok(['orders', 'batches'].includes(table) && predicates.length > 0);
                const data = JSON.parse(body);
                const writable = table === 'orders' ? ['status', 'admin_notes'] : ['name', 'status', 'capacity_packs', 'capacity_bagels', 'orders_open_at', 'orders_close_at', 'delivery_date', 'ingredient_cost_per_bagel', 'packaging_cost_per_pack', 'actual_delivery_cost', 'other_batch_cost'];
                assert.ok(Object.keys(data).every(key => writable.includes(key)));
                statement = `update public.${table} set ${Object.entries(data).map(([key, value]) => `${field(table, key)}=${literal(value)}`).join(',')}${where} returning *`;
                writes.push({ table, method: 'PATCH' });
            }
            else if (request.method === 'POST') {
                assert.equal(table, 'order_status_history');
                const data = JSON.parse(body);
                assert.ok(!Array.isArray(data));
                assert.ok(Object.keys(data).every(key => ['order_id', 'old_status', 'new_status', 'changed_by'].includes(key)));
                statement = `insert into public.${table}(${Object.keys(data).map(key => field(table, key)).join(',')}) values (${Object.values(data).map(literal).join(',')}) returning *`;
                writes.push({ table, method: 'POST' });
            }
            else
                throw new Error('Unapproved fixture method');
            const order = url.searchParams.get('order');
            const limit = url.searchParams.get('limit');
            if (order) {
                const [name, direction] = order.split('.');
                assert.ok(['asc', 'desc'].includes(direction));
                statement += ` order by ${field(table, name)} ${direction}`;
            }
            if (limit) {
                assert.match(limit, /^\d{1,3}$/);
                statement += ' limit ' + Number(limit);
            }
            const rows = request.method === 'GET'
                ? sql(`select coalesce(jsonb_agg(${projection(table, url.searchParams.get('select'))}),'[]'::jsonb) from (${statement}) r;`, true)
                : sql(`with changed as (${statement}) select coalesce(jsonb_agg(${projection(table, url.searchParams.get('select'))}),'[]'::jsonb) from changed r;`, true);
            const single = String(request.headers.accept).includes('vnd.pgrst.object+json');
            if (single && rows.length !== 1) {
                response.writeHead(406, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ code: 'PGRST116', message: 'Synthetic missing row' }));
                return;
            }
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify(single ? rows[0] : rows));
        }
        catch (error) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ code: 'SYNTHETIC_FIXTURE', message: 'Local operator fixture rejected a request' }));
            server.emit('fixtureError', error);
        }
    });
    const errors = [];
    server.on('fixtureError', error => errors.push(error.message));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { server, origin: `http://127.0.0.1:${server.address().port}`, writes, errors };
}
