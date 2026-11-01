import { useEffect, useState } from 'react'
import { GuidedCommerce } from '../playable/GuidedCommerce'
import './reference-storefront.css'

export function ReferenceStorefront() {
  const [scene, setScene] = useState('selector')
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (scene === 'selector' || scene === 'entrance') {
        window.scrollTo({ top: 0, behavior: 'auto' })
        return
      }
      document.querySelector<HTMLElement>(
        '.reference-mode .guided-floating-panel,.reference-mode .mobile-product-stage,.reference-mode .approved-combo-overlay,.reference-mode .guided-cashier-action,.reference-mode .guided-payment-gate',
      )?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })
    return () => cancelAnimationFrame(frame)
  }, [scene])
  return <div className="reference-storefront" data-review-only="true">
    <GuidedCommerce referenceMode reviewOnly skipEntrance
      exitLabel="Volver a la vitrina" onExit={() => window.location.assign('/')}
      onSceneChange={setScene} />
    {scene === 'pay' && <aside className="reference-loyalty" aria-label="Programa de fidelidad">
      <small>FIDELIDAD BAGELITO</small>
      <h2>Cada 10 pedidos, 2 bagels + 1 schmear gratis.</h2>
      <p>El programa usará pedidos verificados y seguimiento interno. El registro y el canje están pendientes de implementación; esta revisión no genera pedidos ni recompensas.</p>
    </aside>}
    <footer className="reference-review-note">
      Vista de revisión · sin cobros, reservas ni envío de datos.
      Los precios dibujados pertenecen a la imagen de referencia; las opciones del flujo usan el catálogo verificado.
    </footer>
  </div>
}
