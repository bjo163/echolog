'use client'

import { useEffect, useState } from 'react'
import {
  SparklesIcon,
  SearchIcon,
  DatabaseIcon,
  FileTextIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  LayersIcon,
  BoxIcon,
  HardDriveIcon,
  KeyIcon,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@echolog/ui'
import { Input } from '@echolog/ui'
import { Button } from '@echolog/ui'
import { Badge } from '@echolog/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@echolog/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@echolog/ui'
import { Alert, AlertDescription } from '@echolog/ui'
import type { SemanticSearchResult, VectorStatsResponse } from '@echolog/contract'

export default function EchologWebConsole() {
  const [activeTab, setActiveTab] = useState('search')
  const [query, setQuery] = useState('')
  const [stats, setStats] = useState<VectorStatsResponse | null>(null)
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const apiBase = typeof window !== 'undefined' ? (window.location.origin.includes('3106') ? 'http://localhost:3006' : '') : ''

  const loadStats = () => {
    fetch(`${apiBase}/api/v1/search/stats`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStats(data))
      .catch(() => setStats(null))
  }

  useEffect(() => {
    loadStats()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    setFailure(null)
    setHasSearched(true)

    fetch(`${apiBase}/api/v1/search/semantic`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: query.trim(), limit: 10 }),
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Search failed: status ${res.status}`)
        return res.json()
      })
      .then((res) => {
        setResults(res.results ?? [])
        setBusy(false)
      })
      .catch((err: any) => {
        setFailure(err.message ?? 'Search request failed')
        setBusy(false)
      })
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded bg-primary flex items-center justify-center text-primary-foreground font-mono font-bold text-sm">
            E
          </div>
          <div>
            <h1 className="font-mono text-base font-bold tracking-tight">ECHOLOG</h1>
            <p className="text-xs text-muted-foreground font-mono">Autonomous Multimodal Storage Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
            pgvector :5432 ACTIVE
          </Badge>
          <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10">
            OCI/ORAS v1.1
          </Badge>
          <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10">
            CAS WORM
          </Badge>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6">
          <TabsList>
            <TabsTrigger value="search" className="flex items-center gap-1.5">
              <SparklesIcon className="h-4 w-4 text-amber-400" /> AI Semantic Search
            </TabsTrigger>
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <HardDriveIcon className="h-4 w-4" /> Storage Overview
            </TabsTrigger>
            <TabsTrigger value="oci" className="flex items-center gap-1.5">
              <BoxIcon className="h-4 w-4" /> OCI Registry
            </TabsTrigger>
            <TabsTrigger value="sync" className="flex items-center gap-1.5">
              <LayersIcon className="h-4 w-4" /> Shape Sync P2P
            </TabsTrigger>
          </TabsList>

          {/* AI Semantic Search Tab */}
          <TabsContent value="search">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <SparklesIcon className="h-5 w-5 text-amber-400" />
                      <CardTitle>Autonomous AI Semantic Search</CardTitle>
                    </div>
                    <CardDescription>
                      Search your Content-Addressable Storage by meaning and context via embedded PostgreSQL (PGlite) + pgvector.
                    </CardDescription>
                  </div>
                  {stats && (
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <Badge variant={stats.vector_extension === 'active' ? 'default' : 'outline'}>
                        <DatabaseIcon className="mr-1 h-3 w-3" />
                        {stats.engine} ({stats.dimensions}d)
                      </Badge>
                      <Badge variant="outline">Indexed: {stats.indexed_objects}</Badge>
                      <Button size="icon" variant="ghost" onClick={loadStats} title="Refresh vector stats">
                        <RefreshCwIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Ask or search by concept (e.g. 'kubernetes networking', 'q3 financial report', 'device driver logic')..."
                      className="pl-9 font-mono text-sm"
                    />
                  </div>
                  <Button type="submit" disabled={busy || !query.trim()} className="font-mono">
                    {busy ? 'Searching...' : 'Search'}
                  </Button>
                </form>

                {failure && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertDescription>{failure}</AlertDescription>
                  </Alert>
                )}

                {hasSearched && (
                  <div className="mt-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                      <span>Matches found: {results.length}</span>
                    </div>

                    {results.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground font-mono">
                        No semantic matches found for "{query}". Try uploading or indexing more documents.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>File / Digest</TableHead>
                            <TableHead>Similarity</TableHead>
                            <TableHead>Content Snippet</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {results.map((item) => (
                            <TableRow key={item.digest}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <div className="font-sans font-medium">{item.filename}</div>
                                    <div className="font-mono text-xs text-muted-foreground">
                                      {item.digest.slice(0, 16)}...
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {item.similarity !== null ? (
                                  <Badge variant="secondary" className="font-mono font-semibold">
                                    {(item.similarity * 100).toFixed(1)}% match
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">N/A</span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-md">
                                <p className="line-clamp-2 text-xs font-mono text-muted-foreground bg-muted/40 p-1.5 rounded">
                                  {item.snippet ?? '(Snippet unavailable)'}
                                </p>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="outline" asChild>
                                  <a href={`${apiBase}${item.url}`} target="_blank" rel="noreferrer">
                                    Download <ArrowRightIcon className="ml-1 h-3 w-3" />
                                  </a>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Storage Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-mono text-muted-foreground">Engine Architecture</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">Single-Process</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Zero Docker containers. Memory footprint &lt; 80MB RAM.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-mono text-muted-foreground">Postgres Wire Gateway</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono text-emerald-400">Port 5432</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Direct access via DBeaver, DataGrip, or CLI <code>psql</code>.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-mono text-muted-foreground">Content-Addressed Storage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono text-amber-400">SHA-256 CAS</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Zero-duplicate bits, WORM compliance, and active retention timers.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* OCI Registry Tab */}
          <TabsContent value="oci">
            <Card>
              <CardHeader>
                <CardTitle>OCI Distribution v1.1 Registry</CardTitle>
                <CardDescription>
                  Store Docker container images, Helm charts, and AI model weights natively in ECHOLOG.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 font-mono text-sm">
                <div className="bg-muted p-3 rounded">
                  <span className="text-muted-foreground"># Push OCI artifact directly</span>
                  <br />
                  oras push localhost:3006/my-app:v1.0.0 ./my-app.tar.gz
                </div>
                <div className="bg-muted p-3 rounded">
                  <span className="text-muted-foreground"># Pull with docker</span>
                  <br />
                  docker pull localhost:3006/library/alpine:latest
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Shape Sync Tab */}
          <TabsContent value="sync">
            <Card>
              <CardHeader>
                <CardTitle>Local-First Shape Sync (P2P Delta Stream)</CardTitle>
                <CardDescription>
                  Replicate metadata and CAS objects between multiple ECHOLOG instances without a central cloud.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 font-mono text-sm">
                <div className="bg-muted p-3 rounded">
                  <span className="text-muted-foreground"># Pull delta stream changes</span>
                  <br />
                  GET /api/v1/sync/shapes/all?since_lsn=0
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
