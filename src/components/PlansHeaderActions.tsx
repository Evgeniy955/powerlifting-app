'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarRange, MoreVertical, Plus, X } from 'lucide-react'
import { buttonVariants } from '@/components/ui'
import { CreatePlanDialog } from './CreatePlanDialog'

type Props = { athleteId: string }

// Coach-only header actions for the athlete's "Планы" page — "Периодизация"
// and "Создать план", sitting next to a title that already competes for
// width with the athlete's name. Same two actions on both breakpoints, just
// different chrome: inline buttons where there's room (md+), collapsed
// behind a hamburger on mobile — mirrors AppHeader's own MobileNavMenu.
export function PlansHeaderActions({ athleteId }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="hidden items-center gap-2 md:flex">
        <Link
          href={`/athletes/${athleteId}/periodization`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <CalendarRange className="h-4 w-4" /> Периодизация
        </Link>
        <CreatePlanDialog athleteId={athleteId} />
      </div>

      {/* Distinct look from AppHeader's own mobile hamburger (MobileNavMenu,
          "Menu" lines icon, plain/muted) on purpose — the two sit close
          together on this page (sticky site header right above, this row
          right below) and looked like the same control twice. Dots icon +
          accent-2 fill read as "this page's actions", not "site nav". */}
      <div className="relative md:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={open}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-2 text-on-accent-2 shadow-card transition-transform hover:scale-105"
        >
          {open ? <X className="h-5 w-5" /> : <MoreVertical className="h-5 w-5" />}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-border bg-surface p-2 shadow-elevated animate-scale-in">
              <Link
                href={`/athletes/${athleteId}/periodization`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <CalendarRange className="h-4 w-4" /> Периодизация
              </Link>
              <CreatePlanDialog
                athleteId={athleteId}
                renderTrigger={(openDialog) => (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      openDialog()
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
                  >
                    <Plus className="h-4 w-4" /> Создать план
                  </button>
                )}
              />
            </div>
          </>
        )}
      </div>
    </>
  )
}
