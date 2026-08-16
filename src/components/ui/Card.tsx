import { HTMLAttributes } from 'react'

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: 'sm' | 'md' | 'none'
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
}

export function Card({ padding = 'md', className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface shadow-card transition-shadow ${paddingClasses[padding]} ${className}`.trim()}
      {...props}
    />
  )
}
