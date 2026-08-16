'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Dialog, Input, useToast } from '@/components/ui'

type Props = { athleteId: string }

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// Coach-only: creates an empty N-week plan skeleton (Cycle -> Microcycles ->
// empty Workouts). Exercises get added afterward per-day, same as any ad-hoc
// cycle — this just bootstraps the week/day structure up front.
export function CreatePlanDialog({ athleteId }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [weeks, setWeeks] = useState('12')
  const [daysPerWeek, setDaysPerWeek] = useState('4')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          startDate,
          weeks: Number(weeks),
          daysPerWeek: Number(daysPerWeek),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось создать план')
      }
      const { cycleId } = await res.json()
      toast({ title: 'План создан', variant: 'success' })
      setOpen(false)
      router.push(`/cycles/${cycleId}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось создать план', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        Создать план
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Новый план"
        description="Обычно 12 недель. Дни начинают пустыми — упражнения добавляются по ходу, как обычно."
      >
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название плана (напр. «Подготовка к соревнованиям»)"
            className="w-full"
          />
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-3 text-xs text-text-secondary sm:col-span-1">
              Начало
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
            <label className="text-xs text-text-secondary">
              Недель
              <Input
                type="number"
                min={1}
                max={52}
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
            <label className="text-xs text-text-secondary">
              Дней/нед.
              <Input
                type="number"
                min={1}
                max={7}
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={loading || !name.trim()}>
              {loading ? 'Создаю...' : 'Создать'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
