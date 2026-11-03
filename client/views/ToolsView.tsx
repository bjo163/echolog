import { useEffect, useState } from 'react'
import {
  CodeIcon,
  CopyIcon,
  FileCodeIcon,
  FileUpIcon,
  FlameIcon,
  LinkIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  TerminalIcon,
  TrashIcon,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createPaste, createShortLinkApi, deleteShortLinkApi, listShortLinks } from '@/lib/api'
import { describeFailure } from '@/lib/session'
import type { ShortLinkRecord } from '@/types'

export function ToolsView() {
  const [activeSubTab, setActiveSubTab] = useState<'paste' | 'shortlinks' | 'cli'>('paste')

  // Pastebin state
  const [pasteContent, setPasteContent] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteRetention, setPasteRetention] = useState('24')
  const [pasteBurn, setPasteBurn] = useState(false)
  const [pasteResult, setPasteResult] = useState<{ url: string; raw_url: string; slug: string } | null>(null)
  const [pasteBusy, setPasteBusy] = useState(false)
  const [pasteFailure, setPasteFailure] = useState<string | null>(null)

  // Short Links state
  const [links, setLinks] = useState<ShortLinkRecord[]>([])
  const [linksBusy, setLinksBusy] = useState(false)
  const [linksFailure, setLinksFailure] = useState<string | null>(null)
  const [newDigest, setNewDigest] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [linkBurn, setLinkBurn] = useState(false)
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const loadLinks = () => {
    setLinksBusy(true)
    setLinksFailure(null)
    listShortLinks().then(
      (data) => {
        setLinks(data)
        setLinksBusy(false)
      },
      (err: unknown) => {
        setLinksFailure(describeFailure(err))
        setLinksBusy(false)
      }
    )
  }

  useEffect(() => {
    if (activeSubTab === 'shortlinks') loadLinks()
  }, [activeSubTab])

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 2000)
  }

  const handleCreatePaste = () => {
    if (!pasteContent.trim()) return
    setPasteBusy(true)
    setPasteFailure(null)
    createPaste({
      content: pasteContent,
      title: pasteTitle.trim() || undefined,
      retention_hours: Number(pasteRetention),
      burn_after_reading: pasteBurn,
    }).then(
      (res) => {
        setPasteResult(res)
        setPasteContent('')
        setPasteTitle('')
        setPasteBusy(false)
      },
      (err: unknown) => {
        setPasteFailure(describeFailure(err))
        setPasteBusy(false)
      }
    )
  }

  const handleCreateShortLink = () => {
    if (!newDigest.trim()) return
    setLinksBusy(true)
    setLinksFailure(null)
    createShortLinkApi({
      digest: newDigest.trim(),
      custom_slug: customSlug.trim() || undefined,
      burn_after_reading: linkBurn,
    }).then(
      () => {
        setNewDigest('')
        setCustomSlug('')
        setLinkBurn(false)
        loadLinks()
      },
      (err: unknown) => {
        setLinksFailure(describeFailure(err))
        setLinksBusy(false)
      }
    )
  }

  const handleDeleteLink = (slug: string) => {
    deleteShortLinkApi(slug).then(loadLinks, (err: unknown) => setLinksFailure(describeFailure(err)))
  }

  const origin = window.location.origin

  return (
    <div className="flex flex-col gap-6">
      {/* Sub navigation bar */}
      <div className="flex gap-2 border-b border-border pb-3">
        <Button
          variant={activeSubTab === 'paste' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setActiveSubTab('paste')}
        >
          <FileCodeIcon className="size-3.5" /> Pastebin & Snippets
        </Button>
        <Button
          variant={activeSubTab === 'shortlinks' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setActiveSubTab('shortlinks')}
        >
          <LinkIcon className="size-3.5" /> Short Links & One-Time Share
        </Button>
        <Button
          variant={activeSubTab === 'cli' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setActiveSubTab('cli')}
        >
          <TerminalIcon className="size-3.5" /> cURL & CLI Dropzone
        </Button>
      </div>

      {activeSubTab === 'paste' && (
        <Card>
          <CardHeader>
            <CardTitle>Ephemeral Pastebin</CardTitle>
            <CardDescription>
              Store and share formatted code, configuration files, or logs. Backed by CAS retention boundaries
              and optional burn-after-reading.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {pasteFailure ? (
              <Alert variant="destructive">
                <ShieldAlertIcon aria-hidden />
                <AlertDescription>{pasteFailure}</AlertDescription>
              </Alert>
            ) : null}

            {pasteResult ? (
              <Alert>
                <div className="flex flex-col gap-2">
                  <span className="font-semibold text-status-ok">Paste created successfully!</span>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span>Viewer: <code>{origin}{pasteResult.url}</code></span>
                    <Button variant="outline" size="sm" onClick={() => copy(`${origin}${pasteResult.url}`)}>
                      <CopyIcon className="size-3" /> Copy
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span>Raw Content: <code>{origin}{pasteResult.raw_url}</code></span>
                    <Button variant="outline" size="sm" onClick={() => copy(`${origin}${pasteResult.raw_url}`)}>
                      <CopyIcon className="size-3" /> Copy
                    </Button>
                  </div>
                </div>
              </Alert>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paste-title">Title / Filename (optional)</Label>
                <Input
                  id="paste-title"
                  placeholder="e.g. server-config.yaml or debug.log"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paste-retention">Retention Time</Label>
                <select
                  id="paste-retention"
                  className="mf-select h-8 text-sm"
                  value={pasteRetention}
                  onChange={(e) => setPasteRetention(e.target.value)}
                >
                  <option value="1">1 Hour</option>
                  <option value="24">24 Hours (1 Day)</option>
                  <option value="168">7 Days</option>
                  <option value="720">30 Days</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paste-text">Content</Label>
              <textarea
                id="paste-text"
                rows={10}
                className="mf-textarea font-mono text-xs p-3 rounded-md border border-border"
                placeholder="Paste code snippet, stacktrace, or markdown text here…"
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="paste-burn"
                checked={pasteBurn}
                onCheckedChange={(c) => setPasteBurn(Boolean(c))}
              />
              <Label htmlFor="paste-burn" className="text-xs flex items-center gap-1 cursor-pointer">
                <FlameIcon className="size-3 text-status-hot" /> Burn after reading (one-time view)
              </Label>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleCreatePaste} disabled={pasteBusy || !pasteContent.trim()}>
                {pasteBusy ? 'Publishing…' : 'Publish Paste'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeSubTab === 'shortlinks' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Short Links & Burn-After-Reading</CardTitle>
                <CardDescription>
                  Generate readable ephemeral share links for any CAS content-addressed object.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadLinks} disabled={linksBusy}>
                <RefreshCwIcon aria-hidden className={linksBusy ? 'animate-spin' : ''} /> Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {linksFailure ? (
              <Alert variant="destructive">
                <ShieldAlertIcon aria-hidden />
                <AlertDescription>{linksFailure}</AlertDescription>
              </Alert>
            ) : null}

            {/* Create Link Card */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Create New Short Link
              </span>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-1 min-w-64 flex-col gap-1.5">
                  <Label htmlFor="link-digest">Target Object SHA-256 Digest</Label>
                  <Input
                    id="link-digest"
                    placeholder="64 hex characters"
                    value={newDigest}
                    onChange={(e) => setNewDigest(e.target.value)}
                  />
                </div>
                <div className="flex min-w-40 flex-col gap-1.5">
                  <Label htmlFor="link-slug">Custom Slug (optional)</Label>
                  <Input
                    id="link-slug"
                    placeholder="e.g. release-v1"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox
                    id="link-burn"
                    checked={linkBurn}
                    onCheckedChange={(c) => setLinkBurn(Boolean(c))}
                  />
                  <Label htmlFor="link-burn" className="text-xs flex items-center gap-1 cursor-pointer">
                    <FlameIcon className="size-3 text-status-hot" /> Burn after 1 download
                  </Label>
                </div>
                <Button onClick={handleCreateShortLink} disabled={linksBusy || !newDigest.trim()}>
                  <PlusIcon className="size-3.5" /> Create Link
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Short URL</TableHead>
                  <TableHead>Target Digest</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead>Downloads</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead aria-label="actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.slug}>
                    <TableCell className="font-mono text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <code>{origin}/s/{link.slug}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={() => copy(`${origin}/s/${link.slug}`)}
                        >
                          <CopyIcon className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <code>{link.digest.slice(0, 12)}…{link.digest.slice(-6)}</code>
                    </TableCell>
                    <TableCell className="text-xs">{link.filename}</TableCell>
                    <TableCell className="text-xs">{link.download_count}</TableCell>
                    <TableCell>
                      {link.burn_after_reading === 1 ? (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                          <FlameIcon className="size-2.5" /> 1-time burn
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">standard</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-status-hot"
                        onClick={() => handleDeleteLink(link.slug)}
                      >
                        <TrashIcon className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {links.length === 0 && !linksBusy ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      No short links generated yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeSubTab === 'cli' && (
        <Card>
          <CardHeader>
            <CardTitle>cURL & CLI Dropzone</CardTitle>
            <CardDescription>
              Copy-pasteable one-liners to stream and drop files from any server, headless container, or script
              directly into ECHOLOG storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 text-xs font-mono">
              <div className="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-2">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <TerminalIcon className="size-4 text-muted-foreground" /> 1. Upload Any File via HTTP PUT
                </span>
                <p className="text-muted-foreground">Uploads the raw stream and returns a short download link:</p>
                <div className="bg-muted/60 p-3 rounded border border-border flex items-center justify-between">
                  <code>curl -T backup.tar.gz {origin}/drop/backup.tar.gz</code>
                  <Button variant="ghost" size="icon" className="size-6" onClick={() => copy(`curl -T backup.tar.gz ${origin}/drop/backup.tar.gz`)}>
                    <CopyIcon className="size-3" />
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-2">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <CodeIcon className="size-4 text-muted-foreground" /> 2. Pipe Command Output to Ephemeral Pastebin
                </span>
                <p className="text-muted-foreground">Pipes stdin logs to Pastebin and outputs the viewer URL:</p>
                <div className="bg-muted/60 p-3 rounded border border-border flex items-center justify-between">
                  <code>cat /var/log/nginx/error.log | curl -F &quot;c=@-&quot; {origin}/paste</code>
                  <Button variant="ghost" size="icon" className="size-6" onClick={() => copy(`cat /var/log/nginx/error.log | curl -F "c=@-" ${origin}/paste`)}>
                    <CopyIcon className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

