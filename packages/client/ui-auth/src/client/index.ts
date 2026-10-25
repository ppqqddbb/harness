/**
 * Client-side authentication UI plugin.
 * Renders login page and manages authentication state.
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { usersEn, usersZh, type UsersKey } from './locales.ts'
import { LoginPage } from './LoginPage.tsx'
import { UsersSection } from './UsersSection.tsx'

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
      const res = await fetch('/api/auth/me', { credentials: 'include' })
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
