import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'

// GET /api/exercises?q=присед — autocomplete search over the exercise catalog.
export async function GET(req: NextRequest) {
  try {
    await requireUser()
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
    const exercises = await prisma.exerciseCatalog.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: 20,
    })
    return NextResponse.json(exercises)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// POST /api/exercises — coach can add a custom exercise not in the seeded catalog.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    if (user.role !== 'COACH') {
      return NextResponse.json({ error: 'Доступно только тренеру' }, { status: 403 })
    }
    const body = await req.json()
    const { name, category, impactCoefficient } = body as {
      name: string
      category?: string
      impactCoefficient?: number
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
    }
    const exercise = await prisma.exerciseCatalog.create({
      data: { name: name.trim(), category, impactCoefficient: impactCoefficient ?? 1.0 },
    })
    return NextResponse.json(exercise, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
