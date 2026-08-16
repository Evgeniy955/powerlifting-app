import { getServerSession } from 'next-auth'
import { authOptions } from './auth'

export type SessionUser = {
  id: string
  role: 'COACH' | 'ATHLETE'
  email?: string | null
  name?: string | null
}

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

export async function requireUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new UnauthorizedError('Не авторизован')
  return session.user as unknown as SessionUser
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
