import { useEffect, useState } from 'react'
import { RefreshCwIcon, ShieldAlertIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { describeFailure, listUsers, setUserDisabled, type UserRow } from '@/lib/session'

export function AccountsView({ currentLogin }: { currentLogin: string }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  const load = () => {
    listUsers().then(
      setUsers,
      (error: unknown) => setFailure(describeFailure(error)),
    )
  }

  useEffect(load, [])

  const toggle = (row: UserRow) => {
    setFailure(null)
    setUserDisabled(row.login, !row.disabled).then(load, (error: unknown) => setFailure(describeFailure(error)))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operator accounts</CardTitle>
        <CardDescription>
          Disabling locks the account out at once: its live sessions are deleted, so a copied
          cookie stops working immediately. Objects already uploaded keep the uploader name in
          their sidecar and are never rewritten. Re-enabling never resurrects the old session.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCwIcon aria-hidden /> Refresh
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
              <TableHead>Login</TableHead><TableHead>Role</TableHead><TableHead>Created</TableHead>
              <TableHead>State</TableHead><TableHead aria-label="actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.login}</TableCell>
                <TableCell>{row.role}</TableCell>
                <TableCell>{row.created_at}</TableCell>
                <TableCell>
                  <Badge
                    variant={row.disabled ? 'secondary' : 'outline'}
                    className={row.disabled ? '' : 'border-status-ok/30 bg-status-ok/15 text-status-ok'}
                  >
                    {row.disabled ? 'disabled' : 'active'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {row.login === currentLogin ? (
                    <span className="text-sm text-muted-foreground">this session</span>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button variant={row.disabled ? 'outline' : 'destructive'} size="sm" />}>
                        {row.disabled ? 'Re-enable' : 'Disable'}
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {row.disabled ? `Re-enable ${row.login}` : `Lock out ${row.login}`}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {row.disabled
                              ? 'The account can sign in again and issue fresh sessions. Nothing uploaded under it changes.'
                              : 'Every session of this account is deleted now, and new sign-ins are refused. The service will refuse the request if it would lock out the account you are using.'}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => toggle(row)}>
                            {row.disabled ? 'Re-enable' : 'Disable'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
