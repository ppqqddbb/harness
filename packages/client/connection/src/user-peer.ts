/**
 * One authenticated local user's Peer scope. The instance is its own scope
 * key, so events dispatched with `scopeTarget(subject, peer)` reach listeners
 * registered through `peer.ctx` and nobody else.
 * @module @deepseek-ai/dsh-client-connection/src/user-peer
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-auth-local'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import type { PeerId, PeerPrincipal, PeerScope } from '@deepseek-ai/dsh-typert-protocol'

/** An admitted local-login Peer, scoped to one authenticated auth session. */
export class UserPeer implements PeerScope {
  readonly id: PeerId = randomUUID() as PeerId
  readonly ctx: Context
  private readonly scope: Scope
  private readonly validation: NodeJS.Timeout

  /**
   * @param owner - Connection plugin context the scope fiber hangs under.
   * @param principal - authenticated user the Peer speaks for.
   * @param sessionId - login session whose expiry revokes this Peer.
   */
  constructor(
    owner: Context,
    readonly principal: PeerPrincipal,
    readonly sessionId: string,
  ) {
    this.scope = createScope(owner, this)
    this.ctx = this.scope.ctx
    this.validation = setInterval(() => {
      const auth = owner.get('authLocal')
      if (auth === undefined || auth.validateSession(this.sessionId) !== null) return
      clearInterval(this.validation)
      void this.dispose()
    }, 60_000)
    this.validation.unref()
  }

  /** Tear down every connection-lifetime registration; racing calls share one completion. */
  dispose(): Promise<void> {
    clearInterval(this.validation)
    return this.scope.dispose()
  }
}
