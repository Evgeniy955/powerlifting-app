import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { getGymWeekForDisplay } from '@/lib/gym'
import { assertGymClientAccessible } from '@/lib/authorization'
import { AiCoachButton } from '@/components/AiCoachButton'
import { GymWeekView } from '@/components/GymWeekView'
export default async function GymWeekPage({params}:{params:Promise<{weekId:string}>}) { const user=await requireUser(); const {weekId}=await params; const week=await getGymWeekForDisplay(weekId); if(!week) notFound(); await assertGymClientAccessible(week.plan.clientId,user); return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-6xl space-y-5 bg-bg p-6 text-text-primary"><div className="flex items-center justify-between"><div><Link href={`/gym/plans/${week.planId}`} className="text-sm text-text-secondary">← {week.plan.name}</Link><h1 className="font-display text-xl uppercase">Микроцикл {week.weekNumber}</h1></div>{user.role==='COACH'&&<AiCoachButton scope="mesocycle" athleteId={week.plan.clientId} contextName={`Неделя ${week.weekNumber}`} endpoint="gym"/>}</div><GymWeekView weekId={week.id} workouts={week.workouts} canEdit={user.role==='COACH'}/></main> }
