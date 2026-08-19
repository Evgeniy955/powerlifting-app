import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'
import { assertCanAccessSupplement } from '@/lib/authorization'

// PATCH /api/athletes/:athleteId/supplements/:supplementId
// { name?, startDate?, endDate?, notes? } — endDate: null clears it (still
// taking it), a date string sets it, omitted leaves it unchanged.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { athleteId: string; supplementId: string } }
) {
  try {
    const user = await requireUser()
    const existing = await assertCanAccessSupplement(params.supplementId, user)

    const body = (await req.json()) as {
      name?: string
      startDate?: string
      endDate?: string | null
      notes?: string | null
    }
    const data: {
      name?: string
      startDate?: Date
      endDate?: Date | null
      notes?: string | null
    } = {}

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
      data.name = name
    }
    if (body.startDate !== undefined) {
      const start = new Date(body.startDate)
      if (isNaN(start.getTime())) {
        return NextResponse.json({ error: 'Некорректная дата начала' }, { status: 400 })
      }
      data.startDate = start
    }
    if (body.endDate !== undefined) {
      if (body.endDate === null) {
        data.endDate = null
      } else {
        const end = new Date(body.endDate)
        if (isNaN(end.getTime())) {
          return NextResponse.json({ error: 'Некорректная дата окончания' }, { status: 400 })
        }
        data.endDate = end
      }
    }
    if (body.notes !== undefined) {
      data.notes = body.notes?.trim() || null
    }

    const start = data.startDate ?? existing.startDate
    const end = data.endDate !== undefined ? data.endDate : existing.endDate
    if (end && end < start) {
      return NextResponse.json({ error: 'Дата окончания раньше даты начала' }, { status: 400 })
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 })
    }

    const updated = await prisma.supplement.update({
      where: { id: params.supplementId },
      data,
    })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// DELETE /api/athletes/:athleteId/supplements/:supplementId
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { athleteId: string; supplementId: string } }
) {
  try {
    const user = await requireUser()
    await assertCanAccessSupplement(params.supplementId, user)

    await prisma.supplement.delete({ where: { id: params.supplementId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
