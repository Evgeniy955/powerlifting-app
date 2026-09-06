import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'
// Coach-only — records a health/assessment document (used by both the health
// profile page and the plan-import flow, both of which are coach tools; see
// src/app/api/gym/athletes/[athleteId]/health/route.ts for the same change.
export async function POST(req:Request,{params}:{params:Promise<{athleteId:string}>}){const coach=await requireCoach();const {athleteId:clientId}=await params;await assertGymClientBelongsToCoach(clientId,coach.id);const b=await req.json() as {fileName?:string;mimeType?:string;storagePath?:string};if(!b.fileName||!b.storagePath)return NextResponse.json({error:'Не указан файл'},{status:400});if(!b.storagePath.startsWith(`${clientId}/`)||b.storagePath.includes('..'))return NextResponse.json({error:'Некорректный путь файла'},{status:400});if(!/^(image\/(png|jpeg|webp)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/.test(b.mimeType??''))return NextResponse.json({error:'Недопустимый тип файла'},{status:400});const record=await prisma.gymClientAssessment.create({data:{clientId,fileName:b.fileName.slice(0,255),mimeType:b.mimeType!,storagePath:b.storagePath.slice(0,500)}});return NextResponse.json(record,{status:201})}
