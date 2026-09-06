'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Forces a fresh server refetch every time the page this is rendered on
// mounts — including when you land on it via the browser's back/forward
// buttons. Next.js's App Router always serves back/forward navigation from
// its client-side snapshot cache to preserve scroll position, and that
// specific case is documented as unaffected by the `staleTimes` config
// (see next.config.js) — router.refresh() on mount is the standard
// workaround. Render this once near the top of a server-rendered page that
// needs to always show current data (e.g. a roster that gets edited from a
// sub-page and then navigated back to).
export function AutoRefreshOnMount() {
  const router = useRouter()
  useEffect(() => {
    router.refresh()
    // Only ever on mount — this must not re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
