# Cierre del presupuesto del diagnóstico de solo lectura

Base: PR13 en borrador, `3aec47e6a90191184c60763d6f8c33bfd9a86cbd`. Este cambio corrige el diagnóstico administrativo; no cambia la creación, confirmación o recuperación de pagos ni explica el HTTP400 histórico de Culqi.

## Defecto y corrección

El GET del diagnóstico pasaba un AbortSignal al transporte, pero esperaba sus cabeceras sin una espera propia cancelable. Un transporte que ignorara la señal podía dejar pendiente el informe. Además, la aceptación del JSON sólo cotejaba el plazo global de noventa segundos: podía aceptar una lectura después de sus diez segundos individuales si el callback del timer se demoraba.

Siete regresiones nuevas reprodujeron cinco fallos antes del cambio: espera de cabeceras pendiente tras abortar y aceptación de cabeceras/cuerpo a 10.000 y 10.001 ms. Los dos controles a 9.999 ms pasaron. No se esperaron diez segundos reales; la señal y el reloj sintéticos se controlan por separado y el caso pendiente libera su transporte al finalizar.

La espera de cabeceras y de fragmentos de cuerpo comparte ahora un helper cancelable que retira sus listeners al completarse, fallar o abortarse. Los rechazos tardíos siguen observados. Antes del transporte y después de cabeceras/JSON se coteja el menor plazo entre diez segundos individuales y los noventa globales, con reloj monotónico por defecto. El controlador propio se aborta en finally. Esto cierra la espera local y evita continuar el recorrido con resultados vencidos; no promete detener un transporte que ignore la señal ni responder mientras JavaScript esté bloqueado.

Se conservan exactamente los headers, URL, ventana, tres objetivos, dos listados, veinte detalles, máximo de veinticinco GET, tamaños, controles administrativos y el informe booleano. No se emiten IDs, payloads ni parámetros del proveedor. No se amplía la búsqueda ni se certifica comercio, captura, pago o ausencia de eventos.

## Validación y límites

- Pruebas dirigidas finales: **136/136**, sin fallos, omisiones ni cancelaciones. Incluyen catorce regresiones nuevas: las siete iniciales, seis límites globales de cabeceras/cuerpo a 89.999/90.000/90.001 ms y un ajuste del reloj civil que no debe vencer una lectura oportuna.
- El caso de presupuesto global permite completar los veinticinco GET antes del límite y detiene lecturas posteriores al vencimiento. Los casos tardíos no continúan hacia otros objetivos. Las pruebas existentes conservan los cotejos de acceso, identidad y ausencia de datos privados en informes.
- Ejecución con env-i, configuración sintética y guard de red. Ninguna solicitud al proveedor, base alojada, panel o endpoint de negocio. Revisión independiente del diff sin bloqueos.
- La reconexión perdió las dependencias en /tmp a las que apuntaban los enlaces anteriores. La primera suite completa registró diez fallos de carga por módulos ausentes; tsc/eslint tampoco pudieron cargar sus paquetes. No se atribuye ese intento al comportamiento del fix. La reposición del lock mediante npm ci no se completó: DNS EAI_AGAIN y después error interno de npm; no hay paquetes recuperados en esa caché. Se conservaron logs y no se cambió package/lock, configuración de la aplicación ni credenciales. Build, tipos, lint y suite completa nuevos siguen pendientes de ejecución con dependencias disponibles o CI.
- Las CI anteriores del SHA base 3aec47e terminaron success en [PR](https://github.com/rikrodriguez/bagelito-pe/actions/runs/39432727492) y [push](https://github.com/rikrodriguez/bagelito-pe/actions/runs/39432717870). No son resultados del nuevo diff.

Logs y hashes de esta revisión se conservan localmente en `/workspace/bagelito-pending-audit/culqi-readonly-deadline-20261020/`. No se repitieron consultas de logs históricos sin retención, intentos de acceso al panel, reenvíos o cobros.

## Evidencia legítima todavía necesaria

La [guía de lectura manual](culqi-existing-event-evidence.md) distingue el evento existente, el HTTP500 del callback y el HTTP400 interno de su GET. Se necesita el ID/tipo real del evento, vínculo al cargo y comercio sandbox, fecha/zona, destino e historial de entregas y, si existe, el parámetro rechazado o explicación contractual saneada. No se supone que ese GET figure en el panel.

Las horas conocidas son del 16 de octubre a las 03:50:11–13 UTC, equivalentes al 15 de octubre a las 22:50:11–13 de Lima. El evento pudo crearse antes. Si no existe ese registro accesible, el HTTP400 permanece bloqueado por evidencia externa; un fixture o un cargo nuevo no lo sustituye. Esta corrección no despliega el diagnóstico ni autoriza instalar SQL remoto.
