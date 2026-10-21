/** Workspace command implementation and stable Remote failure mapping. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-auth-local'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import {
  WorkspaceActiveSessionError,
  WorkspaceArchivedSessionPinError,
  WorkspaceId,
  WorkspaceMoveInvalidError,
  WorkspaceOrderInvalidError,
  WorkspaceUnknownSessionError,
} from '@deepseek-ai/dsh-workspace'
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { workspaceViewFor } from './feed.ts'
import type { WorkspaceFeed } from './feed.ts'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {
  WorkspaceArchiveSessionRequest,
  WorkspaceArchiveValue,
  WorkspaceCreateRequest,
  WorkspaceCreateValue,
  WorkspaceDeleteRequest,
  WorkspaceDeleteValue,
  WorkspaceInsertBeforeRequest,
  WorkspaceInsertSessionBeforeRequest,
  WorkspaceOrderValue,
  WorkspacePinSessionRequest,
  WorkspacePinValue,
  WorkspaceRenameRequest,
  WorkspaceUnarchiveSessionRequest,
  WorkspaceUnpinSessionRequest,
  WorkspaceValue,
  WorkspaceView,
} from './types.ts'

/** Implements Workspace mutations against the authoritative registry. */
export class WorkspaceCommands {
  private operationTail = Promise.resolve()

  /**
   * @param ctx - Host context containing the Workspace registry.
   * @param feed - live projection used to announce per-user membership changes.
   */
  constructor(
    private readonly ctx: Context,
    private readonly feed: WorkspaceFeed,
  ) {}

  /**
   * Create or resolve one Workspace over an existing directory.
   * @param request - directory path to register.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns the Workspace and whether this call created it.
   */
  create(request: WorkspaceCreateRequest, ownerId?: string): Promise<WorkspaceCreateValue> {
    return this.enqueue(async () => {
      try {
        const existing = await this.ctx.workspaceRegistry.resolveByPath(request.path)
        if (existing !== undefined) {
          this.claim(existing, ownerId)
          return { workspace: this.view(existing, ownerId), created: false }
        }
        const workspace = await this.ctx.workspaceRegistry.create(request.path)
        this.claim(workspace, ownerId)
        return { workspace: this.view(workspace, ownerId), created: true }
      } catch (error) {
        if (remoteErrorOf(error) !== undefined) throw error
        throw new RemoteError(
          'workspace/invalid-path',
          `cannot create a Workspace at "${request.path}": ${errorMessage(error)}`,
          { path: request.path },
          { cause: error },
        )
      }
    })
  }

  /**
   * Rename one Workspace after serializing title ownership checks.
   * @param request - Workspace identity and proposed title.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns the updated Workspace projection.
   */
  rename(request: WorkspaceRenameRequest, ownerId?: string): Promise<WorkspaceValue> {
    const title = request.title.trim()
    if (title === '') {
      return Promise.reject(new RemoteError('gateway/bad-request', 'Workspace rename requires a non-blank title', {}))
    }
    return this.enqueue(async () => {
      const workspace = this.requireWorkspace(request.workspaceId)
      this.requireMember(workspace, ownerId)
      if (title !== workspace.title) {
        if (this.ctx.workspaceRegistry.list().some(candidate =>
          candidate.id !== workspace.id && candidate.title === title)) {
          throw new RemoteError(
            'workspace/name-conflict',
            `Workspace name '${title}' is already in use`,
            { name: title },
          )
        }
        await workspace.setTitle(title)
      }
      return { workspace: this.view(workspace, ownerId) }
    })
  }

  /**
   * Delete one Workspace registration without deleting its directory or Sessions.
   * @param request - Workspace identity to remove.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns deletion confirmation.
   */
  delete(request: WorkspaceDeleteRequest, ownerId?: string): Promise<WorkspaceDeleteValue> {
    return this.enqueue(async () => {
      const workspace = this.requireWorkspace(request.workspaceId)
      this.requireMember(workspace, ownerId)
      if (ownerId !== undefined) {
        const remaining = this.ctx.authLocal.releaseWorkspace(String(workspace.id), ownerId)
        this.feed.release(ownerId, workspace.id)
        if (remaining) return { deleted: true }
      }
      if (!await this.ctx.workspaceRegistry.delete(workspace.id)) {
        throw workspaceNotFound(request.workspaceId)
      }
      return { deleted: true }
    })
  }

  /**
   * Move one Workspace within the durable registry order.
   * @param request - moved Workspace and optional anchor.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns the complete resulting Workspace order.
   */
  async insertBefore(request: WorkspaceInsertBeforeRequest, ownerId?: string): Promise<WorkspaceOrderValue> {
    const workspace = this.requireWorkspace(request.workspaceId)
    this.requireMember(workspace, ownerId)
    if (request.beforeWorkspaceId !== undefined) {
      this.requireMember(this.requireWorkspace(request.beforeWorkspaceId), ownerId)
    }
    try {
      const workspaceIds = await this.ctx.workspaceRegistry.insertBefore(
        WorkspaceId(request.workspaceId),
        request.beforeWorkspaceId === undefined
          ? undefined
          : WorkspaceId(request.beforeWorkspaceId),
      )
      return { workspaceIds: this.visibleOrder(workspaceIds, ownerId) }
    } catch (error) {
      if (!(error instanceof WorkspaceOrderInvalidError)) throw error
      throw workspaceNotFound(error.workspaceId)
    }
  }

  /**
   * Move one accounted Session within a Workspace's manual order.
   * @param request - Workspace, Session, and optional anchor identities.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns the updated Workspace projection.
   */
  async insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest, ownerId?: string): Promise<WorkspaceValue> {
    const workspace = this.requireWorkspace(request.workspaceId)
    this.requireMember(workspace, ownerId)
    this.requireSession(request.sessionId, ownerId)
    if (request.beforeSessionId !== undefined) this.requireSession(request.beforeSessionId, ownerId)
    try {
      await workspace.insertSessionBefore(request.sessionId, request.beforeSessionId)
    } catch (error) {
      if (!(error instanceof WorkspaceMoveInvalidError)) throw error
      throw new RemoteError(
        'workspace/move-invalid',
        error.message,
        {
          workspaceId: request.workspaceId,
          sessionId: request.sessionId,
          ...request.beforeSessionId === undefined
            ? {}
            : { beforeSessionId: request.beforeSessionId },
        },
        { cause: error },
      )
    }
    return { workspace: this.view(workspace, ownerId) }
  }

  /**
   * Add one known Session to the registry-global archive set. Without
   * `stopActivity` a Session with running work is refused as
   * `workspace/session-active` with the activity the registry's providers
   * reported; with it, the providers stop that work first.
   * @param request - Session identity to archive and whether to stop its work.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns the complete resulting archive set.
   */
  async archiveSession(request: WorkspaceArchiveSessionRequest, ownerId?: string): Promise<WorkspaceArchiveValue> {
    this.requireSession(request.sessionId, ownerId)
    try {
      await this.ctx.workspaceRegistry.archiveSession(
        request.sessionId,
        request.stopActivity === true ? { stopActivity: true } : {},
      )
    } catch (error) {
      if (error instanceof WorkspaceUnknownSessionError) {
        throw new RemoteError('session/not-found', error.message, { sessionId: request.sessionId }, { cause: error })
      }
      if (error instanceof WorkspaceActiveSessionError) {
        throw new RemoteError(
          'workspace/session-active',
          error.message,
          { sessionId: request.sessionId, activity: error.activity },
          { cause: error },
        )
      }
      throw error
    }
    return { archivedSessionIds: this.visibleSessions(this.ctx.workspaceRegistry.archivedSessionIds, ownerId) }
  }

  /**
   * Drop one Session from the registry-global archive set. An id that is not
   * archived is not an error: the call is idempotent, so a lost race with
   * another surface resolves as a no-op.
   * @param request - Session identity to unarchive.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns the complete resulting archive set.
   */
  async unarchiveSession(request: WorkspaceUnarchiveSessionRequest, ownerId?: string): Promise<WorkspaceArchiveValue> {
    this.requireSession(request.sessionId, ownerId)
    await this.ctx.workspaceRegistry.unarchiveSession(request.sessionId)
    return { archivedSessionIds: this.visibleSessions(this.ctx.workspaceRegistry.archivedSessionIds, ownerId) }
  }

  /**
   * Add one known unarchived Session to the registry-global pin set.
   * @param request - Session identity to pin.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns the complete resulting pin set, most recently pinned first.
   */
  async pinSession(request: WorkspacePinSessionRequest, ownerId?: string): Promise<WorkspacePinValue> {
    this.requireSession(request.sessionId, ownerId)
    try {
      await this.ctx.workspaceRegistry.pinSession(request.sessionId)
    } catch (error) {
      if (error instanceof WorkspaceUnknownSessionError) {
        throw new RemoteError('session/not-found', error.message, { sessionId: request.sessionId }, { cause: error })
      }
      if (error instanceof WorkspaceArchivedSessionPinError) {
        throw new RemoteError('gateway/bad-request', error.message, {}, { cause: error })
      }
      throw error
    }
    return { pinnedSessionIds: this.visibleSessions(this.ctx.workspaceRegistry.pinnedSessionIds, ownerId) }
  }

  /**
   * Drop one Session from the registry-global pin set. An id that is not
   * pinned is not an error: the call is idempotent, so a lost race with
   * another surface resolves as a no-op.
   * @param request - Session identity to unpin.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns the complete resulting pin set, most recently pinned first.
   */
  async unpinSession(request: WorkspaceUnpinSessionRequest, ownerId?: string): Promise<WorkspacePinValue> {
    this.requireSession(request.sessionId, ownerId)
    await this.ctx.workspaceRegistry.unpinSession(request.sessionId)
    return { pinnedSessionIds: this.visibleSessions(this.ctx.workspaceRegistry.pinnedSessionIds, ownerId) }
  }

  private requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(workspaceId))
    if (workspace === undefined) throw workspaceNotFound(workspaceId)
    return workspace
  }

  private requireMember(workspace: Workspace, ownerId: string | undefined): void {
    if (ownerId === undefined) return
    if (!this.ctx.authLocal.workspaceMembers(String(workspace.id)).has(ownerId)) {
      throw workspaceNotFound(workspace.id)
    }
  }

  private requireSession(sessionId: string, ownerId: string | undefined): void {
    if (ownerId === undefined) return
    if (this.ctx.authLocal.sessionOwner(sessionId) !== ownerId) {
      throw new RemoteError('session/not-found', `session "${sessionId}" not found`, {
        sessionId: sessionId as SessionId,
      })
    }
  }

  private claim(workspace: Workspace, ownerId: string | undefined): void {
    if (ownerId === undefined) return
    this.ctx.authLocal.claimWorkspace(String(workspace.id), ownerId)
    this.feed.claim(ownerId, workspace)
  }

  private view(workspace: Workspace, ownerId: string | undefined): WorkspaceView {
    return workspaceViewFor(workspace, this.visibleSessionIds(ownerId))
  }

  private visibleSessionIds(ownerId: string | undefined): ReadonlySet<string> | undefined {
    return ownerId === undefined ? undefined : this.ctx.authLocal.ownedSessionIds(ownerId)
  }

  private visibleSessions(ids: readonly SessionId[], ownerId: string | undefined): SessionId[] {
    const visible = this.visibleSessionIds(ownerId)
    return ids.filter(id => visible === undefined || visible.has(String(id)))
  }

  private visibleOrder(ids: readonly WorkspaceId[], ownerId: string | undefined): WorkspaceId[] {
    if (ownerId === undefined) return [...ids]
    const owned = this.ctx.authLocal.ownedWorkspaceIds(ownerId)
    return ids.filter(id => owned.has(String(id)))
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => undefined, () => undefined)
    return result
  }
}

function workspaceNotFound(workspaceId: WorkspaceId): RemoteError<'workspace/not-found'> {
  return new RemoteError(
    'workspace/not-found',
    `Workspace "${workspaceId}" not found`,
    { workspaceId },
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
