"""Cloud-local browser checks. Needs installed Python Playwright + /usr/bin/chromium.
Run after npm run build, with the app on http://127.0.0.1:3107 and no app credentials.
All POSTs are intercepted; all external requests are blocked. No paid browser service.
"""
import json
import argparse
import subprocess
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output-dir", type=Path, default=ROOT / "docs/waitlist-attribution/screenshots")
parser.add_argument("--via-reserve", action="store_true", help="Exercise open home -> reserve -> closed batch -> waitlist")
args = parser.parse_args()
OUT = args.output_dir.resolve()
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:3107"
admin_html = subprocess.check_output(["node", "tests/fixtures/waitlist-admin-preview.mjs"], cwd=ROOT, text=True)
results = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for viewport_name, viewport in [("desktop", {"width": 1440, "height": 1000}), ("mobile", {"width": 390, "height": 844})]:
        for source, locale in [("instagram", "es"), ("tiktok", "en"), ("direct", "es")]:
            context = browser.new_context(viewport=viewport, device_scale_factor=1, reduced_motion="reduce", service_workers="block")
            page = context.new_page()
            calls = []
            violations = []
            batch = {"accepting": True, "batchName": "Synthetic batch", "status": "orders_open", "reservedPacks": 0, "reservedBagels": 0, "remainingPacks": 10, "remainingBagels": 120, "capacityPacks": 10, "capacityBagels": 120, "ordersCloseAt": None, "deliveryDate": None}
            def route_request(route):
                request = route.request
                parsed = urlparse(request.url)
                if parsed.hostname != "127.0.0.1":
                    route.abort()
                elif parsed.path == "/__synthetic_admin_preview":
                    route.fulfill(status=200, content_type="text/html", body=admin_html)
                elif args.via_reserve and parsed.path == "/api/batch":
                    route.fulfill(status=200, content_type="application/json", body=json.dumps(batch))
                elif parsed.path == "/api/waitlist" and request.method == "POST":
                    calls.append(request.post_data_json)
                    route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "signup": {"list_date": "2026-10-16", "list_label": "Synthetic QA"}}))
                elif request.method not in ["GET", "HEAD"]:
                    violations.append(parsed.path)
                    route.abort()
                else:
                    route.continue_()
            page.route("**/*", route_request)
            query = "" if source == "direct" else f"?utm_source={source}&utm_medium=social&utm_campaign=october&utm_content={'reel-1' if source == 'instagram' else 'video-2'}&fbclid=discarded"
            if args.via_reserve:
                query += ("&" if query else "?") + "token=synthetic-private&checkoutSessionId=synthetic-private&email=private%40example.invalid"
            response = page.goto(BASE + "/" + query, wait_until="networkidle")
            assert response.status == 200
            page.locator(".language-toggle button").nth(1 if locale == "es" else 0).click()
            page.wait_for_function("document.documentElement.lang === '" + locale + "'")
            selector = 'a[href^="/reserve?"]' if args.via_reserve else 'a[href^="/waitlist"]'
            # The first matching deadline CTA is intentionally hidden on mobile.
            page.locator(selector).first.wait_for(state="attached")
            hrefs = page.locator(selector).evaluate_all("links => links.map(a => a.getAttribute('href'))")
            assert len(hrefs) >= (4 if args.via_reserve else 6)
            for href in hrefs:
                params = parse_qs(urlparse(href).query)
                assert params.get("utm_source") == ([source] if source != "direct" else None)
                assert "fbclid" not in params
                assert set(params).issubset({"pack", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"})
            if source == "instagram":
                page.screenshot(path=str(OUT / f"home-{viewport_name}.png"), full_page=False)
            pack_link = page.locator('#packs a[href*="pack=12-mixed"]').first
            pack_link.click()
            if args.via_reserve:
                page.wait_for_url("**/reserve?**")
                batch.update({"accepting": False, "status": "closed"})
                # Hydrate a fresh closed-batch view without any reservation/payment POST.
                page.reload(wait_until="networkidle")
                exit_link = page.locator('.reserve-closed-card a[href^="/waitlist"]')
                exit_link.wait_for()
                params = parse_qs(urlparse(exit_link.get_attribute("href")).query)
                assert params["pack"] == ["12-mixed"]
                assert params.get("utm_source") == ([source] if source != "direct" else None)
                assert set(params).issubset({"pack", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"})
                exit_link.click()
            page.wait_for_url("**/waitlist?**")
            page.wait_for_load_state("networkidle")
            assert parse_qs(urlparse(page.url).query)["pack"] == ["12-mixed"]
            assert page.locator("html").get_attribute("lang") == locale
            assert page.locator(".waitlist-form-card select").first.input_value() == "12-mixed"
            inputs = page.locator('.waitlist-form-card input:not([name="website"]):not([type="checkbox"])')
            for field, value in zip(inputs.all(), ["QA Synthetic", "000000000", "qa@example.invalid"]):
                field.fill(value)
            consent = page.locator('.waitlist-form-card input[type="checkbox"]')
            assert not consent.is_checked()
            consent.check()
            if source == "instagram":
                page.screenshot(path=str(OUT / f"waitlist-{viewport_name}.png"), full_page=True)
            consent.uncheck()
            page.locator(".submit-button").click()
            assert not calls
            assert page.locator(".reserve-alert").is_visible()
            consent.check()
            page.locator(".submit-button").click()
            page.locator(".waitlist-success-card").wait_for()
            assert len(calls) == 1
            expected = "waitlist_page" if source == "direct" else f"utm:v1:utm_source={source}&utm_medium=social&utm_campaign=october&utm_content={'reel-1' if source == 'instagram' else 'video-2'}"
            assert calls[0]["source"] == expected
            assert calls[0]["preferredPackSlug"] == "12-mixed"
            assert calls[0]["locale"] == locale
            assert calls[0]["consentAccepted"] is True
            assert calls[0]["contactPreference"] == "whatsapp"
            assert not violations
            results.append({"viewport": viewport_name, "channel": source, "locale": locale, "route": "home-reserve-closed-waitlist" if args.via_reserve else "home-waitlist", "home_links": len(hrefs), "explicit_consent": True, "payload_preserved": True, "real_writes": 0})
            if args.via_reserve:
                admin_html = subprocess.check_output(["node", "tests/fixtures/waitlist-admin-preview.mjs", "--source", calls[0]["source"]], cwd=ROOT, text=True)
                page.goto(BASE + "/__synthetic_admin_preview", wait_until="networkidle")
                label = {"instagram": "Instagram", "tiktok": "TikTok", "direct": "Direct / waitlist"}[source]
                assert page.get_by_text(label, exact=True).count() == 1
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(OUT / f"admin-{source}-{viewport_name}.png"), full_page=True)
            elif source == "direct":
                page.goto(BASE + "/__synthetic_admin_preview", wait_until="networkidle")
                for label in ["Instagram", "TikTok", "Direct / waitlist", "october", "reel-1", "video-2"]:
                    assert page.get_by_text(label, exact=True).count() > 0
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(OUT / f"admin-sources-{viewport_name}.png"), full_page=True)
            context.close()
    browser.close()
print(json.dumps({"browser": "local Chromium", "third_party_requests_allowed": False, "real_database_writes": 0, "scenarios": results}, indent=2))
