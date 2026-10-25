// @vitest-environment jsdom
/** Administrator visibility for the Settings user-management section. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-auth/client'

interface Identity {
  authenticated: boolean
  user?: { username: string; isAdmin: boolean }
}

async function bench(identity: Identity) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  ctx.slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(identity), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))
  vi.stubGlobal('fetch', fetchMock)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  document.head.querySelectorAll('style').forEach((style) => { style.remove() })
})

describe('ui-auth administrator settings section', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers the users section after Agent presets for an administrator', async () => {
    const { ctx, slots, fetchMock } = await bench({ authenticated: true, user: { username: 'admin', isAdmin: true } })

    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('settings.section')).toHaveLength(1) })

    expect(slots.entries('settings.section')[0]!.options).toMatchObject({ id: 'users', order: 25 })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' })
    expect(document.querySelector('#auth-container')).toBeNull()
  })

  it('registers nothing for a non-administrator', async () => {
    const { ctx, slots, fetchMock } = await bench({ authenticated: true, user: { username: 'member', isAdmin: false } })

    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalled() })

    expect(slots.entries('settings.section')).toHaveLength(0)
    expect(document.querySelector('#auth-container')).toBeNull()
  })

  it('renders the login gate instead of a settings section without a session', async () => {
    const { ctx, slots, fetchMock } = await bench({ authenticated: false })

    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(document.querySelector('#auth-container')).not.toBeNull() })

    expect(slots.entries('settings.section')).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' })
  })
})

describe('ui-auth local account login client', () => {
  async function mountLogin(respond: (url: string) => Promise<Response>) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString()
      if (url === '/api/auth/me') {
        return new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return respond(url)
    })
    vi.stubGlobal('fetch', fetchMock)
    document.body.innerHTML = '<div id="root"></div>'
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(document.querySelector('#auth-container form')).not.toBeNull() })
    const form = document.querySelector('#auth-container form')
    if (!(form instanceof HTMLFormElement)) throw new Error('login form was not rendered')
    const [username, password] = Array.from(form.querySelectorAll('input'))
    if (!(username instanceof HTMLInputElement) || !(password instanceof HTMLInputElement)) {
      throw new Error('login inputs were not rendered')
    }
    setInputValue(username, 'admin')
    setInputValue(password, 'admin123')
    return { ctx, form, fetchMock }
  }

  it('submits the absolute login route', async () => {
    const { ctx, form, fetchMock } = await mountLogin(async () => new Response(JSON.stringify({
      success: false,
      error: 'Invalid credentials',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } }))
    form.requestSubmit()
    await vi.waitFor(() => { expect(document.body.textContent).toContain('Invalid credentials') })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    }))
    await ctx.fiber.dispose()
  })

  it('reports a non-JSON rejection as a login failure', async () => {
    const { ctx, form } = await mountLogin(async () => new Response('unauthorized', { status: 401 }))
    form.requestSubmit()
    await vi.waitFor(() => { expect(document.body.textContent).toContain('Login failed') })
    await ctx.fiber.dispose()
  })

  it('reports a network failure', async () => {
    const { ctx, form } = await mountLogin(async () => { throw new Error('offline') })
    form.requestSubmit()
    await vi.waitFor(() => { expect(document.body.textContent).toContain('Network error') })
    await ctx.fiber.dispose()
  })
})

function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  if (typeof descriptor?.set !== 'function') throw new Error('HTMLInputElement value setter is unavailable')
  descriptor.set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
