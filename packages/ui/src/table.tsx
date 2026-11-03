import * as React from "react"
import { cn } from './lib/utils.js'

const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...props },
  ref,
) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table ref={ref} data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
})

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(function TableHeader(
  { className, ...props },
  ref,
) {
  return <thead ref={ref} data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />
})

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(function TableBody(
  { className, ...props },
  ref,
) {
  return <tbody ref={ref} data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
})

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(function TableFooter(
  { className, ...props },
  ref,
) {
  return <tfoot ref={ref} data-slot="table-footer" className={cn("border-t bg-muted/50 font-medium", className)} {...props} />
})

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(function TableRow(
  { className, ...props },
  ref,
) {
  return <tr ref={ref} data-slot="table-row" className={cn("border-b border-border transition-colors hover:bg-muted/40", className)} {...props} />
})

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(function TableHead(
  { className, ...props },
  ref,
) {
  return <th ref={ref} data-slot="table-head" className={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground", className)} {...props} />
})

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(function TableCell(
  { className, ...props },
  ref,
) {
  return <td ref={ref} data-slot="table-cell" className={cn("p-2 align-middle", className)} {...props} />
})

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(function TableCaption(
  { className, ...props },
  ref,
) {
  return <caption ref={ref} data-slot="table-caption" className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
})

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
