import * as React from "react"
import { cn } from './lib/utils.js'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "default" | "sm"
  asChild?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, size = "default", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="card"
      data-size={size}
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-card py-4 text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  )
})

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} data-slot="card-header" className={cn("flex flex-col gap-1.5 px-4", className)} {...props} />
  },
)

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement> & { asChild?: boolean }>(
  function CardTitle({ className, ...props }, ref) {
    return <h3 ref={ref} data-slot="card-title" className={cn("text-base font-semibold leading-none tracking-tight", className)} {...props} />
  },
)

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement> & { asChild?: boolean }>(
  function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  },
)

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} data-slot="card-content" className={cn("px-4", className)} {...props} />
  },
)

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }>(
  function CardFooter({ className, ...props }, ref) {
    return <div ref={ref} data-slot="card-footer" className={cn("flex items-center px-4", className)} {...props} />
  },
)

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
