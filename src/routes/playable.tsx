import { createFileRoute } from '@tanstack/react-router'
import { ReferenceStorefront } from '../reference/ReferenceStorefront'

function ExploreStore() {
  return <ReferenceStorefront />
}

export const Route = createFileRoute('/playable')({ component: ExploreStore })
