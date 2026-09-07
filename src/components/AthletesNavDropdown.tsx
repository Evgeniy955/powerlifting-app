'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

type Props = {
  athletesHref: string
  gymHref: string
}

// Desktop-only dropdown consolidating a coach's two rosters — powerlifting
// athletes (Cycle-based) and gym clients (GymPlan-based) — under one "Мои
// спортсмены" trigger instead of two separate top-level nav links. A coach
// running both disciplines was left hunting between "Мои спортсмены" and
// "Тренажёрный зал" for what's really the same concept (their roster), just
// split by discipline.
export function AthletesNavDropdown({ athletesHref, gymHref }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-sm text-accent transition-colors hover:underline"
      >
        Мои спортсмены
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Click-outside catcher — sits under the panel (lower z), above the page. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute left-0 z-30 mt-2 w-48 rounded-lg border border-border bg-surface p-2 shadow-elevated animate-scale-in"
          >
            <Link
              href={athletesHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
            >
              Пауэрлифтинг
            </Link>
            <Link
              href={gymHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
            >
              Тренажёрный зал
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
