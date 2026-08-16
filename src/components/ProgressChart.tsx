'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ProgressPoint } from '@/lib/analytics'

type Props = {
  data: ProgressPoint[]
  exerciseName?: string
}

// Line chart of top-set weight and Epley-estimated 1RM over time — the
// "Присед/Жим/Тяга" progress graphs from the design spec, generalized to any exercise.
export function ProgressChart({ data, exerciseName }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary shadow-card">
        Нет данных по {exerciseName ?? 'этому упражнению'} — добавь тренировки с этим упражнением.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <p className="mb-2 font-display text-sm uppercase tracking-wide text-text-secondary">
        Прогресс{exerciseName ? `: ${exerciseName}` : ''}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-text-secondary)" />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-secondary)" />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface-2)',
              border: 'none',
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="weight"
            name="Вес топ-сета"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="estimated1rm"
            name="Расч. 1ПМ"
            stroke="var(--color-accent-2)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
