# Aceptación de términos: versión y prueba

El texto vigente en /legal declara "Última actualización: 20 de agosto de 2026", versión \`2026-08-20\`. El checkbox de compra de /checkout y /reserve está **desmarcado al iniciar**, separado del checkbox de marketing. El cliente envía \`termsAccepted: true\` y \`termsVersion: "2026-08-20"\`. Zod en el servidor rechaza false y cualquier otra versión.

**Persistencia**: la migración \`supabase/add-checkout-legal-evidence.sql\` introduce \`orders.checkout_legal_version\` y \`orders.checkout_legal_accepted_at\`. Su trigger inserta la versión **solo para pedidos nuevos con \`terms_accepted=true\`**, junto con la transacción original del pedido. Nunca rellena retrospectivamente datos históricos: la versión no demuestra un clic por sí sola, y no debe atribuirse esa evidencia a pedidos anteriores.

**Release gate importante:** la web pública antigua fija \`termsAccepted = true\` y todavía no tiene el checkbox. **NO instales el trigger en producción antes de desplegar la UI revisada y de cerrar los checkouts antiguos**; hacerlo registraría evidencia engañosa. Hacer mantenimiento/cutover coordinado de aplicación y esquema, con pruebas de consentimiento rechazado y aceptado. Luego comprobar en 2 pedidos sandbox nuevos que uno aceptado crea ambas columnas y el rechazo no crea un pedido.

Los tests del validador de versión y el botón deshabilitado no prueban por sí solos persistencia. Revisar la política legal con asesoría especializada si cambia el texto o la norma local; incrementar versión tanto en \`src/lib/legal-terms.ts\` como en la migración revisada.

No se cambian las claves Culqi, el cobro, el webhook, la función financiera ni el estado de pedidos. No aplicar por defecto en producción.
