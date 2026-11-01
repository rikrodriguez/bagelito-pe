import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  // The reference preview keeps its selection in memory and does not persist
  // navigation/scroll state. TanStack may still read its own cache on import.
  return createRouter({ routeTree, scrollRestoration: false })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
