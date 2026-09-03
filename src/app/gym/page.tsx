import { Activity, ArrowRight, Dumbbell } from 'lucide-react'
import Link from 'next/link'
import { Card } from '@/components/ui'
import { getCurrentUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function GymHome() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = user.role === 'ATHLETE' ? await prisma.athleteProfile.findUnique({ where: { userId: user.id } }) : null
  const href = user.role === 'COACH' ? '/gym/athletes' : profile ? `/gym/athletes/${profile.id}/plans` : '/'
  return <main className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-bg p-6 text-text-primary">
    <Card className="w-full max-w-md space-y-4 border-accent/60"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent"><Activity /></div>
      <div><h1 className="font-display text-2xl uppercase">Тренажёрный зал</h1><p className="text-sm text-text-secondary">Обычные тренировки</p></div>
      <Link href={href} className="inline-flex items-center gap-2 text-accent">Открыть режим <ArrowRight className="h-4 w-4" /></Link>
    </Card>
  </main>
}
