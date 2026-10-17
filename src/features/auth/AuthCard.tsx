import { useEffect, type FormEvent, type ReactNode } from 'react'
import { TrendingUp } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/cn'
import { useUiStore } from '../../store/uiStore'

interface AuthCardProps {
  title: string
  submitLabel: string
  busy: boolean
  error: string | null
  onSubmit: () => void
  footer: ReactNode
  children: ReactNode
}

/** The shared frame of the login and register pages: logo, title, form, error line, submit, footer link. */
export function AuthCard({ title, submitLabel, busy, error, onSubmit, footer, children }: AuthCardProps) {
  const theme = useUiStore((s) => s.theme)

  // AppShell sets this too, but it isn't mounted on these pages.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!busy) onSubmit()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-8">
      <form onSubmit={handleSubmit} noValidate className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-panel p-6 shadow-lg">
        <div className="flex items-center gap-2 text-text-primary">
          <TrendingUp className="h-5 w-5 text-neutral" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight">RSI-HA</span>
        </div>
        <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
        {children}
        {error && (
          <p role="alert" className="rounded border border-bearish/40 bg-bearish/10 px-3 py-2 text-xs text-bearish">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Please wait…' : submitLabel}
        </Button>
        <p className="text-center text-xs text-text-secondary">{footer}</p>
      </form>
    </div>
  )
}

/** A labelled input row. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-text-secondary">
      {label}
      {children}
    </label>
  )
}

/** A two-or-three way toggle (login method, register role). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-9 flex-1 rounded text-xs font-medium transition-colors md:h-7',
            value === option.value ? 'bg-neutral text-white' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
