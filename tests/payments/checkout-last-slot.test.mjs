import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { sourceModule } from '../helpers/load-ts.mjs';

// Actual ReservationFlow and CulqiCheckoutButton, synthetic browser/SDK/HTTP.
// These regressions catch public sold-out polling disposing the owner's last
// slot, and the checkout route bypassing the no-hold closed-batch gate.
function hooks() {
  const slots = []; const states = []; const effects = []; let cursor = 0;
  const same = (a,b) => a && b && a.length===b.length && a.every((x,i)=>Object.is(x,b[i]));
  return {
    states,
    api: {
      useState(initial) {
        const i=cursor++;
        if (!slots[i]) { slots[i]={value:typeof initial==='function'?initial():initial}; states.push(slots[i]); }
        const slot=slots[i]; slot.set ??= value=>{slot.value=typeof value==='function'?value(slot.value):value;};
        return [slot.value,slot.set];
      },
      useRef(initial) { const i=cursor++; return slots[i]??=( {current:initial} ); },
      useMemo(factory) { cursor++; return factory(); },
      useCallback(callback,deps) { const i=cursor++; if (!same(slots[i]?.deps,deps)) slots[i]={deps,callback}; return slots[i].callback; },
      useEffect(effect,deps) {
        const i=cursor++; const prior=slots[i];
        if (!same(prior?.deps,deps)) effects.push(()=>{prior?.cleanup?.();slots[i]={deps,cleanup:effect()};});
      },
    },
    render(component,props) { cursor=0;const tree=component(props);while(effects.length)effects.shift()();return tree; },
    cleanup() { slots.forEach(slot=>slot?.cleanup?.()); },
  };
}
function nodes(tree) {
  if (tree==null || typeof tree==='boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree!=='object') return [tree];
  return [tree,...nodes(tree.props?.children)];
}
const text = tree=>nodes(tree).filter(x=>typeof x==='string'||typeof x==='number').join(' ');
const flush = async()=>{for(let n=0;n<4;n++)await new Promise(resolve=>setImmediate(resolve));};
const gate = ()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function Placeholder(){return null;}
const config={enabled:true,mode:'sandbox',provider:'culqi',currency:'PEN',publicKey:'pk_test_fixture',rsaId:'fixture',rsaPublicKey:'fixture'};

function harness({checkoutPage,stall,expiryOffset=60_000}={}) {
  const previous={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
  const previousNow=Date.now; let now=Date.now(); Date.now=()=>now;
  const entries=new Map(); const listeners=new Map(); let uuids=0;
  const calls=[]; const instances=[]; const stalled=gate();
  const expiresAt=new Date(now+expiryOffset).toISOString();
  let batch={accepting:true,batchName:'Synthetic',status:'orders_open',reservedPacks:0,reservedBagels:0,
    remainingPacks:1,remainingBagels:6,capacityPacks:1,capacityBagels:6,deliveryDate:null,ordersOpenAt:null,ordersCloseAt:null};
  globalThis.window={
    localStorage:{getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)},
    crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++uuids).padStart(12,'0')}`},
    location:{href:'https://fixture.invalid/checkout',origin:'https://fixture.invalid'},
    scrollTo(){},requestAnimationFrame(callback){callback();return 1;},cancelAnimationFrame(){},
    setTimeout(callback){callback();return 1;},clearTimeout(){},
    addEventListener(name,listener){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(listener);},
    removeEventListener(name,listener){listeners.get(name)?.delete(listener);},
    CulqiCheckout:class {constructor(){this.opens=0;this.closes=0;instances.push(this);}open(){this.opens++;}close(){this.closes++;}},
    Culqi3DS:{publicKey:'',options:{},settings:{},reset(){},generateDevice:async()=> 'device_synthetic'},
  };
  globalThis.document={documentElement:{},body:{classList:{toggle(){},remove(){}}},visibilityState:'visible',
    addEventListener:window.addEventListener,removeEventListener:window.removeEventListener};
  globalThis.fetch=async(url,init)=>{
    assert.ok(['/api/reservations/culqi','/api/payments/culqi/order','/api/payments/culqi/charge','/api/payments/culqi/status'].includes(url),'No external transport permitted');
    const payload=JSON.parse(init.body);calls.push({url,payload});
    if(url.endsWith('/charge'))throw new Error('A stale source must never reach charge transport');
    if((stall==='reservation'&&url==='/api/reservations/culqi')||(stall==='order'&&url.endsWith('/order')))await stalled.promise;
    const result=url==='/api/reservations/culqi'?{ok:true,orderCode:'BAG-SYNTHETIC-LAST-SLOT',amount:66,expiresAt}
      :{ok:true,sessionId:'synthetic-payment-attempt',amount:6600,expiresAt};
    return {ok:true,json:async()=>result};
  };
  const parentHooks=hooks();let childHooks=hooks();
  const {CulqiCheckoutButton}=sourceModule('src/components/payments/CulqiCheckoutButton.tsx',{
    react:{...React,...childHooks.api},'next/script':{__esModule:true,default:Placeholder},
  });
  const {translations,packCopy,flavorCopy}=sourceModule('src/lib/i18n.ts');
  const {ReservationFlow}=sourceModule('src/app/reserve/ReservationFlow.tsx',{
    react:{...React,...parentHooks.api},'next/image':{__esModule:true,default:Placeholder},'next/link':{__esModule:true,default:Placeholder},
    'lucide-react':new Proxy({},{get:()=>Placeholder}),
    '@/components/payments/CulqiCheckoutButton':{CulqiCheckoutButton},
    '@/components/LanguageProvider':{useLanguage:()=>({locale:'es',copy:translations.es})},
    '@/components/BatchAvailabilityProvider':{useBatchAvailability:()=>batch},
    '@/components/RollingBagel':{RollingBagel:Placeholder},'@/components/ConversionTrustStrip':{ConversionTrustStrip:Placeholder},
    '@/lib/waitlist/use-campaign-href':{useWaitlistCampaignHref:()=>()=>'/waitlist'},
    '@/lib/analytics':{trackBagelitoEvent(){}},'@/lib/delivery-pricing':{getDeliveryFee:()=>8},
    '@/lib/checkout-upsell':{checkoutExtraPackDiscountPercent:20,getCheckoutExtraPackOffer:amount=>({originalAmount:amount,discountedAmount:amount*.8,savingsAmount:amount*.2})},
    '@/lib/i18n':{packCopy,flavorCopy},'@/lib/reservations/schema':{districtOptions:['Miraflores']},
    '@/lib/site':{siteServiceArea:'Synthetic'},'@/lib/whatsapp':{getWhatsAppHref:()=> 'https://fixture.invalid/help'},
  });
  const props={packs:[{slug:'6-single',units:6,packType:'single',amount:58,name:'Synthetic'}],
    flavors:[{slug:'plain',name:'Plain'}],initialPackSlug:'6-single',paymentConfig:config,checkoutPage};
  let tree;let child;let childTree;let childKey;
  function render() {
    tree=parentHooks.render(ReservationFlow,props);
    const next=nodes(tree).find(node=>node?.type===CulqiCheckoutButton);
    if(child&&(!next||next.key!==childKey)){childHooks.cleanup();child=undefined;childTree=undefined;}
    if(next){child=next.props;childKey=next.key;childTree=childHooks.render(CulqiCheckoutButton,child);}
    return tree;
  }
  render();render();
  return {
    calls,instances,render,
    get tree(){return tree;},get child(){return child;},get childTree(){return childTree;},
    review(){
      parentHooks.states[0].set(4);
      render();
      const checkbox = nodes(tree).find(node=>node?.type==='input' && node?.props?.id==='checkout-terms-consent');
      if (checkbox) {
        assert.equal(checkbox.props.checked,false,'Legal consent must be unchecked initially');
        checkbox.props.onChange({target:{checked:true}});
        render();
      }
    },
    readyScripts(){for(const id of ['culqi-custom-checkout','culqi-3ds-script'])nodes(childTree).find(node=>node?.props?.id===id).props.onReady();render();},
    closeBatch(){batch={...batch,accepting:false,reservedPacks:1,reservedBagels:6,remainingPacks:0,remainingBagels:0};render();},
    release(){stalled.resolve();},
    advance(ms){now+=ms;},
    click(label){const button=nodes(tree).find(node=>node?.type==='button'&&text(node).includes(label));assert.ok(button,`Missing action: ${label}`);button.props.onClick();render();},
    cleanup(){stalled.resolve();childHooks.cleanup();parentHooks.cleanup();Date.now=previousNow;for(const[key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}},
  };
}

for(const checkoutPage of [false,true]) {
  const route=checkoutPage?'/checkout':'/reserve';
  for(const stall of ['reservation','order']) {
    test(`${route} keeps its last-slot preparation mounted while ${stall} response is pending`,async()=>{
      const flow=harness({checkoutPage,stall});
      try {
        flow.review();flow.readyScripts();await flush();
        flow.closeBatch();
        assert.ok(flow.child,'The owner must not be replaced by the closed-batch screen during preparation');
        assert.match(text(flow.childTree),/Preparando tu pedido/);
        flow.release();await flush();flow.render();
        assert.equal(flow.instances.length,1);assert.equal(flow.instances[0].opens,1);
        flow.closeBatch();assert.equal(flow.instances[0].closes,0);
        assert.equal(flow.calls.filter(call=>call.url==='/api/reservations/culqi').length,1);
        assert.equal(flow.calls.filter(call=>call.url.endsWith('/order')).length,1);
        assert.equal(flow.calls.filter(call=>call.url.endsWith('/charge')).length,0);
      } finally {flow.cleanup();}
    });
  }
  test(`${route} preserves the prepared SDK at sold-out, then closes at the original hold expiry`,async()=>{
    const flow=harness({checkoutPage});
    try {
      flow.review();flow.readyScripts();await flush();flow.render();
      const instance=flow.instances[0];assert.ok(instance);
      flow.closeBatch();assert.ok(flow.child);assert.equal(instance.closes,0);
      flow.advance(60_001);flow.render();
      assert.equal(flow.child,undefined,'An expired hold cannot authorize the sold-out checkout');
      assert.ok(instance.closes>=1);assert.equal(flow.instances.length,1);
      assert.match(text(flow.tree),/Este batch está cerrado/);
    } finally {flow.cleanup();}
  });
  test(`${route} with no held or preparing checkout shows closed state without SDK or reservation transport`,()=>{
    const flow=harness({checkoutPage});
    try {
      flow.closeBatch();flow.review();
      assert.equal(flow.child,undefined);assert.equal(flow.instances.length,0);
      assert.equal(flow.calls.length,0);assert.match(text(flow.tree),/Este batch está cerrado/);
    } finally {flow.cleanup();}
  });
  test(`${route} changing the pack fingerprint invalidates the sold-out authorization and old token callback`,async()=>{
    const flow=harness({checkoutPage});
    try {
      flow.review();flow.readyScripts();await flush();flow.render();
      const stale=flow.child;const session=await stale.prepareCheckout();
      flow.closeBatch();flow.click('Agregar pack por');
      assert.equal(flow.child,undefined,'A different cart cannot reuse the original last-slot authorization');
      await assert.rejects(()=>stale.onToken(session,'ype_test_stale_source',{}),{name:'CheckoutReviewError'});
      assert.equal(flow.calls.filter(call=>call.url.endsWith('/charge')).length,0);
      assert.equal(flow.instances.length,1);
    } finally {flow.cleanup();}
  });
}
