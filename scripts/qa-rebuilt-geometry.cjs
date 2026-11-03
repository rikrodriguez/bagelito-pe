/** Read-only browser DOM audit. No imports, browser creation or app hooks.
 * Default audits the whole document without penalizing normal vertical page
 * scrolling. A caller inspecting one scrolled target can pass targetSelector
 * and requireViewportTargets:true. Fixed minimums cannot be lowered by options.
 */
function inspectRebuiltGeometry(options = {}) {
  const thresholds = { target: 44, bodyFont: 12, titleFont: 16, geometryTolerance: .5, targetTolerance: .01 }
  const failures = [], styles = new WeakMap(), all = [...document.querySelectorAll('*')]
  const layoutWidth = document.documentElement.clientWidth
  const viewport = { x: 0, y: 0, right: layoutWidth, bottom: innerHeight, width: layoutWidth, height: innerHeight }
  const style = e => { if (!styles.has(e)) styles.set(e, getComputedStyle(e)); return styles.get(e) }
  const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
  const finish = r => ({ ...r, width: Math.max(0, r.right - r.x), height: Math.max(0, r.bottom - r.y) })
  const intersect = (a, b, x = true, y = true) => finish({ x: x ? Math.max(a.x, b.x) : a.x, y: y ? Math.max(a.y, b.y) : a.y, right: x ? Math.min(a.right, b.right) : a.right, bottom: y ? Math.min(a.bottom, b.bottom) : a.bottom })
  const describe = e => ({ tag: e.tagName, id: e.id || null, className: typeof e.className === 'string' ? e.className : e.className?.baseVal || '', label: e.getAttribute('aria-label') || e.getAttribute('name') || (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160) })
  const fail = (kind, element, details) => failures.push({ kind, element: element ? describe(element) : null, ...details })
  const clippedAxis = value => /^(auto|scroll|hidden|clip)$/.test(value)
  const scrollAxis = (e, s, axis) => /^(auto|scroll)$/.test(axis === 'x' ? s.overflowX : s.overflowY) && (axis === 'x' ? e.scrollWidth > e.clientWidth + 1 : e.scrollHeight > e.clientHeight + 1)
  function visible(e) {
    for (let p = e; p; p = p.parentElement) { const s = style(p); if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0 || p.hidden) return false }
    return true
  }
  function screenReaderOnly(e) {
    for (let p = e; p; p = p.parentElement) {
      const s = style(p), r = box(p)
      if (p.matches('.sr-only,.reference-sr-only,.visually-hidden') || r.width <= 2 && r.height <= 2 && ((s.clip && s.clip !== 'auto') || s.clipPath && s.clipPath !== 'none')) return true
    }
    return false
  }
  function geometry(e, includeSelf = false, textBounds = null) {
    const rect = box(e), seed = textBounds || rect; let effective = { ...seed }, hard = { ...seed }, canClip = true
    let maxWidth = seed.width, maxHeight = seed.height
    const scrollports = []
    for (let p = includeSelf ? e : e.parentElement; p; p = p.parentElement) {
      const s = style(p)
      if (p !== document.body && p !== document.documentElement && canClip) {
        const cx = clippedAxis(s.overflowX), cy = clippedAxis(s.overflowY)
        if (cx || cy) {
          const r = box(p), client = { x: r.x + p.clientLeft, y: r.y + p.clientTop, right: r.x + p.clientLeft + p.clientWidth, bottom: r.y + p.clientTop + p.clientHeight }
          const sx = scrollAxis(p, s, 'x'), sy = scrollAxis(p, s, 'y')
          effective = intersect(effective, client, cx, cy)
          hard = intersect(hard, client, cx && !sx, cy && !sy)
          if (sx || sy) { scrollports.push({ ...describe(p), horizontal: sx, vertical: sy, rect: finish(client) }); if (cx) maxWidth = Math.min(maxWidth, p.clientWidth); if (cy) maxHeight = Math.min(maxHeight, p.clientHeight) }
        }
      }
      if (s.position === 'fixed') canClip = false
    }
    // A fixed target itself is not clipped by an unrelated document wrapper.
    if (style(e).position === 'fixed' && !includeSelf) { effective = { ...rect }; hard = { ...rect }; maxWidth = rect.width; maxHeight = rect.height }
    return { rect, effective: finish(effective), hardClip: finish(hard), inViewport: intersect(effective, viewport), maxScrollableWidth: maxWidth, maxScrollableHeight: maxHeight, scrollports }
  }
  function fontMetrics(e) {
    let scale = 1
    for (let p = e; p; p = p.parentElement) {
      const transform = style(p).transform
      if (transform && transform !== 'none') { try { const m = new DOMMatrixReadOnly(transform); scale *= Math.hypot(m.m21, m.m22, m.m23) } catch {} }
      const zoom = parseFloat(style(p).zoom); if (Number.isFinite(zoom) && zoom > 0) scale *= zoom
    }
    const fontSize = parseFloat(style(e).fontSize)
    return { fontSize, scale, effectiveFontSize: fontSize * scale }
  }
  const forbiddenPattern = /store-reference-approved|vitrina-photo|storyboard/i, forbiddenAssets = []
  for (const e of all) {
    const names = e.tagName?.toLowerCase()
    if (names === 'img' || names === 'image') {
      const values = [e.currentSrc, e.getAttribute('src'), e.getAttribute('srcset'), e.getAttribute('href'), e.getAttribute('xlink:href')].filter(Boolean)
      for (const value of [...new Set(values)]) if (forbiddenPattern.test(value)) forbiddenAssets.push({ ...describe(e), kind: names === 'image' ? 'svg-image' : 'img', value, visible: visible(e) })
    }
    for (const pseudo of [null, '::before', '::after']) {
      const s = pseudo ? getComputedStyle(e, pseudo) : style(e), value = s.backgroundImage || ''
      if (forbiddenPattern.test(value)) forbiddenAssets.push({ ...describe(e), kind: 'css-background', pseudo, value, visible: visible(e) })
    }
  }
  for (const asset of forbiddenAssets) failures.push({ ...asset, assetKind: asset.kind, kind: 'forbidden-reference-art' })
  function clippedHorizontalContent(e) {
    const s = style(e), masked = /^(hidden|clip)$/.test(s.overflowX)
    if (!masked) return { text: [], targets: [] }
    const r = box(e), left = r.x + e.clientLeft, right = left + e.clientWidth, texts = [], clippedTargets = []
    const nodes = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    let node
    while ((node = nodes.nextNode())) {
      const parent = node.parentElement, text = node.textContent?.replace(/\s+/g, ' ').trim()
      if (!text || !parent || parent.closest('script,style,noscript,template,option') || !visible(parent) || screenReaderOnly(parent)) continue
      const range = document.createRange(); range.selectNodeContents(node)
      if ([...range.getClientRects()].some(g => g.width > 0 && g.height > 0 && (g.x < left - .5 || g.right > right + .5))) texts.push(text.slice(0, 160))
    }
    for (const target of e.querySelectorAll('button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[role="link"]')) {
      if (!visible(target) || screenReaderOnly(target)) continue
      const t = box(target)
      if (t.width > 0 && t.height > 0 && (t.x < left - .5 || t.right > right + .5)) clippedTargets.push(describe(target))
    }
    return { text: texts, targets: clippedTargets }
  }
  const horizontalOverflow = [], nativeInternalOverflow = [], decorativeOverflow = []
  for (const e of all) {
    if (!visible(e) || screenReaderOnly(e) || !(e.clientWidth > 0) || !Number.isFinite(e.scrollWidth)) continue
    const excess = e.scrollWidth - e.clientWidth
    if (excess > 1) {
      const entry = { ...describe(e), clientWidth: e.clientWidth, scrollWidth: e.scrollWidth, excess, overflowX: style(e).overflowX }
      if (e.matches('input,textarea')) nativeInternalOverflow.push(entry)
      else {
        const realClip = clippedHorizontalContent(e), root = e === document.body || e === document.documentElement
        const pans = /^(auto|scroll)$/.test(style(e).overflowX)
        if (root || pans || realClip.text.length || realClip.targets.length) { horizontalOverflow.push({ ...entry, clippedContent: realClip }); fail('horizontal-overflow', e, { ...entry, clippedContent: realClip }) }
        else decorativeOverflow.push({ ...entry, reason: 'Non-pannable painted spill; no text or interactive descendant clipped by this mask' })
      }
    }
  }
  const documentOverflow = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - layoutWidth
  if (documentOverflow > 1) fail('horizontal-document-overflow', document.documentElement, { excess: documentOverflow, viewportWidth: layoutWidth })

  const targets = [], selector = options.targetSelector || 'button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[tabindex]'
  for (const e of document.querySelectorAll(selector)) {
    if (!visible(e) || screenReaderOnly(e)) continue
    const original = box(e); if (!(original.width > 0 && original.height > 0)) continue
    const disabled = Boolean(e.disabled || e.getAttribute('aria-disabled') === 'true'), readOnly = Boolean(e.readOnly || e.hasAttribute('readonly'))
    let interaction = e, compositeLabel = false
    if (e.matches('input[type="checkbox"],input[type="radio"]')) {
      const labels = [...(e.labels || [])].filter(label => visible(label) && box(label).width >= 43.99 && box(label).height >= 43.99)
      if (labels.length) { interaction = labels.sort((a, b) => box(b).width * box(b).height - box(a).width * box(a).height)[0]; compositeLabel = true }
    }
    const g = geometry(interaction), effectiveWidth = Math.min(g.hardClip.width, g.maxScrollableWidth), effectiveHeight = Math.min(g.hardClip.height, g.maxScrollableHeight)
    const pendingNativeReveal = g.scrollports.length > 0 && (g.effective.width < 43.99 || g.effective.height < 43.99) && effectiveWidth >= 43.99 && effectiveHeight >= 43.99
    const point = { x: g.inViewport.x + g.inViewport.width / 2, y: g.inViewport.y + g.inViewport.height / 2 }, withinViewport = g.inViewport.width >= 43.99 && g.inViewport.height >= 43.99
    const hit = g.inViewport.width > 0 && g.inViewport.height > 0 ? document.elementFromPoint(point.x, point.y) : null
    const hittable = Boolean(hit && (hit === interaction || interaction.contains(hit)))
    const entry = { ...describe(e), disabled, readOnly, originalRect: original, compositeLabel, interactionElement: describe(interaction), ...g, effectiveWidth, effectiveHeight, pendingNativeReveal, withinViewport, point, hittable, topHit: hit ? describe(hit) : null }
    targets.push(entry)
    if (e.matches('input,select,textarea')) {
      entry.font = fontMetrics(e)
      if (!Number.isFinite(entry.font.effectiveFontSize) || entry.font.effectiveFontSize < 11.99) fail('control-font-below-readable-minimum', e, { ...entry.font, minimum: 12 })
    }
    if (g.rect.width < 43.99 || g.rect.height < 43.99 || effectiveWidth < 43.99 || effectiveHeight < 43.99) fail('target-below-44', e, { rect: g.rect, hardClip: g.hardClip, effectiveWidth, effectiveHeight, compositeLabel })
    if (options.requireViewportTargets && !disabled && (!withinViewport || !hittable || style(interaction).pointerEvents === 'none')) fail('target-not-currently-reachable', e, { withinViewport, hittable, point, topHit: entry.topHit })
  }
  if (!targets.length) fail('no-shown-targets', null, { selector })

  const titleSelector = 'h1,h2,h3,h4,h5,h6,[role="heading"],.category-title,.reference-category strong,.reference-category b' + (options.titleSelectors ? ',' + options.titleSelectors : '')
  const productSelector = '.mobile-bagel-card,.mobile-schmear-card,.product-card,[data-product-card],.mobile-bagel-sign,.mobile-schmear-label,.product-name,.product-title,[data-product-name]'
  const groupSelector = '.mobile-bagel-card,.mobile-schmear-card,.product-card,[data-product-card],.reference-category,.category-card,[data-category-card],.pack-format-grid>button,.guided-pack-mix>button,.pack-choice-grid>button,.guided-size-cards>button,.approved-combo-overlay>button,.guided-cashier-action,.guided-payment-sheet'
  const semanticSelector = '.reference-schmear-price,.product-price,[data-product-price],.mobile-bagel-sign,.mobile-schmear-label,.product-name,.product-title,[data-product-name],.product-note,.product-description,[data-product-note],small,p,h1,h2,h3,h4,h5,h6,strong,b'
  const texts = [], groups = new Map(), backBlocks = new Map(), headingBlocks = new Map(), walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let textNode
  while ((textNode = walker.nextNode())) {
    const text = textNode.textContent?.replace(/\s+/g, ' ').trim(), e = textNode.parentElement
    if (!text || !e || e.closest('script,style,noscript,template,option') || !visible(e) || screenReaderOnly(e)) continue
    const range = document.createRange(); range.selectNodeContents(textNode)
    const glyphs = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(r => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }))
    if (!glyphs.length) continue
    const s = style(e), productText = Boolean(e.closest(productSelector)), title = !productText && Boolean(e.closest(titleSelector)), minimum = title ? 16 : 12
    const { fontSize, scale, effectiveFontSize } = fontMetrics(e)
    // A line box is not a clipping mask. Fonts can paint ascenders/descenders
    // beyond it when overflow is visible; only actual overflow masks clip glyphs.
    const glyphBounds = finish({ x: Math.min(...glyphs.map(r => r.x)), y: Math.min(...glyphs.map(r => r.y)), right: Math.max(...glyphs.map(r => r.right)), bottom: Math.max(...glyphs.map(r => r.bottom)) })
    const g = geometry(e, true, glyphBounds), outside = glyphs.filter(r => r.x < g.hardClip.x - .5 || r.right > g.hardClip.right + .5 || r.y < g.hardClip.y - .5 || r.bottom > g.hardClip.bottom + .5)
    const ellipsisApplied = s.textOverflow === 'ellipsis' && (e.scrollWidth > e.clientWidth + 1 || outside.length > 0)
    const entry = { text: text.slice(0, 240), element: describe(e), title, fontSize, effectiveFontSize, minimum, glyphs, hardClip: g.hardClip, scrollports: g.scrollports, clippedGlyphs: outside, ellipsisApplied }
    texts.push(entry)
    if (!Number.isFinite(effectiveFontSize) || effectiveFontSize < minimum - .01) fail('font-below-readable-minimum', e, { text: entry.text, fontSize, scale, effectiveFontSize, minimum })
    if (outside.length || ellipsisApplied) fail('text-clipped', e, { text: entry.text, glyphs: outside, hardClip: g.hardClip, ellipsisApplied })
    const back = e.closest('.guided-journey-back'), heading = e.closest('h1,h2,h3,h4,h5,h6,[role="heading"]')
    for (const [map, block] of [[backBlocks, back], [headingBlocks, heading]]) if (block) {
      if (!map.has(block)) map.set(block, { element: describe(block), text: '', glyphs: [] })
      const value = map.get(block); value.text += (value.text ? ' ' : '') + entry.text; value.glyphs.push(...glyphs)
    }
    const group = e.closest(groupSelector)
    if (group) { const block = e.closest(semanticSelector) || e; if (!groups.has(group)) groups.set(group, new Map()); const blocks = groups.get(group); if (!blocks.has(block)) blocks.set(block, { element: describe(block), text: '', glyphs: [] }); const value = blocks.get(block); value.text += (value.text ? ' ' : '') + entry.text; value.glyphs.push(...glyphs) }
  }
  const overlaps = []
  for (const [group, blocks] of groups) {
    const entries = [...blocks.values()]
    for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
      const collisions = []
      for (const a of entries[i].glyphs) for (const b of entries[j].glyphs) { const r = intersect(a, b); if (r.width > .5 && r.height > .5) collisions.push(r) }
      if (collisions.length) { const overlap = { group: describe(group), first: entries[i], second: entries[j], intersections: collisions }; overlaps.push(overlap); fail('comparable-text-overlap', group, overlap) }
    }
  }
  const headerOverlaps = []
  const layer = e => e.closest('.guided-store-menu-panel,.guided-store-cart-panel,[role="dialog"],[aria-modal="true"]') || e.closest('.guided-commerce') || document.body
  for (const [back, first] of backBlocks) for (const [heading, second] of headingBlocks) {
    if (layer(back) !== layer(heading) || back.contains(heading) || heading.contains(back)) continue
    const collisions = []
    for (const a of first.glyphs) for (const b of second.glyphs) { const r = intersect(a, b); if (r.width > .5 && r.height > .5) collisions.push(r) }
    if (collisions.length) { const overlap = { back: first, heading: second, intersections: collisions }; headerOverlaps.push(overlap); fail('back-heading-text-overlap', back, overlap) }
  }
  return { thresholds, viewport, documentOverflow, horizontalOverflow, nativeInternalOverflow, decorativeOverflow, targets, texts, overlaps, headerOverlaps, forbiddenAssets, failures, passed: failures.length === 0, scope: 'Read-only whole-document DOM geometry; ordinary vertical page scroll is not clipping. Hidden assistive-only text is excluded. Overlay hit-tests are recorded but asserted only with requireViewportTargets.' }
}

module.exports = { inspectRebuiltGeometry }
