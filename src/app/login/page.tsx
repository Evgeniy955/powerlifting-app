'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Dumbbell } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { HeroBackground } from '@/components/HeroBackground'
import { createClient } from '@/lib/supabase/client'

// SignInButton reads the invite token itself (rather than LoginPage passing
// it down) purely so useSearchParams() stays inside the Suspense boundary
// below — Next.js requires that during static rendering.
function SignInButton() {
  const token = useSearchParams().get('invite')

  const handleSignIn = async () => {
    const supabase = createClient()
    // Forwarding `invite` here is what makes accepting an invite actually
    // mean "clicked the link in the email": /auth/callback reads it back off
    // this same redirectTo URL (Supabase appends its own `?code=...` to
    // whatever we pass) and requires it to match a pending invite's token —
    // signing in with just the right email, invite link skipped, no longer
    // links the account. See auth/callback/route.ts.
    const redirectTo = token
      ? `${window.location.origin}/auth/callback?invite=${encodeURIComponent(token)}`
      : `${window.location.origin}/auth/callback`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
  }

  return (
    <Button className="mt-6 w-full" onClick={handleSignIn}>
      Войти через Google
    </Button>
  )
}

type InviteInfo = { displayName: string | null; coachName: string; kind?: 'ATHLETE' | 'GYM' }

function InviteBanner() {
  const token = useSearchParams().get('invite')
  const [invite, setInvite] = useState<InviteInfo | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`/api/invites/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setInvite)
      .catch(() => {})
  }, [token])

  if (!invite) return null

  return (
    <p className="mt-2 text-sm text-text-secondary">
      Тренер <span className="text-text-primary">{invite.coachName}</span> приглашает вас
      {invite.displayName ? <> как <span className="text-text-primary">{invite.displayName}</span></> : null}
      {invite.kind === 'GYM' ? ' в тренажёрный зал' : null}.
    </p>
  )
}

function ErrorNotice() {
  const error = useSearchParams().get('error')
  if (!error) return null
  if (error === 'not_invited') {
    return (
      <p className="mt-2 text-sm text-danger">
        Этот email не приглашён. Попросите тренера отправить приглашение и
        попробуйте снова.
      </p>
    )
  }
  return (
    <p className="mt-2 text-sm text-danger">
      Не получилось войти. Попробуйте ещё раз.
    </p>
  )
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden bg-bg px-4 text-text-primary">
      <HeroBackground />

      <Card className="relative w-full max-w-sm text-center animate-slide-up" padding="md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent animate-fade-in">
          <Dumbbell className="h-6 w-6" />
        </div>

        <h1 className="mt-4 font-display text-2xl uppercase tracking-wide text-text-primary">
          Iron<span className="text-accent">Ledger</span>
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Войди через Google, чтобы продолжить.
        </p>
        <Suspense fallback={null}>
          <InviteBanner />
          <ErrorNotice />
          <SignInButton />
        </Suspense>
      </Card>
    </main>
  )
}
