import { useEffect, useState } from 'react'
import { GuidedCommerce } from './GuidedCommerce'

export function GuidedEntry() {
  const [customerName, setCustomerName] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('bagelito_customer_name')
      if (saved) setCustomerName(saved)
    } catch {
      // Privacy settings must never prevent a customer opening the shop.
    }
  }, [])

  return <GuidedCommerce
    customerName={customerName}
    onExit={() => { window.location.assign('/playable') }}
  />
}
