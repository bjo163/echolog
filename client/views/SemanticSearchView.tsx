import { useEffect, useState } from 'react'
import { SparklesIcon, SearchIcon, DatabaseIcon, FileTextIcon, ArrowRightIcon, RefreshCwIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { fetchVectorStats, searchSemanticApi } from '@/lib/api'
import { describeFailure } from '@/lib/session'
import type { SemanticSearchResult, VectorStatsResponse } from '@/types'

export function SemanticSearchView() {
  const [query, setQuery] = useState('')
  const [stats, setStats] = useState<VectorStatsResponse | null>(null)
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const loadStats = () => {
    fetchVectorStats().then(
      (data) => setStats(data),
      () => setStats(null)
    )
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

    searchSemanticApi(query.trim(), 10).then(
      (res) => {
        setResults(res.results)
        setBusy(false)
      },
      (err: unknown) => {
        setFailure(describeFailure(err))
        setBusy(false)
      }
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-amber-400" />
                <CardTitle>AI Semantic & Vector Search</CardTitle>
              </div>
              <CardDescription>
                Search your files by meaning, context, and intent powered by embedded PostgreSQL (PGlite) + pgvector.
              </CardDescription>
            </div>
            {stats && (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={stats.vector_extension === 'active' ? 'default' : 'outline'}>
                  <DatabaseIcon className="mr-1 h-3 w-3" />
                  {stats.engine} ({stats.dimensions}d)
                </Badge>
                <Badge variant="outline">
                  Indexed: {stats.indexed_objects}
                </Badge>
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
                placeholder="Ask or search by concept (e.g. 'quarterly financial revenue', 'docker compose reverse proxy', 'security token logic')..."
                className="pl-9"
              />
            </div>
            <Button type="submit" disabled={busy || !query.trim()}>
              {busy ? 'Searching...' : 'Semantic Search'}
            </Button>
          </form>

          {failure && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          )}

          {hasSearched && (
            <div className="mt-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-mono">
                  Matches found: {results.length}
                </span>
              </div>

              {results.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No semantic matches found for "{query}". Try uploading or indexing more documents.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Relevance / Score</TableHead>
                      <TableHead>Semantic Content Snippet</TableHead>
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
                              <div>{item.filename}</div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {item.digest.slice(0, 12)}...
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
                          <p className="line-clamp-2 text-xs font-mono text-muted-foreground bg-muted/30 p-1.5 rounded">
                            {item.snippet ?? '(Snippet unavailable)'}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" asChild>
                            <a href={item.url} target="_blank" rel="noreferrer">
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
    </div>
  )
}
