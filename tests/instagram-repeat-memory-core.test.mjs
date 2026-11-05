import test from "node:test";
import assert from "node:assert/strict";
import {readFile,writeFile,mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import ts from "typescript";

const source=await readFile(new URL("../supabase/functions/_shared/instagram-sales-core.ts",import.meta.url),"utf8");
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const dir=await mkdtemp(join(tmpdir(),"bagelito-memory-core-"));
await writeFile(join(dir,"package.json"),'{"type":"module"}',"utf8");
await writeFile(join(dir,"core.js"),output,"utf8");
const {applyTrustedCustomerMemory}=await import(pathToFileURL(join(dir,"core.js")).href);

const memory={
  is_returning_customer:true,
  latest_order:{
    pack_slug:"regular-6-mixed",pack_name:"6 Mixed",units:6,
    customer_name:"Customer",phone:"999111222",district:"Lince",
    delivery_address:"Known Address",address_reference:"Portería"
  },
  latest_items:[
    {item_kind:"bagel",item_key:"plain",item_name:"Plain",quantity:4},
    {item_kind:"bagel",item_key:"blueberry",item_name:"Blueberry",quantity:2}
  ]
};

test("same as last time reuses confirmed product selection, not address implicitly",()=>{
  const patch=applyTrustedCustomerMemory({}, "Quiero lo mismo que la vez pasada", memory);
  assert.equal(patch.units,6);
  assert.deepEqual(patch.items,[
    {key:"plain",name:"Plain",quantity:4},
    {key:"blueberry",name:"Blueberry",quantity:2}
  ]);
  assert.equal(patch.address,undefined);
  assert.equal(patch.phone,undefined);
});

test("another order alone does not silently clone the previous order",()=>{
  const patch=applyTrustedCustomerMemory({}, "Quiero hacer otro pedido", memory);
  assert.equal(patch.units,undefined);
  assert.equal(patch.items,undefined);
});

test("same address reuses only trusted operational details",()=>{
  const patch=applyTrustedCustomerMemory({items:[{key:"cheddar",name:"Cheddar",quantity:6}]},"Misma dirección que la vez pasada",memory);
  assert.equal(patch.address,"Known Address");
  assert.equal(patch.district,"Lince");
  assert.equal(patch.phone,"999111222");
  assert.deepEqual(patch.items,[{key:"cheddar",name:"Cheddar",quantity:6}]);
});
