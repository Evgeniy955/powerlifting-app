'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Copy } from 'lucide-react'
import { Button, Dialog, Input, useToast } from '@/components/ui'

type Props = {
  planId: string
  planName: string
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// Coach-only "copy" icon on each plan card — copies the whole plan (every
// week, day, exercise and set) as a new plan for the same client, starting
// on a chosen date instead of the source's own start date. Mirrors
// CopyCycleButton on the powerlifting side.
export function GymCopyPlanButton({ planId, planName }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  function openDialog() {
    setName(`${planName} (копия)`)
    setStartDate(todayIso())
    setError(null)
    setOpen(true)
  }

  function openDatePicker() {
    if (typeof dateInputRef.current?.showPicker === 'function') {
      dateInputRef.current.showPicker()
    } else {
      dateInputRef.current?.focus()
    }
  }

  async function handleCopy() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/gym/plans/${planId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось скопировать план')
      }
      const { planId: newPlanId } = await res.json()
      toast({ title: 'План скопирован', variant: 'success' })
      setOpen(false)
      router.push(`/gym/plans/${newPlanId}`)
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось скопировать план', description: message, variant: 'error' })
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
        title="Копировать план"
        aria-label="Копировать план"
        className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Копировать план"
        description="Копируются все недели, дни, упражнения и подходы. Даты пересчитываются от новой даты начала."
      >
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название нового плана"
            className="w-full"
          />
          <label className="block text-xs text-text-secondary">
            Новое начало
            <Input
              ref={dateInputRef}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full [&::-webkit-calendar-picker-indicator]:opacity-0"
            />
            <button
              type="button"
              onClick={openDatePicker}
              className="mt-1 flex items-center gap-1 text-text-secondary transition-colors hover:text-accent"
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleCopy} disabled={loading || !name.trim() || !startDate}>
              {loading ? 'Копирую...' : 'Копировать'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
