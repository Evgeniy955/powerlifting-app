// Deprecated: NextAuth has been replaced by Supabase Auth. Sign-in now goes
// through supabase.auth.signInWithOAuth() (see src/app/login/page.tsx) and
// the OAuth redirect lands on src/app/auth/callback/route.ts instead of
// this route. Left in place (can't be deleted from this environment) but
// unused — no routes link here anymore.
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'))
}
