import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const filename = fileURLToPath(new URL('../../src/components/payments/CulqiCheckoutButton.tsx', import.meta.url));
const source = await readFile(filename, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  },
}).outputText;
const componentModule = new Module(filename);
componentModule.filename = filename;
componentModule.paths = Module._nodeModulePaths(path.dirname(filename));
componentModule.require = function requireComponentDependency(specifier) {
  if (specifier === 'next/script') {
    // Next's afterInteractive scripts are inserted on the client and omitted
    // from SSR. Render their actual id/src props as the browser loader would.
    return {
      __esModule: true,
      default: ({ id, src }) => React.createElement('script', { id, src }),
    };
  }
  return Module.prototype.require.call(this, specifier);
};
componentModule._compile(compiled, filename);
const { CulqiCheckoutButton } = componentModule.exports;

function renderCheckout(enabled = true) {
  return renderToStaticMarkup(React.createElement(CulqiCheckoutButton, {
    amount: 66,
    config: {
      enabled, mode: 'sandbox', provider: 'culqi', currency: 'PEN',
      publicKey: 'pk_test_fixture123', rsaId: 'fixture-rsa-id', rsaPublicKey: 'fixture-public-only',
    },
    customerEmail: 'fixture@example.invalid', locale: 'es', disabled: false,
    onError() {},
    onToken() { throw new Error('No provider calls in this test'); },
    prepareCheckout() { throw new Error('No reservation calls in this test'); },
  }));
}

function documentFromRenderedHtml(html) {
  const elements = new Map();
  const inserted = [];
  function element(tagName) {
    const children = [];
    return {
      tagName: tagName.toUpperCase(), id: '', value: '', children,
      setAttribute(name, value) { this[name] = value; },
      appendChild(child) {
        children.push(child);
        if (child.id) elements.set(child.id, child);
        return child;
      },
    };
  }
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const node = element(match[1]);
    node.id = match[2];
    elements.set(node.id, node);
  }
  const body = element('body');
  const append = body.appendChild;
  body.appendChild = function appendToBody(child) {
    inserted.push(child);
    return append.call(this, child);
  };
  return {
    body, inserted, createElement: element,
    getElementById: id => elements.get(id) ?? null,
  };
}

function bootstrapSdkFixture(document) {
  // Boundary observed in the real SDK: it provisions its Vue UI only when the
  // reserved mount does not already exist. Vue supplies this collection input.
  if (!document.getElementById('culqi-3ds')) {
    const mount = document.createElement('div');
    mount.id = 'culqi-3ds';
    document.body.appendChild(mount);
    const collectionInput = document.createElement('input');
    collectionInput.id = 'cardinal_collection_form_input';
    mount.appendChild(collectionInput);
  }
  return {
    collectDeviceData() {
      // This intentionally reproduces the SDK's null.value failure when the
      // loader script has occupied its mount and prevented provisioning.
      document.getElementById('cardinal_collection_form_input').value = 'fixture-collection-context';
    },
  };
}

test('real checkout render gives the SDK loader a distinct id and leaves its mount unoccupied', () => {
  const html = renderCheckout();
  const scripts = [...html.matchAll(/<script\b[^>]*\bid="([^"]+)"[^>]*\bsrc="([^"]+)"[^>]*>/gi)];
  const threeDs = scripts.filter(script => script[2] === 'https://3ds.culqi.com');
  assert.equal(threeDs.length, 1);
  assert.equal(threeDs[0][1], 'culqi-3ds-script');
  assert.equal(scripts.some(script => script[1] === 'culqi-3ds'), false);
  const document = documentFromRenderedHtml(html);
  assert.equal(document.getElementById('culqi-3ds-script').tagName, 'SCRIPT');
  assert.equal(document.getElementById('culqi-3ds'), null);
});

test('SDK bootstrap provisions its reserved mount and collection input with the current render', () => {
  const document = documentFromRenderedHtml(renderCheckout());
  const sdk = bootstrapSdkFixture(document);
  assert.equal(document.getElementById('culqi-3ds').tagName, 'DIV');
  assert.equal(document.getElementById('cardinal_collection_form_input').tagName, 'INPUT');
  assert.doesNotThrow(() => sdk.collectDeviceData());
  assert.equal(document.getElementById('cardinal_collection_form_input').value, 'fixture-collection-context');
  assert.equal(document.getElementById('culqi-3ds-script').tagName, 'SCRIPT');
});

test('the former script id reproduces the exact skipped-mount null input failure', () => {
  const html = renderCheckout().replace('id="culqi-3ds-script"', 'id="culqi-3ds"');
  const document = documentFromRenderedHtml(html);
  const sdk = bootstrapSdkFixture(document);
  assert.equal(document.getElementById('culqi-3ds').tagName, 'SCRIPT');
  assert.equal(document.getElementById('cardinal_collection_form_input'), null);
  assert.equal(document.inserted.length, 0);
  assert.throws(() => sdk.collectDeviceData(), {
    name: 'TypeError', message: /Cannot set properties of null/,
  });
});

test('repeated SDK bootstrap preserves its own UI instead of creating duplicate mounts', () => {
  const document = documentFromRenderedHtml(renderCheckout());
  const first = bootstrapSdkFixture(document);
  first.collectDeviceData();
  const mount = document.getElementById('culqi-3ds');
  const collectionInput = document.getElementById('cardinal_collection_form_input');
  const second = bootstrapSdkFixture(document);
  assert.doesNotThrow(() => second.collectDeviceData());
  assert.equal(document.getElementById('culqi-3ds'), mount);
  assert.equal(document.getElementById('cardinal_collection_form_input'), collectionInput);
  assert.equal(document.inserted.filter(node => node.id === 'culqi-3ds').length, 1);
});

test('disabled checkout never inserts the 3DS loader or occupies the SDK mount', () => {
  const html = renderCheckout(false);
  assert.doesNotMatch(html, /<script\b/);
  const document = documentFromRenderedHtml(html);
  assert.equal(document.getElementById('culqi-3ds-script'), null);
  assert.equal(document.getElementById('culqi-3ds'), null);
  assert.equal(document.getElementById('cardinal_collection_form_input'), null);
});
