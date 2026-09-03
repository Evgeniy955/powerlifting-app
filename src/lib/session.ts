import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { prisma } from './prisma'

export type SessionUser = {
  id: string
  role: 'COACH' | 'ATHLETE'
  email?: string | null
  name?: string | null
  image?: string | null
  // "Упрощённый режим" preference — stored on the User row so it follows the
  // account across devices/browsers instead of living in localStorage.
  simplifiedView: boolean
  // "Компактный режим" preference — same reasoning as simplifiedView above.
  compactView: boolean
}

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

/** Returns the signed-in user (Supabase Auth session + our own role/profile
 * row), or null if nobody is signed in. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser) return null

  return {
    id: dbUser.id,
    role: dbUser.role === 'COACH' ? 'COACH' : 'ATHLETE',
    email: dbUser.email,
    name: dbUser.name,
    image: dbUser.image,
    simplifiedView: dbUser.simplifiedView,
    compactView: dbUser.compactView,
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) throw new UnauthorizedError('Не авторизован')
  return user
}

export async function requireCoach(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'COACH') throw new ForbiddenError('Доступно только тренеру')
  return user
}

/** Maps the two guard errors to HTTP status codes for route handlers. */
export function statusForAuthError(e: unknown): number {
  if (e instanceof UnauthorizedError) return 401
  if (e instanceof ForbiddenError) return 403
  if (e instanceof NotFoundError) return 404
  return 500
}

/**
 * Converts unexpected route errors into a safe API response. Authentication
 * and ownership errors are intentionally client-readable; all other errors
 * may contain database, provider, or stack details and are logged only on the
 * server.
 */
export function apiErrorResponse(e: unknown) {
  const status = statusForAuthError(e)
  if (status === 500) {
    console.error('API request failed', { errorType: e instanceof Error ? e.name : typeof e })
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status })
  }

  const message = e instanceof Error ? e.message : 'Не удалось выполнить запрос'
  return NextResponse.json({ error: message }, { status })
}
