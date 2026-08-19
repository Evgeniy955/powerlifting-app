'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { WeeklyLoadPoint } from '@/lib/analytics'

type Props = {
  data: WeeklyLoadPoint[]
}

// Bar chart of tonnage + KPSH per week across all cycles — the "распределение
// нагрузки по неделям" histogram from the design spec.
export function LoadDistributionChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary shadow-card">
        Пока нет тренировок для анализа нагрузки по неделям.
      </div>
    )
  }

  const chartData = data.map((p) => ({
    label: `${p.cycleName} · МЦ${p.weekNumber}`,
    tonnage: p.tonnage,
    kpsh: p.kpsh,
  }))

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <p className="mb-2 font-display text-sm uppercase tracking-wide text-text-secondary">
        Тоннаж и КПШ по неделям
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--color-text-secondary)" />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="var(--color-text-secondary)" />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11 }}
            stroke="var(--color-text-secondary)"
          />
          <Tooltip
            contentStyle={{ background: 'var(--color-surface-2)', border: 'none', fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="tonnage" name="Тоннаж (кг)" fill="var(--color-accent)" />
          <Bar yAxisId="right" dataKey="kpsh" name="КПШ" fill="var(--color-accent-2)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
