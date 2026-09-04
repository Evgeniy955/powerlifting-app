import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileDown } from 'lucide-react'
import { requireUser } from '@/lib/session'
import { getGymWeekForDisplay, formatGymWeekDateRange } from '@/lib/gym'
import { assertGymClientAccessible } from '@/lib/authorization'
import { AiCoachButton } from '@/components/AiCoachButton'
import { GymWeekView } from '@/components/GymWeekView'
export default async function GymWeekPage({params}:{params:Promise<{weekId:string}>}) { const user=await requireUser(); const {weekId}=await params; const week=await getGymWeekForDisplay(weekId); if(!week) notFound(); await assertGymClientAccessible(week.plan.clientId,user); const dateRange=formatGymWeekDateRange(week.workouts); return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-6xl space-y-5 bg-bg p-6 text-text-primary"><div className="flex items-center justify-between"><div><Link href={`/gym/plans/${week.planId}`} className="text-sm text-text-secondary">← {week.plan.name}</Link><h1 className="font-display text-xl uppercase">Неделя {week.weekNumber}</h1>{dateRange&&<p className="text-xs text-text-secondary">{dateRange}</p>}</div><div className="flex items-center gap-2">{user.role==='COACH'&&<AiCoachButton scope="mesocycle" athleteId={week.plan.clientId} contextName={`Неделя ${week.weekNumber}`} endpoint="gym"/>}<a href={`/api/gym/weeks/${week.id}/export`} title="Экспорт в PDF" aria-label="Экспорт в PDF" className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"><FileDown className="h-4 w-4"/></a></div></div><GymWeekView weekId={week.id} workouts={week.workouts} canEdit={user.role==='COACH'}/></main> }
