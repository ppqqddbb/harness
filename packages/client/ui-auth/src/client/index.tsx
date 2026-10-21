/**
 * Client-side authentication UI plugin.
 * Renders login page and manages authentication state.
 */

import { useState, type FormEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { en, usersEn, usersZh, zh, type UsersKey } from './locales.ts'
import { UsersSection } from './UsersSection.tsx'

const copy = navigator.language.toLowerCase().startsWith('zh') ? zh : en

interface LoginResponse {
  success?: boolean
  error?: string
}

interface AuthStatusResponse {
  authenticated?: boolean
  user?: {
    username: string
    isAdmin: boolean
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Administrator account-management copy. */
    'settings.users': UsersKey
  }
}

/** Login with username and password */
async function login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })

    const data = await res.json() as LoginResponse

    if (res.ok && data.success) {
      return { success: true }
    }

    return { success: false, error: data.error || copy.loginFailed }
  } catch {
    return { success: false, error: copy.networkError }
  }
}


/** Login page component */
function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(username, password)

    if (result.success) {
      onSuccess()
    } else {
      setError(result.error || copy.loginFailed)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0A0D12 0%, #161D2B 100%)',
      padding: '1rem',
    }}>
      <div style={{
        background: '#0F131C',
        borderRadius: '16px',
        padding: '2.5rem',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '2rem',
        }}>
          <h1 style={{
            fontSize: '1.875rem',
            fontWeight: '600',
            color: '#ffffff',
            marginBottom: '0.5rem',
            letterSpacing: '-0.02em',
          }}>
            {copy.title}
          </h1>
          <p style={{
            fontSize: '0.875rem',
            color: 'rgba(255, 255, 255, 0.6)',
          }}>
            {copy.subtitle}
          </p>
        </div>

        <form onSubmit={(event) => { void handleSubmit(event) }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: 'rgba(255, 255, 255, 0.9)',
              marginBottom: '0.5rem',
            }}>
              {copy.username}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value) }}
              required
              autoComplete="username"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: '#1E2636',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.9375rem',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(56, 189, 248, 0.5)' }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)' }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: 'rgba(255, 255, 255, 0.9)',
              marginBottom: '0.5rem',
            }}>
              {copy.password}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value) }}
              required
              autoComplete="current-password"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: '#1E2636',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.9375rem',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(56, 189, 248, 0.5)' }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)' }}
            />
          </div>

          {error && (
            <div style={{
              padding: '0.75rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#fca5a5',
              fontSize: '0.875rem',
              marginBottom: '1.25rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.875rem',
              background: loading ? 'rgba(56, 189, 248, 0.5)' : '#38BDF8',
              color: '#ffffff',
              border: 'none',
              borderRadius: '999px',
              fontSize: '0.9375rem',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = '#0EA5E9'
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = '#38BDF8'
            }}
          >
            {loading ? copy.signingIn : copy.signIn}
          </button>
        </form>
      </div>
    </div>
  )
}


/** Cordis plugin name */
export const name = 'ui-auth:client'

/** Settings and locale services used by the administrator-only section. */
export const inject = ['slots', 'locale']

/** Register authentication UI as early interceptor */
export function apply(ctx: Context): void {
  // Check authentication before the app fully loads
  let authChecked = false
  let isAuthenticated = false
  let isAdmin = false

  // Early check function
  const earlyAuthCheck = async () => {
    if (authChecked) return isAuthenticated

    try {
      const res = await fetch('api/auth/me', { credentials: 'include' })
      const data = await res.json() as AuthStatusResponse
      isAuthenticated = data.authenticated === true
      isAdmin = data.user?.isAdmin === true
      authChecked = true
      return isAuthenticated
    } catch {
      isAuthenticated = false
      isAdmin = false
      authChecked = true
      return false
    }
  }

  // Hook into the earliest possible point
  let interceptorInstalled = false

  // Install auth UI if not authenticated
  const installAuthUI = async () => {
    if (interceptorInstalled) return
    interceptorInstalled = true

    const authenticated = await earlyAuthCheck()

    if (authenticated && isAdmin) {
      registerUsersSection()
      return
    }

    if (!authenticated) {
      // Block the main app from rendering
      const style = document.createElement('style')
      style.textContent = '#root { display: none !important; }'
      document.head.appendChild(style)

      // Create auth container
      const authContainer = document.createElement('div')
      authContainer.id = 'auth-container'
      document.body.appendChild(authContainer)

      // Dynamically import React and render login page
      const React = await import('react')
      const ReactDOM = await import('react-dom/client')
      const root = ReactDOM.createRoot(authContainer)

      const handleLoginSuccess = () => {
        // Remove auth UI
        authContainer.remove()
        style.remove()

        // Reload to start the main app
        window.location.reload()
      }

      root.render(React.createElement(LoginPage, { onSuccess: handleLoginSuccess }))
    }
  }

  // Install immediately
  void installAuthUI()

  /** Register the administrator-only settings section after identity is known. */
  function registerUsersSection(): void {
    const NS = 'settings.users'
    ctx.effect(() => ctx.locale.register(NS, { zh: usersZh, en: usersEn }), 'ui-auth: user-management dictionaries')
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'users',
      order: 25,
      label: () => ctx.locale.bind(NS)('nav'),
      locale: NS,
    }, UsersSection))
  }
}
