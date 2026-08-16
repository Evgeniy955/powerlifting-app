import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

// First-run role assignment: put the coach's email(s) here (or manage via DB
// later). Everyone else who signs in becomes an ATHLETE and must be attached
// to a coach by that coach before they see any programming.
const COACH_EMAILS = (process.env.COACH_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

// Supabase Auth's OAuth redirect target (configured as the Google provider's
// redirect URL in the Supabase dashboard points here). Exchanges the auth
// code for a session, then — on a brand new Supabase user — provisions the
// matching row in our own `public."User"` table (role assignment + pending
// athlete-invite linking), mirroring what NextAuth's `createUser` event used
// to do via the Prisma adapter.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const { user } = data
  const email = (user.email ?? '').toLowerCase()

  const existing = await prisma.user.findUnique({ where: { id: user.id } })

  if (!existing) {
    const isCoach = COACH_EMAILS.includes(email)
    const name =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null
    const image = (user.user_metadata?.avatar_url as string | undefined) ?? null

    await prisma.user.create({
      data: {
        id: user.id,
        email,
        name,
        image,
        role: isCoach ? 'COACH' : 'ATHLETE',
      },
    })

    if (!isCoach) {
      // A coach may have already created a placeholder profile for this
      // exact email and invited them — link it instead of creating a second,
      // orphan one. Falls back to organic self-signup if no invite matches.
      const pendingInvite = await prisma.athleteProfile.findFirst({
        where: { userId: null, inviteStatus: 'PENDING', inviteEmail: email },
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
  }

  return NextResponse.redirect(`${origin}${next}`)
}
