import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

// The browser may not have the same Supabase Storage session as the app's
// cookie-backed server session on a preview domain. Create a short-lived URL
// only after the server has checked access to the specific gym client.
export async function POST(req: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  try {
    const user = await requireUser()
    const { athleteId: clientId } = await params
    await assertGymClientAccessible(clientId, user)
    const body = await req.json() as { fileName?: string; mimeType?: string; import?: boolean }
    if (!body.fileName || !ALLOWED_MIME_TYPES.has(body.mimeType ?? '')) {
      return NextResponse.json({ error: 'Недопустимый тип файла' }, { status: 400 })
    }

    const fileName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
    if (!fileName) return NextResponse.json({ error: 'Некорректное имя файла' }, { status: 400 })
    const path = `${clientId}/${body.import ? 'imports/' : ''}${crypto.randomUUID()}-${fileName}`
    const supabase = await createClient()
    const { data, error } = await supabase.storage.from('assessments').createSignedUploadUrl(path)
    if (error || !data) {
      console.error('Could not create assessment upload URL', { error: error?.message })
      return NextResponse.json({ error: 'Не удалось подготовить загрузку файла' }, { status: 502 })
    }
    return NextResponse.json({ path: data.path, token: data.token })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
