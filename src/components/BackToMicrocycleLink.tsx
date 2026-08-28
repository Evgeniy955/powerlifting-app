'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

type Props = {
  microcycleId: string
  weekNumber: number
}

// A day is edited through client-side API calls. Returning to the same URL can
// reuse Next.js's cached pre-edit route segment, so navigate with a one-off
// query value. It creates a fresh route-cache key and fetches the current
// microcycle data without a browser reload.
export function BackToMicrocycleLink({ microcycleId, weekNumber }: Props) {
  const router = useRouter()

  return (
    <Link
      href={`/microcycle/${microcycleId}`}
      prefetch={false}
      onClick={(event) => {
        event.preventDefault()
        router.push(`/microcycle/${microcycleId}?updated=${Date.now()}`)
      }}
      className="mb-2 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
    >
      <ArrowLeft className="h-4 w-4" /> Микроцикл {weekNumber}
    </Link>
  )
}
