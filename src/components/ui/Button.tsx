import { ButtonHTMLAttributes, forwardRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'icon'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent shadow-card hover:brightness-110',
  secondary: 'bg-accent-2 text-on-accent-2 shadow-card hover:brightness-110',
  outline: 'border border-border bg-transparent text-text-primary hover:bg-surface-2',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-2 hover:text-text-primary',
  danger: 'bg-danger text-on-danger shadow-card hover:brightness-110',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  icon: 'h-8 w-8 p-0 text-sm',
}

const baseClasses =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-display font-medium tracking-wide transition duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'

// Shared className builder so non-<button> elements (e.g. next/link CTAs) can
// look identical to real buttons without duplicating the variant/size tables.
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  className = '',
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', ...props }, ref) => (
    <button ref={ref} className={buttonVariants({ variant, size, className })} {...props} />
  )
)
Button.displayName = 'Button'
