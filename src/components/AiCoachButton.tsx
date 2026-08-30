'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, Dialog } from '@/components/ui'

type Props = {
  scope: 'athlete' | 'mesocycle'
  contextName?: string
  compact?: boolean
}

// Entry point for the coach's future Claude workflow. It intentionally makes
// no API call yet: the coaching prompt and the rules for writing a new plan
// will be supplied separately, before any paid model request is enabled.
export function AiCoachButton({ scope, contextName, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const target = scope === 'athlete' ? 'спортсмена' : 'мезоцикла'
  const title = scope === 'athlete' ? 'AI для спортсмена' : 'AI для мезоцикла'

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={title}
          aria-label={title}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white shadow-card transition-transform hover:scale-110 hover:brightness-110"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)} variant="secondary" size="sm">
          <Sparkles className="h-4 w-4" /> AI
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={`Claude будет анализировать тренировки ${target} и помогать составлять новые.`}
      >
        {contextName && (
          <p className="mb-3 text-sm text-text-primary">
            Контекст: <span className="font-medium">{contextName}</span>
          </p>
        )}
        <p className="text-sm text-text-secondary">
          Интерфейс подготовлен. Добавьте промпт для анализа и создания тренировок — после этого
          здесь появятся действия AI.
        </p>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={() => setOpen(false)} variant="outline" size="sm">
            Закрыть
          </Button>
        </div>
      </Dialog>
    </>
  )
}
