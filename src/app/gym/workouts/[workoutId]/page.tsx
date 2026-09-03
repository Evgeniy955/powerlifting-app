import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { getGymWorkoutForDisplay } from '@/lib/gym'
import { assertGymClientAccessible } from '@/lib/authorization'
import { GymWorkoutEditor } from '@/components/GymWorkoutEditor'
export default async function GymWorkoutPage({params}:{params:Promise<{workoutId:string}>}) { const user=await requireUser(); const {workoutId}=await params; const workout=await getGymWorkoutForDisplay(workoutId); if(!workout) notFound(); await assertGymClientAccessible(workout.week.plan.clientId,user); return <main className="min-h-[calc(100vh-3.5rem)] bg-bg py-6 text-text-primary"><div className="mb-4 text-center"><Link href={`/gym/weeks/${workout.weekId}`} className="text-sm text-text-secondary">← Микроцикл {workout.week.weekNumber}</Link></div><GymWorkoutEditor workoutId={workout.id} entries={workout.entries} canEdit={user.role==='COACH'}/></main> }
