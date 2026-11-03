import { useEffect, useState } from 'react'
import { FolderIcon, KeyRoundIcon, LockIcon, RefreshCwIcon, ShieldAlertIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatBytes } from '@/lib/format'
import { describeFailure, getS3Keys } from '@/lib/session'
import type { S3KeyRecord } from '@/types'

export function S3ExplorerView({ onSelectDigest }: { onSelectDigest?: (digest: string) => void }) {
  const [keys, setKeys] = useState<S3KeyRecord[]>([])
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const load = () => {
    setBusy(true)
    setFailure(null)
    getS3Keys().then(
      (found) => {
        setKeys(found)
        setBusy(false)
      },
      (error: unknown) => {
        setFailure(describeFailure(error))
        setBusy(false)
      },
    )
  }

  useEffect(load, [])

  const filtered = keys.filter((k) =>
    k.key.toLowerCase().includes(filter.toLowerCase()) ||
    k.digest.toLowerCase().includes(filter.toLowerCase()) ||
    k.content_type.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>S3 Namespace Explorer</CardTitle>
          <CardDescription>
            Lists path-style S3 aliases mapped to underlying content-addressed SHA-256 objects.
            SigV4 daemons upload via S3 PutObject; ECHOLOG persists them into its filesystem key index.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-72 flex-1">
              <Input
                placeholder="Filter by S3 key, digest, or MIME type…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={busy}>
              <RefreshCwIcon aria-hidden className={busy ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>

          {failure ? (
            <Alert variant="destructive">
              <ShieldAlertIcon aria-hidden />
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>S3 Key (Path)</TableHead>
                <TableHead>Underlying Digest (CAS)</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>ETag (MD5)</TableHead>
                <TableHead>Policy</TableHead>
                {onSelectDigest ? <TableHead aria-label="actions" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-mono text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      <FolderIcon className="size-3.5 text-muted-foreground" aria-hidden />
                      {row.key}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <code>{row.digest.slice(0, 16)}…{row.digest.slice(-8)}</code>
                  </TableCell>
                  <TableCell className="text-xs">{row.content_type}</TableCell>
                  <TableCell className="text-right text-xs">{formatBytes(row.size)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <code>{row.etag.slice(0, 10)}…</code>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.legal_hold ? (
                        <Badge variant="destructive" className="gap-0.5 text-[10px]">
                          <LockIcon className="size-2.5" /> hold
                        </Badge>
                      ) : null}
                      {row.retention_until ? (
                        <Badge variant="outline" className="text-[10px]">
                          retention: {row.retention_until.slice(0, 10)}
                        </Badge>
                      ) : null}
                      {!row.legal_hold && !row.retention_until ? (
                        <span className="text-xs text-muted-foreground">standard</span>
                      ) : null}
                    </div>
                  </TableCell>
                  {onSelectDigest ? (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelectDigest(row.digest)}
                      >
                        Inspect CAS
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {filtered.length === 0 && !busy ? (
                <TableRow>
                  <TableCell colSpan={onSelectDigest ? 7 : 6} className="text-center text-sm text-muted-foreground py-6">
                    {keys.length === 0 ? 'No S3 keys recorded in this bucket yet.' : 'No S3 keys match your search.'}
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

