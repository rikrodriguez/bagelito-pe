# Bagelito — checklist operativo de lanzamiento (30 octubre 2026)

**Objetivo:** lanzar la experiencia de tienda guiada visualmente aprobada, sin simular pedidos ni cobros, aunque Culqi todavía esté en integración.

**Rama candidata:** `feat/guided-playable-commerce-v1-20261028` — PR #38.
**Producción:** `https://bagelito.pe`. No promover la rama por el mero hecho de que Vercel marque READY; revisar el commit exacto y las capturas.

## Recorrido obligatorio

1. Entrada limpia: sin avatar, controles de videojuego ni eslóganes descartados.
2. Tótem / selector `Packs / Combos / Schmears`: cards blancas/azules redondeadas, menú circular y pedido.
3. Packs: `Grandes / Minis`, `Mixto / Un sabor`, cantidad y ocho sabores correctos.
4. Combos: **2 bagels + 1 schmear**; no mostrar sandwiches, bebidas ni importes históricos.
5. Vitrina: ocho etiquetas **azules con letras blancas**, orden real de la vitrina, producto visible y clicable.
6. Schmears: cinco sabores, configuración editable y opción de retirar un schmear.
7. Caja: resumen real de sabores y cantidades; precios exclusivamente validados por servidor. Si el servidor no puede cobrar, mostrar consulta por WhatsApp como CTA principal.
8. Pago: únicamente abrir Culqi cuando esté configurado, con batch de delivery y producto autorizado. No avanzar a recibo sin estado `paid` confirmado.
9. Recibo, Wallet, bolsa, salida y cliente recurrente: datos reales. Wallet real no implementado => botones deshabilitados; el recorrido visual de QA se distingue de una compra.
10. Explorar 3D: siete estaciones (tótem, vitrina, bagels, schmears, producción, caja, pickup). El producto lleva al funnel real correspondiente; no inventar pedido.
11. Móvil: sin recortes, scroll horizontal, bloqueos por NPC, ni botones fuera de alcance. Si falla WebGL, permitir abrir el guided commerce.

## Modo de lanzamiento sin Culqi

- El shopper puede configurar y **consultar** por WhatsApp desde caja; mensaje prellenado con sabores reales y sin PII.
- El WhatsApp público en el sitio previo: `+51 917 547 745` (`https://wa.me/51917547745`). Confirmar operativamente que ese número sigue atendiendo antes de publicar.
- La consulta no reserva capacidad, no define entrega, no confirma precio y **no cobra**.
- En Vercel producción mantener `PAYMENT_PROVIDER=manual`, `CULQI_ENABLED=false`, `BAGELITO_MERCHANT_REVIEW_ONLY=true` hasta aprobar el checkout real.
- **No usar** `BAGELITO_VISUAL_QA_ENABLED=true` en producción. El bypass `?qa=1` debe quedar imposible allí.
- Sólo después de revisar y aprobar el contenido público, configurar `VITE_BAGELITO_PUBLIC_SITE=true` en producción para permitir SEO/indexación. Los previews continúan `noindex,nofollow`.

## QA previo a aprobar producción

- Vercel READY del **mismo commit** a liberar y log `vite build && tsc --noEmit` con salida correcta.
- `npm run qa:static` (estructura 3D y fallback).
- `npm run qa:launch` (enlaces y mensajes sin falsear cobros).
- `npm run qa:guided` con Playwright en 1280×800 y 390×844.
- `npm run qa:3d` con WebGL en ambas resoluciones; capturas de las siete cámaras y prueba de errores JS/red.
- Comprobación visual de golden masters **uno por uno**, no sólo clics exitosos.
- Probar consulta completa desde Packs, Combos y Schmears; verificar texto prellenado en WhatsApp; **no enviar mensajes de prueba a clientes**.
- Verificar manualmente un pedido de extremo a extremo en iPhone/Safari y Chrome/Android.
- Verificar header/logo, velocidad de carga, enlace legal, accesibilidad con teclado y ausencia de scroll lateral.
- Ante un bloqueo visual crítico: mantener el sitio anterior, no promover la PR. El cambio de producción requiere aprobación explícita.

## Culqi posterior — carril separado

Comercio aprobado por email, pero aún faltan credenciales de prueba, sandbox E2E con 3DS/webhooks, fecha real de batch, reglas de precio/persistencia para minis/combos/schmears y evidencia legal versionada. Los gates financieros continúan en `docs/guided-commerce-release-gates-20261028.md`.

**Estado:** candidato de recorrido e inquiry, **no** tienda con pagos automáticos activados.
