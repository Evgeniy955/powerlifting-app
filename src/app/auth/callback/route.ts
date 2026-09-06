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
  // The invite token from the emailed link (see sendInviteEmailInternal in
  // lib/email.ts: "/login?invite=<token>") — login/page.tsx forwards it
  // through as part of `redirectTo` when starting the Google OAuth flow, so
  // it survives the round trip and comes back here. Its presence (and match
  // below) is what "accepting the invite" now actually means — see the
  // pendingAthleteInvite/pendingGymClient lookups below.
  const inviteToken = searchParams.get('invite')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const { user } = data
  const email = (user.email ?? '').toLowerCase()

  const existing = await prisma.user.findUnique({ where: { id: user.id } })

  if (!existing) {
    const isCoach = COACH_EMAILS.includes(email)

    // Closed signup: the only way into the app as an athlete/client is
    // clicking the actual link from an invite email — matched by BOTH the
    // token that link carried AND the invited email (not just email alone).
    // Signing up "organically" with an email a coach happens to have typed
    // in, without ever opening that email, must not be enough — that used to
    // be exactly what happened here (this only checked inviteEmail, and for
    // GymClient didn't even require inviteStatus: 'PENDING'), so acceptance
    // was really just "first Google sign-in with the right address," invite
    // link optional. Coaches are still admitted straight from COACH_EMAILS,
    // no invite involved. Supabase Auth already created its own auth.users
    // row for this session by this point (a separate table we don't own) —
    // sign back out so the browser doesn't end up with a live Supabase
    // session pointing at a Google account with no matching row in our own
    // `public."User"`.
    const pendingAthleteInvite =
      isCoach || !inviteToken
        ? null
        : await prisma.athleteProfile.findFirst({
            where: { userId: null, inviteStatus: 'PENDING', inviteToken, inviteEmail: email },
          })

    const pendingGymClient =
      isCoach || !inviteToken
        ? null
        : await prisma.gymClient.findFirst({
            where: { userId: null, inviteStatus: 'PENDING', inviteToken, inviteEmail: email },
          })

    if (!isCoach && !pendingAthleteInvite && !pendingGymClient) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=not_invited`)
    }

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

    if (pendingAthleteInvite) {
      await prisma.athleteProfile.update({
        where: { id: pendingAthleteInvite.id },
        data: { userId: user.id, inviteStatus: 'ACCEPTED' },
      })
    }

    if (pendingGymClient) {
      await prisma.gymClient.update({
        where: { id: pendingGymClient.id },
        data: { userId: user.id, inviteStatus: 'ACCEPTED' },
      })
    }
  } else if (inviteToken && existing.role !== 'COACH') {
    // A `public.User` row for this Supabase account already exists — most
    // commonly because they'd signed in before under the old, tokenless
    // linking (or their GymClient/AthleteProfile link was reset after being
    // granted without ever accepting — see authorization.ts's inviteStatus
    // check). Either way they can still be signed in without accepting
    // anything (Supabase Auth doesn't care), but that used to mean an invite
    // link landing on an already-known account silently did nothing —
    // "принял приглашение" only ever ran once, for a brand-new user, in the
    // block above. Re-run the same token-matched linking here so accepting
    // actually takes effect for a returning account too, as long as they
    // don't already have that profile type (userId is @unique on both
    // models, so linking a second one via a stale query would throw).
    const [alreadyAthlete, alreadyGymClient] = await Promise.all([
      prisma.athleteProfile.findUnique({ where: { userId: existing.id }, select: { id: true } }),
      prisma.gymClient.findUnique({ where: { userId: existing.id }, select: { id: true } }),
    ])

    const pendingAthleteInvite = alreadyAthlete
      ? null
      : await prisma.athleteProfile.findFirst({
          where: { userId: null, inviteStatus: 'PENDING', inviteToken, inviteEmail: email },
        })

    const pendingGymClient = alreadyGymClient
      ? null
      : await prisma.gymClient.findFirst({
          where: { userId: null, inviteStatus: 'PENDING', inviteToken, inviteEmail: email },
        })

    if (pendingAthleteInvite) {
      await prisma.athleteProfile.update({
        where: { id: pendingAthleteInvite.id },
        data: { userId: existing.id, inviteStatus: 'ACCEPTED' },
      })
    }

    if (pendingGymClient) {
      await prisma.gymClient.update({
        where: { id: pendingGymClient.id },
        data: { userId: existing.id, inviteStatus: 'ACCEPTED' },
      })
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
