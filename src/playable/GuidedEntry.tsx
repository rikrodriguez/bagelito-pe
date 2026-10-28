import { useEffect, useState } from 'react'
import { GuidedCommerce } from './GuidedCommerce'

export function GuidedEntry() {
  const [customerName, setCustomerName] = useState<string | null>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem('bagelito_customer_name')
    if (saved) setCustomerName(saved)
  }, [])

  return <GuidedCommerce
    customerName={customerName}
    onExit={() => { window.location.assign('/playable') }}
  />
}
