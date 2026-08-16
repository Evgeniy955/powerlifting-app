import { InputHTMLAttributes, SelectHTMLAttributes, forwardRef } from 'react'

export type FieldSize = 'sm' | 'md'

// Shared with Select below so both controls read as one family of fields.
const baseFieldClasses =
  'rounded-md border border-border bg-surface-2 text-sm text-text-primary outline-none transition-colors duration-150 placeholder:text-text-secondary focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50'

const sizeClasses: Record<FieldSize, string> = {
  sm: 'px-2 py-1',
  md: 'px-3 py-2',
}

export function fieldClasses(size: FieldSize = 'md') {
  return `${baseFieldClasses} ${sizeClasses[size]}`
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { fieldSize?: FieldSize }

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ fieldSize = 'md', className = '', ...props }, ref) => (
    <input ref={ref} className={`${fieldClasses(fieldSize)} ${className}`.trim()} {...props} />
  )
)
Input.displayName = 'Input'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { fieldSize?: FieldSize }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ fieldSize = 'md', className = '', ...props }, ref) => (
    <select ref={ref} className={`${fieldClasses(fieldSize)} ${className}`.trim()} {...props} />
  )
)
Select.displayName = 'Select'
