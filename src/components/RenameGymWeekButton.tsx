'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button, Dialog, Input, useToast } from '@/components/ui'

type Props = {
  weekId: string
  weekNumber: number
  currentName: string | null
}

// Coach-only. Same dialog pattern as GymRenamePlanButton, but for the
// week's optional custom label (name) rather than a required plan name —
// weekNumber itself stays the authoritative identity and isn't editable
// here, this only sets the cosmetic label shown alongside "Неделя N".
// Submitting it blank clears the label back to plain "Неделя N".
export function RenameGymWeekButton({ weekId, weekNumber, currentName }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(currentName ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    setName(currentName ?? '')
    setError(null)
    setOpen(true)
  }

  async function handleSave() {
    const trimmed = name.trim()
    if (trimmed === (currentName ?? '')) {
      setOpen(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/gym/weeks/${weekId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось переименовать')
      }
      toast({ title: 'Неделя переименована', variant: 'success' })
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
        title="Переименовать неделю"
        aria-label={`Переименовать неделю ${weekNumber}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen} title={`Название недели ${weekNumber}`}>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Неделя ${weekNumber}`}
            className="w-full"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
          />
          <p className="text-xs text-text-secondary">Необязательно — оставьте пустым, чтобы показывался только номер.</p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading}>
              {loading ? 'Сохраняю...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
