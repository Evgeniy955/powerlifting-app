import Link from 'next/link'
import { UserRound } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui'

export default async function GymAthletesPage() {
  const user = await requireUser(); if (user.role !== 'COACH') redirect('/')
  const athletes = await prisma.athleteProfile.findMany({ where: { coachId: user.id, archivedAt: null }, orderBy: { displayName: 'asc' }, include: { user: { select: { name: true, email: true } }, gymPlans: { select: { id: true } } } })
  return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-4xl space-y-5 bg-bg p-6 text-text-primary"><div className="flex items-center justify-between"><h1 className="font-display text-xl uppercase">Пользователи · Тренажёрный зал</h1><Link className="text-sm text-accent" href="/admin/gym-exercises">Упражнения</Link></div><div className="grid gap-3 sm:grid-cols-2">{athletes.map(a => <Link key={a.id} href={`/gym/athletes/${a.id}/plans`}><Card className="flex items-center gap-3 transition-colors hover:border-accent"><UserRound className="text-accent"/><div><p className="font-medium">{a.displayName ?? a.user?.name ?? a.user?.email ?? 'Без имени'}</p><p className="text-xs text-text-secondary">Планов: {a.gymPlans.length}</p></div></Card></Link>)}</div></main>
}
