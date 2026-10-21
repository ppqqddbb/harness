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
    expect(fetchMock).toHaveBeenCalledWith('api/auth/me', { credentials: 'include' })
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
    expect(fetchMock).toHaveBeenCalledWith('api/auth/me', { credentials: 'include' })
  })
})
