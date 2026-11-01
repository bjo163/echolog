import { useEffect, useState } from 'react'
import { KeyRoundIcon, RefreshCwIcon, ShieldAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { describeFailure, issueApiKey, listApiKeys, revokeApiKey, type ApiKeyRow, type IssuedKey } from '@/lib/session'

export function CredentialsView() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [issued, setIssued] = useState<IssuedKey | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setBusy(true)
    listApiKeys().then(
      (found) => { setKeys(found); setBusy(false) },
      (error: unknown) => { setFailure(describeFailure(error)); setBusy(false) },
    )
  }

  useEffect(load, [])

  const create = () => {
    setFailure(null)
    issueApiKey(name.trim(), role).then(
      (result) => {
        setIssued(result)
        setName('')
        load()
      },
      (error: unknown) => setFailure(describeFailure(error)),
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Machine credentials</CardTitle>
          <CardDescription>
            An API key is the bearer token a daemon sends as `Authorization: Bearer ecl_…`.
            Only its SHA-256 hash is stored, so the secret is shown once and cannot be
            recovered later — retire it and issue a new one instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-56 flex-1 flex-col gap-2">
              <Label htmlFor="key-name">Name</Label>
              <Input id="key-name" value={name} placeholder="backup host" maxLength={60} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="flex min-w-40 flex-col gap-2">
              <Label htmlFor="key-role">Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value === 'admin' ? 'admin' : 'member')}>
                <SelectTrigger id="key-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={create} disabled={name.trim().length === 0}>
              <KeyRoundIcon aria-hidden /> Issue key
            </Button>
            <Button variant="outline" onClick={load} disabled={busy}>
              <RefreshCwIcon aria-hidden /> Refresh
            </Button>
          </div>

          {issued ? (
            <Alert>
              <KeyRoundIcon aria-hidden />
              <AlertTitle>Copy it now — this is the only time it appears</AlertTitle>
              <AlertDescription>
                <code>{issued.token}</code>
                <p className="mt-2 text-muted-foreground">
                  Prefix <code>{issued.key.prefix}</code> is what the listing and the revoke
                  action use. Store the secret in the calling service&apos;s own secret store:
                  never in a browser bundle, a database row, Git or a log line.
                </p>
              </AlertDescription>
            </Alert>
          ) : null}

          {failure ? (
            <Alert variant="destructive">
              <ShieldAlertIcon aria-hidden />
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Prefix</TableHead><TableHead>Role</TableHead>
                <TableHead>Created</TableHead><TableHead>Last used</TableHead><TableHead>State</TableHead>
                <TableHead aria-label="actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell><code>{row.prefix}</code></TableCell>
                  <TableCell>{row.role}</TableCell>
                  <TableCell>{row.created_at}</TableCell>
                  <TableCell>{row.last_used_at ?? 'never'}</TableCell>
                  <TableCell>
                    <Badge variant={row.revoked_at ? 'secondary' : 'outline'} className={row.revoked_at ? '' : 'border-status-ok/30 bg-status-ok/15 text-status-ok'}>
                      {row.revoked_at ? 'revoked' : 'active'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.revoked_at ? null : (
                      <AlertDialog>
                        <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                          Revoke
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke “{row.name}”</AlertDialogTitle>
                            <AlertDialogDescription>
                              Any daemon still holding this secret starts failing with 401 the
                              moment it is revoked. The row stays so the audit trail keeps its
                              name and prefix.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                revokeApiKey(row.prefix).then(load, (error: unknown) => setFailure(describeFailure(error)))
                              }}
                            >
                              Revoke
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {keys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    No credentials issued yet.
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
