'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarMinus, CalendarPlus, ChevronRight, FileDown, Plus } from 'lucide-react'
import { Button, Card, Dialog, Input } from '@/components/ui'
import { GymWorkoutEditor } from '@/components/GymWorkoutEditor'

type Set = { id: string; setNumber: number; weight: number; reps: number; toFailure: boolean; completed: boolean }
type Entry = {
  id: string
  oneRepMax: number | null
  notes: string | null
  skipped: boolean
  exercise: { id: string; name: string }
  sets: Set[]
}
type Workout = { id: string; dayNumber: number; scheduledDate: string | Date; notes: string | null; entries: Entry[] }

// Whole-week view for gym mode: every day (GymWorkout) of a week rendered on
// one page, each with its full editor inline — mirrors how the powerlifting
// side's MicrocycleWeekView renders one WeekDayTable per day instead of
// making the coach click into each workout separately. Each day keeps its
// own GymWorkoutEditor instance (self-contained: it only ever talks to
// endpoints scoped by workoutId/entryId/setId), so editing one day never
// touches another's state.
export function GymWeekView({
  weekId,
  workouts,
  canEdit,
  canManageExercises,
  initialCompact,
}: {
  weekId: string
  workouts: Workout[]
  // Set-level (weight/reps/toFailure/add-remove-set) — coach or this week's
  // own client. Threaded straight into each day's GymWorkoutEditor.
  canEdit: boolean
  // Exercise- and structure-level: add/remove exercises, edit ПМ, and (here,
  // week-wide) add/remove a whole training day — coach-only.
  canManageExercises: boolean
  initialCompact: boolean
}) {
  const router = useRouter()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [open, setOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sorted = [...workouts].sort((a, b) => a.dayNumber - b.dayNumber)
  const last = sorted[sorted.length - 1]

  async function addDay(scheduledDate: string) {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/gym/weeks/${weekId}/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'Не удалось добавить день')
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function removeLastDay() {
    if (!last) return
    setLoading(true)
    try {
      const response = await fetch(`/api/gym/workouts/${last.id}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'Не удалось удалить день')
      setRemoveOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {canManageExercises && (
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Добавить день
            </Button>
            {sorted.length === 3 && last && (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() =>
                  void addDay(
                    new Date(new Date(last.scheduledDate).getTime() + 86400000).toISOString().slice(0, 10)
                  )
                }
              >
                <CalendarPlus className="h-4 w-4" /> Перейти на 4 дня
              </Button>
            )}
            {sorted.length === 4 && (
              <Button variant="outline" size="sm" onClick={() => setRemoveOpen(true)}>
                <CalendarMinus className="h-4 w-4" /> Перейти на 3 дня
              </Button>
            )}
          </>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {sorted.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary">В этой неделе пока нет дней.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {sorted.map((workout) => (
            <div key={workout.id} className="border-t border-border pt-5 first:border-t-0 first:pt-0">
              <GymWorkoutEditor
                workoutId={workout.id}
                entries={workout.entries}
                canEdit={canEdit}
                canManageExercises={canManageExercises}
                initialCompact={initialCompact}
                initialNotes={workout.notes}
                header={
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {/* Opens the standalone /gym/workouts/:id page — same
                        "whole day, plus prev/next day nav" view the day
                        badges on the full-program page already link to
                        (a92f629). The inline editor above stays for quick
                        edits without leaving the week; this is for when a
                        coach/athlete wants to focus on just one day. */}
                    <Link
                      href={`/gym/workouts/${workout.id}`}
                      title="Открыть день"
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1 -mx-2 transition hover:scale-[1.01] hover:bg-surface-2"
                    >
                      <span>
                        <span className="flex items-baseline gap-2">
                          <h2 className="font-display text-lg uppercase text-accent">День {workout.dayNumber}</h2>
                        </span>
                        <p className="text-sm text-text-secondary">
                          {new Date(workout.scheduledDate).toISOString().slice(0, 10)}
                        </p>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" />
                    </Link>
                    <Link
                      href={`/gym/workouts/${workout.id}/export`}
                      title="Экспорт в PDF"
                      aria-label="Экспорт в PDF"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                }
              />
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen} title="Новый день" description="Выберите дату тренировки.">
        <div className="space-y-3">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" disabled={loading || !date} onClick={() => void addDay(date)}>
              {loading ? 'Добавляю…' : 'Добавить'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Убрать последний день?"
        description="День и все упражнения внутри него будут удалены."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setRemoveOpen(false)}>
            Отмена
          </Button>
          <Button variant="danger" size="sm" disabled={loading} onClick={() => void removeLastDay()}>
            {loading ? 'Удаляю…' : 'Убрать'}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
