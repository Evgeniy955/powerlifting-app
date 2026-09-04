'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { Card, Input, buttonVariants } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

export default function GymImportPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId: clientId } = use(params)
  const [status, setStatus] = useState('')
  const [planId, setPlanId] = useState<string | null>(null)

  async function upload(file: File) {
    setPlanId(null)

    if (file.size > 10 * 1024 * 1024) {
      setStatus('Файл больше 10 МБ')
      return
    }

    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (!allowed.includes(file.type)) {
      setStatus('Поддерживаются только PDF и DOCX')
      return
    }

    setStatus('Загружаю и распознаю план…')
    const signed = await fetch(`/api/gym/athletes/${clientId}/assessments/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, import: true }),
    })
    const signedBody = await signed.json().catch(() => ({}))
    if (!signed.ok) {
      setStatus(signedBody.error ?? 'Не удалось подготовить загрузку')
      return
    }

    const { error } = await createClient()
      .storage
      .from('assessments')
      .uploadToSignedUrl(signedBody.path, signedBody.token, file, { contentType: file.type })
    if (error) {
      setStatus('Не удалось загрузить файл')
      return
    }

    const response = await fetch(`/api/gym/athletes/${clientId}/assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        storagePath: signedBody.path,
      }),
    })

    const assessment = await response.json().catch(() => ({}))
    if (!response.ok || typeof assessment.id !== 'string') {
      setStatus('Не удалось сохранить импорт')
      return
    }

    setStatus('Распознаю тренировки…')
    const imported = await fetch(`/api/gym/athletes/${clientId}/imports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessmentId: assessment.id }),
    })
    const importedBody = await imported.json().catch(() => ({}))
    if (!imported.ok || typeof importedBody.planId !== 'string') {
      setStatus(importedBody.error ?? 'Документ сохранён, но план не удалось создать')
      return
    }

    const skipped = Array.isArray(importedBody.unmatchedLines) ? importedBody.unmatchedLines.length : 0
    setStatus(
      `План импортирован: тренировок ${importedBody.workouts ?? 0}` +
        (skipped ? `. Не распознано строк: ${skipped} — добавьте их вручную.` : ''),
    )
    setPlanId(importedBody.planId)
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-2xl space-y-5 bg-bg p-6 text-text-primary">
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
          Поддерживаемая запись подхода: «Упражнение 120 4х6» или «Упражнение 120 4/6»
          (вес, количество подходов, количество повторов). Строки, которые не удалось
          разобрать, останутся без изменений — добавьте их вручную после импорта.
        </p>
        <Input
          type="file"
          accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
        {status && <p className="text-sm text-text-secondary">{status}</p>}
        {planId && (
          <Link href={`/gym/plans/${planId}`} className={buttonVariants({ variant: 'secondary' })}>
            Открыть импортированный план
          </Link>
        )}
      </Card>
    </main>
  )
}
