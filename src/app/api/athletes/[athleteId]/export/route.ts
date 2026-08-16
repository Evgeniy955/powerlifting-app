import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'
import { buildAthleteWorkbook } from '@/lib/excelExport'
import { athleteDisplayName } from '@/lib/athlete'

// GET /api/athletes/:athleteId/export — streams a readable .xlsx (same access rule
// as analytics: coach can export their athletes, athlete can export themself).
export async function GET(_req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const user = await requireUser()
    const athlete = await prisma.athleteProfile.findUnique({
      where: { id: params.athleteId },
      include: { user: true },
    })
    if (!athlete) {
      return NextResponse.json({ error: 'Атлет не найден' }, { status: 404 })
    }
    const owns = user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id
    if (!owns) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    const workbook = await buildAthleteWorkbook(params.athleteId)
    const buffer = await workbook.xlsx.writeBuffer()

    const fileName = `${athleteDisplayName(athlete).replace(/[^\w\-]+/g, '_')}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
