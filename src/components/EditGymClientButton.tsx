'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button, Dialog, Input, useToast } from '@/components/ui'
import { wardNoun } from '@/lib/gender'

type Props = {
  clientId: string
  displayName: string | null
  // Override the coach-scoped endpoint — used by the admin panel, which can
  // rename any gym client, not just the signed-in coach's own.
  patchUrl?: string
  // Called with the saved name instead of router.refresh() — the admin
  // panel keeps its own list state (mirrors AdminPendingInvites).
  onSaved?: (name: string) => void
}

// Lets the coach rename a gym client, regardless of invite status — the
// PATCH route only gated inviteEmail behind "not yet accepted", displayName
// was always editable there, this just adds the missing UI for it.
export function EditGymClientButton({ clientId, displayName, patchUrl, onSaved }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [draftName, setDraftName] = useState(displayName ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    const name = draftName.trim()
    if (!name) {
      toast({ title: 'Укажите имя', variant: 'error' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch(patchUrl ?? `/api/gym/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось сохранить имя')
      }
      toast({ title: 'Имя обновлено', variant: 'success' })
      setOpen(false)
      if (onSaved) onSaved(name)
      else router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDraftName(displayName ?? '')
          setOpen(true)
        }}
        disabled={loading}
        title="Редактировать имя"
        aria-label="Редактировать имя"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-on-accent shadow-card transition-transform hover:scale-110 hover:brightness-110 disabled:opacity-50"
      >
        <Pencil className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen} title={`Изменить имя ${wardNoun(displayName, 'accusative')}`}>
        <div
          className="flex flex-col gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={`Имя ${wardNoun(displayName, 'accusative')}`}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={loading}>
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
