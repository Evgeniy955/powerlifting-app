import { ArrowRight, Dumbbell } from 'lucide-react'
import { getCurrentUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui'
import { HeroBackground } from '@/components/HeroBackground'

export default async function HomePage() {
  const user = await getCurrentUser()

  if (!user) {
    return (
      <main className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden bg-bg px-4 text-text-primary">
        <HeroBackground />
        <div className="relative space-y-4 text-center animate-slide-up">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent">
            <Dumbbell className="h-6 w-6" />
          </div>
          <h1 className="font-display text-3xl uppercase tracking-wide">
            Iron<span className="text-accent">Ledger</span>
          </h1>
          <Link href="/login" className={buttonVariants()}>
            Войти
          </Link>
        </div>
      </main>
    )
  }

  let athleteProfileId: string | null = null
  if (user.role === 'ATHLETE') {
    const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } })
    athleteProfileId = profile?.id ?? null
  }

  return (
    <main className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden bg-bg px-4 text-text-primary">
      <HeroBackground />
      <div className="relative space-y-4 text-center animate-slide-up">
        <h1 className="font-display text-3xl uppercase tracking-wide">
          Iron<span className="text-accent">Ledger</span>
        </h1>
        <p className="text-text-secondary">Привет, {user.name ?? 'спортсмен'}.</p>

        <div className="flex flex-col items-center gap-2">
          {user.role === 'COACH' && (
            <Link
              href="/athletes"
              className="inline-flex items-center gap-1.5 text-accent hover:underline"
            >
              Мои атлеты <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {user.role === 'ATHLETE' && athleteProfileId && (
            <Link
              href={`/athletes/${athleteProfileId}/cycles`}
              className="inline-flex items-center gap-1.5 text-accent hover:underline"
            >
              Мои планы <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
