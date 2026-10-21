/** General Settings action that ends the local Web authentication session. */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SignOutRow.module.css'

/**
 * Render the local-session sign-out action in Web builds.
 * @param props - runtime share and localized copy.
 * @returns the General Settings row, or nothing in the Desktop renderer.
 */
export function SignOutRow({ t }: PropsRuntime<'settings.general.item'> & PropsLocale<'settings'>) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if ('dshDesktop' in globalThis) return null

  const signOut = async (): Promise<void> => {
    setBusy(true)
    setFailed(false)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      if (!response.ok) throw new Error(`sign-out request failed with status ${String(response.status)}`)
      window.location.reload()
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return <div className={css.row}>
    <div>
      <div className={css.title}>{t('signOut.title')}</div>
      <div className={css.description}>{t('signOut.description')}</div>
      {failed && <div className={css.error} role="alert">{t('signOut.error')}</div>}
    </div>
    <Button variant="outline" disabled={busy} onClick={() => { void signOut() }}>
      {t(busy ? 'signOut.busy' : 'signOut.action')}
    </Button>
  </div>
}
