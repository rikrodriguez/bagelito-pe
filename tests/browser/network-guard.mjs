import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { fulfillLocalRead } from './fixtures/local-read.mjs';

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    server.off('error', reject);
    resolve('http://127.0.0.1:' + server.address().port);
  });
});

const close = async server => {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
};

test('local reads fulfill normally and reject redirect chains before reaching another origin', { timeout: 30_000 }, async t => {
  let browser, context;
  const targetHits = [];
  const target = createServer((request, response) => {
    targetHits.push(request.url);
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('Synthetic second origin must never be reached.');
  });
  let source;
  t.after(async () => {
    await context?.close();
    await browser?.close();
    await close(source);
    await close(target);
  });
  const targetOrigin = await listen(target);
  source = createServer((request, response) => {
    const match = /^\/redirect\/(301|302|303|307|308)$/.exec(request.url);
    if (match) {
      response.writeHead(Number(match[1]), { Location: targetOrigin + '/synthetic-target' });
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('Synthetic local read');
  });
  const sourceOrigin = await listen(source);
  assert.notEqual(sourceOrigin, targetOrigin);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium',
    headless: true,
  });
  context = await browser.newContext({ serviceWorkers: 'block' });
  const errors = new Map(), settled = new Map(), outsideRoutes = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== sourceOrigin) {
      outsideRoutes.push(url.origin);
      await route.abort('blockedbyclient');
      return;
    }
    let resolve;
    settled.set(url.pathname, new Promise(done => { resolve = done; }));
    try {
      await fulfillLocalRead(route);
    } catch (error) {
      errors.set(url.pathname, error);
    } finally {
      resolve();
    }
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(5_000);

  await page.goto(sourceOrigin + '/plain');
  await settled.get('/plain');
  assert.equal(await page.locator('body').innerText(), 'Synthetic local read');
  assert.equal(errors.size, 0);
  assert.deepEqual(targetHits, []);

  for (const status of [301, 302, 303, 307, 308]) {
    const path = '/redirect/' + status;
    await assert.rejects(page.goto(sourceOrigin + path));
    assert.ok(settled.has(path), 'The local read must pass through the tested guard');
    await settled.get(path);
    const error = errors.get(path);
    assert.equal(error?.code, 'LOCAL_REDIRECT_REJECTED');
    assert.equal(error.message, 'HTTP redirects are blocked in local browser fixtures.');
    assert.equal(error.message.includes(targetOrigin), false);
    assert.deepEqual(targetHits, [], 'The HTTP client must never follow the redirect');
    assert.deepEqual(outsideRoutes, [], 'The guard must stop the redirect before a second browser request');
  }
  assert.equal(errors.size, 5);
});
