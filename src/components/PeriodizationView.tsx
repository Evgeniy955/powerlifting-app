'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Trash2, Unlink } from 'lucide-react'
import { Button, Card, Dialog, Input, Select, useToast } from '@/components/ui'
import { CreatePlanDialog } from '@/components/CreatePlanDialog'
import {
  PERIOD_PRESETS,
  STAGE_PRESETS,
  MESOCYCLE_PRESETS,
  MICROCYCLE_PRESETS,
  periodColor,
  stageColor,
} from '@/lib/periodization'

type PeriodizationMicrocycle = {
  id: string
  weekNumber: number
  microcycleType: string | null
}

type PeriodizationCycle = {
  id: string
  name: string
  startDate: string
  weeks: number
  mesocycleType: string | null
  microcycles: PeriodizationMicrocycle[]
}

type PeriodizationStage = {
  id: string
  name: string
  startDate: string
  endDate: string
  cycles: PeriodizationCycle[]
}

type PeriodizationPeriod = {
  id: string
  name: string
  startDate: string
  endDate: string
  stages: PeriodizationStage[]
}

type UnassignedCycle = {
  id: string
  name: string
  startDate: string
  weeks: number
}

type Props = {
  athleteId: string
  periods: PeriodizationPeriod[]
  unassignedCycles: UnassignedCycle[]
  canEdit: boolean
}

function fmt(iso: string) {
  return iso.slice(0, 10)
}

type MutateFn = (url: string, method: string, body?: unknown, successTitle?: string) => Promise<void>

// Every write in this view is a plain fetch + router.refresh() — the page
// above is a server component, so refresh() just re-runs its query and
// hands fresh props back down. Simpler and more robust than hand-rolled
// optimistic state for a tree this shape (Period -> Stage -> Cycle ->
// Microcycle), at the cost of a round trip per edit — acceptable for a
// coach editing a season plan, not a hot path.
export function PeriodizationView({ athleteId, periods, unassignedCycles, canEdit }: Props) {
  const router = useRouter()
  const toast = useToast()

  const handleMutate: MutateFn = async (url, method, body, successTitle) => {
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Не удалось сохранить')
      }
      router.refresh()
      if (successTitle) toast({ title: successTitle, variant: 'success' })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <PeriodFormDialog
            athleteId={athleteId}
            trigger={(open) => (
              <Button size="sm" onClick={open}>
                <Plus className="h-4 w-4" /> Добавить период
              </Button>
            )}
            onSaved={() => router.refresh()}
          />
        </div>
      )}

      {periods.length === 0 && (
        <Card padding="md" className="text-center text-sm text-text-secondary">
          Периодов пока нет.{canEdit && ' Добавь первый период — внутри него можно будет создать этапы.'}
        </Card>
      )}

      {periods.map((period) => (
        <PeriodCard
          key={period.id}
          period={period}
          canEdit={canEdit}
          athleteId={athleteId}
          unassignedCycles={unassignedCycles}
          onMutate={handleMutate}
        />
      ))}

      {unassignedCycles.length > 0 && (
        <Card padding="md" className="space-y-2">
          <p className="text-sm font-medium text-text-secondary">Планы вне периодизации</p>
          <div className="space-y-1">
            {unassignedCycles.map((cycle) => (
              <div key={cycle.id} className="flex items-center justify-between text-sm">
                <Link href={`/cycles/${cycle.id}`} className="hover:text-accent">
                  {cycle.name}
                </Link>
                <span className="text-xs text-text-secondary">
                  {fmt(cycle.startDate)} · {cycle.weeks} нед.
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function PeriodCard({
  period,
  canEdit,
  athleteId,
  unassignedCycles,
  onMutate,
}: {
  period: PeriodizationPeriod
  canEdit: boolean
  athleteId: string
  unassignedCycles: UnassignedCycle[]
  onMutate: MutateFn
}) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const color = periodColor(period.name)

  return (
    <Card padding="none" className="overflow-hidden">
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${color.bg} ${color.text}`}>
        <div>
          <p className="font-display text-sm uppercase tracking-wide">{period.name}</p>
          <p className="text-xs opacity-80">
            {fmt(period.startDate)} – {fmt(period.endDate)}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <PeriodFormDialog
              athleteId={athleteId}
              period={period}
              trigger={(open) => (
                <button
                  onClick={open}
                  className="rounded p-1.5 hover:bg-black/10"
                  aria-label="Редактировать период"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              onSaved={() => router.refresh()}
            />
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1.5 hover:bg-black/10"
              aria-label="Удалить период"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        {period.stages.map((stage) => (
          <StageCard
            key={stage.id}
            stage={stage}
            periodName={period.name}
            canEdit={canEdit}
            athleteId={athleteId}
            unassignedCycles={unassignedCycles}
            onMutate={onMutate}
          />
        ))}

        {canEdit && (
          <StageFormDialog
            periodId={period.id}
            trigger={(open) => (
              <Button variant="outline" size="sm" onClick={open}>
                <Plus className="h-4 w-4" /> Добавить этап
              </Button>
            )}
            onSaved={() => router.refresh()}
          />
        )}

        {!canEdit && period.stages.length === 0 && (
          <p className="text-sm text-text-secondary">Этапы ещё не добавлены.</p>
        )}
      </div>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Удалить период?"
        description={`«${period.name}» — удалятся все этапы внутри него. Прикреплённые планы (мезоциклы) не удаляются, просто открепляются.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setConfirmDelete(false)
              onMutate(`/api/periods/${period.id}`, 'DELETE', undefined, 'Период удалён')
            }}
          >
            Удалить
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}

function StageCard({
  stage,
  periodName,
  canEdit,
  athleteId,
  unassignedCycles,
  onMutate,
}: {
  stage: PeriodizationStage
  periodName: string
  canEdit: boolean
  athleteId: string
  unassignedCycles: UnassignedCycle[]
  onMutate: MutateFn
}) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [attachValue, setAttachValue] = useState('')
  const color = stageColor(periodName)

  async function handleAttach(cycleId: string) {
    if (!cycleId) return
    await onMutate(`/api/cycles/${cycleId}`, 'PATCH', { stageId: stage.id }, 'План прикреплён')
    setAttachValue('')
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.bg}`} />
          <div>
            <p className="text-sm font-medium">{stage.name}</p>
            <p className="text-xs text-text-secondary">
              {fmt(stage.startDate)} – {fmt(stage.endDate)}
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <StageFormDialog
              periodId=""
              stage={stage}
              trigger={(open) => (
                <button onClick={open} className="rounded p-1.5 hover:bg-surface" aria-label="Редактировать этап">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              onSaved={() => router.refresh()}
            />
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1.5 hover:bg-surface"
              aria-label="Удалить этап"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2 p-3">
        {stage.cycles.length === 0 && (
          <p className="text-sm text-text-secondary">Мезоциклы ещё не привязаны.</p>
        )}
        {stage.cycles.map((cycle) => (
          <MesocycleRow key={cycle.id} cycle={cycle} onMutate={onMutate} canEdit={canEdit} />
        ))}

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Select
              fieldSize="sm"
              value={attachValue}
              onChange={(e) => {
                setAttachValue(e.target.value)
                handleAttach(e.target.value)
              }}
              disabled={unassignedCycles.length === 0}
            >
              <option value="">
                {unassignedCycles.length === 0 ? 'Нет свободных планов' : 'Прикрепить существующий план...'}
              </option>
              {unassignedCycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({fmt(c.startDate)})
                </option>
              ))}
            </Select>
            <CreatePlanDialog
              athleteId={athleteId}
              stageId={stage.id}
              trigger={(open) => (
                <Button variant="outline" size="sm" onClick={open}>
                  <Plus className="h-4 w-4" /> Новый план
                </Button>
              )}
              onCreated={() => router.refresh()}
            />
          </div>
        )}
      </div>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Удалить этап?"
        description={`«${stage.name}» — прикреплённые планы (мезоциклы) не удаляются, просто открепляются.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setConfirmDelete(false)
              onMutate(`/api/stages/${stage.id}`, 'DELETE', undefined, 'Этап удалён')
            }}
          >
            Удалить
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function MesocycleRow({
  cycle,
  canEdit,
  onMutate,
}: {
  cycle: PeriodizationCycle
  canEdit: boolean
  onMutate: MutateFn
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-md border border-border bg-surface p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/cycles/${cycle.id}`} className="text-sm font-medium hover:text-accent">
            {cycle.name}
          </Link>
          <p className="text-xs text-text-secondary">
            {fmt(cycle.startDate)} · {cycle.weeks} нед.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Select
              fieldSize="sm"
              value={cycle.mesocycleType ?? ''}
              onChange={(e) =>
                onMutate(`/api/cycles/${cycle.id}`, 'PATCH', { mesocycleType: e.target.value || null })
              }
            >
              <option value="">не указан</option>
              {MESOCYCLE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          ) : (
            cycle.mesocycleType && <span className="text-xs text-text-secondary">{cycle.mesocycleType}</span>
          )}
          <button onClick={() => setExpanded((v) => !v)} className="text-xs text-accent hover:underline">
            {expanded ? 'Скрыть недели' : `Недели (${cycle.microcycles.length})`}
          </button>
          {canEdit && (
            <button
              onClick={() => onMutate(`/api/cycles/${cycle.id}`, 'PATCH', { stageId: null }, 'План откреплён')}
              className="rounded p-1 text-text-secondary hover:bg-surface-2 hover:text-danger"
              aria-label="Открепить план"
              title="Открепить от этапа"
            >
              <Unlink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
          {cycle.microcycles.map((mc) => (
            <label key={mc.id} className="flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-1 text-xs">
              <span className="text-text-secondary">Нед {mc.weekNumber}</span>
              {canEdit ? (
                <select
                  value={mc.microcycleType ?? ''}
                  onChange={(e) =>
                    onMutate(`/api/microcycles/${mc.id}`, 'PATCH', {
                      microcycleType: e.target.value || null,
                    })
                  }
                  className="rounded border-none bg-transparent text-xs outline-none"
                >
                  <option value="">—</option>
                  {MICROCYCLE_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{mc.microcycleType ?? '—'}</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function PeriodFormDialog({
  athleteId,
  period,
  trigger,
  onSaved,
}: {
  athleteId: string
  period?: PeriodizationPeriod
  trigger: (open: () => void) => React.ReactNode
  onSaved: () => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(period?.name ?? PERIOD_PRESETS[0])
  const [startDate, setStartDate] = useState(period ? fmt(period.startDate) : '')
  const [endDate, setEndDate] = useState(period ? fmt(period.endDate) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    setName(period?.name ?? PERIOD_PRESETS[0])
    setStartDate(period ? fmt(period.startDate) : '')
    setEndDate(period ? fmt(period.endDate) : '')
    setError(null)
    setOpen(true)
  }

  async function handleSave() {
    if (!startDate || !endDate) {
      setError('Укажите обе даты')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const url = period ? `/api/periods/${period.id}` : `/api/athletes/${athleteId}/periods`
      const res = await fetch(url, {
        method: period ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, startDate, endDate }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось сохранить')
      }
      toast({ title: period ? 'Период обновлён' : 'Период добавлен', variant: 'success' })
      setOpen(false)
      onSaved()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {trigger(openDialog)}
      <Dialog open={open} onOpenChange={setOpen} title={period ? 'Редактировать период' : 'Новый период'}>
        <div className="space-y-3">
          <label className="block text-xs text-text-secondary">
            Название
            <Select value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full">
              {PERIOD_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex gap-2">
            <label className="block flex-1 text-xs text-text-secondary">
              Начало
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
            <label className="block flex-1 text-xs text-text-secondary">
              Конец
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading}>
              {loading ? 'Сохраняю...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

function StageFormDialog({
  periodId,
  stage,
  trigger,
  onSaved,
}: {
  periodId: string
  stage?: PeriodizationStage
  trigger: (open: () => void) => React.ReactNode
  onSaved: () => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(stage?.name ?? STAGE_PRESETS[0])
  const [startDate, setStartDate] = useState(stage ? fmt(stage.startDate) : '')
  const [endDate, setEndDate] = useState(stage ? fmt(stage.endDate) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    setName(stage?.name ?? STAGE_PRESETS[0])
    setStartDate(stage ? fmt(stage.startDate) : '')
    setEndDate(stage ? fmt(stage.endDate) : '')
    setError(null)
    setOpen(true)
  }

  async function handleSave() {
    if (!startDate || !endDate) {
      setError('Укажите обе даты')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const url = stage ? `/api/stages/${stage.id}` : `/api/periods/${periodId}/stages`
      const res = await fetch(url, {
        method: stage ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, startDate, endDate }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось сохранить')
      }
      toast({ title: stage ? 'Этап обновлён' : 'Этап добавлен', variant: 'success' })
      setOpen(false)
      onSaved()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {trigger(openDialog)}
      <Dialog open={open} onOpenChange={setOpen} title={stage ? 'Редактировать этап' : 'Новый этап'}>
        <div className="space-y-3">
          <label className="block text-xs text-text-secondary">
            Название
            <Select value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full">
              {STAGE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex gap-2">
            <label className="block flex-1 text-xs text-text-secondary">
              Начало
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
            <label className="block flex-1 text-xs text-text-secondary">
              Конец
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading}>
              {loading ? 'Сохраняю...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
