import { useEffect, useState } from 'react'
import { BoxIcon, CopyIcon, LayersIcon, RefreshCwIcon, ShieldAlertIcon, TerminalIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listOciRepositories } from '@/lib/api'
import { describeFailure } from '@/lib/session'
import type { OciRepositoryItem } from '@/types'

export function OciExplorerView() {
  const [repos, setRepos] = useState<OciRepositoryItem[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = () => {
    setBusy(true)
    setFailure(null)
    listOciRepositories().then(
      (data) => {
        setRepos(data)
        setBusy(false)
      },
      (error: unknown) => {
        setFailure(describeFailure(error))
        setBusy(false)
      }
    )
  }

  useEffect(load, [])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 2000)
  }

  const host = window.location.host

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>OCI & ORAS Artifact Registry</CardTitle>
              <CardDescription>
                Native Open Container Initiative (OCI Distribution Spec v1.1) registry. Push and pull Docker/Podman
                container images, Helm charts, Wasm binaries, and AI models directly against ECHOLOG Content-Addressed Storage.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={busy}>
              <RefreshCwIcon aria-hidden className={busy ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {failure ? (
            <Alert variant="destructive">
              <ShieldAlertIcon aria-hidden />
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}

          {/* CLI Instructions Card */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TerminalIcon className="size-3.5" /> Docker / Podman / ORAS Quick Connect
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-muted/50 p-2.5 rounded border border-border/80 flex items-center justify-between">
                <span>docker login {host}</span>
                <Button variant="ghost" size="icon" className="size-6" onClick={() => copyToClipboard(`docker login ${host}`)}>
                  <CopyIcon className="size-3" />
                </Button>
              </div>
              <div className="bg-muted/50 p-2.5 rounded border border-border/80 flex items-center justify-between">
                <span>oras push {host}/my-artifact:v1 ./file.bin</span>
                <Button variant="ghost" size="icon" className="size-6" onClick={() => copyToClipboard(`oras push ${host}/my-artifact:v1 ./file.bin`)}>
                  <CopyIcon className="size-3" />
                </Button>
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Docker Pull Command</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repos.map((r) => (
                <TableRow key={r.repository}>
                  <TableCell className="font-mono text-sm font-semibold">
                    <span className="flex items-center gap-2">
                      <BoxIcon className="size-4 text-muted-foreground" aria-hidden />
                      {r.repository}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {r.tags.map((t) => (
                        <Badge key={t} variant="outline" className="text-xs font-mono">
                          {t}
                        </Badge>
                      ))}
                      {r.tags.length === 0 ? <span className="text-xs text-muted-foreground">untagged manifests</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.tags.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <code>docker pull {host}/{r.repository}:{r.tags[0]}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={() => copyToClipboard(`docker pull ${host}/${r.repository}:${r.tags[0]}`)}
                        >
                          <CopyIcon className="size-3" />
                        </Button>
                      </div>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {repos.length === 0 && !busy ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                    No OCI container repositories pushed yet.
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

