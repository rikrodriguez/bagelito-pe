# Bagelito: preparación de lanzamiento y límites actuales

Preparado sobre PR47 `bbd149019b249edf4243fb4776c6acff944775be`, para la venta
prevista a partir del 4 de noviembre. **La vía preparada es consulta humana por
WhatsApp; el catálogo completo todavía no tiene un carril de cobro productivo.**
Este lote actualiza código/documentación del borrador. No publica la tienda,
habilita el origen real, crea pedidos, manda mensajes ni activa pagos.

## Defectos demostrados y corregidos

1. Entrar por “6 mixtos” y elegir seis Plain generaba un mensaje “mixto”, aunque
   la cotización canónica clasifica esa composición como un sabor. La descripción
   compartida ahora deriva la mezcla de los sabores realmente seleccionados:
   WhatsApp, cajero y carrito coinciden. No se cambió ninguna regla ni importe.
2. El carrito de un pote de 240 g omitía sus gramos, y los resúmenes no permitían
   distinguir un pack mini de uno grande con las mismas cantidades. Carrito y
   cajero ahora conservan formato, cantidad/composición y gramos seleccionados.
   Cambiar de categoría/formato o retirar el extra limpia el detalle anterior.
3. Se aclaró un comentario que llamaba “aprobado” al journey visual 2+1 como
   sustitución de bundles históricos. El runtime conserva `review_required` y
   precio `null`; no se añadió SKU ni se importó un precio de otra composición.

No se tocó la máquina de estados de Culqi, su SQL, gates, inventario, catálogo,
tarifas, políticas, credenciales ni el formato de las líneas de pedido cobrables.

## Qué precios están respaldados y qué ve el cliente

| Referencia en PEN | Un sabor / mixto, u original / saborizado | Tratamiento actual |
|---|---:|---|
| Grande 6 | 50 / 60 | Base publicada; premium necesita regla/confirmación |
| Grande 12 | 100 / 115 | Igual limitación de premium |
| Mini 6 | 20 / 25 | Hay base publicada; compatibilidad/stock de sabores sin certificar |
| Mini 12 | 35 / 40 | Igual limitación de minis |
| Mini 24 | 70 / 75 | Igual limitación de minis |
| Pote 120 g | 12 / 16 | Confirmación del titular del 2 noviembre |
| Pote 180 g | 18 / 23 | Confirmación del titular del 2 noviembre |
| Pote 240 g | 22 / 29 | Confirmación del titular del 2 noviembre |
| Journey 2 bagels + 1 schmear | Sin precio confirmado | Solo consulta; no asignar precio histórico |

Fuentes: `src/domain/data/verified-menu-2026-10-21.json`, menú de referencia
fechado 14 de octubre, y su confirmación de potes del 2 de noviembre. La tabla
no certifica disponibilidad actual ni autoriza cobros. Los minis **no están sin
precio base**: lo pendiente son reglas/compatibilidad/stock para vender la
selección concreta. No se infiere inclusión premium ni precio de extras 2/8.

En `/consulta`, los precios de potes aparecen en el selector de tamaño y los del
extra de 120 g en sus tarjetas. El combo dice “Precio por confirmar”; packs y
carrito no inventan un total. El mensaje solicita a Bagelito disponibilidad,
precio final, delivery y fecha, y advierte que no confirma ni paga el pedido.

Los bundles históricos 6+1, 12+2 y 6+3 a 74/140/99 no son precios del 2+1.
Hay que reconciliar la oferta que Ricardo quiere vender. Tampoco se aplican
upgrades de alcance ambiguo ni la promoción Halloween como tarifa ordinaria.
La auditoría detallada de fuentes está en `pricing-audit.md`.

## Qué necesita Ricardo para vender con seguridad

| Vía | Estado del candidato | Falta antes de prometer venta |
|---|---|---|
| Consulta WhatsApp | Preparada y probada localmente; cerrada por defecto | Aprobar/publicar este candidato y habilitar solo `/consulta` en su origen HTTPS exacto; verificar atención del contacto y cerrar cada propuesta comercial humanamente |
| Cobro Culqi del catálogo completo | Solo sandbox y no productivo por diseño | Carril live explícito revisado, esquema/stock compatibles y aceptación real del mismo comercio antes de activar |

Para **consulta humana**, los pendientes concretos son:

1. Elegir y aprobar el commit/origen a publicar. Configurar únicamente el flag de
   consulta y `BAGELITO_MANUAL_INQUIRY_ORIGIN` para ese HTTPS exacto. Mantener los
   gates financieros cerrados. La URL que se comparte es `/consulta`: `/` y
   `/playable` siguen siendo revisión. La configuración remota no se cambió aquí.
2. Confirmar oferta y stock por sabor, formato y gramos, precio/composición final,
   capacidad, costo de delivery y fecha que realmente puede cumplir. El menú
   histórico no demuestra entrega mañana. Resolver o no comprometer 2+1,
   premium/minis y upgrades que aún necesiten decisión comercial.
3. Verificar que el contacto está atendido y el mensaje llega en el dispositivo
   real; este lote solo inspecciona el enlace. Acordar con el cliente precio,
   entrega y cómo se verifica el pago antes de aceptar/despachar. La consulta no
   reserva cupo ni representa un pedido pagado. No se probó ese cierre humano.

Para **Culqi automático** sigue pendiente:

- `payment-config.server.ts` bloquea `guided-v1` en live/producción, incluso al
  preparar/cobrar una reserva ya persistida. No basta mover flags. El puente
  completo y la persistencia propuesta sí existen en el candidato sandbox;
  documentos históricos que decían que faltaban no describen el HEAD actual.
- Verificar el esquema realmente instalado, RPC/ACL/triggers, webhook, expiry,
  capacidad y política de productos. No reaplicar fixtures ni suponer que algo
  está ausente por no haberlo inspeccionado. Falta stock de potes por sabor/gramos.
- Configuración test coherente del mismo comercio y pruebas reales autorizadas
  de tarjeta, 3DS, Yape, webhook HTTP, rechazo, vencimiento, pérdida de respuesta,
  duplicados y pago tardío; además contención con sesiones independientes.
- Definir y probar operación de reembolsos: el webhook actual devuelve 501 para
  refund/revisión y no sincroniza ese estado automáticamente. También cerrar
  recuperación tras fallo: un nuevo checkout no garantiza liberación inmediata
  del cupo anterior ni evita por sí solo una reconciliación de pago tardío.
- Release/cutover productivo revisado y su validación. La **aprobación comercial
  de Culqi ya fue obtenida**; no se vuelve a pedir como un pendiente del titular.

Llaves actuales, runtime y versión efectivamente servida **no se comprobaron**
en este lote. No se declaran ausentes a partir de inventarios antiguos.
`culqi-audit.md` detalla las rutas/limitaciones observadas en código.

## Verificación de este lote

- Baseline de las regresiones: 26 recorridos, 18 pass y **8 fallos demostrados**
  por mezcla, gramos e identidad de pack, conservados en `selection-red.log`.
- **55/55 focalizadas** y **361/361 Node ejecutadas** aprobaron, cero fallos/skips.
  Las focalizadas están incluidas. Tres archivos de herramientas HDR y sus 25
  casos siguen sin ejecutar por faltar el fixture aprobado; no se sustituyó.
- **Build/TypeScript PASS**, exit 0. QA estructural, fallback y movimiento son
  subconjuntos, no pruebas adicionales sumadas al total Node.
- Auditoría adicional: **26/26 transiciones normales** con handlers reales,
  sin `forceScene` ni mutación de estado. Cubre edición, cantidades, cambios de
  formato/categoría/tamaño, reemplazo y retirada. Es cobertura solapada, no nuevos
  casos añadidos al total Node (`selection-transition-audit.json`).
- **34 capturas de Chromium** en 390/1280 px: 22 canónicas de closed/enabled y
  12 complementarias sobre mezcla normalizada, carrito mini24+120, precios de
  potes, carrito 240, limpieza de categoría y sandbox cerrado. Ambas suites
  aprobaron sin errores de página/HTTP/rutas, tráfico prohibido ni overflow.
- Servidores solo en loopback, sin credenciales, con review/merchant review en
  true y `CULQI_ENABLED=false`. Service workers, API, mutaciones, redirecciones,
  WebSockets y orígenes externos están bloqueados; nunca se pulsa WhatsApp.
  Se usan Playwright 1.64.1 y Chromium 151 del sistema con el preload ya descrito
  en la QA anterior; no se repitió la descarga que había respondido 403.

Capturas y resúmenes en `closed/`, `enabled/`, `supplemental/` y `gallery.html`.
Los logs se conservan en bruto, con espacios/ANSI del empaquetador. Fuentes y
pruebas pasan whitespace. No se cambiaron manifests ni lockfiles.

No se certifican otros navegadores, dispositivos reales, foco/accesibilidad
completos, StrictMode, envío de WhatsApp ni fidelidad exacta de layout. La
referencia disponible es una portada desktop, no un cajero/carrito o móvil
aprobados. Las pruebas locales y PGlite históricos no prueban aceptación real
del proveedor, locks multisesión ni operación productiva.

Sin fusión, despliegue, cambio de credenciales/entorno remoto, migración, mensaje,
pedido o cobro. `vercel.json` conserva `git.deploymentEnabled=false`. La entrega
autorizada se limita al PR en borrador, tras revisar que su HEAD no cambió.
