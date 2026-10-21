/** Administrator-only account routes over the real auth service and HTTP server. */
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { WebRoute, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { apply, type AuthLocalConfig } from '../src/index.ts'

const contexts: Context[] = []
const servers: Server[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.allSettled(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined || error === null) resolve()
      else reject(error)
    })
  })))
  await Promise.allSettled(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

interface Harness {
  ctx: Context
  origin: string
  close(): Promise<void>
  cookie(username: string): Promise<string>
  request(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }>
}

/** Boot the real plugin against one temporary database and one real HTTP listener. */
async function harness(config: AuthLocalConfig = {}): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-auth-admin-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  const routes: WebRoute[] = []
  const webServer: Pick<WebServer, 'register'> = {
    register(route: WebRoute) {
      routes.push(route)
      return () => { routes.splice(routes.indexOf(route), 1) }
    },
  }
  ctx.provide('webServer', webServer as WebServer)
  await ctx.plugin({ inject: ['webServer'], apply }, { dbPath: join(root, 'auth.db'), bcryptRounds: 4, ...config }).await()

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname
    const route = routes.find(candidate => candidate.path === path)
    if (route === undefined) {
      response.writeHead(404)
      response.end()
      return
    }
    void route.handler(request, response)
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`

  const request = async (path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> => {
    const response = await fetch(`${origin}${path}`, init)
    return { status: response.status, body: await response.json() as Record<string, unknown> }
  }

  const cookie = async (username: string): Promise<string> => {
    const password = `${username}-password`
    const created = await ctx.authLocal.createManagedUser(username, password, username === 'admin')
    expect(created.status).toBe('created')
    const response = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const setCookie = response.headers.get('set-cookie')
    if (setCookie === null) throw new Error('login did not set a session cookie')
    return setCookie.split(';')[0] ?? ''
  }

  return {
    ctx,
    origin,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined || error === null) resolve()
        else reject(error)
      })
    }),
    cookie,
    request,
  }
}

describe('auth-local administrator account routes', () => {
  it('rejects missing sessions and non-administrators', async () => {
    const auth = await harness()
    const member = await auth.cookie('member')

    await expect(auth.request('/api/auth/admin/users')).resolves.toMatchObject({ status: 401 })
    await expect(auth.request('/api/auth/admin/users', { headers: { cookie: member } }))
      .resolves.toMatchObject({ status: 403 })
    await expect(auth.request('/api/auth/admin/users', {
      method: 'POST',
      headers: { cookie: member, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'auto' }),
    })).resolves.toMatchObject({ status: 403 })
  })

  it('lists safe account fields for an administrator', async () => {
    const auth = await harness()
    const admin = await auth.cookie('admin')

    const listed = await auth.request('/api/auth/admin/users', { headers: { cookie: admin } })
    expect(listed.status).toBe(200)
    expect(listed.body).toMatchObject({
      users: [{ username: 'admin', isAdmin: true }],
    })
    expect(JSON.stringify(listed.body)).not.toContain('passwordHash')
  })

  it('generates a unique account and returns its password once', async () => {
    const auth = await harness()
    const admin = await auth.cookie('admin')

    const created = await auth.request('/api/auth/admin/users', {
      method: 'POST',
      headers: { cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'auto' }),
    })
    expect(created.status).toBe(201)
    const user = created.body.user as { username: string; isAdmin: boolean }
    const password = created.body.password as string
    expect(user.isAdmin).toBe(false)
    expect(user.username).toMatch(/^user_[0-9a-f]{8}$/u)
    expect(password.length).toBeGreaterThan(0)
    await expect(auth.ctx.authLocal.verifyUser(user.username, password)).resolves.toMatchObject({ username: user.username })
  })

  it('rejects duplicate usernames and duplicate passwords', async () => {
    const auth = await harness()
    const admin = await auth.cookie('admin')
    const create = (username: string, password: string) => auth.request('/api/auth/admin/users', {
      method: 'POST',
      headers: { cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'manual', username, password }),
    })

    await expect(create('alice', 'alice-secret')).resolves.toMatchObject({ status: 201 })
    await expect(create('alice', 'another-secret')).resolves.toMatchObject({
      status: 409,
      body: { error: 'username-exists' },
    })
    await expect(create('bob', 'alice-secret')).resolves.toMatchObject({
      status: 409,
      body: { error: 'password-exists' },
    })
  })

  it('reports enabled state, last sign-in, and active sessions', async () => {
    const auth = await harness()
    const admin = await auth.cookie('admin')

    const listed = await auth.request('/api/auth/admin/users', { headers: { cookie: admin } })
    const users = listed.body.users as Array<Record<string, unknown>>
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({ username: 'admin', enabled: true, activeSessions: 1 })
    expect(typeof users[0]?.lastLoginAt).toBe('number')
  })

  it('disables an account and invalidates its live session', async () => {
    const auth = await harness()
    const admin = await auth.cookie('admin')
    const member = await auth.cookie('member')
    const memberId = auth.ctx.authLocal.listUsers().find(user => user.username === 'member')?.id
    if (memberId === undefined) throw new Error('member was not created')

    await expect(auth.request('/api/auth/me', { headers: { cookie: member } }))
      .resolves.toMatchObject({ status: 200, body: { authenticated: true } })

    const disabled = await auth.request('/api/auth/admin/users', {
      method: 'PATCH',
      headers: { cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: memberId, enabled: false }),
    })
    expect(disabled.status).toBe(200)
    expect((disabled.body.user as Record<string, unknown>).enabled).toBe(false)

    await expect(auth.request('/api/auth/me', { headers: { cookie: member } }))
      .resolves.toMatchObject({ status: 200, body: { authenticated: false } })
    await expect(auth.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'member', password: 'member-password' }),
    })).resolves.toMatchObject({ status: 401 })
    await expect(auth.ctx.authLocal.verifyUser('member', 'member-password')).resolves.toBeNull()

    const enabled = await auth.request('/api/auth/admin/users', {
      method: 'PATCH',
      headers: { cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: memberId, enabled: true }),
    })
    expect((enabled.body.user as Record<string, unknown>).enabled).toBe(true)
    await expect(auth.ctx.authLocal.verifyUser('member', 'member-password'))
      .resolves.toMatchObject({ username: 'member' })
  })

  it('refuses self-targeted and last-administrator destructive actions', async () => {
    const auth = await harness()
    const admin = await auth.cookie('admin')
    const adminId = auth.ctx.authLocal.listUsers().find(user => user.username === 'admin')?.id
    if (adminId === undefined) throw new Error('admin was not created')

    await expect(auth.request('/api/auth/admin/users', {
      method: 'PATCH',
      headers: { cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: adminId, enabled: false }),
    })).resolves.toMatchObject({ status: 409, body: { error: 'self-target' } })

    await expect(auth.request('/api/auth/admin/users', {
      method: 'DELETE',
      headers: { cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: adminId }),
    })).resolves.toMatchObject({ status: 409, body: { error: 'self-target' } })
  })

  it('deletes an account and its sessions', async () => {
    const auth = await harness()
    const admin = await auth.cookie('admin')
    const member = await auth.cookie('member')
    const memberId = auth.ctx.authLocal.listUsers().find(user => user.username === 'member')?.id
    if (memberId === undefined) throw new Error('member was not created')

    await expect(auth.request('/api/auth/admin/users', {
      method: 'DELETE',
      headers: { cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: memberId }),
    })).resolves.toMatchObject({ status: 200, body: { deleted: true, username: 'member' } })

    await expect(auth.request('/api/auth/me', { headers: { cookie: member } }))
      .resolves.toMatchObject({ status: 200, body: { authenticated: false } })
    const listed = await auth.request('/api/auth/admin/users', { headers: { cookie: admin } })
    const usernames = (listed.body.users as Array<{ username: string }>).map(user => user.username)
    expect(usernames).not.toContain('member')

    await expect(auth.request('/api/auth/admin/users', {
      method: 'DELETE',
      headers: { cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: memberId }),
    })).resolves.toMatchObject({ status: 404, body: { error: 'user-not-found' } })
  })

  it('rejects status changes from non-administrators', async () => {
    const auth = await harness()
    const admin = await auth.cookie('admin')
    const member = await auth.cookie('member')
    const adminId = auth.ctx.authLocal.listUsers().find(user => user.username === 'admin')?.id
    if (adminId === undefined) throw new Error('admin was not created')
    void admin

    await expect(auth.request('/api/auth/admin/users', {
      method: 'PATCH',
      headers: { cookie: member, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: adminId, enabled: false }),
    })).resolves.toMatchObject({ status: 403 })
    await expect(auth.request('/api/auth/admin/users', {
      method: 'DELETE',
      headers: { cookie: member, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: adminId }),
    })).resolves.toMatchObject({ status: 403 })
  })

  it('validates manual credential lengths', async () => {
    const auth = await harness()
    const admin = await auth.cookie('admin')

    await expect(auth.request('/api/auth/admin/users', {
      method: 'POST',
      headers: { cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'manual', username: 'short', password: 'short' }),
    })).resolves.toMatchObject({ status: 400, body: { error: 'invalid-credentials' } })
  })
})
