'use client'

import { Lock, LockOpen } from 'lucide-react'

type Props = {
  locked: boolean
  onToggle: () => void
  // 'on-accent' for headers that already sit on the accent-colored bar
  // (WeekDayTable's week-mode day header) so the icon reads against that
  // background instead of the default surface-colored one.
  variant?: 'default' | 'on-accent'
  className?: string
}

// Padlock toggle gating an editable area — every caller defaults its own
// `locked` state to true, so a stray tap in the gym doesn't remove a set or
// delete a whole exercise; the coach/athlete has to explicitly tap this to
// unlock before anything below it becomes interactive again. Re-keying the
// icon on every toggle replays the existing scale-in keyframe as a small
// "click" pop instead of swapping instantly.
export function LockToggle({ locked, onToggle, variant = 'default', className = '' }: Props) {
  const colors =
    variant === 'on-accent'
      ? locked
        ? 'text-on-accent/80 hover:bg-black/10 hover:text-on-accent'
        : 'text-zone-low hover:bg-black/10'
      : locked
        ? 'text-text-secondary hover:bg-surface-2 hover:text-accent'
        : 'text-zone-low hover:bg-surface-2'

  return (
    <button
      type="button"
      onClick={(e) => {
        // Defensive: WeekDayTable's day header renders this button next to a
        // navigation Link, not nested inside it, but stopping propagation
        // here costs nothing and protects against a future layout where it
        // does end up nested.
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      aria-label={locked ? 'Разрешить редактирование' : 'Запретить редактирование'}
      aria-pressed={!locked}
      title={locked ? 'Разрешить редактирование' : 'Запретить редактирование'}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-90 ${colors} ${className}`}
    >
      {locked ? (
        <Lock key="locked" className="h-4 w-4 animate-scale-in" />
      ) : (
        <LockOpen key="unlocked" className="h-4 w-4 animate-scale-in" />
      )}
    </button>
  )
}
