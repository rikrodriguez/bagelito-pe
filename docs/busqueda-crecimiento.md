# Busqueda y crecimiento

Documento operativo para indexacion, Google Search Console, funnel Instagram/WhatsApp y pruebas de Open Graph de Bagelito.pe.

## Estado confirmado

Revision hecha el 2026-06-25.

- Home publica: `https://bagelito.pe/` responde `200`.
- Canonical home: `https://bagelito.pe`.
- Robots: `https://bagelito.pe/robots.txt`.
- Sitemap: `https://bagelito.pe/sitemap.xml`.
- URLs indexables en sitemap: `/`, `/reserve`, `/legal`.
- URLs bloqueadas: `/admin`, `/api`, `/reserve/success`.
- OG image: `https://bagelito.pe/images/bagelito-og.png`.
- OG image local: 1200 x 630, PNG, ~296 KB.
- Footer funnel: WhatsApp `+51 917 547 745` e Instagram `@bagelito.pe`.

## Search Console

Objetivo: que Google pueda rastrear, indexar y reportar errores de Bagelito.pe.

Pasos recomendados:

1. Entrar a Google Search Console: `https://search.google.com/search-console`.
2. Crear una propiedad tipo `Domain` para `bagelito.pe`.
3. Verificar propiedad con TXT record en Cloudflare.
4. En Cloudflare DNS, crear el TXT que entregue Google.
5. Volver a Search Console y presionar `Verify`.
6. En `Sitemaps`, enviar:
   - `https://bagelito.pe/sitemap.xml`
7. En `URL Inspection`, probar y pedir indexacion para:
   - `https://bagelito.pe/`
   - `https://bagelito.pe/reserve`
   - `https://bagelito.pe/legal`

Notas:

- La verificacion por DNS es preferible porque cubre todo el dominio.
- Si se usa verificacion por meta tag, guardar solo el contenido del token en Vercel como `GOOGLE_SITE_VERIFICATION` y redeployar.
- El codigo ya soporta `GOOGLE_SITE_VERIFICATION` en metadata.

Referencias:

- Verificacion de propiedad: `https://support.google.com/webmasters/answer/9008080`
- Sitemaps: `https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap`

## Rutina de indexacion

Semanal:

- Revisar `Pages` / index coverage en Search Console.
- Revisar errores de sitemap.
- Inspeccionar home y `/reserve` si hubo deploy importante.
- Confirmar que Google ve canonical correcto.
- Revisar queries que empiezan a traer impresiones.

Despues de cada deploy importante:

1. Abrir `https://bagelito.pe/sitemap.xml`.
2. Confirmar que responde XML.
3. Abrir `https://bagelito.pe/robots.txt`.
4. Confirmar que no bloquea `/` ni `/reserve`.
5. Usar URL Inspection para pedir recrawl de home y reserva.

## Instagram funnel

Playbook completo de contenido: `docs/contenido-crecimiento.md`.

Perfil recomendado:

- Nombre: `Bagelito.pe`
- Username: `@bagelito.pe`
- Bio:
  - `Monthly bagel drop in Lima.`
  - `Limited packs. Pre-order only.`
  - `Reserve the next batch ->`
- Link principal:
  - `https://bagelito.pe/?utm_source=instagram&utm_medium=bio&utm_campaign=waitlist`

Cuando el batch este abierto:

- Cambiar link de bio a:
  - `https://bagelito.pe/reserve?utm_source=instagram&utm_medium=bio&utm_campaign=open_batch`

Highlights recomendados:

- `Menu`
- `How it works`
- `Delivery`
- `Reviews`
- `Next batch`

Contenido de crecimiento:

- Reel corto del batch saliendo del horno.
- Carrusel de sabores.
- Story con sticker/link a reserva.
- Story de cierre de batch con urgencia.
- Post de prueba social despues de delivery.

## WhatsApp funnel

Link base:

- `https://api.whatsapp.com/send?phone=51917547745`

Mensaje waitlist recomendado:

```text
Hello Bagelito! I want to be part of the waiting list for the next batch please!
```

Mensaje batch abierto recomendado:

```text
Hi Bagelito.pe! I want to reserve the next monthly bagel batch.
```

Reglas:

- Instagram bio debe mandar a la web, no directo a WhatsApp, cuando se quiera medir visitas y conversion.
- Stories urgentes pueden mandar directo a WhatsApp si el objetivo es cerrar rapido.
- Usar el mismo wording que la web: monthly batch, limited packs, pre-order only.

## OG testing

Probar estas URLs despues de deploys visuales o cambios de metadata:

- `https://bagelito.pe/`
- `https://bagelito.pe/reserve`
- `https://bagelito.pe/legal`

Herramientas:

- Meta Sharing Debugger: `https://developers.facebook.com/tools/debug/`
- LinkedIn Post Inspector: `https://www.linkedin.com/post-inspector/`
- WhatsApp real: pegar link en un chat propio y confirmar preview.

Checklist esperado:

- Titulo claro.
- Descripcion correcta.
- Imagen 1200 x 630.
- Imagen muestra marca/producto real.
- No aparece una imagen vieja cacheada.
- `og:url` apunta al canonical correcto.

Si WhatsApp o Meta muestran imagen vieja:

1. Abrir Meta Sharing Debugger.
2. Pegar URL.
3. Presionar scrape/debug again.
4. Volver a pegar en WhatsApp.
5. Si sigue cacheado, probar agregando UTM temporal para campana.

## Landing/funnel links

Usar UTMs simples:

- Instagram bio waitlist:
  - `https://bagelito.pe/?utm_source=instagram&utm_medium=bio&utm_campaign=waitlist`
- Instagram story reserva:
  - `https://bagelito.pe/reserve?utm_source=instagram&utm_medium=story&utm_campaign=open_batch`
- WhatsApp broadcast:
  - `https://bagelito.pe/reserve?utm_source=whatsapp&utm_medium=broadcast&utm_campaign=open_batch`
- Perfil personal/friends:
  - `https://bagelito.pe/?utm_source=referral&utm_medium=social&utm_campaign=soft_launch`

## Reglas de crecimiento

- Una URL principal por campana.
- No cambiar OG image durante un batch activo salvo que haya error.
- Usar el calendario de `docs/contenido-crecimiento.md` para abrir, cerrar, producir y recapitular cada batch.
- Revisar Search Console semanalmente.
- Revisar Vercel Analytics despues de cada post o story fuerte.
- Mantener `@bagelito.pe` como perfil visible en footer y structured data.
