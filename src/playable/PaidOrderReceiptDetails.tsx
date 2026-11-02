import type { PaidOrderReceipt } from '../domain/lib/paid-order-receipt'

/** Non-fiscal read-only display; has no cart, payment client or fulfillment action. */
export function PaidOrderReceiptDetails({receipt}: {receipt: PaidOrderReceipt}) {
  return <>
    {receipt.detailsAvailable ? <div className="live-receipt-lines">
      {receipt.items.map(item => <span key={item.kind + '-' + item.flavorId}>
        <i>{item.quantity} ×</i><b>{item.name}{item.grams !== undefined ? ' · ' + item.grams + ' g' : ''}</b>
      </span>)}
    </div> : <p role="status">Pago registrado. El detalle de productos aún no está disponible; no se reconstruye desde el carrito actual.</p>}
    {receipt.detailsAvailable && <div className="live-receipt-lines">
      <span><i>Productos</i><b>S/ {(receipt.subtotalMinor! / 100).toFixed(2)}</b></span>
      <span><i>Delivery</i><b>S/ {(receipt.deliveryFeeMinor! / 100).toFixed(2)}</b></span>
    </div>}
    <div className="live-receipt-total"><span>TOTAL REGISTRADO</span><strong>S/ {(receipt.amountMinor / 100).toFixed(2)}</strong></div>
    <p>Detalle informativo. No es comprobante fiscal ni autorización de despacho.</p>
  </>
}
