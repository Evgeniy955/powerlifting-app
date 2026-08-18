import { LoadingIndicator } from '@/components/LoadingIndicator'

// App-wide fallback for any route without its own more specific loading.tsx.
// Uses the same branded indicator as every page-level loading.tsx so
// navigation never flashes one animation style then swaps to another.
export default function Loading() {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-bg">
      <LoadingIndicator />
    </main>
  )
}
