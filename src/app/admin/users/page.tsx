import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { AdminUsersView } from '@/components/AdminUsersView'

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
    },
  })

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-4xl">
      <div>
        <h1 className="font-display text-xl uppercase tracking-wide">Пользователи</h1>
        <p className="text-sm text-text-secondary">
          Роль «Тренер» открывает доступ к атлетам, планированию и этой странице.
        </p>
      </div>

      <AdminUsersView initialUsers={users} currentUserId={user.id} />
    </main>
  )
}
