import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));

// Execute the real source while replacing explicit I/O boundaries in tests.
export function loadTs(source, overrides = {}) {
  const filename = path.join(root, source);
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = (specifier) => Object.hasOwn(overrides, specifier)
    ? overrides[specifier]
    : Module.prototype.require.call(mod, specifier);
  mod._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText, filename);
  return mod.exports;
}
