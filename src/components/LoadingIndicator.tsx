import { Dumbbell } from 'lucide-react'

type Props = {
  label?: string
  className?: string
}

// Single branded loading state — a lifted, glowing dumbbell plus a bouncing
// "..." — used instead of skeleton placeholders wherever a list is fetched
// client-side and we don't want to imply a specific number of items is coming.
export function LoadingIndicator({ label = 'Загрузка', className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-16 ${className}`.trim()}>
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div
          className="absolute inset-0 animate-glow-pulse rounded-full"
          style={{
            background: 'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)',
          }}
        />
        <div className="relative flex h-12 w-12 animate-barbell-lift items-center justify-center rounded-full bg-accent text-on-accent">
          <Dumbbell className="h-6 w-6" />
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-sm text-text-secondary">
        {label}
        <span className="flex items-end gap-0.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-1 w-1 animate-dot-bounce rounded-full bg-accent"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      </p>
    </div>
  )
}
