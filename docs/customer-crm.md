# Customer CRM

El CRM de clientes se calcula desde `orders`, `order_items` y `order_status_history`. No crea una tabla nueva de clientes todavia.

## Agrupacion

Los clientes se agrupan por:

1. WhatsApp normalizado.
2. Email normalizado si no hay WhatsApp.
3. ID de pedido como fallback.

Esto permite ver recompra aunque el cliente haya hecho mas de un pedido.

## Metricas

- `Unique customers`: clientes agrupados por contacto.
- `Repeat customers`: clientes con mas de una reserva.
- `Total spent`: suma de pedidos pagados o en estados productivos.
- `Avg customer value`: gasto confirmado promedio por cliente.
- `Last purchase`: fecha de la ultima orden pagada/productiva.
- `Favorite flavors`: sabores mas pedidos por cantidad.
- `District history`: distritos usados por el mismo cliente.

## Donde verlo

- `/admin`: panel `Customer CRM`, con top customers, recompra, gasto total y preferencias.
- `/admin/orders/{CODIGO}`: bloque `Customer history`, con todas las ordenes del cliente y sus sabores.

## Reglas operativas

- Un pedido archivado sigue contando para historial de cliente.
- Un pedido borrado desaparece del historial.
- Pedidos cancelados no cuentan como perfil activo de CRM.
- `Total spent` usa solo estados pagados/productivos: `payment_confirmed`, `in_production`, `ready_for_delivery`, `delivered`.
- Las preferencias de sabor usan pedidos pagados si existen; si el cliente aun no pago, usan sus reservas capturadas.

## Siguiente nivel

Cuando haya mas volumen, conviene crear una tabla `customers` para notas por cliente, etiquetas, consentimiento de marketing, lifetime value historico y merges manuales.
