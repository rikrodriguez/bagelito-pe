import { createFileRoute } from '@tanstack/react-router'
import { ReferenceStorefront } from '../reference/ReferenceStorefront'

function StoreEntry(){return <ReferenceStorefront/>}

export const Route = createFileRoute('/')({ component: StoreEntry })
