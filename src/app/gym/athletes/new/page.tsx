'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Card, Checkbox, Input, useToast } from '@/components/ui'
import { guessGender, wardNoun } from '@/lib/gender'

export default function NewGymClientPage() {
  const router = useRouter()
  const toast = useToast()
  const [displayName, setDisplayName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  // Send the invite right away by default — a coach who bothered typing an
  // email almost always wants it sent now; unchecking lets them create the
  // profile first and send later from the client list instead.
  const [sendInviteNow, setSendInviteNow] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function createClient() {
    setSaving(true)
    setError('')
    const response = await fetch('/api/gym/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, inviteEmail }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      setSaving(false)
      return setError(body.error ?? `Не удалось создать ${wardNoun(displayName, 'accusative')}`)
    }

    if (sendInviteNow && inviteEmail.trim()) {
      const inviteRes = await fetch(`/api/gym/clients/${body.id}/invite`, { method: 'POST' })
      if (inviteRes.ok) {
        toast({ title: 'Приглашение отправлено', variant: 'success' })
      } else {
        const inviteBody = await inviteRes.json().catch(() => ({}))
        toast({
          title: `${wardNoun(displayName)} ${guessGender(displayName) === 'female' ? 'создана' : 'создан'}, но приглашение не отправлено`,
          description: inviteBody.error ?? 'Отправьте его позже из списка подопечных.',
          variant: 'error',
        })
      }
    }

    setSaving(false)
    router.replace(`/gym/athletes/${body.id}/plans`)
  }

  return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-lg space-y-5 bg-bg p-6 text-text-primary">
    <Link href="/gym/athletes" className="text-sm text-text-secondary">← Подопечные</Link>
    {/* Gender-guessed from displayName as the coach types it — starts as "Новый
        подопечный" (masculine default) before anything's typed, and flips to
        "Новая подопечная" the moment a female-looking name goes in. */}
    <div><h1 className="font-display text-xl uppercase">{guessGender(displayName) === 'female' ? 'Новая' : 'Новый'} {wardNoun(displayName).toLowerCase()}</h1><p className="text-sm text-text-secondary">Этот профиль относится только к тренажёрному залу.</p></div>
    <Card className="space-y-4">
      <label className="block text-sm"><span className="mb-1.5 block">Имя подопечного</span><Input className="w-full" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} /></label>
      <label className="block text-sm"><span className="mb-1.5 block">Email (необязательно)</span><Input className="w-full" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} maxLength={255} /></label>
      {inviteEmail.trim() && (
        <Checkbox
          checked={sendInviteNow}
          onChange={(event) => setSendInviteNow(event.target.checked)}
          label="Отправить приглашение сразу"
        />
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button disabled={saving || !displayName.trim()} onClick={() => void createClient()}>
        {saving ? 'Создаём…' : sendInviteNow && inviteEmail.trim() ? 'Создать и пригласить' : `Создать ${wardNoun(displayName, 'accusative')}`}
      </Button>
    </Card>
  </main>
}
