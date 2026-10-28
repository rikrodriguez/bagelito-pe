import { createFileRoute } from '@tanstack/react-router'
import { PlayableStore } from '../playable/PlayableStore'

function ExploreStore() {
  return <PlayableStore initialMode="explore" />
}

export const Route = createFileRoute('/playable')({ component: ExploreStore })
