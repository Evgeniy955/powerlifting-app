import Link from 'next/link'
import { UserPlus, UserRound } from 'lucide-react'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { Badge, Card, buttonVariants } from '@/components/ui'
import { GymInviteClientButton } from '@/components/GymInviteClientButton'
import { EditGymClientButton } from '@/components/EditGymClientButton'
import { DeleteGymClientButton } from '@/components/DeleteGymClientButton'
import { AutoRefreshOnMount } from '@/components/AutoRefreshOnMount'

type GymClientCard = Prisma.GymClientGetPayload<{
  include: { user: { select: { name: true; email: true } }; plans: { select: { id: true } } }
}>

export default async function GymAthletesPage() {
  const user = await requireUser(); if (user.role !== 'COACH') redirect('/')
  let clients: GymClientCard[]
  try {
    clients = await prisma.gymClient.findMany({ where: { coachId: user.id }, orderBy: { displayName: 'asc' }, include: { user: { select: { name: true, email: true } }, plans: { select: { id: true } } } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2021', 'P2022'].includes(error.code)) {
      return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-4xl space-y-5 bg-bg p-6 text-text-primary"><h1 className="font-display text-xl uppercase">Подопечные · Тренажёрный зал</h1><Card><p className="font-medium">Режим обновляется</p><p className="mt-1 text-sm text-text-secondary">Таблицы подопечных ещё не созданы в базе данных. После применения миграции эта страница станет доступна автоматически.</p></Card></main>
    }
    throw error
  }
  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-4xl space-y-5 bg-bg p-6 text-text-primary">
      <AutoRefreshOnMount />
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl uppercase">Подопечные · Тренажёрный зал</h1>
        <Link className={buttonVariants({ size: 'sm' })} href="/gym/athletes/new"><UserPlus className="h-4 w-4" /> Подопечный</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {clients.map((client) => {
          const name = client.displayName ?? client.user?.name ?? client.user?.email ?? 'Без имени'
          return (
            <Card key={client.id} className="space-y-3">
              <div className="flex items-center gap-3">
                <Link href={`/gym/athletes/${client.id}/plans`} className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:opacity-80">
                  <UserRound className="text-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{name}</p>
                      {client.userId && client.inviteStatus === 'ACCEPTED' && <Badge tone="low">Приглашение принято</Badge>}
                      {!client.userId && client.inviteStatus === 'PENDING' && <Badge tone="moderate">Приглашение отправлено</Badge>}
                      {!client.userId && client.inviteStatus === 'NONE' && <Badge tone="neutral">Не приглашён</Badge>}
                    </div>
                    <p className="text-xs text-text-secondary">Планов: {client.plans.length}</p>
                  </div>
                </Link>
                <div className="flex shrink-0 gap-2">
                  <EditGymClientButton clientId={client.id} displayName={client.displayName} />
                  <DeleteGymClientButton clientId={client.id} clientName={name} accepted={!!client.userId} />
                </div>
              </div>
              {!client.userId && (
                <div className="border-t border-border pt-3">
                  <GymInviteClientButton clientId={client.id} inviteEmail={client.inviteEmail} />
                </div>
              )}
            </Card>
          )
        })}
        {!clients.length && <Card><p className="text-sm text-text-secondary">Подопечных пока нет. Добавьте первого.</p></Card>}
      </div>
    </main>
  )
}
