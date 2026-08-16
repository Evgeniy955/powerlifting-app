import { HTMLAttributes } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'low' | 'moderate' | 'high' | 'max' | 'danger'

// bg-surface-2 stays constant; only the text color communicates meaning. Avoids
// Tailwind's color-mix opacity modifiers (bg-accent/15 etc.), which don't
// resolve correctly against hex-valued CSS custom properties in this config.
const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-text-secondary',
  accent: 'bg-surface-2 text-accent',
  low: 'bg-surface-2 text-zone-low',
  moderate: 'bg-surface-2 text-zone-moderate',
  high: 'bg-surface-2 text-zone-high',
  max: 'bg-surface-2 text-zone-max',
  danger: 'bg-surface-2 text-danger',
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }

export function Badge({ tone = 'neutral', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${toneClasses[tone]} ${className}`.trim()}
      {...props}
    />
  )
}
