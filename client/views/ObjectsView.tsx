import { useEffect, useState } from 'react'
import { DownloadIcon, EyeOffIcon, PlusIcon, TrashIcon, CheckCircle2Icon, AlertCircleIcon, FileDownIcon, FileUpIcon, CopyIcon } from 'lucide-react'
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
import { deleteSidecar, describeFailure, markPrivateWitness, readSidecar, requestGrant, runGarbageCollection, type GcOutcome, type Principal } from '@/lib/session'
import { sha256Hex } from '@/lib/api'

interface Grant { url: string; expires_at: string }

export function ObjectsView({ principal, initialDigest }: { principal: Principal; initialDigest?: string | undefined }) {
  const [digest, setDigest] = useState(initialDigest ?? '')
  const [sidecar, setSidecar] = useState<ObjectSidecar | null>(null)
  const [grant, setGrant] = useState<Grant | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [gc, setGc] = useState<GcOutcome | null>(null)
  const [watchlist, setWatchlist] = useState(() => parseWatchlist(null))

  // File integrity verifier state
  const [localFile, setLocalFile] = useState<File | null>(null)
  const [localHash, setLocalHash] = useState<string | null>(null)
  const [verifyingHash, setVerifyingHash] = useState(false)

  useEffect(() => {
    setWatchlist(parseWatchlist(globalThis.localStorage?.getItem(WATCHLIST_STORAGE_KEY) ?? null))
  }, [])

  useEffect(() => {
    if (initialDigest && isDigest(initialDigest)) {
      setDigest(initialDigest)
      lookUpDigest(initialDigest)
    }
  }, [initialDigest])

  const persist = (refs: typeof watchlist) => {
    setWatchlist(refs)
    globalThis.localStorage?.setItem(WATCHLIST_STORAGE_KEY, serializeWatchlist(refs))
  }

  const lookUpDigest = (targetDigest: string) => {
    setBusy(true)
    setFailure(null)
    setGrant(null)
    setLocalFile(null)
    setLocalHash(null)
    readSidecar(targetDigest.trim()).then(
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

  const lookUp = () => lookUpDigest(digest)

  const askGrant = () => {
    if (!sidecar) return
    requestGrant(sidecar.digest).then(
      setGrant,
      (error: unknown) => setFailure(describeFailure(error)),
    )
  }

  const handleVerifyLocalFile = (file: File) => {
    setLocalFile(file)
    setVerifyingHash(true)
    file.arrayBuffer().then(
      (bytes) => sha256Hex(bytes),
      () => {
        setFailure('Failed to read local file for integrity verification.')
        return null
      }
    ).then(
      (hex) => {
        setLocalHash(hex)
        setVerifyingHash(false)
      }
    )
  }

  const confirmPrivateWitness = () => {
    if (!sidecar) return
    setBusy(true)
    markPrivateWitness(sidecar.digest).then(
      () => {
        setBusy(false)
        lookUp()
      },
      (error: unknown) => {
        setFailure(describeFailure(error))
        setBusy(false)
      }
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
          <CardTitle>Track and Inspect an Object</CardTitle>
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

          {sidecar ? (
            <SidecarPanel
              sidecar={sidecar}
              grant={grant}
              onGrant={askGrant}
              onVerifyFile={handleVerifyLocalFile}
              verifyingHash={verifyingHash}
              localHash={localHash}
              localFile={localFile}
            />
          ) : null}

          {sidecar ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => persist(upsertRef(watchlist, refFromSidecar(sidecar)))}>
                <PlusIcon aria-hidden /> Add to watchlist
              </Button>
              {isAdmin ? (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      <EyeOffIcon aria-hidden className="size-3.5" /> Irreversible Private Witness
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Private Witness Marker</AlertDialogTitle>
                        <AlertDialogDescription>
                          This irreversibly marks this digest as a private witness. S3 aliases will be permanently
                          hidden, and only authenticated administrators can access or read download grants.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmPrivateWitness}>
                          Confirm Marker
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

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
                </>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Watchlist</CardTitle>
              <CardDescription>
                Stored in this browser as pure references — key, digest, size and content type
                only. Names, uploaders and tokens are projected away before anything is written.
              </CardDescription>
            </div>
            {watchlist.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob = new Blob([serializeWatchlist(watchlist)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `echolog-watchlist-${new Date().toISOString().slice(0, 10)}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <FileDownIcon className="size-3.5" /> Export JSON
                </Button>
                <label className="inline-flex cursor-pointer">
                  <span className="mf-button" data-variant="outline" data-size="sm">
                    <FileUpIcon className="size-3.5" /> Import JSON
                  </span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      file.text().then((text) => {
                        try {
                          const imported = parseWatchlist(text)
                          let merged = watchlist
                          for (const ref of imported) {
                            merged = upsertRef(merged, ref)
                          }
                          persist(merged)
                        } catch {
                          setFailure('Failed to import watchlist: invalid JSON format.')
                        }
                      })
                    }}
                  />
                </label>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer">
                <span className="mf-button" data-variant="outline" data-size="sm">
                  <FileUpIcon className="size-3.5" /> Import JSON
                </span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    file.text().then((text) => {
                      try {
                        const imported = parseWatchlist(text)
                        let merged = watchlist
                        for (const ref of imported) {
                          merged = upsertRef(merged, ref)
                        }
                        persist(merged)
                      } catch {
                        setFailure('Failed to import watchlist: invalid JSON format.')
                      }
                    })
                  }}
                />
              </label>
            )}
          </div>
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
                    <TableCell>
                      <button
                        type="button"
                        className="font-mono text-xs hover:underline text-left cursor-pointer"
                        onClick={() => {
                          setDigest(ref.digest)
                          lookUpDigest(ref.digest)
                        }}
                      >
                        <code>{ref.object_key}</code>
                      </button>
                    </TableCell>
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
              <Button onClick={sweep}>Run GC sweep now</Button>
            </div>
            {gc ? (
              <>
                <p className="text-sm">
                  Freed {formatBytes(gc.bytes_freed)} across {gc.deleted.length} object
                  {gc.deleted.length === 1 ? '' : 's'}. {gc.held.length} held.
                </p>
                {gc.held.length > 0 ? (
                  <>
                    <Separator />
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Held key</TableHead>
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

function SidecarPanel({
  sidecar,
  grant,
  onGrant,
  onVerifyFile,
  verifyingHash,
  localHash,
  localFile,
}: {
  sidecar: ObjectSidecar
  grant: Grant | null
  onGrant: () => void
  onVerifyFile: (file: File) => void
  verifyingHash: boolean
  localHash: string | null
  localFile: File | null
}) {
  const now = Date.now()
  const scan = scanWords(sidecar.scan)
  const retention = retentionWords(sidecar, now)

  const isMedia = sidecar.content_type.startsWith('audio/') ||
    sidecar.content_type.startsWith('image/') ||
    sidecar.content_type === 'application/pdf'

  const hashMatches = localHash ? localHash.toLowerCase() === sidecar.digest.toLowerCase() : null

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={toneClassesFor(scan.tone)}>{scan.label}</Badge>
        <Badge variant="outline" className={toneClassesFor(retention.tone)}>{retention.label}</Badge>
      </div>

      <Table>
        <TableBody>
          <TableRow><TableCell className="text-muted-foreground w-40">Filename</TableCell><TableCell>{sidecar.filename}</TableCell></TableRow>
          <TableRow><TableCell className="text-muted-foreground">Content type</TableCell><TableCell>{sidecar.content_type}</TableCell></TableRow>
          <TableRow><TableCell className="text-muted-foreground">Size</TableCell><TableCell>{formatBytes(sidecar.size)}</TableCell></TableRow>
          <TableRow><TableCell className="text-muted-foreground">Uploader</TableCell><TableCell>{sidecar.uploader}</TableCell></TableRow>
          <TableRow><TableCell className="text-muted-foreground">Created</TableCell><TableCell>{sidecar.created_at}</TableCell></TableRow>
          <TableRow><TableCell className="text-muted-foreground">Digest</TableCell><TableCell className="font-mono text-xs"><code>{sidecar.digest}</code></TableCell></TableRow>
        </TableBody>
      </Table>

      {/* Bit-for-bit Client Verification */}
      <div className="rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Client-Side Bit-for-Bit Hash Verification
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            className="text-xs file:text-xs max-w-sm"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onVerifyFile(f)
            }}
          />
          {verifyingHash ? (
            <span className="text-xs text-muted-foreground animate-pulse">Computing local SHA-256…</span>
          ) : localHash ? (
            <div className="flex items-center gap-2 text-xs font-medium">
              {hashMatches ? (
                <span className="flex items-center gap-1 text-status-ok font-semibold">
                  <CheckCircle2Icon className="size-4" /> Bit-for-bit identical with CAS object!
                </span>
              ) : (
                <span className="flex items-center gap-1 text-status-hot font-semibold">
                  <AlertCircleIcon className="size-4" /> Checksum mismatch! Local file differs.
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onGrant}>
          Request download grant
        </Button>
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

      {/* Ephemeral In-Console Preview */}
      {grant && isMedia ? (
        <div className="mt-3 rounded-lg border border-border p-3 bg-muted/10 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ephemeral Proof Preview ({sidecar.content_type})
          </span>
          {sidecar.content_type.startsWith('audio/') ? (
            <audio controls src={grant.url} className="w-full h-10 mt-1" />
          ) : sidecar.content_type.startsWith('image/') ? (
            <img src={grant.url} alt={sidecar.filename} className="max-h-80 w-auto object-contain rounded border border-border" />
          ) : sidecar.content_type === 'application/pdf' ? (
            <iframe src={grant.url} className="w-full h-96 rounded border border-border" title="PDF Preview" />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
