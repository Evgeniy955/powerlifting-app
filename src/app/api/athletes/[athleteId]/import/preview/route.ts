import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { parseWorkbookPreview } from '@/lib/excelImport'

async function assertAthleteBelongsToCoach(athleteId: string, coachId: string) {
  const athlete = await prisma.athleteProfile.findUnique({ where: { id: athleteId } })
  if (!athlete || athlete.coachId !== coachId) {
    throw new Error('Атлет не найден или не привязан к этому тренеру')
  }
}

// Real training-log spreadsheets are a few hundred KB at most — 20MB is
// generous headroom while still ruling out someone using this endpoint to
// push an oversized upload at the server (memory/CPU spent in parseWorkbookPreview).
const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024

// POST /api/athletes/:athleteId/import/preview — multipart upload (.xlsx/.xlsm),
// returns parsed rows split into recognized/unrecognized for coach review.
// Nothing is written to the DB by this step.
export async function POST(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const coach = await requireCoach()
    await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Файл не найден в запросе' }, { status: 400 })
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return NextResponse.json(
        { error: `Файл слишком большой (макс. ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} МБ)` },
        { status: 413 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const preview = await parseWorkbookPreview(buffer)

    return NextResponse.json(preview)
  } catch (e) {
    return apiErrorResponse(e)
  }
}
