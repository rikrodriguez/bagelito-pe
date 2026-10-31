# PR38: fiabilidad del Canvas y de los taps del recorrido

Fecha: 31 de octubre de 2026. Base inmutable: `c2f2990fec146bf27fbf84867cb424eedc2e6417`. Rama de corrección: `fix/guided-tour-canvas-visible-20261031`.

Esta revisión corrige dos defectos de presentación/interacción de `/playable` y añade evidencia local reproducible. No activa pagos, no despliega la aplicación y no cambia el contrato comercial. Sobre la última fuente, el test nuevo de Canvas terminó con 16/16 comprobaciones y la QA guiada con 32/32. **La suite QA3D sigue fallando en strafe de 480 ms: exit 1, un fallo. El conjunto no está completamente aprobado.**

## Problemas reproducidos y corrección

### Canvas oculto al iniciar la visita

La regla `.guided-mode canvas, ... { opacity: 0; pointer-events: none !important }` ocultaba el Canvas cuando el recorrido añadía `guided-mode` al contenedor. La cámara continuaba moviéndose, pero el mundo WebGL dejaba de verse.

El probe de la base, con el HDR correcto servido mediante fixture, midió un Canvas de 1280×800 y `opacity: 1` antes de la visita; al llegar al tótem, el mismo Canvas tenía `opacity: 0`. No era una conclusión basada sólo en la captura ni un fallo de descarga de la iluminación.

La corrección elimina únicamente `canvas` de esa lista CSS. Los controles de exploración que ya se ocultaban durante la visita conservan su comportamiento. El test nuevo comprueba Canvas y ancestros visibles, dimensiones no vacías y un contexto WebGL activo con drawing buffer válido.

### Coordenadas equivocadas al tocar un producto físico

Con el Canvas ya visible, el test recorrió los siete nodos en desktop y mobile: 14 comprobaciones de visibilidad pasaron, pero los dos taps físicos no abrieron la selección de pack.

Un diagnóstico del tap desktop confirmó la diferencia entre las coordenadas del viewport y las del `DIV` transformado de Drei:

| Medida | X | Y |
| --- | --- | --- |
| `event.client` | 245,98 | 297,06 |
| `event.offset` | 18,98 | 17,96 |
| Origen del rectángulo del Canvas | 0 | 0 |

El Canvas ocupaba 1280×800. Usar el offset del descendiente transformado para calcular el rayo no representaba el punto tocado en ese Canvas. La corrección usa la prop pública de React Three Fiber `eventPrefix="client"`. El contenedor continúa fijo a todo el viewport; no se introducen raycasters privados ni cambios de cámara o estética.

Una ejecución posterior confirmó los 14 nodos visibles y el handoff físico desktop. Su fallo mobile tenía otra causa en el driver: `.first()` elegía Plain fuera de pantalla. El probe midió `x=-242,19`, centro `x=-220,69`, `elementFromPoint=null` y un Canvas visible de 390×844 con origen 0,0. Ese resultado no demuestra que un tap visible siguiera fallando.

El driver nuevo exige un hotspot de producto completamente dentro del viewport y toca sus coordenadas reales. Mantiene la misma exigencia: abrir `data-scene="pack-size"` y desmontar deliberadamente el Canvas para entrar al flujo guiado real; no sustituye el tap por un CTA del overlay.

## Qué se está mostrando

- `/` es el funnel real de componentes DOM y escenas WebP. No se presenta como un funnel íntegramente 3D.
- `/playable` monta un Canvas real: ocho fotografías individuales de bagels sobre planos, cinco bowls de schmears con geometría y NPC procedurales. No son ocho modelos volumétricos de bagels ni una equivalencia demostrada con un mockup.
- En mobile el encuadre del mundo puede dejar productos físicos fuera del viewport. La prueba toca uno visible; no cambia ni acredita un rediseño de cámara. El funnel móvil conserva sus ocho tarjetas de bagels comprobadas por la QA guiada.

`src/server`, `src/domain`, las rutas públicas, `GuidedCommerce` y los módulos de Culqi quedan fuera del arreglo. `vercel.json` deshabilita globalmente el autodeploy con `git.deploymentEnabled: false`. No hubo cobros, migraciones, cambios de credenciales, merge ni despliegue por esta revisión.

## Evidencia y estado de ejecución

La tabla distingue los artefactos temporales de investigación de los resultados finales incorporados bajo `docs/qa/pr38-tour-20261031/`.

| Etapa | Resultado observado | Artefacto local |
| --- | --- | --- |
| Base PR38 | Canvas pasa de opacidad 1 a 0 durante la visita; con HDR bloqueado se muestra el fallback | `/tmp/bagelito-pr38-qa/baseline-canvas-probe.json` |
| Test nuevo antes del arreglo | Dos fallos, desktop/mobile, en visibilidad del Canvas del tótem | `/tmp/bagelito-pr38-visibility-red/visibility-results.json` |
| Sólo CSS corregido | 14 nodos visibles; dos fallos del handoff físico | `/tmp/bagelito-pr38-visibility-green/visibility-results.json` |
| Diagnóstico de coordenadas | Client ≈246,297 frente a offset ≈19,18 | `/tmp/bagelito-pr38-qa/physical-hit-before.json` |
| Prefix client, driver original | 14 nodos y handoff desktop pasan; tap mobile fuera del viewport | `/tmp/bagelito-pr38-visibility-final/visibility-results.json` y `/tmp/bagelito-pr38-qa/physical-hit-mobile-after-prefix.json` |
| Test nuevo con hotspot visible, mouse/touch | **16/16 comprobaciones; cero fallos:** 14 nodos y dos handoffs físicos, con mouse desktop y touch mobile emulado | [visibility-results.json](qa/pr38-tour-20261031/visibility-results.json); origen `/tmp/bagelito-pr38-visibility-touch-final/` |
| Build final local | Exit 0; tipos pasan; QA estática 11/11 y fallback manual 4/4 | `/tmp/bagelito-pr38-qa/build-final.log` |
| `qa:guided`, última fuente | **Exit 0, 32 scene checks; cero fallos**, incluidos single/mini, restauración y privacidad del borrador | [guided-results.json](qa/pr38-tour-20261031/guided-results.json); `/tmp/bagelito-pr38-qa/guided-complete.log` |
| Flujo mobile ordinario de la base, sin `?qa=1` | 3/3 hasta Caja; sin cobro ni click de WhatsApp | `/tmp/bagelito-pr38-guided-mobile-focused/summary.json` |
| QA3D original, baseline | 16 checks; tres fallos: readiness de assets, strafe y screenshot de 30 s | `/tmp/bagelito-pr38-qa/world-tour.log` |
| QA3D con esperas explícitas | **Exit 1: 20 checks de escenas/handoffs completados y un fallo de strafe**. Assets y letreros listos en ambos modos; 14 PNG locales | [tour-results.json](qa/pr38-tour-20261031/tour-results.json); `/tmp/bagelito-pr38-3d-final/` y `/tmp/bagelito-pr38-qa/world-tour-final.log` |
| Probe independiente de strafe, sólo lectura | No hubo RAF durante el hold original; input sostenido produjo desplazamiento positivo, sin acreditar el criterio de 480 ms | [strafe-summary.json](qa/pr38-tour-20261031/strafe-summary.json); raw en `/tmp/bagelito-pr38-strafe-diagnostic/strafe-diagnostic.json` |

`package.json` no define un script de lint: no se informa «lint PASS». Pasaron las comprobaciones de sintaxis Node de los scripts y `npm run build`, que ejecuta Vite, `tsc --noEmit`, QA estática 11/11 y fallback manual 4/4.

La QA guiada original devolvía exit 1 porque `visit()` esperaba volver a `entrance` aunque la aplicación restauraba correctamente el borrador anterior. El helper ahora elimina sólo `bagelito.guided.product-draft.v1` al empezar una visita independiente en loopback. La prueba explícita de `page.reload()` a mitad del recorrido sigue ejerciendo la restauración. No se desactivó la persistencia del producto ni se amplió lo que guarda.

QA3D ahora espera las ocho respuestas de fotos completas, los ocho letreros montados y ocho frames del navegador; espera también la convergencia de X de la cámara antes de capturar. La prueba de strafe conserva el hold de 480 ms y el desplazamiento exigido de más de 0,12: espera la telemetría que se publica cada ocho frames. Los screenshots de ese runner conservan su timeout de 30 s. Los cambios de sincronización no modifican el criterio de movimiento ni eliminan su fallo final.

En la ejecución final de QA3D se completaron los assets y las 14 capturas, pero el diagnóstico de movimiento midió `initialX=0` y `movedX=0` tras el hold de 480 ms y hasta 10 s de espera de telemetría. **Ese fallo permanece explícito.** No se modificó el controller de la aplicación ni se amplió el hold del test para convertirlo en verde.

El probe independiente observó `KeyD` confiable sobre `BODY`, con foco, documento visible, `defaultPrevented=true` y sin eventos blur. El hold programado de 480 ms duró 510,1 ms en el navegador: en ese intervalo hubo cero frames de navegador y cero callbacks RAF de la aplicación, con X de 0 a 0. Un segundo input sostenido durante 7.023,9 ms abarcó cinco frames y produjo X +0,61, en dirección positiva. Tras soltar se observó posición reportada estable durante 2 s, pero sólo un frame: no se acreditaron ocho frames de telemetría sin drift. Es una limitación observada en Chromium/SwiftShader; no es una aprobación del criterio original ni una garantía de respuesta en GPU de hardware, Safari o iPhone.

El test nuevo confirmó el click físico de Plain con mouse desktop y el tap de Everything con `page.touchscreen.tap` en mobile, seguido de `pack-size` y Canvas desmontado. Registró 42 GET de navegador al origen local (21 por modo), dos GET locales de configuración y dos respuestas HDR satisfechas con bytes de la fixture. Hubo cero POST, intentos bloqueados, conexiones externas reales desde el navegador o errores de página.

La revalidación final guiada registró 200 GET locales y cero POST, destinos externos o redirects. QA3D registró 128 GET locales, seis respuestas HDR de fixture y cero intentos bloqueados o redirects, mediante el wrapper temporal descrito abajo. El probe completo de strafe se conserva en `/tmp`; el resumen versionado evita copiar su traza de aproximadamente 311 KB.

Capturas reales incorporadas al repositorio:

| Captura | Procedencia | SHA-256 |
| --- | --- | --- |
| [Desktop: Canvas oculto](qa/pr38-tour-20261031/before-hidden-canvas-desktop.png) | Base, antes del arreglo; 100.720 bytes | `23d52d0a47a2a48b23692338b00a8a447b062da9483a70666d29601342a8448b` |
| [Desktop: Canvas visible](qa/pr38-tour-20261031/after-visible-canvas-desktop.png) | Test nuevo final mouse/touch; 323.652 bytes | `d3464c9c8a0eb2f11d5ae0045d870fa29ee76f65ebce524ce98b47b29b839cd0` |
| [Mobile: Canvas visible](qa/pr38-tour-20261031/after-visible-canvas-mobile.png) | Test nuevo final mouse/touch; 133.617 bytes | `c23b28bd919b0652d4530ee14e9b230abcd373ab12aa3b043d27519a48730e83` |

Son capturas del navegador con el HDR disponible mediante fixture. No hubo comparación formal por píxeles o pose de cámara contra un mockup, ni una ejecución en Safari o dispositivos iOS físicos.

## Reproducir la prueba aislada nueva

Entorno de esta sesión: Node 24.19.0, Chromium 151.0.7922.173 y API de Playwright Core 1.64.1. Se utilizó una adaptación temporal de `require('playwright')` a la instalación existente de `playwright-core`, sin añadir una dependencia guardada ni modificar el lockfile de la aplicación.

El test nuevo usa Chromium headless con ANGLE/SwiftShader: desktop 1280×800 y mobile 390×844, ambos con DPR 1. El contexto mobile usa `isMobile/hasTouch=true` y eventos touch emulados. Ejecuta el Canvas y su WebGL real en ese navegador, pero no acredita GPU de hardware ni dispositivos físicos.

Con Playwright normal disponible, el test no requiere ese shim. Si hace falta preparar el tooling aparte, una opción es instalarlo en un directorio temporal, no en el proyecto:

```sh
npm install --prefix /tmp/bagelito-pr38-playwright --cache /tmp/bagelito-pr38-tool-cache --no-save --package-lock=false --ignore-scripts playwright@1.64.1
```

El test admite `QA_CHROMIUM_EXECUTABLE_PATH` para utilizar un Chromium ya instalado. Si Playwright y su navegador ya están disponibles por la vía normal, pueden omitirse `NODE_PATH` y esa variable.

### Fixture HDR pública, sin asset nuevo en la aplicación

`<Environment preset="apartment">` de Drei usa este asset fijado por commit:

```text
https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr
SHA-256: a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb
```

El archivo se descargó públicamente en una fase previa de preparación desde `raw.githubusercontent.com`, con el mismo commit y path. Sus bytes tienen el SHA-256 anterior. La URL `raw.githack.com` que usa Drei se interceptó durante la QA, sin descargarla. Para reproducir desde cero, se puede obtener la fixture de la fuente pública permitida y comprobar su hash antes de la QA:

```sh
mkdir -p /tmp/bagelito-pr38-fixtures
curl --fail --max-redirs 0 --max-time 30 --proto '=https' --output /tmp/bagelito-pr38-fixtures/lebombo_1k.hdr 'https://raw.githubusercontent.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr'
sha256sum /tmp/bagelito-pr38-fixtures/lebombo_1k.hdr
```

El runner verifica el SHA-256 antes de abrir el navegador. Durante la QA intercepta únicamente esa URL exacta y responde con los bytes locales; no descarga el HDR ni consulta proveedores. No se añadió una copia a `public` ni se cambió la URL de la aplicación.

### Servidor sin bindings operativos

Usar un checkout aislado sin `.env`. El launcher de esta sesión fue `/tmp/bagelito-pr38-safe-run.mjs`: elimina del proceso las variables Supabase/Culqi, conserva proxy y resto del entorno, y fija review/QA local con los bridges e intake deshabilitados. Para reproducirlo en otro checkout se puede preparar este launcher temporal:

```sh
cat > /tmp/bagelito-pr38-safe-run.mjs <<'NODE'
import { spawn } from 'node:child_process';
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (/SUPABASE|CULQI/.test(key) || ['PAYMENT_PROVIDER', 'BAGELITO_MERCHANT_REVIEW_ONLY',
    'BAGELITO_VISUAL_QA_ENABLED', 'VITE_BAGELITO_PUBLIC_SITE', 'PUBLIC_SITE_URL',
    'NEXT_PUBLIC_SITE_URL', 'VERCEL_ENV', 'NITRO_PRESET'].includes(key)) delete environment[key];
}
Object.assign(environment, {
  BAGELITO_MERCHANT_REVIEW_ONLY: 'true', BAGELITO_VISUAL_QA_ENABLED: 'true',
  CULQI_ENABLED: 'false', CULQI_MODE: 'disabled', CULQI_TANSTACK_BRIDGE_READY: 'false',
  CULQI_TANSTACK_WEBHOOK_READY: 'false', CULQI_TANSTACK_CLIENT_READY: 'false',
  VITE_BAGELITO_PUBLIC_SITE: 'false', PUBLIC_SITE_URL: 'http://127.0.0.1:3188',
  VERCEL_ENV: 'preview', NITRO_PRESET: 'node-server', NEXT_TELEMETRY_DISABLED: '1',
});
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Command required');
const child = spawn(command, args, { cwd: process.cwd(), env: environment, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
NODE
node /tmp/bagelito-pr38-safe-run.mjs npm run build
NITRO_HOST=127.0.0.1 NITRO_PORT=3188 node /tmp/bagelito-pr38-safe-run.mjs node .output/server/index.mjs
```

En otra terminal, desde el mismo checkout:

```sh
BASE_URL=http://127.0.0.1:3188 \
QA_OUTPUT=/tmp/bagelito-pr38-visibility-local \
QA_HDR_FIXTURE_PATH=/tmp/bagelito-pr38-fixtures/lebombo_1k.hdr \
QA_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
NODE_PATH=/tmp/bagelito-pr38-playwright/node_modules \
npm run qa:tour-visibility
```

`scripts/qa-tour-visibility.cjs` contiene su aislamiento de red: sólo GET al origen loopback exacto, sin seguir redirects; el único GET externo reconocido se satisface con la fixture HDR. Se bloquean los demás destinos y métodos, incluidos los POST, y los service workers. El GET local de configuración exige `enabled`, `configured` e `intakeEnabled` falsos y `mode="disabled"`. Los resultados y las capturas quedan en `QA_OUTPUT`.

## Diferenciar los runners y sus límites

El aislamiento anterior pertenece al test nuevo. Los resultados de `qa:guided` y `qa:3d` de esta sesión se obtuvieron mediante `/tmp/bagelito-pr38-qa/run-existing.cjs`, un wrapper temporal que impone GET local, rechaza redirects y satisface la misma fixture HDR. Esos dos scripts no adquieren ese firewall por ejecutarse directamente con `npm run`; requieren el wrapper o un aislamiento equivalente. No se debe anunciar su ejecución normal como prueba sin egress.

Si se aborta la URL HDR en la aplicación ordinaria, la escena puede caer al fallback de la tienda guiada. Ese comportamiento fue observado y no se corrige aquí. La comprobación con fixture acredita la ruta WebGL con ese asset disponible, no independencia de red en producción.

El texto físico del tótem «TOCA PARA PEDIR» no tenía un handler propio en la base. No se añadió uno en este alcance ni se usa para acreditar el handoff físico de producto. También quedan fuera la equivalencia visual con un mockup, un funnel completamente 3D, validación de todos los dispositivos y cualquier activación/deploy de pagos.
