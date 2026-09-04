import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { assertGymPlanAccess } from '@/lib/gym'
export async function GET(_: Request, { params }: { params: Promise<{ planId: string }> }) { const user=await requireUser(); const {planId}=await params; const plan=await assertGymPlanAccess(planId,user); if(!plan) return NextResponse.json({error:'План не найден'},{status:404}); return NextResponse.json(plan) }
