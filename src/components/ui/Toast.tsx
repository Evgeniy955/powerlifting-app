'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, X, XCircle } from 'lucide-react'

export type ToastVariant = 'default' | 'success' | 'error'
type ToastItem = { id: string; title: string; description?: string; variant: ToastVariant }
type ToastInput = Omit<ToastItem, 'id'>

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null)

// Action-level outcomes (delete succeeded/failed, import committed) go here.
// Field-level validation stays as inline text next to the field — this is
// additive, not a replacement for that pattern.
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const variantClasses: Record<ToastVariant, string> = {
  default: 'border-border',
  success: 'border-zone-low',
  error: 'border-danger',
}

const variantIcon: Record<ToastVariant, typeof CheckCircle2 | null> = {
  default: null,
  success: CheckCircle2,
  error: XCircle,
}

const variantIconClasses: Record<ToastVariant, string> = {
  default: '',
  success: 'text-zone-low',
  error: 'text-danger',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // Defer the portal to after mount — rendering it during the initial client
  // pass (before hydration completes) mismatches the server, which never
  // renders it, and React flags that as a hydration error.
  useEffect(() => setMounted(true), [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID()
      setToasts((prev) => [...prev, { ...input, id }])
      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {mounted &&
        createPortal(
          <div className="fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:left-auto sm:right-4 sm:items-end">
            {toasts.map((t) => {
              const Icon = variantIcon[t.variant]
              return (
                <div
                  key={t.id}
                  role="status"
                  className={`flex w-full max-w-sm items-start gap-2 rounded-lg border bg-surface p-3 shadow-elevated animate-slide-up ${variantClasses[t.variant]}`}
                >
                  {Icon && <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${variantIconClasses[t.variant]}`} />}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">{t.title}</p>
                    {t.description && (
                      <p className="mt-0.5 text-xs text-text-secondary">{t.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(t.id)}
                    aria-label="Закрыть"
                    className="text-text-secondary hover:text-text-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  )
}
