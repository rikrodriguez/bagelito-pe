import { createFileRoute } from '@tanstack/react-router'
import { PlayableStore } from '../playable/PlayableStore'

function StoreEntry(){return <PlayableStore initialMode="explore"/>}

export const Route = createFileRoute('/')({ component: StoreEntry })
