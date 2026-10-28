import { createFileRoute } from '@tanstack/react-router'
import { PlayableStore } from '../playable/PlayableStore'

export const Route = createFileRoute('/')({ component: PlayableStore })
