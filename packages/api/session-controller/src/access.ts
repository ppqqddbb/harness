/**
 * Request-principal checks and durable ownership for user-visible Sessions.
 * The operator (no authenticated principal) keeps the pre-account behavior.
 * @module @deepseek-ai/dsh-api-session-controller/src/access
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-auth-local'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'

/** Session ownership policy for one Host composition. */
export class SessionAccess {
  /** @param ctx - Host context that may provide durable ownership storage. */
  constructor(private readonly ctx: Context) {}

  /**
   * Read the authenticated user id carried by any Host boundary that holds a
   * Peer directly, such as an exact Fetch route.
   * @param peer - admitted Peer, or undefined for an in-process caller.
   * @returns the user id, or undefined for the operator.
   */
  static ownerIdOf(peer: PeerScope | undefined): string | undefined {
    return peer?.principal?.id
  }

  /**
   * Test one Session against a Peer obtained outside a Remote invocation.
   * @param peer - admitted Peer, or undefined for an in-process caller.
   * @param sessionId - durable Session identity.
   * @returns whether that Peer may read or mutate the Session.
   */
  canPeerAccess(peer: PeerScope | undefined, sessionId: SessionId | string): boolean {
    const ownerId = SessionAccess.ownerIdOf(peer)
    if (ownerId === undefined) return true
    return this.ctx.get('authLocal')?.sessionOwner(String(sessionId)) === ownerId
  }

  /**
   * Refuse one Session for a Peer obtained outside a Remote invocation.
   * @param peer - admitted Peer, or undefined for an in-process caller.
   * @param sessionId - durable Session identity.
   */
  requirePeerAccess(peer: PeerScope | undefined, sessionId: SessionId | string): void {
    if (this.canPeerAccess(peer, sessionId)) return
    throw new RemoteError('session/not-found', `session "${sessionId}" not found`, {
      sessionId: sessionId as SessionId,
    })
  }

  /**
   * Session identities one authenticated user may see.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns owned Session identities, or undefined when unrestricted.
   */
  visibleSessionIds(ownerId?: string): Set<string> | undefined {
    if (ownerId === undefined) return undefined
    return this.ctx.get('authLocal')?.ownedSessionIds(ownerId)
  }

  /**
   * Test one Session identity against the current call's principal.
   * @param sessionId - durable Session identity.
   * @param ownerId - authenticated user, or undefined for the operator.
   * @returns whether the caller may read or mutate it.
   */
  canAccess(sessionId: SessionId | string, ownerId?: string): boolean {
    if (ownerId === undefined) return true
    return this.ctx.get('authLocal')?.sessionOwner(String(sessionId)) === ownerId
  }

  /**
   * Refuse one Session the caller does not own. The failure is `not-found` so
   * a caller cannot probe another user's Session identities.
   * @param sessionId - durable Session identity.
   * @param ownerId - authenticated user, or undefined for the operator.
   */
  requireAccess(sessionId: SessionId | string, ownerId?: string): void {
    if (this.canAccess(sessionId, ownerId)) return
    throw new RemoteError('session/not-found', `session "${sessionId}" not found`, {
      sessionId: sessionId as SessionId,
    })
  }

  /**
   * Record a Session for the current user before its creation publishes.
   * @param sessionId - identity about to be created.
   * @param ownerId - authenticated user, or undefined for the operator.
   */
  expect(sessionId: SessionId, ownerId?: string): void {
    if (ownerId === undefined) return
    const result = this.ctx.get('authLocal')?.claimSession(String(sessionId), ownerId)
    if (result === undefined) return
    if (result === 'conflict') this.requireAccess(sessionId, ownerId)
  }

  /**
   * Claim a newly created Session for the current user.
   * @param sessionId - identity that now exists.
   * @param ownerId - authenticated user, or undefined for the operator.
   */
  claim(sessionId: SessionId, ownerId?: string): void {
    if (ownerId === undefined) return
    this.ctx.get('authLocal')?.claimSession(String(sessionId), ownerId)
  }

  /**
   * Inherit a parent's owner for a subagent or seeded child Session.
   * @param header - child header naming its parent.
   * @returns whether a parent owner was inherited.
   */
  inheritFromParent(header: SessionHeader): boolean {
    const parent = header.parentSession
    if (parent === undefined) return false
    const ownerId = this.ctx.get('authLocal')?.sessionOwner(String(parent))
    if (ownerId === undefined) return false
    return this.ctx.get('authLocal')?.claimSessionIfUnowned(String(header.id), ownerId) === true
  }

  /**
   * Resolve a Session owner for event delivery.
   * @param sessionId - durable Session identity.
   * @returns owner user id, or undefined when ownership is not recorded.
   */
  ownerOf(sessionId: SessionId | string): string | undefined {
    return this.ctx.get('authLocal')?.sessionOwner(String(sessionId))
  }

  /**
   * Test one Workspace membership for the current call.
   * @param workspaceId - Workspace identity.
   * @param ownerId - authenticated user whose membership is tested.
   * @returns whether that user may list the Workspace.
   */
  workspaceMember(workspaceId: SessionId | string, ownerId: string): boolean {
    return this.ctx.get('authLocal')?.workspaceMembers(String(workspaceId)).has(ownerId) === true
  }
}
