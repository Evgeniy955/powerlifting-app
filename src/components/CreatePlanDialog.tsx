'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { Button, Dialog, Input, useToast } from '@/components/ui'

type Props = {
  athleteId: string
  // Lets a caller swap in its own trigger (e.g. a mobile menu item) instead
  // of the default "Создать план" button — the dialog's own open/close state
  // still lives here either way, this just changes what opens it.
  renderTrigger?: (open: () => void) => ReactNode
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// JS Date.getUTCDay() convention (0 = Sunday), same one WeekDayTable already
// uses for its weekday labels — kept in sync so a workout scheduled here on
// weekday N lands under the same label everywhere else in the app.
const WEEKDAYS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Вс' },
]

const PRESETS = [
  { label: 'Пн/Ср/Пт', weekdays: [1, 3, 5] },
  { label: 'Вт/Чт/Сб', weekdays: [2, 4, 6] },
]

// Coach-only: creates an empty N-week plan skeleton (Cycle -> Microcycles ->
// empty Workouts) scheduled on whichever weekdays the coach picks — e.g.
// Пн/Ср/Пт or Вт/Чт/Сб — rather than just a day count. Exercises get added
// afterward per-day, same as any ad-hoc cycle — this just bootstraps the
// week/day structure up front, with each Workout's date landing on a real
// matching weekday.
export function CreatePlanDialog({ athleteId, renderTrigger }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [weeks, setWeeks] = useState('12')
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  function openDatePicker() {
    // showPicker() is the only way to open the native date picker
    // programmatically; not in older Safari, so fall back to focusing the
    // (invisible-icon but still real) input, which at least lets keyboard/
    // click-to-type work.
    if (typeof dateInputRef.current?.showPicker === 'function') {
      dateInputRef.current.showPicker()
    } else {
      dateInputRef.current?.focus()
    }
  }

  function toggleWeekday(value: number) {
    setWeekdays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    )
  }

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
          weekdays,
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
      // The Планы list this dialog lives on is a cached server component —
      // without this, the new plan is missing from it until a manual reload
      // (same class of staleness as CopyLastTwoWeeksButton).
      router.refresh()
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
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <Button onClick={() => setOpen(true)} size="sm">
          Создать план
        </Button>
      )}

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
          <label className="block text-xs text-text-secondary">
            Начало
            {/* The browser's own calendar-picker glyph sits inside the field
                and, on narrow widths, lands right on top of the date digits —
                hidden (still fully clickable, just invisible) and replaced
                with our own icon below the field instead of inside it. */}
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
          <label className="block text-xs text-text-secondary">
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

          <div>
            <p className="text-xs text-text-secondary">Дни тренировок</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  aria-pressed={weekdays.includes(d.value)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium transition-colors ${
                    weekdays.includes(d.value)
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-border bg-surface-2 text-text-secondary hover:border-accent hover:text-accent'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setWeekdays(p.weekdays)}
                  className="text-xs text-accent transition-colors hover:underline"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={loading || !name.trim() || weekdays.length === 0}
            >
              {loading ? 'Создаю...' : 'Создать'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
