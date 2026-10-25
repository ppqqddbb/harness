/** Login form for the local-account gate. */
import { useState, type FormEvent } from 'react'
import { en, zh } from './locales.ts'

const copy = navigator.language.toLowerCase().startsWith('zh') ? zh : en

interface LoginResponse {
  success?: boolean
  error?: string
}

/** Sign in through the Web profile's local-account endpoint. */
async function login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })

    const data = await res.json().catch(() => undefined) as LoginResponse | undefined

    if (res.ok && data?.success === true) {
      return { success: true }
    }

    return { success: false, error: data?.error ?? copy.loginFailed }
  } catch {
    return { success: false, error: copy.networkError }
  }
}

/** Login page component. */
export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
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
