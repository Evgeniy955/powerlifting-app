import Link from 'next/link'
import { UserPlus, UserRound } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { Card, buttonVariants } from '@/components/ui'

export default async function GymAthletesPage() {
  const user = await requireUser(); if (user.role !== 'COACH') redirect('/')
  const clients = await prisma.gymClient.findMany({ where: { coachId: user.id }, orderBy: { displayName: 'asc' }, include: { user: { select: { name: true, email: true } }, plans: { select: { id: true } } } })
  return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-4xl space-y-5 bg-bg p-6 text-text-primary"><div className="flex items-center justify-between"><h1 className="font-display text-xl uppercase">Клиенты · Тренажёрный зал</h1><Link className={buttonVariants({size:'sm'})} href="/gym/athletes/new"><UserPlus className="h-4 w-4"/> Клиент</Link></div><div className="grid gap-3 sm:grid-cols-2">{clients.map(client => <Link key={client.id} href={`/gym/athletes/${client.id}/plans`}><Card className="flex items-center gap-3 transition-colors hover:border-accent"><UserRound className="text-accent"/><div><p className="font-medium">{client.displayName ?? client.user?.name ?? client.user?.email ?? 'Без имени'}</p><p className="text-xs text-text-secondary">Планов: {client.plans.length}</p></div></Card></Link>)}{!clients.length&&<Card><p className="text-sm text-text-secondary">Клиентов пока нет. Добавьте первого клиента.</p></Card>}</div></main>
}
