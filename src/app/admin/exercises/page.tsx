import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { AdminExercisesView } from '@/components/AdminExercisesView'
import Link from 'next/link'

// Coach-only exercise catalog management. No separate ADMIN role in this
// app — COACH is already the privileged tier, same as /admin/users.
export default async function AdminExercisesPage() {
  const user = await requireUser()
  if (user.role !== 'COACH') redirect('/')

  const exercises = await prisma.exerciseCatalog.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { exerciseEntries: true, oneRepMaxes: true } },
    },
  })

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-6 lg:max-w-4xl">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <Link
            href="/admin/users"
            className="text-text-secondary transition-colors hover:text-accent hover:underline"
          >
            Пользователи
          </Link>
          <span className="text-text-secondary">·</span>
          <span className="text-accent">Упражнения</span>
        </div>
        <h1 className="font-display text-xl uppercase tracking-wide">Упражнения</h1>
        <p className="text-sm text-text-secondary">
          Переименование сразу обновляется во всех программах — название читается из каталога, а
          не копируется в тренировки. Удалить можно только упражнение, которое нигде не
          используется.
        </p>
      </div>

      <AdminExercisesView initialExercises={exercises} />
    </main>
  )
}
