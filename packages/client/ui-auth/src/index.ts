/**
 * Authentication UI plugin for DeepSeek Harness.
 * Provides login page and route protection for the web interface.
 *
 * @module @deepseek-ai/dsh-client-ui-auth
 */

import type { Context } from '@deepseek-ai/cordis'

/** Cordis plugin name */
export const name = 'ui-auth'

/** Plugin for browser environment only */
export const browser = true

/** Empty server-side entry - all logic is in client bundle */
export function apply(_ctx: Context): void {
  // Server-side plugin does nothing - authentication is handled in client
}
