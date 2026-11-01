'use strict'

// Read-only browser measurement. No CSS, loading attributes or app state changes.
function inspectComboComposition() {
  const tolerance = .5
  const rect = element => {
    const r = element.getBoundingClientRect()
    return {x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height}
  }
  const valid = value => Object.values(value).every(Number.isFinite) && value.width > 0 && value.height > 0
  const collision = (a, b) => ({width: Math.min(a.right, b.right) - Math.max(a.x, b.x), height: Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)})
  const failures = [], cards = [...document.querySelectorAll('.approved-combo-overlay > button')]
  if (cards.length !== 1) failures.push({kind: 'combo-composition-cardinality', expected: 1, observed: cards.length})
  const results = cards.map((card, index) => {
    const art = card.querySelector('.approved-combo-art'), copy = card.querySelector('.approved-combo-copy')
    if (!art || !copy) {failures.push({kind: 'combo-composition-missing-region', index, art: Boolean(art), copy: Boolean(copy)}); return {index}}
    const artRect = rect(art), copyRect = rect(copy)
    if (!valid(artRect) || !valid(copyRect)) failures.push({kind: 'combo-composition-invalid-region', index, artRect, copyRect})
    const fields = [...copy.querySelectorAll('small,b,em,strong')].filter(element => element.getClientRects().length)
      .map(element => ({text: element.textContent.trim(), rect: rect(element)}))
    const elements = [...art.querySelectorAll('img')]
    if (!elements.length) failures.push({kind: 'combo-composition-no-images', index})
    const images = elements.map(image => {
      const imageRect = rect(image), source = image.currentSrc || image.src
      const item = {source, className: image.className, rect: imageRect, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight}
      if (!valid(imageRect)) failures.push({kind: 'combo-image-invalid-rect', index, source, imageRect})
      if (imageRect.x < artRect.x - tolerance || imageRect.y < artRect.y - tolerance || imageRect.right > artRect.right + tolerance || imageRect.bottom > artRect.bottom + tolerance) {
        failures.push({kind: 'combo-image-outside-art-region', index, source, imageRect, artRect})
      }
      const overlap = collision(imageRect, copyRect)
      if (overlap.width > tolerance && overlap.height > tolerance) failures.push({kind: 'combo-image-over-copy', index, source, imageRect, copyRect, overlap})
      for (const field of fields) {
        const intersection = collision(imageRect, field.rect)
        if (intersection.width > tolerance && intersection.height > tolerance) failures.push({kind: 'combo-image-over-copy-field', index, source, imageRect, field, overlap: intersection})
      }
      return item
    })
    return {index, artRect, copyRect, fields, images}
  })
  return {toleranceCSSPx: tolerance, cards: results, failures, pass: failures.length === 0,
    scope: 'Each image rectangle must remain within its allocated art region and outside the copy rectangle/fields. Transparent image padding is conservatively part of the image rectangle.'}
}

module.exports = {inspectComboComposition}
