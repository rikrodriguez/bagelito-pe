import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { GuidedCommerce } from '../playable/GuidedCommerce'
import '../reference/reference-storefront.css'
import '../reference/rebuilt-flow.css'

// Return only availability; server credentials/configuration never enter props.
const readSandboxAvailability = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const { isGuidedProductCheckoutPageAllowed } = await import('../server/payment-config.server')
  return { enabled: isGuidedProductCheckoutPageAllowed(getRequest()) }
})

export const Route = createFileRoute('/sandbox-checkout')({
  loader: () => readSandboxAvailability(),
  headers: () => ({ 'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store' }),
  head: () => ({ meta: [
    { name: 'robots', content: 'noindex,nofollow,noarchive' },
    { title: 'Bagelito — Checkout sandbox' },
  ] }),
  component: SandboxCheckout,
})

function SandboxCheckout() {
  const { enabled } = Route.useLoaderData()
  return enabled ? <SandboxJourney /> : <main style={{ padding: '2rem', maxWidth: 640, margin: 'auto' }}>
    <h1>Checkout sandbox no habilitado</h1>
    <p>Esta entrada separada requiere configuración de pruebas autorizada. No se crean reservas ni se carga Culqi desde esta pantalla.</p>
    <a href="/">Volver a la tienda de revisión</a>
  </main>
}

function SandboxJourney() {
  const [scene, setScene] = useState('selector')
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (scene === 'selector' || scene === 'entrance') window.scrollTo({ top: 0, behavior: 'auto' })
      else document.querySelector<HTMLElement>(
        '.reference-mode .guided-floating-panel,.reference-mode .mobile-product-stage,.reference-mode .approved-combo-overlay,.reference-mode .guided-cashier-action,.reference-mode .guided-payment-gate',
      )?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })
    return () => cancelAnimationFrame(frame)
  }, [scene])
  return <div className="reference-storefront" data-sandbox-checkout="true">
    <aside role="note" style={{ padding: '1rem', background: '#fff3cd', color: '#382b00', position: 'relative', zIndex: 30 }}>
      <strong>Entorno de pruebas Culqi.</strong> No es una venta ni autoriza entrega. Usa sólo datos de prueba autorizados; nunca una tarjeta real.
    </aside>
    <GuidedCommerce referenceMode skipEntrance sandboxMode
      exitLabel="Volver a la vitrina" onExit={() => window.location.assign('/sandbox-checkout')}
      onSceneChange={setScene} />
  </div>
}
