import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sourceModule } from './helpers/load-ts.mjs';

const { translations } = sourceModule('src/lib/i18n.ts');
for (const locale of ['es', 'en']) {
  for (const [review, accepting] of [[false, true], [true, false], [false, false]]) {
    test(`header preserves validated campaign without leaking private URL data (${locale}, review=${review}, accepting=${accepting})`, () => {
      const { Header } = sourceModule('src/components/Header.tsx', {
        'next/navigation': { useSearchParams: () => new URLSearchParams(
          'utm_source=Instagram&utm_campaign=integration&email=private%40example.invalid&orderCode=BAG-PRIVATE&checkoutSessionId=private&pack=unknown',
        ) },
        'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
        'next/image': { __esModule: true, default: ({ src, alt }) => React.createElement('img', { src, alt }) },
        './LanguageToggle': { LanguageToggle: () => null },
        './LanguageProvider': { useLanguage: () => ({ locale, copy: translations[locale] }) },
        './BatchAvailabilityProvider': { useBatchAvailability: () => ({ accepting, merchantReviewOnly: review }) },
      });
      const html = renderToStaticMarkup(React.createElement(Header));
      const href = /class="header-checkout-link" href="([^"]+)"/.exec(html)?.[1];
      if (!review && !accepting) {
        assert.equal(href, undefined);
        return;
      }
      assert.ok(href);
      const url = new URL(href.replaceAll('&amp;', '&'), 'https://synthetic.invalid');
      assert.equal(url.pathname, '/checkout');
      assert.deepEqual(Object.fromEntries(url.searchParams), {
        utm_source: 'instagram', utm_campaign: 'integration', pack: '6-mixed',
      });
      assert.doesNotMatch(href, /private|BAG-PRIVATE|email|checkoutSessionId/);
    });
  }
}
