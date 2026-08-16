import { HTMLAttributes } from 'react'

export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-skeleton-pulse rounded-md bg-surface-2 ${className}`.trim()}
      {...props}
    />
  )
}
