import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useScreenerStore } from '../app/screenerStore'
import { useAuthStore } from '../features/auth/authStore'
import {
  connectMasterTrust,
  getMasterTrustLoginUrl,
  getMasterTrustStatus,
  type MasterTrustStatus,
} from '../features/mastertrust/masterTrustApi'
import { formatISTTime } from '../lib/formatters'

/** /master-trust — the super admin (re)connects the Master Trust account every page's market data comes from. */
export function MasterTrustPage() {
  const isSuperAdmin = useAuthStore((s) => s.session?.user.role === 'super_admin')
  const [status, setStatus] = useState<MasterTrustStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [loginUrl, setLoginUrl] = useState<{ url: string; redirectUri: string } | null>(null)
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justConnected, setJustConnected] = useState(false)

  async function refreshStatus() {
    setChecking(true)
    try {
      setStatus(await getMasterTrustStatus())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the connection.')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (isSuperAdmin) void refreshStatus()
  }, [isSuperAdmin])

  if (!isSuperAdmin) return <Navigate to="/rsi-ha" replace />

  async function openLogin() {
    setError(null)
    // Opened synchronously (inside the click), so popup blockers allow it; pointed at Master Trust once the URL arrives.
    const tab = window.open('', '_blank')
    try {
      const next = await getMasterTrustLoginUrl()
      setLoginUrl(next)
      if (tab) tab.location.href = next.url
    } catch (err) {
      tab?.close()
      setError(err instanceof Error ? err.message : 'Could not get the Master Trust login link.')
    }
  }

  async function connect(event: FormEvent) {
    event.preventDefault()
    if (!pasted.trim()) {
      setError('Paste the address Master Trust sent you to after logging in.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setStatus(await connectMasterTrust(pasted.trim()))
      setPasted('')
      setJustConnected(true)
      // The screener doesn't retry a failed universe load on its own (Intraday reloads whenever it's opened).
      const screener = useScreenerStore.getState()
      if (screener.universe.length === 0 && screener.scanState !== 'loading-universe') {
        useScreenerStore.setState({ errors: [] })
        void screener.loadUniverse().then(() => {
          if (useScreenerStore.getState().scanState !== 'error') return useScreenerStore.getState().runScanNow()
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect Master Trust.')
    } finally {
      setBusy(false)
    }
  }

  const badge =
    status === null
      ? { variant: 'default' as const, text: 'Checking…' }
      : !status.connected
        ? { variant: 'bearish' as const, text: 'Not connected' }
        : status.valid
          ? { variant: 'bullish' as const, text: 'Connected' }
          : { variant: 'warning' as const, text: 'Login expired' }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-text-primary">Master Trust connection</h1>
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant}>{badge.text}</Badge>
          <Button size="sm" variant="ghost" onClick={() => void refreshStatus()} disabled={checking} aria-label="Check again">
            <RefreshCw className={checking ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-panel p-4 text-sm text-text-secondary">
        {status?.detail && <p className="mb-1">{status.detail}</p>}
        {status?.savedAt && <p>Last connected: {new Date(status.savedAt).toLocaleDateString('en-IN')} at {formatISTTime(new Date(status.savedAt))} IST</p>}
        <p className="mt-1">
          Every page's market data comes from this one Master Trust login. When it expires, log in again here — no one else needs to do anything.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4">
        <h2 className="text-sm font-semibold text-text-primary">1. Log in to Master Trust</h2>
        <p className="text-sm text-text-secondary">Opens the Master Trust login in a new tab. Log in with your trading credentials and 2FA.</p>
        <div>
          <Button variant="primary" onClick={() => void openLogin()}>
            <ExternalLink className="h-4 w-4" /> Open Master Trust login
          </Button>
        </div>
        {loginUrl && (
          <p className="text-xs text-text-muted">
            After login you'll land on <span className="font-mono">{loginUrl.redirectUri}</span>
            {loginUrl.redirectUri.includes('127.0.0.1') || loginUrl.redirectUri.includes('localhost') ? " — that page won't load, which is expected." : '.'}
          </p>
        )}
      </section>

      <form onSubmit={(e) => void connect(e)} noValidate className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4">
        <h2 className="text-sm font-semibold text-text-primary">2. Paste the address you landed on</h2>
        <p className="text-sm text-text-secondary">Copy the full address from that tab's address bar (it contains <span className="font-mono">code=</span>) and paste it here.</p>
        <Input
          aria-label="Redirected address"
          placeholder="http://127.0.0.1/?code=…&state=…"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded border border-bearish/40 bg-bearish/10 px-3 py-2 text-xs text-bearish">
          {error}
        </p>
      )}
      {justConnected && !error && (
        <p role="status" className="rounded border border-bullish/40 bg-bullish/10 px-3 py-2 text-xs text-bullish">
          Master Trust is connected. The Screener and Intraday pages will use it on their next refresh.
        </p>
      )}
    </div>
  )
}
