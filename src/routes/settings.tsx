import { createFileRoute, Link } from '@tanstack/react-router'
import { AppHeader } from '#/components/AppHeader'
import { authClient } from '#/lib/auth-client'
import { useTheme } from '#/lib/theme'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function SettingsPage() {
  const { data: session, isPending } = authClient.useSession()
  const { theme, setTheme } = useTheme()

  if (isPending) {
    return (
      <div className="fc-app fc-auth-loading">
        <div className="fc-auth-spinner" />
      </div>
    )
  }

  if (!session?.user) {
    return (
      <div className="fc-app">
        <div className="fc-profile-noauth">
          <div className="fc-profile-noauth-char">设</div>
          <h2 className="fc-profile-noauth-title">Sign in to access settings</h2>
          <Link
            to="/"
            className="fc-start-btn"
            style={{ display: 'inline-block', textDecoration: 'none' }}
          >
            ← Back to flashcards
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-social-container">
        <h1 className="fc-social-title" style={{ marginBottom: 16 }}>
          Settings
        </h1>

        <div className="fc-social-section">
          <div className="fc-social-section-title">Appearance</div>
          <div className="fc-settings-row">
            <div className="fc-settings-row-info">
              <span className="fc-settings-row-label">Dark mode</span>
              <span className="fc-settings-row-desc">
                Switch between light and dark theme
              </span>
            </div>
            <button
              className={`fc-toggle${theme === 'dark' ? ' fc-toggle--on' : ''}`}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle dark mode"
            >
              <span className="fc-toggle-knob" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
