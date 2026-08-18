'use client'

type Props = {
  tonnage: number
  avgWeight: number
  relativeIntensity: number
  kpsh: number
  loadCoefficient: number
  fatigueIndex: number | null
  sessionType?: 'heavy' | 'light' | null
}

// Zone coloring by %1RM, matching the design-system intensity bands.
function zoneClass(relativeIntensity: number): string {
  if (relativeIntensity >= 0.95) return 'text-zone-max'
  if (relativeIntensity >= 0.85) return 'text-zone-high'
  if (relativeIntensity >= 0.7) return 'text-zone-moderate'
  return 'text-zone-low'
}

export function MetricsBadge({
  tonnage,
  avgWeight,
  relativeIntensity,
  kpsh,
  loadCoefficient,
  fatigueIndex,
  sessionType,
}: Props) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-text-secondary">Тоннаж</span>
        <span className="font-display tracking-wide">{tonnage} кг</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-text-secondary">КПШ</span>
        <span className="font-display tracking-wide">{kpsh}</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-text-secondary">Сред.вес</span>
        <span className="font-display tracking-wide">{avgWeight} кг</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-text-secondary">Интенсивность</span>
        <span className={`font-display tracking-wide ${zoneClass(relativeIntensity)}`}>
          {Math.round(relativeIntensity * 100)}%
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-text-secondary">КО</span>
        <span className="font-display tracking-wide">{loadCoefficient}</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-text-secondary">Индекс усталости</span>
        <span className="font-display tracking-wide">
          {fatigueIndex ?? '—'}
          {sessionType && (
            <span className="ml-1 text-xs text-text-secondary">
              ({sessionType === 'heavy' ? 'тяжёлая' : 'лёгкая'})
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
