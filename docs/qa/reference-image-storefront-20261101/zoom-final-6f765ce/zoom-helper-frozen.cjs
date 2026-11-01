/** Existing-page mobile steps only. Never opens a browser or sends a request.
 * Caller owns its guarded context and act(locator) native tap helper.
 * Optional shot(name, selector) matches the existing E2E screenshot callback.
 * Expanded mode intentionally does NOT require all three categories together.
 */
const assert = require('node:assert/strict')

function inspectZoom() {
  const scroll=document.querySelector('.reference-scroll'),art=scroll?.querySelector('.reference-art'),image=art?.querySelector('.reference-image')
  if(!scroll||!art||!image)throw Error('The exact-reference image presentation must exist')
  const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}
  const box=rect(scroll),clip={x:Math.max(0,box.x),y:Math.max(0,box.y),right:Math.min(innerWidth,box.right),bottom:Math.min(innerHeight,box.bottom)}
  const categories=[...art.querySelectorAll('[data-reference-category]')].map(button=>{
    const r=rect(button),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y)
    return{name:button.getAttribute('aria-label'),category:button.getAttribute('data-reference-category'),rect:r,inside:r.x>=clip.x-.5&&r.right<=clip.right+.5&&r.y>=clip.y-.5&&r.bottom<=clip.bottom+.5,hittable:Boolean(hit&&(hit===button||button.contains(hit)))}
  })
  return{viewport:{width:innerWidth,height:innerHeight},touchPoints:navigator.maxTouchPoints,scene:document.querySelector('.guided-commerce')?.getAttribute('data-scene'),expanded:scroll.classList.contains('is-expanded'),scrollLeft:scroll.scrollLeft,scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth,scrollBox:box,art:rect(art),image:rect(image),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,objectFit:getComputedStyle(image).objectFit,filter:getComputedStyle(image).filter,documentOverflow:document.documentElement.scrollWidth-innerWidth,windowScrollX:scrollX,categories}
}

async function testZoom(page,act,shot) {
  const viewport=page.viewportSize()
  if(!viewport||viewport.width>=720)return{skipped:true,reason:'Native zoom/pan acceptance targets sub720px mobile viewports',viewport}
  assert.equal(typeof act,'function','Pass the existing act(locator) native tap helper')
  await page.evaluate(()=>{window.__qaZoomNative=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>{const e=event.target instanceof Element?event.target.closest('button'):null;window.__qaZoomNative.push({time:performance.now(),type,trusted:event.isTrusted,pointerType:event.pointerType||null,x:event.clientX,y:event.clientY,label:e?.getAttribute('aria-label')||e?.textContent?.trim()||null,scrollLeft:document.querySelector('.reference-scroll')?.scrollLeft})},{capture:true})})
  const initialURL=page.url(),before=await page.evaluate(inspectZoom)
  const result={viewport,expandedRequiresAllThreeTogether:false,panMethod:'CDP Input.dispatchTouchEvent',before,pans:[]}
  assert.ok(before.touchPoints>0,'Use a real emulated mobile context with hasTouch')
  assert.equal(before.expanded,false,'Start from the default complete image')
  assert.deepEqual(before.categories.map(item=>item.category),['packs','combos','schmears'])
  assert.ok(before.categories.every(item=>item.inside&&item.hittable),'Default image must expose all three complete category targets')
  const expand=page.getByRole('button',{name:'Ampliar imagen para leer',exact:true})
  assert.equal(await expand.getAttribute('aria-pressed'),'false')
  await act(expand)
  await page.waitForFunction(()=>{
    const e=document.querySelector('.reference-scroll'),art=e?.querySelector('.reference-art')
    if(!e||!art||!e.classList.contains('is-expanded')||art.getBoundingClientRect().width<719.5)return false
    const expected=Math.max(0,Math.min(e.scrollWidth-e.clientWidth,e.scrollWidth*(813/1536)-e.clientWidth/2))
    return e.scrollWidth>e.clientWidth+20&&Math.abs(e.scrollLeft-expected)<=1.25
  },undefined,{polling:100,timeout:10000})
  const collapse=page.getByRole('button',{name:'Ver imagen completa',exact:true})
  assert.equal(await collapse.getAttribute('aria-pressed'),'true')
  result.expanded=await page.evaluate(inspectZoom)
  assert.ok(result.expanded.art.width>=719.5,'Expanded art must reach720px')
  assert.ok(result.expanded.scrollWidth>result.expanded.clientWidth+20,'Expanded image must have a real horizontal scroll range')
  assert.equal(page.url(),initialURL)
  if(shot)await shot('reference-zoom-expanded','.reference-presentation')
  const cdp=await page.context().newCDPSession(page)
  let touching=false
  try{
    for(const direction of ['toward-right-edge','toward-left-edge']){
      const current=await page.evaluate(inspectZoom),b=current.scrollBox
      const left=b.x+64,right=b.right-64,y=Math.max(24,Math.min(current.viewport.height-24,b.y+b.height*.70))
      assert.ok(right-left>=24,'The image viewport must leave64px inner margins for native pan')
      const start={x:direction==='toward-right-edge'?right:left,y},end={x:direction==='toward-right-edge'?left:right,y}
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1,radiusX:2,radiusY:2,force:1}]});touching=true
      for(let step=1;step<=6;step++){
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*step/6,y,id:1,radiusX:2,radiusY:2,force:1}]})
        await page.waitForTimeout(30)
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touching=false
      await page.waitForFunction(({from,direction})=>{const now=document.querySelector('.reference-scroll')?.scrollLeft;return direction==='toward-right-edge'?now-from>20:from-now>20},{from:current.scrollLeft,direction},{polling:50,timeout:5000})
      await page.waitForTimeout(180)
      const after=await page.evaluate(inspectZoom),delta=after.scrollLeft-current.scrollLeft
      assert.ok(Math.abs(delta)>20,'Native horizontal pan must move scrollLeft by over20px')
      assert.ok(direction==='toward-right-edge'?delta>20:delta< -20,'Native pan must move in the expected direction')
      assert.equal(page.url(),initialURL,'Panning may not navigate')
      assert.equal(after.scene,before.scene,'Panning on the image may not activate a category')
      assert.ok(after.documentOverflow<=1&&Math.abs(after.windowScrollX)<=1,'Pan stays inside the image viewport')
      result.pans.push({direction,start,end,before:current.scrollLeft,after:after.scrollLeft,delta,categories:after.categories})
      if(shot)await shot('reference-zoom-'+direction,'.reference-presentation')
    }
  }finally{
    if(touching)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{})
    await cdp.detach()
  }
  result.beforeCollapse=await page.evaluate(inspectZoom)
  result.scrollSettle=await page.evaluate(()=>new Promise((resolve,reject)=>{const trace=[];let stable=0,last=null;const timer=setTimeout(()=>reject(Error('Native scroll did not settle')),5000);function frame(time){const left=document.querySelector('.reference-scroll').scrollLeft;trace.push({time,left});stable=last!==null&&Math.abs(left-last)<.25?stable+1:0;last=left;if(stable>=8){clearTimeout(timer);resolve(trace)}else requestAnimationFrame(frame)}requestAnimationFrame(frame)}))
  result.preTapEvents=await page.evaluate(()=>window.__qaZoomNative)
  await act(collapse)
  result.afterTap=await page.evaluate(()=>({expanded:document.querySelector('.reference-scroll').classList.contains('is-expanded'),pressed:document.querySelector('.reference-mobile-tools button').getAttribute('aria-pressed'),events:window.__qaZoomNative}))
  await page.waitForFunction(()=>{const e=document.querySelector('.reference-scroll');return e&&!e.classList.contains('is-expanded')&&Math.abs(e.scrollLeft)<=1&&e.scrollWidth<=e.clientWidth+1},undefined,{polling:100,timeout:10000})
  result.restored=await page.evaluate(inspectZoom)
  assert.equal(await page.getByRole('button',{name:'Ampliar imagen para leer',exact:true}).getAttribute('aria-pressed'),'false')
  assert.equal(result.restored.expanded,false)
  assert.ok(Math.abs(result.restored.scrollLeft)<=1,'Collapse must clamp horizontal offset to zero')
  assert.ok(Math.abs(result.restored.art.width-result.restored.clientWidth)<=1,'Collapsed image returns to its complete container width')
  assert.ok(result.restored.documentOverflow<=1&&Math.abs(result.restored.windowScrollX)<=1)
  assert.equal(result.restored.naturalWidth,1536);assert.equal(result.restored.naturalHeight,1024)
  assert.equal(result.restored.objectFit,'contain');assert.equal(result.restored.filter,'none')
  assert.ok(Math.abs(result.restored.image.width/result.restored.image.height-1.5)<.005)
  assert.equal(result.restored.categories.length,3)
  assert.ok(result.restored.categories.every(item=>item.inside&&item.hittable&&item.rect.width>=43.99&&item.rect.height>=43.99),'Reverting must restore all three unclipped44px native category targets')
  assert.equal(result.restored.scene,before.scene);assert.equal(page.url(),initialURL)
  if(shot)await shot('reference-zoom-restored','.reference-presentation')
  result.nativeEvents=await page.evaluate(()=>window.__qaZoomNative)
  return result
}

module.exports={testZoom}
