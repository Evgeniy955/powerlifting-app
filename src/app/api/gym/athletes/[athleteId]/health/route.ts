import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'
export async function PUT(req:Request,{params}:{params:Promise<{athleteId:string}>}){const user=await requireUser();const {athleteId:clientId}=await params;await assertGymClientAccessible(clientId,user);const b=await req.json() as {injuries?:string;contraindications?:string;notes?:string};const profile=await prisma.gymClientHealthProfile.upsert({where:{clientId},create:{clientId,injuries:b.injuries?.slice(0,10000),contraindications:b.contraindications?.slice(0,10000),notes:b.notes?.slice(0,10000)},update:{injuries:b.injuries?.slice(0,10000),contraindications:b.contraindications?.slice(0,10000),notes:b.notes?.slice(0,10000)}});return NextResponse.json(profile)}
