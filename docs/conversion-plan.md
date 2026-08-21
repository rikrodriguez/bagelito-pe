# Plan de conversión de Bagelito

## Implementado

- Franja de confianza con total claro, confirmación de pago, producción por reserva y delivery programado.
- Precio por bagel para facilitar la comparación entre packs.
- Upsell contextual de 6 a 12 bagels antes de elegir sabores.
- Actividad reciente basada únicamente en pedidos realmente pagados.
- Intervalos irregulares para los avisos de actividad y opción para ocultarlos.
- Los avisos desaparecen durante los pasos de pago y revisión para no distraer el cierre.
- Textos de conversión revisados en español e inglés.
- Eliminación de testimonios de muestra que no podían acreditarse como experiencias reales.

## Reglas de integridad

- No fabricar nombres, compras, capacidad, temporizadores ni testimonios.
- La actividad pública no expone nombre, dirección, teléfono ni email del cliente.
- Para mostrar el primer nombre se debe obtener autorización específica y registrable del cliente.
- Los testimonios deben proceder de una compra real y contar con permiso para publicarse.
- La urgencia debe provenir de la fecha y capacidad reales del batch.

## Próximas tácticas recomendadas

### Orden de prioridad

1. Medir conversión por paso del checkout y aceptación del upsell 6 → 12.
2. Incorporar 3–5 testimonios reales, cortos y autorizados, idealmente con foto del pedido.
3. Definir uno o dos add-ons operativamente simples, por ejemplo cream cheese, antes de construir un order bump.
4. Probar el add-on como oferta pasiva en selección de pack o en confirmación; no como paso obligatorio.
5. Agregar recompra del próximo batch desde la página de seguimiento o confirmación.
6. Probar un programa de referidos después de contar con dos o tres batches medidos.

### Qué no implementar todavía

- `Frequently bought together`: Bagelito todavía no tiene un catálogo complementario suficiente.
- Downsell emergente: ya existe el pack de 6 como alternativa visible; interrumpir al usuario con otro modal añadiría fricción.
- Múltiples order bumps: distraerían del objetivo principal y complicarían producción y delivery.
- Descuentos genéricos: erosionan margen y posicionamiento premium sin demostrar incremento neto de utilidad.

## Medición mínima

- Inicio de reserva.
- Avance y abandono por paso.
- Pack seleccionado.
- Upsell mostrado y aceptado.
- Checkout Culqi abierto.
- Pago enviado.
- Pago confirmado por webhook.
- Conversión por pack, distrito, dispositivo e idioma.
- Ticket promedio antes y después del upsell.

## Evidencia utilizada

- [Baymard: checkout usability](https://baymard.com/research/checkout-usability)
- [Baymard: cross-sells relevantes](https://baymard.com/blog/product-recommendations-cart)
- [Baymard: seguridad percibida durante el pago](https://baymard.com/blog/perceived-security-of-payment-form)
- [FTC: actividad y social proof falsos como dark patterns](https://search.ftc.gov/system/files/ftc_gov/pdf/P214800%20Dark%20Patterns%20Report%209.14.2022%20-%20FINAL.pdf)
- [Autoridad peruana: Reglamento de Protección de Datos Personales](https://www.gob.pe/institucion/anpd/campa%C3%B1as/128319-nuevo-reglamento-de-proteccion-de-datos-personales)
