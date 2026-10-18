# Revisión tras una segunda solicitud de 3DS

Base: PR13 `57fec7779d106c4bee008235e7dd7ce267e98a69`. Las pruebas de este
cambio usan únicamente proveedor, SDK, navegador y RPC ficticios. No son una
validación de Culqi ni una autenticación bancaria real.

## Fallo reproducido

El contrato de la aplicación permite un envío inicial y su continuación 3DS,
vinculados al mismo pedido, capability, token y dispositivo. Si la respuesta de
esa continuación volvía a indicar `requires3DS`, el coordinador persistía otra
vez `requires_3ds`. Un replay autenticado podía volver a llamar al proveedor.
La página también volvía a autorizar una continuación y el botón descartaba el
resultado de su callback: mostraba "Confirmando" aunque no había consulta de
estado ni desafío activo. Además retiraba el temporizador de vencimiento.

Cinco regresiones nuevas fallaron contra la base: una del coordinador, una de
la página, una del botón y dos del recorrido completo en español/inglés. El
coordinador devolvía `requires_3ds` donde debía conservar revisión; el botón
mostraba confirmación y la página no rechazaba la continuación repetida.

## Comportamiento corregido

El coordinador trata la segunda solicitud de 3DS, después de recibir parámetros
de autenticación, como resultado no resuelto. Usa el cierre `uncertain` ya
existente y devuelve `reconciliation_required`; no abre otro claim. Los RPC
existentes mantienen cerrado ese estado ante replays.

La página aplica la misma regla si un servidor anterior aún devuelve la acción
repetida. Conserva la referencia duradera en `review`, sin almacenar token,
dispositivo ni datos de autenticación. El botón comprueba explícitamente el
resultado de la continuación antes de mostrar confirmación y usa la vista de
revisión existente cuando no se ha enviado el pago.

Esto es una política de la aplicación para un resultado no resuelto, no una
afirmación de que Culqi prohíba una segunda autenticación. No se infiere que el
cargo haya fallado, que no se movió dinero ni que pueda pagarse otra vez.

## Regresiones y límites

El coordinador real se prueba con un RPC simulado que modela sus estados; esa
prueba no ejecuta locks PostgreSQL. La suite SQL existente verifica por
separado el bloqueo de claims inciertos. Los componentes reales se ejecutan con
hooks, SDK y transportes ficticios: dos envíos como máximo, misma identidad,
sin segunda autenticación, sin redirección o nuevo pedido, y mensajes/callbacks
duplicados bloqueados. Tras recargar sólo se consulta el mismo pedido; un
estado pendiente conserva revisión y un pago autoritativo permite resolverla.

```bash
node --test tests/payments/charge-coordinator.test.mjs tests/payments/checkout-review.test.mjs
npm test
npm run lint
NEXT_TELEMETRY_DISABLED=1 CULQI_ENABLED=false npm run build
```

Validación local: 82/82 pruebas dirigidas y 578/578 en la suite completa;
build/tipos correctos; lint sin errores y con la advertencia anterior en
`culqi-readonly-adapter.test.mjs:99`. La revisión independiente no encontró
bloqueos. El SHA publicado y su CI exacta se registran en el PR.

No se modifica SQL, permisos, flags remotos, workflows ni exclusiones Vercel.
La migración preparada en la entrega anterior sigue requiriendo revisión e
instalación separada en un destino autorizado. El acceso al historial del
comercio/evento sandbox y la observación de una autenticación bancaria
autorizada siguen pendientes: los fixtures no certifican esos límites.
