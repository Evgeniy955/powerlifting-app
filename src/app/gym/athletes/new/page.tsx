'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Card, Input } from '@/components/ui'

export default function NewGymClientPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
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
    setSaving(false)
    if (!response.ok) return setError(body.error ?? 'Не удалось создать клиента')
    router.replace(`/gym/athletes/${body.id}/plans`)
  }

  return <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-lg space-y-5 bg-bg p-6 text-text-primary">
    <Link href="/gym/athletes" className="text-sm text-text-secondary">← Клиенты</Link>
    <div><h1 className="font-display text-xl uppercase">Новый клиент</h1><p className="text-sm text-text-secondary">Этот профиль относится только к тренажёрному залу.</p></div>
    <Card className="space-y-4">
      <label className="block text-sm"><span className="mb-1.5 block">Имя клиента</span><Input className="w-full" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} /></label>
      <label className="block text-sm"><span className="mb-1.5 block">Email (необязательно)</span><Input className="w-full" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} maxLength={255} /></label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button disabled={saving || !displayName.trim()} onClick={() => void createClient()}>{saving ? 'Создаём…' : 'Создать клиента'}</Button>
    </Card>
  </main>
}
