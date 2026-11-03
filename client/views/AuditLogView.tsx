import { useEffect, useState } from 'react'
import { FileTextIcon, RefreshCwIcon, ShieldAlertIcon, ShieldCheckIcon, UserIcon, KeyIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { describeFailure, getAuditLogs } from '@/lib/session'
import type { AuditLogRecord } from '@/types'

function actionBadge(action: string) {
  switch (action) {
    case 'api_key_issued':
      return <Badge variant="outline" className="border-status-ok/30 bg-status-ok/15 text-status-ok gap-1 text-[11px]"><KeyIcon className="size-3" /> Key Issued</Badge>
    case 'api_key_revoked':
      return <Badge variant="destructive" className="gap-1 text-[11px]"><KeyIcon className="size-3" /> Key Revoked</Badge>
    case 'account_disabled':
      return <Badge variant="destructive" className="gap-1 text-[11px]"><UserIcon className="size-3" /> Account Locked</Badge>
    case 'account_enabled':
      return <Badge variant="outline" className="border-status-ok/30 bg-status-ok/15 text-status-ok gap-1 text-[11px]"><UserIcon className="size-3" /> Account Active</Badge>
    case 'private_witness_marked':
      return <Badge variant="outline" className="border-status-night/30 bg-status-night/15 text-status-night gap-1 text-[11px]"><ShieldCheckIcon className="size-3" /> Witness Marker</Badge>
    case 'gc_executed':
      return <Badge variant="outline" className="border-status-cyan/30 bg-status-cyan/15 text-status-cyan gap-1 text-[11px]">GC Sweep</Badge>
    case 'object_deleted':
      return <Badge variant="destructive" className="gap-1 text-[11px]">Object Deleted</Badge>
    default:
      return <Badge variant="secondary" className="text-[11px]">{action}</Badge>
  }
}

export function AuditLogView() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const load = () => {
    setBusy(true)
    setFailure(null)
    getAuditLogs(100).then(
      (items) => {
        setLogs(items)
        setBusy(false)
      },
      (error: unknown) => {
        setFailure(describeFailure(error))
        setBusy(false)
      }
    )
  }

  useEffect(load, [])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Security & Operational Audit Log</CardTitle>
              <CardDescription>
                Persistent SQLite audit trail recording security actions: key issuance, credential revocation,
                account state changes, irreversible witness marks, and GC execution.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={busy}>
              <RefreshCwIcon aria-hidden className={busy ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {failure ? (
            <Alert variant="destructive">
              <ShieldAlertIcon aria-hidden />
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {log.timestamp}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <UserIcon className="size-3 text-muted-foreground" aria-hidden />
                      {log.actor}
                    </span>
                  </TableCell>
                  <TableCell>
                    {actionBadge(log.action)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <code>{log.target}</code>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {log.details ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && !busy ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                    No security audit logs recorded yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

