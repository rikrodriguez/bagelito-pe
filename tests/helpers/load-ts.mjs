import { readFileSync, existsSync } from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function sourceModule(relativePath, overrides = {}, cache = new Map()) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, loaded);
  loaded.require = specifier => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const target = specifier.startsWith('@/') ? path.join(root, 'src', specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      const resolved = [target, target + '.ts', target + '.tsx'].find(existsSync);
      if (resolved && /\.tsx?$/.test(resolved)) return sourceModule(path.relative(root, resolved), overrides, cache);
    }
    return Module.prototype.require.call(loaded, specifier);
  };
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  loaded._compile(compiled, filename);
  return loaded.exports;
}
