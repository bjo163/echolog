import * as React from "react"
import { cn } from './lib/utils.js'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode
  onCheckedChange?: ((checked: boolean) => void) | undefined
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, onCheckedChange, onChange, ...props },
  ref,
) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        ref={ref}
        type="checkbox"
        data-slot="checkbox"
        className={cn(
          "size-4 shrink-0 cursor-pointer rounded border border-input accent-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        onChange={(event) => {
          onChange?.(event)
          onCheckedChange?.(event.target.checked)
        }}
        {...props}
      />
      {label ? <span>{label}</span> : null}
    </label>
  )
})

export { Checkbox }
