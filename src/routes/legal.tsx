import { createFileRoute, Link } from '@tanstack/react-router'
import { CHECKOUT_LEGAL_VERSION } from '../domain/lib/legal-version'
import '../legal.css'

export const Route = createFileRoute('/legal')({
  head: () => ({
    meta: [
      { title: 'Políticas de compra y delivery | Bagelito.pe' },
      { name: 'description', content: 'Términos operativos de compra, pago, delivery, privacidad, cancelaciones y reembolsos de Bagelito.pe.' },
    ],
  }),
  component: LegalPage,
})

function LegalPage() {
  return <main className="legal-shell">
    <header className="legal-header">
      <Link to="/">← Volver a Bagelito</Link>
      <small>VERSIÓN {CHECKOUT_LEGAL_VERSION}</small>
      <h1>Políticas de compra y delivery</h1>
      <p>Estas condiciones describen cómo Bagelito.pe recibe, cobra, produce y entrega pedidos realizados mediante batches programados en Lima.</p>
    </header>

    <section>
      <h2>1. Confirmación del pedido</h2>
      <p>Un pedido queda confirmado únicamente cuando Bagelito recibe una confirmación válida del proveedor de pagos y el pedido figura como pagado en nuestros sistemas. Seleccionar productos o iniciar un checkout no separa stock por sí solo.</p>
      <p>El checkout online solo se habilita cuando existe un batch abierto, capacidad disponible y una fecha de delivery confirmada.</p>
    </section>

    <section>
      <h2>2. Productos y disponibilidad</h2>
      <p>Bagelito produce alimentos artesanales en batches. Sabores, presentaciones y disponibilidad pueden variar según producción e ingredientes. El precio y la composición que rigen cada compra son los que el servidor valida y muestra antes del pago.</p>
      <p>Si una configuración no tiene una regla comercial aprobada para cobro automático, el checkout se bloqueará en lugar de estimar un precio.</p>
    </section>

    <section>
      <h2>3. Pagos</h2>
      <p>Los medios de pago disponibles se muestran dentro del checkout seguro de Culqi. Los datos de tarjeta se ingresan directamente en el entorno de Culqi y no se almacenan en los servidores de Bagelito.</p>
      <p>Si el resultado de un pago es incierto o requiere reconciliación, el cliente no debe volver a pagar hasta que el estado sea verificado. Bagelito podrá contactar al cliente para resolver el caso.</p>
    </section>

    <section>
      <h2>4. Delivery</h2>
      <p>El costo de delivery se calcula durante el checkout según el distrito seleccionado y se suma al total antes de generar la reserva. El pedido se entrega en la fecha del batch confirmada al momento de la compra.</p>
      <p>El cliente debe proporcionar nombre, WhatsApp, email, distrito, dirección completa y cualquier referencia necesaria. Cambios posteriores a la confirmación dependen de disponibilidad de ruta.</p>
    </section>

    <section>
      <h2>5. Recepción</h2>
      <p>El cliente debe estar disponible durante la ventana coordinada. Si la entrega no puede completarse por dirección incorrecta, acceso restringido o ausencia del receptor, una reentrega dependerá de disponibilidad y puede generar un costo adicional.</p>
    </section>

    <section>
      <h2>6. Cancelaciones y reembolsos</h2>
      <p>Antes de la confirmación de pago, una reserva puede abandonarse sin generar una compra. Después de la confirmación, las solicitudes de cancelación se revisan según el estado de producción del batch.</p>
      <p>Si Bagelito no puede producir o entregar un pedido confirmado por una causa atribuible a la operación, se coordinará la devolución correspondiente o una alternativa aceptada por el cliente. Los pagos duplicados se revisan y corrigen.</p>
    </section>

    <section>
      <h2>7. Privacidad</h2>
      <p>Bagelito utiliza los datos de contacto, pedido y delivery para procesar la compra, coordinar producción, atender consultas, prevenir fraude y realizar la entrega. Los datos no se venden a terceros.</p>
      <p>Proveedores necesarios para la operación —como hosting, base de datos, pagos y delivery— pueden procesar la información únicamente para prestar esos servicios.</p>
    </section>

    <section>
      <h2>8. Contacto</h2>
      <p>Para consultas relacionadas con pedidos, pagos, delivery o privacidad, puedes escribir a <a href="mailto:contacto@bagelito.pe">contacto@bagelito.pe</a>.</p>
    </section>

    <footer className="legal-footer">
      <span>Bagelito.pe · Lima, Perú</span>
      <Link to="/">Volver al inicio</Link>
    </footer>
  </main>
}
