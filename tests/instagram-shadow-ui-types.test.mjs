import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Type-check the real component. Only React's surface is stubbed here so this
// regression is independent of framework-generated types and build artifacts.
const componentPath = fileURLToPath(
  new URL("../src/app/admin/InstagramShadowDraftButton.tsx", import.meta.url),
);
const reactStubPath = fileURLToPath(new URL("./shadow-react.virtual.d.ts", import.meta.url));
const reactStub = `
declare module "react" {
  export function useState<T>(initial: T): [T, (value: T) => void];
}
declare namespace JSX {
  interface IntrinsicElements { [name: string]: unknown; }
}
`;

test("shadow UI safely distinguishes HTTP failures from application error payloads", () => {
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile.bind(host);
  const originalExists = host.fileExists.bind(host);
  host.readFile = (path) => path === reactStubPath ? reactStub : originalRead(path);
  host.fileExists = (path) => path === reactStubPath || originalExists(path);
  const program = ts.createProgram([componentPath, reactStubPath], options, host);
  const source = program.getSourceFile(componentPath);
  assert.ok(source, "The actual shadow UI component must be loaded");
  const diagnostics = [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  ].filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(
    diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    })),
    [],
  );
});
