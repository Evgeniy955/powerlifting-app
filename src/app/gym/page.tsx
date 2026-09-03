import { getCurrentUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function GymHome() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = user.role === 'ATHLETE' ? await prisma.athleteProfile.findUnique({ where: { userId: user.id } }) : null
  const href = user.role === 'COACH' ? '/gym/athletes' : profile ? `/gym/athletes/${profile.id}/plans` : '/'
  redirect(href)
}
