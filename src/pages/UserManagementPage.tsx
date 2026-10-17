import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, Copy, KeyRound, Trash2, Wand2 } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../components/ui/Table'
import { Toggle } from '../components/ui/Toggle'
import { Field, Segmented } from '../features/auth/AuthCard'
import { DEVELOPER_ROLE } from '../features/auth/authApi'
import { useAuthStore } from '../features/auth/authStore'
import {
  createUser,
  deleteUser,
  generatePassword,
  listUsers,
  resetPassword,
  setCanCreateAdmins,
  type ManagedRole,
  type ManagedUser,
} from '../features/users/usersApi'

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
] as const

const ROLE_LABEL: Record<ManagedRole, string> = { admin: 'Admin', user: 'User' }

/** Login details to send to someone — shown once, right after their account is created or reset. */
interface Credentials {
  email: string
  password: string
  reason: 'created' | 'reset'
}

/**
 * /users — the developer manages every admin and user; an admin manages the
 * accounts they created. People get in with the credentials sent to them
 * from here (there is no self-registration). Users don't have this page.
 */
export function UserManagementPage() {
  const me = useAuthStore((s) => s.session?.user ?? null)
  const isDeveloper = me?.role === DEVELOPER_ROLE
  const isManager = isDeveloper || me?.role === 'admin'

  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [canCreateAdmins, setCanCreateAdminsHere] = useState(false)
  const [role, setRole] = useState<ManagedRole>('user')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)

  async function refresh() {
    try {
      const list = await listUsers()
      setUsers(list.users)
      setCanCreateAdminsHere(list.canCreateAdmins)
      if (!list.canCreateAdmins) setRole('user')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load accounts.')
      setUsers((current) => current ?? [])
    }
  }

  useEffect(() => {
    if (isManager) void refresh()
  }, [isManager])

  if (!isManager) return <Navigate to="/rsi-ha" replace />

  async function create(event: FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!address || !password) {
      setError('Enter an email and a password (or press Generate).')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await createUser({ role, email: address, password })
      setCredentials({ email: created.email, password, reason: 'created' })
      setEmail('')
      setPassword('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.')
    } finally {
      setBusy(false)
    }
  }

  async function reset(user: ManagedUser) {
    if (!window.confirm(`Set a new password for ${user.email}? Their current password stops working.`)) return
    const next = generatePassword()
    setError(null)
    try {
      await resetPassword(user.id, next)
      setCredentials({ email: user.email, password: next, reason: 'reset' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.')
    }
  }

  async function remove(user: ManagedUser) {
    if (!window.confirm(`Delete ${user.email}? They will be logged out and can no longer log in.`)) return
    setError(null)
    try {
      await deleteUser(user.id)
      if (credentials?.email === user.email) setCredentials(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account.')
    }
  }

  async function togglePermission(user: ManagedUser, next: boolean) {
    setError(null)
    const setFlag = (value: boolean) =>
      setUsers((current) => current?.map((u) => (u.id === user.id ? { ...u, canCreateAdmins: value } : u)) ?? null)
    // Flipped at once; put back if the server says no.
    setFlag(next)
    try {
      await setCanCreateAdmins(user.id, next)
    } catch (err) {
      setFlag(!next)
      setError(err instanceof Error ? err.message : 'Could not change the permission.')
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">User management</h1>
        <p className="text-sm text-text-secondary">
          {isDeveloper ? 'Every admin and user.' : 'The accounts you created.'} New accounts log in at the login page with the details you send them.
        </p>
      </div>

      <form onSubmit={(e) => void create(e)} noValidate className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4">
        <h2 className="text-sm font-semibold text-text-primary">Create an account</h2>
        {canCreateAdmins ? (
          <div className="max-w-xs">
            <Segmented
              label="Account type"
              options={ROLE_OPTIONS}
              value={role}
              onChange={(next) => {
                setRole(next)
                setError(null)
              }}
            />
          </div>
        ) : (
          <p className="text-xs text-text-muted">You can create users. Creating admins needs the developer's permission.</p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Email">
            <Input type="email" autoComplete="off" placeholder="person@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <div className="flex gap-2">
              <Input
                className="min-w-0 flex-1 font-mono"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button onClick={() => setPassword(generatePassword())}>
                <Wand2 className="h-3.5 w-3.5" /> Generate
              </Button>
            </div>
          </Field>
        </div>
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creating…' : `Create ${ROLE_LABEL[role].toLowerCase()}`}
          </Button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded border border-bearish/40 bg-bearish/10 px-3 py-2 text-xs text-bearish">
          {error}
        </p>
      )}
      {credentials && <CredentialsCard credentials={credentials} onDismiss={() => setCredentials(null)} />}

      <section className="rounded-lg border border-border bg-panel">
        <h2 className="border-b border-border-hairline px-4 py-3 text-sm font-semibold text-text-primary">
          Accounts{users ? ` (${users.length})` : ''}
        </h2>
        {users === null ? (
          <p className="p-4 text-sm text-text-secondary" role="status">
            Loading…
          </p>
        ) : users.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">No accounts yet. Create one above.</p>
        ) : (
          <Table aria-label="Accounts">
            <TableHead>
              <tr className="h-9">
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                {isDeveloper && <TableHeaderCell>Created by</TableHeaderCell>}
                {isDeveloper && <TableHeaderCell>Can create admins</TableHeaderCell>}
                <TableHeaderCell>Created</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className="h-12">
                  <TableCell className="max-w-[16rem] truncate" title={user.email}>
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'neutral' : 'default'}>{ROLE_LABEL[user.role]}</Badge>
                  </TableCell>
                  {isDeveloper && <TableCell className="text-text-secondary">{user.createdBy ?? '—'}</TableCell>}
                  {isDeveloper && (
                    <TableCell>
                      {user.role === 'admin' ? (
                        <Toggle
                          checked={user.canCreateAdmins}
                          onChange={(next) => void togglePermission(user, next)}
                          aria-label={`${user.email} can create admins`}
                        />
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-text-secondary">{new Date(user.createdAt).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => void reset(user)} aria-label={`Reset password for ${user.email}`}>
                        <KeyRound className="h-3.5 w-3.5" /> <span className="hidden md:inline">Reset password</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(user)} aria-label={`Delete ${user.email}`}>
                        <Trash2 className="h-3.5 w-3.5 text-bearish" /> <span className="hidden md:inline">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

function CredentialsCard({ credentials, onDismiss }: { credentials: Credentials; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const loginUrl = `${window.location.origin}/login`
  const text = `Log in at ${loginUrl}\nEmail: ${credentials.email}\nPassword: ${credentials.password}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section role="status" className="flex flex-col gap-2 rounded-lg border border-bullish/40 bg-bullish/10 p-4">
      <h2 className="text-sm font-semibold text-text-primary">
        {credentials.reason === 'created' ? 'Account created' : 'Password reset'} — send these login details to {credentials.email}
      </h2>
      <p className="text-xs text-text-secondary">The password isn't shown again after you close this.</p>
      <pre className="whitespace-pre-wrap break-all rounded border border-border bg-surface p-3 font-mono text-xs text-text-primary">{text}</pre>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() => void copy()}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </section>
  )
}
