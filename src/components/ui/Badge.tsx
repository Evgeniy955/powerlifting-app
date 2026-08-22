import { HTMLAttributes } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'low' | 'moderate' | 'high' | 'max' | 'danger'

// neutral/accent/danger: bg-surface-2 stays constant, only the text color
// communicates meaning — those three text colors (text-text-secondary,
// text-accent, text-danger) are theme-tuned CSS custom properties, each
// already chosen to read clearly against bg-surface-2 in all 3 themes.
//
// low/moderate/high/max ("zone" tones — intensity-zone colors reused as
// status colors, e.g. "Приглашение отправлено") are different: they're
// fixed literal hex values, identical in every theme (not CSS custom
// properties), picked to read well on the *dark* theme's near-black
// surfaces. text-zone-moderate (#FBBF24, amber) on bg-surface-2 is fine in
// Dark/Cyberpunk but nearly illegible on Light Clean's cream surface-2
// (#f3ece3) — light-on-light. Solid pill + dark text sidesteps that
// entirely: all four zone hues are light/mid-brightness, so a dark text
// reads clearly on every one of them regardless of which theme surrounds
// the badge (same reasoning as Button's on-accent/on-danger pairs, just
// hardcoded here since these colors don't vary by theme to begin with).
const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-text-secondary',
  accent: 'bg-surface-2 text-accent',
  low: 'bg-zone-low text-zone-ink',
  moderate: 'bg-zone-moderate text-zone-ink',
  high: 'bg-zone-high text-zone-ink',
  max: 'bg-zone-max text-zone-ink',
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
