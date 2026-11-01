import { useEffect, useState } from 'react'
import { DownloadIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ObjectSidecar } from '@/types'
import { formatBytes, formatCountdown, grantRemainingSeconds, retentionWords, scanWords } from '@/lib/format'
import { WATCHLIST_STORAGE_KEY, isDigest, parseWatchlist, refFromSidecar, removeRef, serializeWatchlist, upsertRef } from '@/lib/watchlist'
import { toneClassesFor } from '@/lib/tone'
import { deleteSidecar, describeFailure, readSidecar, requestGrant, runGarbageCollection, type GcOutcome, type Principal } from '@/lib/session'

interface Grant { url: string; expires_at: string }

export function ObjectsView({ principal }: { principal: Principal }) {
  const [digest, setDigest] = useState('')
  const [sidecar, setSidecar] = useState<ObjectSidecar | null>(null)
  const [grant, setGrant] = useState<Grant | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [gc, setGc] = useState<GcOutcome | null>(null)
  const [watchlist, setWatchlist] = useState(() => parseWatchlist(null))

  useEffect(() => {
    setWatchlist(parseWatchlist(globalThis.localStorage?.getItem(WATCHLIST_STORAGE_KEY) ?? null))
  }, [])

  const persist = (refs: typeof watchlist) => {
    setWatchlist(refs)
    globalThis.localStorage?.setItem(WATCHLIST_STORAGE_KEY, serializeWatchlist(refs))
  }

  const lookUp = () => {
    setBusy(true)
    setFailure(null)
    setGrant(null)
    readSidecar(digest.trim()).then(
      (found) => {
        setSidecar(found)
        setBusy(false)
      },
      (error: unknown) => {
        setSidecar(null)
        setFailure(describeFailure(error))
        setBusy(false)
      },
    )
  }

  const askGrant = () => {
    if (!sidecar) return
    requestGrant(sidecar.digest).then(
      setGrant,
      (error: unknown) => setFailure(describeFailure(error)),
    )
  }

  const sweep = () => {
    runGarbageCollection().then(
      setGc,
      (error: unknown) => setFailure(describeFailure(error)),
    )
  }

  const isAdmin = principal.role === 'admin'

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Track an object</CardTitle>
          <CardDescription>
            Paste a SHA-256 digest. The service answers with its sidecar, or refuses: a
            private-witness digest is readable by administrators only, and a hidden object
            looks identical to one that never existed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-72 flex-1 flex-col gap-2">
              <Label htmlFor="digest">Digest</Label>
              <Input
                id="digest"
                value={digest}
                spellCheck={false}
                placeholder="64 hexadecimal characters"
                onChange={(event) => setDigest(event.target.value)}
              />
            </div>
            <Button onClick={lookUp} disabled={!isDigest(digest) || busy}>{busy ? 'Asking…' : 'Look up'}</Button>
          </div>

          {failure ? (
            <Alert variant="destructive">
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}

          {sidecar ? <SidecarPanel sidecar={sidecar} grant={grant} onGrant={askGrant} /> : null}

          {sidecar ? (
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => persist(upsertRef(watchlist, refFromSidecar(sidecar)))}>
                <PlusIcon aria-hidden /> Add to watchlist
              </Button>
              {isAdmin ? (
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                    <TrashIcon aria-hidden /> Delete
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Ask the service to delete this object</AlertDialogTitle>
                      <AlertDialogDescription>
                        The request is final only if nothing holds it. A legal hold or an
                        unelapsed retention answers 409 and the bytes stay exactly where they
                        are — this console never overrides that, and never retries the refusal.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          deleteSidecar(sidecar.digest).then(
                            () => {
                              setSidecar(null)
                              setGrant(null)
                              persist(removeRef(watchlist, sidecar.object_key))
                            },
                            (error: unknown) => setFailure(describeFailure(error)),
                          )
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Watchlist</CardTitle>
          <CardDescription>
            Stored in this browser as pure references — key, digest, size and content type
            only. Names, uploaders and tokens are projected away before anything is written.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {watchlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing tracked yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Object key</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead aria-label="actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {watchlist.map((ref) => (
                  <TableRow key={ref.object_key}>
                    <TableCell><code>{ref.object_key}</code></TableCell>
                    <TableCell>{ref.content_type}</TableCell>
                    <TableCell className="text-right">{formatBytes(ref.size)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => persist(removeRef(watchlist, ref.object_key))}>
                        Forget
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Garbage collection</CardTitle>
            <CardDescription>
              Removes only objects whose retention elapsed and that nothing holds. Everything
              it refuses to touch is reported, never silently kept.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Button variant="outline" onClick={sweep}>Run sweep</Button>
            </div>
            {gc ? (
              <>
                <div className="flex gap-3">
                  <Badge variant="outline">{gc.deleted.length} deleted</Badge>
                  <Badge variant="outline">{formatBytes(gc.bytes_freed)} freed</Badge>
                  <Badge variant="outline" className={toneClassesFor('hot')}>{gc.held.length} held</Badge>
                </div>
                {gc.held.length > 0 ? (
                  <>
                    <Separator />
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Held object</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gc.held.map((entry) => (
                          <TableRow key={entry.object_key}>
                            <TableCell><code>{entry.object_key}</code></TableCell>
                            <TableCell>{entry.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function SidecarPanel({ sidecar, grant, onGrant }: { sidecar: ObjectSidecar; grant: Grant | null; onGrant: () => void }) {
  const now = Date.now()
  const scan = scanWords(sidecar.scan)
  const retention = retentionWords(sidecar, now)

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={toneClassesFor(scan.tone)}>{scan.label}</Badge>
        <Badge variant="outline" className={toneClassesFor(retention.tone)}>{retention.label}</Badge>
      </div>
      <Table>
        <TableBody>
          <TableRow><TableCell className="text-muted-foreground">Filename</TableCell><TableCell>{sidecar.filename}</TableCell></TableRow>
          <TableRow><TableCell className="text-muted-foreground">Content type</TableCell><TableCell>{sidecar.content_type}</TableCell></TableRow>
          <TableRow><TableCell className="text-muted-foreground">Size</TableCell><TableCell>{formatBytes(sidecar.size)}</TableCell></TableRow>
          <TableRow><TableCell className="text-muted-foreground">Uploader</TableCell><TableCell>{sidecar.uploader}</TableCell></TableRow>
          <TableRow><TableCell className="text-muted-foreground">Created</TableCell><TableCell>{sidecar.created_at}</TableCell></TableRow>
          <TableRow><TableCell className="text-muted-foreground">Digest</TableCell><TableCell><code>{sidecar.digest}</code></TableCell></TableRow>
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onGrant}>Request download grant</Button>
        {grant ? (
          <>
            <Badge variant="outline" className={toneClassesFor('cyan')}>
              expires in {formatCountdown(grantRemainingSeconds(grant.expires_at, now))}
            </Badge>
            <Button size="sm" render={<a href={grant.url} rel="noreferrer" download />}>
              <DownloadIcon aria-hidden /> Download now
            </Button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Grants live at most five minutes and are never stored.</span>
        )}
      </div>
    </div>
  )
}
