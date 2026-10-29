import { useEffect, useState } from 'react'

export const ROUTES = ['overview', 'schedule', 'assignments', 'grades', 'notes'] as const
export type Route = (typeof ROUTES)[number]

function read(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return (ROUTES as readonly string[]).includes(hash) ? (hash as Route) : 'overview'
}

/** The current page, kept in the URL hash so refresh and back both work. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(route: Route): void {
  if (window.location.hash.replace(/^#\/?/, '') !== route) window.location.hash = route
}
