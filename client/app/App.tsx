import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AlertTriangleIcon, LockIcon, LogOutIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchHealth, type HealthSnapshot } from '@/lib/api'
import { describeFailure, signIn, signOut, whoAmI, type Principal } from '@/lib/session'
import { AccountsView } from '@/views/AccountsView'
import { CredentialsView } from '@/views/CredentialsView'
import { ObjectsView } from '@/views/ObjectsView'
import { UploadView } from '@/views/UploadView'
import { S3ExplorerView } from '@/views/S3ExplorerView'
import { StorageTelemetryView } from '@/views/StorageTelemetryView'
import { AuditLogView } from '@/views/AuditLogView'
import { OciExplorerView } from '@/views/OciExplorerView'
import { ToolsView } from '@/views/ToolsView'
import { SemanticSearchView } from '@/views/SemanticSearchView'

/**
 * The console shell. It holds exactly two pieces of state that matter — who is
 * signed in and whether the service is ready — and keeps no credential in
 * memory, storage or the bundle: the httpOnly session cookie is the only token.
 */
export function App() {
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [booting, setBooting] = useState(true)
  const [health, setHealth] = useState<HealthSnapshot | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('objects')
  const [inspectedDigest, setInspectedDigest] = useState<string | undefined>(undefined)

  const refreshHealth = useCallback(() => {
    void fetchHealth().then(setHealth)
  }, [])

  useEffect(() => {
    refreshHealth()
    whoAmI().then(
      (found) => {
        setPrincipal(found)
        setBooting(false)
      },
      (error: unknown) => {
        setFailure(describeFailure(error))
        setBooting(false)
      },
    )
  }, [refreshHealth])

  if (booting) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </main>
    )
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold tracking-tight">ECHOLOG</h1>
            <HealthBadge health={health} />
          </div>
          {principal ? (
            <div className="ml-auto flex items-center gap-3">
              <Badge variant="outline" className="gap-1">
                <LockIcon aria-hidden className="size-3.5" />
                {principal.login}
                <span className="text-muted-foreground">{principal.role}</span>
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void signOut().then(
                    () => setPrincipal(null),
                    (error: unknown) => setFailure(describeFailure(error)),
                  )
                }}
              >
                <LogOutIcon aria-hidden /> Sign out
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {failure ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangleIcon aria-hidden />
            <AlertTitle>Console failure</AlertTitle>
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}

        {principal ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6">
            <TabsList>
              <TabsTrigger value="objects">Objects</TabsTrigger>
              <TabsTrigger value="search">AI Search</TabsTrigger>
              <TabsTrigger value="s3">S3 Explorer</TabsTrigger>
              <TabsTrigger value="oci">OCI Registry</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
              {principal.role === 'admin' ? (
                <>
                  <TabsTrigger value="credentials">Credentials</TabsTrigger>
                  <TabsTrigger value="accounts">Accounts</TabsTrigger>
                  <TabsTrigger value="audit">Audit Log</TabsTrigger>
                </>
              ) : null}
            </TabsList>
            <TabsContent value="objects">
              <ObjectsView principal={principal} initialDigest={inspectedDigest} />
            </TabsContent>
            <TabsContent value="search">
              <SemanticSearchView />
            </TabsContent>
            <TabsContent value="s3">
              <S3ExplorerView
                onSelectDigest={(digest) => {
                  setInspectedDigest(digest)
                  setActiveTab('objects')
                }}
              />
            </TabsContent>
            <TabsContent value="oci">
              <OciExplorerView />
            </TabsContent>
            <TabsContent value="tools">
              <ToolsView />
            </TabsContent>
            <TabsContent value="upload">
              <UploadView principal={principal} />
            </TabsContent>
            <TabsContent value="telemetry">
              <StorageTelemetryView
                onTriggerGc={() => {
                  setActiveTab('objects')
                }}
              />
            </TabsContent>
            {principal.role === 'admin' ? (
              <>
                <TabsContent value="credentials">
                  <CredentialsView />
                </TabsContent>
                <TabsContent value="accounts">
                  <AccountsView currentLogin={principal.login} />
                </TabsContent>
                <TabsContent value="audit">
                  <AuditLogView />
                </TabsContent>
              </>
            ) : null}
          </Tabs>
        ) : (
          <LoginForm onSignedIn={setPrincipal} />
        )}
      </main>
    </div>
  )
}

function HealthBadge({ health }: { health: HealthSnapshot | null }) {
  if (!health) return <Badge variant="secondary">checking…</Badge>
  if (!health.reachable) return <Badge variant="destructive">service unreachable</Badge>
  return (
    <Badge variant="outline" className={health.ready ? 'border-status-ok/30 bg-status-ok/15 text-status-ok' : 'border-status-hot/30 bg-status-hot/15 text-status-hot'}>
      {health.detail}
    </Badge>
  )
}

function LoginForm({ onSignedIn }: { onSignedIn: (principal: Principal) => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setFailure(null)
    signIn(login, password).then(
      (principal) => {
        setBusy(false)
        setPassword('')
        onSignedIn(principal)
      },
      (error: unknown) => {
        setBusy(false)
        setFailure(describeFailure(error))
      },
    )
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Operator sign in</CardTitle>
        <CardDescription>
          One session cookie, hashed server-side and expiring on its own. Too many wrong
          passwords and the service pauses this login for a minute.
        </CardDescription>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="login">Login</Label>
            <Input id="login" value={login} autoComplete="username" required onChange={(event) => setLogin(event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {failure ? (
            <Alert variant="destructive">
              <AlertTriangleIcon aria-hidden />
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <Separator />
        <CardFooter className="flex justify-end gap-3 py-4">
          <Button type="submit" disabled={busy || login.length === 0 || password.length === 0}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
