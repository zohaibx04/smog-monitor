import { useState } from 'react'
import { Icon, type IconName } from './App'

const AQI_SCALE: { label: string; range: string; tone: string }[] = [
  { label: 'Good', range: '0–50', tone: 'var(--aqi-good)' },
  { label: 'Moderate', range: '51–100', tone: 'var(--aqi-moderate)' },
  { label: 'Sensitive groups', range: '101–150', tone: 'var(--aqi-sensitive)' },
  { label: 'Unhealthy', range: '151–200', tone: 'var(--aqi-unhealthy)' },
  { label: 'Very unhealthy', range: '201–300', tone: 'var(--aqi-very-unhealthy)' },
  { label: 'Hazardous', range: '301+', tone: 'var(--aqi-hazardous)' },
]

const CAPABILITIES: { icon: IconName; label: string }[] = [
  { icon: 'activity', label: 'Real-time US AQI, PM2.5 & PM10' },
  { icon: 'clock', label: '72-hour forecast & best outdoor window' },
  { icon: 'bell', label: 'Proactive threshold & email alerts' },
]

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
        <div className="login-brand">
          <img src="/app-icon.svg?v=3" alt="Smog Monitor" className="brand-icon-img" />
          <strong>Smog Monitor</strong>
        </div>
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

      <div className="login-disabled-wrap">
        <section className="card login-disabled-card" role="alert">
          <div className="login-disabled-head">
            <Icon name="shield" size={16} />
            <h1>Account disabled</h1>
          </div>
          <p className="login-subtitle">
            {email
              ? `Access for ${email} has been disabled by an administrator.`
              : 'Your account has been disabled by an administrator.'}{' '}
            Sign out to switch to another Google account.
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
          >
            <Icon name="logOut" size={16} />
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </section>
      </div>
    </div>
  )
}

export default function LoginPage({
  theme,
  onToggleTheme,
  onSignIn,
  authError,
  loading = false,
}: {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onSignIn: () => Promise<void> | void
  authError?: string | null
  loading?: boolean
}) {
  const [signingIn, setSigningIn] = useState(false)

  async function handleGoogleSignIn() {
    setSigningIn(true)
    try {
      await onSignIn()
    } finally {
      setSigningIn(false)
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

      <main className="login-grid">
        <section className="login-panel" aria-label="Sign in">
          <div className="login-wordmark">
            <img src="/app-icon.svg?v=3" alt="" className="brand-icon-img" />
            <span>Smog Monitor</span>
          </div>
          <h1>Proactive air quality monitoring and alerts</h1>
          <p className="login-subtitle">
            Monitor real-time US AQI, PM2.5, PM10, 72-hour forecasts, and personalized threshold alerts across your saved cities.
          </p>

          {authError && (
            <div className="notice error-notice login-error" role="alert">
              <Icon name="warning" size={16} />
              <span>{authError}</span>
            </div>
          )}

          <div className="login-actions">
            <button
              type="button"
              className="btn primary login-google-btn"
              disabled={signingIn || loading}
              onClick={() => void handleGoogleSignIn()}
            >
              <GoogleMark />
              <span>{signingIn ? 'Signing in…' : 'Continue with Google'}</span>
            </button>
            <p className="login-note">Sign in with your Google account to continue</p>
          </div>
        </section>

        <aside className="card login-preview-card" aria-label="Telemetry overview">
          <div className="login-preview-head">
            <div>
              <h2>US EPA Air Quality Index</h2>
              <p>Six-band health reference scale</p>
            </div>
            <span className="login-preview-tag mono">US AQI</span>
          </div>

          <ul className="login-scale-list">
            {AQI_SCALE.map(band => (
              <li key={band.label} className="login-scale-row">
                <span className="login-scale-swatch" style={{ backgroundColor: band.tone }} aria-hidden="true" />
                <span className="login-scale-label">{band.label}</span>
                <span className="login-scale-range mono">{band.range}</span>
              </li>
            ))}
          </ul>

          <ul className="login-capabilities">
            {CAPABILITIES.map(item => (
              <li key={item.label} className="login-capability-row">
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </div>
  )
}
