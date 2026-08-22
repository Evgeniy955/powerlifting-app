'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, CalendarMinus } from 'lucide-react'
import { Button, Dialog, useToast } from '@/components/ui'

type Workout = { id: string; dayNumber: number; scheduledDate: string | Date }

type Props = {
  microcycleId: string
  workouts: Workout[]
}

const DAY_MS = 24 * 60 * 60 * 1000

// Quick 3-day <-> 4-day toggle for the two most common splits (Пн/Ср/Пт vs.
// Пн/Ср/Пт/Сб) — coach-only, only rendered when this microcycle currently
// has exactly 3 or 4 days, so it doesn't have to guess what "toggle" means
// for a 5-day week or a still-empty one (AddWorkoutDayButton already covers
// building those up one day at a time with an explicit date).
//
// 3 -> 4: appends a day dated right after the current last day (no date
// picker — this is meant to be a single click, unlike AddWorkoutDayButton).
// 4 -> 3: removes the day with the highest dayNumber, after confirming
// (destructive — drops any exercises/sets already logged on it).
export function ToggleFourthDayButton({ microcycleId, workouts }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  if (workouts.length !== 3 && workouts.length !== 4) return null

  const sorted = [...workouts].sort((a, b) => a.dayNumber - b.dayNumber)
  const lastDay = sorted[sorted.length - 1]

  async function addFourthDay() {
    setLoading(true)
    try {
      const nextDate = new Date(new Date(lastDay.scheduledDate).getTime() + DAY_MS)
      const res = await fetch(`/api/microcycles/${microcycleId}/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: nextDate.toISOString().slice(0, 10) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось добавить день')
      }
      toast({ title: 'День 4 добавлен', variant: 'success' })
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось добавить день', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function removeFourthDay() {
    setConfirmOpen(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/workouts/${lastDay.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось убрать день')
      }
      toast({ title: 'День 4 убран', variant: 'success' })
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось убрать день', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (workouts.length === 3) {
    return (
      <Button onClick={addFourthDay} disabled={loading} variant="outline" size="sm">
        <CalendarPlus className="h-4 w-4" /> {loading ? 'Добавляю...' : 'Перейти на 4 дня'}
      </Button>
    )
  }

  return (
    <>
      <Button onClick={() => setConfirmOpen(true)} disabled={loading} variant="outline" size="sm">
        <CalendarMinus className="h-4 w-4" /> Перейти на 3 дня
      </Button>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Убрать 4-й день?"
        description={`«День ${lastDay.dayNumber}» будет удалён вместе со всеми упражнениями и подходами внутри него. Действие необратимо.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
            Отмена
          </Button>
          <Button variant="danger" size="sm" onClick={removeFourthDay}>
            Убрать
          </Button>
        </div>
      </Dialog>
    </>
  )
}
