import { Dumbbell } from 'lucide-react'
import { getCurrentUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { AvatarUploader } from './AvatarUploader'
import { SignOutButton } from './SignOutButton'
import { ThemeToggle } from './ThemeToggle'

// Shared top bar, rendered once from layout.tsx above every page.
//
// Two variants, same markup — Tailwind breakpoints do the work:
// - Mobile (default): compact single row, just the logo + sign-out. Pages keep
//   their own in-content navigation (back links, buttons), so the header stays
//   out of the way of the limited vertical space.
// - Desktop (md+): a full horizontal nav bar with the role's primary shortcut
//   spelled out, since there's room for persistent wayfinding instead of
//   relying on in-page back links alone.
export async function AppHeader() {
  const user = await getCurrentUser()

  let athleteProfileId: string | null = null
  if (user?.role === 'ATHLETE') {
    const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } })
    athleteProfileId = profile?.id ?? null
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-display uppercase tracking-wide text-text-primary"
        >
          <Dumbbell className="h-4 w-4 text-accent" />
          Iron<span className="text-accent">Ledger</span>
        </Link>

        <nav className="flex items-center gap-3 md:gap-4">
          {user && (
            <>
              <AvatarUploader userId={user.id} imageUrl={user.image ?? null} />
              <span className="hidden text-sm text-text-secondary md:inline">
                {user.name ?? user.email}
              </span>

              {user.role === 'COACH' && (
                <>
                  <Link
                    href="/athletes"
                    className="hidden text-sm text-accent transition-colors hover:underline md:inline"
                  >
                    Мои спортсмены
                  </Link>
                  <Link
                    href="/admin/users"
                    className="hidden text-sm text-text-secondary transition-colors hover:text-accent hover:underline md:inline"
                  >
                    Админка
                  </Link>
                </>
              )}
              {user.role === 'ATHLETE' && athleteProfileId && (
                <Link
                  href={`/athletes/${athleteProfileId}/cycles`}
                  className="hidden text-sm text-accent transition-colors hover:underline md:inline"
                >
                  Мои планы
                </Link>
              )}
            </>
          )}

          <ThemeToggle />
          {user && <SignOutButton />}
        </nav>
      </div>
    </header>
  )
}
