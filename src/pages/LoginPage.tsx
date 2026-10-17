import { useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Input } from '../components/ui/Input'
import { AuthCard, Field } from '../features/auth/AuthCard'
import { login } from '../features/auth/authApi'
import { useAuthStore } from '../features/auth/authStore'

type By = 'email' | 'phone'

/** The login form both pages share: admins and users log in by email, the developer by phone number. */
function LoginForm({ by, title, footer }: { by: By; title: string; footer: ReactNode }) {
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/rsi-ha'
  const loggedIn = useAuthStore((s) => s.session !== null && s.isLoggedIn())
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Also how a successful login leaves this page: storing the session re-renders into this redirect.
  if (loggedIn) return <Navigate to={from} replace />

  async function submit() {
    if (!identifier.trim() || !password) {
      setError(by === 'email' ? 'Enter your email and password.' : 'Enter your phone number and password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const value = identifier.trim()
      useAuthStore.getState().setSession(await login(by === 'email' ? { email: value, password } : { phone: value, password }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title={title}
      submitLabel="Log in"
      busy={busy}
      error={error}
      onSubmit={() => void submit()}
      footer={footer}
    >
      <Field label={by === 'email' ? 'Email' : 'Phone number'}>
        <Input
          type={by === 'email' ? 'email' : 'tel'}
          autoComplete={by === 'email' ? 'email' : 'tel'}
          placeholder={by === 'email' ? 'you@example.com' : '+91 98765 43210'}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </AuthCard>
  )
}

/** /login — admins and users, by email. Their accounts are created by an admin (User management), not here. */
export function LoginPage() {
  return <LoginForm by="email" title="Log in" footer="No account? Ask your admin for your login details." />
}

/** /developer-login — the developer, by phone number. */
export function DeveloperLoginPage() {
  return (
    <LoginForm
      by="phone"
      title="Developer log in"
      footer={
        <>
          First-time setup?{' '}
          <Link to="/developer-register" className="font-medium text-neutral hover:underline">
            Register developer
          </Link>
        </>
      }
    />
  )
}
