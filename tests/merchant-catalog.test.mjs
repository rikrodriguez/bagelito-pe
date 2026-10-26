import test from "node:test";
import assert from "node:assert/strict";
import {readFile,access} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const src=await readFile(path.join(root,"src/components/FlavorStrip.tsx"),"utf8");
const flavors=await readFile(path.join(root,"src/data/flavors.ts"),"utf8");
const packs=await readFile(path.join(root,"src/data/packs.ts"),"utf8");

test("catalog shows 10 distinct real local bagel photos, not invented products",async()=>{
 const mapped=[...src.matchAll(/(?:^\s*|,?\s+)(?:"([^"]+)"|([a-z]+)):\s*"(\/images\/bagel-[\w-]+\.webp)"/gm)];
 assert.ok(mapped.length>=10,"Culqi requires >=5 photographed products");
 const paths=mapped.map(m=>m[3]);
 assert.equal(new Set(paths).size,paths.length);
 for(const imagePath of paths)await access(path.join(root,"public",imagePath));
});
test("prices use the existing actual pack amount and never invent a new checkout amount",()=>{
 assert.match(packs,/slug:\s*"6-single"[^}]*amount:\s*50/);
 assert.match(src,/minimumSingleFlavorPack\.amount/);
 assert.match(src,/Minimum: 6 bagels/);
 assert.match(src,/Pedido mínimo: 6 bagels/);
 assert.doesNotMatch(src,/flavor\.price/);
});
test("purchase CTA respects accepting status and does not take payment for a closed batch",()=>{
 assert.match(src,/accepting \? "\/checkout\?pack=6-single" : "\/waitlist\?pack=6-single"/);
 assert.match(src,/href=\{destination\}/);
 assert.match(src,/Choose pack/);
 assert.match(src,/Notify me/);
});
test("all catalog flavor keys have descriptive copy and canonical names",()=>{
 const keys=[...flavors.matchAll(/slug:\s*"([\w-]+)"/g)].map(m=>m[1]);
 assert.equal(keys.length,10);
 for(const key of keys)assert.ok(src.includes('"'+key+'":')||new RegExp("\\b"+key+":").test(src),key);
 assert.match(src,/flavorDescriptions\[locale\]/);
});
