import type { ReactNode } from 'react'
import { createRootRoute, Outlet, HeadContent, Scripts } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'robots', content: 'noindex,nofollow' },
      { title: 'Bagelito — Vista previa técnica (sin cobros)' },
      { name: 'description', content: 'Vista técnica de selección Bagelito: no acepta pedidos ni pagos.' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return <Document><Outlet /></Document>
}
function Document({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="es"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
}
