# Bagelito — criterios de aceptación del checkout visual S03/S04 → envío (23-nov-2026)

**Ámbito:** únicamente proyecto original **GHL AI Studio/Vibe `1794259044802846738`**, subcuenta `AO82PQzM13CKpSZO2hER`, preview `https://bagelito-tienda.vibepreview.app/`. Este documento es un contrato de QA **PENDIENTE**, no constituye prueba ejecutada ni permiso de publicación. Repos auxiliares ≠ destino. No reconstruir ni reemplazar Golden a partir de este texto.

**Fuentes:** observaciones directas de Ricardo de 22–23 nov, más restricciones Golden aprobadas; homologar siempre contra el Vibe activo y sus referencias. No inferir precio, stock, distrito, impuestos, política de recargos o proveedor de pagos.

## Matriz de pruebas prioritarias (ninguna certificada)

| ID | Flujo / condición inicial | Acción de QA | Resultado esperado, sin efectos secundarios | Estado |
|---|---|---|---|---|
| CHK-01 | Pack elegido, sin schmear | Pulsar «Añadir» en pre-upsell | Abre elección de sabor/tamaño; **no** añade silenciosamente Original ni duplica línea | PENDIENTE EN VIBE |
| CHK-02 | Pre-upsell abierto | Elegir Original y confirmar una vez | Exactamente **1** schmear del sabor/tamaño elegido; total calculado una sola vez | PENDIENTE EN VIBE |
| CHK-03 | Schmear ya elegido en pack o combo | Continuar al siguiente paso | **No** reaparece catálogo obligatorio de schmears; avanza al proceso regular | PENDIENTE EN VIBE |
| CHK-04 | Cliente rechaza pre-upsell | Omitir / continuar | Continúa sin añadir producto, sin forzar sabor Original | PENDIENTE EN VIBE |
| CHK-05 | Regresar de entrega a carrito | Editar o eliminar schmear y avanzar | Se mantiene selección consistente, no se crean cantidades duplicadas | PENDIENTE EN VIBE |
| CHK-06 | Home y sección de selección | Comparar cards del paso con Home | **Mismas imágenes/cards aprobadas** y jerarquía visual; sin tarjetas genéricas sustitutas | PENDIENTE EN VIBE |
| CHK-07 | Cualquier pantalla | Revisar pie, menú y upsell | Eliminar «Novedades» y «Separa tus próximas cajas y ahorra» y evitar repetición de «caja» | PENDIENTE EN VIBE |
| CHK-08 | Checkout con dirección válida | Introducir dirección de entrega | Mapa precargado/centrado desde esa dirección con pin visible editable | PENDIENTE EN VIBE |
| CHK-09 | Mapa precargado | Mover pin a puerta/entrada exacta | Se conserva ubicación ajustada y se muestra CTA «Confirmar ubicación» | PENDIENTE EN VIBE |
| CHK-10 | Dirección escrita pero pin sin confirmar | Intentar continuar | **No permite avanzar**; confirmación explícita de pin obligatoria | PENDIENTE EN VIBE |
| CHK-11 | Dirección y pin confirmados | Volver atrás, modificar dirección | Se invalida confirmación anterior y se solicita confirmar nueva ubicación | PENDIENTE EN VIBE |
| CHK-12 | Desktop 1440×900 y móvil 390×844 | Navegar S01–S04 y envío | Sin scroll horizontal, recortes o CTAs superpuestos; fondos, luces, logos y fotos idénticos a Golden vigente | PENDIENTE EN VIBE |
| CHK-13 | Pedido con fallo red/doble toque | Intentar confirmar dos veces | Una sola intención de pedido / idempotency key; sin cobro ni duplicación hasta certificar persistencia | PENDIENTE EN VIBE |
| CHK-14 | Mapa no geocodifica o dirección incompleta | Intentar continuar | No inventar coordenadas ni marcar dirección confirmada; permitir corregir sin perder carrito | PENDIENTE EN VIBE |

### Reglas visuales que siguen vigentes
- **S01:** fachada aprobada; luz natural blanca, lámparas azules, no amarillos no aprobados. Sin rehacer Golden.
- **S02A/S02B:** Dawn y cards originales; logo **curvado** en fachada/web/mandil y logo **flat exclusivamente** en etiquetas/envases de schmears.
- **S03/S04:** seleccionar sabores sin duplicados; no introducir banners/secciones ya descartadas; mobile sin cortes.
- Botones que aún carezcan de integraciones pueden estar visualmente terminados, pero **el reporte debe indicar funciones no certificadas**, sin mostrar avisos de “no terminado” en la interfaz.

### Condiciones de cierre y evidencia
Para **cada** ID: `requisito → referencia/version Golden → componente/commit dentro del Vibe original → build ID verificado → captura 1440×900 + 390×844 → pasos de prueba → resultado PASS/FAIL → responsable/fecha`.

Estado de una corrección: `preparado`, `integrado en Vibe original`, `publicado` y `verificado en preview` son cuatro comprobaciones diferentes. **Este documento cubre sólo PREPARADO** y no prueba ningún caso de la web. No conectar pagos, pedidos, emails o agentes ni sustituir imágenes Dropbox a partir de esta matriz. Sin merge ni deploy automático.

### Bloqueo actual y acción concreta
El acceso al editor de Vibe original depende del contexto autenticado del navegador; las consultas ClientPortal AI muestran un proyecto distinto y no autorizan modificarlo. En Vibe original: confirmar versión/build activo y ausencia de edición concurrente, exportar **Download Codebase** y **Version History ZIP**, revisar Golden histórico y correcciones 18–23 nov, luego validar CHK-01/02/03 como primer bloque. El mapa y delivery se revisan como un bloque independiente sin condicionar S01–S04 al pago.
