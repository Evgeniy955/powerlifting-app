import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'

// Called after the client uploads a file straight to Supabase Storage
// (bucket "avatars", path "<userId>/..."). Business data (User.image) still
// lives behind Prisma, so we persist the resulting public URL here rather
// than letting the client write to the DB directly.
export async function PATCH(request: Request) {
  try {
    const user = await requireUser()
    const { url } = (await request.json()) as { url?: string }
    if (!url || !url.startsWith('https://') || !url.includes('/avatars/')) {
      return NextResponse.json({ error: 'Некорректная ссылка на файл' }, { status: 400 })
    }

    await prisma.user.update({ where: { id: user.id }, data: { image: url } })
    return NextResponse.json({ image: url })
  } catch (e) {
    return NextResponse.json({ error: 'Не удалось сохранить аватар' }, { status: statusForAuthError(e) })
  }
}
