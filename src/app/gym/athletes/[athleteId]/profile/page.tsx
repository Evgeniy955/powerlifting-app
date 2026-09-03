import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { assertAthleteAccessible } from '@/lib/authorization'
import { GymHealthProfile } from '@/components/GymHealthProfile'
export default async function GymProfilePage({params}:{params:Promise<{athleteId:string}>}) { const user=await requireUser(); const {athleteId}=await params; const athlete=await assertAthleteAccessible(athleteId,user); const data=await prisma.athleteHealthProfile.findUnique({where:{athleteId}}); const assessments=await prisma.athleteAssessment.findMany({where:{athleteId},orderBy:{createdAt:'desc'},select:{id:true,fileName:true,mimeType:true,createdAt:true}}); return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-4xl bg-bg p-6 text-text-primary"><GymHealthProfile athleteId={athlete.id} athleteName={athlete.displayName ?? athlete.userId ?? 'Клиент'} initial={data} assessments={assessments.map(x=>({...x,createdAt:x.createdAt.toISOString()}))}/></main> }
