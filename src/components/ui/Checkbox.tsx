import { InputHTMLAttributes, ReactNode, forwardRef } from 'react'
import { Check } from 'lucide-react'

type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }

// Styled replacement for a raw <input type="checkbox"> — sized to a real
// touch target (44px row height) since this is also used on the Excel
// import screen, where Gym Mode's scoped `.theme-cyberpunk input` override
// still applies transparently (the native input is kept, just visually hidden).
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', ...props }, ref) => (
    <label className="inline-flex min-h-[44px] cursor-pointer select-none items-center gap-2">
      <span className="relative inline-flex h-5 w-5 shrink-0">
        <input
          ref={ref}
          type="checkbox"
          className={`peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 ${className}`.trim()}
          {...props}
        />
        <span className="pointer-events-none flex h-5 w-5 items-center justify-center rounded border border-border bg-surface-2 transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
          <Check className="h-3.5 w-3.5 text-on-accent opacity-0 transition-opacity" />
        </span>
      </span>
      {label && <span className="text-sm text-text-primary">{label}</span>}
    </label>
  )
)
Checkbox.displayName = 'Checkbox'
