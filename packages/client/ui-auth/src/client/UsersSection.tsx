/** Administrator-only account management inside Settings. */
import { Fragment, useEffect, useId, useState, type FormEvent } from 'react'
import { Button, Input, SegmentedControl, Tag, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsersKey } from './locales.ts'
import css from './UsersSection.module.css'

/** Safe account fields returned by the administration API. */
interface ManagedUser {
  id: number
  username: string
  isAdmin: boolean
  createdAt: number
  enabled: boolean
  lastLoginAt: number | null
  activeSessions: number
}

interface UsersResponse {
  users?: ManagedUser[]
  error?: string
}

interface CreationResponse {
  user?: ManagedUser
  password?: string
  error?: string
}

interface UpdateResponse {
  user?: ManagedUser
  error?: string
}

interface DeletionResponse {
  deleted?: boolean
  error?: string
}

type CreationMode = 'auto' | 'manual'

/** Props supplied by the settings section renderer. */
export type UsersSectionProps = PropsLocale<'settings.users'>

type FailureKey = Extract<UsersKey,
  | 'loadFailed' | 'createFailed' | 'usernameExists' | 'passwordExists'
  | 'invalidCredentials' | 'generationConflict' | 'forbidden' | 'actionFailed'
  | 'userNotFound' | 'selfTarget' | 'lastAdmin'>

const failureKey = (error: string | undefined, fallback: FailureKey): FailureKey => {
  switch (error) {
    case 'username-exists': return 'usernameExists'
    case 'password-exists': return 'passwordExists'
    case 'invalid-credentials': return 'invalidCredentials'
    case 'generation-conflict': return 'generationConflict'
    case 'forbidden': return 'forbidden'
    case 'user-not-found': return 'userNotFound'
    case 'self-target': return 'selfTarget'
    case 'last-admin': return 'lastAdmin'
    default: return fallback
  }
}

/** Format a stored epoch millisecond timestamp in the browser locale. */
function formatCreatedAt(value: number): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

/** Month/day and time only, so the roster row stays within the settings width. */
function formatShortTimestamp(value: number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Render the administrator account list, status controls, and creation form.
 * @param props.t - localized user-management copy.
 * @returns the User management settings page.
 */
export function UsersSection({ t }: UsersSectionProps) {
  const modeId = useId()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<FailureKey | null>(null)
  const [mode, setMode] = useState<CreationMode>('auto')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')

  const loadUsers = async (): Promise<void> => {
    setLoading(true)
    setFailure(null)
    try {
      const response = await fetch('/api/auth/admin/users', { credentials: 'include' })
      const data = await response.json() as UsersResponse
      if (!response.ok || data.users === undefined) {
        setFailure(failureKey(data.error, 'loadFailed'))
        return
      }
      setUsers(data.users)
    } catch {
      setFailure('loadFailed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadUsers() }, [])

  const changeMode = (next: CreationMode): void => {
    setMode(next)
    setFailure(null)
  }

  const createUser = async (body: Record<string, unknown>): Promise<void> => {
    setCreating(true)
    setFailure(null)
    setCredentials(null)
    setCopied('idle')
    try {
      const response = await fetch('/api/auth/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await response.json() as CreationResponse
      const user = data.user
      if (!response.ok || user === undefined) {
        setFailure(failureKey(data.error, 'createFailed'))
        return
      }
      setUsers(previous => [...previous, user])
      setCredentials({ username: user.username, password: data.password ?? password })
      if (mode === 'manual') {
        setUsername('')
        setPassword('')
      }
    } catch {
      setFailure('createFailed')
    } finally {
      setCreating(false)
    }
  }

  const changeEnabled = async (user: ManagedUser, enabled: boolean): Promise<void> => {
    if (!enabled && !window.confirm(t('confirmDisable'))) return
    setBusyId(user.id)
    setFailure(null)
    try {
      const response = await fetch('/api/auth/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: user.id, enabled }),
      })
      const data = await response.json() as UpdateResponse
      const updated = data.user
      if (!response.ok || updated === undefined) {
        setFailure(failureKey(data.error, 'actionFailed'))
        return
      }
      setUsers(previous => previous.map(item => item.id === updated.id ? updated : item))
    } catch {
      setFailure('actionFailed')
    } finally {
      setBusyId(null)
    }
  }

  const deleteUser = async (user: ManagedUser): Promise<void> => {
    if (!window.confirm(t('confirmDelete'))) return
    setBusyId(user.id)
    setFailure(null)
    try {
      const response = await fetch('/api/auth/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await response.json() as DeletionResponse
      if (!response.ok || data.deleted !== true) {
        setFailure(failureKey(data.error, 'actionFailed'))
        return
      }
      setUsers(previous => previous.filter(item => item.id !== user.id))
      if (expandedId === user.id) setExpandedId(null)
    } catch {
      setFailure('actionFailed')
    } finally {
      setBusyId(null)
    }
  }

  const submitManual = (event: FormEvent): void => {
    event.preventDefault()
    void createUser({ mode: 'manual', username, password })
  }

  const copyCredentials = async (): Promise<void> => {
    if (credentials === null) return
    const accepted = await writeClipboard([credentials.username, credentials.password].join('\n'))
    setCopied(accepted ? 'copied' : 'failed')
  }

  return (
    <div className={css.section}>
      <h2 className={css.heading}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      <h3 className={css.subheading}>{t('listTitle')}</h3>
      {loading ? <p className={css.muted}>{t('listLoading')}</p> : users.length === 0 ? (
        <p className={css.muted}>{t('listEmpty')}</p>
      ) : (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th scope="col">{t('columnUser')}</th>
                <th scope="col">{t('columnRole')}</th>
                <th scope="col">{t('columnStatus')}</th>
                <th scope="col">{t('columnLastLogin')}</th>
                <th scope="col">{t('columnSessions')}</th>
                <th scope="col">{t('columnActions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const busy = busyId === user.id
                const expanded = expandedId === user.id
                return (
                  <Fragment key={user.id}>
                    <tr className={user.enabled ? undefined : css.disabledRow}>
                      <td>
                        <button
                          type="button"
                          className={css.userToggle}
                          aria-expanded={expanded}
                          onClick={() => { setExpandedId(expanded ? null : user.id) }}
                        >
                          <span className={css.chevron} aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                          <span className={css.username}>{user.username}</span>
                        </button>
                      </td>
                      <td>
                        <Tag tone={user.isAdmin ? 'info' : 'outline'}>
                          {t(user.isAdmin ? 'roleAdmin' : 'roleUser')}
                        </Tag>
                      </td>
                      <td>
                        <Tag tone={user.enabled ? 'success' : 'danger'}>
                          {t(user.enabled ? 'statusEnabled' : 'statusDisabled')}
                        </Tag>
                      </td>
                      <td className={css.created}>
                        {user.lastLoginAt === null ? t('never') : formatShortTimestamp(user.lastLoginAt)}
                      </td>
                      <td>{user.activeSessions}</td>
                      <td className={css.actions}>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => { void changeEnabled(user, !user.enabled) }}
                        >
                          {t(user.enabled ? 'disable' : 'enable')}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className={css.dangerAction}
                          disabled={busy}
                          onClick={() => { void deleteUser(user) }}
                        >
                          {t('delete')}
                        </Button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className={css.detailsRow}>
                        <td colSpan={6}>
                          <dl className={css.details}>
                            <dt>{t('accountId')}</dt><dd>{user.id}</dd>
                            <dt>{t('columnCreated')}</dt><dd>{formatCreatedAt(user.createdAt)}</dd>
                            <dt>{t('columnLastLogin')}</dt>
                            <dd>{user.lastLoginAt === null ? t('never') : formatCreatedAt(user.lastLoginAt)}</dd>
                            <dt>{t('columnSessions')}</dt><dd>{user.activeSessions}</dd>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 className={css.subheading}>{t('createTitle')}</h3>
      <SegmentedControl<CreationMode>
        id={modeId}
        value={mode}
        label={t('createTitle')}
        options={[
          { value: 'auto', label: t('autoTab') },
          { value: 'manual', label: t('manualTab') },
        ]}
        onChange={changeMode}
        disabled={creating}
      />

      {mode === 'auto' ? (
        <div
          id={`${modeId}-auto-panel`}
          role="tabpanel"
          aria-labelledby={`${modeId}-auto`}
          className={css.panel}
        >
          <p className={css.muted}>{t('autoHint')}</p>
          <Button variant="primary" disabled={creating} onClick={() => { void createUser({ mode: 'auto' }) }}>
            {t(creating ? 'creating' : 'generate')}
          </Button>
        </div>
      ) : (
        <form
          id={`${modeId}-manual-panel`}
          role="tabpanel"
          aria-labelledby={`${modeId}-manual`}
          className={css.panel}
          onSubmit={submitManual}
        >
          <p className={css.muted}>{t('manualHint')}</p>
          <label className={css.field}>
            <span className={css.label}>{t('username')}</span>
            <Input
              value={username}
              placeholder={t('usernamePlaceholder')}
              autoComplete="off"
              disabled={creating}
              onChange={(event) => { setUsername(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            <span className={css.label}>{t('password')}</span>
            <Input
              type="password"
              value={password}
              placeholder={t('passwordPlaceholder')}
              autoComplete="new-password"
              disabled={creating}
              onChange={(event) => { setPassword(event.target.value) }}
            />
          </label>
          <div>
            <Button variant="primary" type="submit" disabled={creating}>
              {t(creating ? 'creating' : 'create')}
            </Button>
          </div>
        </form>
      )}

      {failure !== null && <p className={css.error} role="alert">{t(failure)}</p>}

      {credentials !== null && (
        <div className={css.credentials} role="status">
          <div className={css.credentialsTitle}>{t('credentialsTitle')}</div>
          <p className={css.muted}>{t('credentialsHint')}</p>
          <dl className={css.pairs}>
            <dt>{t('username')}</dt><dd>{credentials.username}</dd>
            <dt>{t('password')}</dt><dd className={css.secret}>{credentials.password}</dd>
          </dl>
          <Button variant="outline" size="sm" onClick={() => { void copyCredentials() }}>
            {t(copied === 'copied' ? 'copied' : copied === 'failed' ? 'copyFailed' : 'copy')}
          </Button>
        </div>
      )}
    </div>
  )
}
