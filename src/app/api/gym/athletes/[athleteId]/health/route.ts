import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'
// Coach-only, matching the profile page itself (src/app/gym/athletes/[athleteId]/profile/page.tsx)
// — used to allow the client too via assertGymClientAccessible, but health
// data/assessments are recorded about a client by their coach, not
// self-service, so the server enforces the same restriction the page's own
// redirect and the hidden "Подопечный" link already imply on the frontend.
export async function PUT(req:Request,{params}:{params:Promise<{athleteId:string}>}){const coach=await requireCoach();const {athleteId:clientId}=await params;await assertGymClientBelongsToCoach(clientId,coach.id);const b=await req.json() as {injuries?:string;contraindications?:string;notes?:string};const profile=await prisma.gymClientHealthProfile.upsert({where:{clientId},create:{clientId,injuries:b.injuries?.slice(0,10000),contraindications:b.contraindications?.slice(0,10000),notes:b.notes?.slice(0,10000)},update:{injuries:b.injuries?.slice(0,10000),contraindications:b.contraindications?.slice(0,10000),notes:b.notes?.slice(0,10000)}});return NextResponse.json(profile)}
