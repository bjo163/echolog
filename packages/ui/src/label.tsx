import * as React from "react"
import { cn } from './lib/utils.js'

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      data-slot="label"
      className={cn("text-sm font-medium leading-none select-none", className)}
      {...props}
    />
  )
})

export { Label }
