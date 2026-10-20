# Webhook Culqi: procedencia y límites de la evidencia

**Actualización de desarrollo:** se preparó [instrumentación privada](culqi-webhook-instrumentation-review.md), todavía sin desplegar ni recibir un reenvío. La comparación de cinco fuentes y sus logs de abajo sigue siendo histórica: se limita a los SHA indicados, anteriores al nuevo diagnóstico.

Esta revisión parte de PR13 en `a42d18c711a49b734947e66105c19843b4541685`. No cambia código de aplicación, autenticación, políticas de pago, SQL, credenciales, configuración ni despliegues. Las capturas aportadas confirman tres entregas webhook con HTTP 500; falta el resultado primario que sustente el upstream 400 descrito anteriormente.

## Lo confirmado y su alcance

| Fuente | Lo que aporta | Límite |
| --- | --- | --- |
| Lista de API Logs del titular, 15–20 de octubre, sin filtro seleccionado, «1–3 de 3» | Token: 201 a las 22:50:04–05; cargo: 201 a las 22:50:06–10; consulta de cargo: 200 a las 22:50:12 del 15 de octubre | No muestra un 400; tampoco prueba ausencia global de peticiones que esa vista no registre |
| Historial del webhook aportado | Tres entregas `charge.creation.succeeded` a las 22:50:11–13, destino canónico y HTTP 500 con respuesta genérica de Bagelito | El recurso mostrado como Request es charge/camelCase; todavía no acredita el body HTTP íntegro ni la forma exterior |
| Detalle de creación y consulta del cargo | Importe 12300/PEN, `capture=true` y metadata del pedido concordantes; el GET usa snake_case y `paid=false` | No acredita aplicación del webhook ni permite confiar en los campos entrantes para liquidar |
| Auditoría del hosting | Despliegue de `80233bc` al alias canónico y asignación de un alias al mismo deployment antes de las entregas | No sustituye el registro de cada petición ni una huella del bundle ejecutado |
| Build histórico | Clon de `80233bc`, compilación terminada y ruta `/api/webhooks/culqi` presente | El árbol de archivos devuelve 404; no se recuperó el binario histórico |

Las horas del panel son las proporcionadas para Lima. El 15 de octubre a las 22:50 corresponde al 16 a las 03:50 UTC. No se requieren más búsquedas del titular en ese panel, otro cargo ni otro token.

## Alias, build y código

El historial del proyecto para `2026-10-16T03:30:00Z`–`04:00:00Z` devolvió dos eventos:

- `deployment`, 03:40:43.184 UTC: `80233bc` de la rama original hacia el alias canónico.
- `aliases-assigned`, 03:41:26.054 UTC: un alias asignado a `dpl_AmdeKBgt8WqDBfcJm41GWu4ksR4U`.

El build clonó el commit `80233bc`, terminó a las 03:41:20.765 y completó el despliegue a las 03:41:26.015. El alias actual referencia `dpl_9RoAm1RKYe364jSV1iGbrwQf4MZS`, SHA `d45c71c`, con actualización posterior del 17 de octubre. El estado actual no es una instantánea histórica.

[Extractos y metadatos saneados](evidence/culqi-webhook-shape/hosting.json) conservan la relación build/asignación. La lectura del árbol histórico falló con `404 not_found: File tree not found`; no devolvió identificadores de archivos y no se intentó otra ruta al binario. No se usaron ni publicaron bypasses o valores secretos.

## Procedencia del upstream 400

La primera afirmación versionada hallada es `b86bc62a129a3bbcfb70844b4eb5e7a995a7e09a`, del 16 de octubre a las 18:07 UTC, en [el checkpoint](culqi-webhook-confirmation-checkpoint.md). No adjunta el resultado primario, request ID o deployment ID de las tres ejecuciones atribuidas a `event_lookup/400/parameter_error`. Las otras coincidencias locales son copias del informe o fixtures.

La búsqueda de contexto anterior respondió «Personal context is unavailable for this conversation». La consulta privada de la tarea pertinente devolvió `last_run=null`, `latest_result=null` y entrega desconocida. Estos resultados no prueban que la tarea no se ejecutara: sólo impiden recuperar su contenido por las herramientas expuestas. No se leyeron directorios de sesiones, cookies o credenciales.

El JSON de la consulta histórica de Runtime Logs de Vercel conserva otro 400: `bad_request` por retención del plan. No contiene aquellas tres ejecuciones y no es una respuesta de Culqi. No se repitió la consulta con la misma retención ni se cambió el plan.

El supuesto upstream 400 se conserva como **atribución histórica secundaria sin el original recuperado**. No se declara falso o fabricado: pudo quedar únicamente en el resultado original de herramienta del hilo. Sigue faltando una vinculación primaria entre petición, cuerpo exterior, estado upstream y deployment.

## Comparación reproducible, sin proveedor

Los cinco handlers cotejados —`4254fe3`, `c462ec8`, `80233bc`, `d45c71c` y `a42d18c`— son idénticos, SHA-256 `1e1e4502645b91956cc32381773a9222f3e9e34fe85e15e4821120a02a7437ee`. Los [veinte casos](evidence/culqi-webhook-shape/comparison.tap) comparan:

1. Cargo directo camelCase y snake_case: HTTP 400 en `request/invalid_event_id`, sin consultar Eventos ni DB.
2. Referencia evt sintética: se utiliza sólo el recurso devuelto por la consulta independiente simulada, ignorando los campos del solicitante.
3. Referencia evt sintética con API 400: HTTP 500 en `event_lookup`, sin DB.

El [probe](evidence/culqi-webhook-shape/probe.mjs) comprueba los hashes del handler y del helper de verificación para [cada SHA](evidence/culqi-webhook-shape/versions.json), usa sólo módulos de Node 24 y Git local, y no instala dependencias ni consulta al proveedor:

```sh
node --test --test-reporter=tap docs/evidence/culqi-webhook-shape/probe.mjs
```

Requiere que los cinco objetos Git ya estén disponibles localmente; su ausencia es un fallo de preparación, no se omite ni se convierte en éxito. Transportes y RPC están sustituidos: los casos no prueban SQL, recepción real ni aceptación de Culqi.

Por tanto, no se reproduce `chr → GET /events` en las fuentes cotejadas. La [guía oficial de Webhooks](https://docs.culqi.com/es/documentacion/pagos-online/webhooks/) no especifica el esquema HTTP completo; el SDK distingue recursos Event y Charge, pero eso no demuestra la envoltura de esta entrega. No se exige un evt ausente ni se convierte un chr en un evento inventado.

## Siguiente paso

El [plan mínimo para aprobación futura](culqi-webhook-future-validation-plan.md) separa instrumentación privada de una eventual entrega existente. No despliega PR13 completo, no instala SQL y no relaja controles para obtener un 200. Su objetivo es vincular artefacto, forma exterior, recurso consultado y resultado en una misma invocación.

Despliegue y eventual único reenvío siguen siendo decisiones futuras independientes. La autorización vigente de desarrollo y PR permite preparar el diff y sus pruebas; este documento no ejecuta ninguna de esas acciones operativas.
