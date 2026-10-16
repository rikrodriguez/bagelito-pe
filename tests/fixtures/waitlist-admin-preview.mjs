// Local-only screenshot fixture: actual source component/CSS, synthetic surrounding rows.
// This creates no app route, session, auth bypass or database record.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { sourceModule } from '../helpers/load-ts.mjs';
const { WaitlistSource } = sourceModule('src/components/WaitlistSource.tsx');
const sources = ['utm:v1:utm_source=instagram&utm_medium=social&utm_campaign=october&utm_content=reel-1', 'utm:v1:utm_source=tiktok&utm_medium=social&utm_campaign=october&utm_content=video-2', 'waitlist_page'];
const rows = sources.map((source, i) => renderToStaticMarkup(React.createElement('article', { className: 'waitlist-admin-row', key: i }, React.createElement('div', null,
  React.createElement('strong', null, 'QA Synthetic ' + (i + 1)),
  React.createElement('span', null, '000000000 · qa@example.invalid'),
  React.createElement('small', null, '12 mixed · whatsapp · Synthetic fixture'),
  React.createElement(WaitlistSource, { source }),
)))).join('');
const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
process.stdout.write(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic waitlist source preview</title><style>${css}</style><body><main style="max-width:1050px;margin:32px auto;padding:16px"><section class="admin-card"><p class="kicker">Local synthetic component preview</p><h1>Waitlist sources</h1><p>Actual source component and app CSS. No live admin session or customer data.</p><div class="waitlist-row-list">${rows}</div></section></main></body></html>`);
