import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { GuidedCommerce } from '../playable/GuidedCommerce'
import '../reference/reference-storefront.css'
import '../reference/rebuilt-flow.css'

const readManualInquiryAvailability = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest, setResponseHeader } = await import('@tanstack/react-start/server')
  const { isManualInquiryPageAllowed } = await import('../server/manual-inquiry-config.server')
  setResponseHeader('Cache-Control', 'private, no-store, max-age=0')
  setResponseHeader('CDN-Cache-Control', 'no-store')
  return { enabled: isManualInquiryPageAllowed(getRequest()) }
})

export const Route = createFileRoute('/consulta')({
  loader: () => readManualInquiryAvailability(),
  headers: () => ({ 'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store' }),
  head: () => ({ meta: [
    { name: 'robots', content: 'noindex,nofollow,noarchive' },
    { title: 'Bagelito — Consulta tu selección' },
  ] }),
  component: ManualInquiry,
})

function ManualInquiry() {
  const { enabled } = Route.useLoaderData()
  return enabled ? <ManualInquiryJourney /> : <main style={{ padding: '2rem', maxWidth: 640, margin: 'auto' }}>
    <h1>Consulta de pedidos no habilitada</h1>
    <p>Esta entrada está cerrada. No envía datos, crea reservas ni realiza cobros.</p>
    <a href="/">Volver a la tienda de revisión</a>
  </main>
}

function ManualInquiryJourney() {
  const [scene, setScene] = useState('selector')
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (scene === 'selector' || scene === 'entrance') window.scrollTo({ top: 0, behavior: 'auto' })
      else document.querySelector<HTMLElement>(
        '.reference-mode .guided-floating-panel,.reference-mode .mobile-product-stage,.reference-mode .approved-combo-overlay,.reference-mode .guided-cashier-action',
      )?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })
    return () => cancelAnimationFrame(frame)
  }, [scene])
  return <div className="reference-storefront" data-manual-inquiry="true">
    <aside role="note" style={{ padding: '1rem', background: '#eef4ff', color: '#004aad', position: 'relative', zIndex: 30 }}>
      <strong>Consulta por WhatsApp.</strong> Elige tus productos y revisa el mensaje antes de enviarlo. Bagelito confirmará disponibilidad, precio y entrega. Esta página no reserva ni cobra.
    </aside>
    <GuidedCommerce referenceMode skipEntrance manualInquiry
      exitLabel="Volver a la vitrina" onExit={() => window.location.assign('/consulta')}
      onSceneChange={setScene} />
    <footer className="reference-review-note">Consulta manual · sin pago ni reserva automática. Imágenes referenciales.</footer>
  </div>
}
