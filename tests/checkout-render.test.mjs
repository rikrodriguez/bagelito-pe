import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
// Compile the real component, retaining real React/Next/Icon dependencies.
const filename = path.resolve(__dirname, '../src/components/payments/CulqiCheckoutButton.tsx');
const source = fs.readFileSync(filename, 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const componentModule = new Module(filename);
componentModule.filename = filename;
componentModule.paths = Module._nodeModulePaths(path.dirname(filename));
componentModule._compile(compiled, filename);
const { CulqiCheckoutButton } = componentModule.exports;
function render(enabled, mode='disabled') {
 return renderToStaticMarkup(React.createElement(CulqiCheckoutButton, {
  amount:60,config:{enabled,mode,provider:'culqi',currency:'PEN',publicKey:'pk_test_synthetic',rsaId:'synthetic',rsaPublicKey:'synthetic'},
  customerEmail:'',locale:'es',disabled:false,onError(){},onDemoComplete(){throw Error('Demo must never run');},
  onAlternativePayment(){throw Error('No network in render');},onToken(){throw Error('No network in render');},prepareCheckout(){throw Error('No network in render');}
 }));
}
test('disabled checkout renders no payment collection inputs or submit form', () => {
 const html=render(false);
 assert.doesNotMatch(html, /<(input|form)\b/);
 assert.match(html, /Pagos online temporalmente no disponibles/);
});
test('sandbox checkout displays persistent test-only warning', () => {
 const html=render(true,'sandbox');
 assert.match(html, /PRUEBAS/);
 assert.match(html, /No se realizan cobros reales/);
 assert.doesNotMatch(html, /name="demo-/);
});
