'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button, Dialog, Input, useToast } from '@/components/ui'

type Props = {
  microcycleId: string
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// "+ Добавить день" — coach-only. Counterpart to AddMicrocycleButton for a
// microcycle that already exists but is missing a day: a manually-added
// (empty) microcycle otherwise has no way to ever get a Workout, since the
// week page only renders day cards (and its own edit-lock toggle) once
// workouts.length > 0. Unlike plan creation's bulk weekday picker, this adds
// one day at a time, so the coach just picks its calendar date directly.
export function AddWorkoutDayButton({ microcycleId }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [scheduledDate, setScheduledDate] = useState(todayIso())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/microcycles/${microcycleId}/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось добавить день')
      }
      toast({ title: 'День добавлен', variant: 'success' })
      setOpen(false)
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось добавить день', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" size="sm">
        <Plus className="h-4 w-4" /> Добавить день
      </Button>

      <Dialog open={open} onOpenChange={setOpen} title="Новый день" description="Выберите дату тренировки.">
        <div className="space-y-3">
          <label className="block text-xs text-text-secondary">
            Дата
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="mt-1 w-full"
            />
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={loading || !scheduledDate}>
              {loading ? 'Добавляю...' : 'Добавить'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
