import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { loadTs } from "../helpers/load-ts.mjs";
import { fulfillLocalRead } from "./fixtures/local-read.mjs";

const baseURL = process.env.BAGELITO_TEST_URL ?? "http://127.0.0.1:3107";
const origin = new URL(baseURL).origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname), "Run only against a local server without provider/database credentials");
const { flavors } = loadTs("src/data/flavors.ts");
const { packs } = loadTs("src/data/packs.ts");
const { getDeliveryFee } = loadTs("src/lib/delivery-pricing.ts");
let browser;

test.before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    headless: true,
  });
});
test.after(async () => { await browser?.close(); });

async function localPage(t, locale, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(20_000);
  const writes = [];
  const rejectedReads = [];
  let closing = false;
  const errors = [];
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
    assert.deepEqual(rejectedReads, [], "Local redirects must not bypass the network firewall");
    assert.deepEqual(writes, [], "Browsing and editing must not create an order or contact a provider");
    assert.deepEqual(errors, [], "No browser runtime errors");
  });
  return page;
}

const next = page => page.locator(".reserve-nav button.pink").click();
const back = page => page.locator(".reserve-nav button.outline").click();
const flavorCard = (page, name) => page.locator(".flavor-select-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
const selectedPack = page => page.locator(".reserve-pack-option.selected strong");

for (const [locale, viewport] of [["en", { width: 1440, height: 1000 }], ["es", { width: 390, height: 844 }]]) {
  test(`batched repeated flavor changes stay within the pack size (${locale})`, async t => {
    const page = await localPage(t, locale, viewport);
    await page.goto(`${baseURL}/checkout?pack=6-mixed`);
    await next(page);
    const quantities = page.locator(".quantity-control strong");
    await page.locator(".quantity-control button:last-child").evaluateAll(buttons => {
      for (let index = 0; index < 15; index++) buttons[index % buttons.length].click();
    });
    assert.equal((await quantities.allTextContents()).reduce((sum, value) => sum + Number(value), 0), 6);
    await next(page);
    await page.locator(".form-grid").waitFor();
    await back(page);
    await page.locator(".quantity-control button:first-child").evaluateAll(buttons => {
      for (let count = 0; count < 6; count++) for (const button of buttons) button.click();
    });
    assert.deepEqual(await quantities.allTextContents(), flavors.map(() => "0"));
    await page.locator(".quantity-control button:last-child").first().evaluate(button => {
      for (let count = 0; count < 15; count++) button.click();
    });
    assert.equal((await quantities.allTextContents()).reduce((sum, value) => sum + Number(value), 0), 6);
  });

  test(`flavor purchase, repeated selection, edit, totals and remove extra pack (${locale})`, async t => {
    const page = await localPage(t, locale, viewport);
    await page.goto(baseURL);
    const hrefs = await page.locator(".flavor-product-cta").evaluateAll(links => links.map(link => link.getAttribute("href")));
    for (const flavor of flavors) {
      assert.ok(hrefs.includes(`/checkout?pack=6-single&flavor=${flavor.slug}`), flavor.slug);
    }
    await page.locator('.flavor-product-cta[href="/checkout?pack=6-single&flavor=cheddar"]').click();
    await page.waitForURL("**/checkout?pack=6-single&flavor=cheddar");
    await page.locator(".reserve-pack-option.selected").dblclick();
    await next(page);
    assert.equal(await page.locator(".flavor-select-card.selected h3").innerText(), "Cheddar");
    await back(page);
    await next(page);
    assert.equal(await page.locator(".flavor-select-card.selected h3").innerText(), "Cheddar");
    await flavorCard(page, "Blueberry").locator("button").click();
    await next(page);
    const inputs = page.locator(".form-grid input[required]");
    for (const [index, value] of ["Synthetic Checkout", "999000111", "synthetic@example.invalid", "Synthetic address 123"].entries()) {
      await inputs.nth(index).fill(value);
    }
    await next(page);
    const pack = packs.find(item => item.slug === "6-single");
    const expectedTotal = pack.amount + getDeliveryFee("Miraflores");
    assert.equal(await page.locator(".checkout-summary-total strong").innerText(), `S/${expectedTotal}`);
    assert.ok((await page.locator(".checkout-review-card").innerText()).includes("6 x Blueberry"));
    await page.locator(".checkout-upsell-action button").click();
    assert.equal(await page.locator(".checkout-summary-total strong").innerText(), `S/${expectedTotal + pack.amount * 0.8}`);
    assert.ok((await page.locator(".checkout-review-card").innerText()).includes("12 x Blueberry"));
    await page.locator(".checkout-upsell-remove").click();
    assert.equal(await page.locator(".checkout-summary-total strong").innerText(), `S/${expectedTotal}`);
    await page.locator(".culqi-review-only-note").waitFor();
    assert.equal(await page.locator('input[name^="demo-"]').count(), 0, "Demo cannot collect card or bank fields");
    assert.equal(await page.locator('script[src^="https://js.culqi.com"],script[src^="https://3ds.culqi.com"],iframe[src*="culqi"]').count(), 0,
      "Merchant preview must not load the real payment SDK");
    await page.locator(".checkout-summary-heading button").click();
    await page.locator(".reserve-pack-option.selected").click();
    await next(page);
    assert.equal(await page.locator(".flavor-select-card.selected h3").innerText(), "Blueberry");
    await back(page);
    await page.locator(".reserve-pack-option").filter({ hasText: locale === "es" ? "6 mixtos" : "6 mixed" }).click();
    await next(page);
    assert.equal(await page.locator(".flavor-select-card.selected").count(), 0);
    assert.ok((await page.locator(".reserve-step-title").innerText()).includes("0 / 6"));
  });

  test(`same-route navigation, browser back/forward and untrusted URL inputs (${locale})`, async t => {
    const page = await localPage(t, locale, viewport);
    await page.goto(`${baseURL}/checkout?pack=6-single&flavor=cheddar`);
    await page.locator(".header-checkout-link").click();
    await page.waitForURL("**/checkout?pack=6-mixed");
    assert.match(await selectedPack(page).innerText(), locale === "es" ? /6 mixtos/ : /6 mixed/);
    await page.goBack();
    await next(page);
    assert.equal(await page.locator(".flavor-select-card.selected h3").innerText(), "Cheddar");
    await page.goForward();
    assert.match(await selectedPack(page).innerText(), locale === "es" ? /6 mixtos/ : /6 mixed/);
    for (const query of ["pack=6-single&flavor=unknown", "pack=6-single&flavor=cheddar&flavor=plain"]) {
      await page.goto(`${baseURL}/checkout?${query}`);
      await next(page);
      assert.equal(await page.locator(".flavor-select-card.selected").count(), 0);
      await next(page);
      assert.equal(await page.locator(".reserve-alert").count(), 1, "Invalid seed cannot bypass choosing a catalog flavor");
    }
  });
}
