'use client'
import { useMemo, useState, type ReactNode } from 'react'
import { Flame, GripVertical, Plus, Trash2, X } from 'lucide-react'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button, Card, Input, Select } from '@/components/ui'
import { LockToggle } from '@/components/LockToggle'

type Set = { id: string; setNumber: number; weight: number; reps: number; toFailure: boolean }
type Entry = { id: string; oneRepMax: number | null; notes: string | null; exercise: { id: string; name: string }; sets: Set[] }
type CatalogExercise = { id: string; name: string; category: string | null }
const percentOfMax = (weight: number, max: number | null) => max && max > 0 ? `${Math.round((weight / max) * 100)}%` : '—'
// "До отказа" sets are only grouped together in compact view when they
// share the flag too — otherwise a literal "12 reps" set could get merged
// into a visually-identical "до отказа" one that happens to use the same
// placeholder number.
function compactSets(sets: Set[]) { return sets.reduce<{ weight: number; reps: number; toFailure: boolean; count: number }[]>((groups, set) => { const current = groups[groups.length - 1]; if (current && current.weight === set.weight && current.reps === set.reps && current.toFailure === set.toFailure) current.count += 1; else groups.push({ weight: set.weight, reps: set.reps, toFailure: set.toFailure, count: 1 }); return groups }, []) }

// `header` lets a caller that already shows its own day/date heading above
// this component (the week-overview page, embedding one editor per day)
// replace the default "Тренировка" title instead of stacking a redundant
// one — the standalone /gym/workouts/:id page doesn't pass it and keeps the
// original heading.
//
// Two separate permissions, not one: `canEdit` is set-level (weight, reps,
// "до отказа", adding/removing a set) — true for the coach OR the client
// this workout belongs to, same as the powerlifting side lets an athlete
// log their own sets. `canManageExercises` is exercise-level (add/replace/
// remove an exercise, edit ПМ) and stays coach-only — a client changing
// what's programmed or their own tracked max would undermine the coach's
// %ПМ-based programming, same reasoning as the powerlifting side keeping
// Базовые/СФП 1RM edits coach-only.
export function GymWorkoutEditor({
  workoutId,
  entries,
  canEdit,
  canManageExercises,
  initialCompact,
  initialNotes,
  header,
}: {
  workoutId: string
  entries: Entry[]
  canEdit: boolean
  canManageExercises: boolean
  initialCompact: boolean
  // Coach-authored closing instructions for the whole workout (stretching,
  // cooldown, etc.) — null until a coach sets one.
  initialNotes: string | null
  header?: ReactNode
}) {
  const [rows, setRows] = useState(entries); const [compact, setCompact] = useState(initialCompact); const [catalog, setCatalog] = useState<CatalogExercise[]>([]); const [query, setQuery] = useState(''); const [exerciseId, setExerciseId] = useState(''); const [workingWeight, setWorkingWeight] = useState('20'); const [reps, setReps] = useState('10'); const [adding, setAdding] = useState(false); const [error, setError] = useState<string | null>(null)
  const [workoutNotes, setWorkoutNotes] = useState(initialNotes)
  // Locked by default for a client (same "prevent a stray tap in the gym"
  // safety net the powerlifting side's LockToggle already documents) — but
  // never for the coach, who isn't the one standing in the gym mid-set and
  // shouldn't need an extra tap before every edit. canManageExercises is a
  // reliable "this is the coach" signal here (only the coach ever gets it),
  // so the toggle itself is hidden for them too — there's nothing to lock.
  const [locked, setLocked] = useState(!canManageExercises)
  const options = useMemo(() => catalog.filter((exercise) => exercise.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [catalog, query])
  // Requires an 8px pointer move before a drag starts — without this, the
  // handle's own click/tap could register as a zero-distance drag and
  // reorder nothing while still eating the tap. Same threshold as the
  // powerlifting side's WeekDayTable.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRows((prev) => {
      const oldIndex = prev.findIndex((e) => e.id === active.id)
      const newIndex = prev.findIndex((e) => e.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      const next = arrayMove(prev, oldIndex, newIndex)
      request(`/api/gym/workouts/${workoutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryIds: next.map((e) => e.id) }),
      }).catch((e) => setError(e instanceof Error ? e.message : 'Не удалось сохранить порядок'))
      return next
    })
  }
  function updateSetLocal(entryId: string, setId: string, patch: Partial<Pick<Set, 'weight' | 'reps'>>) {
    setRows((current) =>
      current.map((row) =>
        row.id === entryId
          ? { ...row, sets: row.sets.map((item) => (item.id === setId ? { ...item, ...patch } : item)) }
          : row
      )
    )
  }
  async function request(url: string, init: RequestInit) { const response = await fetch(url, init); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? 'Не удалось сохранить изменения'); return body }
  async function saveSet(entryId: string, setId: string, data: Partial<Pick<Set, 'weight' | 'reps' | 'toFailure'>>) { try { await request(`/api/gym/sets/${setId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') } }
  async function toggleToFailure(entryId: string, setId: string, toFailure: boolean) { setRows((current) => current.map((row) => row.id === entryId ? { ...row, sets: row.sets.map((item) => item.id === setId ? { ...item, toFailure } : item) } : row)); await saveSet(entryId, setId, { toFailure }) }
  async function saveMax(entryId: string, value: string) { const oneRepMax = Number(value); if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) return setError('Введите максимум ПМ больше нуля'); try { await request(`/api/gym/entries/${entryId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oneRepMax }) }); setRows((current) => current.map((entry) => entry.id === entryId ? { ...entry, oneRepMax } : entry)) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') } }
  async function addSet(entryId: string) { try { const set = await request(`/api/gym/entries/${entryId}/sets`, { method: 'POST' }) as Set; setRows((current) => current.map((entry) => entry.id === entryId ? { ...entry, sets: [...entry.sets, set] } : entry)) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') } }
  async function removeSet(entryId: string, setId: string) { try { await request(`/api/gym/sets/${setId}`, { method: 'DELETE' }); setRows((current) => current.map((entry) => entry.id === entryId ? { ...entry, sets: entry.sets.filter((set) => set.id !== setId) } : entry)) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') } }
  async function loadCatalog() { try { setCatalog(await request('/api/admin/gym-exercises', {}) as CatalogExercise[]) } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить упражнения') } }
  async function addExercise() { setError(null); setAdding(true); try { const entry = await request(`/api/gym/workouts/${workoutId}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exerciseId, workingWeight: Number(workingWeight), reps: Number(reps) }) }) as Entry; setRows((current) => [...current, entry]); setExerciseId(''); setQuery('') } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка добавления упражнения') } finally { setAdding(false) } }
  // Swap which catalog exercise this entry points to — sets stay as-is, only
  // the exercise (and its 1ПМ, re-priced off the client's tracked max for
  // the new exercise) changes. Mirrors the powerlifting side's exerciseId
  // swap on ExerciseEntry.
  async function replaceExercise(entryId: string, newExerciseId: string) { if (!newExerciseId) return; try { const updated = await request(`/api/gym/entries/${entryId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exerciseId: newExerciseId }) }) as Entry; setRows((current) => current.map((row) => row.id === entryId ? { ...row, exercise: updated.exercise, oneRepMax: updated.oneRepMax } : row)) } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось заменить упражнение') } }
  // Removes the whole exercise (and every logged set under it) from this
  // workout — the catalog exercise itself, and any other workout using it,
  // is untouched. No confirmation for individual sets (removeSet above),
  // but this is a bigger, harder-to-notice loss, so it asks first — same as
  // the powerlifting side's exercise-entry delete.
  async function removeExercise(entryId: string) { const entry = rows.find((row) => row.id === entryId); if (entry && !window.confirm(`Убрать «${entry.exercise.name}» из тренировки вместе со всеми подходами?`)) return; try { await request(`/api/gym/entries/${entryId}`, { method: 'DELETE' }); setRows((current) => current.filter((row) => row.id !== entryId)) } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось удалить упражнение') } }
  async function toggleCompact() { const next = !compact; setCompact(next); try { await request('/api/user/compact-view', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ compact: next }) }) } catch (e) { setCompact(!next); setError(e instanceof Error ? e.message : 'Не удалось сохранить настройку') } }
  // Coach-only note on one exercise (technique cue, "используй лёгкий вес",
  // etc.) — visible to the client as read-only text, same permission split
  // as replaceExercise/saveMax above.
  async function saveEntryNotes(entryId: string, value: string) { const notes = value.trim(); setRows((current) => current.map((entry) => entry.id === entryId ? { ...entry, notes: notes || null } : entry)); try { await request(`/api/gym/entries/${entryId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) }) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') } }
  // Coach-only closing instructions for the whole workout (stretching,
  // cooldown, etc.) — not tied to any exercise, shown at the end of the day.
  async function saveWorkoutNotes(value: string) { const notes = value.trim(); setWorkoutNotes(notes || null); try { await request(`/api/gym/workouts/${workoutId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) }) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') } }
  // Same "sets as narrow columns, one row per exercise" spreadsheet layout
  // as the powerlifting side's WeekDayTable/WeekDayTableRow (padded to the
  // day's own max set count, same Math.max(1, ...) floor) instead of each
  // exercise's sets stacking as separate full-width rows — lets a coach scan
  // (or edit) a whole day of gym sets without the vertical scroll a per-set
  // row list required.
  const maxSets = Math.max(1, ...rows.map((entry) => entry.sets.length))

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header ?? (
          <div>
            <h1 className="font-display text-xl uppercase">Тренировка</h1>
            <p className="text-sm text-text-secondary">
              Вес · подходы · повторы · % от максимума · максимум ПМ
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          {canEdit && !canManageExercises && (
            <LockToggle locked={locked} onToggle={() => setLocked((l) => !l)} />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={compact} onChange={() => void toggleCompact()} /> Компактный режим
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Everything editable lives inside this one lock-gated wrapper —
          mirrors the powerlifting side's WeekDayTable, which wraps its
          whole table (sets AND the add-exercise autocomplete) in the same
          locked ? 'pointer-events-none ... opacity-70' : '' toggle instead
          of gating by role. For a client this stays a shared safety default
          (not a permission check — canEdit/canManageExercises already are
          that) so an accidental tap mid-set doesn't change a number; for
          the coach, `locked` starts (and stays, no toggle rendered) false,
          so this wrapper never dims or blocks anything for them. */}
      <div className={locked ? 'pointer-events-none select-none opacity-70' : ''}>
      {canManageExercises && (
        <Card className="space-y-3">
          <h2 className="font-display text-sm uppercase">Добавить упражнение</h2>
          {/* min-w-0 on every grid item: without it, a grid child's default
              min-width:auto refuses to shrink below its own content's
              intrinsic width — once loadCatalog() (fired on focusing either
              field below) fills the Select with the full exercise list, its
              longest option name can exceed the 1fr track's available
              width, and the grid can't compress it back down. That pushed
              the weight/reps inputs and the Добавить button out of their
              tracks (wrapping or overflowing) right as you clicked into
              "Поиск упражнения" — the button visibly "crawling away". */}
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_8rem_8rem_auto]">
            <Input
              placeholder="Поиск упражнения"
              value={query}
              onFocus={() => void loadCatalog()}
              onChange={(e) => {
                setQuery(e.target.value)
                setExerciseId('')
              }}
              className="min-w-0"
            />
            <Select
              value={exerciseId}
              onFocus={() => void loadCatalog()}
              onChange={(e) => setExerciseId(e.target.value)}
              className="min-w-0"
            >
              <option value="">Выберите упражнение</option>
              {options.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                  {exercise.category ? ` · ${exercise.category}` : ''}
                </option>
              ))}
            </Select>
            {/* Plain unlabeled "20"/"10" number fields read as two
                identical, unexplained boxes — labeling each (instead of
                just an aria-label only screen readers could see) is what
                actually tells a sighted coach which one is the working
                weight and which is reps. */}
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-text-secondary">Вес, кг</span>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={workingWeight}
                onChange={(e) => setWorkingWeight(e.target.value)}
                className="min-w-0"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-text-secondary">Повторы</span>
              <Input
                type="number"
                min="1"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                className="min-w-0"
              />
            </label>
            <Button onClick={() => void addExercise()} disabled={adding || !exerciseId}>
              {adding ? 'Добавляю…' : 'Добавить'}
            </Button>
          </div>
          <p className="text-xs text-text-secondary">
            При первом добавлении максимум ПМ оценивается по рабочему весу и повторам и сохраняется для клиента.
          </p>
        </Card>
      )}

      {compact ? (
        rows.map((entry, entryIndex) => (
          <Card key={entry.id} className="overflow-x-auto">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              {canManageExercises ? (
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-sm text-text-secondary">{entryIndex + 1}.</span>
                  <Select
                    className="w-auto max-w-[28rem] font-medium"
                    value=""
                    onFocus={() => void loadCatalog()}
                    onChange={(e) => void replaceExercise(entry.id, e.target.value)}
                    aria-label={`Заменить упражнение «${entry.exercise.name}»`}
                  >
                    <option value="">{entry.exercise.name}</option>
                    {catalog
                      .filter((exercise) => exercise.id !== entry.exercise.id)
                      .map((exercise) => (
                        <option key={exercise.id} value={exercise.id}>
                          {exercise.name}
                          {exercise.category ? ` · ${exercise.category}` : ''}
                        </option>
                      ))}
                  </Select>
                </div>
              ) : (
                <h2 className="font-medium">
                  {entryIndex + 1}. {entry.exercise.name}
                </h2>
              )}
              <div className="ml-auto flex items-center gap-3">
                {canManageExercises ? (
                  <label className="flex items-center gap-2 text-xs text-text-secondary">
                    Максимум ПМ, кг{' '}
                    <Input
                      className="w-24"
                      type="number"
                      min="0.5"
                      step="0.5"
                      defaultValue={entry.oneRepMax ?? ''}
                      onBlur={(e) => void saveMax(entry.id, e.target.value)}
                    />
                  </label>
                ) : (
                  <span className="text-xs text-text-secondary">Максимум ПМ: {entry.oneRepMax ?? '—'} кг</span>
                )}
                {canManageExercises && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Удалить упражнение"
                    title="Удалить упражнение из тренировки"
                    onClick={() => void removeExercise(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {canManageExercises ? (
              <textarea
                defaultValue={entry.notes ?? ''}
                onBlur={(e) => void saveEntryNotes(entry.id, e.target.value)}
                placeholder="Комментарий к упражнению (необязательно)"
                rows={2}
                className="mb-2 w-full resize-none rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            ) : (
              entry.notes && <p className="mb-2 text-xs italic text-text-secondary">{entry.notes}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {compactSets(entry.sets).map((set, index) => (
                <span
                  key={`${set.weight}-${set.reps}-${set.toFailure}-${index}`}
                  className="rounded border border-border bg-surface-2 px-3 py-2 text-sm"
                >
                  {set.weight} кг {set.count} × {set.toFailure ? 'до отказа' : set.reps}{' '}
                  <span className="text-accent">{percentOfMax(set.weight, entry.oneRepMax)}</span>
                </span>
              ))}
            </div>
          </Card>
        ))
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-text-secondary">
                  <th className="sticky left-0 z-10 bg-surface-2 px-2 py-1 text-left font-bold">Упражнение</th>
                  <th colSpan={maxSets} className="px-1 py-1 text-center font-bold">
                    Подходы
                  </th>
                  {canEdit && <th className="px-1 py-1" />}
                  <th className="px-1.5 py-1 text-right font-bold">ПМ</th>
                </tr>
              </thead>
              <tbody>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={rows.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                    {rows.map((entry, index) => (
                      <GymExerciseTableRow
                        key={entry.id}
                        entry={entry}
                        index={index}
                        maxSets={maxSets}
                        canEdit={canEdit}
                        canManageExercises={canManageExercises}
                        catalog={catalog}
                        onLoadCatalog={loadCatalog}
                        onReplaceExercise={replaceExercise}
                        onRemoveExercise={removeExercise}
                        onSaveMax={saveMax}
                        onSaveNotes={saveEntryNotes}
                        onAddSet={addSet}
                        onRemoveSet={removeSet}
                        onUpdateSetLocal={updateSetLocal}
                        onSaveSet={saveSet}
                        onToggleToFailure={toggleToFailure}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={maxSets + 2 + (canEdit ? 1 : 0)}
                      className="px-2 py-2 text-center text-text-secondary"
                    >
                      В тренировке пока нет упражнений.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* Deliberately outside the lock-gated wrapper above — a client's
          read-only view of the coach's closing instructions (stretching,
          cooldown, etc.) shouldn't dim/block along with the editable sets
          just because they haven't tapped the lock open yet. */}
      {(canManageExercises || workoutNotes) && (
        <Card className="space-y-2">
          <h2 className="font-display text-sm uppercase">Дополнительные указания</h2>
          {canManageExercises ? (
            <textarea
              defaultValue={workoutNotes ?? ''}
              onBlur={(e) => void saveWorkoutNotes(e.target.value)}
              placeholder="Например: растяжка 10 минут, заминка на дорожке лёгким шагом..."
              rows={3}
              className="w-full resize-y rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-text-secondary">{workoutNotes}</p>
          )}
        </Card>
      )}
    </div>
  )
}

// One exercise row of the full/table mode's spreadsheet — split out from
// GymWorkoutEditor so useSortable (one drag-and-drop participant per row)
// can be called once per row instead of inside a .map() in the parent,
// which hooks don't allow. Mirrors the powerlifting side's
// WeekDayTable/WeekDayTableRow split for the same reason. The drag handle
// is the only element wired to dnd-kit's listeners/attributes — the row
// has several other interactive controls (inputs, buttons) that would
// otherwise fight a press-and-drag gesture over the whole <tr>.
function GymExerciseTableRow({
  entry,
  index,
  maxSets,
  canEdit,
  canManageExercises,
  catalog,
  onLoadCatalog,
  onReplaceExercise,
  onRemoveExercise,
  onSaveMax,
  onSaveNotes,
  onAddSet,
  onRemoveSet,
  onUpdateSetLocal,
  onSaveSet,
  onToggleToFailure,
}: {
  entry: Entry
  index: number
  maxSets: number
  canEdit: boolean
  canManageExercises: boolean
  catalog: CatalogExercise[]
  onLoadCatalog: () => void
  onReplaceExercise: (entryId: string, newExerciseId: string) => void
  onRemoveExercise: (entryId: string) => void
  onSaveMax: (entryId: string, value: string) => void
  onSaveNotes: (entryId: string, value: string) => void
  onAddSet: (entryId: string) => void
  onRemoveSet: (entryId: string, setId: string) => void
  onUpdateSetLocal: (entryId: string, setId: string, patch: Partial<Pick<Set, 'weight' | 'reps'>>) => void
  onSaveSet: (entryId: string, setId: string, data: Partial<Pick<Set, 'weight' | 'reps' | 'toFailure'>>) => void
  onToggleToFailure: (entryId: string, setId: string, toFailure: boolean) => void
}) {
  // Reordering is exercise-level (canManageExercises), same as add/replace/
  // remove — disabled for a client the same way those already are.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: !canManageExercises,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-border last:border-b-0 ${isDragging ? 'relative z-20 bg-surface-2 shadow-lg' : ''}`}
    >
      <td className="sticky left-0 z-10 w-72 max-w-[20rem] bg-surface px-2 py-1 align-top">
        {/* Drag handle + number + name/select all in one row — ПМ and the
            delete button both moved to the trailing column instead, so
            "remove this exercise" lives in exactly one place next to the
            number it's about to make obsolete, not split across two
            corners of the row. */}
        <div className="flex items-start gap-1">
          {canManageExercises && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label="Перетащить, чтобы изменить порядок"
              title="Перетащить, чтобы изменить порядок"
              style={{ touchAction: 'none' }}
              className="mt-0.5 flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-text-secondary transition-colors hover:text-accent active:cursor-grabbing"
            >
              <GripVertical className="h-3 w-3" />
            </button>
          )}
          <span className="mt-0.5 shrink-0 text-xs text-text-secondary">{index + 1}.</span>
          <div className="min-w-0 flex-1">
            {canManageExercises ? (
              <Select
                className="w-full min-w-0 whitespace-normal font-medium"
                value=""
                onFocus={onLoadCatalog}
                onChange={(e) => onReplaceExercise(entry.id, e.target.value)}
                aria-label={`Заменить упражнение «${entry.exercise.name}»`}
              >
                <option value="">{entry.exercise.name}</option>
                {catalog
                  .filter((exercise) => exercise.id !== entry.exercise.id)
                  .map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                      {exercise.category ? ` · ${exercise.category}` : ''}
                    </option>
                  ))}
              </Select>
            ) : (
              <span className="font-medium">{entry.exercise.name}</span>
            )}
          </div>
        </div>
        {canManageExercises ? (
          <textarea
            defaultValue={entry.notes ?? ''}
            onBlur={(e) => onSaveNotes(entry.id, e.target.value)}
            placeholder="Комментарий (необязательно)"
            rows={2}
            className="mt-1 w-full resize-none rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px] text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        ) : (
          entry.notes && <p className="mt-1 text-[11px] italic text-text-secondary">{entry.notes}</p>
        )}
      </td>
      {Array.from({ length: maxSets }).map((_, i) => {
        const set = entry.sets[i]
        if (!set) return <td key={i} className="px-0.5 py-0.5" />
        return (
          <td key={set.id} className="group relative px-0.5 py-0.5 align-top">
            {canEdit && entry.sets.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveSet(entry.id, set.id)}
                aria-label="Удалить подход"
                className="absolute right-0 top-0 hidden text-text-secondary hover:text-danger group-hover:block"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <div className="flex items-start gap-1">
              <div className="flex flex-col items-center gap-0.5">
                <span className="flex h-4 w-16 items-center justify-center rounded border border-border bg-surface-2 text-[10px] font-medium text-text-secondary">
                  {i + 1}
                </span>
                <input
                  disabled={!canEdit}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={set.weight || ''}
                  onChange={(e) => onUpdateSetLocal(entry.id, set.id, { weight: Number(e.target.value) || 0 })}
                  onBlur={(e) => onSaveSet(entry.id, set.id, { weight: Number(e.target.value) || 0 })}
                  className="w-16 min-w-0 rounded border border-border bg-surface-2 px-0.5 py-0.5 text-center text-sm font-bold text-accent outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                />
                <input
                  disabled={!canEdit || set.toFailure}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={set.reps || ''}
                  onChange={(e) => onUpdateSetLocal(entry.id, set.id, { reps: Number(e.target.value) || 0 })}
                  onBlur={(e) => onSaveSet(entry.id, set.id, { reps: Number(e.target.value) || 0 })}
                  className="w-16 min-w-0 rounded border border-border bg-surface-2 px-0.5 py-0.5 text-center text-sm text-text-secondary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="mt-[1.375rem] flex flex-col items-center gap-1">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onToggleToFailure(entry.id, set.id, !set.toFailure)}
                  aria-pressed={set.toFailure}
                  aria-label={
                    set.toFailure
                      ? 'Подход до отказа — нажмите, чтобы снять отметку'
                      : 'Отметить подход как выполненный до отказа'
                  }
                  title="До отказа"
                  className={`flex h-4 w-8 shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    set.toFailure
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-border bg-surface-2 text-text-secondary hover:border-accent hover:text-accent'
                  }`}
                >
                  <Flame className="h-3 w-3" />
                </button>
                <span className="w-8 text-center text-[10px] text-accent">
                  {percentOfMax(set.weight, entry.oneRepMax)}
                </span>
              </div>
            </div>
          </td>
        )
      })}
      {canEdit && (
        <td className="px-0.5 py-0.5 align-top">
          <button
            type="button"
            onClick={() => onAddSet(entry.id)}
            aria-label="Добавить подход"
            title="Добавить подход"
            className="mt-1 text-text-secondary transition-colors hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
      {/* ПМ and delete-exercise grouped together on the right — used to be
          split (delete pinned inside the sticky name column, ПМ as a
          separate trailing column), which put "remove this exercise" and
          its own max both far apart. */}
      <td className="px-1.5 py-1 align-top">
        <div className="flex items-start justify-end gap-1">
          {canManageExercises ? (
            <input
              type="number"
              min="0.5"
              step="0.5"
              defaultValue={entry.oneRepMax ?? ''}
              onBlur={(e) => onSaveMax(entry.id, e.target.value)}
              aria-label={`Максимум ПМ для «${entry.exercise.name}», кг`}
              className="w-16 min-w-0 rounded border border-border bg-surface-2 px-1 py-0.5 text-center text-sm font-bold text-accent outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          ) : (
            <span className="text-sm font-bold text-accent">{entry.oneRepMax ?? '—'}</span>
          )}
          {canManageExercises && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Удалить упражнение"
              title="Удалить упражнение из тренировки"
              onClick={() => onRemoveExercise(entry.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}
