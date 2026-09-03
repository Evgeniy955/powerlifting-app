'use client'

import { useMemo, useState, use } from 'react';
import { ArrowRight } from 'lucide-react'
import { Button, Card, Dropzone, Input, useToast } from '@/components/ui'
import type { DuplicateSuggestion, ImportPreview, ParsedExerciseRow } from '@/lib/excelImport'

type Props = { params: Promise<{ athleteId: string }> }

function nameKey(name: string) {
  return name.trim().toLowerCase()
}

// What happens to a unique unrecognized name on confirm:
//  - 'create' — add it as a brand-new catalog exercise (the old default for
//    every unrecognized row).
//  - 'link'   — don't create anything; use the suggested existing exercise
//    instead, on the assumption it's just a spelling/inflection variant
//    ("Приседания" vs "Приседание"). Only a valid choice when a
//    possibleDuplicate suggestion exists.
//  - 'skip'   — not a real exercise (a note, a typo row, etc.) — leave its
//    rows out of the import entirely.
type UnrecognizedAction = 'create' | 'link' | 'skip'

// Coach-only screen: upload an .xlsx/.xlsm training log, review what got recognized
// vs. not (exercise names must match the ExerciseCatalog exactly, case-insensitive).
// Unrecognized names that look like a near-duplicate of an existing catalog exercise
// are flagged with a suggestion instead of being silently created — the coach picks
// per name whether to reuse the existing exercise, add it as genuinely new (coefficient
// 1.0, editable later), or skip it. Then names the resulting cycle and confirms to
// commit into the DB.
export default function ImportPage(props: Props) {
  const params = use(props.params);
  const { athleteId } = params
  const toast = useToast()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [cycleName, setCycleName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ cycleId: string; workoutsCreated: number; exerciseEntriesCreated: number } | null>(null)
  const [actions, setActions] = useState<Map<string, UnrecognizedAction>>(new Map())

  const uniqueUnrecognized = useMemo(() => {
    if (!preview) return []
    const seen = new Map<
      string,
      { count: number; displayName: string; possibleDuplicate: DuplicateSuggestion | null }
    >()
    for (const e of preview.unrecognized) {
      const key = nameKey(e.rawName)
      const existing = seen.get(key)
      if (existing) {
        existing.count++
      } else {
        // show the first original-cased occurrence for display
        seen.set(key, { count: 1, displayName: e.rawName, possibleDuplicate: e.possibleDuplicate })
      }
    }
    return Array.from(seen.entries()).map(([key, v]) => ({ key, ...v }))
  }, [preview])

  function setAction(key: string, action: UnrecognizedAction) {
    setActions((prev) => {
      const next = new Map(prev)
      next.set(key, action)
      return next
    })
  }

  async function handleFile(file: File) {
    setError(null)
    setResult(null)
    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/import/preview`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось разобрать файл')
      }
      const json: ImportPreview = await res.json()
      setPreview(json)
      // Default: names with a suggested existing match are linked to it
      // (avoids creating a near-duplicate); everything else defaults to
      // creating a new catalog exercise, same as before.
      const initial = new Map<string, UnrecognizedAction>()
      for (const e of json.unrecognized) {
        const key = nameKey(e.rawName)
        if (initial.has(key)) continue
        initial.set(key, e.possibleDuplicate ? 'link' : 'create')
      }
      setActions(initial)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!preview) return
    setLoading(true)
    setError(null)
    try {
      const nameToId = new Map<string, string>()

      // Names the coach chose to treat as an existing exercise instead of
      // creating a near-duplicate — the id is already known from the
      // fuzzy-match suggestion, no API call needed.
      for (const u of uniqueUnrecognized) {
        if (actions.get(u.key) === 'link' && u.possibleDuplicate) {
          nameToId.set(u.key, u.possibleDuplicate.exerciseId)
        }
      }

      // Create any names the coach confirmed are genuinely new (coefficient
      // 1.0 by default — edit later), then fold their rows into the import payload.
      const namesToCreate = uniqueUnrecognized.filter((u) => actions.get(u.key) === 'create')

      for (const u of namesToCreate) {
        const res = await fetch('/api/exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: u.displayName, impactCoefficient: 1.0 }),
        })
        if (res.ok) {
          const created = await res.json()
          nameToId.set(u.key, created.id)
        }
        // If creation fails (e.g. race with an identical name), that group's rows
        // are simply left out of this import — no partial/bad data written.
      }

      const newlyRecognized: ParsedExerciseRow[] = preview.unrecognized
        .filter((e) => nameToId.has(nameKey(e.rawName)))
        .map((e) => ({
          ...e,
          matchedExerciseId: nameToId.get(nameKey(e.rawName))!,
          matchedExerciseName: e.rawName,
        }))

      const entries = [...preview.recognized, ...newlyRecognized]

      const res = await fetch(`/api/athletes/${athleteId}/import/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleName, entries }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось импортировать')
      }
      setResult(await res.json())
      toast({ title: 'Импорт завершён', variant: 'success' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось импортировать', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function summarizeSets(entry: ParsedExerciseRow) {
    return entry.sets.map((s) => `${s.weight}×${s.reps}`).join(', ')
  }

  const totalToImport =
    (preview?.recognized.length ?? 0) +
    (preview?.unrecognized.filter((e) => {
      const action = actions.get(nameKey(e.rawName))
      return action === 'create' || action === 'link'
    }).length ?? 0)

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-2xl mx-auto space-y-4 lg:max-w-4xl">
      <h1 className="font-display text-xl uppercase tracking-wide">Импорт из Excel</h1>

      <Card padding="sm" className="space-y-2">
        <Dropzone
          accept=".xlsx,.xlsm"
          hint="Файлы .xlsx или .xlsm"
          onFileSelected={handleFile}
          disabled={loading}
        />
        {loading && <p className="text-sm text-text-secondary">Обработка...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </Card>

      {preview && !result && (
        <>
          <Card padding="sm" className="space-y-2">
            <p className="text-sm text-zone-low">
              Распознано сразу: {preview.recognized.length} строк
            </p>
            <div className="max-h-48 overflow-auto text-xs space-y-1">
              {preview.recognized.map((e, i) => (
                <div key={i} className="text-text-secondary">
                  {e.date} · {e.matchedExerciseName} · {summarizeSets(e)}
                  {e.oneRepMax ? ` · ПМ: ${e.oneRepMax}` : ''}
                </div>
              ))}
            </div>
          </Card>

          {uniqueUnrecognized.length > 0 && (
            <Card padding="sm" className="space-y-2">
              <p className="text-sm text-zone-moderate">
                Не найдено в справочнике: {uniqueUnrecognized.length} уникальных названий
                ({preview.unrecognized.length} строк). Похожие на уже существующие
                упражнения отмечены отдельно — выбери, использовать ли существующее
                (чтобы не плодить дубликаты вроде «Приседания» / «Приседание»), добавить
                как новое, или пропустить (если это не упражнение — пометка, опечатка
                и т.п.).
              </p>
              <div className="max-h-80 overflow-auto space-y-2 text-xs">
                {uniqueUnrecognized.map((u) => {
                  const action = actions.get(u.key) ?? (u.possibleDuplicate ? 'link' : 'create')
                  return (
                    <div key={u.key} className="rounded-lg border border-border p-2 space-y-1.5">
                      <p>
                        «{u.displayName}» <span className="text-text-secondary">×{u.count}</span>
                      </p>
                      {u.possibleDuplicate && (
                        <p className="text-zone-moderate">
                          Похоже на «{u.possibleDuplicate.exerciseName}» в справочнике (
                          {Math.round(u.possibleDuplicate.score * 100)}% совпадение)
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        {u.possibleDuplicate && (
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`action-${u.key}`}
                              checked={action === 'link'}
                              onChange={() => setAction(u.key, 'link')}
                            />
                            Это «{u.possibleDuplicate.exerciseName}»
                          </label>
                        )}
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`action-${u.key}`}
                            checked={action === 'create'}
                            onChange={() => setAction(u.key, 'create')}
                          />
                          Новое упражнение
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`action-${u.key}`}
                            checked={action === 'skip'}
                            onChange={() => setAction(u.key, 'skip')}
                          />
                          Пропустить
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          <Card padding="sm" className="space-y-2">
            <Input
              value={cycleName}
              onChange={(e) => setCycleName(e.target.value)}
              placeholder="Название цикла (напр. «Импорт из Excel»)"
              className="w-full"
            />
            <Button onClick={handleConfirm} disabled={loading || totalToImport === 0}>
              Импортировать {totalToImport} строк
            </Button>
          </Card>
        </>
      )}

      {result && (
        <Card padding="sm" className="text-sm space-y-1">
          <p className="text-zone-low">Готово.</p>
          <p>Тренировок создано: {result.workoutsCreated}</p>
          <p>Упражнений импортировано: {result.exerciseEntriesCreated}</p>
          <a
            href={`/cycles/${result.cycleId}`}
            className="inline-flex items-center gap-1.5 text-accent hover:underline"
          >
            Открыть цикл <ArrowRight className="h-4 w-4" />
          </a>
        </Card>
      )}
    </main>
  )
}
