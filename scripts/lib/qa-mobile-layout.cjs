function measureMobileLayout(options={}){
 const scene=options.scene||document.querySelector('.guided-commerce')?.getAttribute('data-scene')
 const bounds=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}
 const intersection=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.right,b.right),bottom=Math.min(a.bottom,b.bottom);return{x,y,right,bottom,width:Math.max(0,right-x),height:Math.max(0,bottom-y)}}
 const viewport={x:0,y:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight}
 function paintedRect(e){let r=intersection(bounds(e),viewport),clipAncestors=true;for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)return null;if(p!==e&&clipAncestors&&p!==document.body&&p!==document.documentElement&&(/auto|scroll|hidden|clip/.test(s.overflowX)||/auto|scroll|hidden|clip/.test(s.overflowY))){const b=bounds(p);r=intersection(r,{x:/auto|scroll|hidden|clip/.test(s.overflowX)?b.x:r.x,y:/auto|scroll|hidden|clip/.test(s.overflowY)?b.y:r.y,right:/auto|scroll|hidden|clip/.test(s.overflowX)?b.right:r.right,bottom:/auto|scroll|hidden|clip/.test(s.overflowY)?b.bottom:r.bottom})}if(s.position==='fixed')clipAncestors=false}return r.width>0&&r.height>0?r:null}
 const blockers=[...document.querySelectorAll('.guided-commerce *')].flatMap(e=>{const s=getComputedStyle(e),alpha=s.backgroundColor.startsWith('rgba')?Number(s.backgroundColor.slice(s.backgroundColor.lastIndexOf(',')+1,-1)):s.backgroundColor==='transparent'?0:1;if(alpha<.8&&s.backgroundImage==='none'&&e.tagName!=='IMG')return[];const r=paintedRect(e);return r?[{...r,className:e.className,tag:e.tagName,background:s.backgroundColor}]:[]})
 const blocked=(x,y)=>blockers.some(b=>x>=b.x&&x<b.right&&y>=b.y&&y<b.bottom)
 const free=r=>{if(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)return null;let clear=0,total=0;for(let y=0;y<30;y++)for(let x=0;x<48;x++){total++;if(!blocked(r.x+(x+.5)*r.width/48,r.y+(y+.5)*r.height/30))clear++}return clear/total}
 const groupSpecs=scene==='bagels'?[['bagels','.bagelito-3d-blue-sign',8]]:scene==='schmears'?[['schmears','.schmear-3d-sign',5]]:scene==='cashier'?[['cashier','.pos-label',1]]:[['bagels','.bagelito-3d-blue-sign',8],['schmears','.schmear-3d-sign',5]]
 const groups=groupSpecs.map(([kind,selector,expectedCount])=>{
  const anchors=[...document.querySelectorAll(selector)].map(e=>{const r=bounds(e);return{label:e.textContent,rect:r,x:r.x+r.width/2,y:r.y+r.height/2}})
  const validAnchors=anchors.length===expectedCount&&anchors.every(a=>[a.rect.x,a.rect.y,a.rect.width,a.rect.height].every(Number.isFinite)&&a.rect.width>0&&a.rect.height>0&&a.rect.x>=0&&a.rect.y>=0&&a.rect.right<=innerWidth&&a.rect.bottom<=innerHeight)
  if(!validAnchors)return{kind,expectedCount,valid:false,roi:{x:0,y:0,right:0,bottom:0,width:0,height:0},clearFraction:null,anchors:anchors.map(a=>({...a,inside:false,free:false}))}
  let raw
  if(kind==='cashier'){
   const a=anchors[0],w=Math.min(innerWidth*.75,Math.max(96,(a?.rect.width||0)*4)),h=Math.max(110,(a?.rect.height||0)*6)
   raw={x:(a?.x||0)-w/2,y:(a?.y||0)-h*.55,right:(a?.x||0)+w/2,bottom:(a?.y||0)+h*.45}
  }else{
   const n=Math.ceil(anchors.length/2),rows=[...anchors].sort((a,b)=>a.y-b.y),top=rows.slice(0,n),bottom=rows.slice(n),gap=Math.abs(top.reduce((s,a)=>s+a.y,0)/top.length-bottom.reduce((s,a)=>s+a.y,0)/bottom.length),xs=top.map(a=>a.x).sort((a,b)=>a-b),dx=(xs.at(-1)-xs[0])/Math.max(1,xs.length-1)
   raw={x:Math.min(...anchors.map(a=>a.x))-.6*dx,y:Math.min(...anchors.map(a=>a.y))-1.1*gap,right:Math.max(...anchors.map(a=>a.x))+.6*dx,bottom:Math.max(...anchors.map(a=>a.y))+.5*gap}
  }
  raw.width=raw.right-raw.x;raw.height=raw.bottom-raw.y;const roi=intersection(raw,viewport)
  return{kind,expectedCount,valid:true,roi,clearFraction:free(roi),anchors:anchors.map(a=>({...a,inside:a.rect.x>=0&&a.rect.y>=0&&a.rect.right<=innerWidth&&a.rect.bottom<=innerHeight,free:a.rect.width>0&&a.rect.height>0&&a.rect.x>=0&&a.rect.y>=0&&a.rect.right<=innerWidth&&a.rect.bottom<=innerHeight&&!blocked(a.x,a.y)}))}
 })
 const canvas=document.querySelector('canvas'),gl=canvas?.getContext('webgl2'),hidden=[];for(let e=canvas;e;e=e.parentElement){const s=getComputedStyle(e);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)hidden.push(e.tagName)}
 const targets=[...document.querySelectorAll('.guided-commerce button:not([disabled]),.guided-commerce a[href]')].flatMap(e=>{const r=paintedRect(e);if(!r)return[];const raw=bounds(e),s=getComputedStyle(e);if(s.pointerEvents==='none')return[];return[{label:e.getAttribute('aria-label')||e.textContent.trim(),rect:raw,clipped:r,size44:raw.width>=43.99&&raw.height>=43.99,effective44:r.width>=43.99&&r.height>=43.99}]})
 const catalogs=[...document.querySelectorAll('.mobile-bagel-grid,.mobile-schmear-grid')].map(e=>({className:e.className,rect:bounds(e),clientWidth:e.clientWidth,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight,scrollLeft:e.scrollLeft,scrollTop:e.scrollTop,overflowX:getComputedStyle(e).overflowX,overflowY:getComputedStyle(e).overflowY}))
 return{viewport:{width:innerWidth,height:innerHeight},scene,liveWorld:document.querySelector('.guided-commerce')?.getAttribute('data-live-world'),canvas:{count:document.querySelectorAll('canvas').length,hidden,webgl:Boolean(gl),lost:gl?.isContextLost(),bufferWidth:gl?.drawingBufferWidth,bufferHeight:gl?.drawingBufferHeight},overflow:document.documentElement.scrollWidth-innerWidth,canvasFreeFraction:free(viewport),groups,blockers,targets,catalogs}
}



function inspectTapTarget(e){
 const box=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}
 let rect=box(e),clip={...rect},canClip=true,visible=true;const scrollables=[]
 for(let p=e,depth=0;p;p=p.parentElement,depth++){
  const s=getComputedStyle(p),b=box(p)
  if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)visible=false
  if(p!==e&&canClip&&p!==document.body&&p!==document.documentElement){
   if(/auto|scroll|hidden|clip/.test(s.overflowX)){clip.x=Math.max(clip.x,b.x);clip.right=Math.min(clip.right,b.right)}
   if(/auto|scroll|hidden|clip/.test(s.overflowY)){clip.y=Math.max(clip.y,b.y);clip.bottom=Math.min(clip.bottom,b.bottom)}
  }
  const horizontal=/auto|scroll/.test(s.overflowX)&&p.scrollWidth>p.clientWidth+2,vertical=/auto|scroll/.test(s.overflowY)&&p.scrollHeight>p.clientHeight+2
  if(p!==e&&(horizontal||vertical))scrollables.push({depth,horizontal,vertical,rect:b,scrollLeft:p.scrollLeft,scrollTop:p.scrollTop,clientWidth:p.clientWidth,clientHeight:p.clientHeight,scrollWidth:p.scrollWidth,scrollHeight:p.scrollHeight})
  if(s.position==='fixed')canClip=false
 }
 clip.x=Math.max(0,clip.x);clip.y=Math.max(0,clip.y);clip.right=Math.min(innerWidth,clip.right);clip.bottom=Math.min(innerHeight,clip.bottom);clip.width=Math.max(0,clip.right-clip.x);clip.height=Math.max(0,clip.bottom-clip.y)
 const point={x:clip.x+clip.width/2,y:clip.y+clip.height/2},hit=document.elementFromPoint(point.x,point.y)
 return{label:e.getAttribute('aria-label')||e.textContent.trim(),visible,rect,clip,point,hit:Boolean(hit&&(hit===e||e.contains(hit))),topHit:hit?{tag:hit.tagName,className:hit.className}:null,scrollables}
}
function inspectCardContent(button){
 const viewport={x:0,y:0,right:innerWidth,bottom:innerHeight}
 function clip(element){const r=element.getBoundingClientRect();let out={x:Math.max(0,r.x),y:Math.max(0,r.y),right:Math.min(innerWidth,r.right),bottom:Math.min(innerHeight,r.bottom)},active=true,visible=true;for(let p=element;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)visible=false;if(p!==element&&active&&p!==document.body&&p!==document.documentElement){const b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowX)){out.x=Math.max(out.x,b.x);out.right=Math.min(out.right,b.right)}if(/auto|scroll|hidden|clip/.test(s.overflowY)){out.y=Math.max(out.y,b.y);out.bottom=Math.min(out.bottom,b.bottom)}}if(s.position==='fixed')active=false}return{...out,width:Math.max(0,out.right-out.x),height:Math.max(0,out.bottom-out.y),visible}}
 const buttonClip=clip(button),minus=button.parentElement.querySelector('.mobile-product-count button'),minusRect=minus?.getBoundingClientRect()
 return{buttonClip,texts:[...button.querySelectorAll('.mobile-bagel-sign,.mobile-schmear-label,small')].map(label=>{const style=getComputedStyle(label),r=label.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(label);let allowed={...buttonClip};for(let p=label;p&&p!==button;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(s.overflowX)){allowed.x=Math.max(allowed.x,b.x);allowed.right=Math.min(allowed.right,b.right)}if(/hidden|clip|auto|scroll/.test(s.overflowY)){allowed.y=Math.max(allowed.y,b.y);allowed.bottom=Math.min(allowed.bottom,b.bottom)}}const glyphs=[...range.getClientRects()].map(t=>({x:t.x,y:t.y,right:t.right,bottom:t.bottom,width:t.width,height:t.height}));return{text:label.textContent,tag:label.tagName,rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},glyphs,visible:clip(label).visible,ellipsis:style.textOverflow==='ellipsis',complete:clip(label).visible&&style.textOverflow!=='ellipsis'&&glyphs.length>0&&glyphs.every(t=>t.x>=allowed.x-1&&t.right<=allowed.right+1&&t.y>=allowed.y-1&&t.bottom<=allowed.bottom+1),overlapsMinus:Boolean(minusRect&&glyphs.some(t=>Math.min(t.right,minusRect.right)-Math.max(t.x,minusRect.x)>1&&Math.min(t.bottom,minusRect.bottom)-Math.max(t.y,minusRect.y)>1))}})}
}
module.exports={measureMobileLayout,inspectTapTarget,inspectCardContent}
