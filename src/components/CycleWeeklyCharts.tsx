'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { CycleWeeklyPoint } from '@/lib/analytics'

type Props = {
  weeks: CycleWeeklyPoint[]
}

type MiniChartConfig = {
  key: 'relativeIntensity' | 'kpsh' | 'tonnage' | 'avgWeight'
  title: string
  color: string
  format?: (v: number) => string
}

const charts: MiniChartConfig[] = [
  {
    key: 'relativeIntensity',
    title: 'Интенсивность нед. отн',
    color: '#22d3ee',
    format: (v) => `${Math.round(v * 100)}%`,
  },
  { key: 'kpsh', title: 'КПШ недельный', color: 'var(--color-accent)' },
  { key: 'tonnage', title: 'Тоннаж недельный', color: 'var(--color-danger)' },
  { key: 'avgWeight', title: 'Средний вес недельный', color: '#a78bfa' },
]

// Four small-multiple line charts mirroring the source Excel summary sheet
// ("Интенсивность нед. отн" / "КПШ недельный" / "Тоннаж недельный" /
// "Средний вес недельный"), one point per week across the mesocycle.
export function CycleWeeklyCharts({ weeks }: Props) {
  if (weeks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary shadow-card">
        Нет данных для построения графиков за выбранный диапазон недель.
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {charts.map((chart) => (
        <div key={chart.key} className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="mb-2 font-display text-sm uppercase tracking-wide text-text-secondary">
            {chart.title}
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weeks}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
              <XAxis
                dataKey="weekNumber"
                tick={{ fontSize: 11 }}
                stroke="var(--color-text-secondary)"
                tickFormatter={(v) => String(v)}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--color-text-secondary)"
                domain={chart.key === 'relativeIntensity' ? [0, 1] : ['auto', 'auto']}
                tickFormatter={chart.key === 'relativeIntensity' ? (v) => `${Math.round(v * 100)}%` : undefined}
              />
              <Tooltip
                labelFormatter={(v) => `Неделя ${v}`}
                formatter={(value: number) => [chart.format ? chart.format(value) : value, chart.title]}
                contentStyle={{
                  background: 'var(--color-surface-2)',
                  border: 'none',
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey={chart.key}
                stroke={chart.color}
                strokeWidth={2}
                dot={{ r: 3, fill: chart.color }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  )
}
