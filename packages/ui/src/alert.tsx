import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from './lib/utils'

const alertVariants = cva(
  "relative flex w-full items-start gap-3 rounded-lg border p-4 text-sm",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        secondary: "border-border bg-muted/40 text-foreground",
        destructive: "border-destructive/40 bg-destructive/10 text-destructive [&_[data-slot=alert-description]]:text-destructive/90",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

export type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  title?: React.ReactNode
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, variant, title, children, ...props },
  ref,
) {
  return (
    <div ref={ref} role="alert" data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {title ? <div className="font-medium tracking-tight">{title}</div> : null}
      <div className="flex flex-1 flex-col gap-1">{children}</div>
    </div>
  )
})

const AlertTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function AlertTitle(
  { className, ...props },
  ref,
) {
  return <div ref={ref} data-slot="alert-title" className={cn("font-medium leading-none tracking-tight", className)} {...props} />
})

const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function AlertDescription(
  { className, ...props },
  ref,
) {
  return <div ref={ref} data-slot="alert-description" className={cn("text-sm text-muted-foreground [&_p]:leading-relaxed", className)} {...props} />
})

export { Alert, AlertTitle, AlertDescription, alertVariants }
