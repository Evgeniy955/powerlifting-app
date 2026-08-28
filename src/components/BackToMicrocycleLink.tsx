'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

type Props = {
  microcycleId: string
  weekNumber: number
}

// A day is edited through client-side API calls. Clear Next.js's client-side
// route cache before returning to the week so the cached pre-edit microcycle
// snapshot cannot be shown instead of the latest server data.
export function BackToMicrocycleLink({ microcycleId, weekNumber }: Props) {
  const router = useRouter()

  return (
    <Link
      href={`/microcycle/${microcycleId}`}
      prefetch={false}
      onClick={() => router.refresh()}
      className="mb-2 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
    >
      <ArrowLeft className="h-4 w-4" /> Микроцикл {weekNumber}
    </Link>
  )
}
