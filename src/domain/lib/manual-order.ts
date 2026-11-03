/** Non-transactional launch fallback.
 * Customer sends a structured inquiry to the verified Bagelito contact
 * number. This does NOT reserve stock, accept payment or promise a date.
 */
export const BAGELITO_WHATSAPP_PHONE = '51917547745'

export type ManualOrderLine = {
  name: string
  quantity: number
}

export type ManualOrderInput = {
  category: 'packs' | 'combos' | 'schmears'
  format?: 'grande' | 'mini'
  packQuantity?: number
  packMix?: 'mixed' | 'single'
  comboName?: string
  schmearSizeGrams?: number
  bagels: ManualOrderLine[]
  schmears: ManualOrderLine[]
}

/** The review panels and inquiry must describe the same actual selection.
 * Like the canonical quote, a completed pack with one flavor is single even
 * when the customer originally entered through the mixed selector.
 */
export function describeManualOrderSelection(input: ManualOrderInput) {
  const selectedFlavors = new Set(input.bagels
    .filter(item => Number.isInteger(item.quantity) && item.quantity > 0)
    .map(item => item.name))
  const singleFlavor = selectedFlavors.size === 1 || (selectedFlavors.size === 0 && input.packMix === 'single')
  return input.category === 'packs'
    ? 'Pack de ' + String(input.packQuantity || 0) + ' bagels ' +
      (input.format === 'mini' ? 'minis' : 'grandes') +
      ' (' + (singleFlavor ? 'un sabor' : 'mixto') + ')'
    : input.category === 'combos'
      ? (input.comboName || 'Combo de bagels y schmears')
      : 'Schmear individual (' + String(input.schmearSizeGrams || 120) + ' g)'
}

export function formatManualOrderInquiry(input: ManualOrderInput) {
  const header = describeManualOrderSelection(input)

  const bagels = input.bagels
    .filter(item => Number.isInteger(item.quantity) && item.quantity > 0)
    .map(item => '- ' + item.quantity + ' × ' + item.name)
  const schmears = input.schmears
    .filter(item => Number.isInteger(item.quantity) && item.quantity > 0)
    .map(item => '- ' + item.quantity + ' × ' + item.name +
      (input.schmearSizeGrams || input.category === 'schmears' ? ' (' + String(input.schmearSizeGrams || 120) + ' g)' : ''))

  return [
    'Hola, Bagelito. Quisiera consultar la disponibilidad de este pedido:',
    '',
    header,
    ...(bagels.length ? ['', 'Bagels:', ...bagels] : []),
    ...(schmears.length ? ['', 'Schmears:', ...schmears] : []),
    '',
    '¿Me confirman la disponibilidad, el precio final, el delivery y la fecha del próximo batch?',
    'Entiendo que esta consulta no confirma ni paga el pedido.',
  ].join('\n')
}

export function createManualOrderWhatsAppHref(input: ManualOrderInput) {
  const message = formatManualOrderInquiry(input)
  return 'https://wa.me/' + BAGELITO_WHATSAPP_PHONE + '?text=' + encodeURIComponent(message)
}
