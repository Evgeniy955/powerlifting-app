import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { AdminUsersView } from '@/components/AdminUsersView'
import { AdminPendingInvites } from '@/components/AdminPendingInvites'
import Link from 'next/link'

// Coach-only role management screen. There's no separate ADMIN role in this
// app — COACH already is the privileged tier — so this is just "who's a coach
// vs. an athlete", editable by any signed-in coach. Role assignment otherwise
// only happens once, automatically, on first sign-in (via COACH_EMAILS in
// .env) — this page is the only way to change it afterwards without touching
// the database directly.
export default async function AdminUsersPage() {
  const user = await requireUser()
  if (user.role !== 'COACH') redirect('/')

  const users = await prisma.user.findMany({
    orderBy: { email: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      _count: { select: { coachedAthletes: true } },
      // Only meaningful for ATHLETE users — null means they were never
      // coach-invited at all (self-registered, or attached without ever
      // going through the email invite flow). coachId lets the card offer
      // "attach to me" for an athlete with a real account but no coach yet.
      athleteProfile: { select: { id: true, inviteStatus: true, coachId: true } },
    },
  })

  // Placeholder athletes with no linked user yet — invited or not — so a
  // coach can resend (or send for the first time) without having to go find
  // the athlete's own card on /athletes. Not scoped to the current coach,
  // same "any coach can act on anyone" rule as the rest of this page.
  const pendingInvites = await prisma.athleteProfile.findMany({
    where: { userId: null, archivedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      displayName: true,
      inviteEmail: true,
      inviteStatus: true,
      invitedAt: true,
      coach: { select: { name: true, email: true } },
      _count: { select: { cycles: true } },
    },
  })
  const pendingInvitesWithPlans = pendingInvites.map(({ _count, ...rest }) => ({
    ...rest,
    hasPlans: _count.cycles > 0,
  }))

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-6 lg:max-w-4xl">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <span className="text-accent">Пользователи</span>
          <span className="text-text-secondary">·</span>
          <Link
            href="/admin/exercises"
            className="text-text-secondary transition-colors hover:text-accent hover:underline"
          >
            Упражнения
          </Link>
        </div>
        <h1 className="font-display text-xl uppercase tracking-wide">Пользователи</h1>
        <p className="text-sm text-text-secondary">
          Роль «Тренер» открывает доступ к атлетам, планированию и этой странице.
        </p>
      </div>

      <AdminUsersView initialUsers={users} currentUserId={user.id} />

      {pendingInvitesWithPlans.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-display text-lg uppercase tracking-wide">Ожидают приглашения</h2>
          <AdminPendingInvites initialInvites={pendingInvitesWithPlans} />
        </div>
      )}
    </main>
  )
}
