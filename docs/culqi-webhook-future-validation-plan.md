# Plan mínimo de evidencia para aprobación futura

**Propuesta, no ejecutada.** Mantiene las autorizaciones vigentes de desarrollo y PR; no ejecuta ni autoriza despliegues, reenvíos de webhooks, cargos nuevos, SQL remoto, cambios de credenciales/permisos ni operación de la laptop. La base revisada es PR13, SHA `a42d18c711a49b734947e66105c19843b4541685`.

La evidencia del panel acredita token 201, cargo 201, consulta de cargo 200 y tres entregas webhook 500. No muestra un 400 en la lista completa visible. El supuesto upstream 400 sólo tiene una atribución histórica secundaria sin original recuperado. El objeto de cargo mostrado en Historial podría ser la notificación completa o una representación del recurso; no se presupone una envoltura ni se exige un `evt_test_…` ausente.

Los eventos de Vercel del proyecto vinculan `80233bc` con el alias canónico a las 03:40:43.184 UTC del 16 de octubre y registran `aliases-assigned`, aliasCount=1, para el mismo despliegue a las 03:41:26.054. Sus logs de build muestran clonación de `80233bc`, build completo a las 03:41:20.765 y la ruta `/api/webhooks/culqi`. El bundle binario sigue inaccesible (árbol de archivos 404); tampoco se recuperó el log original del supuesto upstream 400. El contexto previo no está disponible en esta conversación y el historial consultable de la automatización devuelve last_run/latest_result nulos; eso no prueba que nunca hubiera ejecuciones.

## 1. Instrumentación propuesta, sin cambiar decisiones de pago

Preparar un diff pequeño, revisable y separado del arreglo financiero: ampliar únicamente el diagnóstico privado del handler existente. No crear endpoint, pantalla o respuesta pública de depuración. No cambiar qué payloads se aceptan, cómo se autentica/verifica al proveedor ni cuándo se llama a la transacción.

Un registro final por invocación debe conservar los campos acotados actuales y añadir sólo:

- Identidad del artefacto embebida durante el build: SHA revisado y digest del módulo/manifest correspondiente. Cotejarla con el deployment; una variable de rama o un alias móvil por sí solos no prueban el bundle.
- Correlación aleatoria generada por el servidor para esa invocación. No usar un ID entrante como autenticación ni registrar headers arbitrarios. No hacen falta hashes estables de IDs ni secretos nuevos.
- Forma exterior, mediante enums/booleanos: objeto superior `charge/event/otro/ausente`, clase del ID `chr/evt/otro/ausente`, presencia de `data`, y tipo de `data` `objeto/string/otro/ausente`. Distinguir camelCase/snake_case mediante presencia de nombres de campo conocidos, sin valores.
- Resultado de parseo e integridad de la observación: `completa/inválida/límite_excedido`. No truncar un payload para luego procesarlo como válido; no añadir un nuevo límite de negocio bajo la etiqueta de instrumentación.
- Recurso efectivamente consultado `events/charges/ninguno`, clase del ID solicitado, status/fallo HTTP acotado y stage. Nunca URL completa con IDs, mensajes crudos del proveedor, body, claves, cookies, Authorization, fuente de pago ni datos personales.

Antes de proponer despliegue: pruebas offline de cargo directo y envolturas sintéticas, parseo inválido, respuesta tardía y logging sin datos privados. Demostrar que el diff no añade consultas, no continúa tras fallos y no altera los controles ni la idempotencia. Identificar el SHA exacto y sus resultados; los mocks no certifican el contrato real.

## 2. Una observación sandbox futura, con aprobación específica

El candidato de diagnóstico debe mantenerse separado de cambios financieros o migraciones pendientes: no se propone desplegar PR13 completo para obtener un log. Preparar el diff mínimo contra el Preview conocido, revisar sus diferencias y conservar los controles y correcciones verificadas compatibles. Si requiere SQL o configuración nuevos, detenerse y presentar ese cambio por separado.

1. Revisar y aprobar por separado el SHA de instrumentación, el Preview/origen exacto y su despliegue. Mantener sandbox y controles existentes; no habilitar live. La aprobación de esta documentación no concede ese despliegue.
2. Confirmar compatibilidad del esquema/ACL/RPC instalados mediante la vía de lectura autorizada, sin instalar el SQL pendiente. Si el candidato necesita una migración aún no aprobada, detenerse. Verificar el respaldo/procedimiento de recuperación ya autorizado; no restaurar snapshots financieros ni crear otro destino.
3. Seleccionar **un registro existente y legítimo** del mismo comercio de prueba. Conservar su vínculo al cargo y pedido mediante evidencia administrativa; no inventar un evento ni transformar `chr` en `evt`. Preferir el caso ya confirmado para comprobar que no se duplica su confirmación. Registrar antes los contadores/estados mínimos de pedido, intento, historial, marcador y capacidad, sin datos personales.
4. Revisar el historial de entregas antes de cualquier acción. Si hay una entrega en curso o un resultado incierto, no repetirla. Si hace falta reenviar, pedir una aprobación explícita que nombre el registro, destino, SHA y **un único reenvío desde la función normal de Culqi**. No usar POST manual, token/OTP copiado, cargo nuevo ni reintento automático.
5. Tras esa única entrega aprobada, correlacionar hora/zona, destino y resultado mostrado por Culqi con el registro privado de la misma invocación y su identidad de build. El objetivo inicial es probar forma HTTP, ruta de consulta y fallo real; no forzar HTTP 200 ni cambiar controles para obtenerlo. Un objeto entrante `capture:true` o un mensaje de éxito nunca sustituye una verificación independiente contra el proveedor y los vínculos persistidos.
6. Si la ruta verificada alcanza la RPC existente, cotejar después los mismos invariantes y su procedencia: no segunda confirmación, historial o capacidad duplicados. No fingir un evento procesado cuando sólo se verificó un cargo. Si falla antes de la transacción, confirmar que no hubo efectos en DB. Conservar únicamente evidencia saneada en el destino privado aprobado.

**Detenerse** ante modo/origen/SHA distinto, esquema incompatible, vínculo ambiguo, datos de otro comercio, entrega incierta, falta de verificación del proveedor, anomalía financiera o evidencia incompleta. No compensar con otro envío, cargo, configuración o relajación de controles. Si falta el log primario por retención, el resultado será «sin prueba primaria recuperable», no una causa reconstruida.

La aprobación futura debe distinguir dos decisiones: desplegar el SHA revisado de diagnóstico y, sólo si sigue siendo necesario y es seguro, ejecutar la única entrega existente indicada. Esta revisión no ejecuta ninguna de ellas.
