# Bagelito — Golden-master QA y release gates (28 Oct 2026)

## Criterio de aprobación

**No aprobar por build verde únicamente.** La experiencia tiene que combinar fidelidad al Bagelito aprobado, navegación guiada sin obstáculos y checkout confiable. Este informe distingue **verificado**, **corregido pendiente de retest** y **no aprobado**.

Referencia de código: PR #38, `feat/guided-playable-commerce-v1-20261028`.

## Verificación de seguimiento — 28 octubre 2026, última rama

- **Deploy Vercel READY** del HEAD `ec019e1267391a1ba467b89bfd4e70235352d6d4` en preview. Confirma compilación/despliegue, **no** prueba que las 13 escenas pasen golden-master visual ni que Culqi pueda cobrar.
- Implementados en la rama: rótulos azules con texto blanco para ocho bagels en vista guiada y placas 3D, header de menú circular + holder real de pedido, tarjetas blanco/azul, progreso tipo píldora y transiciones con movimiento reducido cuando corresponde.
- **QA visual E2E del HEAD exacto aún pendiente**; los screenshots automáticos documentados anteriormente corresponden a versiones previas.
- **Batch real:** `Next Bagelito Batch` (20 packs / 220 bagels) continúa con `delivery_date = null`; el batch de revisión es visible pero no está habilitado para cobrar.
- **Migración legal:** la tabla `orders` sigue sin `checkout_legal_version` ni `checkout_legal_accepted_at`; solo tiene `terms_accepted`.
- **Vercel preview:** sigue configurado `PAYMENT_PROVIDER=manual`, `CULQI_ENABLED=false` y `BAGELITO_MERCHANT_REVIEW_ONLY=true` para la rama. No convertir un preview QA visual en checkout con dinero.
- **Reglas comerciales pendientes:** precio del combo 2 bagels + schmear, compatibilidad/sabores de minis, recargos de premium, schmears adicionales, standalone y cross-sells. Solo las reglas publicadas de grandes regulares **sin extras** están cotizables en el contrato actual una vez que haya batch real.
- **Prioridad siguiente:** screenshot diff del último build en desktop, móvil y cámara 3D real; luego QA de Culqi sandbox + 3DS/webhook/doble cobro, migración legal revisada, fecha de delivery y decisión de producción.

## Evidencia de QA ejecutada

- Chromium automatizado: **32 capturas** correspondientes a 16 estados en desktop 1280×800 y móvil 390×844. Navegación y clics correctos en la pasada anterior.
- Sin errores de consola ni overflow horizontal en esas dos resoluciones durante la pasada anterior.
- `npm run typecheck` (cliente, SSR, Nitro y TS) pasó en Node 24 hasta el commit `71503384` y de nuevo después de las correcciones 3D (`97f5bfc`).
- Posteriormente apareció un falso positivo de carga asíncrona de `bag-handoff.webp` al abrir la escena. Se añadió `image.decode()` al test y precarga de la siguiente imagen.
- **Retest final no ejecutado** tras esos últimos cambios por agotarse la cuota de Vercel Sandbox Hobby. El proveedor informó reset: 2026-11-01T00:00:00Z. No afirmar que el HEAD actual pasó el nuevo test.
- El screenshot aislado de `/playable` mostró WebGL activo y ningún error JS en la pasada previa; no constituye prueba de paridad pixel a pixel con el master aprobado.

## Golden-master matrix

| Escena | Cambio aplicado | Validación | Estado |
| --- | --- | --- | --- |
| 1 Entrada | Reemplazo del storyboard con avatar/HUD por `store-entry-door.webp` sin avatar | Captura desktop/móvil previa | Corregida; comparación fina de mockup pendiente |
| 2 Tótem | Selector vivo de Packs/Combos/Schmears sobre ambiente Bagelito | Recorrido desktop/móvil | Funcional; similitud fina pendiente |
| 3 Packs | Dos pasos Grandes/Minis → cantidad 6/12 o 6/12/24 | Recorrido de grandes; selector mini visible | Minis sin checkout transaccional |
| 4 Combos | 2 bagels + 1 schmear, sin sandwich ni bebida | Selector visible | Precio actual no aprobado; no cobrar |
| 5 Bagels | 8 fotografías y etiquetas móviles; desktop usa ahora showcase limpio, no contador 4/6 / +1 incrustado | Captura móvil anterior; orden de bandejas verificado manualmente | Última sustitución y ajuste de hotspots requieren retest |
| 6 Schmears | 5 sabores de la vitrina real; tarjetas táctiles en móvil | Captura + navegación previas | Funcional; checkout standalone bloqueado |
| 7 Caja | Orden vivo + cotización autoritativa del servidor | Escena QA previa | No confundir subtotal con total de delivery |
| 8 Culqi | Custom Checkout + token/fingerprint/3DS, endpoints de preparación/cobro/estado | Build y smoke fail-closed previos | No aprobado para cobranza real |
| 9 Recibo | Datos vivos, sin folio ni monto falsos; drag/tap/teclado | Click QA anterior | Drag mejorado, retest pendiente |
| 10 Club/Wallet | Pantalla dinámica sin puntos inventados; Wallet real deshabilitado | Captura QA previa | Pass real pendiente |
| 11 Entrega | Bolsa en escena, sin promesa de delivery inmediato en live | Recorrido previo; precarga añadida | Retest de transición pendiente |
| 12 Salida | Imagen exterior limpia y CTA vivo; no avatar/HUD anterior | Captura desktop/móvil previa | Funcional; comparación fina pendiente |
| 13 Recurrente/NPC/Rappi/producción | Ruta 3D `/playable`, personal articulado, Rappi lateral, materiales de caja/arquitectura | Canvas real renderizado, sin errores JS | **No aprobado visual 10/10** frente al mockup |

## Contrato producto y pricing

- Orden fotográfico en desktop, **no confundir con orden del JSON**: Plain, Everything, Sesame, Classic Onion, Jalapeño Cheddar, Cheddar, Cinnamon Raisin, Blueberry.
- Orden de schmears: Whipped Original, Ají Amarillo, Herb & Roasted Garlic, Honey Cinnamon, Classic Strawberry.
- Se añadió aserción Playwright para bloquear una futura desalineación entre etiquetas y zonas clicables.
- Los precios históricos de combos de 6/12 bagels **no aplican** al combo nuevo de dos bagels y schmear.
- No extrapolar precio de combos, premium dentro de packs ni cobro standalone de schmears sin reglas comerciales/persistencia aprobadas.

## Bloqueos reales antes de decir “completo”

1. **Fidelidad visual 3D:** arquitectura y personajes todavía requieren paridad objetiva contra los masters aprobados; el cliente percibe una mezcla de fotomontaje guiado y mundo 3D simplificado.
2. **QA de HEAD exacto:** repetir `npm run typecheck` + `npm run qa:guided` con navegador real en varias resoluciones después de los últimos cambios y revisar diferencias de capturas.
3. **Vercel:** previews bloqueados por cuota Hobby. No utilizar el dominio productivo para QA.
4. **Culqi:** ejecutar sandbox real end-to-end, verificar webhook autenticado, 3DS, reconciliación y no doble cobro; `BAGELITO_MERCHANT_REVIEW_ONLY` sigue siendo un kill switch.
5. **Legal:** revisar/aplicar migración de aceptación versionada con rollout controlado; no modificar producción antes de tener flujo verificado.
6. **Batch:** exige fecha de delivery real; el batch de revisión existente no es cobrable.
7. **Wallet:** implementación real requiere certificados/identificadores de proveedor, no reemplazarlos con un botón simulado.
8. **Ofertas:** validar importes/reglas vigentes del combo nuevo, minis, premium y cross-sells; persistir las líneas permitidas antes de activarlas.

## Comandos reproducibles

```bash
npm install --no-audit --no-fund
npm run typecheck
npm install --no-save --no-audit --no-fund playwright@1.56.1
npx playwright install chromium
BAGELITO_VISUAL_QA_ENABLED=true VERCEL_ENV=preview PAYMENT_PROVIDER=manual CULQI_ENABLED=false BAGELITO_MERCHANT_REVIEW_ONLY=true npm run preview -- --host 127.0.0.1 --port 4173
BASE_URL=http://127.0.0.1:4173 npm run qa:guided
```

**Estado de esta PR: NO APROBADA PARA PRODUCCIÓN.** No enviar un preview como “listo 100%” hasta eliminar bloqueos y firmar visual QA.
