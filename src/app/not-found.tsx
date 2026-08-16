import Link from 'next/link'
import { Dumbbell } from 'lucide-react'
import { buttonVariants } from '@/components/ui'
import { HeroBackground } from '@/components/HeroBackground'

export default function NotFound() {
  return (
    <main className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden bg-bg px-4 text-text-primary">
      <HeroBackground />
      <div className="relative space-y-4 text-center animate-slide-up">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent">
          <Dumbbell className="h-6 w-6" />
        </div>
        <h1 className="font-display text-4xl uppercase tracking-wide">
          4<span className="text-accent">0</span>4
        </h1>
        <p className="text-text-secondary">Страница не найдена — похоже, вес не взят.</p>
        <Link href="/" className={buttonVariants()}>
          На главную
        </Link>
      </div>
    </main>
  )
}
