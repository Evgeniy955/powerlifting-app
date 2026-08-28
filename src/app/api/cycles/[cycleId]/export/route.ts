import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { buildCycleWorkbook } from '@/lib/excelExport'

// GET /api/cycles/:cycleId/export — streams one plan as .xlsx, laid out to
// match the original spreadsheet this app replaced (see lib/excelExport.ts).
// Lives on the plan itself (not the athlete) — same access rule as the rest
// of the cycle page: coach can export any of their athletes' plans, athlete
// can export their own.
export async function GET(_req: NextRequest, { params }: { params: { cycleId: string } }) {
  try {
    const user = await requireUser()
    const cycle = await prisma.cycle.findUnique({
      where: { id: params.cycleId },
      include: { athlete: true },
    })
    if (!cycle) {
      return NextResponse.json({ error: 'План не найден' }, { status: 404 })
    }
    const owns =
      user.role === 'COACH' ? cycle.athlete.coachId === user.id : cycle.athlete.userId === user.id
    if (!owns) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    const workbook = await buildCycleWorkbook(params.cycleId)
    const buffer = await workbook.xlsx.writeBuffer()

    const fileName = `${cycle.name.replace(/[^\w\-]+/g, '_')}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
