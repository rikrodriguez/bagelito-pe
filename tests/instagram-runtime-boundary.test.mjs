import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

test("Next TypeScript checks web sources without treating Deno functions as Node code", async () => {
  const root = await mkdtemp(join(tmpdir(), "bagelito-runtime-boundary-"));
  try {
    const config = JSON.parse(await readFile(new URL("../tsconfig.json", import.meta.url), "utf8"));
    await mkdir(join(root, "src/lib"), { recursive: true });
    await mkdir(join(root, "supabase/functions/probe"), { recursive: true });
    const webFile = join(root, "src/lib/probe.ts");
    const denoFile = join(root, "supabase/functions/probe/index.ts");
    await writeFile(webFile, "export const web = true;\n");
    await writeFile(denoFile, "Deno.serve(() => new Response('ok'));\n");
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, root);
    assert.equal(parsed.errors.length, 0);
    assert.ok(parsed.fileNames.includes(webFile), "Web code must remain type-checked");
    assert.ok(!parsed.fileNames.includes(denoFile), "Deno code requires its own runtime checker");
    assert.equal(parsed.options.strict, true, "Do not weaken type safety to fix the build");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
