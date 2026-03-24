import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AppHeader } from '#/components/AppHeader'
import { authClient } from '#/lib/auth-client'
import { useTheme } from '#/lib/theme'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function SettingsPage() {
  const { data: session, isPending } = authClient.useSession()
  const { theme, setTheme } = useTheme()
  const [soundEnabled, setSoundEnabled] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('soundEnabled') !== 'false' : true,
  )
  const [soundVolume, setSoundVolume] = useState(() =>
    typeof window !== 'undefined' ? parseInt(localStorage.getItem('soundVolume') ?? '50') : 50,
  )

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
      <div className="fc-settings-page">
        <h1 className="fc-settings-page-title">Settings</h1>

        {/* General section */}
        <div className="fc-settings-card">
          <div className="fc-settings-section-header">General</div>

          <div className="fc-settings-item">
            <div className="fc-settings-item-info">
              <span className="fc-settings-item-label">Sound effects</span>
              <span className="fc-settings-item-desc">
                Play sounds on correct and wrong answers
              </span>
            </div>
            <button
              className={`fc-toggle${soundEnabled ? ' fc-toggle--on' : ''}`}
              onClick={() => {
                const next = !soundEnabled
                setSoundEnabled(next)
                localStorage.setItem('soundEnabled', String(next))
              }}
              aria-label="Toggle sound effects"
            >
              <span className="fc-toggle-knob" />
            </button>
          </div>

          {soundEnabled && (
            <div className="fc-settings-item fc-settings-item--sub">
              <div className="fc-settings-item-info">
                <span className="fc-settings-item-label">Volume</span>
              </div>
              <div className="fc-settings-volume-control">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={soundVolume}
                  className="fc-volume-slider"
                  onChange={(e) => {
                    const val = parseInt(e.target.value)
                    setSoundVolume(val)
                    localStorage.setItem('soundVolume', String(val))
                  }}
                />
                <span className="fc-settings-volume-val">{soundVolume}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Appearance section */}
        <div className="fc-settings-card">
          <div className="fc-settings-section-header">Appearance</div>

          <div className="fc-settings-item">
            <div className="fc-settings-item-info">
              <span className="fc-settings-item-label">Dark mode</span>
              <span className="fc-settings-item-desc">
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
