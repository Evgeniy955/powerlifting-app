import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './prisma'

// First-run role assignment: put the coach's email(s) here (or manage via DB later).
// Everyone else who signs in becomes an ATHLETE and must be attached to a coach
// by that coach before they see any programming.
const COACH_EMAILS = (process.env.COACH_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],
  session: { strategy: 'database' },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        ;(session.user as { id: string; role: string }).id = user.id
        ;(session.user as { id: string; role: string }).role =
          (user as { role?: string }).role ?? 'ATHLETE'
      }
      return session
    },
  },
  events: {
    async createUser({ user }) {
      const isCoach = COACH_EMAILS.includes((user.email ?? '').toLowerCase())
      await prisma.user.update({
        where: { id: user.id },
        data: { role: isCoach ? 'COACH' : 'ATHLETE' },
      })
      if (!isCoach) {
        // A coach may have already created a placeholder profile for this exact
        // email and invited them — link it instead of creating a second, orphan
        // one. Matching is by Google-verified email alone (no token in the OAuth
        // flow itself); falls back to today's organic self-signup behavior if
        // no pending invite matches.
        const pendingInvite = await prisma.athleteProfile.findFirst({
          where: {
            userId: null,
            inviteStatus: 'PENDING',
            inviteEmail: (user.email ?? '').toLowerCase(),
          },
        })
        if (pendingInvite) {
          await prisma.athleteProfile.update({
            where: { id: pendingInvite.id },
            data: { userId: user.id, inviteStatus: 'ACCEPTED' },
          })
        } else {
          await prisma.athleteProfile.create({ data: { userId: user.id } })
        }
      }
    },
  },
  pages: {
    signIn: '/login',
  },
}
