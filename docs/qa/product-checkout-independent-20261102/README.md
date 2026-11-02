# Verificación independiente del checkout de productos — 2 noviembre 2026

Resultado: SQL real en memoria, compilación completa, checks Node disponibles,
HTTP cerrado y aislamiento de bundles verificados. Se corrigieron la presentación
comercial en sandbox y los headers del GET interno de disponibilidad. PR47 no se
movió. No es aceptación de venta, Culqi, inventario ni producción.

## Procedencia exacta

Repositorio: `rikrodriguez/bagelito-pe`. Se hizo fetch del SHA completo y checkout
en un worktree detached independiente del productor.

| Revisión | Commit | Tree |
| --- | --- | --- |
| Candidato recibido | `acd85794f8dd9b09072fc00e17c03b24d91b5213` | `b7f4512c8438b84462f0b61d05925fcb34f44467` |
| Presentación sandbox corregida | `53ab8c4e986e4b208a0a97d249448578efa5de0e` | `fecc07f59c54a89571a0c5f39ec671ad15e1b9aa` |
| Código final verificado | `0e3f5be2778f3892661d4260fecc37f740604ce5` | `a307026f6d08daebf61015ce368766713c74a91e` |

El parent del candidato es `f4283fd20c1dfdd4918ce1b0b50fadb2ee578138`, que seguía
siendo el head draft de PR47 al consultar GitHub. La rama candidata independiente
es `codex/guided-product-independent-20261102`. Los commits posteriores al código
final contienen únicamente esta evidencia.

## Correcciones y revisión

1. `sandboxMode=false` es explícito en `GuidedCommerce` y `CulqiBrowserCheckout`.
   Sólo la nueva entrada lo activa. No se construye el enlace de WhatsApp ni se
   renderiza el bloque comercial; caja, botón Culqi, estado cerrado y recuperación
   se identifican como prueba. Las condiciones disabled, handlers, SDK y proveedor
   permanecen intactos. Cinco pruebas ejecutan el JSX real con estado y runtime
   locales; no invocan navegación ni efectos. No se inventó un número de prueba.
2. El GET generado por `createServerFn` no heredaba los headers del documento.
   El handler ahora asigna `Cache-Control: private, no-store, max-age=0` y
   `CDN-Cache-Control: no-store`. Tres pruebas cubren ambos booleanos y el documento;
   HTTP final verifica el endpoint generado y su contenido deserializado.
3. Se actualizó únicamente el comentario antiguo del adaptador que todavía decía
   que sus escrituras no estaban registradas.

Dos revisiones estáticas independientes no encontraron otro defecto funcional
concreto en gates, replay de customer/product/batch, pot, errores ambiguos o retry.
SQL compara composición completa, cliente y dinero; el service conserva batch
original y no aplica `.single()` al JSONB ni reintenta una escritura incierta.
Order/charge revalidan el namespace persistido antes de preparación/proveedor.

`scope-audit.json` demuestra igualdad de `/`, `/playable`, `src/reference`, SQL,
catálogo, proveedor, coordinador, status y `vercel.json` respecto del head anterior
de PR47. `.env.example` es idéntico al candidato recibido. El archivo de despliegue
sigue con `git.deploymentEnabled:false`. No se configuró entorno alguno.

## Resultados ejecutados

| Check | Resultado terminal | Evidencia |
| --- | --- | --- |
| Route → service → SQL real PGlite | **7/7 PASS**, cero skips | `sql-route.log` / `.json` |
| Product-lines SQL previo | **36/36 PASS**, cero skips | `sql-lines.log` / `.json` |
| Node disponible con presentación final | **291/291 PASS**, alcance explícito sin tres drivers HDR | `node-available-final.log` / `.json` |
| Node afectado tras corrección de caché | **34/34 PASS**, incluidos 3 nuevos GET | `node-affected-final.log` / `.json` |
| Typecheck individual | **exit 0** | `typecheck.log` / `.json` |
| Build completo sobre código final | **exit 0**, Vite cliente/SSR/Nitro, tsc y QA | `build-uncached-final.log` / `.json` |
| HTTP cerrado, guard y GET generado | **exit 0**, 12 respuestas comprobadas | `http-smoke-final.log`, `smoke.json` |
| Auditoría de bundles | **8 JS cliente**, ningún marcador privado encontrado | `bundle-audit-final.json` |

Hay **294 casos Node únicos disponibles verificados**: 291 del conjunto explícito
más 3 GET nuevos. Los 31 casos repetidos en la ronda afectada no se vuelven a
sumar. Structural 11, manual 4 y movement 14 pasaron dentro del build; movement
ya está incluido en Node y tampoco se suma de nuevo. Las suites SQL son separadas.

El SQL se ejecutó contra el stack route/service/SQL del candidato recibido; ese
stack no cambió después, salvo el comentario del adaptador. El build final y HTTP
corresponden a `0e3f5be`; las pruebas afectadas ejecutaron los mismos bytes que ese
commit. `results.json` registra alcance/procedencia por ronda. El manifiesto de
salida contiene hashes de 39 bundles compilados; no se publica `.output`.

## Fallos conservados y límite concreto

- La ejecución Node completa se intentó: **exit 1**, 289 casos pasaron y tres
  archivos driver fallaron al iniciar por falta de `QA_HDR_FIXTURE_PATH`:
  `qa-guided-driver`, `qa-loopback-guard`, `qa-world-driver`. No se omitieron
  silenciosamente: `node-full-missing-hdr.log` y `.json` conservan la invocación
  completa y los errores. Fue una ronda anterior a las dos pruebas Culqi y las
  tres pruebas GET adicionales. **No se certifica la suite Node completa.**
- Falta el fixture aprobado con SHA256
  `a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb`.
  No se descargó otro HDR ni se debilitó su checksum. Para completar esos drivers
  hace falta aportar exactamente ese fixture y repetir los tres archivos.
- El smoke inicial salió 1 porque el harness buscaba texto literal `false` en la
  representación Seroval. Su respuesta 200 ya contenía el booleano correcto; la
  inspección de esa respuesta detectó además el defecto real de caché. Se corrigió
  el harness para usar `fromCrossJSON(...,{})` del paquete fijado y exigir headers.
  `smoke-initial.json`, `smoke-server-initial.log`, `http-smoke-initial.log` y el
  HTML inicial se conservan. El smoke final pasó con el defecto corregido.
- Los SIGKILL SQL/build/typecheck y la conexión fallida que reportó el productor
  son históricos de su executor. Este informe no los reetiqueta como PASS. Las
  ejecuciones nuevas, sus salidas y recursos están documentadas por separado.

## Recursos, dependencias y HTTP

Node `v24.19.0`, npm `11.9.0`. Se reconstruyeron los 197 tarballs públicos del
manifiesto ya aprobado: todos verificaron SHA512 antes de extracción y sus SHA256
coinciden con la verificación anterior. PGlite `0.5.12` se reconstruyó desde el
lock SQL y verificó su SHA512. Sin resolución de versiones, `.npmrc`, credenciales,
scripts lifecycle ni dependencias runtime nuevas. Ver `dependency-verification.json`
y `dependency-restore.log`; scripts de reproducción guardados como `.txt`.

Los procesos Node recibieron sólo una allowlist explícita de entorno. Recursos:
`NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=4'`,
`CIRCLE_NODE_TOTAL=1`, `RAYON_NUM_THREADS=1`, `UV_THREADPOOL_SIZE=1`; checks pesados
seriales. PGlite usa WASM fuera del heap V8: RSS máximo observado ~1.07 GiB para
SQL; el build final ~521 MiB. No PostgreSQL externo, Docker ni workaround de socket.

El smoke crea y prueba su propio servidor loopback dentro de un solo proceso
orquestador, con provider manual, mode disabled, intake false, referenceReview true
y productflag false. No hereda credenciales. Bloquea/instrumenta fetch, clientes
http/https y conexiones net del proceso de aplicación: **cero intentos salientes**.
Comprueba documento cerrado/noindex, ausencia del journey/contacto/Culqi DOM o
script remoto, 10 respuestas API 503 de review guard y GET interno 200 con sólo
`enabled:false`. Finaliza el servidor en `finally`; salida 0 y cierre comprobados.
Esto es smoke HTTP del estado cerrado; no es aceptación de navegador/proveedor.

Los 8 bundles JS cliente no contienen configuración privada, nombres de secretos,
gate privado, RPC de escritura ni helper de headers; el stub del GET permanece en
cliente y la implementación en servidor. No se leyeron valores reales para la
auditoría. El estado activo se comprobó sólo con mocks/render de JSX locales.

Persisten los límites comerciales y de aceptación originales: stock de pots por
sabor/gramos sin implementar, precios pendientes bloqueados, política owner-only
default-off, credenciales/esquema aislados y aceptación Culqi/3DS/webhook reales
sin probar. Sin pagos, envíos, gastos, merge ni despliegue.
