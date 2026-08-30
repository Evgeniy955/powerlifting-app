'use client'

import { useState } from 'react'
import { Maximize2, Minimize2, Sparkles } from 'lucide-react'
import { Button, Dialog } from '@/components/ui'

type Props = {
  scope: 'athlete' | 'mesocycle'
  athleteId: string
  cycleId?: string
  contextName?: string
}

type Message = {
  role: 'user' | 'assistant'
  content: string
}

// Coach-only Claude chat. Its server route checks that the current coach owns
// the athlete/cycle before it includes any training data or calls Anthropic.
export function AiCoachButton({ scope, athleteId, cycleId, contextName }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const target = scope === 'athlete' ? 'спортсмена' : 'мезоцикла'
  const title = scope === 'athlete' ? 'AI для спортсмена' : 'AI для мезоцикла'

  async function send() {
    const content = draft.trim()
    if (!content || loading) return

    const nextMessages = [...messages, { role: 'user' as const, content }]
    setMessages(nextMessages)
    setDraft('')
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, cycleId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось получить ответ AI')
      setMessages((previous) => [...previous, { role: 'assistant', content: body.text ?? '' }])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Ошибка AI-чата')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} variant="secondary" size="sm">
        <Sparkles className="h-4 w-4" /> AI
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={`Claude анализирует тренировки ${target} и составляет план по вашей методологии.`}
        contentClassName={
          expanded
            ? '!max-w-none h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)]'
            : 'max-w-2xl'
        }
        titleAction={
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            aria-label={expanded ? 'Свернуть окно AI' : 'Развернуть окно AI'}
            title={expanded ? 'Свернуть' : 'Развернуть'}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        }
      >
        {contextName && (
          <p className="mb-3 text-sm text-text-primary">
            Контекст: <span className="font-medium">{contextName}</span>
          </p>
        )}
        <div
          className={`${expanded ? 'max-h-[calc(100dvh-17rem)]' : 'max-h-80'} space-y-3 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3`}
        >
          {messages.length === 0 && (
            <p className="text-sm text-text-secondary">
              Опишите задачу: проанализировать текущую нагрузку, составить следующий блок или
              скорректировать конкретный микроцикл. Перед сохранением план будет показан вам в
              чате для подтверждения.
            </p>
          )}
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                message.role === 'user'
                  ? 'ml-8 bg-accent text-on-accent'
                  : 'mr-8 bg-surface text-text-secondary'
              }`}
            >
              {message.content}
            </div>
          ))}
          {loading && <p className="text-sm text-text-secondary">Claude анализирует данные…</p>}
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-3 flex gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder="Напишите задачу для AI…"
            rows={3}
            className="min-w-0 flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-text-secondary focus:border-accent"
          />
          <Button type="button" onClick={() => void send()} disabled={loading || !draft.trim()}>
            Отправить
          </Button>
        </div>
      </Dialog>
    </>
  )
}
