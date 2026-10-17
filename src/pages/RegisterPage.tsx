import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Input } from '../components/ui/Input'
import { AuthCard, Field } from '../features/auth/AuthCard'
import { register } from '../features/auth/authApi'
import { useAuthStore } from '../features/auth/authStore'

/**
 * /superadmin-register — one-time setup of the super admin, by phone number
 * (the backend refuses once one exists). There is no registration for admins
 * and users: their accounts are created on the User management page.
 */
export function SuperAdminRegisterPage() {
  const loggedIn = useAuthStore((s) => s.session !== null && s.isLoggedIn())
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A successful registration logs the new account in, which re-renders into this redirect.
  if (loggedIn) return <Navigate to="/rsi-ha" replace />

  async function submit() {
    if (!phone.trim() || !password) {
      setError('Enter a phone number and password.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      useAuthStore.getState().setSession(await register({ phone: phone.trim(), password }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title="Register super admin"
      submitLabel="Register"
      busy={busy}
      error={error}
      onSubmit={() => void submit()}
      footer={
        <>
          Already registered?{' '}
          <Link to="/superadmin-login" className="font-medium text-neutral hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <Field label="Phone number">
        <Input type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm password">
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
    </AuthCard>
  )
}
