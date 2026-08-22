'use client'

import { useState } from 'react'
import { Archive, Trash2 } from 'lucide-react'
import { Button, Dialog, useToast } from '@/components/ui'

type Props = {
  athleteId: string
  athleteName: string
  // Whether this athlete has accepted their invite (has a real account) —
  // changes the wording (a pending placeholder has nothing tied to a real
  // login; an accepted athlete's account goes with a permanent delete).
  accepted: boolean
  // 'roster' (default): used on the main athletes list. If the athlete has
  // at least one plan, the server archives instead of deleting (reversible);
  // pass hasPlans so the button/dialog reflect that up front. No plans at
  // all -> nothing to lose, deletes immediately, same as archive mode.
  // 'archive': used on the archive screen for an athlete who's already
  // archived — here DELETE is always the real, permanent, unrecoverable one.
  mode?: 'roster' | 'archive'
  hasPlans?: boolean
  onDone: () => void
}

export function DeleteAthleteButton({
  athleteId,
  athleteName,
  accepted,
  mode = 'roster',
  hasPlans = false,
  onDone,
}: Props) {
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const willArchive = mode === 'roster' && hasPlans

  async function handleConfirm() {
    setConfirmOpen(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось выполнить действие')
      }
      const body = (await res.json().catch(() => ({}))) as { archived?: boolean }
      toast({
        title: body.archived ? `«${athleteName}» перемещён в архив` : `«${athleteName}» удалён`,
        variant: 'success',
      })
      onDone()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось выполнить действие', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const dialogTitle = willArchive ? 'Отправить в архив?' : mode === 'archive' ? 'Удалить навсегда?' : 'Удалить атлета?'

  const dialogDescription = willArchive
    ? `У «${athleteName}» есть планы тренировок — вместо удаления профиль переместится в архив: пропадёт из общего списка, но все циклы, тренировки и подходы сохранятся. Восстановить можно в любой момент со страницы «Архив».`
    : mode === 'archive'
      ? accepted
        ? `«${athleteName}» будет удалён без возможности восстановления — вместе с аккаунтом сотрутся ВСЕ его циклы, тренировки, подходы и 1ПМ.`
        : `Профиль «${athleteName}» будет удалён без возможности восстановления.`
      : accepted
        ? `«${athleteName}» уже принял приглашение — удаление сотрёт ВСЕ его циклы, тренировки, подходы и 1ПМ без возможности восстановления.`
        : `«${athleteName}» ещё не принял приглашение. Страница атлета удалится без возможности восстановления.`

  const confirmLabel = willArchive ? 'В архив' : mode === 'archive' ? 'Удалить навсегда' : 'Удалить'

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        title={willArchive ? 'Архивировать атлета' : mode === 'archive' ? 'Удалить навсегда' : 'Удалить атлета'}
        aria-label={willArchive ? 'Архивировать атлета' : mode === 'archive' ? 'Удалить навсегда' : 'Удалить атлета'}
        className={`flex h-8 w-8 items-center justify-center rounded-full shadow-card transition-transform hover:scale-110 hover:brightness-110 disabled:opacity-50 ${
          willArchive ? 'bg-slate-500 text-white' : 'bg-danger text-on-danger'
        }`}
      >
        {willArchive ? <Archive className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
      </button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} title={dialogTitle} description={dialogDescription}>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
            Отмена
          </Button>
          <Button variant={willArchive ? 'secondary' : 'danger'} size="sm" onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
