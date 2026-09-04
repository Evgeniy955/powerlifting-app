import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileDown } from 'lucide-react'
import { requireUser } from '@/lib/session'
import { getGymWorkoutForDisplay } from '@/lib/gym'
import { assertGymClientAccessible } from '@/lib/authorization'
import { GymWorkoutEditor } from '@/components/GymWorkoutEditor'
export default async function GymWorkoutPage({params}:{params:Promise<{workoutId:string}>}) { const user=await requireUser(); const {workoutId}=await params; const workout=await getGymWorkoutForDisplay(workoutId); if(!workout) notFound(); await assertGymClientAccessible(workout.week.plan.clientId,user); return <main className="min-h-[calc(100vh-3.5rem)] bg-bg py-6 text-text-primary"><div className="mx-auto mb-4 flex max-w-5xl items-center justify-between px-4"><Link href={`/gym/weeks/${workout.weekId}`} className="text-sm text-text-secondary">← Неделя {workout.week.weekNumber}</Link><a href={`/api/gym/workouts/${workout.id}/export`} title="Экспорт в PDF" aria-label="Экспорт в PDF" className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"><FileDown className="h-4 w-4"/></a></div><GymWorkoutEditor workoutId={workout.id} entries={workout.entries} canEdit={user.role==='COACH'} initialCompact={user.compactView}/></main> }
