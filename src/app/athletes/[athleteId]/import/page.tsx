'use client'

import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button, Card, Checkbox, Dropzone, Input, useToast } from '@/components/ui'
import type { ImportPreview, ParsedExerciseRow } from '@/lib/excelImport'

type Props = { params: { athleteId: string } }

function nameKey(name: string) {
  return name.trim().toLowerCase()
}

// Coach-only screen: upload an .xlsx/.xlsm training log, review what got recognized
// vs. not (exercise names must match the ExerciseCatalog exactly, case-insensitive),
// optionally add unrecognized names to the catalog on the fly (coefficient 1.0,
// editable later), name the resulting cycle, then confirm to commit into the DB.
export default function ImportPage({ params }: Props) {
  const { athleteId } = params
  const toast = useToast()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [cycleName, setCycleName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ cycleId: string; workoutsCreated: number; exerciseEntriesCreated: number } | null>(null)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())

  const uniqueUnrecognized = useMemo(() => {
    if (!preview) return []
    const seen = new Map<string, number>()
    for (const e of preview.unrecognized) {
      const key = nameKey(e.rawName)
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    return Array.from(seen.entries()).map(([key, count]) => ({
      key,
      // show the first original-cased occurrence for display
      displayName: preview.unrecognized.find((e) => nameKey(e.rawName) === key)!.rawName,
      count,
    }))
  }, [preview])

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
      // Default: all unrecognized names selected for auto-creation.
      const keys = new Set(json.unrecognized.map((e) => nameKey(e.rawName)))
      setSelectedNames(keys)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  function toggleName(key: string) {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleConfirm() {
    if (!preview) return
    setLoading(true)
    setError(null)
    try {
      // Create any selected unrecognized exercises in the catalog first (coefficient
      // 1.0 by default — edit later), then fold their rows into the import payload.
      const nameToId = new Map<string, string>()
      const namesToCreate = uniqueUnrecognized.filter((u) => selectedNames.has(u.key))

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
    (preview?.unrecognized.filter((e) => selectedNames.has(nameKey(e.rawName))).length ?? 0)

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
                ({preview.unrecognized.length} строк). Отмеченные будут добавлены в
                справочник с коэффициентом воздействия 1.0 (можно поправить позже) и
                импортированы вместе с остальным. Сними галочку, если строка — не
                упражнение (пометки, опечатки и т.п.).
              </p>
              <div className="max-h-64 overflow-auto text-xs space-y-1">
                {uniqueUnrecognized.map((u) => (
                  <Checkbox
                    key={u.key}
                    checked={selectedNames.has(u.key)}
                    onChange={() => toggleName(u.key)}
                    label={
                      <>
                        «{u.displayName}» <span className="text-text-secondary">×{u.count}</span>
                      </>
                    }
                  />
                ))}
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
