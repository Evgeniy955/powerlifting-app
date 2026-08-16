'use client'

import { useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui'
import { HeroBackground } from '@/components/HeroBackground'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden bg-bg px-4 text-text-primary">
      <HeroBackground />
      <div className="relative space-y-4 text-center animate-slide-up">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger text-on-danger">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl uppercase tracking-wide">Что-то пошло не так</h1>
        <p className="max-w-sm text-sm text-text-secondary">
          Ошибка на странице. Можно попробовать ещё раз.
        </p>
        <Button onClick={() => reset()}>Попробовать снова</Button>
      </div>
    </main>
  )
}
