'use client'

import Link from 'next/link'
import { use, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button, Card, Input, useToast } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { GymExerciseAutocomplete, type GymExerciseOption } from '@/components/GymExerciseAutocomplete'
import type { ImportedExercise } from '@/lib/gymImportParser'
import type { GymExerciseMatch } from '@/lib/gymExerciseMatch'

type Props = { params: Promise<{ athleteId: string }> }

// Same shape parseGymPlanText produces, except Date fields have crossed a
// JSON boundary (fetch().json()) and so arrive as ISO strings or null.
type PreviewWorkout = {
  week: number
  day: number
  date: string | null
  weekday: string | null
  exercises: ImportedExercise[]
}
type PreviewPlan = { name: string; weeks: number; workouts: PreviewWorkout[]; unmatchedLines: string[] }
type Preview = { parsed: PreviewPlan; exerciseMatches: GymExerciseMatch[] }

function nameKey(name: string) {
  return name.trim().toLowerCase()
}

// How a name with no exact catalog match resolves on confirm:
//  - exerciseId set — the coach picked (or created) a specific exercise
//    via the search dropdown; use it directly, no guessing needed.
//  - exerciseId null, not skipped — the coach didn't touch this row; falls
//    back to creating a brand-new catalog exercise under the raw parsed
//    name on confirm, same as the old single-click import's default.
//  - skip — not a real exercise (a note, a typo) — leave its sets out of
//    the import entirely.
type UnmatchedResolution = { exerciseId: string | null; exerciseName: string; skip: boolean }

export default function GymImportPage(props: Props) {
  const { athleteId: clientId } = use(props.params)
  const toast = useToast()

  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [planName, setPlanName] = useState('')
  const [resolutions, setResolutions] = useState<Map<string, UnmatchedResolution>>(new Map())
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ planId: string; workouts: number } | null>(null)

  const unmatched = useMemo(
    () => preview?.exerciseMatches.filter((m) => !m.matchedExerciseId) ?? [],
    [preview]
  )
  const recognized = useMemo(
    () => preview?.exerciseMatches.filter((m) => m.matchedExerciseId) ?? [],
    [preview]
  )

  function updateResolution(key: string, patch: Partial<UnmatchedResolution>) {
    setResolutions((prev) => {
      const next = new Map(prev)
      const current = next.get(key) ?? { exerciseId: null, exerciseName: '', skip: false }
      next.set(key, { ...current, ...patch })
      return next
    })
  }

  async function handleFile(file: File) {
    setError(null)
    setResult(null)
    setPreview(null)
    if (file.size > 10 * 1024 * 1024) {
      setError('Файл больше 10 МБ')
      return
    }
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (!allowed.includes(file.type)) {
      setError('Поддерживаются только PDF и DOCX')
      return
    }

    setUploading(true)
    setUploadStatus('Загружаю файл…')
    try {
      const signed = await fetch(`/api/gym/athletes/${clientId}/assessments/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, import: true }),
      })
      const signedBody = await signed.json().catch(() => ({}))
      if (!signed.ok) throw new Error(signedBody.error ?? 'Не удалось подготовить загрузку')

      const { error: uploadError } = await createClient()
        .storage
        .from('assessments')
        .uploadToSignedUrl(signedBody.path, signedBody.token, file, { contentType: file.type })
      if (uploadError) throw new Error('Не удалось загрузить файл')

      const assessmentRes = await fetch(`/api/gym/athletes/${clientId}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, storagePath: signedBody.path }),
      })
      const assessment = await assessmentRes.json().catch(() => ({}))
      if (!assessmentRes.ok || typeof assessment.id !== 'string') {
        throw new Error(assessment.error ?? 'Не удалось сохранить импорт')
      }

      setUploadStatus('Распознаю тренировки…')
      const previewRes = await fetch(`/api/gym/athletes/${clientId}/imports/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId: assessment.id }),
      })
      const previewBody = await previewRes.json().catch(() => ({}))
      if (!previewRes.ok) throw new Error(previewBody.error ?? 'Не удалось разобрать документ')

      const json = previewBody as Preview
      setPreview(json)
      setPlanName(json.parsed.name)
      const initial = new Map<string, UnmatchedResolution>()
      for (const m of json.exerciseMatches) {
        if (m.matchedExerciseId) continue
        // Pre-fill with the fuzzy-match suggestion when there is one — the
        // coach can still search for something else or clear it.
        initial.set(nameKey(m.name), {
          exerciseId: m.possibleDuplicate?.exerciseId ?? null,
          exerciseName: m.possibleDuplicate?.exerciseName ?? '',
          skip: false,
        })
      }
      setResolutions(initial)
      setUploadStatus('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setUploadStatus('')
    } finally {
      setUploading(false)
    }
  }

  async function handleConfirm() {
    if (!preview) return
    setConfirming(true)
    setError(null)
    try {
      const nameToExerciseId: Record<string, string> = {}
      for (const m of preview.exerciseMatches) {
        const key = nameKey(m.name)
        if (m.matchedExerciseId) {
          nameToExerciseId[key] = m.matchedExerciseId
          continue
        }
        const resolution = resolutions.get(key)
        if (resolution?.skip) continue // not a real exercise — leave out entirely
        if (resolution?.exerciseId) {
          // Picked (or already created inline) via the search dropdown.
          nameToExerciseId[key] = resolution.exerciseId
          continue
        }
        // Coach didn't touch this row and there was no suggestion to
        // pre-fill — fall back to creating it under the raw parsed name,
        // same default as the old single-click import.
        const res = await fetch('/api/admin/gym-exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: m.name }),
        })
        if (res.ok) {
          const created = await res.json()
          nameToExerciseId[key] = created.id
        }
        // If creation fails (race with an identical name, etc.) this
        // name's sets are simply left out below — no partial/bad data.
      }

      const res = await fetch(`/api/gym/athletes/${clientId}/imports/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed: preview.parsed, nameToExerciseId, planName }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось импортировать')
      setResult(body)
      toast({ title: 'План импортирован', variant: 'success' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось импортировать', description: message, variant: 'error' })
    } finally {
      setConfirming(false)
    }
  }

  function summarizeSets(exercise: ImportedExercise) {
    return exercise.sets.map((s) => (s.weight > 0 ? `${s.weight}×${s.reps}` : `×${s.reps}`)).join(', ')
  }

  const totalToImport = preview
    ? preview.exerciseMatches.reduce((sum, m) => {
        if (m.matchedExerciseId) return sum + m.count
        const resolution = resolutions.get(nameKey(m.name))
        return resolution?.skip ? sum : sum + m.count
      }, 0)
    : 0

  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-3xl space-y-5 bg-bg p-6 text-text-primary">
      <Link href={`/gym/athletes/${clientId}/plans`} className="text-sm text-text-secondary">
        ← Планы клиента
      </Link>
      <h1 className="font-display text-xl uppercase">Импорт тренировки</h1>

      <Card className="space-y-3">
        <p className="text-sm text-text-secondary">
          Загрузите план в формате DOCX или PDF. Тренировки, упражнения, подходы и веса
          распознаются автоматически по тексту документа — без AI.
        </p>
        <p className="text-xs text-text-secondary">
          Поддерживаемая запись подхода: «Упражнение 120 4х6», «Упражнение 120 4/6» (вес,
          подходы, повторы) или «Упражнение 12-10-8-6» (повторы по подходам, без веса).
          Строки, которые не удалось разобрать, останутся без изменений — добавь их вручную
          после импорта.
        </p>
        <Input
          type="file"
          accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
        {uploadStatus && <p className="text-sm text-text-secondary">{uploadStatus}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </Card>

      {preview && !result && (
        <>
          <Card padding="sm" className="space-y-2">
            <p className="text-sm text-zone-low">
              Распознано: {preview.parsed.workouts.length} тренировок,{' '}
              {recognized.reduce((s, m) => s + m.count, 0)} подходов уже знакомых упражнений
            </p>
            <div className="max-h-56 overflow-auto space-y-1 text-xs">
              {preview.parsed.workouts.map((w, i) => (
                <div key={i} className="text-text-secondary">
                  Неделя {w.week}, день {w.day}
                  {w.date ? ` · ${w.weekday} ${w.date.slice(0, 10)}` : ''} ·{' '}
                  {w.exercises.length} упражнений
                </div>
              ))}
            </div>
            {preview.parsed.unmatchedLines.length > 0 && (
              <details className="text-xs text-zone-moderate">
                <summary className="cursor-pointer">
                  Не распознано строк: {preview.parsed.unmatchedLines.length}
                </summary>
                <div className="mt-1 max-h-40 overflow-auto space-y-0.5 text-text-secondary">
                  {preview.parsed.unmatchedLines.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              </details>
            )}
          </Card>

          {unmatched.length > 0 && (
            <Card padding="sm" className="space-y-2">
              <p className="text-sm text-zone-moderate">
                Нет в справочнике упражнений: {unmatched.length} названий. Для каждого — найди
                похожее или подходящее в справочнике и выбери его (чтобы не плодить дубликаты
                вроде «Присед» / «Приседания»), либо создай новое прямо в поле, либо пропусти
                (если это не упражнение).
              </p>
              <div className="max-h-[32rem] overflow-auto space-y-3 text-xs">
                {unmatched.map((m) => {
                  const key = nameKey(m.name)
                  const resolution = resolutions.get(key) ?? { exerciseId: null, exerciseName: '', skip: false }
                  return (
                    <div key={key} className="space-y-1.5 rounded-lg border border-border p-2">
                      <p>
                        «{m.name}» <span className="text-text-secondary">×{m.count}</span>
                      </p>
                      {m.possibleDuplicate && (
                        <p className="text-zone-moderate">
                          Похоже на «{m.possibleDuplicate.exerciseName}» в справочнике (
                          {Math.round(m.possibleDuplicate.score * 100)}% совпадение)
                        </p>
                      )}
                      <fieldset disabled={resolution.skip} className="disabled:opacity-40">
                        <GymExerciseAutocomplete
                          defaultQuery={m.possibleDuplicate?.exerciseName ?? ''}
                          placeholder={`Найти в справочнике или создать «${m.name}»…`}
                          onSelect={(exercise: GymExerciseOption) =>
                            updateResolution(key, { exerciseId: exercise.id, exerciseName: exercise.name })
                          }
                        />
                      </fieldset>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-text-secondary">
                          {resolution.skip
                            ? 'Будет пропущено'
                            : resolution.exerciseId
                              ? `Будет использовано: «${resolution.exerciseName}»`
                              : `Без выбора — создастся новое «${m.name}»`}
                        </p>
                        <label className="ml-auto flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={resolution.skip}
                            onChange={(e) => updateResolution(key, { skip: e.target.checked })}
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
            <details className="text-xs text-text-secondary">
              <summary className="cursor-pointer">Показать все распознанные подходы</summary>
              <div className="mt-1 max-h-56 overflow-auto space-y-1">
                {preview.parsed.workouts.map((w, i) => (
                  <div key={i}>
                    <p className="font-medium text-text-primary">
                      Неделя {w.week}, день {w.day}
                    </p>
                    {w.exercises.map((e, j) => (
                      <p key={j} className="pl-2">
                        {e.name} — {summarizeSets(e)}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          </Card>

          <Card padding="sm" className="space-y-2">
            <Input
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="Название плана"
              className="w-full"
            />
            <Button onClick={() => void handleConfirm()} disabled={confirming || totalToImport === 0}>
              {confirming ? 'Импортирую…' : `Импортировать (${totalToImport} подходов)`}
            </Button>
          </Card>
        </>
      )}

      {result && (
        <Card padding="sm" className="space-y-1 text-sm">
          <p className="text-zone-low">Готово.</p>
          <p>Тренировок создано: {result.workouts}</p>
          <Link
            href={`/gym/plans/${result.planId}`}
            className="inline-flex items-center gap-1.5 text-accent hover:underline"
          >
            Открыть план <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      )}
    </main>
  )
}
