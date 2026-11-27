import { useRef, useState, type FormEvent } from 'react'
import { Icon } from './App'

type AuthMode = 'signin' | 'signup'

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.27v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.62H1.27a12 12 0 0 0 0 10.76l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  )
}

export function DisabledAccountView({
  email,
  theme,
  onToggleTheme,
  onSignOut,
}: {
  email?: string | null
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onSignOut: () => Promise<void> | void
}) {
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await onSignOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="login-page">
      <header className="login-topbar">
        <button
          type="button"
          className="btn secondary login-theme-btn"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </header>

      <main className="login-center">
        <div className="login-brand">
          <img src="/app-icon.svg?v=3" alt="Smog Monitor" className="brand-icon-img" />
          <strong>Smog Monitor</strong>
        </div>

        <section className="login-glass-card login-disabled-card" role="alert">
          <div className="login-disabled-head">
            <Icon name="shield" size={16} />
            <h1>Account disabled</h1>
          </div>
          <p className="login-card-subtitle">
            {email
              ? `Access for ${email} has been disabled by an administrator.`
              : 'Your account has been disabled by an administrator.'}{' '}
            Sign out to switch to another account.
          </p>
          <button
            type="button"
            className="btn login-primary-btn"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
          >
            <Icon name="logOut" size={16} />
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </section>
      </main>
    </div>
  )
}

export default function LoginPage({
  theme,
  onToggleTheme,
  onSignInWithGoogle,
  onSignInWithEmail,
  onSignUpWithEmail,
  onResetPassword,
  authError,
  loading = false,
}: {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onSignInWithGoogle: () => Promise<void> | void
  onSignInWithEmail: (email: string, password: string, rememberMe: boolean) => Promise<void> | void
  onSignUpWithEmail: (name: string, email: string, password: string, rememberMe: boolean) => Promise<void> | void
  onResetPassword: (email: string) => Promise<void> | void
  authError?: string | null
  loading?: boolean
}) {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [resetNotice, setResetNotice] = useState('')
  const emailInputRef = useRef<HTMLInputElement>(null)

  const busy = loading || submitting || googleBusy || resetBusy
  const visibleError = localError || authError || ''
  const visibleNotice = !visibleError ? resetNotice : ''

  function switchMode(next: AuthMode) {
    setMode(next)
    setLocalError('')
    setResetNotice('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanEmail = email.trim()
    if (!cleanEmail) {
      setLocalError('Enter your email address')
      emailInputRef.current?.focus()
      return
    }
    setLocalError('')
    setResetNotice('')
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        await onSignInWithEmail(cleanEmail, password, rememberMe)
      } else {
        await onSignUpWithEmail(name.trim(), cleanEmail, password, rememberMe)
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogleSignIn() {
    setLocalError('')
    setResetNotice('')
    setGoogleBusy(true)
    try {
      await onSignInWithGoogle()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Google sign-in failed')
    } finally {
      setGoogleBusy(false)
    }
  }

  async function handleForgotPassword() {
    const cleanEmail = email.trim()
    if (!cleanEmail) {
      setResetNotice('')
      setLocalError('Enter your email address first to reset your password')
      emailInputRef.current?.focus()
      return
    }
    setLocalError('')
    setResetNotice('')
    setResetBusy(true)
    try {
      await onResetPassword(cleanEmail)
      setResetNotice('Password reset email sent')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to send password reset email')
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="login-page">
      <header className="login-topbar">
        <button
          type="button"
          className="btn secondary login-theme-btn"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </header>

      <main className="login-center">
        <div className="login-brand">
          <img src="/app-icon.svg?v=3" alt="Smog Monitor" className="brand-icon-img" />
          <strong>Smog Monitor</strong>
        </div>

        <section className="login-glass-card" aria-label={mode === 'signin' ? 'Sign in' : 'Create account'}>
          <div className="login-card-head">
            <h1>{mode === 'signin' ? 'Welcome back' : 'Create an account'}</h1>
            <p className="login-card-subtitle">
              {mode === 'signin'
                ? 'Sign in to pick up where you left off.'
                : 'Sign up to monitor your cities and threshold alerts.'}
            </p>
          </div>

          {visibleError && (
            <div className="notice error-notice login-card-notice" role="alert">
              <Icon name="warning" size={16} />
              <span>{visibleError}</span>
            </div>
          )}

          {visibleNotice && (
            <div className="notice login-card-notice login-reset-notice" role="status">
              <Icon name="check" size={16} />
              <span>{visibleNotice}</span>
            </div>
          )}

          <form className="login-form" onSubmit={(e) => void handleSubmit(e)}>
            {mode === 'signup' && (
              <label className="field login-field">
                <span>Full name</span>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                />
              </label>
            )}

            <label className="field login-field">
              <span>Email address</span>
              <input
                ref={emailInputRef}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (localError) setLocalError('')
                }}
                required
              />
            </label>

            <label className="field login-field">
              <span>Password</span>
              <input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>

            <div className="login-options-row">
              <label className="checkbox-label login-remember-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>

              {mode === 'signin' && (
                <button
                  type="button"
                  className="login-link-btn"
                  disabled={busy}
                  onClick={() => void handleForgotPassword()}
                >
                  {resetBusy ? 'Sending…' : 'Forgot?'}
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn login-primary-btn"
              disabled={busy}
            >
              {submitting
                ? mode === 'signin'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          <div className="login-divider" aria-hidden="true">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn login-google-btn"
            disabled={busy}
            onClick={() => void handleGoogleSignIn()}
          >
            <GoogleMark />
            <span>{googleBusy ? 'Connecting to Google…' : 'Continue with Google'}</span>
          </button>

          <p className="login-switch-row">
            {mode === 'signin' ? 'New to Smog Monitor?' : 'Already have an account?'}{' '}
            <button
              type="button"
              className="login-link-btn"
              disabled={busy}
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </section>

        <p className="login-caption">
          Real-time US AQI, 72-hour smog forecasts, and threshold email alerts.
        </p>
      </main>
    </div>
  )
}
