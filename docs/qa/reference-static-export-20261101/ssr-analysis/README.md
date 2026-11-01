# Inspección SSR previa

Capturas de lectura del build Node original6f765ce. Esta inspección precede a la ejecución del exporter; sus timestamps internos SSR difieren de los HTML congelados posteriormente. No se usan como el par exacto antes/después de la exportación.

La comparación exacta se encuentra en `../source-audit-f2cc618/csp-http-audit.json`: al quitar únicamente los dos nuevos metadatos de cada HTML exportado se reconstruye el SHA de la respuesta de origen registrada por el exporter. Los archivos de esta carpeta acreditan la inspección de rutas, bootstrap y ausencia de loaderData/server functions serializadas.
