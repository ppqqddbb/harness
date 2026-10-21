/**
 * Slash commands for managing local authentication users.
 * @module @deepseek-ai/dsh-cli-auth
 */

import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-auth-local'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'

/** Cordis plugin name */
export const name = 'cli-auth'

/** Required services */
export const inject = ['authLocal', 'commands']

/** Split the text after a command name into whitespace-separated arguments. */
function argumentsOf(rawInput: string): string[] {
  return rawInput.trim().split(/\s+/u).filter(argument => argument.length > 0)
}

/** Register authentication slash commands. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.commands.register({
    name: 'auth-create-user',
    description: 'Create a local user account',
    input: { hint: '<username> [password] [--admin]' },
    handler: async (invocation: CommandInvocation): Promise<CommandResult> => {
      const [username, suppliedPassword, ...flags] = argumentsOf(invocation.rawInput)
      if (username === undefined) {
        return { kind: 'error', text: 'Usage: /auth-create-user <username> [password] [--admin]' }
      }

      const password = suppliedPassword ?? randomBytes(16).toString('hex')
      const isAdmin = flags.includes('--admin')
      const user = await ctx.authLocal.createUser(username, password, isAdmin)

      if (user === null) {
        return { kind: 'error', text: `Failed to create user "${username}". The username may already exist.` }
      }

      return {
        kind: 'success',
        text: suppliedPassword === undefined
          ? `Created user "${username}" (admin: ${isAdmin ? 'yes' : 'no'}) with password: ${password}`
          : `Created user "${username}" (admin: ${isAdmin ? 'yes' : 'no'}).`,
      }
    },
  }))

  ctx.effect(() => ctx.commands.register({
    name: 'auth-list-users',
    description: 'List local user accounts',
    handler: (): CommandResult => {
      const users = ctx.authLocal.listUsers()
      if (users.length === 0) return { kind: 'success', text: 'No users found.' }

      const lines = users.map(user =>
        `${String(user.id).padEnd(5)}${user.username.padEnd(22)}${user.isAdmin ? 'Yes' : 'No'}`)
      return { kind: 'success', text: ['ID   Username              Admin', ...lines].join('\n') }
    },
  }))

  ctx.effect(() => ctx.commands.register({
    name: 'auth-delete-user',
    description: 'Delete a local user account',
    input: { hint: '<username>' },
    handler: (invocation: CommandInvocation): CommandResult => {
      const [username] = argumentsOf(invocation.rawInput)
      if (username === undefined) return { kind: 'error', text: 'Usage: /auth-delete-user <username>' }

      const deleted = ctx.authLocal.deleteUser(username)
      return deleted
        ? { kind: 'success', text: `Deleted user "${username}".` }
        : { kind: 'error', text: `User "${username}" does not exist.` }
    },
  }))

  ctx.effect(() => ctx.commands.register({
    name: 'auth-change-password',
    description: 'Change a local user password',
    input: { hint: '<username> [new-password]' },
    handler: async (invocation: CommandInvocation): Promise<CommandResult> => {
      const [username, suppliedPassword] = argumentsOf(invocation.rawInput)
      if (username === undefined) {
        return { kind: 'error', text: 'Usage: /auth-change-password <username> [new-password]' }
      }

      const password = suppliedPassword ?? randomBytes(16).toString('hex')
      const changed = await ctx.authLocal.changePassword(username, password)
      if (!changed) return { kind: 'error', text: `User "${username}" does not exist.` }

      return {
        kind: 'success',
        text: suppliedPassword === undefined
          ? `Changed the password for "${username}": ${password}`
          : `Changed the password for "${username}".`,
      }
    },
  }))
}
