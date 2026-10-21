import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-auth-local'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, describe, expect, it } from 'vitest'
import SessionController from '../src/index.ts'
import { testSessionPersistence } from './test-remote.ts'

const roots = new Set<Context>()

afterEach(async () => {
  await Promise.all([...roots].map(ctx => ctx.fiber.dispose()))
  roots.clear()
})

function peer(id: string): PeerScope {
  return {
    id: id as PeerScope['id'],
    ctx: new Context(),
    principal: { id, username: id, isAdmin: false },
    dispose: () => Promise.resolve(),
  }
}

function ownership() {
  const sessions = new Map<string, string>()
  return {
    whenOwnershipReady: () => Promise.resolve(),
    sessionOwner: (sessionId: string) => sessions.get(sessionId),
    claimSession: (sessionId: string, ownerId: string) => {
      const existing = sessions.get(sessionId)
      if (existing === undefined) {
        sessions.set(sessionId, ownerId)
        return 'claimed'
      }
      return existing === ownerId ? 'owned' : 'conflict'
    },
    claimSessionIfUnowned: (sessionId: string, ownerId: string) => {
      if (sessions.has(sessionId)) return false
      sessions.set(sessionId, ownerId)
      return true
    },
    ownedSessionIds: (ownerId: string) => new Set(
      [...sessions].filter(([, owner]) => owner === ownerId).map(([sessionId]) => sessionId),
    ),
    claimWorkspace: () => {},
    workspaceMembers: () => new Set<string>(),
    ownedWorkspaceIds: () => new Set<string>(),
    releaseWorkspace: () => false,
    own: (sessionId: string, ownerId: string) => { sessions.set(sessionId, ownerId) },
  }
}

async function harness() {
  const ctx = new Context()
  roots.add(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(TypertGatewayService)
  const owned = ownership()
  ctx.provide('authLocal', owned as never)
  const sessionId = SessionId('owned-by-a')
  const session = ctx.sessions.create(sessionId, { meta: { cwd: '/workspace' } })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'only user A may read this' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  const throughSeq = session.seq - 1
  owned.own(String(sessionId), 'user-a')
  ctx.provide('sessionPersistence', testSessionPersistence(ctx, {
    list: () => Promise.resolve([session.header]),
    inspect: () => Promise.resolve({
      meta: session.header,
      inheritedEventCount: 0,
      events: session.snapshotEvents(),
    }),
  }) as never)
  new SessionProjectionRegistry(ctx)
  ctx.provide('sessionQuery', {
    listSessions: () => Promise.resolve([{
      header: session.header,
      revision: 'fixture',
    }]),
    observeSession: async () => ({
      header: session.header,
      events: session.snapshotEvents(),
      projections: { asOfSeq: 0, values: {} },
      [Symbol.dispose]: () => {},
    }),
    readEvent: () => Promise.reject(new Error('not used')),
  } as never)
  ctx.provide('workspaceRegistry', {
    get: () => undefined,
    list: () => [],
    archivedSessionIds: [],
    pinnedSessionIds: [],
    forgetSession: () => Promise.resolve(),
  } as never)
  ctx.provide('llm', {
    listModels: () => Promise.resolve([]),
    listProviders: () => Promise.resolve([]),
  } as never)
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'fixture', model: 'fixture' }),
    saveSelection: () => Promise.resolve(),
  } as never)
  ctx.provide('attachments', {
    imageLimits: {
      maxImageBytes: 1, maxImagesPerMessage: 1, maxMessageImageBytes: 1,
      maxImagePixels: 1, maxImageDimension: 1, mediaTypes: [],
    },
    admitPromptContent: (content: unknown) => Promise.resolve(content),
  } as never)
  ctx.provide('fileUploads', {
    registerAgentResolver: () => () => {},
    resolve: () => undefined,
    bindPrompt: () => ({ commit: () => {}, [Symbol.dispose]: () => {} }),
    retirePrompt: () => {},
  } as never)
  new SessionController(ctx, {})
  return { ctx, owned, sessionId, throughSeq }
}

describe('Session ownership across Gateway calls', () => {
  it('hides, refuses, and keeps one user\'s Session isolated from another', async () => {
    const { ctx, owned, sessionId, throughSeq } = await harness()
    const userA = peer('user-a')
    const userB = peer('user-b')

    await expect(ctx.typertGateway.invoke({
      namespace: 'session',
      method: 'list',
      args: {},
      peer: userA,
    })).resolves.toEqual({ items: [expect.objectContaining({ sessionId })] })

    await expect(ctx.typertGateway.invoke({
      namespace: 'session',
      method: 'list',
      args: {},
      peer: userB,
    })).resolves.toEqual({ items: [] })

    for (const method of ['page', 'projections', 'rename', 'delete', 'fork', 'attachment']) {
      const args = method === 'page'
        ? { request: { address: { kind: 'session', sessionId }, throughSeq, maxMessages: 10 } }
        : method === 'projections'
          ? { request: { sessionId } }
          : method === 'rename'
            ? { request: { sessionId, title: 'stolen' } }
            : method === 'delete'
              ? { request: { sessionId } }
              : method === 'fork'
                ? { request: { sessionId } }
                : { request: { sessionId, attachmentId: 'missing' } }
      await expect(ctx.typertGateway.invoke({
        namespace: 'session',
        method,
        args,
        peer: userB,
      })).rejects.toMatchObject({ code: 'session/not-found' })
    }

    await expect(ctx.typertGateway.invoke({
      namespace: 'session',
      method: 'page',
      args: {
        request: { address: { kind: 'session', sessionId }, throughSeq, maxMessages: 10 },
      },
      peer: userA,
    })).resolves.toMatchObject({
      records: [expect.objectContaining({ event: expect.objectContaining({ type: 'user/message' }) })],
    })
    expect(owned.sessionOwner(String(sessionId))).toBe('user-a')
  })
})
