/** Reconnect-safe Workspace baseline and increment producer. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-auth-local'
import { Deque } from '@deepseek-ai/dsh-deque'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import {
  workspaceDomainState,
  workspaceRecord,
  WorkspaceId,
} from '@deepseek-ai/dsh-workspace'
import type {
  WorkspaceBaseline,
  WorkspaceFollowFrame,
  WorkspaceView,
} from './types.ts'

/**
 * Project one authoritative Workspace entity into its Remote value.
 * @param workspace - authoritative registry entity.
 * @returns detached Workspace projection for Remote consumers.
 */
export function workspaceView(workspace: Workspace): WorkspaceView {
  return workspaceViewFor(workspace, undefined)
}

/**
 * Project one authoritative Workspace while hiding Sessions the caller does not own.
 * @param workspace - authoritative registry entity.
 * @param visibleSessionIds - Sessions the caller may see; omitted for the operator.
 * @returns detached Workspace projection for Remote consumers.
 */
export function workspaceViewFor(
  workspace: Workspace,
  visibleSessionIds: ReadonlySet<string> | undefined,
): WorkspaceView {
  return {
    workspaceId: workspace.id,
    path: workspace.path,
    title: workspace.title,
    sessionIds: workspace.sessionIds.filter(id =>
      visibleSessionIds === undefined || visibleSessionIds.has(String(id))),
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  }
}

/** Owns Workspace domain observation and all active follow generations. */
export class WorkspaceFeed {
  private readonly followers = new Set<WorkspaceFollower>()
  private knownIds: Set<string>
  private order: readonly string[]
  private archived: readonly string[]
  private pinned: readonly string[]

  /** @param ctx - Host context containing the authoritative Workspace registry. */
  constructor(private readonly ctx: Context) {
    const baseline = ctx.workspaceRegistry.list()
    this.knownIds = new Set(baseline.map(workspace => String(workspace.id)))
    this.order = baseline.map(workspace => String(workspace.id))
    this.archived = ctx.workspaceRegistry.archivedSessionIds.map(String)
    this.pinned = ctx.workspaceRegistry.pinnedSessionIds.map(String)
    ctx.on('domain/changed', (change: DomainChanged) => { this.changed(change) })
    ctx.effect(() => () => {
      for (const follower of this.followers) follower.close()
      this.followers.clear()
    }, 'workspace-controller.feed')
  }

  /**
   * Read the complete current projection synchronously.
   * @returns all active Workspaces plus archived and pinned Session identities.
   */
  baseline(): WorkspaceBaseline {
    return this.baselineFor(undefined)
  }

  /**
   * Read the current projection for one authenticated user.
   * @param ownerId - user whose Workspace memberships and Sessions are visible.
   * @returns Workspaces the user belongs to, with only that user's Sessions.
   */
  baselineFor(ownerId: string | undefined): WorkspaceBaseline {
    const visibleSessions = this.visibleSessionIds(ownerId)
    const visibleWorkspaces = this.visibleWorkspaceIds(ownerId)
    return {
      items: this.ctx.workspaceRegistry.list()
        .filter(workspace => visibleWorkspaces === undefined || visibleWorkspaces.has(String(workspace.id)))
        .map(workspace => workspaceViewFor(workspace, visibleSessions)),
      archivedSessionIds: this.ctx.workspaceRegistry.archivedSessionIds
        .filter(id => visibleSessions === undefined || visibleSessions.has(String(id))),
      pinnedSessionIds: this.ctx.workspaceRegistry.pinnedSessionIds
        .filter(id => visibleSessions === undefined || visibleSessions.has(String(id))),
    }
  }

  /**
   * Open one generation beginning with a complete baseline.
   * @param signal - generation cancellation.
   * @returns baseline followed by ordered Workspace increments.
   */
  async *follow(signal: AbortSignal, ownerId?: string): AsyncIterable<WorkspaceFollowFrame> {
    signal.throwIfAborted()
    const baseline = this.baselineFor(ownerId)
    const follower = new WorkspaceFollower(
      ownerId,
      baseline.items.map(item => String(item.workspaceId)),
      baseline.archivedSessionIds.map(String),
      baseline.pinnedSessionIds.map(String),
    )
    this.followers.add(follower)
    try {
      yield { type: 'baseline', value: baseline }
      yield* follower.read(signal)
    } finally {
      this.followers.delete(follower)
      follower.close()
    }
  }

  private changed(change: DomainChanged): void {
    if (change.domain !== 'workspace') return
    if (change.table === '') {
      if (change.operation !== 'put') return
      const state = workspaceDomainState.parse(change.value)
      const nextOrder = state.workspaceIds.map(String)
      const orderChanged = !sameStrings(this.order, nextOrder)
      for (const id of state.workspaceIds) {
        if (this.knownIds.has(id)) continue
        const workspace = this.ctx.workspaceRegistry.get(id)
        if (workspace === undefined) {
          throw new Error(`committed Workspace registry references missing Workspace "${id}"`)
        }
        this.knownIds.add(id)
        this.publish({ type: 'upsert', workspace: workspaceView(workspace) })
      }
      this.order = nextOrder
      if (orderChanged) this.publish({ type: 'order', workspaceIds: [...state.workspaceIds] })
      const nextArchived = state.archivedSessionIds.map(String)
      if (!sameStrings(this.archived, nextArchived)) {
        this.archived = nextArchived
        this.publish({ type: 'archived', archivedSessionIds: [...state.archivedSessionIds] })
      }
      const nextPinned = state.pinnedSessionIds.map(String)
      if (!sameStrings(this.pinned, nextPinned)) {
        this.pinned = nextPinned
        this.publish({ type: 'pinned', pinnedSessionIds: [...state.pinnedSessionIds] })
      }
      return
    }
    if (change.table !== 'workspaces') return
    if (change.operation === 'deleted') {
      if (!this.knownIds.delete(change.key)) return
      for (const follower of this.followers) follower.knownWorkspaceIds.delete(change.key)
      this.publish({ type: 'remove', workspaceId: WorkspaceId(change.key) })
      return
    }
    if (!this.knownIds.has(change.key)) return
    const record = workspaceRecord.parse(change.value)
    this.publish({
      type: 'upsert',
      workspace: {
        workspaceId: WorkspaceId(change.key),
        path: record.path,
        title: record.title,
        sessionIds: [...record.sessionIds],
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    })
  }

  private publish(frame: Exclude<WorkspaceFollowFrame, { readonly type: 'baseline' }>): void {
    for (const follower of this.followers) {
      const filtered = this.filterFrame(follower, frame)
      if (filtered !== undefined) follower.push(filtered)
    }
  }

  /**
   * Announce that one user adopted an existing Workspace.
   * @param ownerId - user that now belongs to the Workspace.
   * @param workspace - adopted Workspace.
   */
  claim(ownerId: string, workspace: Workspace): void {
    const view = workspaceViewFor(workspace, this.visibleSessionIds(ownerId))
    for (const follower of this.followers) {
      if (follower.ownerId !== ownerId) continue
      follower.knownWorkspaceIds.add(String(workspace.id))
      follower.push({ type: 'upsert', workspace: view })
      follower.pushOrder(this.order)
    }
  }

  /**
   * Announce that one user removed their Workspace membership.
   * @param ownerId - user leaving the Workspace.
   * @param workspaceId - Workspace identity to remove from that user's view.
   */
  release(ownerId: string, workspaceId: WorkspaceId): void {
    for (const follower of this.followers) {
      if (follower.ownerId !== ownerId) continue
      if (!follower.knownWorkspaceIds.delete(String(workspaceId))) continue
      follower.lastOrder = follower.lastOrder.filter(id => id !== String(workspaceId))
      follower.push({ type: 'remove', workspaceId })
    }
  }

  private filterFrame(
    follower: WorkspaceFollower,
    frame: Exclude<WorkspaceFollowFrame, { readonly type: 'baseline' }>,
  ): Exclude<WorkspaceFollowFrame, { readonly type: 'baseline' }> | undefined {
    if (follower.ownerId === undefined) return frame
    const ownerId = follower.ownerId
    switch (frame.type) {
      case 'upsert': {
        if (!this.workspaceMember(frame.workspace.workspaceId, ownerId)) return undefined
        follower.knownWorkspaceIds.add(String(frame.workspace.workspaceId))
        const visible = this.visibleSessionIds(ownerId)
        return {
          type: 'upsert',
          workspace: {
            ...frame.workspace,
            sessionIds: frame.workspace.sessionIds.filter(id =>
              visible === undefined || visible.has(String(id))),
          },
        }
      }
      case 'remove':
        if (!follower.knownWorkspaceIds.delete(String(frame.workspaceId))) return undefined
        follower.lastOrder = follower.lastOrder.filter(id => id !== String(frame.workspaceId))
        return frame
      case 'order': {
        const workspaceIds = frame.workspaceIds.filter(id => follower.knownWorkspaceIds.has(String(id)))
        const ordered = workspaceIds.map(String)
        if (sameStrings(follower.lastOrder, ordered)) return undefined
        follower.lastOrder = ordered
        return { type: 'order', workspaceIds: ordered.map(WorkspaceId) }
      }
      case 'archived': {
        const archivedSessionIds = frame.archivedSessionIds.filter(id =>
          this.sessionOwned(id, ownerId))
        if (sameStrings(follower.lastArchived, archivedSessionIds)) return undefined
        follower.lastArchived = archivedSessionIds.map(String)
        return { type: 'archived', archivedSessionIds }
      }
      case 'pinned': {
        const pinnedSessionIds = frame.pinnedSessionIds.filter(id => this.sessionOwned(id, ownerId))
        if (sameStrings(follower.lastPinned, pinnedSessionIds)) return undefined
        follower.lastPinned = pinnedSessionIds.map(String)
        return { type: 'pinned', pinnedSessionIds }
      }
    }
  }

  private workspaceMember(workspaceId: WorkspaceId | string, ownerId: string): boolean {
    return this.ctx.get('authLocal')?.workspaceMembers(String(workspaceId)).has(ownerId) === true
  }

  private sessionOwned(sessionId: WorkspaceId | string, ownerId: string): boolean {
    return this.ctx.get('authLocal')?.sessionOwner(String(sessionId)) === ownerId
  }

  private visibleSessionIds(ownerId: string | undefined): ReadonlySet<string> | undefined {
    return ownerId === undefined ? undefined : this.ctx.get('authLocal')?.ownedSessionIds(ownerId)
  }

  private visibleWorkspaceIds(ownerId: string | undefined): ReadonlySet<string> | undefined {
    return ownerId === undefined ? undefined : this.ctx.get('authLocal')?.ownedWorkspaceIds(ownerId)
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

class WorkspaceFollower {
  private readonly frames = new Deque<WorkspaceFollowFrame>()
  private waiting: (() => void) | undefined
  private closed = false

  /**
   * @param ownerId - user whose Workspace state this generation carries; omitted for the operator.
   * @param workspaceIds - Workspaces present in the generation baseline.
   * @param archivedSessionIds - archived Sessions present in the baseline.
   * @param pinnedSessionIds - pinned Sessions present in the baseline.
   */
  constructor(
    readonly ownerId: string | undefined,
    workspaceIds: readonly string[],
    public lastArchived: readonly string[],
    public lastPinned: readonly string[],
  ) {
    this.knownWorkspaceIds = new Set(workspaceIds)
    this.lastOrder = [...workspaceIds]
  }

  /** Workspaces present in this generation's baseline or claimed since then. */
  readonly knownWorkspaceIds: Set<string>

  /** Last filtered Workspace order delivered to this generation. */
  lastOrder: readonly string[]

  /** Deliver the current filtered Workspace order after a membership claim. */
  pushOrder(workspaceIds: readonly string[]): void {
    const filtered = workspaceIds.filter(id => this.knownWorkspaceIds.has(id))
    if (sameStrings(this.lastOrder, filtered)) return
    this.lastOrder = filtered
    this.push({ type: 'order', workspaceIds: filtered.map(WorkspaceId) })
  }

  push(frame: WorkspaceFollowFrame): void {
    /* v8 ignore next -- closed followers are removed before later publication can reach them. */
    if (this.closed) return
    this.frames.pushBack(frame)
    this.waiting?.()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.waiting?.()
  }

  async *read(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame> {
    while (!this.closed && !signal.aborted) {
      const frame = this.frames.popFront()
      if (frame !== undefined) {
        yield frame
        continue
      }
      await this.wait(signal)
    }
  }

  private wait(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        signal.removeEventListener('abort', finish)
        /* v8 ignore next -- one read owns the sole installed wait callback. */
        if (this.waiting === finish) this.waiting = undefined
        resolve()
      }
      this.waiting = finish
      signal.addEventListener('abort', finish, { once: true })
      /* v8 ignore next -- native signals and the private queue cannot change during this synchronous setup. */
      if (signal.aborted || this.closed || this.frames.size > 0) finish()
    })
  }
}
