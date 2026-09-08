'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Ban, Check, Flame, GripVertical, Layers, Link2, Plus, Trash2, Unlink, X, Zap } from 'lucide-react'
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
import { GymExerciseAutocomplete } from '@/components/GymExerciseAutocomplete'

type Set = { id: string; setNumber: number; weight: number; reps: number; toFailure: boolean; completed: boolean }
type Entry = {
  id: string
  oneRepMax: number | null
  notes: string | null
  // Client/coach didn't get to this exercise — mirrors ExerciseEntry.skipped
  // on the powerlifting side.
  skipped: boolean
  exercise: { id: string; name: string }
  sets: Set[]
  // Combines this entry with 1-2 others into one superset/dropset block —
  // null for a normal standalone exercise. See GymExerciseEntry.groupId's
  // schema comment for the full reasoning; weight/reps stay fully
  // independent per exercise, only the visual/logical grouping is shared.
  groupId: string | null
  // "SUPERSET" | "DROPSET" — only meaningful when groupId is set.
  groupType: string | null
}
type CatalogExercise = { id: string; name: string; category: string | null }
type GroupType = 'SUPERSET' | 'DROPSET'
const GROUP_LABEL: Record<GroupType, string> = { SUPERSET: 'Суперсет', DROPSET: 'Дропсет' }
// Same orange for both group kinds — they're told apart by their icon and
// label text instead of by color (Link2 + "Суперсет" vs Zap + "Дропсет").
const GROUP_BORDER: Record<GroupType, string> = { SUPERSET: 'border-orange-500', DROPSET: 'border-orange-500' }
const GROUP_TEXT: Record<GroupType, string> = { SUPERSET: 'text-orange-500', DROPSET: 'text-orange-500' }
const percentOfMax = (weight: number, max: number | null) => max && max > 0 ? `${Math.round((weight / max) * 100)}%` : '—'
// Where each row sits inside its (possibly absent) group — used to decide
// whether to draw the group's top label/border on this row and whether to
// draw the connecting rule below it. Grouped rows are always kept
// contiguous by the API (see POST .../groups), so "same groupId as the
// immediate neighbor" is a reliable enough boundary check.
function groupPosition(rows: Entry[], index: number) {
  const entry = rows[index]
  if (!entry.groupId) return null
  const prev = rows[index - 1]
  const next = rows[index + 1]
  const isFirst = !prev || prev.groupId !== entry.groupId
  const isLast = !next || next.groupId !== entry.groupId
  const size = rows.filter((r) => r.groupId === entry.groupId).length
  return { isFirst, isLast, size, groupType: (entry.groupType ?? 'SUPERSET') as GroupType }
}
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
  compact: compactOverride,
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
  // When given, this editor's compact/table toggle is controlled by the
  // caller instead of managed internally — GymWeekView passes one shared
  // value down to every day's editor so a coach flips compact mode once
  // for the whole week instead of once per day. The internal checkbox
  // (and its own /api/user/compact-view persistence) hides itself in that
  // case; the standalone /gym/workouts/:id page doesn't pass this, so it
  // keeps its own self-contained checkbox exactly as before.
  compact?: boolean
}) {
  const [rows, setRows] = useState(entries); const [ownCompact, setOwnCompact] = useState(initialCompact); const [catalog, setCatalog] = useState<CatalogExercise[]>([]); const [error, setError] = useState<string | null>(null)
  const compactControlled = compactOverride !== undefined
  const compact = compactControlled ? compactOverride : ownCompact
  const [workoutNotes, setWorkoutNotes] = useState(initialNotes)
  // "Дополнительные указания" auto-grows to fit its content instead of
  // clipping it behind a fixed 3-row scrollbar — on mobile a textarea's
  // internal scroll is easy to miss entirely (no visible scrollbar until
  // you touch it, and the resize handle isn't usable on touch), so a coach
  // scrolling past a long note could think it was cut off. Runs on mount
  // (for text loaded from initialNotes) and on every keystroke.
  const workoutNotesRef = useRef<HTMLTextAreaElement>(null)
  function autoGrowWorkoutNotes(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useEffect(() => {
    if (workoutNotesRef.current) autoGrowWorkoutNotes(workoutNotesRef.current)
  }, [])
  // Locked by default for a client (same "prevent a stray tap in the gym"
  // safety net the powerlifting side's LockToggle already documents) — but
  // never for the coach, who isn't the one standing in the gym mid-set and
  // shouldn't need an extra tap before every edit. canManageExercises is a
  // reliable "this is the coach" signal here (only the coach ever gets it),
  // so the toggle itself is hidden for them too — there's nothing to lock.
  const [locked, setLocked] = useState(!canManageExercises)
  // Coach-only "pick exercises to combine" mode — off by default so the
  // normal edit flow (weight/reps, add/remove sets) isn't cluttered with
  // selection checkboxes most of the time. Entering it clears any stale
  // selection from a previous pass.
  const [groupMode, setGroupMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  function toggleGroupMode() { setGroupMode((g) => !g); setSelected([]) }
  function toggleSelected(entryId: string) {
    setSelected((current) =>
      current.includes(entryId) ? current.filter((id) => id !== entryId) : current.length >= 3 ? current : [...current, entryId]
    )
  }
  // Combines the 2-3 currently-selected exercises into one superset/dropset
  // block — see POST /api/gym/workouts/:workoutId/groups. The endpoint
  // returns the whole (re-ordered) entry list, since combining can shift
  // other rows to keep the new group contiguous.
  async function combineSelected(groupType: GroupType) {
    if (selected.length < 2) return
    try {
      const updated = (await request(`/api/gym/workouts/${workoutId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseIds: selected, groupType }),
      })) as Entry[]
      setRows(updated)
      setSelected([])
      setGroupMode(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось объединить упражнения')
    }
  }
  // Splits a superset/dropset back into standalone exercises — every
  // member's own sets/ПМ/notes/order are untouched, only the shared
  // grouping clears.
  async function ungroup(groupId: string) {
    try {
      await request(`/api/gym/groups/${groupId}`, { method: 'DELETE' })
      setRows((current) => current.map((row) => (row.groupId === groupId ? { ...row, groupId: null, groupType: null } : row)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось разгруппировать упражнения')
    }
  }
  async function changeGroupType(groupId: string, groupType: GroupType) {
    setRows((current) => current.map((row) => (row.groupId === groupId ? { ...row, groupType } : row)))
    try {
      await request(`/api/gym/groups/${groupId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupType }) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить тип группы')
    }
  }
  // Requires an 8px pointer move before a drag starts — without this, the
  // handle's own click/tap could register as a zero-distance drag and
  // reorder nothing while still eating the tap. Same threshold as the
  // powerlifting side's WeekDayTable.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  // Click-and-drag horizontal scroll for the table (full/non-compact) view
  // — the set columns run wide enough that the ПМ column on the right
  // needs a scroll, and dragging the table itself with the mouse is faster
  // than hunting for the scrollbar. Only starts a pan when the mousedown
  // didn't land on something already interactive (an input, the exercise
  // Select, a button, the drag handle) so normal clicks/typing/dnd-kit
  // reordering keep working exactly as before.
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStateRef = useRef<{ startX: number; scrollLeft: number } | null>(null)
  function handleTableMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('input, select, textarea, button, a')) return
    const el = tableScrollRef.current
    if (!el) return
    panStateRef.current = { startX: e.pageX, scrollLeft: el.scrollLeft }
    setIsPanning(true)
  }
  function handleTableMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const pan = panStateRef.current
    const el = tableScrollRef.current
    if (!pan || !el) return
    e.preventDefault()
    el.scrollLeft = pan.scrollLeft - (e.pageX - pan.startX)
  }
  function endTablePan() {
    panStateRef.current = null
    setIsPanning(false)
  }
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
  async function saveSet(entryId: string, setId: string, data: Partial<Pick<Set, 'weight' | 'reps' | 'toFailure' | 'completed'>>) { try { await request(`/api/gym/sets/${setId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') } }
  async function toggleToFailure(entryId: string, setId: string, toFailure: boolean) { setRows((current) => current.map((row) => row.id === entryId ? { ...row, sets: row.sets.map((item) => item.id === setId ? { ...item, toFailure } : item) } : row)); await saveSet(entryId, setId, { toFailure }) }
  // Checked off by the client/coach once the set has actually been performed
  // — mirrors SetRow's completed toggle on the powerlifting side, including
  // staying clickable while the day is locked (see pointer-events-auto on
  // the button below).
  async function toggleCompleted(entryId: string, setId: string, completed: boolean) { setRows((current) => current.map((row) => row.id === entryId ? { ...row, sets: row.sets.map((item) => item.id === setId ? { ...item, completed } : item) } : row)); await saveSet(entryId, setId, { completed }) }
  // Client/coach didn't get to this exercise — mirrors ExerciseCard's
  // toggleSkipped on the powerlifting side. Unlike toggleCompleted above,
  // this stays inside the lock-gated wrapper (exercise-level, not a
  // mid-set action), same as the powerlifting side's skip toggle.
  async function toggleSkipped(entryId: string) {
    const entry = rows.find((row) => row.id === entryId)
    if (!entry) return
    const next = !entry.skipped
    setRows((current) => current.map((row) => (row.id === entryId ? { ...row, skipped: next } : row)))
    try {
      await request(`/api/gym/entries/${entryId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skipped: next }) })
    } catch (e) {
      setRows((current) => current.map((row) => (row.id === entryId ? { ...row, skipped: !next } : row)))
      setError(e instanceof Error ? e.message : 'Ошибка сохранения')
    }
  }
  async function saveMax(entryId: string, value: string) { const oneRepMax = Number(value); if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) return setError('Введите максимум ПМ больше нуля'); try { await request(`/api/gym/entries/${entryId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oneRepMax }) }); setRows((current) => current.map((entry) => entry.id === entryId ? { ...entry, oneRepMax } : entry)) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') } }
  async function addSet(entryId: string) { try { const set = await request(`/api/gym/entries/${entryId}/sets`, { method: 'POST' }) as Set; setRows((current) => current.map((entry) => entry.id === entryId ? { ...entry, sets: [...entry.sets, set] } : entry)) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') } }
  async function removeSet(entryId: string, setId: string) { try { await request(`/api/gym/sets/${setId}`, { method: 'DELETE' }); setRows((current) => current.map((entry) => entry.id === entryId ? { ...entry, sets: entry.sets.filter((set) => set.id !== setId) } : entry)) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') } }
  async function loadCatalog() { try { setCatalog(await request('/api/admin/gym-exercises', {}) as CatalogExercise[]) } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить упражнения') } }
  // Adds the exercise the moment it's picked from the autocomplete — no
  // separate form/button, same immediate-add flow as WorkoutView's
  // handleAddExercise on the powerlifting side. Starts with 0 sets and
  // whatever 1RM is already tracked for the client (or null, same "1ПМ не
  // задан" state ExerciseCard shows) — the coach/client adds sets and sets
  // the max afterward via "+ Добавить подход"/the ПМ field, instead of the
  // old flow which required typing a working weight+reps upfront just to
  // estimate a starting max.
  async function addExercise(exerciseId: string) {
    setError(null)
    try {
      const entry = (await request(`/api/gym/workouts/${workoutId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId }),
      })) as Entry
      setRows((current) => [...current, entry])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка добавления упражнения')
    }
  }
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
  async function removeExercise(entryId: string) {
    const entry = rows.find((row) => row.id === entryId)
    if (entry && !window.confirm(`Убрать «${entry.exercise.name}» из тренировки вместе со всеми подходами?`)) return
    try {
      await request(`/api/gym/entries/${entryId}`, { method: 'DELETE' })
      const remaining = rows.filter((row) => row.id !== entryId)
      setRows(remaining)
      // A group that's down to its last member isn't a group anymore —
      // clear its grouping too instead of leaving one exercise stranded
      // with a "Суперсет"/"Дропсет" label and border around it alone.
      if (entry?.groupId) {
        const stillGrouped = remaining.filter((row) => row.groupId === entry.groupId)
        if (stillGrouped.length === 1) void ungroup(entry.groupId)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить упражнение')
    }
  }
  async function toggleCompact() { const next = !ownCompact; setOwnCompact(next); try { await request('/api/user/compact-view', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ compact: next }) }) } catch (e) { setOwnCompact(!next); setError(e instanceof Error ? e.message : 'Не удалось сохранить настройку') } }
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
          {canManageExercises && rows.length >= 2 && (
            <Button variant={groupMode ? 'primary' : 'ghost'} size="sm" onClick={toggleGroupMode}>
              <Layers className="mr-1.5 h-3.5 w-3.5" />
              {groupMode ? 'Отменить объединение' : 'Суперсет / дропсет'}
            </Button>
          )}
          {!compactControlled && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={compact} onChange={() => void toggleCompact()} /> Компактный режим
            </label>
          )}
        </div>
      </div>

      {/* Selection action bar — appears once 2+ exercises are checked while
          groupMode is on. Same list both places can combine into (a
          superset keeps every exercise's own working weight — walk from one
          station to the next; a dropset is one movement done back to back
          at dropping weights) so the coach picks the label that matches
          what's actually happening in the gym. */}
      {groupMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          <span className="text-text-secondary">
            {selected.length === 0
              ? 'Отметьте 2–3 упражнения, чтобы объединить их'
              : `Выбрано: ${selected.length}`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="primary" disabled={selected.length < 2} onClick={() => void combineSelected('SUPERSET')}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" /> Суперсет
            </Button>
            <Button size="sm" variant="secondary" disabled={selected.length < 2} onClick={() => void combineSelected('DROPSET')}>
              <Zap className="mr-1.5 h-3.5 w-3.5" /> Дропсет
            </Button>
          </div>
        </div>
      )}

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
      {/* Locked no longer dims the whole block (opacity-70) — that was
          washing out the weight/reps numbers a client needs to read at a
          glance mid-set, even though nothing on the page is actually
          editable yet. Lock still blocks taps via pointer-events-none;
          individual edit affordances (pencil/plus/remove icons, drag
          handle) stay visually muted via their own text-text-secondary
          styling instead of a blanket dim. */}
      <div className={locked ? 'pointer-events-none select-none' : ''}>
      {compact ? (
        rows.map((entry, entryIndex) => {
          const groupInfo = groupPosition(rows, entryIndex)
          return (
          <Card
            key={entry.id}
            className={`overflow-x-auto ${entry.skipped ? 'opacity-60' : ''} ${
              groupInfo
                ? // Only the group's own top/bottom edge gets a (thick, orange)
                  // rule — any card in between drops its top/bottom border
                  // entirely (Card's own `border` utility would otherwise draw
                  // a thin line between every card, splitting the group up
                  // visually instead of reading as one bracketed block).
                  `border-l-4 ${GROUP_BORDER[groupInfo.groupType]} ${
                    groupInfo.isFirst ? `border-t-4 ${GROUP_BORDER[groupInfo.groupType]}` : 'border-t-0'
                  } ${groupInfo.isLast ? `border-b-4 ${GROUP_BORDER[groupInfo.groupType]}` : 'border-b-0'}`
                : ''
            }`}
          >
            {groupInfo?.isFirst && (
              <div className={`mb-2 flex items-center gap-1.5 text-xs font-bold ${GROUP_TEXT[groupInfo.groupType]}`}>
                {groupInfo.groupType === 'SUPERSET' ? <Link2 className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                {GROUP_LABEL[groupInfo.groupType]} · {groupInfo.size} упражнения
                {canManageExercises && (
                  <button
                    type="button"
                    onClick={() => void ungroup(entry.groupId as string)}
                    title="Разгруппировать"
                    aria-label="Разгруппировать"
                    className="ml-1 text-text-secondary transition-colors hover:text-danger"
                  >
                    <Unlink className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              {canManageExercises ? (
                <div className="flex min-w-0 items-center gap-1.5">
                  {groupMode && (
                    <input
                      type="checkbox"
                      checked={selected.includes(entry.id)}
                      onChange={() => toggleSelected(entry.id)}
                      aria-label={`Выбрать «${entry.exercise.name}» для объединения`}
                    />
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void toggleSkipped(entry.id)}
                      aria-pressed={entry.skipped}
                      title={entry.skipped ? 'Отметить как выполненное' : 'Отметить как пропущенное'}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        entry.skipped
                          ? 'border-danger bg-danger text-on-danger'
                          : 'border-border bg-surface-2 text-text-secondary hover:border-danger hover:text-danger'
                      }`}
                    >
                      <Ban className="h-3 w-3" />
                    </button>
                  )}
                  <span className="shrink-0 text-sm text-text-secondary">{entryIndex + 1}.</span>
                  <Select
                    className={`w-auto max-w-[28rem] font-medium ${entry.skipped ? 'line-through' : ''}`}
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
                <h2 className="flex min-w-0 items-center gap-1.5 font-medium">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void toggleSkipped(entry.id)}
                      aria-pressed={entry.skipped}
                      title={entry.skipped ? 'Отметить как выполненное' : 'Отметить как пропущенное'}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        entry.skipped
                          ? 'border-danger bg-danger text-on-danger'
                          : 'border-border bg-surface-2 text-text-secondary hover:border-danger hover:text-danger'
                      }`}
                    >
                      <Ban className="h-3 w-3" />
                    </button>
                  )}
                  <span className={entry.skipped ? 'line-through' : ''}>
                    {entryIndex + 1}. {entry.exercise.name}
                  </span>
                </h2>
              )}
              <div className="ml-auto flex items-center gap-3">
                {entry.skipped && <span className="text-xs text-danger">Пропущено</span>}
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
                  className="rounded border border-border bg-surface-2 px-3 py-2 text-sm font-bold text-text-primary"
                >
                  {set.weight} кг {set.count} × {set.toFailure ? 'до отказа' : set.reps}{' '}
                  <span className="text-accent">{percentOfMax(set.weight, entry.oneRepMax)}</span>
                </span>
              ))}
            </div>
          </Card>
          )
        })
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div
            ref={tableScrollRef}
            onMouseDown={handleTableMouseDown}
            onMouseMove={handleTableMouseMove}
            onMouseUp={endTablePan}
            onMouseLeave={endTablePan}
            className={`overflow-x-auto ${isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
          >
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-text-secondary">
                  <th className="sticky left-0 z-10 bg-surface-2 px-2 py-1 text-left font-bold">Упражнение</th>
                  {/* +1 reserved slot (only when canEdit) so the exercise
                      with the most sets in the day still has somewhere to
                      put its own "+ Добавить подход" — see
                      GymExerciseTableRow, which now renders that button
                      inline right after each exercise's own last set
                      instead of in a separate trailing column shared by
                      every row. */}
                  <th colSpan={maxSets + (canEdit ? 1 : 0)} className="px-1 py-1 text-center font-bold">
                    Подходы
                  </th>
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
                        onToggleCompleted={toggleCompleted}
                        onToggleSkipped={toggleSkipped}
                        groupInfo={groupPosition(rows, index)}
                        groupMode={groupMode}
                        selected={selected.includes(entry.id)}
                        onToggleSelected={toggleSelected}
                        onUngroup={ungroup}
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

      {/* Moved below the exercise list (was above it) and pared down to
          just the autocomplete, adding the exercise the instant it's
          picked — same position and immediate-add flow as WorkoutView's
          own "Добавить упражнение" card on the powerlifting side. */}
      {canManageExercises && (
        <Card className="mt-4 space-y-2">
          <p className="text-sm text-text-secondary">Добавить упражнение</p>
          <GymExerciseAutocomplete onSelect={(exercise) => void addExercise(exercise.id)} canCreate />
        </Card>
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
              ref={workoutNotesRef}
              defaultValue={workoutNotes ?? ''}
              onInput={(e) => autoGrowWorkoutNotes(e.currentTarget)}
              onBlur={(e) => void saveWorkoutNotes(e.target.value)}
              placeholder="Например: растяжка 10 минут, заминка на дорожке лёгким шагом..."
              rows={3}
              className="w-full resize-none overflow-hidden rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
  onToggleCompleted,
  onToggleSkipped,
  groupInfo,
  groupMode,
  selected,
  onToggleSelected,
  onUngroup,
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
  onSaveSet: (entryId: string, setId: string, data: Partial<Pick<Set, 'weight' | 'reps' | 'toFailure' | 'completed'>>) => void
  onToggleToFailure: (entryId: string, setId: string, toFailure: boolean) => void
  onToggleCompleted: (entryId: string, setId: string, completed: boolean) => void
  onToggleSkipped: (entryId: string) => void
  // Where this row sits inside its (possibly absent) superset/dropset — see
  // groupPosition's own comment. Null for a standalone exercise.
  groupInfo: { isFirst: boolean; isLast: boolean; size: number; groupType: GroupType } | null
  groupMode: boolean
  selected: boolean
  onToggleSelected: (entryId: string) => void
  onUngroup: (groupId: string) => void
}) {
  // Reordering is exercise-level (canManageExercises), same as add/replace/
  // remove — disabled for a client the same way those already are.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: !canManageExercises,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  // One extra slot beyond this day's own maxSets (only when canEdit) so
  // every exercise — including whichever one already has maxSets sets —
  // has somewhere to render its own "+ Добавить подход" inline, right
  // after its last set, instead of a separate trailing column shared by
  // every row regardless of how many sets that particular exercise has.
  const setSlots = maxSets + (canEdit ? 1 : 0)
  const totalCols = 2 + setSlots
  // The comment row below only renders when there's something to show it
  // (see its own comment further down) — whichever <tr> actually ends up
  // last for this entry is the one that needs the group's bottom rule, so
  // the top/bottom horizontal lines that bracket a whole superset/dropset
  // block don't land on the wrong row when a coach vs. a client is viewing.
  const notesRowRenders = canManageExercises || !!entry.notes
  const sharedRowClasses = `${isDragging ? 'relative z-20 bg-surface-2 shadow-lg' : ''} ${entry.skipped ? 'opacity-60' : ''} ${
    groupInfo ? `border-l-4 ${GROUP_BORDER[groupInfo.groupType]}` : ''
  }`
  const groupTopClass = groupInfo?.isFirst ? `border-t-2 ${GROUP_BORDER[groupInfo.groupType]}` : ''
  const defaultBottom = 'border-b border-border last:border-b-0'
  // A grouped row never gets the plain per-row divider — only the row that
  // visually ends the whole group gets a (thick, orange) bottom line, so
  // the group reads as one bracketed block instead of a stack of
  // individually-separated exercises. Only an ungrouped row keeps the
  // normal divider between it and whatever comes next.
  const groupBottom = (isLastVisualRow: boolean) => {
    if (!groupInfo) return defaultBottom
    return isLastVisualRow ? `border-b-2 ${GROUP_BORDER[groupInfo.groupType]}` : 'border-b-0'
  }
  const mainRowClassName = `${sharedRowClasses} ${groupTopClass} ${groupBottom(!notesRowRenders)}`
  const notesRowClassName = `${sharedRowClasses} ${groupBottom(notesRowRenders)}`

  return (
    <>
    <tr ref={setNodeRef} style={style} className={mainRowClassName}>
      <td className="sticky left-0 z-10 w-56 max-w-[14rem] bg-surface px-2 py-1 align-top">
        {groupInfo?.isFirst && (
          <div className={`mb-1 flex items-center gap-1 text-[10px] font-bold ${GROUP_TEXT[groupInfo.groupType]}`}>
            {groupInfo.groupType === 'SUPERSET' ? <Link2 className="h-2.5 w-2.5" /> : <Zap className="h-2.5 w-2.5" />}
            {GROUP_LABEL[groupInfo.groupType]}
            {canManageExercises && (
              <button
                type="button"
                onClick={() => onUngroup(entry.groupId as string)}
                title="Разгруппировать"
                aria-label="Разгруппировать"
                className="text-text-secondary transition-colors hover:text-danger"
              >
                <Unlink className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        )}
        {/* Drag handle + skip toggle + number stay on their own top row;
            the exercise name/select moved to a full-width row underneath
            instead of squeezing into whatever's left next to those icons
            — that squeeze was making the name hard to read at this
            column's narrower width. */}
        <div className="flex items-center gap-1">
          {groupMode && canManageExercises && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelected(entry.id)}
              aria-label={`Выбрать «${entry.exercise.name}» для объединения`}
              className="shrink-0"
            />
          )}
          {canManageExercises && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label="Перетащить, чтобы изменить порядок"
              title="Перетащить, чтобы изменить порядок"
              style={{ touchAction: 'none' }}
              className="flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-text-secondary transition-colors hover:text-accent active:cursor-grabbing"
            >
              <GripVertical className="h-3 w-3" />
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => onToggleSkipped(entry.id)}
              aria-pressed={entry.skipped}
              title={entry.skipped ? 'Отметить как выполненное' : 'Отметить как пропущенное'}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                entry.skipped
                  ? 'border-danger bg-danger text-on-danger'
                  : 'border-border bg-surface-2 text-text-secondary hover:border-danger hover:text-danger'
              }`}
            >
              <Ban className="h-2.5 w-2.5" />
            </button>
          )}
          <span className="shrink-0 text-xs text-text-secondary">{index + 1}.</span>
        </div>
        <div className="mt-1 min-w-0">
          {canManageExercises ? (
            <Select
              className={`w-full min-w-0 whitespace-normal font-medium ${entry.skipped ? 'line-through' : ''}`}
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
            <span className={`font-medium ${entry.skipped ? 'line-through' : ''}`}>{entry.exercise.name}</span>
          )}
          {entry.skipped && <span className="text-[10px] text-danger">Пропущено</span>}
        </div>
      </td>
      {Array.from({ length: setSlots }).map((_, i) => {
        const set = entry.sets[i]
        if (!set) {
          // First empty slot right after this exercise's own last set —
          // that's where its "+ Добавить подход" goes now, instead of a
          // separate column at the far right shared by every row (which
          // put the button several empty cells away from an exercise's
          // actual last set whenever another exercise that day had more
          // sets than this one).
          if (canEdit && i === entry.sets.length) {
            return (
              <td key={i} className="px-0.5 py-0.5 align-top">
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
            )
          }
          return <td key={i} className="px-0.5 py-0.5" />
        }
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
              <div className={`flex flex-col items-center gap-0.5 ${set.completed ? 'opacity-70' : ''}`}>
                {/* pointer-events-auto exempts this from the day-level lock
                    (see the pointer-events-none wrapper in
                    GymWorkoutEditor) — mirrors SetRow's completed toggle on
                    the powerlifting side, so a set can be checked off
                    mid-session without unlocking weight/reps editing. */}
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onToggleCompleted(entry.id, set.id, !set.completed)}
                  aria-pressed={set.completed}
                  aria-label={`Подход ${i + 1}${set.completed ? ' выполнен, нажмите чтобы снять отметку' : ', нажмите чтобы отметить выполненным'}`}
                  className={`pointer-events-auto flex h-4 w-16 shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    set.completed
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-border bg-surface-2 text-text-primary hover:border-accent hover:text-accent'
                  }`}
                >
                  {set.completed ? <Check className="h-3 w-3" /> : i + 1}
                </button>
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
                  className="w-16 min-w-0 rounded border border-border bg-surface-2 px-0.5 py-0.5 text-center text-sm font-bold text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
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
    {/* Comment moved out of the narrow sticky name column above into its
        own full-width row right under the exercise — same info, just no
        longer forcing that column (and the whole table) wide. Only
        rendered when there's something to show: a coach always gets the
        input (to add one), a client only sees the row when a note already
        exists. */}
    {(canManageExercises || entry.notes) && (
      <tr style={style} className={notesRowClassName}>
        <td colSpan={totalCols} className="px-2 py-1 align-top">
          {canManageExercises ? (
            <textarea
              defaultValue={entry.notes ?? ''}
              onBlur={(e) => onSaveNotes(entry.id, e.target.value)}
              placeholder="Комментарий к упражнению (необязательно)"
              rows={1}
              className="w-full resize-none rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px] text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          ) : (
            entry.notes && <p className="text-[11px] italic text-text-secondary">{entry.notes}</p>
          )}
        </td>
      </tr>
    )}
    </>
  )
}
