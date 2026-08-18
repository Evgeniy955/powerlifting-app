'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Dumbbell } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { HeroBackground } from '@/components/HeroBackground'
import { createClient } from '@/lib/supabase/client'

type InviteInfo = { displayName: string | null; coachName: string }

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
      {invite.displayName ? <> как <span className="text-text-primary">{invite.displayName}</span></> : null}.
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
  const handleSignIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

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
        </Suspense>

        <Button className="mt-6 w-full" onClick={handleSignIn}>
          Войти через Google
        </Button>
      </Card>
    </main>
  )
}
