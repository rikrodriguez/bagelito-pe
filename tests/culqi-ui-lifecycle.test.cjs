const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const jsx=require('react/jsx-runtime')
const root=path.resolve(__dirname,'..'), recoveryKey='bagelito.culqi.pending.v1'
const sessionId='11111111-1111-4111-8111-111111111111'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
const response=result=>({ok:true,status:200,json:async()=>result})
const props=()=>({config:{enabled:true,configured:true,intakeEnabled:true,bridgeReady:true,webhookReady:true,clientReady:true,visualQaAllowed:false,mode:'test',publicKey:'pk_test_fixture',rsaId:'fixture',rsaPublicKey:'fixture'},
 customer:{customerName:'Fixture Customer',email:'fixture@example.test',whatsapp:'000000000',deliveryAddress:'Fixture address 123',district:'Lince',addressReference:'',deliveryNotes:'',termsAccepted:true,termsVersion:'2026-10-28'},
 order:{category:'packs',packFormat:'grande',packQty:6,packMix:'single',bagels:{plain:6},schmears:{},schmearSize:120,comboId:null,bagelMode:'pack'},subtotalPen:50})

// In-process execution of the actual TSX and its imports. Hooks model state,
// dependency changes and effect cleanup; JSX elements use React's real runtime.
// This is not browser/SDK integration or React concurrent-render certification.
function harness({recovery=false}={}) {
 const calls=[],paid=[],reviews=[],widgets=[],timers=new Map(),storage=new Map(),listeners=new Map(),slots=[]
 let cursor=0,dirty=false,mounted=true,tree,pendingEffects=[],timerId=0,opened=0
 if(recovery)storage.set(recoveryKey,JSON.stringify({checkoutSessionId:sessionId,orderCode:'BAG-ORIGINAL',state:'pending'}))
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]))
 const hooks={
  useRef(value){const i=cursor++;if(!slots[i])slots[i]={current:value};return slots[i]},
  useState(value){const i=cursor++;if(!slots[i]){const cell={value:typeof value==='function'?value():value};cell.set=v=>{cell.value=typeof v==='function'?v(cell.value):v;if(mounted)dirty=true};slots[i]=cell}return[slots[i].value,slots[i].set]},
  useCallback(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn},
  useMemo(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value},
  useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||!equal(old.deps,deps)){slots[i]={deps,cleanup:old?.cleanup,effect:true};pendingEffects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn()})}},
 }
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}
 const add=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)}
 const remove=(type,fn)=>listeners.get(type)?.delete(fn)
 const fakeWindow={localStorage,location:{origin:'https://fixture.invalid',href:'https://fixture.invalid/checkout'},addEventListener:add,removeEventListener:remove,
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),
  CulqiCheckout:class{constructor(){this.token=null;widgets.push(this)}open(){opened++}close(){}},
  Culqi3DS:{publicKey:'',settings:{},options:{},generateDevice:async()=> 'device_fixture',initAuthentication:async()=>{},reset(){}}}
 const fakeDocument={visibilityState:'visible',getElementById:()=>({dataset:{ready:'true'}}),addEventListener:add,removeEventListener:remove,
  createElement(){throw Error('Unexpected real script creation')},body:{appendChild(){throw Error('Unexpected SDK loading')}}}
 const fetch=(url,init)=>{const d=deferred();calls.push({url,init,body:JSON.parse(init.body),...d});return d.promise}
 const cache=new Map()
 function load(file){if(cache.has(file))return cache.get(file);if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'))
  const module={exports:{}};cache.set(file,module.exports)
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
  vm.runInNewContext(code,{module,exports:module.exports,window:fakeWindow,document:fakeDocument,fetch,AbortController,Date,URL,Promise,console,
   crypto:{randomUUID:()=>sessionId},require(id){if(id==='react')return hooks;if(id==='react/jsx-runtime')return jsx
    if(!id.startsWith('.'))throw Error('Unexpected external import '+id)
    const target=path.resolve(path.dirname(file),id);return load(target+(target.endsWith('.json')?'':fs.existsSync(target+'.ts')?'.ts':'.tsx'))}})
  return module.exports
 }
 const Component=load(path.join(root,'src/playable/CulqiBrowserCheckout.tsx')).CulqiBrowserCheckout
 let current={...props(),onPaid:r=>paid.push(r),onReview:r=>reviews.push(r)}
 function render(){if(!mounted)return;dirty=false;cursor=0;pendingEffects=[];tree=Component(current);for(const effect of pendingEffects)effect()}
 function elements(node,found=[]){if(!node||typeof node!=='object')return found;if(Array.isArray(node)){node.forEach(x=>elements(x,found));return found}if(node.type)found.push(node);elements(node.props?.children,found);return found}
 render()
 return{calls,paid,reviews,storage,widgets,window:fakeWindow,timers,get opened(){return opened},
  async settle(){for(let i=0;i<24;i++){await Promise.resolve();if(dirty&&mounted)render()}},
  click(kind='start',times=1){if(dirty)render();const button=elements(tree).find(x=>x.type==='button'&&x.props.className===(kind==='start'?'culqi-start-button':'culqi-recovery-button'));assert.ok(button,'actual '+kind+' button exists');const handler=button.props.onClick;for(let i=0;i<times;i++)handler()},
  dispatch(type,event){for(const fn of [...(listeners.get(type)??[])])fn(event)},
  rerender(patch){current={...current,...patch};render()},
  unmount(){mounted=false;for(const slot of slots)if(slot?.effect)slot.cleanup?.()},
 }
}
const paidStatus=()=>({ok:true,paymentStatus:'paid',orderStatus:'payment_confirmed',reconciliationRequired:false,orderCode:'BAG-ORIGINAL',amountPen:58})
const reservation=()=>({ok:true,checkoutSessionId:sessionId,orderCode:'BAG-ORIGINAL',amountMinor:5800,expiresAt:new Date(Date.now()+15*60_000).toISOString()})
async function startPending(h){h.click();await h.settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/checkout/session')}

test('unmount during reservation prevents preparation and opening abandoned Culqi widget',async()=>{
 const h=harness();await startPending(h);h.unmount();h.calls[0].resolve(response(reservation()));await h.settle()
 assert.equal(h.calls.length,1,'stale reservation must not prepare another payment request');assert.equal(h.opened,0);assert.equal(h.paid.length,0)
})
for(const field of ['order','customer'])test(`changed ${field} invalidates pending reservation instead of continuing with old details`,async()=>{
 const h=harness();await startPending(h)
 h.rerender(field==='order'?{order:{...props().order,bagels:{sesame:6}}}:{customer:{...props().customer,email:'other@example.test'}})
 h.calls[0].resolve(response(reservation()));await h.settle()
 assert.equal(h.calls.length,1,'changed checkout identity must invalidate pending continuation');assert.equal(h.opened,0);assert.equal(h.paid.length,0);h.unmount()
})
test('late recovered paid response after unmount never calls parent confirmation',async()=>{
 const h=harness({recovery:true});h.click();await h.settle();assert.equal(h.calls[0].url,'/api/payments/culqi/status');h.unmount()
 h.calls[0].resolve(response(paidStatus()));await h.settle();assert.equal(h.paid.length,0)
})
test('double-click payment recovery coalesces one pending status request',async()=>{
 const h=harness({recovery:true});h.click();await h.settle()
 h.calls[0].resolve(response({...paidStatus(),paymentStatus:'pending',orderStatus:'payment_pending_review'}));await h.settle()
 h.click('recovery',2);await h.settle()
 assert.equal(h.calls.length,2,'recovery needs a synchronous in-flight guard after its initial pending lookup');h.unmount()
})
for(const [name,result] of [
 ['different order code',{...paidStatus(),orderCode:'BAG-OTHER'}],
 ['invalid amount',{...paidStatus(),amountPen:-1}],
 ['contradictory transport status',{...paidStatus(),ok:false}],
 ['contradictory order state',{...paidStatus(),orderStatus:'cancelled'}],
 ['reconciliation flagged',{...paidStatus(),reconciliationRequired:true}],
 ['malformed supplied snapshot',{...paidStatus(),productSnapshot:{orderCode:'BAG-ORIGINAL',paymentStatus:'paid'}}],
])test(`recovery refuses confirmation for ${name}`,async()=>{
 const h=harness({recovery:true});h.click();await h.settle();h.calls[0].resolve(response(result));await h.settle()
 assert.equal(h.paid.length,0,'incomplete or mismatched evidence cannot become a receipt');h.unmount()
})

test('valid recovered payment without product snapshot explicitly omits editable cart details',async()=>{
 const h=harness({recovery:true});h.click();await h.settle();h.calls[0].resolve(response(paidStatus()));await h.settle()
 assert.equal(h.paid.length,1);assert.equal(h.paid[0].orderCode,'BAG-ORIGINAL');assert.equal(h.paid[0].amountPen,58)
 assert.equal(h.paid[0].receipt.detailsAvailable,false);assert.deepEqual(JSON.parse(JSON.stringify(h.paid[0].receipt.items)),[])
 assert.doesNotMatch(JSON.stringify(h.paid[0].receipt),/plain|sesame|Fixture Customer/);h.unmount()
})
test('unmount during payment preparation prevents late widget opening',async()=>{
 const h=harness(),reserved=reservation();await startPending(h);h.calls[0].resolve(response(reserved));await h.settle()
 assert.equal(h.calls.length,2);assert.equal(h.calls[1].url,'/api/payments/culqi/order');h.unmount()
 h.calls[1].resolve(response({ok:true,sessionId:sessionId,amount:5800,expiresAt:reserved.expiresAt}));await h.settle()
 assert.equal(h.opened,0);assert.equal(h.paid.length,0)
})
test('equal-content rerender does not invalidate an otherwise current reservation',async()=>{
 const h=harness(),reserved=reservation();await startPending(h);h.rerender({order:JSON.parse(JSON.stringify(props().order)),customer:{...props().customer}})
 h.calls[0].resolve(response(reserved));await h.settle();assert.equal(h.calls.length,2)
 h.calls[1].resolve(response({ok:true,sessionId:sessionId,amount:5800,expiresAt:reserved.expiresAt}));await h.settle()
 assert.equal(h.opened,1,'valid identity must still reach mocked widget');assert.equal(h.paid.length,0);h.unmount()
})
test('valid recovered snapshot supplies historical items instead of the new editable cart',async()=>{
 const h=harness({recovery:true});h.click();await h.settle()
 const productSnapshot={orderId:'22222222-2222-4222-8222-222222222222',orderCode:'BAG-ORIGINAL',schemaVersion:1,currency:'PEN',
  lines:[{kind:'pack',id:'grande-6-single',quantity:1,bagels:[{flavorId:'sesame',quantity:6}],schmears:[],publishedAmountPen:50}],
  subtotalMinor:5000,deliveryFeeMinor:800,amountMinor:5800,termsVersion:'2026-10-28',createdAt:'2026-11-02T10:00:00Z',paymentStatus:'paid'}
 h.calls[0].resolve(response({...paidStatus(),productSnapshot}));await h.settle()
 assert.equal(h.paid.length,1);assert.equal(h.paid[0].receipt.detailsAvailable,true);assert.ok(h.paid[0].receipt.items.length>0)
 assert.match(JSON.stringify(h.paid[0].receipt.items),/sesame/i);assert.doesNotMatch(JSON.stringify(h.paid[0].receipt.items),/plain/i);h.unmount()
})

test('changed order rejects old pending reservation but permits a fresh checkout attempt',async()=>{
 const h=harness();await startPending(h)
 h.rerender({order:{...props().order,bagels:{sesame:6}}});await h.settle();h.click();await h.settle()
 assert.equal(h.calls.length,2);assert.equal(h.calls[1].url,'/api/checkout/session');assert.equal(h.calls[1].body.bagels.sesame,6)
 h.calls[0].resolve(response(reservation()));await h.settle();assert.equal(h.calls.length,2,'old reservation cannot advance the new attempt')
 h.calls[1].resolve(response({...reservation(),orderCode:'BAG-NEW'}));await h.settle()
 assert.equal(h.calls.length,3);assert.equal(h.calls[2].url,'/api/payments/culqi/order');assert.equal(h.calls[2].body.orderCode,'BAG-NEW');h.unmount()
})
test('context change during recovery retains payment reference and never creates another reservation',async()=>{
 const h=harness({recovery:true}),saved=h.storage.get(recoveryKey);h.click();await h.settle()
 h.rerender({order:{...props().order,bagels:{sesame:6}}});await h.settle()
 assert.equal(h.storage.get(recoveryKey),saved)
 h.calls[0].resolve(response(paidStatus()));await h.settle();assert.equal(h.paid.length,0,'old recovery cannot confirm the changed UI');assert.equal(h.storage.get(recoveryKey),saved)
 h.click();await h.settle();assert.equal(h.calls.length,2);assert.equal(h.calls[1].url,'/api/payments/culqi/status');assert.equal(h.storage.get(recoveryKey),saved);h.unmount()
})

for(const [name,patch] of [
 ['different session identity',{checkoutSessionId:'22222222-2222-4222-8222-222222222222'}],
 ['missing session identity',{checkoutSessionId:undefined}],
 ['invalid order code',{orderCode:'<invalid>'}],
 ['negative amount',{amountMinor:-5800}],
 ['fractional minor amount',{amountMinor:5800.5}],
 ['missing expiry',{expiresAt:undefined}],
 ['expired reservation',{expiresAt:'2020-01-01T00:00:00Z'}],
])test(`invalid reservation ${name} never proceeds to payment preparation`,async()=>{
 const h=harness();await startPending(h);h.calls[0].resolve(response({...reservation(),...patch}));await h.settle()
 assert.equal(h.calls.length,1);assert.equal(h.opened,0);assert.equal(h.paid.length,0);h.unmount()
})
for(const [name,patch] of [
 ['malformed payment attempt UUID',()=>({sessionId:'fixture-session'})],
 ['mismatched amount',()=>({amount:5900})],
 ['extended expiry',r=>({expiresAt:new Date(Date.parse(r.expiresAt)+60_000).toISOString()})],
 ['shortened expiry',r=>({expiresAt:new Date(Date.parse(r.expiresAt)-60_000).toISOString()})],
 ['missing expiry',()=>({expiresAt:undefined})],
])test(`invalid payment preparation ${name} never opens widget`,async()=>{
 const h=harness(),reserved=reservation();await startPending(h);h.calls[0].resolve(response(reserved));await h.settle()
 assert.equal(h.calls.length,2);h.calls[1].resolve(response({ok:true,sessionId,amount:5800,expiresAt:reserved.expiresAt,...patch(reserved)}));await h.settle()
 assert.equal(h.calls.length,2);assert.equal(h.opened,0);assert.equal(h.paid.length,0);h.unmount()
})
async function openWidget(h){
 const reserved=reservation();await startPending(h);h.calls[0].resolve(response(reserved));await h.settle()
 h.calls[1].resolve(response({ok:true,sessionId,amount:5800,expiresAt:reserved.expiresAt}));await h.settle();assert.equal(h.opened,1)
 return h.widgets[0]
}
test('late widget token callback after unmount cannot submit a charge',async()=>{
 const h=harness(),widget=await openWidget(h);widget.token={id:'tkn_fixture'};h.unmount();widget.culqi();await h.settle()
 assert.equal(h.calls.length,2);assert.equal(h.paid.length,0)
})
test('unmount while token device generation waits prevents charge submission',async()=>{
 const h=harness(),widget=await openWidget(h),device=deferred();h.window.Culqi3DS.generateDevice=()=>device.promise
 widget.token={id:'tkn_fixture'};widget.culqi();await h.settle();h.unmount();device.resolve('device_fixture');await h.settle()
 assert.equal(h.calls.length,2);assert.equal(h.paid.length,0)
})
test('late charge response after unmount cannot initiate payment status polling',async()=>{
 const h=harness(),widget=await openWidget(h);widget.token={id:'tkn_fixture'};widget.culqi();await h.settle()
 assert.equal(h.calls.length,3);assert.equal(h.calls[2].url,'/api/payments/culqi/charge');h.unmount()
 h.calls[2].resolve(response({ok:true,paymentStatus:'paid'}));await h.settle();assert.equal(h.calls.length,3);assert.equal(h.paid.length,0)
})
test('late paid poll after unmount cannot confirm checkout',async()=>{
 const h=harness(),widget=await openWidget(h);widget.token={id:'tkn_fixture'};widget.culqi();await h.settle()
 h.calls[2].resolve(response({ok:true,paymentStatus:'paid'}));await h.settle();assert.equal(h.calls.length,4)
 assert.equal(h.calls[3].url,'/api/payments/culqi/status');h.unmount();h.calls[3].resolve(response(paidStatus()));await h.settle()
 assert.equal(h.paid.length,0)
})
test('live token and matching paid status still confirm the reserved amount',async()=>{
 const h=harness(),widget=await openWidget(h);widget.token={id:'tkn_fixture'};widget.culqi();await h.settle()
 assert.equal(h.calls[2].url,'/api/payments/culqi/charge');h.calls[2].resolve(response({ok:true,paymentStatus:'paid'}));await h.settle()
 h.calls[3].resolve(response(paidStatus()));await h.settle();assert.equal(h.paid.length,1);assert.equal(h.paid[0].receipt.amountMinor,5800);h.unmount()
})
test('duplicate live widget callbacks submit only one token charge',async()=>{
 const h=harness(),widget=await openWidget(h);widget.token={id:'tkn_fixture'};widget.culqi();widget.culqi();await h.settle()
 assert.equal(h.calls.length,3);assert.equal(h.calls[2].url,'/api/payments/culqi/charge');h.unmount()
})
test('paid poll with another amount cannot confirm a known reservation',async()=>{
 const h=harness(),widget=await openWidget(h);widget.token={id:'tkn_fixture'};widget.culqi();await h.settle()
 h.calls[2].resolve(response({ok:true,paymentStatus:'paid'}));await h.settle()
 h.calls[3].resolve(response({...paidStatus(),amountPen:59}));await h.settle();assert.equal(h.paid.length,0);h.unmount()
})
test('poll delay waking after unmount cannot send a further status request',async()=>{
 const h=harness(),widget=await openWidget(h);widget.token={id:'tkn_fixture'};widget.culqi();await h.settle()
 h.calls[2].resolve(response({ok:true,paymentStatus:'paid'}));await h.settle()
 h.calls[3].resolve(response({...paidStatus(),paymentStatus:'pending',orderStatus:'payment_pending_review'}));await h.settle()
 const delay=[...h.timers.values()].find(t=>t.ms===3000);assert.ok(delay,'actual poll delay was scheduled')
 h.unmount();delay.fn();await h.settle();assert.equal(h.calls.length,4);assert.equal(h.paid.length,0)
})

const auth3DS=()=>({cavv:'fixture-cavv',eci:'05',protocolVersion:'2.2.0',xid:'fixture-xid'})
const authenticationMessage=(h,patch={})=>({origin:h.window.location.origin,data:{parameters3DS:auth3DS()},...patch})
async function start3DS(h){
 const widget=await openWidget(h);widget.token={id:'tkn_fixture'};widget.culqi();await h.settle()
 assert.equal(h.calls.length,3);h.calls[2].resolve(response({ok:true,requires3DS:true}));await h.settle()
}
test('3DS message before challenge cannot submit a payment continuation',async()=>{
 const h=harness(),widget=await openWidget(h);widget.token={id:'tkn_fixture'};widget.culqi();await h.settle()
 h.dispatch('message',authenticationMessage(h));await h.settle()
 assert.equal(h.calls.length,3,'only initial charge exists until server requests 3DS');h.unmount()
})
test('duplicate 3DS messages consume one challenge and submit one continuation',async()=>{
 const h=harness();await start3DS(h)
 h.dispatch('message',authenticationMessage(h));h.dispatch('message',authenticationMessage(h));await h.settle()
 assert.equal(h.calls.length,4,'one initial charge plus one authenticated continuation')
 assert.equal(h.calls[3].url,'/api/payments/culqi/charge');assert.ok(h.calls[3].body.authentication3DS);h.unmount()
})
test('closed 3DS challenge ignores a late authentication message',async()=>{
 const h=harness();await start3DS(h);h.window.Culqi3DS.options.closeModalAction()
 h.dispatch('message',authenticationMessage(h));await h.settle()
 assert.equal(h.calls.length,3,'dismissal must not resume payment from a stale event');assert.equal(h.reviews.length,1);h.unmount()
})
test('3DS failure consumes challenge before a later success message',async()=>{
 const h=harness();await start3DS(h);h.dispatch('message',authenticationMessage(h,{data:{error:'fixture'}}))
 h.dispatch('message',authenticationMessage(h));await h.settle()
 assert.equal(h.calls.length,3);assert.equal(h.reviews.length,1);h.unmount()
})
test('foreign and unrelated messages do not consume a valid 3DS challenge',async()=>{
 const h=harness();await start3DS(h)
 h.dispatch('message',authenticationMessage(h,{origin:'https://foreign.invalid'}))
 h.dispatch('message',authenticationMessage(h,{data:{unrelated:true}}));await h.settle();assert.equal(h.calls.length,3)
 h.dispatch('message',authenticationMessage(h));await h.settle();assert.equal(h.calls.length,4);h.unmount()
})
test('late 3DS message after context change cannot resume the abandoned payment',async()=>{
 const h=harness();await start3DS(h);h.rerender({customer:{...props().customer,email:'other@example.test'}})
 h.dispatch('message',authenticationMessage(h));await h.settle();assert.equal(h.calls.length,3);h.unmount()
})

test('programmatic 3DS reset after consumed success does not downgrade payment confirmation',async()=>{
 const h=harness();await start3DS(h)
 h.window.Culqi3DS.reset=()=>h.window.Culqi3DS.options.closeModalAction()
 h.dispatch('message',authenticationMessage(h));await h.settle();assert.equal(h.calls.length,4)
 h.calls[3].resolve(response({ok:true,paymentStatus:'paid'}));await h.settle();assert.equal(h.calls.length,5)
 h.calls[4].resolve(response(paidStatus()));await h.settle()
 assert.equal(h.paid.length,1);assert.equal(h.reviews.length,0,'completed challenge reset is not a customer cancellation')
 assert.equal(h.storage.has(recoveryKey),false);h.unmount()
})
test('expiry disarms 3DS before SDK reset can synchronously deliver a message',async()=>{
 const h=harness();await start3DS(h)
 const expiry=[...h.timers.values()].find(t=>t.ms>30_000);assert.ok(expiry)
 const oldNow=Date.now;Date.now=()=>oldNow()+60*60_000
 h.window.Culqi3DS.reset=()=>h.dispatch('message',authenticationMessage(h))
 try {expiry.fn();await h.settle()} finally {Date.now=oldNow}
 assert.equal(h.calls.length,3);assert.equal(h.reviews.length,1,'expiry must enter review only once without reentrant processing');h.unmount()
})

test('late 3DS-required response after reservation expiry never opens a challenge',async()=>{
 const h=harness(),widget=await openWidget(h);let authentications=0
 h.window.Culqi3DS.initAuthentication=async()=>{authentications++}
 widget.token={id:'tkn_fixture'};widget.culqi();await h.settle();assert.equal(h.calls.length,3)
 const oldNow=Date.now;Date.now=()=>oldNow()+60*60_000
 try {
  h.dispatch('focus',{});h.calls[2].resolve(response({ok:true,requires3DS:true}));await h.settle()
  assert.equal(authentications,0,'expired reservation must not re-arm authentication from a late response')
  h.dispatch('message',authenticationMessage(h));await h.settle();assert.equal(h.calls.length,3)
 } finally {Date.now=oldNow;h.unmount()}
})
test('late non-3DS charge response after expiry still observes the submitted payment',async()=>{
 const h=harness(),widget=await openWidget(h)
 widget.token={id:'tkn_fixture'};widget.culqi();await h.settle();assert.equal(h.calls.length,3)
 const oldNow=Date.now;Date.now=()=>oldNow()+60*60_000
 try {
  h.dispatch('focus',{});h.calls[2].resolve(response({ok:true,paymentStatus:'paid'}));await h.settle()
  assert.equal(h.calls.length,4);assert.equal(h.calls[3].url,'/api/payments/culqi/status')
  h.calls[3].resolve(response(paidStatus()));await h.settle();assert.equal(h.paid.length,1)
 } finally {Date.now=oldNow;h.unmount()}
})
