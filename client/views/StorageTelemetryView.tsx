import { useEffect, useState, type ReactNode } from 'react'
import { HardDriveIcon, RefreshCwIcon, ShieldAlertIcon, ShieldCheckIcon, LayersIcon, Trash2Icon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBytes } from '@/lib/format'
import { describeFailure, getStorageStats } from '@/lib/session'
import type { StorageStats } from '@/types'

interface Metric {
  id: string
  label: string
  value: string
  detail: string
  tone?: 'ok' | 'hot' | 'secondary' | undefined
  icon: ReactNode
}

export function StorageTelemetryView({ onTriggerGc }: { onTriggerGc?: () => void }) {
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const load = () => {
    setBusy(true)
    setFailure(null)
    getStorageStats().then(
      (data) => {
        setStats(data)
        setBusy(false)
      },
      (error: unknown) => {
        setFailure(describeFailure(error))
        setBusy(false)
      },
    )
  }

  useEffect(load, [])

  const percentUsed = stats && stats.quota_bytes > 0
    ? Math.min(100, Math.round((stats.committed_bytes / stats.quota_bytes) * 100))
    : 0

  const metrics: Metric[] = stats ? [
    {
      id: 'used',
      label: 'Volume Quota Used',
      value: `${formatBytes(stats.committed_bytes)} / ${formatBytes(stats.quota_bytes)}`,
      detail: `${percentUsed}% committed to disk`,
      tone: percentUsed > 85 ? 'hot' : undefined,
      icon: <HardDriveIcon className="size-4" />,
    },
    {
      id: 'objects',
      label: 'Unique Content Objects',
      value: stats.objects_count.toLocaleString(),
      detail: `${stats.s3_aliases_count} S3 aliases pointing here`,
      icon: <LayersIcon className="size-4" />,
    },
    {
      id: 'held',
      label: 'Protected (Hold & Retention)',
      value: formatBytes(stats.held_bytes + stats.active_retention_bytes),
      detail: `${stats.held_count} hold · ${stats.active_retention_count} active retention`,
      tone: 'ok',
      icon: <ShieldCheckIcon className="size-4" />,
    },
    {
      id: 'gc',
      label: 'Eligible for GC Purge',
      value: formatBytes(stats.eligible_gc_bytes),
      detail: `${stats.eligible_gc_count} unheld expired objects`,
      tone: 'secondary',
      icon: <Trash2Icon className="size-4" />,
    },
  ] : []

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Storage & Volume Telemetry</CardTitle>
              <CardDescription>
                Live quota accounting, content deduplication state, and fail-closed retention boundaries.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {onTriggerGc ? (
                <Button variant="outline" size="sm" onClick={onTriggerGc}>
                  Run GC Sweep
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={load} disabled={busy}>
                <RefreshCwIcon aria-hidden className={busy ? 'animate-spin' : ''} /> Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {failure ? (
            <Alert variant="destructive">
              <ShieldAlertIcon aria-hidden />
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}

          {stats ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {metrics.map((metric) => (
                  <div key={metric.id} className="flex flex-col gap-1 rounded-lg border border-border p-4">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      {metric.icon}
                      {metric.label}
                    </span>
                    <span
                      className={
                        metric.tone === 'hot'
                          ? 'text-lg font-semibold text-status-hot'
                          : metric.tone === 'ok'
                            ? 'text-lg font-semibold text-status-ok'
                            : 'text-lg font-semibold'
                      }
                    >
                      {metric.value}
                    </span>
                    <span className="text-xs text-muted-foreground">{metric.detail}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-muted/20">
                <div className="flex justify-between text-xs font-medium">
                  <span>Quota utilization</span>
                  <span>{percentUsed}% ({formatBytes(stats.committed_bytes)} of {formatBytes(stats.quota_bytes)})</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${
                      percentUsed > 90 ? 'bg-status-hot' : percentUsed > 75 ? 'bg-status-accent' : 'bg-status-ok'
                    }`}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading storage metrics…</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
