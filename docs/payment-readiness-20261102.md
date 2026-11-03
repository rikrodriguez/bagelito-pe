# Bagelito: estado de checkout y ruta de cierre — 2 noviembre 2026

**No está lista para vender automáticamente.** La aprobación comercial de Culqi ya fue recibida; no se vuelve a presentar como pendiente del titular. Este documento describe los pendientes técnicos del candidato PR47, no una solicitud de repetir la apertura de cuenta.

**Actualización del 3 de noviembre:** para el candidato actual consultar
[preparación de lanzamiento](qa/launch-prep-20261103/README.md). El puente de
productos completo y su persistencia propuesta ya existen en sandbox; los
estados de implementación e inventarios de entorno que siguen son evidencia
histórica. No prueban el esquema, llaves o runtime desplegados hoy.

## Evidencia actual, separada por capa

- PR47 consultado a las 12:10 UTC: abierto, borrador, sin merge; HEAD b612ecc. Es la tienda guiada visual, no un release financiero.
- `ReferenceStorefront.tsx` pasa `referenceMode reviewOnly` explícitamente; `GuidedCommerce` no consulta configuración de pago ni monta Culqi en ese modo. Abrir Culqi o agregar llaves no cambia ese wiring.
- Existen rutas de sesión/cargo/status/webhook, Custom Checkout y 3DS. Eso no acredita una compra externa completa.
- `checkout-quote.server.ts` exige batch abierto, capacidad y fecha real de delivery. Pack grande no-premium sin extra puede quedar cotizable; minis/premium requieren reglas aprobadas. Combo de 2 bagels + 1 schmear no tiene precio nuevo confirmado; schmears standalone y extra de pack no tienen persistencia transaccional en este adaptador. `checkout-session.server.ts` sólo admite packs grandes. No inventar esos precios ni cobrar una selección que no queda persistida.
- Inventario de Vercel consultado hoy con `decrypt=false`, **sin leer valores**: en bagelito-pe no aparecen claves Culqi con alcance Production ni aplicables a la rama PR47. Sí existen nombres de API/RSA/secret de prueba asociados a ramas históricas de Preview. Production tiene los nombres `BAGELITO_MERCHANT_REVIEW_ONLY` y `NEXT_PUBLIC_SITE_URL`; su valor actual no se certifica mediante este inventario. El proyecto duplicado Playable no tiene variables. No se movió ninguna variable.
- Las migraciones de las RPC financieras no están incluidas en este clon PR47. Eso **no prueba que estén ausentes en la base**: reconciliar con el carril financiero/PR23 y su evidencia de instalación; no volver a aplicar DDL a ciegas. Este lote no consulta datos de clientes ni escribe en DB.
- Intento de lectura pública de bagelito.pe y su configuración mediante web no accesible en esa herramienta. No se afirma caída del sitio ni estado runtime a partir de ese fallo.

## Corrección técnica ejecutada ahora

`culqi.server.ts` limitaba a 10 segundos la recepción de headers, pero leía después el cuerpo JSON fuera del deadline. Un proveedor que entrega headers y deja el cuerpo abierto podía mantener pendiente el cargo o su verificación. Ahora el mismo deadline cubre fetch, comprobación de redirect y lectura JSON en POST/GET. Se aborta, no se reintenta automáticamente; no se cambia payload, precio, captura ni decisión 3DS.

Regresión local: dos fallos reproducidos antes de la corrección; nueve casos nuevos verifican cuerpo colgado, aborto, respuesta normal, JSON inválido, redirect y continuidad de 3DS. Diez pruebas adicionales cubren gates de configuración, exclusión producción/sandbox, origen exacto, apagado de intake con recuperación todavía disponible y ausencia de secret en configuración pública. Todo usa fixtures sintéticos y transporte mock, **sin credenciales reales ni llamadas Culqi**. [Evidencia](qa/culqi-deadline-20261102/README.md).

## Secuencia mínima para terminar, sin confundir hitos

1. **Cerrar el contrato comercial** de combo 2+1, minis, premium y extras con las fuentes/aprobaciones vigentes; implementar cotización y líneas de pedido persistidas para cada categoría. No rebajar el gate actual mientras falta esa correspondencia.
2. **Unificar el candidato transaccional y la tienda visual**, reconciliando PR23 y PR47. Mantener una entrada review-only y preparar una entrada sandbox explícitamente separada; no basta retirar `reviewOnly` del JSX.
3. **Entorno aislado de integración**: verificar o configurar llaves de prueba del mismo comercio, RSA, origen exacto y DB de prueba, sólo con autorización para esa configuración. No pedir secretos en chat; no copiar los de otra rama sin comprobar su alcance. Configuración/despliegue aún no ejecutados por este lote.
4. **Certificar la compra sandbox completa** con entrega HTTP real del webhook: tarjeta normal, 3DS, Yape, rechazo, expiración, respuesta perdida/pago tardío, repetición y reconciliación/reembolso. Validar persistencia y `paid` backend antes de recibo. Mocks/unit tests no sustituyen esta prueba.
5. **Aprobación de release**: contenido/legal, batch/fecha/capacidad, precios y dispositivos reales; después autorización específica de producción y plan rollback. No activar cobros por inferencia de que el comercio fue aprobado.

El trabajo de 1–2 es de implementación y QA. 3 requiere alcance autorizado de configuración sandbox. 4 necesita el entorno aislado preparado. 5 requiere autorización expresa de producción. No se ha pedido al titular repetir la aprobación comercial ya obtenida.

## Fuentes oficiales consultadas hoy

- [Llaves por entorno](https://docs.culqi.com/es/documentacion/pagos-online/llaves): test/live son entornos distintos; la privada permanece en servidor.
- [Custom Checkout](https://docs.culqi.com/es/documentacion/checkout/checkout-custom): captura/tokeniza, y el backend debe crear/confirmar el cargo.
- [Integración 3DS](https://docs.culqi.com/es/documentacion/culqi-3ds/v1/integracion-checkout/): flujo de autenticación del checkout.

No deploy, merge, cobro, replay de webhook, creación/cambio de credenciales o permisos, datos de clientes ni comunicaciones a terceros en este lote. `.env.example` sólo documenta defaults cerrados; no configura ningún entorno.
