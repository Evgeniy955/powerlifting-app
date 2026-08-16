'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
}

// Hand-rolled modal (no Radix — see design-system decision to extend the
// existing primitive set rather than adopt shadcn for a ~19-component app).
// Covers the accessibility basics that matter here: aria-modal, Escape to
// close, backdrop click to close, focus moved into the dialog on open and
// returned to the trigger on close, body scroll locked while open.
export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  const [mounted, setMounted] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return

    triggerRef.current = document.activeElement
    dialogRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [open, onOpenChange])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-elevated outline-none animate-scale-in"
      >
        <h2 id="dialog-title" className="font-display text-lg tracking-wide text-text-primary">
          {title}
        </h2>
        {description && (
          <p id="dialog-description" className="mt-2 text-sm text-text-secondary">
            {description}
          </p>
        )}
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body
  )
}
