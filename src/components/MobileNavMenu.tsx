'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, Menu, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export type MobileNavLink = {
  href: string
  label: string
  // Matches the desktop nav's accent-colored "primary" link per role
  // (Мои спортсмены / Мои планы) vs. its muted secondary one.
  emphasis?: boolean
}

type Props = {
  userLabel: string
  links: MobileNavLink[]
}

// Mobile-only (md:hidden) hamburger revealing what the desktop header already
// shows inline but the compact mobile bar has no room for: the signed-in
// user's name and the role-specific nav links (Мои спортсмены/Админка for a
// coach, Мои планы/Спортпит for an athlete). Theme switcher stays visible on
// mobile as-is. Sign-out lives here too (duplicating SignOutButton's tiny
// handler rather than sharing it) — with it also rendered inline the row got
// wide enough to push this hamburger itself off the right edge of narrow
// phones, so it only shows inline on desktop (see AppHeader) and moves in
// here for mobile.
export function MobileNavMenu({ userLabel, links }: Props) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <>
          {/* Click-outside catcher — sits under the panel (lower z), above the page. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-border bg-surface p-2 shadow-elevated animate-scale-in">
            <p className="truncate px-2 py-1.5 text-sm text-text-secondary">{userLabel}</p>
            {links.length > 0 && <div className="my-1 border-t border-border" />}
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-surface-2 ${
                  link.emphasis ? 'text-accent' : 'text-text-secondary hover:text-accent'
                }`}
              >
                {link.label}
              </Link>
            ))}

            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                handleSignOut()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-danger"
            >
              <LogOut className="h-4 w-4" /> Выйти
            </button>
          </div>
        </>
      )}
    </div>
  )
}
