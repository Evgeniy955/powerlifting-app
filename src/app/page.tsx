import { ArrowRight, Dumbbell, Activity } from 'lucide-react'
import { getCurrentUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { buttonVariants, Card } from '@/components/ui'
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
  // The coach picks this name when creating the athlete's profile — for an
  // athlete it's what the greeting below should use, instead of user.name
  // (whatever their linked Google account happens to be called, which for
  // some accounts is an auto-generated handle like "autouser_ukr" rather
  // than a real name).
  let athleteProfileName: string | null = null
  if (user.role === 'ATHLETE') {
    const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } })
    athleteProfileId = profile?.id ?? null
    athleteProfileName = profile?.displayName ?? null
  }

  const greetingName = athleteProfileName ?? user.name ?? 'спортсмен'

  const powerliftingHref =
    user.role === 'COACH'
      ? '/athletes'
      : athleteProfileId
        ? `/athletes/${athleteProfileId}/cycles`
        : null

  return (
    <main className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden bg-bg px-4 py-16 text-text-primary">
      <HeroBackground />
      <div className="relative w-full max-w-2xl space-y-8 text-center animate-slide-up">
        <div className="space-y-2">
          <h1 className="font-display text-3xl uppercase tracking-wide">
            Iron<span className="text-accent">Ledger</span>
          </h1>
          <p className="text-text-secondary">Привет, {greetingName}. Выбери направление.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {powerliftingHref ? (
            <Link href={powerliftingHref} className="group text-left">
              <Card className="flex h-full flex-col gap-3 transition-colors group-hover:border-accent">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent">
                  <Dumbbell className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg uppercase tracking-wide">Пауэрлифтинг</h2>
                  <p className="text-sm text-text-secondary">
                    {user.role === 'COACH'
                      ? 'Атлеты, циклы, аналитика'
                      : 'Твои циклы и результаты'}
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1.5 text-sm text-accent">
                  {user.role === 'COACH' ? 'Мои спортсмены' : 'Мои планы'}{' '}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Card>
            </Link>
          ) : (
            <Card className="flex h-full flex-col gap-3 opacity-60">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent">
                <Dumbbell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-lg uppercase tracking-wide">Пауэрлифтинг</h2>
                <p className="text-sm text-text-secondary">Профиль атлета ещё не создан</p>
              </div>
            </Card>
          )}

          <Link href="/gym" className="group text-left">
          <Card className="flex h-full flex-col gap-3 transition-colors group-hover:border-accent">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-text-secondary">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg uppercase tracking-wide">Тренажёрный зал</h2>
              <p className="text-sm text-text-secondary">Обычные тренировки</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-sm text-accent">Открыть режим <ArrowRight className="h-4 w-4" /></span>
            </span>
          </Card></Link>
        </div>
      </div>
    </main>
  )
}
