import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { sourceModule } from '../../tests/helpers/load-ts.mjs';
import { fulfillLocalRead } from '../../tests/browser/fixtures/local-read.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const artifactPath = path.join(directory, 'dist/index.html');
const outputDirectory = process.env.BAGELITO_STATIC_QA_OUTPUT ?? '/tmp/bagelito-static-demo-qa-20261031';
const { packs } = sourceModule('src/data/packs.ts');
const { flavors } = sourceModule('src/data/flavors.ts');
const { flavorImages } = sourceModule('src/data/flavor-images.ts');
const { packCopy, flavorCopy } = sourceModule('src/lib/i18n.ts');
const { getDeliveryFee } = sourceModule('src/lib/delivery-pricing.ts');
const expectedPacks = [
  { slug: '12-mixed', units: 12, amount: 115 },
  { slug: '6-mixed', units: 6, amount: 60 },
  { slug: '12-single', units: 12, amount: 100 },
  { slug: '6-single', units: 6, amount: 50 },
];
const report = { artifact: {}, staticChecks: {}, journeys: [], cspProbes: {} };
let browser, server, html, httpURL, scripts, data;
const serverRequests = [];

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function saveReport() {
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
}

test.before(async () => {
  html = readFileSync(artifactPath, 'utf8');
  report.artifact = { path: artifactPath, bytes: Buffer.byteLength(html), sha256: digest(html) };
  scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map(match => ({ attributes: match[1], content: match[2] }));
  assert.equal(scripts.length, 2, 'Only the JSON bootstrap and the reviewed inline demo client may execute');
  const bootstrap = ts.createSourceFile('bootstrap.js', scripts[0].content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(bootstrap.parseDiagnostics.length, 0);
  assert.equal(bootstrap.statements.length, 1, 'Bootstrap must contain one data assignment');
  const statement = bootstrap.statements[0];
  assert.ok(ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression));
  assert.equal(statement.expression.left.getText(bootstrap), 'window.DEMO_DATA');
  assert.equal(statement.expression.operatorToken.kind, ts.SyntaxKind.EqualsToken);
  data = JSON.parse(statement.expression.right.getText(bootstrap));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium', headless: true });
  server = createServer((request, response) => {
    serverRequests.push({ method: request.method, path: request.url });
    if (request.method !== 'GET' || request.url !== '/index.html') {
      response.writeHead(451, { 'content-type': 'text/plain' });
      response.end('This fixture serves one static document only.');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    response.end(html);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  httpURL = `http://127.0.0.1:${server.address().port}/index.html`;
  mkdirSync(outputDirectory, { recursive: true });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  report.serverRequests = serverRequests;
  saveReport();
});

async function fixture(t, { protocol = 'http', locale = 'es', width = 1440, traps = true, javascript = true } = {}) {
  const url = protocol === 'file' ? pathToFileURL(artifactPath).href : httpURL;
  const viewport = { width, height: width < 500 ? 844 : 1000 };
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', javaScriptEnabled: javascript });
  const observed = { requests: [], rejected: [], writes: [], external: [], runtimeErrors: [] };
  const page = await context.newPage();
  let initial = false;
  await context.route('**/*', async route => {
    const request = route.request();
    if (!initial && request.method() === 'GET' && request.url() === url && request.isNavigationRequest()) {
      initial = true;
      if (protocol === 'http') return fulfillLocalRead(route);
      return route.continue();
    }
    observed.rejected.push({ method: request.method(), url: request.url() });
    if (!['GET', 'HEAD'].includes(request.method())) observed.writes.push(request.url());
    if (new URL(request.url()).origin !== new URL(url).origin) observed.external.push(request.url());
    await route.abort('blockedbyclient');
  });
  page.on('request', request => {
    if (!request.url().startsWith('data:')) observed.requests.push({ method: request.method(), url: request.url() });
  });
  page.on('pageerror', error => observed.runtimeErrors.push(error.message));
  if (traps) await context.addInitScript(() => {
    window.__staticDemoAttempts = [];
    const reject = name => (...args) => {
      window.__staticDemoAttempts.push({ name, value: typeof args[0] === 'string' ? args[0] : null });
      throw new Error(`Forbidden transport: ${name}`);
    };
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'open']) {
      Object.defineProperty(window, name, { configurable: true, value: reject(name) });
    }
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: reject('sendBeacon') });
    if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'register', { configurable: true, value: reject('serviceWorker.register') });
    for (const name of ['submit', 'requestSubmit']) Object.defineProperty(HTMLFormElement.prototype, name, { configurable: true, value: reject(`form.${name}`) });
    addEventListener('submit', event => { event.preventDefault(); window.__staticDemoAttempts.push({name:'submit-event'}); }, true);
  });
  page.setDefaultTimeout(5_000);
  await page.goto(url, { waitUntil: 'load' });
  t.after(async () => {
    const attempts = traps ? await page.evaluate(() => window.__staticDemoAttempts) : [];
    observed.transportAttempts=attempts;
    await context.close();
    assert.deepEqual(attempts, [], 'The demo must never invoke transports, windows or form submission');
    assert.deepEqual(observed.rejected, [], 'No request beyond the initial static document is allowed');
    assert.deepEqual(observed.writes, []);
    assert.deepEqual(observed.external, []);
    assert.deepEqual(observed.runtimeErrors, []);
    assert.deepEqual(observed.requests, [{ method: 'GET', url }], 'Images/scripts/styles must not issue additional requests');
  });
  return { page, context, observed, url, protocol, locale, width };
}

function auditJavaScript(source, label) {
  const tree = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(tree.parseDiagnostics.length, 0, `${label}: valid JavaScript`);
  const forbidden = new Set(['fetch','XMLHttpRequest','WebSocket','EventSource','Worker','SharedWorker','importScripts','sendBeacon',
    'serviceWorker','localStorage','sessionStorage','indexedDB','caches','cookie','eval','Function','require']);
  const findings = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node)
      || node.kind === ts.SyntaxKind.ImportKeyword) findings.push('module-import');
    if (ts.isIdentifier(node) && forbidden.has(node.text)) findings.push(node.text);
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && forbidden.has(node.argumentExpression.text)) findings.push(node.argumentExpression.text);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ['submit','requestSubmit','open'].includes(node.expression.name.text)) findings.push(node.expression.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.deepEqual(findings, [], `${label}: no modules, persistence or transports`);
}

test('artifact has only hashed inline code, restrictive CSP, real inline assets and the unchanged catalog', async t => {
  assert.deepEqual(readdirSync(path.dirname(artifactPath)), ['index.html'], 'Deployment output is one HTML file, without functions or supporting code');
  assert.equal(data.sourceSha,'97b4ae91798ab82b1b379000ba3be9b8b8495b45');
  assert.deepEqual(packs.map(({slug,units,amount}) => ({slug,units,amount})), expectedPacks);
  assert.deepEqual(data.packs, packs);
  assert.deepEqual(data.flavors, flavors);
  assert.equal(flavors.length, 10);
  for (const [index, script] of scripts.entries()) {
    assert.ok(!/\bsrc\s*=|\btype\s*=\s*["']module/i.test(script.attributes));
    auditJavaScript(script.content, `inline-${index}.js`);
  }
  assert.doesNotMatch(html, /(?:sk_live_|sk_test_|pk_live_|pk_test_|SUPABASE_SERVICE_ROLE_KEY|CULQI_SECRET_KEY|BEGIN [A-Z ]*PRIVATE KEY|Bearer\s+[A-Za-z0-9._-]+)/);
  const f = await fixture(t, { javascript: false, traps: false });
  const structural = await f.page.evaluate(() => ({
    csp: [...document.querySelectorAll('meta[http-equiv]')].filter(meta => meta.httpEquiv.toLowerCase() === 'content-security-policy').map(meta=>meta.content),
    refresh: [...document.querySelectorAll('meta[http-equiv]')].filter(meta=>meta.httpEquiv.toLowerCase()==='refresh').length,
    forbiddenElements: [...document.querySelectorAll('iframe,frame,object,embed,base,form,video,audio,source,track')].map(element=>element.tagName),
    scripts: [...document.scripts].map(script=>({src:script.getAttribute('src'),type:script.getAttribute('type'),text:script.textContent})),
    externalResourceAttributes: [...document.querySelectorAll('[src],[srcset],[href],[action],[formaction],[ping]')].flatMap(element=>
      ['src','srcset','href','action','formaction','ping'].filter(attribute=>element.hasAttribute(attribute)).map(attribute=>({tag:element.tagName,rel:element.getAttribute('rel'),attribute,value:element.getAttribute(attribute)})))
      .filter(({tag,rel,attribute,value}) => attribute==='href'
        ? !(tag==='LINK' && rel==='icon' ? value.startsWith('data:') : value.startsWith('#'))
        : !(attribute==='src' && tag==='IMG' && value.startsWith('data:image/'))),
    eventAttributes: [...document.querySelectorAll('*')].flatMap(element=>[...element.attributes].filter(attribute=>/^on/i.test(attribute.name)).map(attribute=>attribute.name)),
    stylesheetUrls: [...document.querySelectorAll('style')].flatMap(style=>[...style.textContent.matchAll(/url\(\s*([^)]+?)\s*\)/gi)].map(match=>match[1])),
    styleImports: [...document.querySelectorAll('style')].filter(style=>/@import/i.test(style.textContent)).length,
  }));
  assert.equal(structural.csp.length,1);
  const policy = new Map(structural.csp[0].split(';').map(value=>value.trim().split(/\s+/)).filter(parts=>parts[0]).map(([key,...values])=>[key,values]));
  for(const directive of ['default-src','connect-src','form-action','frame-src','worker-src','object-src','base-uri','font-src','media-src','script-src-attr']) assert.deepEqual(policy.get(directive),["'none'"],directive);
  assert.deepEqual(policy.get('img-src'),['data:']);
  const hashes = scripts.map(script=>`'sha256-${createHash('sha256').update(script.content).digest('base64')}'`).sort();
  assert.deepEqual(policy.get('script-src')?.sort(),hashes,'CSP must hash the exact executable bytes, without host/eval/inline allowances');
  assert.deepEqual(structural.forbiddenElements,[]);
  assert.deepEqual(structural.externalResourceAttributes,[]);
  assert.deepEqual(structural.eventAttributes,[]);
  assert.equal(structural.scripts.length,2);
  for(const [index,script]of structural.scripts.entries()) {
    assert.equal(script.src,null); assert.ok(script.type===null || script.type==='text/javascript');
    assert.equal(script.text,scripts[index].content,'DOM parser and source scanner must see the same script boundaries/bytes');
  }
  assert.equal(structural.refresh,0);
  assert.equal(structural.styleImports,0);
  for(const url of structural.stylesheetUrls) assert.match(url,/^["']?data:/);
  const assetEvidence=[];
  for(const [asset,uri] of Object.entries(data.images)) {
    assert.ok(asset.startsWith('/images/') && !asset.includes('..'));
    assert.match(uri,/^data:image\/[a-z0-9.+-]+;base64,/i);
    const bytes=Buffer.from(uri.slice(uri.indexOf(',')+1),'base64');
    const original=readFileSync(path.join(root,'public',asset));
    assert.deepEqual(bytes,original,`${asset}: embed exact PR43 file bytes`);
    assetEvidence.push({asset,bytes:bytes.length,sha256:digest(bytes)});
  }
  assert.equal(assetEvidence.length,16);
  for(const source of Object.values(flavorImages)) assert.ok(data.images[source]);
  for(const pack of packs) assert.ok(data.images[`/images/pack-${pack.slug}.webp`]);
  report.staticChecks={scripts:scripts.length,csp:structural.csp[0],assets:assetEvidence,catalogPacks:expectedPacks,catalogFlavors:flavors.map(flavor=>flavor.slug),deliveryDistricts:data.districts.length};
  saveReport();
});

async function localeFor(page, locale) {
  if(await page.locator('html').getAttribute('lang')!==locale) await page.locator(`[data-demo-locale="${locale}"]`).first().click();
  assert.equal(await page.locator('html').getAttribute('lang'),locale);
  assert.match(await page.locator('#demo-preview-label').innerText(),locale==='es'?/Demostración estática.*Sin pedidos ni pagos.*datos personales reales/:/Static preview.*No orders or payments.*real personal details/);
}

async function stateIs(page, step, pack) {
  assert.equal(await page.locator('#demo-app').getAttribute('data-demo-view'),'checkout');
  assert.equal(await page.locator('section[data-demo-current-step]').getAttribute('data-demo-current-step'),String(step));
  assert.equal(await page.locator('section[data-demo-selected-pack]').getAttribute('data-demo-selected-pack'),pack.slug);
  assert.equal(await page.locator('#demo-bagels').innerText(),`${pack.units} bagels`);
  assert.equal(await page.locator('#demo-subtotal').innerText(),`S/${pack.amount}`);
  assert.equal(await page.locator('#demo-fee').innerText(),'S/16');
  assert.equal(await page.locator('#demo-total').innerText(),`S/${pack.amount+16}`);
}

async function imageIs(locator, asset, alt) {
  assert.equal(await locator.getAttribute('src'),data.images[asset],`${asset}: DOM must bind the actual inline photograph`);
  if(alt!==undefined) assert.equal(await locator.getAttribute('alt'),alt);
  await locator.evaluate(async image=>{
    const decoder=new Image(); decoder.src=image.src; await decoder.decode();
    if(!decoder.naturalWidth||!decoder.naturalHeight) throw new Error('Inline image failed to decode');
  });
}

async function visibleImages(page) {
  const images=page.locator('#demo-app img');
  const dimensions=[];
  for(const image of await images.all()) {
    const src=await image.getAttribute('src');
    assert.ok(Object.values(data.images).includes(src),'Each displayed img must use an original inline asset');
    if(!await image.isVisible()) continue;
    const value=await image.evaluate(async element=>{
      element.scrollIntoView({block:'center',behavior:'instant'}); await element.decode();
      const rect=element.getBoundingClientRect();
      return{alt:element.alt,naturalWidth:element.naturalWidth,naturalHeight:element.naturalHeight,width:rect.width,height:rect.height};
    });
    assert.ok(value.naturalWidth>0&&value.naturalHeight>0&&value.width>0&&value.height>0);
    dimensions.push(value);
  }
  return dimensions;
}

async function safeDOM(page) {
  const unsafe=await page.locator('#demo-app').evaluate(app=>({
    frames:app.querySelectorAll('iframe,object,embed,script,form').length,
    urls:[...app.querySelectorAll('a')].filter(anchor=>!anchor.getAttribute('href')?.startsWith('#')||anchor.hasAttribute('ping')||anchor.hasAttribute('target')).map(anchor=>anchor.outerHTML),
    images:[...app.querySelectorAll('img')].filter(image=>!image.getAttribute('src')?.startsWith('data:image/')).length,
    eventAttributes:[...app.querySelectorAll('*')].flatMap(element=>[...element.attributes].filter(attribute=>/^on/i.test(attribute.name)).map(attribute=>attribute.name)),
  }));
  assert.deepEqual(unsafe,{frames:0,urls:[],images:0,eventAttributes:[]});
  assert.doesNotMatch(await page.locator('#demo-app').innerText(),/Payment confirmed|Order confirmed|Pago confirmado|Pedido confirmado|BAG-DEMO|BAG-\d{5}/i);
  const geometry=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));
  assert.ok(geometry.width<=geometry.viewport+1,JSON.stringify(geometry));
  return geometry;
}

async function home(page) {
  if(await page.locator('#demo-app').getAttribute('data-demo-view')!=='home') await page.locator('[data-demo-action="home"]').first().click();
  assert.equal(await page.locator('#demo-app').getAttribute('data-demo-view'),'home');
}

async function screenshot(page,name) {
  const screenshotPath=path.join(outputDirectory,`${name}.png`);
  await page.screenshot({path:screenshotPath,fullPage:true,animations:'disabled'});
  return screenshotPath;
}

for(const protocol of ['http'])for(const locale of ['es','en'])for(const width of [1440,390]) {
  test(`static catalog, inert links and memory-only checkout (${protocol}, ${locale}, ${width}px)`,async t=>{
    const f=await fixture(t,{protocol,locale,width}); const {page}=f;
    const journey={protocol,locale,width,screenshots:[],packs:[],flavors:[],network:f.observed};
    report.journeys.push(journey);
    await localeFor(page,locale);
    assert.equal(await page.locator('.clean-pack-card').count(),4);
    assert.equal(await page.locator('.flavor-product-card').count(),10);
    journey.homeImages=await visibleImages(page);
    for(const pack of packs) {
      const card=page.locator('.clean-pack-card').filter({has:page.getByRole('heading',{name:packCopy[locale][pack.slug].name,exact:true})});
      assert.equal(await card.locator('.pack-title-block strong').innerText(),`S/${pack.amount}`);
      await imageIs(card.locator('img'),`/images/pack-${pack.slug}.webp`,packCopy[locale][pack.slug].trayLabel);
      assert.equal(await card.locator('a').getAttribute('data-pack'),pack.slug);
    }
    for(const flavor of flavors) {
      const name=flavorCopy[locale][flavor.slug];
      const card=page.locator('.flavor-product-card').filter({has:page.getByRole('heading',{name,exact:true})});
      await imageIs(card.locator('img'),flavorImages[flavor.slug]);
      assert.equal(await card.locator('a').getAttribute('data-pack'),'6-single');
      assert.equal(await card.locator('a').getAttribute('data-flavor'),flavor.slug);
      assert.match(await card.locator('.flavor-product-price').innerText(),/S\/50/);
    }
    journey.geometry=[await safeDOM(page)];
    journey.screenshots.push(await screenshot(page,`${protocol}-${locale}-${width}-home`));
    for(const pack of packs) {
      await home(page);
      await page.locator(`.clean-pack-card a[data-pack="${pack.slug}"]`).click();
      await stateIs(page,1,pack);
      await imageIs(page.locator('.checkout-summary-image img'),`/images/pack-${pack.slug}.webp`,packCopy[locale][pack.slug].trayLabel);
      await page.locator('#demo-next').click();
      await stateIs(page,2,pack);
      assert.equal(await page.locator('.flavor-select-card').count(),10);
      for(const flavor of flavors) {
        const card=page.locator('.flavor-select-card').filter({has:page.getByRole('heading',{name:flavorCopy[locale][flavor.slug],exact:true})});
        await imageIs(card.locator('img'),flavorImages[flavor.slug],flavorCopy[locale][flavor.slug]);
      }
      if(pack.packType==='single') {
        for(const flavor of flavors) {
          await page.locator(`#demo-flavor-${flavor.slug}`).click();
          assert.equal(await page.locator('.select-flavor-button[aria-pressed="true"]').count(),1);
          assert.equal(await page.locator('.flavor-select-card.selected h3').innerText(),flavorCopy[locale][flavor.slug]);
          await stateIs(page,2,pack);
          journey.flavors.push({pack:pack.slug,flavor:flavor.slug,units:pack.units,total:pack.amount+16});
        }
      }else{
        await page.locator('#demo-next').click();
        assert.equal(await page.locator('[data-demo-current-step]').getAttribute('data-demo-current-step'),'2');
        await page.locator('#demo-error').waitFor();
        assert.equal(await page.locator('#demo-error').evaluate(element=>document.activeElement===element),true);
        for(let i=0;i<pack.units+5;i++)await page.locator('#demo-add-cheddar').click();
        let quantities=(await page.locator('.quantity-control strong').allTextContents()).map(Number);
        assert.equal(quantities.reduce((sum,value)=>sum+value,0),pack.units);
        await page.locator('#demo-add-blueberry').click();
        assert.equal((await page.locator('.quantity-control strong').allTextContents()).map(Number).reduce((sum,value)=>sum+value,0),pack.units);
        for(let i=0;i<pack.units+5;i++)await page.locator('#demo-remove-cheddar').click();
        quantities=(await page.locator('.quantity-control strong').allTextContents()).map(Number);
        assert.ok(quantities.every(value=>value===0));
        for(let i=0;i<pack.units;i++)await page.locator(`#demo-add-${flavors[i%flavors.length].slug}`).click();
        quantities=(await page.locator('.quantity-control strong').allTextContents()).map(Number);
        assert.equal(quantities.reduce((sum,value)=>sum+value,0),pack.units);
        assert.ok(quantities.every(value=>value>=0));
      }
      if(pack.slug==='6-mixed')journey.screenshots.push(await screenshot(page,`${protocol}-${locale}-${width}-flavors`));
      await page.locator('#demo-next').click();
      await stateIs(page,3,pack);
      const syntheticName=pack.slug==='12-mixed'?'Synthetic <img src="https://example.invalid/never">':'Synthetic Demo';
      await page.locator('#demo-customer-name').fill(syntheticName);
      await page.locator('#demo-email').fill('synthetic@example.invalid');
      await page.locator('#demo-whatsapp').fill('999000111');
      await page.locator('#demo-address').fill('Synthetic address 123');
      for(const district of data.districts) {
        assert.equal(district.fee,getDeliveryFee(district.name));
        await page.locator('#demo-district').selectOption(district.name);
        assert.equal(await page.locator('#demo-fee').innerText(),`S/${district.fee}`);
        assert.equal(await page.locator('#demo-total').innerText(),`S/${pack.amount+district.fee}`);
      }
      await page.locator('#demo-district').selectOption('Miraflores');
      await page.locator('#demo-next').click();
      await stateIs(page,4,pack);
      assert.ok((await page.locator('.checkout-review-card').innerText()).includes(syntheticName));
      assert.equal(await page.locator('img[src^="https:"]').count(),0,'Synthetic input must remain escaped text');
      await page.locator('#demo-extra').click();
      const extra=data.extraOffers[pack.slug].discountedAmount;
      assert.equal(extra,pack.amount*.8);
      assert.equal(await page.locator('#demo-total').innerText(),`S/${pack.amount+extra+16}`);
      assert.equal(await page.locator('#demo-bagels').innerText(),`${pack.units*2} bagels`);
      await imageIs(page.locator('.checkout-summary-image img'),`/images/pack-${pack.slug}.webp`,packCopy[locale][pack.slug].trayLabel);
      await page.locator('#demo-extra').click();
      await stateIs(page,4,pack);
      await page.locator('#demo-finish').click();
      const notice=locale==='es'?'No se creó ningún pedido ni pago.':'No order or payment was created.';
      assert.equal(await page.locator('#demo-final-notice').innerText(),notice);
      assert.equal(await page.locator('#demo-announcement').innerText(),notice);
      assert.equal(await page.locator('#demo-final-notice').evaluate(element=>document.activeElement===element),true);
      journey.geometry.push(await safeDOM(page));
      journey.packs.push({pack:pack.slug,units:pack.units,amount:pack.amount,fee:16,total:pack.amount+16,extraTotal:pack.amount+extra+16});
      if(pack.slug==='6-single')journey.screenshots.push(await screenshot(page,`${protocol}-${locale}-${width}-review`));
    }
    await home(page);
    for(let index=0;index<await page.locator('[data-demo-action="information"]').count();index++) {
      await page.locator('[data-demo-action="information"]').nth(index).click();
      assert.match(await page.locator('#demo-announcement').innerText(),locale==='es'?/deshabilitado/:/disabled/);
      assert.equal(await page.locator('#demo-app').getAttribute('data-demo-view'),'home');
    }
    for(const form of await page.locator('[data-demo-form="inert"]').all())for(const button of await form.locator('button').all())if(await button.isEnabled())await button.click();
    await page.locator('[data-demo-locale]').first().focus();
    await page.keyboard.press('Tab');
    journey.geometry.push(await safeDOM(page));
    journey.finalUrl=page.url();assert.equal(page.url(),f.url,'Demo interactions must not navigate or write a query/history route');
    journey.status='PASS';saveReport();
  });
}

test('opening the standalone file is checked without changing managed browser policy',async t=>{
  const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
  const url=pathToFileURL(artifactPath).href;const rejected=[];
  await context.route('**/*',async route=>{
    if(route.request().method()==='GET'&&route.request().url()===url)return route.continue();
    rejected.push(route.request().url());return route.abort('blockedbyclient');
  });
  try{
    await page.goto(url,{waitUntil:'load'});
    await page.locator('#demo-app[data-demo-view="home"]').waitFor();
    assert.deepEqual(rejected,[]);
    report.fileOpen={status:'PASS',url,policyChanged:false};
  }catch(error){
    assert.match(error.message,/ERR_BLOCKED_BY_ADMINISTRATOR/,'Only an explicit managed file policy block is an accepted execution limitation');
    report.fileOpen={status:'BLOCKED_BY_MANAGED_POLICY',url,reason:'ERR_BLOCKED_BY_ADMINISTRATOR before document execution',policyChanged:false};
    t.skip('Managed Chromium blocks file://; the identical HTML bytes are verified through the local static HTTP fixture.');
  }finally{await context.close();saveReport();}
});

test('the actual CSP blocks connect, form, frame and worker attempts before any network request',async t=>{
  const f=await fixture(t,{traps:false});
  const consoleMessages=[];f.page.on('console',message=>consoleMessages.push(message.text()));
  await f.page.evaluate(async()=>{
    window.__staticCSPProbeEvents=[];addEventListener('securitypolicyviolation',event=>window.__staticCSPProbeEvents.push({directive:event.effectiveDirective,blockedURI:event.blockedURI}));
    await fetch('https://example.invalid/static-csp-probe').catch(()=>{});
    const frame=document.createElement('iframe');frame.src='https://example.invalid/static-frame-probe';document.body.append(frame);
    const form=document.createElement('form');form.method='POST';form.action=`${location.href}?blocked-form-probe`;document.body.append(form);HTMLFormElement.prototype.submit.call(form);
    try{const worker=new Worker('data:text/javascript,postMessage(1)');worker.onerror=event=>event.preventDefault();}catch{}
  });
  // Native form navigation is deferred. Keep the probe connected until Chrome
  // processes the task instead of removing it during the evaluating script.
  await f.page.waitForFunction(()=>window.__staticCSPProbeEvents.some(event=>event.directive==='form-action'),undefined,{timeout:2_000}).catch(()=>{});
  const violations=await f.page.evaluate(()=>window.__staticCSPProbeEvents);
  report.cspProbes={violations,consoleMessages,network:f.observed};saveReport();
  for(const directive of ['connect-src','form-action','frame-src','worker-src'])assert.ok(violations.some(event=>event.directive===directive),`${directive}: ${JSON.stringify(violations)}`);
});

