import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { sourceModule } from '../../tests/helpers/load-ts.mjs';

const sourceSha = '97b4ae91798ab82b1b379000ba3be9b8b8495b45';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('./dist/index.html', import.meta.url));
const clientPath = fileURLToPath(new URL('./client.js', import.meta.url));

// Freeze the approved application/assets; the preview lives in its own folder.
execFileSync('git', ['diff', '--exit-code', sourceSha, '--', 'src', 'public'], { cwd: root, stdio: 'pipe' });

const catalog = sourceModule('src/lib/catalog.ts');
const { packs, flavors } = catalog;
const { packCopy, flavorCopy, translations } = sourceModule('src/lib/i18n.ts');
const { flavorImages } = sourceModule('src/data/flavor-images.ts');
const { districtOptions, getDeliveryFee } = sourceModule('src/lib/delivery-pricing.ts');
const { getCheckoutExtraPackOffer } = sourceModule('src/lib/checkout-upsell.ts');
// Public identity is approved literal copy, never an executed configuration.
const siteSource = readFileSync(path.join(root, 'src/lib/site.ts'), 'utf8');
const literalSite = /export const (\w+)\s*=\s*("(?:[^"\\]|\\.)*")\s*;/g;
const site = Object.fromEntries([...siteSource.matchAll(literalSite)].map(([, key, value]) => [key, JSON.parse(value)]));
assert.equal(siteSource.replace(literalSite, '').trim(), '', 'Only literal public site constants may enter the preview');
const images = {};
const transparentPixel = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
const availablePacks = new Set(packs.map(pack => pack.slug));
const availableFlavors = new Set(flavors.map(flavor => flavor.slug));

function inertProps(props) {
  return Object.fromEntries(Object.entries(props ?? {}).filter(([key]) => !/^on[A-Z]/.test(key)
    && !['ref', 'target', 'rel', 'formAction', 'action', 'srcSet', 'srcset', 'ping', 'download'].includes(key)));
}

function localLink(href) {
  const raw = typeof href === 'string' ? href : href?.pathname;
  if (typeof raw === 'string' && /^#[a-z0-9_-]+$/i.test(raw)) {
    return { href: raw, 'data-demo-scroll': raw.slice(1) };
  }
  const url = new URL(typeof raw === 'string' ? raw : '/', 'https://static-demo.invalid');
  if (url.origin === 'https://static-demo.invalid' && url.pathname === '/') {
    return { href: '#home', 'data-demo-action': 'home' };
  }
  if (url.origin === 'https://static-demo.invalid' && ['/checkout', '/reserve'].includes(url.pathname)) {
    const pack = url.searchParams.get('pack');
    const flavor = url.searchParams.get('flavor');
    return {
      href: '#demo-checkout', 'data-demo-action': 'checkout',
      ...(availablePacks.has(pack) ? { 'data-pack': pack } : {}),
      ...(availableFlavors.has(flavor) ? { 'data-flavor': flavor } : {}),
    };
  }
  return { href: '#demo-information', 'data-demo-action': 'information' };
}

function SafeLink({ href, children, ...props }) {
  return React.createElement('a', { ...inertProps(props), ...localLink(href) }, children);
}

function SafeImage({ src, alt = '', width, height, sizes, className, style, priority, loading }) {
  assert.equal(typeof src, 'string');
  assert.match(src, /^\/images\/[a-z0-9._-]+$/i, 'Only original local photo/logo assets may be embedded');
  if (!Object.hasOwn(images, src)) {
    const imagePath = path.join(root, 'public', src.slice(1));
    const mime = { '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(src)];
    assert.ok(mime, `Unsupported asset format: ${src}`);
    images[src] = `data:${mime};base64,${readFileSync(imagePath).toString('base64')}`;
  }
  return React.createElement('img', {
    src: transparentPixel, 'data-asset': src, alt, width, height, sizes, className, style,
    loading: priority ? 'eager' : loading ?? 'lazy', decoding: 'async',
  });
}

const inertReact = {
  ...React,
  useEffect() {}, useLayoutEffect() {},
  useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; },
  useRef(initial) { return { current: initial }; },
  useMemo(make) { return make(); }, useCallback(callback) { return callback; },
};

function motionElement(type) {
  return function InertMotion({ children, style = {}, ...props }) {
    const { rotate, scale, x, y, ...staticStyle } = style;
    const transforms = [
      ...(rotate == null ? [] : [`rotate(${rotate}deg)`]),
      ...(scale == null ? [] : [`scale(${scale})`]),
      ...(x == null && y == null ? [] : [`translate(${x ?? 0}px, ${y ?? 0}px)`]),
    ];
    if (transforms.length) staticStyle.transform = [staticStyle.transform, ...transforms].filter(Boolean).join(' ');
    const allowed = inertProps(props);
    for (const key of ['initial', 'animate', 'exit', 'variants', 'transition', 'whileHover', 'whileTap', 'layout']) delete allowed[key];
    return React.createElement(type, { ...allowed, style: staticStyle }, children);
  };
}

function safeJsx(factory, type, props, key) {
  if (typeof type !== 'string') return factory(type, props, key);
  if (['script', 'link', 'style', 'base', 'iframe', 'object', 'embed'].includes(type)) return null;
  if (type === 'a') return factory('a', { ...inertProps(props), ...localLink(props.href) }, key);
  if (type === 'img') return factory(SafeImage, props, key);
  const safe = inertProps(props);
  if (type === 'form') return factory('div', { ...safe, role: 'group', 'data-demo-form': 'inert' }, key);
  if (type === 'button') {
    safe.type = 'button';
    if (['EN', 'ES'].includes(props.children) && Object.hasOwn(props, 'aria-pressed')) safe['data-demo-locale'] = props.children.toLowerCase();
    if (props.className === 'faq-question') safe['data-demo-faq'] = props['aria-controls'];
  }
  return factory(type, safe, key);
}

function renderViews(locale) {
  const language = { useLanguage: () => ({ locale, copy: translations[locale], setLocale() {} }) };
  const batch = { useBatchAvailability: () => ({ accepting: false, merchantReviewOnly: true }) };
  const overrides = {
    react: inertReact,
    'react/jsx-runtime': { jsx: (type, props, key) => safeJsx(jsx, type, props, key),
      jsxs: (type, props, key) => safeJsx(jsxs, type, props, key), Fragment: React.Fragment },
    'next/image': { __esModule: true, default: SafeImage },
    'next/link': { __esModule: true, default: SafeLink },
    'next/navigation': { useSearchParams: () => new URLSearchParams(), usePathname: () => '/',
      useRouter: () => ({ push() {}, replace() {}, refresh() {} }) },
    'framer-motion': { motion: { div: motionElement('div'), span: motionElement('span') },
      useScroll: () => ({ scrollYProgress: 0 }), useTransform: (_value, _input, output) => output[0] },
    '@/lib/analytics': { trackBagelitoEvent() {} },
    '@/lib/site': site,
    '@/lib/whatsapp': { getWhatsAppHref: () => '/demo-information', getWhatsAppHrefForPhone: () => '/demo-information' },
    './LanguageProvider': language, '@/components/LanguageProvider': language,
    './BatchAvailabilityProvider': batch, '@/components/BatchAvailabilityProvider': batch,
  };
  const cache = new Map();
  const render = (module, name) => {
    const Component = sourceModule(module, overrides, cache)[name];
    const html = renderToStaticMarkup(React.createElement(Component));
    assert.doesNotMatch(html, /<(?:script|link|form|iframe|object|embed|base)\b/i);
    assert.doesNotMatch(html, /\b(?:href|src)="(?:https?:|\/|mailto:|tel:|javascript:)/i);
    assert.doesNotMatch(html, /\son[a-z]+=/i);
    return html;
  };
  return {
    home: render('src/app/page.tsx', 'default'),
    header: render('src/components/Header.tsx', 'Header'),
    footer: render('src/components/Footer.tsx', 'Footer'),
  };
}

const views = { es: renderViews('es'), en: renderViews('en') };
const data = {
  sourceSha, packs, flavors, flavorImages, packCopy, flavorCopy, translations,
  districts: districtOptions.map(name => ({ name, fee: getDeliveryFee(name) })),
  extraOffers: Object.fromEntries(packs.map(pack => [pack.slug, getCheckoutExtraPackOffer(pack.amount)])),
  images, views,
};
const css = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
assert.doesNotMatch(css, /@import\b|url\s*\(/i, 'Preview CSS cannot load resources');
const demoCssPath = fileURLToPath(new URL('./demo.css', import.meta.url));
const demoCss = existsSync(demoCssPath) ? readFileSync(demoCssPath, 'utf8') : '';
assert.doesNotMatch(demoCss, /@import\b|url\s*\(/i, 'Demo CSS cannot load resources');
const client = readFileSync(clientPath, 'utf8');
assert.doesNotMatch(client, /<\/script|sourceMappingURL/i);
const json = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
  .replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const bootstrap = `window.DEMO_DATA=${json};`;
const hash = script => `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
const csp = [
  "default-src 'none'", "connect-src 'none'", "form-action 'none'", "object-src 'none'", "frame-src 'none'",
  "worker-src 'none'", "base-uri 'none'", "img-src data:", "font-src 'none'", "media-src 'none'",
  "style-src 'unsafe-inline'", `script-src ${hash(bootstrap)} ${hash(client)}`, "script-src-attr 'none'",
].join('; ');
const previewCss = `#demo-preview-label{position:relative;z-index:1000;padding:12px 20px;background:#071333;color:#fff;text-align:center;font:700 14px/1.5 system-ui,sans-serif}#demo-preview-label strong{color:#ffe59a}#demo-announcement{max-width:900px;margin:0 auto;padding:0 20px;font:600 14px/1.5 system-ui,sans-serif}#demo-announcement:empty{display:none}#demo-announcement:not(:empty){padding-block:12px}html{scroll-behavior:smooth}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation:none!important;transition:none!important}}`;
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="data:,"><title>Bagelito · Demo estática aislada</title><style>${css}\n${previewCss}\n${demoCss}</style></head><body><aside id="demo-preview-label"><strong>DEMO ESTÁTICA AISLADA · ISOLATED STATIC DEMO</strong><br>Sin pedidos, pagos, envíos de datos ni conexiones externas. / No orders, payments, data submissions or external connections.</aside><div id="demo-announcement" role="status" aria-live="polite"></div><div id="demo-app">${views.es.home}</div><script>${bootstrap}</script><script>${client}</script></body></html>`;
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, html);
console.log(JSON.stringify({ output, sourceSha, bytes: Buffer.byteLength(html), packs: packs.length,
  flavors: flavors.length, districts: data.districts.length, embeddedAssets: Object.keys(images).length,
  scripts: 2, clientHash: hash(client), bootstrapHash: hash(bootstrap) }, null, 2));
