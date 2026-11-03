const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript')
const source = fs.readFileSync('src/playable/GuidedCommerce.tsx', 'utf8')
const transpile = s => ts.transpileModule(s, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
function load(file) {
 if(file.endsWith('.json')) return JSON.parse(fs.readFileSync(file,'utf8'))
 const m={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(file,'utf8')),{module:m,exports:m.exports,require:id=>load(path.resolve(path.dirname(file),id)+(id.endsWith('.json')?'':'.ts'))});return m.exports
}
const {planGuidedOrder}=load(path.resolve('src/domain/lib/guided-order-quote.ts'))
const restoreStart=source.indexOf('  useEffect(() => {\n    if (reviewOnly) { setDraftLoaded')
const restoreEnd=source.indexOf('  }, [initialCategory, reviewOnly])',restoreStart)+'  }, [initialCategory, reviewOnly])'.length
const saveStart=source.indexOf('  useEffect(() => {\n    if (reviewOnly || !draftLoaded)')
const saveEnd=source.indexOf('\n\n',source.indexOf('  }, [draftLoaded',saveStart))
const helper=source.match(/function readSafeSelections\([\s\S]*?\n\}/)[0]
const menu=JSON.parse(fs.readFileSync('src/domain/data/verified-menu-2026-10-21.json','utf8'))
const combos=menu.combos,legacyCombo={id:'two-bagel-schmear',bagels:2,schmear_count:1}
const base={updatedAt:Date.now(),category:'packs',scene:'cashier',format:'grande',packQty:6,packMix:'single',schmearSize:120,bagels:{plain:6},schmears:{},bagelMode:'pack'}
function restore(draft, reviewOnly=false) {
 const output={}, effects=[]
 const ctx={Error,SyntaxError,JSON,planGuidedOrder,menu,combos,legacyCombo,useEffect:f=>f(),reviewOnly,initialCategory:null,GUIDED_DRAFT_KEY:'MOCK',GUIDED_DRAFT_TTL_MS:86400000,window:{sessionStorage:{getItem:()=>{effects.push('read');return typeof draft==='string'?draft:JSON.stringify(draft)},removeItem:()=>effects.push('remove')}}}
 for(const x of ['DraftLoaded','DraftRecoveryMessage','Category','PackFormat','PackQty','PackMix','ComboId','SchmearSize','BagelMode','BagelCounts','SchmearCounts','Scene'])ctx['set'+x]=v=>output[x]=v
 vm.runInNewContext(transpile(helper+'\n'+source.slice(restoreStart,restoreEnd)),ctx)
 return {output,effects}
}
for(const [mode,n] of [['upsell8',8],['downsell2',2]])test(`actual save/restore preserves ${mode} without payment data`,()=>{
 let saved
 const ctx={useEffect:f=>f(),reviewOnly:false,draftLoaded:true,category:'schmears',scene:'cashier',packFormat:'grande',packQty:6,packMix:'mixed',comboId:null,schmearSize:120,bagelMode:mode,bagelCounts:{plain:n},schmearCounts:{'whipped-original':1},paidOrderCode:null,GUIDED_DRAFT_KEY:'MOCK',window:{sessionStorage:{setItem:(_k,v)=>saved=JSON.parse(v),removeItem:()=>{}}}}
 vm.runInNewContext(transpile(source.slice(saveStart,saveEnd)),ctx)
 assert.equal(saved.bagelMode,mode)
 assert.deepEqual(Object.keys(saved).sort(),['updatedAt','category','scene','format','packQty','packMix','comboId','schmearSize','bagelMode','bagels','schmears'].sort())
 const {output}=restore(saved);assert.equal(output.BagelMode,mode);assert.equal(output.BagelCounts.plain,n);assert.equal(output.Scene,'cashier')
})
test('legacy pack, combo and standalone without mode restore coherently',()=>{
 for(const d of [{...base,bagelMode:undefined},{...base,category:'combos',bagelMode:undefined,bagels:{plain:2},schmears:{'whipped-original':1}},{...base,category:'schmears',bagelMode:undefined,bagels:{},schmears:{'whipped-original':1}}]) {
  const {output}=restore(d);assert.equal(output.Scene,'cashier');assert.equal(output.BagelMode,d.category==='combos'?'combo':'pack')
 }
})
test('legacy extras, malformed mode, quantities and unknown products are not silently dropped',()=>{
 for(const d of [{...base,category:'schmears',bagelMode:undefined,bagels:{plain:2},schmears:{'whipped-original':1}},{...base,bagelMode:'invalid'},{...base,bagelMode:null},{...base,category:'schmears',bagels:{},bagelMode:['pack']},{...base,category:['packs']},{...base,format:['grande']},{...base,packMix:['single']},{...base,category:'unknown'},{...base,bagels:{plain:6,unknown:1}},{...base,schmears:[]},{...base,schmearSize:999},'{bad']) {
  const {output,effects}=restore(d);assert.ok(output.DraftRecoveryMessage);assert.equal(output.Scene,undefined);assert.ok(effects.includes('remove'))
 }
})
test('incomplete pack/combo/extra never restores cashier and keeps selected products',()=>{
 for(const d of [{...base,bagels:{plain:3}},{...base,category:'combos',bagelMode:'combo',bagels:{plain:2}},{...base,category:'schmears',bagelMode:'upsell8',bagels:{plain:3},schmears:{'whipped-original':1}}]) {
  const {output}=restore(d);assert.notEqual(output.Scene,'cashier');assert.equal(output.BagelCounts.plain,d.bagels.plain)
 }
})
test('reviewOnly never reads, removes or writes draft storage',()=>{
 const {effects}=restore(base,true);assert.deepEqual(effects,[])
 vm.runInNewContext(transpile(source.slice(saveStart,saveEnd)),{useEffect:f=>f(),reviewOnly:true,draftLoaded:true,category:null,scene:'selector',packFormat:'grande',packQty:6,packMix:'mixed',comboId:null,schmearSize:120,bagelMode:'pack',bagelCounts:{},schmearCounts:{},paidOrderCode:null,window:{get sessionStorage(){throw Error('storage accessed')}}})
})

test('recovery notice cannot render in reviewOnly mode',()=>{assert.match(source,/\{!reviewOnly && draftRecoveryMessage && <p role="status"/)});
