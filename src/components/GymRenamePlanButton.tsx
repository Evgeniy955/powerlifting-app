'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button, Dialog, Input, useToast } from '@/components/ui'

type Props = {
  planId: string
  planName: string
}

// Coach-only. Mirrors RenameCycleButton (powerlifting side) — small pencil
// icon among the other per-card actions, opens a one-field dialog rather
// than editing inline since the card itself is a Link to the plan.
export function GymRenamePlanButton({ planId, planName }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(planName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    setName(planName)
    setError(null)
    setOpen(true)
  }

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === planName) {
      setOpen(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/gym/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось переименовать')
      }
      toast({ title: 'План переименован', variant: 'success' })
      setOpen(false)
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось переименовать', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          openDialog()
        }}
        title="Переименовать план"
        aria-label="Переименовать план"
        className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen} title="Переименовать план">
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название плана"
            className="w-full"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading || !name.trim()}>
              {loading ? 'Сохраняю...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
