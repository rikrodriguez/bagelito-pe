import test from "node:test";
import assert from "node:assert/strict";
import {readFile,access} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
const src=await readFile(path.join(root,"src/components/FlavorStrip.tsx"),"utf8");
const imagesSrc=await readFile(path.join(root,"src/data/flavor-images.ts"),"utf8");
const flavors=await readFile(path.join(root,"src/data/flavors.ts"),"utf8");
const packs=await readFile(path.join(root,"src/data/packs.ts"),"utf8");

test("catalog shows 10 distinct real local bagel photos, not invented products",async()=>{
 const mapped=[...imagesSrc.matchAll(/(?:^\s*|,?\s+)(?:"([^"]+)"|([a-z]+)):\s*"(\/images\/bagel-[\w-]+\.webp)"/gm)];
 assert.ok(mapped.length>=10,"Culqi requires >=5 photographed products");
 const paths=mapped.map(m=>m[3]);
 assert.equal(new Set(paths).size,paths.length);
 for(const imagePath of paths)await access(path.join(root,"public",imagePath));
});
test("prices use the existing actual pack amount and never invent a new checkout amount",()=>{
 assert.match(packs,/slug:\s*"6-single"[^}]*amount:\s*50/);
 assert.match(src,/singlePackPrice/);
 assert.match(src,/Minimum: 6 bagels/);
 assert.match(src,/Pedido mínimo: 6 bagels/);
 assert.doesNotMatch(src,/flavor\.price/);
});
test("purchase CTA respects accepting status and does not take payment for a closed batch",()=>{
 const catalogFlavors=loadTs("src/data/flavors.ts").flavors;
 const catalogPacks=loadTs("src/data/packs.ts").packs;
 const {translations,flavorCopy}=loadTs("src/lib/i18n.ts");
 for(const accepting of [true,false]){
  const {FlavorStrip}=loadTs("src/components/FlavorStrip.tsx",{
   "next/link":{__esModule:true,default:({children,...props})=>React.createElement("a",props,children)},
   "next/image":{__esModule:true,default:({alt,src})=>React.createElement("img",{alt,src})},
   "./BatchAvailabilityProvider":{useBatchAvailability:()=>({accepting,merchantReviewOnly:false})},
   "./LanguageProvider":{useLanguage:()=>({locale:"en",copy:translations.en})},
   "@/lib/merchant-review":loadTs("src/lib/merchant-review.ts"),
   "@/lib/i18n":{flavorCopy},
   "@/data/flavors":{flavors:catalogFlavors},
   "@/data/packs":{packs:catalogPacks},
   "@/data/flavor-images":loadTs("src/data/flavor-images.ts"),
  });
  const html=renderToStaticMarkup(React.createElement(FlavorStrip));
  const links=[...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)];
  assert.equal(links.length,catalogFlavors.length);
  for(const [,href]of links){
   const url=new URL(href.replaceAll("&amp;","&"),"https://synthetic.invalid");
   assert.equal(url.pathname,accepting?"/checkout":"/waitlist");
   assert.equal(url.searchParams.get("pack"),"6-single");
  }
  assert.ok(html.includes(accepting?"Choose pack":"Notify me"));
 }
});
test("all catalog flavor keys have descriptive copy and canonical names",()=>{
 const keys=[...flavors.matchAll(/slug:\s*"([\w-]+)"/g)].map(m=>m[1]);
 assert.equal(keys.length,10);
 for(const key of keys)assert.ok(imagesSrc.includes('"'+key+'":')||new RegExp("\\b"+key+":").test(imagesSrc),key);
 assert.match(src,/flavorDescriptions\[locale\]/);
});
