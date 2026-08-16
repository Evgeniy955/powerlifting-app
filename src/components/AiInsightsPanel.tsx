'use client'

import { useState } from 'react'
import { Button, Card } from '@/components/ui'

type Props = {
  athleteId: string
}

// Coach-only "AI-рекомендации" panel: opt-in (button, not auto-fetch on page
// load) since each click is a real paid Claude API call server-side. Renders
// a clear setup message rather than a generic error if ANTHROPIC_API_KEY
// isn't configured yet.
export function AiInsightsPanel({ athleteId }: Props) {
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)

  async function handleClick() {
    setLoading(true)
    setError(null)
    setNotConfigured(false)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/ai-insights`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 501) {
          setNotConfigured(true)
          setError(body.error ?? 'AI не настроен')
        } else {
          setError(body.error ?? 'Не удалось получить рекомендации')
        }
        return
      }
      setText(body.text ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm uppercase tracking-wide">AI-рекомендации</p>
        <Button onClick={handleClick} disabled={loading} variant="secondary" size="sm">
          {loading ? 'Анализирую...' : text ? 'Обновить' : 'Получить рекомендации'}
        </Button>
      </div>

      {notConfigured && (
        <p className="text-xs text-zone-moderate">
          {error} Добавь <code>ANTHROPIC_API_KEY</code> в <code>.env</code> (ключ на{' '}
          console.anthropic.com) и перезапусти сервер.
        </p>
      )}
      {error && !notConfigured && <p className="text-xs text-danger">{error}</p>}

      {text && (
        <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{text}</p>
      )}

      {!text && !error && !loading && (
        <p className="text-xs text-text-secondary">
          Анализ тоннажа/КПШ/индекса усталости по неделям и прогресса 1ПМ — с предложениями по
          следующему микроциклу.
        </p>
      )}
    </Card>
  )
}
