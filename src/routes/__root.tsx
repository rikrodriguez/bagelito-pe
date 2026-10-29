import type { ReactNode } from 'react'
import { createRootRoute, Outlet, HeadContent, Scripts } from '@tanstack/react-router'
import '../styles.css'

// A draft preview must never become searchable accidentally.
 // Enable VITE_BAGELITO_PUBLIC_SITE=true only for the reviewed production release.
const isPublicStore = import.meta.env.VITE_BAGELITO_PUBLIC_SITE === 'true'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'robots', content: isPublicStore ? 'index,follow' : 'noindex,nofollow' },
      { title: isPublicStore
          ? 'Bagelito | Bagels artesanales, packs y schmears en Lima'
          : 'Bagelito — Vista previa de tienda (sin cobros)' },
      { name: 'description', content: isPublicStore
          ? 'Recorre Bagelito, elige tus sabores y configura packs grandes, minis, combos y schmears. Consulta disponibilidad y fecha de entrega en Lima.'
          : 'Vista previa del recorrido de Bagelito. No se aceptan cobros online desde esta versión.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Bagelito' },
      { property: 'og:title', content: 'Bagelito | Bagels artesanales en Lima' },
    ],
    links: isPublicStore
      ? [{ rel: 'canonical', href: 'https://bagelito.pe/' }]
      : [],
  }),
  component: RootComponent,
})

function RootComponent() {
  return <Document><Outlet /></Document>
}
function Document({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="es"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
}
