import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { loadTs } from "../helpers/load-ts.mjs";
import { fulfillLocalRead } from "./fixtures/local-read.mjs";

const baseURL = process.env.BAGELITO_TEST_URL ?? "http://127.0.0.1:3107";
const origin = new URL(baseURL).origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname), "Use only a credential-free local preview");
const { translations, flavorCopy, packCopy } = loadTs("src/lib/i18n.ts");
const { flavors } = loadTs("src/data/flavors.ts");
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, headless: true });
});
test.after(async () => { await browser?.close(); });

async function localPage(t, locale, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(20_000);
  const writes = [], rejectedReads = [], errors = [];
  let closing = false;
  await page.addInitScript(value => localStorage.setItem("bagelito-locale", value), locale);
  await page.route("**/*", async route => {
    const request = route.request();
    if (!["GET", "HEAD"].includes(request.method())) {
      writes.push(`${request.method()} ${request.url()}`);
      return route.abort();
    }
    if (new URL(request.url()).origin !== origin) return route.abort();
    try { return await fulfillLocalRead(route); }
    catch (error) {
      if (!closing && error.code === "LOCAL_REDIRECT_REJECTED") rejectedReads.push(error.message);
    }
  });
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => {
    closing = true;
    await context.close();
    assert.deepEqual(rejectedReads, [], "Redirects must not leave the local fixture");
    assert.deepEqual(writes, [], "Keyboard checks cannot submit orders, payments or analytics");
    assert.deepEqual(errors, [], "No browser runtime errors");
  });
  return page;
}

async function activate(page, locator, key = "Enter") {
  await locator.focus();
  await page.keyboard.press(key);
}
const next = page => activate(page, page.locator(".reserve-nav button.pink"));
async function assertFocused(locator, message) {
  await locator.waitFor();
  // The existing step effect schedules another scroll after 90ms. Check the
  // final position too, so an initially focused but hidden target cannot pass.
  await locator.page().waitForTimeout(160);
  assert.equal(await locator.evaluate(element => element === document.activeElement), true, message);
  const box = await locator.boundingBox();
  const viewport = locator.page().viewportSize();
  const header = await locator.page().locator("header").first().boundingBox();
  assert.ok(box && box.y >= Math.max(0, (header?.y ?? 0) + (header?.height ?? 0)), "Focused content must not be hidden behind the sticky header");
  assert.ok(box.y + box.height <= viewport.height, "Focused content must remain visible after the scroll timers");
}
async function fillDelivery(page) {
  const fields = page.locator(".form-grid input[required]");
  for (const [index, value] of ["Synthetic Keyboard", "999000111", "synthetic@example.invalid", "Synthetic address 123"].entries()) {
    await fields.nth(index).focus();
    await page.keyboard.insertText(value);
  }
}

async function deferFirstStepScroll(page) {
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window), cancel = window.clearTimeout.bind(window);
    let deferred = null, captured = false;
    // Hold the actual step scroll, not a simulated click or a racing sleep.
    // All later timers keep native behavior so other visibility checks remain real.
    window.setTimeout = (callback, delay, ...args) => {
      if (!captured && delay === 90 && typeof callback === "function"
        && callback.toString().includes("scrollIntoView") && callback.toString().includes("activeElement")) {
        captured = true;
        deferred = () => callback(...args);
        return -9001;
      }
      return schedule(callback, delay, ...args);
    };
    window.clearTimeout = id => {
      if (id === -9001) deferred = null;
      else cancel(id);
    };
    window.__checkoutScrollProbe = {
      pending: () => Boolean(deferred),
      release() { const callback = deferred; deferred = null; callback?.(); },
    };
  });
}

for (const locale of ["es", "en"]) {
  const r = translations[locale].reserve;
  for (const [size, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    test(`keyboard step changes focus the new content (${locale}, ${size})`, async t => {
      const page = await localPage(t, locale, viewport);
      await deferFirstStepScroll(page);
      await page.goto(`${baseURL}/checkout?pack=6-single&flavor=cheddar`);
      await page.locator(".reserve-pack-option.selected").waitFor();
      await next(page);
      await assertFocused(page.getByRole("heading", { name: r.chooseFlavors, exact: true }), "Continue must not leave focus after the new flavor controls");
      await page.keyboard.press("Tab");
      await assertFocused(page.locator(".select-flavor-button").first(), "Tab from the step heading reaches the first new control");
      assert.equal(await page.evaluate(() => window.__checkoutScrollProbe.pending()), true, "The original 90ms callback is held until after Tab");
      await page.locator(".select-flavor-button").first().evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
      const scrollAfterTab = await page.evaluate(() => scrollY);
      await page.evaluate(() => window.__checkoutScrollProbe.release());
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator(".select-flavor-button").first().evaluate(element => document.activeElement === element), true, "A released step timer cannot reclaim keyboard focus");
      assert.equal(await page.evaluate(() => scrollY), scrollAfterTab, "A released step timer cannot scroll away from the new keyboard target");
      await next(page);
      await assertFocused(page.getByRole("heading", { name: r.deliveryDetails, exact: true }), "Delivery step receives focus");
      await page.keyboard.press("Tab");
      await assertFocused(page.locator(".form-grid input[required]").first(), "The hidden bot trap must not enter keyboard order");
      await fillDelivery(page);
      await next(page);
      await assertFocused(page.locator(".payment-card .reserve-step-title h2"), "Removing Continue must not drop focus on body");
      await activate(page, page.locator(".reserve-nav button.outline"));
      await assertFocused(page.getByRole("heading", { name: r.deliveryDetails, exact: true }), "Back restores focus to delivery content");
      await activate(page, page.locator(".reserve-progress button").first());
      await assertFocused(page.locator(".reserve-pack-option.selected"), "Returning to pack selection focuses the selected pack");
    });

    test(`keyboard errors are announced and focused, including repeated validation (${locale}, ${size})`, async t => {
      const page = await localPage(t, locale, viewport);
      await page.goto(`${baseURL}/checkout?pack=6-single`);
      await next(page);
      await next(page);
      const error = page.locator(".reserve-alert");
      await error.waitFor();
      assert.equal(await error.getAttribute("role"), "alert");
      assert.equal(await error.innerText(), r.errors.chooseFlavor);
      await assertFocused(error, "Validation text must not appear above a keyboard user without focus");
      await page.keyboard.press("Tab");
      await assertFocused(page.locator(".select-flavor-button").first(), "Tab from the error reaches the controls that resolve it");
      await activate(page, page.getByRole("button", { name: `${r.select} ${flavorCopy[locale].cheddar}`, exact: true }), "Space");
      await next(page);
      await next(page);
      await assertFocused(error, "Missing delivery fields focus the error summary");
      const fields = page.locator(".form-grid input[required]");
      for (const field of await fields.all()) {
        assert.equal(await field.getAttribute("aria-invalid"), "true");
        assert.equal(await field.getAttribute("aria-describedby"), await error.getAttribute("id"));
      }
      await fields.first().focus();
      await page.keyboard.insertText("Synthetic Keyboard");
      await next(page);
      await assertFocused(error, "The same validation message must receive focus on a second attempt");
      assert.equal(await fields.first().getAttribute("aria-invalid"), "false");
      assert.equal(await fields.nth(1).getAttribute("aria-invalid"), "true");
    });

    test(`selection names and state remain accessible with Space and Enter (${locale}, ${size})`, async t => {
      const page = await localPage(t, locale, viewport);
      await page.goto(`${baseURL}/checkout?pack=6-single`);
      const selectedPack = page.locator(".reserve-pack-option.selected");
      await selectedPack.waitFor();
      assert.equal(await selectedPack.getAttribute("aria-pressed"), "true");
      const target = page.locator(".reserve-pack-option").filter({ has: page.getByText(packCopy[locale]["12-single"].name, { exact: true }) });
      await activate(page, target, "Space");
      assert.equal(await target.getAttribute("aria-pressed"), "true");
      await next(page);
      for (const flavor of flavors) {
        assert.equal(await page.getByRole("button", { name: `${r.select} ${flavorCopy[locale][flavor.slug]}`, exact: true }).count(), 1, "Each flavor has a distinct accessible action name");
      }
      const blueberry = page.getByRole("button", { name: `${r.select} ${flavorCopy[locale].blueberry}`, exact: true });
      await activate(page, blueberry, "Space");
      assert.equal(await blueberry.getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator('.select-flavor-button[aria-pressed="true"]').count(), 1);
      await next(page);
      const group = page.getByRole("group", { name: r.deliveryHandoff.label, exact: true });
      await group.waitFor();
      const receive = group.getByRole("button", { name: r.deliveryHandoff.receive, exact: true });
      const porter = group.getByRole("button", { name: r.deliveryHandoff.porter, exact: true });
      assert.equal(await receive.getAttribute("aria-pressed"), "true");
      assert.equal(await porter.getAttribute("aria-pressed"), "false");
      await activate(page, porter, "Space");
      assert.equal(await porter.getAttribute("aria-pressed"), "true");
      assert.equal(await receive.getAttribute("aria-pressed"), "false");
      await activate(page, receive);
      assert.equal(await receive.getAttribute("aria-pressed"), "true");
      assert.equal(await porter.getAttribute("aria-pressed"), "false");
    });

    test(`quantity controls retain flavor names and keyboard clamps (${locale}, ${size})`, async t => {
      const page = await localPage(t, locale, viewport);
      await page.goto(`${baseURL}/checkout?pack=6-mixed`);
      await next(page);
      const name = flavorCopy[locale].cheddar;
      const add = page.getByRole("button", { name: `${r.add} ${name}`, exact: true });
      const remove = page.getByRole("button", { name: `${r.remove} ${name}`, exact: true });
      assert.equal(await add.count(), 1); assert.equal(await remove.count(), 1);
      const quantity = page.locator(".flavor-select-card").filter({ has: page.getByRole("heading", { name, exact: true }) }).locator(".quantity-control strong");
      await add.focus();
      for (let count = 0; count < 15; count++) await page.keyboard.press("Enter");
      assert.equal(await quantity.innerText(), "6");
      await activate(page, remove, "Space");
      assert.equal(await quantity.innerText(), "5");
    });
  }
}
