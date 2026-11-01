/** Offline-authored inspection only. No browser, fetch, storage, or app hooks.
 * Call with page.evaluate(inspectSecondaryReadability) from the existing guard.
 * Range rectangles describe rendered text runs, not optical glyph ink.
 */
function inspectSecondaryReadability() {
  const root = document.querySelector('.guided-commerce[data-reference-mode="true"]')
  if (!root) throw Error('Exact-reference commerce root required')
  const shell = root.closest('.reference-storefront') || root
  const scene = root.getAttribute('data-scene')
  const specs = [
    { name: 'bagel', cards: '.mobile-bagel-card', text: [':scope > button > .mobile-bagel-sign', ':scope > button > small'], targets: [':scope > button', '.mobile-product-count > button'] },
    { name: 'pack-format', cards: '.pack-format-grid > button', text: [':scope > span:not(.pack-format-art) > b', ':scope > span:not(.pack-format-art) > small'], selfTarget: true },
    { name: 'pack-mix', cards: '.guided-pack-mix > button', text: [':scope > b', ':scope > small'], selfTarget: true },
    { name: 'pack-quantity', cards: '.pack-choice-grid > button', text: [':scope > b', ':scope > span', ':scope > small'], selfTarget: true },
    { name: 'schmear-size', cards: '.guided-size-cards > button', text: [':scope > b', ':scope > span'], selfTarget: true },
    { name: 'combo', cards: '.approved-combo-overlay > button', text: ['.approved-combo-copy > small', '.approved-combo-copy > b', '.approved-combo-copy > em', '.approved-combo-copy > strong'], selfTarget: true },
    { name: 'cashier', cards: '.guided-cashier-action', text: ['.guided-cashier-copy > small', '.guided-cashier-copy > h2', '.guided-cashier-lines > span > i', '.guided-cashier-lines > span > b', '.guided-cashier-quote > span', '.guided-cashier-copy > p'], targets: [':scope > button'] },
    { name: 'checkout', cards: '.guided-payment-sheet', text: ['.guided-payment-copy > small', '.guided-payment-copy > b', '.guided-payment-copy > span', '.checkout-customer-grid > label > span', '.checkout-terms-check > span', '.reference-payment-review > p[role="status"]'], targets: ['.checkout-customer-grid input', '.checkout-customer-grid select', '.checkout-terms-check', '.reference-payment-review > button'] },
    { name: 'loyalty', cards: '.reference-loyalty', text: [':scope > h2', ':scope > p'] },
  ]
  const rectangle = r => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height })
  const intersects = (a, b) => Math.min(a.right, b.right) - Math.max(a.x, b.x) > .5 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > .5
  const visible = element => {
    if (!element.getClientRects().length) return false
    for (let node = element; node; node = node.parentElement) {
      const c = getComputedStyle(node)
      if (c.display === 'none' || c.visibility !== 'visible' || Number(c.opacity) === 0) return false
    }
    return true
  }
  const clipCache = new WeakMap()
  const clipping = element => {
    if (clipCache.has(element)) return clipCache.get(element)
    const clips = []
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const c = getComputedStyle(ancestor), b = ancestor.getBoundingClientRect()
      if (ancestor.tagName === 'HTML' || ancestor.tagName === 'BODY') continue
      const x = /hidden|clip|auto|scroll/.test(c.overflowX), y = /hidden|clip|auto|scroll/.test(c.overflowY)
      if (x || y || c.clipPath !== 'none') clips.push({ tag: ancestor.tagName, className: ancestor.className, overflowX: c.overflowX, overflowY: c.overflowY, clipPath: c.clipPath, x, y, box: { x: b.x + ancestor.clientLeft, right: b.x + ancestor.clientLeft + ancestor.clientWidth, y: b.y + ancestor.clientTop, bottom: b.y + ancestor.clientTop + ancestor.clientHeight } })
    }
    clipCache.set(element, clips)
    return clips
  }
  const groups = [], targets = [], observedCounts = {}
  for (const spec of specs) {
    const cards = [...(spec.name === 'loyalty' ? shell : root).querySelectorAll(spec.cards)].filter(visible)
    observedCounts[spec.name] = cards.length
    for (const [cardIndex, card] of cards.entries()) {
      const cardKey = spec.name + '-' + cardIndex
      const fields = [...new Set(spec.text.flatMap(selector => [...card.querySelectorAll(selector)]))].filter(visible)
      for (const [fieldIndex, field] of fields.entries()) {
        const runs = [], walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const node = walker.currentNode, parent = node.parentElement
          if (!parent || parent.closest('[aria-hidden="true"]') || !node.textContent.trim()) continue
          const range = document.createRange(); range.selectNodeContents(node)
          const style = getComputedStyle(parent), clips = clipping(parent)
          for (const box of range.getClientRects()) {
            if (!box.width || !box.height) continue
            const r = rectangle(box)
            runs.push({ rect: r, fontSize: parseFloat(style.fontSize), lineHeight: style.lineHeight,
              belowViewport: r.y >= innerHeight || r.bottom <= 0,
              horizontalViewportClip: r.x < -.5 || r.right > innerWidth + .5,
              clippedBy: clips.filter(c => c.clipPath !== 'none' || c.x && (r.x < c.box.x - .5 || r.right > c.box.right + .5) || c.y && (r.y < c.box.y - .5 || r.bottom > c.box.bottom + .5)) })
          }
        }
        groups.push({ cardKey, selected: card.getAttribute('data-selected'), fieldIndex, tag: field.tagName, className: field.className, text: field.textContent.trim(), rect: rectangle(field.getBoundingClientRect()), runs })
      }
      const elements = spec.selfTarget ? [card] : [...new Set((spec.targets || []).flatMap(selector => [...card.querySelectorAll(selector)]))]
      for (const element of elements.filter(visible)) {
        const r = rectangle(element.getBoundingClientRect())
        targets.push({ cardKey, selected: card.getAttribute('data-selected'), tag: element.tagName, type: element.getAttribute('type'), className: element.className, ariaLabel: element.getAttribute('aria-label'), rect: r, minimum44: r.width >= 43.99 && r.height >= 43.99,
          checkboxLabelWrapper: element.matches('.checkout-terms-check'), disabled: Boolean(element.disabled), fontSize: parseFloat(getComputedStyle(element).fontSize) })
      }
    }
  }
  const overlaps = []
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const a = groups[i], b = groups[j]
    if (a.cardKey !== b.cardKey || !intersects(a.rect, b.rect)) continue
    const hits = []
    for (const ar of a.runs) for (const br of b.runs) if (intersects(ar.rect, br.rect)) hits.push({ a: ar.rect, b: br.rect })
    if (hits.length) overlaps.push({ cardKey: a.cardKey, a: a.text, b: b.text, intersections: hits })
  }
  const mini = root.querySelector('.pack-config-panel > small')?.textContent.includes('MINIS')
  const expectedCounts = scene === 'bagels' ? { bagel: 8 } : scene === 'pack-size' ? { 'pack-format': 2 } : scene === 'pack-qty' ? { 'pack-mix': 2, 'pack-quantity': mini ? 3 : 2 } : scene === 'schmear-size' ? { 'schmear-size': 3 } : scene === 'combos' ? { combo: 1 } : scene === 'cashier' ? { cashier: 1 } : scene === 'pay' ? { checkout: 1, loyalty: 1 } : {}
  return { scene, thresholds: { minNameNotePriceFontCSSPx: 12, minTargetCSSPx: 44, overlapToleranceCSSPx: .5 }, expectedCounts, observedCounts, countFailures: Object.entries(expectedCounts).filter(([key, expected]) => observedCounts[key] !== expected).map(([key, expected]) => ({ key, expected, observed: observedCounts[key] })), groups, targets, overlaps,
    smallText: groups.filter(g => g.runs.some(r => r.fontSize < 12)), clippedText: groups.filter(g => g.runs.some(r => r.horizontalViewportClip || r.clippedBy.length)),
    undersizedTargets: targets.filter(t => !t.minimum44), documentOverflowX: document.documentElement.scrollWidth - innerWidth,
    policy: { verticalDocumentScroll: 'Offscreen text is diagnostic, not a clipping failure; inspect after normal scrolling.', inputValues: 'Never read or logged; native single-line input scrolling is not text-block clipping.', checkbox: 'Measure associated label wrapper, not native checkbox dimensions.', inlineLegalLink: 'Record separately if the owner requires 44px for inline links; do not confuse with checkbox wrapper.', textRanges: 'Run geometry only; owner glyph audit remains the authoritative ink/overlap measurement.' } }
}

module.exports = { inspectSecondaryReadability }
