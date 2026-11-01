import { useState } from 'react'
import { AlertTriangleIcon, UploadIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { sha256Hex, uploadObject } from '@/lib/api'
import { formatBytes } from '@/lib/format'
import { describeFailure, type Principal } from '@/lib/session'
import type { ObjectSidecar } from '@/types'

// The service owns the real allow-list in its configuration; this list is the
// shipped default, and an unlisted type is refused with 415 in the server's own
// words — the console never pretends to know a customised list.
const DEFAULT_TYPES = [
  'application/octet-stream', 'application/pdf', 'application/zip', 'audio/flac', 'audio/mpeg',
  'audio/mp4', 'audio/ogg', 'audio/wav', 'image/gif', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4',
]

export function UploadView({ principal }: { principal: Principal }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [contentType, setContentType] = useState('application/octet-stream')
  const [retention, setRetention] = useState('')
  const [legalHold, setLegalHold] = useState(false)
  const [privateWitness, setPrivateWitness] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [sidecar, setSidecar] = useState<ObjectSidecar | null>(null)

  const pick = (picked: File | null) => {
    setFile(picked)
    setSidecar(null)
    setPreview(null)
    if (!picked) return
    if (DEFAULT_TYPES.includes(picked.type)) setContentType(picked.type)
    void picked.arrayBuffer().then(
      (bytes) => void sha256Hex(bytes).then(setPreview),
      () => setFailure('The selected file could not be read.'),
    )
  }

  const send = () => {
    if (!file) return
    setBusy(true)
    setFailure(null)
    file.arrayBuffer().then(
      (bytes) => uploadObject({
        bytes,
        contentType,
        filename: file.name,
        retentionUntil: retention.length > 0 ? new Date(`${retention}T00:00:00.000Z`).toISOString() : null,
        legalHold: principal.role === 'admin' && legalHold,
        ...(privateWitness ? { privateWitness: true } : {}),
      }),
    ).then(
      (found) => {
        setSidecar(found)
        setBusy(false)
      },
      (error: unknown) => {
        setFailure(describeFailure(error))
        setBusy(false)
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload bytes</CardTitle>
          <CardDescription>
            The stream is hashed while it lands, checked against the size limit and the
            content-type allow-list, then committed atomically. Nothing becomes an object
            before verification, and identical bytes return the object that already exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="payload">File</Label>
            <Input
              id="payload"
              type="file"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-sm text-muted-foreground">
                {file.name} · {formatBytes(file.size)}
                {preview ? <span> · sha256 <code>{preview}</code></span> : null}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex min-w-56 flex-col gap-2">
              <Label htmlFor="content-type">Content type</Label>
              <Select
                value={contentType}
                onValueChange={(value) => setContentType(typeof value === 'string' ? value : 'application/octet-stream')}
              >
                <SelectTrigger id="content-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-48 flex-col gap-2">
              <Label htmlFor="retention">Retention until</Label>
              <Input id="retention" type="date" value={retention} onChange={(event) => setRetention(event.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="hold"
                checked={legalHold}
                disabled={principal.role !== 'admin'}
                onCheckedChange={(checked) => setLegalHold(checked === true)}
              />
              <Label htmlFor="hold" className={principal.role !== 'admin' ? 'text-muted-foreground' : ''}>
                Legal hold — deletion stays refused until an administrator clears it
                {principal.role !== 'admin' ? ' (administrators only)' : ''}
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="private"
                checked={privateWitness}
                onCheckedChange={(checked) => setPrivateWitness(checked === true)}
              />
              <Label htmlFor="private">
                Private witness media — the marker is written before the bytes are published
                and can never be removed
              </Label>
            </div>
          </div>

          {privateWitness ? (
            <Alert>
              <AlertTriangleIcon aria-hidden />
              <AlertTitle>Irreversible at this digest</AlertTitle>
              <AlertDescription>
                Marking hides the digest from every S3 alias and from non-administrative
                reads, and protects the bytes from garbage collection. There is no unmark.
              </AlertDescription>
            </Alert>
          ) : null}

          {failure ? (
            <Alert variant="destructive"><AlertDescription>{failure}</AlertDescription></Alert>
          ) : null}

          <div>
            <Button onClick={send} disabled={!file || busy}>
              <UploadIcon aria-hidden /> {busy ? 'Sending…' : 'Upload'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {sidecar ? (
        <Card>
          <CardHeader>
            <CardTitle>Committed object</CardTitle>
            <CardDescription>
              This is the sidecar exactly as the service returned it — the write-once content
              address, not a path the console invented.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Badge variant="outline" className="self-start">{sidecar.object_key}</Badge>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead><TableHead>Type</TableHead><TableHead>Uploader</TableHead>
                  <TableHead>Scan</TableHead><TableHead className="text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>{sidecar.filename}</TableCell>
                  <TableCell>{sidecar.content_type}</TableCell>
                  <TableCell>{sidecar.uploader}</TableCell>
                  <TableCell>{sidecar.scan}</TableCell>
                  <TableCell className="text-right">{formatBytes(sidecar.size)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
