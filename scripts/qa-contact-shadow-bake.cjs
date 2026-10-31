/** Real-browser finite-contact-shadow regression. No production hooks.
 * BASE_URL=http://127.0.0.1:4173 QA_HDR_FIXTURE_PATH=/path/lebombo_1k.hdr node scripts/qa-contact-shadow-bake.cjs
 * Optional QA_CHROMIUM_EXECUTABLE_PATH, QA_OUTPUT, QA_ARTIFACT_CODE_SHA.
 * The separate 24-rendered-frame, 60 s study does not relax qa:3d readiness or strafe.
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const root = resolve(__dirname, '..');
const appFiles = ['src/playable/PlayableStore.tsx', 'src/playable/movement-input.ts', 'src/playable/StoreArchitectureVisual.tsx', 'src/playable/GuidedCommerce.tsx', 'src/playable/playable.css', 'src/playable/guided-commerce.css', 'vercel.json'];
const appHashes = () => Object.fromEntries(appFiles.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
const repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:4173');
assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname), 'Loopback only');
const output = resolve(process.env.QA_OUTPUT || 'qa-artifacts/contact-shadow-bake');
mkdirSync(output, { recursive: true });
assert.ok(process.env.QA_HDR_FIXTURE_PATH, 'Provide the unchanged approved HDR as a local fixture');
const hdr = readFileSync(process.env.QA_HDR_FIXTURE_PATH);
const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(hash(hdr), 'a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb');
const hdrURL = 'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr';
const result = { kind: 'WebGL-framebuffer-contact-bake-regression', base: base.href, artifactCodeSHA: process.env.QA_ARTIFACT_CODE_SHA || null, repositoryHead, workingTreeAppSourceHashes: appHashes(), sourceHashScope: 'Current repository files, not an assertion that a separately served build matches the optional declared artifact SHA', createdAt: new Date().toISOString(), fixtureSHA256: hash(hdr), driverSHA256: hash(readFileSync(__filename)), network: { reads: [], fixtureReads: 0, blocked: [], pageErrors: [] }, failures: [], limits: ['This is a separate 24-rendered-frame, 60-second contact-shadow study; qa:3d readiness (8 frames / 30 s) and strafe (480 ms) assertions remain unchanged and are not declared PASS by this test.', 'Framebuffer classification uses attached color texture sizes; no application state or rendering settings are changed.'] };
function instrumentation() {
    const states = [], contextMap = new WeakMap();
    let nextObject = 1, frame = 0, stamp = null;
    const originalRAF = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (callback) { return originalRAF(function (time) { if (stamp !== time) {
        stamp = time;
        frame++;
    } return callback(time); }); };
    function state(gl) { let s = contextMap.get(gl); if (!s) {
        s = { id: states.length + 1, gl, objects: new WeakMap(), textures: new Map(), renderbuffers: new Map(), framebuffers: new Map(), boundTextures: new Map(), activeUnit: gl.TEXTURE0, boundRenderbuffer: null, drawFB: null, readFB: null, frames: new Map() };
        states.push(s);
        contextMap.set(gl, s);
    } return s; }
    function objectId(s, object) { if (!object)
        return null; let id = s.objects.get(object); if (!id) {
        id = nextObject++;
        s.objects.set(object, id);
    } return id; }
    function textureTarget(gl, target) { return target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z ? gl.TEXTURE_CUBE_MAP : target; }
    function boundTexture(s, target) { return s.boundTextures.get(s.activeUnit + ':' + textureTarget(s.gl, target)); }
    function fb(s, target) { return target === s.gl.READ_FRAMEBUFFER ? s.readFB : s.drawFB; }
    function attachment(s, object) { const id = objectId(s, object); return s.framebuffers.get(id)?.color; }
    function targetInfo(s, object) { if (!object)
        return { id: null, kind: 'default', width: s.gl.drawingBufferWidth, height: s.gl.drawingBufferHeight }; const id = objectId(s, object), a = attachment(s, object), storage = a && (a.type === 'texture' ? s.textures : s.renderbuffers).get(a.id); return { id, kind: storage?.width === 512 && storage?.height === 512 ? '512-square' : storage?.width === 1024 && storage?.height === 1024 ? '1024-square' : 'other', width: storage?.width || null, height: storage?.height || null, colorAttachment: a || null }; }
    function event(s, type) { let f = s.frames.get(frame); if (!f) {
        f = { frame, timestamp: stamp, targets: {}, mainDraws: 0 };
        s.frames.set(frame, f);
    } const info = targetInfo(s, s.drawFB), key = info.id === null ? 'default' : String(info.id); let target = f.targets[key]; if (!target) {
        target = { ...info, clears: 0, draws: 0, blits: 0 };
        f.targets[key] = target;
    } target[type]++; if (type === 'draws' && info.id === null)
        f.mainDraws++; }
    function wrap(name, fn) { const original = WebGL2RenderingContext.prototype[name]; if (!original)
        return; WebGL2RenderingContext.prototype[name] = function (...args) { const s = state(this); fn.call(this, s, args); return Reflect.apply(original, this, args); }; }
    wrap('activeTexture', (s, a) => { s.activeUnit = a[0]; });
    wrap('bindTexture', (s, a) => { s.boundTextures.set(s.activeUnit + ':' + a[0], a[1]); objectId(s, a[1]); });
    wrap('texStorage2D', (s, a) => { const t = boundTexture(s, a[0]); if (t)
        s.textures.set(objectId(s, t), { width: a[3], height: a[4], method: 'texStorage2D' }); });
    wrap('texImage2D', (s, a) => { const t = boundTexture(s, a[0]); if (!t || a[1] !== 0)
        return; const storage = a.length >= 9 ? { width: a[3], height: a[4] } : { width: a[5]?.width || null, height: a[5]?.height || null }; s.textures.set(objectId(s, t), { ...storage, method: 'texImage2D' }); });
    wrap('bindRenderbuffer', (s, a) => { s.boundRenderbuffer = a[1]; objectId(s, a[1]); });
    wrap('renderbufferStorage', (s, a) => { if (s.boundRenderbuffer)
        s.renderbuffers.set(objectId(s, s.boundRenderbuffer), { width: a[2], height: a[3], method: 'renderbufferStorage' }); });
    wrap('renderbufferStorageMultisample', (s, a) => { if (s.boundRenderbuffer)
        s.renderbuffers.set(objectId(s, s.boundRenderbuffer), { width: a[3], height: a[4], samples: a[1], method: 'renderbufferStorageMultisample' }); });
    wrap('bindFramebuffer', (s, a) => { if (a[0] === s.gl.FRAMEBUFFER || a[0] === s.gl.DRAW_FRAMEBUFFER)
        s.drawFB = a[1]; if (a[0] === s.gl.FRAMEBUFFER || a[0] === s.gl.READ_FRAMEBUFFER)
        s.readFB = a[1]; const id = objectId(s, a[1]); if (id && !s.framebuffers.has(id))
        s.framebuffers.set(id, { object: a[1] }); });
    wrap('framebufferTexture2D', (s, a) => { if (a[1] !== s.gl.COLOR_ATTACHMENT0)
        return; const id = objectId(s, fb(s, a[0])); if (id)
        s.framebuffers.get(id).color = { type: 'texture', id: objectId(s, a[3]) }; });
    wrap('framebufferRenderbuffer', (s, a) => { if (a[1] !== s.gl.COLOR_ATTACHMENT0)
        return; const id = objectId(s, fb(s, a[0])); if (id)
        s.framebuffers.get(id).color = { type: 'renderbuffer', id: objectId(s, a[3]) }; });
    for (const name of ['clear', 'clearBufferfv', 'clearBufferfi', 'clearBufferuiv', 'clearBufferiv'])
        wrap(name, s => event(s, 'clears'));
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'])
        wrap(name, s => event(s, 'draws'));
    wrap('blitFramebuffer', s => event(s, 'blits'));
    window.__qaContactFramebuffer = { mark: () => frame, snapshot: (mark = 0) => ({ frame, contexts: states.map(s => ({ id: s.id, drawingBuffer: { width: s.gl.drawingBufferWidth, height: s.gl.drawingBufferHeight }, targets: [...s.framebuffers.values()].map(f => targetInfo(s, f.object)), frames: [...s.frames.values()].filter(f => f.frame > mark && f.frame < frame && f.mainDraws > 0) })) }) };
}
;
(async () => { const browser = await chromium.launch({ headless: true, ...(process.env.QA_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.QA_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] }); try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await context.addInitScript(instrumentation);
    await context.route('**/*', async (route) => { const request = route.request(), url = request.url(); if (request.method() === 'GET' && new URL(url).origin === base.origin) {
        const response = await route.fetch({ maxRedirects: 0 });
        result.network.reads.push({ url, status: response.status() });
        if (response.status() >= 300 && response.status() < 400) {
            result.network.blocked.push({ url, reason: 'redirect' });
            return route.abort('blockedbyclient');
        }
        return route.fulfill({ response });
    } if (request.method() === 'GET' && url === hdrURL) {
        result.network.fixtureReads++;
        return route.fulfill({ status: 200, headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' }, body: hdr });
    } result.network.blocked.push({ url, method: request.method() }); return route.abort('blockedbyclient'); });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', error => result.network.pageErrors.push(error.message));
    const config = await page.request.get(new URL('/api/payments/culqi/config', base).href, { maxRedirects: 0 });
    assert.equal(config.status(), 200);
    const payment = await config.json();
    for (const k of ['enabled', 'configured', 'intakeEnabled'])
        assert.equal(payment[k], false);
    assert.equal(payment.mode, 'disabled');
    await page.goto(base.href, { waitUntil: 'domcontentloaded' });
    await page.locator('.bagelito-3d-blue-sign').nth(7).waitFor({ state: 'attached' });
    result.marker = await page.evaluate(() => window.__qaContactFramebuffer.mark());
    console.log('World mounted; collecting 24 rendered frames, marker ' + result.marker);
    try {
        await page.waitForFunction(mark => window.__qaContactFramebuffer.snapshot(mark).contexts.some(c => c.frames.length >= 24), result.marker, { timeout: 60000 });
    }
    catch (error) {
        result.failures.push('24-rendered-frame study did not complete in 60 s: ' + String(error));
    }
    result.trace = await page.evaluate(mark => window.__qaContactFramebuffer.snapshot(mark), result.marker);
    result.prelude = await page.evaluate(() => window.__qaContactFramebuffer.snapshot(0));
    const contextTrace = result.trace.contexts.sort((a, b) => b.frames.length - a.frames.length)[0];
    assert.ok(contextTrace, 'Instrumented WebGL2 context required');
    const targets = contextTrace.targets.filter(t => t.kind === '512-square' && t.colorAttachment?.type === 'texture');
    result.contactTargets = targets;
    assert.equal(targets.length, 2, 'Expected two 512×512 contact-shadow color targets, distinct from shadow1024 and viewport transmission');
    const contactIds = new Set(targets.map(t => t.id));
    const allContextFrames = result.prelude.contexts.find(c => c.id === contextTrace.id)?.frames || [];
    result.observedBake = { activeFrames: allContextFrames.filter(f => Object.values(f.targets).some(t => contactIds.has(t.id) && (t.clears || t.draws))).length, clears: allContextFrames.reduce((n, f) => n + Object.values(f.targets).filter(t => contactIds.has(t.id)).reduce((m, t) => m + t.clears, 0), 0) };
    if (result.observedBake.activeFrames !== 8)
        result.failures.push('Expected exactly 8 initial contact-bake frames, observed ' + result.observedBake.activeFrames);
    result.frames = contextTrace.frames.slice(0, 24).map((f, index) => ({ studyFrame: index + 1, rafFrame: f.frame, timestamp: f.timestamp, mainDraws: f.mainDraws, contactClears: Object.values(f.targets).filter(t => contactIds.has(t.id)).reduce((n, t) => n + t.clears, 0), contactDraws: Object.values(f.targets).filter(t => contactIds.has(t.id)).reduce((n, t) => n + t.draws, 0), targetSummary: Object.values(f.targets) }));
    result.late = result.frames.filter(f => f.studyFrame > 16);
    result.afterSixteen = { frames: result.late.length, clears: result.late.reduce((n, f) => n + f.contactClears, 0), draws: result.late.reduce((n, f) => n + f.contactDraws, 0), activeFrames: result.late.filter(f => f.contactClears || f.contactDraws).length };
    if (result.frames.length < 24)
        result.failures.push('Insufficient completed renderedframes');
    if (result.afterSixteen.clears || result.afterSixteen.draws)
        result.failures.push('Contact-shadow targets continue rendering after 16 study frames despite a finite 8-frame bake');
    assert.deepEqual(result.network.blocked, []);
    assert.deepEqual(result.network.pageErrors, []);
    assert.deepEqual(result.network.reads.filter(x => x.status >= 400), []);
    console.log(JSON.stringify({ targets: targets.map(t => ({ id: t.id, width: t.width, height: t.height })), afterSixteen: result.afterSixteen, failures: result.failures }));
}
catch (error) {
    result.failures.push(String(error));
    console.error(error);
}
finally {
    await browser.close();
    result.completedAt = new Date().toISOString();
    result.finalWorkingTreeAppSourceHashes = appHashes();
    result.sourceChangedDuringStudy = JSON.stringify(result.workingTreeAppSourceHashes) !== JSON.stringify(result.finalWorkingTreeAppSourceHashes);
    if (result.sourceChangedDuringStudy)
        result.failures.push('Repository app sources changed during the study');
    writeFileSync(resolve(output, 'contact-bake-results.json'), JSON.stringify(result, null, 2));
    console.log('Saved ' + output + '/contact-bake-results.json');
    if (result.failures.length)
        process.exitCode = 1;
} })().catch(error => { console.error(error); process.exitCode = 1; });
