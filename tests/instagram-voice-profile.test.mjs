import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadTypeScriptModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const { DAWN_VOICE_PROFILE, scoreDawnStyle } = await loadTypeScriptModule(
  "../src/lib/instagram/voice-profile.ts",
);

test("voice profile records the audited Dawn message shape", () => {
  assert.equal(DAWN_VOICE_PROFILE.version, "dawn-instagram-2026-11-03-v1");
  assert.equal(DAWN_VOICE_PROFILE.observed.textMessages, 3385);
  assert.equal(DAWN_VOICE_PROFILE.observed.medianCharacters, 68);
  assert.equal(DAWN_VOICE_PROFILE.layout.maximumBubbles, 2);
});

test("long one-paragraph replies fail as walls of text", () => {
  const result = scoreDawnStyle(
    "Holaaa! Tenemos muchos sabores disponibles y packs de seis y doce bagels para que puedas escoger todos los que quieras. También contamos con delivery y podemos ayudarte con los siguientes pasos para completar tu pedido cuando estés lista.",
  );

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "wall_of_text"));
});

test("pipe-separated pack prices are rejected", () => {
  const result = scoreDawnStyle("🥯 6 mixtos — S/. 60 | 12 mixtos — S/. 115");

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "pipe_separator"));
});

test("excessive emoji density is rejected", () => {
  const result = scoreDawnStyle("Holaaa 😊🥯🎉💛✨😍🔥 Tenemos bagels!");

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "excessive_emojis"));
});

test("support-bot wording is rejected", () => {
  const result = scoreDawnStyle(
    "Estimada cliente, hemos recibido tu solicitud y te guiaremos con los siguientes pasos.",
  );

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "support_bot_language"));
});

test("a Dawn-style order summary passes with strong score", () => {
  const result = scoreDawnStyle(
    [
      "Perfecto, Jimena! 🥯\n\nTe confirmo tu pedido:\n\n🥯 2 Plain — S/. 20\n🥯 2 Cheddar — S/. 24\n\nTotal: S/. 44",
      "📍 Miraflores\n\nPuedes yapear al número vigente de Bagelito y mandarme la captura cuando puedas.\n\nMil gracias por tu pedido! 😊",
    ],
    { kind: "order_summary" },
  );

  assert.equal(result.pass, true);
  assert.ok(result.score >= 90);
  assert.equal(result.issues.length, 0);
});

test("short operational replies remain natural one-liners", () => {
  const result = scoreDawnStyle("Perfecto!! Te aviso cuando estén listos 🥯");

  assert.equal(result.pass, true);
  assert.ok(result.score >= 95);
});
