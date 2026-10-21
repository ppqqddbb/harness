/**
 * Local authentication service for DeepSeek Harness.
 * Provides user management, password verification, and session handling.
 *
 * @module @deepseek-ai/dsh-auth-local
 */

import { randomBytes } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import bcrypt from 'bcryptjs'
import cookie from 'cookie'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** User record in database */
export interface AuthUser {
  id: number
  username: string
  passwordHash: string
  isAdmin: boolean
  createdAt: number
  /** Whether an administrator disabled this account. */
  disabled: boolean
  /** Last successful login time, or null before the first login. */
  lastLoginAt: number | null
}

/** Session-persistence surface read during the pre-account ownership backfill. */
interface BackfillSessionPersistence {
  list(): Promise<Array<{ header: { id: string } }>>
}

/** Workspace-registry surface read during the pre-account ownership backfill. */
interface BackfillWorkspaceRegistry {
  list(): Array<{ id: string }>
}

/** Authentication service configuration */
export interface AuthLocalConfig {
  enabled?: boolean
  cookieName?: string
  sessionDuration?: number
  dbPath?: string
  bcryptRounds?: number
}

/** Safe user fields returned to the administration UI. */
export interface ManagedAuthUser {
  id: number
  username: string
  isAdmin: boolean
  createdAt: number
  enabled: boolean
  lastLoginAt: number | null
  activeSessions: number
}

/** Creation outcome for an administrator-issued account. */
export type ManagedUserCreation =
  | { status: 'created'; user: ManagedAuthUser }
  | { status: 'username-exists' }
  | { status: 'password-exists' }

/** Result of changing one managed account's enabled state. */
export type ManagedUserUpdate =
  | { status: 'updated'; user: ManagedAuthUser }
  | { status: 'not-found' | 'self-target' | 'last-admin' }

/** Result of deleting one managed account. */
export type ManagedUserDeletion =
  | { status: 'deleted'; username: string }
  | { status: 'not-found' | 'self-target' | 'last-admin' }

/** Authentication service interface */
export interface AuthLocalService {
  /** Create a new user */
  createUser(username: string, password: string, isAdmin?: boolean): Promise<AuthUser | null>

  /** Create a user while reporting which unique credential collided */
  createManagedUser(username: string, password: string, isAdmin?: boolean): Promise<ManagedUserCreation>

  /** Verify user credentials */
  verifyUser(username: string, password: string): Promise<AuthUser | null>

  /** Create a new session for user */
  createSession(userId: number): string

  /** Validate session and return user */
  validateSession(sessionId: string): AuthUser | null

  /**
   * Resolve the login session carried by one request's Cookie header.
   * @param cookieHeader - raw Cookie header, when the request supplied one.
   * @returns the auth session id and user, or null when absent or expired.
   */
  authenticateCookie(cookieHeader: string | undefined): { sessionId: string; user: AuthUser } | null

  /** Delete a session */
  deleteSession(sessionId: string): void

  /** List all users */
  listUsers(): AuthUser[]

  /** Delete a user by username */
  deleteUser(username: string): boolean

  /** Enable or disable one managed account; disabling revokes its sessions. */
  setUserEnabled(userId: number, enabled: boolean, actorId: number): ManagedUserUpdate

  /** Permanently delete one managed account and revoke its sessions. */
  deleteManagedUser(userId: number, actorId: number): ManagedUserDeletion

  /** Change user password */
  changePassword(username: string, newPassword: string): Promise<boolean>

  /** Resolve the user that owns one Session, when ownership was recorded. */
  sessionOwner(sessionId: string): string | undefined

  /**
   * Claim one unowned Session for a user.
   * @returns `claimed` for a new claim, `owned` when the same user already
   * owns it, and `conflict` when another user owns it.
   */
  claimSession(sessionId: string, ownerId: string): 'claimed' | 'owned' | 'conflict'

  /**
   * Claim one unowned Session without overwriting an existing owner.
   * @returns whether this call inserted the ownership row.
   */
  claimSessionIfUnowned(sessionId: string, ownerId: string): boolean

  /** Session identities owned by one user. */
  ownedSessionIds(ownerId: string): Set<string>

  /** Record one user as a member of a Workspace. */
  claimWorkspace(workspaceId: string, ownerId: string): void

  /** Users that may list one Workspace. */
  workspaceMembers(workspaceId: string): Set<string>

  /** Workspace identities one user may list. */
  ownedWorkspaceIds(ownerId: string): Set<string>

  /**
   * Remove one user's Workspace membership.
   * @returns whether any member remains.
   */
  releaseWorkspace(workspaceId: string, ownerId: string): boolean

  /** Settles after the one-time legacy ownership backfill has finished. */
  whenOwnershipReady(): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    authLocal: AuthLocalService
  }

  interface Events {
    'ready'(): void
    'dispose'(): void
    'auth/user-created': (user: AuthUser) => void
    'auth/user-deleted': (username: string) => void
    'auth/login': (user: AuthUser) => void
    'auth/logout': (sessionId: string) => void
  }
}

export const name = 'auth-local'
export const inject = ['webServer']

export async function apply(ctx: Context, config: AuthLocalConfig = {}): Promise<void> {
  const {
    enabled = true,
    cookieName = 'dsh_session',
    sessionDuration = 604800, // 7 days in seconds
    dbPath = 'auth.db',
    bcryptRounds = 12,
  } = config

  if (!enabled) return

  const webServer = ctx.webServer
  const homePath = process.env.DSH_HOME || join(process.env.HOME || process.env.USERPROFILE || '.', '.dsh')
  const dbFilePath = isAbsolute(dbPath) ? dbPath : join(homePath, dbPath)

  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(dbFilePath)

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0,
      last_login_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `)

  const ensureColumn = (table: string, column: string, definition: string): void => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all()
    if (!columns.some(row => String(row.name) === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
    }
  }
  ensureColumn('auth_users', 'disabled', 'disabled INTEGER NOT NULL DEFAULT 0')
  ensureColumn('auth_users', 'last_login_at', 'last_login_at INTEGER')

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    )
  `)

  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON auth_sessions(expires_at)')

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_resource_owners (
      kind TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (kind, resource_id, user_id)
    )
  `)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_owners_single_session
      ON auth_resource_owners(kind, resource_id)
      WHERE kind = 'session'
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resource_owners_kind_user
      ON auth_resource_owners(kind, user_id)
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  const sessionCleanupInterval = setInterval(() => {
    const now = Date.now()
    const expired = db.prepare('SELECT id FROM auth_sessions WHERE expires_at < ?').all(now)
    for (const row of expired) service.deleteSession(String(row.id))
  }, 3600000)

  ctx.effect(() => () => {
    clearInterval(sessionCleanupInterval)
    db.close()
  })

  ctx.logger.info('[auth-local] Database initialized')

  const activeSessionCount = (userId: number): number => {
    const row = db.prepare(`
      SELECT COUNT(*) AS count FROM auth_sessions
      WHERE user_id = ? AND expires_at > ?
    `).get(userId, Date.now())
    return row === undefined ? 0 : Number(row.count)
  }

  const managedUserOf = (user: AuthUser): ManagedAuthUser => ({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
    enabled: !user.disabled,
    lastLoginAt: user.lastLoginAt,
    activeSessions: activeSessionCount(user.id),
  })

  /** Wire error code and status for a rejected account-management request. */
  const managementRejection = (status: 'not-found' | 'self-target' | 'last-admin'):
  { code: string; httpStatus: number } => {
    switch (status) {
      case 'not-found': return { code: 'user-not-found', httpStatus: 404 }
      case 'self-target': return { code: 'self-target', httpStatus: 409 }
      case 'last-admin': return { code: 'last-admin', httpStatus: 409 }
    }
  }

  const usernameExists = (username: string): boolean =>
    db.prepare('SELECT 1 AS found FROM auth_users WHERE username = ?').get(username) !== undefined

  /** Compare a candidate against every stored bcrypt hash; each hash carries its own salt. */
  const passwordExists = async (password: string): Promise<boolean> => {
    const rows = db.prepare('SELECT password_hash FROM auth_users').all()
    for (const row of rows) {
      if (await bcrypt.compare(password, String(row.password_hash))) return true
    }
    return false
  }

  const ownershipReady = Promise.withResolvers<void>()
  let ownershipBackfillStarted = false
  const OWNERSHIP_BACKFILL_KEY = 'resource-owners-backfilled-v1'

  const metaValue = (key: string): string | undefined => {
    const row = db.prepare('SELECT value FROM auth_meta WHERE key = ?').get(key)
    return row === undefined ? undefined : String(row.value)
  }

  const setMeta = (key: string, value: string): void => {
    db.prepare('INSERT OR REPLACE INTO auth_meta (key, value) VALUES (?, ?)').run(key, value)
  }

  const legacyOwnerId = (): string | undefined => {
    const row = db.prepare(`
      SELECT id FROM auth_users
      ORDER BY is_admin DESC, id ASC
      LIMIT 1
    `).get()
    return row === undefined ? undefined : String(row.id)
  }

  const backfillOwnership = async (): Promise<boolean> => {
    if (metaValue(OWNERSHIP_BACKFILL_KEY) !== undefined) {
      ownershipReady.resolve()
      return true
    }
    const ownerId = legacyOwnerId()
    if (ownerId === undefined) return false
    // These services live outside this package's dependency surface, so the
    // backfill reads them through the structural surfaces it actually uses.
    const sessionPersistence = ctx.get('sessionPersistence') as BackfillSessionPersistence | undefined
    const workspaceRegistry = ctx.get('workspaceRegistry') as BackfillWorkspaceRegistry | undefined
    if (sessionPersistence === undefined || workspaceRegistry === undefined) return false
    const sessions = await sessionPersistence.list()
    const insert = db.prepare(`
      INSERT OR IGNORE INTO auth_resource_owners (kind, resource_id, user_id, created_at)
      VALUES (?, ?, ?, ?)
    `)
    const now = Date.now()
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const session of sessions) insert.run('session', session.header.id, ownerId, now)
      for (const workspace of workspaceRegistry.list()) insert.run('workspace', workspace.id, ownerId, now)
      setMeta(OWNERSHIP_BACKFILL_KEY, ownerId)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    ctx.logger.info(`[auth-local] Assigned pre-account Sessions and Workspaces to user ${ownerId}`)
    ownershipReady.resolve()
    return true
  }

  const startOwnershipBackfill = (): void => {
    if (ownershipBackfillStarted) return
    ownershipBackfillStarted = true
    void backfillOwnership().then((completed) => {
      if (!completed) ownershipBackfillStarted = false
    }, (error: unknown) => {
      ownershipBackfillStarted = false
      ctx.logger.error('[auth-local] Ownership backfill failed:', error)
    })
  }

  ctx.inject(['sessionPersistence', 'workspaceRegistry'], () => { startOwnershipBackfill() })
  ctx.on('auth/user-created', () => { startOwnershipBackfill() })

  let managedCreation = Promise.resolve()

  const createManagedUser = async (
    username: string,
    password: string,
    isAdmin = false,
  ): Promise<ManagedUserCreation> => {
    if (usernameExists(username)) return { status: 'username-exists' }
    if (await passwordExists(password)) return { status: 'password-exists' }

    const passwordHash = await bcrypt.hash(password, bcryptRounds)
    const createdAt = Date.now()
    try {
      const result = db.prepare(`
        INSERT INTO auth_users (username, password_hash, is_admin, created_at)
        VALUES (?, ?, ?, ?)
      `).run(username, passwordHash, isAdmin ? 1 : 0, createdAt)
      const user: AuthUser = {
        id: Number(result.lastInsertRowid),
        username,
        passwordHash,
        isAdmin,
        createdAt,
        disabled: false,
        lastLoginAt: null,
      }
      ctx.emit('auth/user-created', user)
      return { status: 'created', user: managedUserOf(user) }
    } catch (error) {
      if (usernameExists(username)) return { status: 'username-exists' }
      throw error
    }
  }

  // Service methods
  const service: AuthLocalService = {
    async createUser(username: string, password: string, isAdmin = false): Promise<AuthUser | null> {
      try {
        const passwordHash = await bcrypt.hash(password, bcryptRounds)
        const createdAt = Date.now()

        const stmt = db.prepare(`
          INSERT INTO auth_users (username, password_hash, is_admin, created_at)
          VALUES (?, ?, ?, ?)
        `)

        const result = stmt.run(username, passwordHash, isAdmin ? 1 : 0, createdAt)

        const user: AuthUser = {
          id: result.lastInsertRowid as number,
          username,
          passwordHash,
          isAdmin,
          createdAt,
          disabled: false,
          lastLoginAt: null,
        }

        ctx.emit('auth/user-created', user)
        return user
      } catch {
        return null
      }
    },

    async createManagedUser(username: string, password: string, isAdmin = false): Promise<ManagedUserCreation> {
      const creation = managedCreation.then(() => createManagedUser(username, password, isAdmin))
      managedCreation = creation.then(() => undefined, () => undefined)
      return creation
    },

    async verifyUser(username: string, password: string): Promise<AuthUser | null> {
      ctx.logger.info(`[auth-local] Verifying user: ${username}`)
      const stmt = db.prepare('SELECT * FROM auth_users WHERE username = ?')
      const row = stmt.get(username)

      if (!row) {
        ctx.logger.warn(`[auth-local] User not found: ${username}`)
        return null
      }

      if (row.disabled === 1) {
        ctx.logger.warn(`[auth-local] Disabled account login rejected: ${username}`)
        return null
      }

      ctx.logger.info('[auth-local] User found, verifying password...')
      const isValid = await bcrypt.compare(password, String(row.password_hash))

      if (!isValid) {
        ctx.logger.warn(`[auth-local] Password verification failed for: ${username}`)
        return null
      }

      ctx.logger.info(`[auth-local] Password verified successfully for: ${username}`)
      return {
        id: Number(row.id),
        username: String(row.username),
        passwordHash: String(row.password_hash),
        isAdmin: row.is_admin === 1,
        createdAt: Number(row.created_at),
        disabled: false,
        lastLoginAt: row.last_login_at === null ? null : Number(row.last_login_at),
      }
    },

    createSession(userId: number): string {
      const sessionId = randomBytes(32).toString('hex')
      const createdAt = Date.now()
      const expiresAt = createdAt + sessionDuration * 1000

      const stmt = db.prepare(`
        INSERT INTO auth_sessions (id, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `)

      stmt.run(sessionId, userId, expiresAt, createdAt)
      return sessionId
    },

    validateSession(sessionId: string): AuthUser | null {
      const now = Date.now()

      const stmt = db.prepare(`
        SELECT u.* FROM auth_sessions s
        JOIN auth_users u ON s.user_id = u.id
        WHERE s.id = ? AND s.expires_at > ? AND u.disabled = 0
      `)

      const row = stmt.get(sessionId, now)
      if (row === undefined) return null

      return {
        id: Number(row.id),
        username: String(row.username),
        passwordHash: String(row.password_hash),
        isAdmin: row.is_admin === 1,
        createdAt: Number(row.created_at),
        disabled: row.disabled === 1,
        lastLoginAt: row.last_login_at === null ? null : Number(row.last_login_at),
      }
    },

    authenticateCookie(cookieHeader: string | undefined): { sessionId: string; user: AuthUser } | null {
      if (cookieHeader === undefined) return null
      const sessionId = cookie.parse(cookieHeader)[cookieName]
      if (sessionId === undefined) return null
      const user = service.validateSession(sessionId)
      return user === null ? null : { sessionId, user }
    },

    deleteSession(sessionId: string): void {
      const stmt = db.prepare('DELETE FROM auth_sessions WHERE id = ?')
      stmt.run(sessionId)
      ctx.emit('auth/logout', sessionId)
    },

    sessionOwner(sessionId: string): string | undefined {
      const row = db.prepare(`
        SELECT user_id FROM auth_resource_owners
        WHERE kind = 'session' AND resource_id = ?
        LIMIT 1
      `).get(sessionId)
      return row === undefined ? undefined : String(row.user_id)
    },

    claimSession(sessionId: string, ownerId: string): 'claimed' | 'owned' | 'conflict' {
      db.exec('BEGIN IMMEDIATE')
      try {
        const row = db.prepare(`
          SELECT user_id FROM auth_resource_owners
          WHERE kind = 'session' AND resource_id = ?
          LIMIT 1
        `).get(sessionId)
        if (row !== undefined) {
          const owner = String(row.user_id)
          db.exec('COMMIT')
          return owner === ownerId ? 'owned' : 'conflict'
        }
        db.prepare(`
          INSERT INTO auth_resource_owners (kind, resource_id, user_id, created_at)
          VALUES ('session', ?, ?, ?)
        `).run(sessionId, ownerId, Date.now())
        db.exec('COMMIT')
        return 'claimed'
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },

    claimSessionIfUnowned(sessionId: string, ownerId: string): boolean {
      const result = db.prepare(`
        INSERT OR IGNORE INTO auth_resource_owners (kind, resource_id, user_id, created_at)
        VALUES ('session', ?, ?, ?)
      `).run(sessionId, ownerId, Date.now())
      return result.changes > 0
    },

    ownedSessionIds(ownerId: string): Set<string> {
      const rows = db.prepare(`
        SELECT resource_id FROM auth_resource_owners
        WHERE kind = 'session' AND user_id = ?
      `).all(ownerId)
      return new Set(rows.map(row => String(row.resource_id)))
    },

    claimWorkspace(workspaceId: string, ownerId: string): void {
      db.prepare(`
        INSERT OR IGNORE INTO auth_resource_owners (kind, resource_id, user_id, created_at)
        VALUES ('workspace', ?, ?, ?)
      `).run(workspaceId, ownerId, Date.now())
    },

    workspaceMembers(workspaceId: string): Set<string> {
      const rows = db.prepare(`
        SELECT user_id FROM auth_resource_owners
        WHERE kind = 'workspace' AND resource_id = ?
      `).all(workspaceId)
      return new Set(rows.map(row => String(row.user_id)))
    },

    ownedWorkspaceIds(ownerId: string): Set<string> {
      const rows = db.prepare(`
        SELECT resource_id FROM auth_resource_owners
        WHERE kind = 'workspace' AND user_id = ?
      `).all(ownerId)
      return new Set(rows.map(row => String(row.resource_id)))
    },

    releaseWorkspace(workspaceId: string, ownerId: string): boolean {
      db.prepare(`
        DELETE FROM auth_resource_owners
        WHERE kind = 'workspace' AND resource_id = ? AND user_id = ?
      `).run(workspaceId, ownerId)
      const row = db.prepare(`
        SELECT 1 AS found FROM auth_resource_owners
        WHERE kind = 'workspace' AND resource_id = ?
        LIMIT 1
      `).get(workspaceId)
      return row !== undefined
    },

    whenOwnershipReady(): Promise<void> {
      startOwnershipBackfill()
      return ownershipReady.promise
    },

    listUsers(): AuthUser[] {
      const stmt = db.prepare('SELECT * FROM auth_users ORDER BY created_at ASC')
      const rows = stmt.all()

      return rows.map(row => ({
        id: Number(row.id),
        username: String(row.username),
        passwordHash: String(row.password_hash),
        isAdmin: row.is_admin === 1,
        createdAt: Number(row.created_at),
        disabled: row.disabled === 1,
        lastLoginAt: row.last_login_at === null ? null : Number(row.last_login_at),
      }))
    },

    setUserEnabled(userId: number, enabled: boolean, actorId: number): ManagedUserUpdate {
      const row = db.prepare('SELECT * FROM auth_users WHERE id = ?').get(userId)
      if (row === undefined) return { status: 'not-found' }
      if (Number(row.id) === actorId) return { status: 'self-target' }
      if (!enabled && row.is_admin === 1) {
        const otherAdmins = db.prepare(`
          SELECT COUNT(*) AS count FROM auth_users
          WHERE is_admin = 1 AND disabled = 0 AND id <> ?
        `).get(userId)
        if (otherAdmins === undefined || Number(otherAdmins.count) === 0) {
          return { status: 'last-admin' }
        }
      }
      db.prepare('UPDATE auth_users SET disabled = ? WHERE id = ?').run(enabled ? 0 : 1, userId)
      if (!enabled) {
        const sessions = db.prepare('SELECT id FROM auth_sessions WHERE user_id = ?').all(userId)
        for (const session of sessions) service.deleteSession(String(session.id))
      }
      const updated = db.prepare('SELECT * FROM auth_users WHERE id = ?').get(userId)
      if (updated === undefined) return { status: 'not-found' }
      return {
        status: 'updated',
        user: managedUserOf({
          id: Number(updated.id),
          username: String(updated.username),
          passwordHash: String(updated.password_hash),
          isAdmin: updated.is_admin === 1,
          createdAt: Number(updated.created_at),
          disabled: updated.disabled === 1,
          lastLoginAt: updated.last_login_at === null ? null : Number(updated.last_login_at),
        }),
      }
    },

    deleteManagedUser(userId: number, actorId: number): ManagedUserDeletion {
      const row = db.prepare('SELECT * FROM auth_users WHERE id = ?').get(userId)
      if (row === undefined) return { status: 'not-found' }
      if (Number(row.id) === actorId) return { status: 'self-target' }
      if (row.is_admin === 1 && row.disabled === 0) {
        const otherAdmins = db.prepare(`
          SELECT COUNT(*) AS count FROM auth_users
          WHERE is_admin = 1 AND disabled = 0 AND id <> ?
        `).get(userId)
        if (otherAdmins === undefined || Number(otherAdmins.count) === 0) {
          return { status: 'last-admin' }
        }
      }
      const username = String(row.username)
      const sessions = db.prepare('SELECT id FROM auth_sessions WHERE user_id = ?').all(userId)
      for (const session of sessions) service.deleteSession(String(session.id))
      db.prepare('DELETE FROM auth_resource_owners WHERE kind = ? AND user_id = ?').run('workspace', String(userId))
      db.prepare('DELETE FROM auth_users WHERE id = ?').run(userId)
      ctx.emit('auth/user-deleted', username)
      return { status: 'deleted', username }
    },

    deleteUser(username: string): boolean {
      const user = db.prepare('SELECT id FROM auth_users WHERE username = ?').get(username)
      if (user !== undefined) {
        const sessions = db.prepare('SELECT id FROM auth_sessions WHERE user_id = ?')
          .all(String(user.id))
        for (const session of sessions) service.deleteSession(String(session.id))
        db.prepare(`
          DELETE FROM auth_resource_owners WHERE kind = 'workspace' AND user_id = ?
        `).run(String(user.id))
      }
      const stmt = db.prepare('DELETE FROM auth_users WHERE username = ?')
      const result = stmt.run(username)
      const deleted = result.changes > 0

      if (deleted) {
        ctx.emit('auth/user-deleted', username)
      }

      return deleted
    },

    async changePassword(username: string, newPassword: string): Promise<boolean> {
      try {
        const passwordHash = await bcrypt.hash(newPassword, bcryptRounds)
        const stmt = db.prepare('UPDATE auth_users SET password_hash = ? WHERE username = ?')
        const result = stmt.run(passwordHash, username)
        return result.changes > 0
      } catch {
        return false
      }
    },
  }

  ctx.provide('authLocal', service)

  // Helper to read request body
  async function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (chunk: Buffer) => { data += chunk.toString() })
      req.on('end', () => { resolve(data) })
      req.on('error', reject)
    })
  }

  // Helper to parse cookies
  function parseCookies(req: IncomingMessage): Record<string, string> {
    const cookieHeader = req.headers.cookie
    return cookieHeader ? cookie.parse(cookieHeader) : {}
  }

  const requestUser = (req: IncomingMessage): AuthUser | null => {
    const sessionId = parseCookies(req)[cookieName]
    return sessionId === undefined ? null : service.validateSession(sessionId)
  }

  const sendJson = (res: ServerResponse, status: number, value: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(value))
  }

  const ADMIN_USERNAME_MAX = 64
  const ADMIN_PASSWORD_MIN = 8
  const ADMIN_PASSWORD_MAX = 128
  const AUTO_GENERATION_ATTEMPTS = 8

  const generatedUsername = (): string => `user_${randomBytes(4).toString('hex')}`
  const generatedPassword = (): string => randomBytes(12).toString('base64url')

  const validManualUsername = (value: string): boolean => {
    const trimmed = value.trim()
    return trimmed.length > 0 && trimmed.length <= ADMIN_USERNAME_MAX && !/\s/u.test(trimmed)
  }

  const validManualPassword = (value: string): boolean =>
    value.length >= ADMIN_PASSWORD_MIN && value.length <= ADMIN_PASSWORD_MAX

  const createGeneratedUser = async (): Promise<{ user: ManagedAuthUser; password: string } | null> => {
    for (let attempt = 0; attempt < AUTO_GENERATION_ATTEMPTS; attempt += 1) {
      const username = generatedUsername()
      const password = generatedPassword()
      const creation = await service.createManagedUser(username, password)
      if (creation.status === 'created') return { user: creation.user, password }
      // Both collisions are retryable for random credentials; the next attempt uses a fresh pair.
    }
    return null
  }

  // Register HTTP routes
  // POST /api/auth/login
  webServer.register({
    kind: 'exact',
    path: '/api/auth/login',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }

      try {
        const body = await readBody(req)
        const parsed: unknown = JSON.parse(body)
        if (typeof parsed !== 'object' || parsed === null
          || !('username' in parsed) || !('password' in parsed)
          || typeof parsed.username !== 'string' || typeof parsed.password !== 'string'
          || parsed.username.length === 0 || parsed.password.length === 0) {
          res.writeHead(400)
          res.end(JSON.stringify({ success: false, error: 'Username and password required' }))
          return
        }
        const { username, password } = parsed
        const remember = !('remember' in parsed) || parsed.remember !== false

        const user = await service.verifyUser(username, password)

        if (!user) {
          res.writeHead(401)
          res.end(JSON.stringify({ success: false, error: 'Invalid credentials' }))
          return
        }

        const loginAt = Date.now()
        db.prepare('UPDATE auth_users SET last_login_at = ? WHERE id = ?').run(loginAt, user.id)
        user.lastLoginAt = loginAt

        const previousSessionId = parseCookies(req)[cookieName]
        if (previousSessionId !== undefined) service.deleteSession(previousSessionId)
        const sessionId = service.createSession(user.id)

        ctx.emit('auth/login', user)

        res.setHeader('Set-Cookie', cookie.serialize(cookieName, sessionId, {
          httpOnly: true,
          sameSite: 'lax',
          ...(remember ? { maxAge: sessionDuration } : {}),
          path: '/',
        }))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          user: {
            username: user.username,
            isAdmin: user.isAdmin,
          },
        }))
      } catch (error) {
        ctx.logger.error('[auth-local] Login error:', error)
        res.writeHead(500)
        res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
      }
    },
  })

  // POST /api/auth/logout
  webServer.register({
    kind: 'exact',
    path: '/api/auth/logout',
    handler: (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }

      try {
        const cookies = parseCookies(req)
        const sessionId = cookies[cookieName]

        if (sessionId) {
          service.deleteSession(sessionId)
        }

        res.setHeader('Set-Cookie', cookie.serialize(cookieName, '', {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 0,
          path: '/',
        }))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } catch (error) {
        ctx.logger.error('[auth-local] Logout error:', error)
        res.writeHead(500)
        res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
      }
    },
  })

  // GET /api/auth/me
  webServer.register({
    kind: 'exact',
    path: '/api/auth/me',
    handler: (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }

      try {
        const cookies = parseCookies(req)
        const sessionId = cookies[cookieName]

        if (!sessionId) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ authenticated: false }))
          return
        }

        const user = service.validateSession(sessionId)

        if (!user) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ authenticated: false }))
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          authenticated: true,
          user: {
            username: user.username,
            isAdmin: user.isAdmin,
          },
        }))
      } catch (error) {
        ctx.logger.error('[auth-local] Auth check error:', error)
        res.writeHead(500)
        res.end(JSON.stringify({ authenticated: false, error: 'Internal server error' }))
      }
    },
  })

  // GET/POST/PATCH/DELETE /api/auth/admin/users
  webServer.register({
    kind: 'exact',
    path: '/api/auth/admin/users',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const method = req.method ?? ''
      if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
        sendJson(res, 405, { error: 'method-not-allowed' })
        return
      }

      try {
        const user = requestUser(req)
        if (user === null) {
          sendJson(res, 401, { error: 'unauthenticated' })
          return
        }
        if (!user.isAdmin) {
          sendJson(res, 403, { error: 'forbidden' })
          return
        }

        if (method === 'GET') {
          sendJson(res, 200, {
            users: service.listUsers().map(managedUserOf),
          })
          return
        }

        const parsed: unknown = JSON.parse(await readBody(req))
        if (method === 'PATCH') {
          if (typeof parsed !== 'object' || parsed === null
            || !('userId' in parsed) || !('enabled' in parsed)
            || typeof parsed.userId !== 'number' || !Number.isSafeInteger(parsed.userId)
            || typeof parsed.enabled !== 'boolean') {
            sendJson(res, 400, { error: 'invalid-request' })
            return
          }
          const result = service.setUserEnabled(parsed.userId, parsed.enabled, user.id)
          if (result.status !== 'updated') {
            const rejection = managementRejection(result.status)
            sendJson(res, rejection.httpStatus, { error: rejection.code })
            return
          }
          sendJson(res, 200, { user: result.user })
          return
        }
        if (method === 'DELETE') {
          if (typeof parsed !== 'object' || parsed === null
            || !('userId' in parsed)
            || typeof parsed.userId !== 'number' || !Number.isSafeInteger(parsed.userId)) {
            sendJson(res, 400, { error: 'invalid-request' })
            return
          }
          const result = service.deleteManagedUser(parsed.userId, user.id)
          if (result.status !== 'deleted') {
            const rejection = managementRejection(result.status)
            sendJson(res, rejection.httpStatus, { error: rejection.code })
            return
          }
          sendJson(res, 200, { deleted: true, username: result.username })
          return
        }
        if (typeof parsed !== 'object' || parsed === null || !('mode' in parsed)) {
          sendJson(res, 400, { error: 'invalid-request' })
          return
        }

        if (parsed.mode === 'auto') {
          const generated = await createGeneratedUser()
          if (generated === null) {
            sendJson(res, 409, { error: 'generation-conflict' })
            return
          }
          sendJson(res, 201, { user: generated.user, password: generated.password })
          return
        }

        if (parsed.mode !== 'manual'
          || !('username' in parsed) || !('password' in parsed)
          || typeof parsed.username !== 'string' || typeof parsed.password !== 'string') {
          sendJson(res, 400, { error: 'invalid-request' })
          return
        }

        const username = parsed.username.trim()
        const password = parsed.password
        if (!validManualUsername(username) || !validManualPassword(password)) {
          sendJson(res, 400, { error: 'invalid-credentials' })
          return
        }

        const creation = await service.createManagedUser(username, password)
        if (creation.status === 'username-exists') {
          sendJson(res, 409, { error: 'username-exists' })
          return
        }
        if (creation.status === 'password-exists') {
          sendJson(res, 409, { error: 'password-exists' })
          return
        }

        sendJson(res, 201, { user: creation.user, password })
      } catch (error) {
        ctx.logger.error('[auth-local] User administration error:', error)
        sendJson(res, 500, { error: 'internal-error' })
      }
    },
  })

  ctx.logger.info('[auth-local] HTTP routes registered')
}
