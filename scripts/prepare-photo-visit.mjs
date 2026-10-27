import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

// Design assets are copied INTO the deployment. No Adobe URL is fetched by a visitor.
// For reproducible/offline builds, place scene.png and logo.jpg in VISIT_ASSET_DIR.
// The Adobe edit removed raster UI/prices and adjusted bagel scale; it is NOT a real store photo.
const sources = {
  scene: "https://photoshop-api.adobe.io/v2/short-url/urn:aaid:ps:US:b413c773-b3cd-40d0-b87e-7c7dd6649a48",
  logo: "https://at.adobe.com/EsbnDYJB5LcaVorr",
};
const output = path.join(process.cwd(), "public/visit");
await mkdir(output, { recursive: true });
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function source(name, extension) {
  if (process.env.VISIT_ASSET_DIR) return readFile(path.join(process.env.VISIT_ASSET_DIR, name + extension));
  const response = await fetch(sources[name], { redirect: "follow", signal: AbortSignal.timeout(35000) });
  if (!response.ok) throw new Error(`Cannot import approved ${name} asset: HTTP ${response.status}. Restore local source using VISIT_ASSET_DIR; do not replace with an unrelated image.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024 || bytes.length > 18 * 1024 * 1024) throw new Error(`Unexpected ${name} asset size`);
  await sharp(bytes).metadata();
  return bytes;
}
const manifest = { scope: "Conceptual preview / first tranche", source: "User-approved Bagelito NY deli reference and exact supplied logo", imported: [] };
for (const name of ["scene", "logo"]) {
  const dest = path.join(output, name === "scene" ? "scene.webp" : "logo.jpg");
  if (await exists(dest)) { console.log(`visit asset cached: ${path.basename(dest)}`); continue; }
  const bytes = await source(name, name === "scene" ? ".png" : ".jpg");
  const image = sharp(bytes).rotate();
  const rendered = name === "scene"
    ? await image.resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 83, effort: 5 }).toBuffer()
    : await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  await writeFile(dest, rendered);
  manifest.imported.push({ name: path.basename(dest), bytes: rendered.length, sha256: createHash("sha256").update(rendered).digest("hex") });
  console.log(`visit asset ready: ${path.basename(dest)} (${rendered.length} bytes)`);
}
if (manifest.imported.length) await writeFile(path.join(output, "source-manifest.json"), JSON.stringify(manifest, null, 2));
