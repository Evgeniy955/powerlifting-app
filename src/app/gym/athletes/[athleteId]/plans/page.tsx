import Link from 'next/link'
import { FileUp, UserRound } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'
import { GymPlanActions } from '@/components/GymPlanActions'
import { Card, buttonVariants } from '@/components/ui'

export default async function GymPlansPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId: clientId } = await params; const user = await requireUser(); const client = await assertGymClientAccessible(clientId, user)
  const plans = await prisma.gymPlan.findMany({ where: { clientId }, orderBy: { startDate: 'desc' }, include: { weeksData: { select: { id: true } } } })
  const clientName = client.displayName ?? client.userId ?? 'Клиент'
  return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-4xl space-y-5 bg-bg p-6 text-text-primary"><div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/gym" className="text-sm text-text-secondary">← Тренажёрный зал</Link><h1 className="font-display text-xl uppercase">Планы — {clientName}</h1></div><div className="flex gap-2"><Link href={`/gym/athletes/${clientId}/profile`} className={buttonVariants({variant:'outline',size:'sm'})}><UserRound className="h-4 w-4"/> Клиент</Link><Link href={`/gym/athletes/${clientId}/import`} className={buttonVariants({variant:'outline',size:'sm'})}><FileUp className="h-4 w-4"/> Импорт</Link>{user.role === 'COACH' && <GymPlanActions clientId={clientId}/>}</div></div><div className="grid gap-3 sm:grid-cols-2">{plans.map(p => <Link key={p.id} href={`/gym/plans/${p.id}`}><Card className="space-y-2 hover:border-accent"><h2 className="font-display uppercase">{p.name}</h2><p className="text-sm text-text-secondary">{p.startDate.toISOString().slice(0,10)} · {p.weeks} недель</p><p className="text-xs text-text-secondary">Микроциклов: {p.weeksData.length}</p></Card></Link>)}{!plans.length && <Card><p className="text-sm text-text-secondary">Планов пока нет.</p></Card>}</div></main>
}
