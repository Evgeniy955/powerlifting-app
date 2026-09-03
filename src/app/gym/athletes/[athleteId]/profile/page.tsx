import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'
import { GymHealthProfile } from '@/components/GymHealthProfile'
export default async function GymProfilePage({params}:{params:Promise<{athleteId:string}>}) { const user=await requireUser(); const {athleteId:clientId}=await params; const client=await assertGymClientAccessible(clientId,user); const data=await prisma.gymClientHealthProfile.findUnique({where:{clientId}}); const assessments=await prisma.gymClientAssessment.findMany({where:{clientId},orderBy:{createdAt:'desc'},select:{id:true,fileName:true,mimeType:true,createdAt:true}}); return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-4xl bg-bg p-6 text-text-primary"><GymHealthProfile clientId={client.id} clientName={client.displayName ?? client.userId ?? 'Клиент'} initial={data} assessments={assessments.map(x=>({...x,createdAt:x.createdAt.toISOString()}))}/></main> }
