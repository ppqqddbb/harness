#!/usr/bin/env node
/**
 * Delete existing admin user and let web service recreate with correct bcrypt
 */
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_DB_DIR = join(homedir(), '.dsh')
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'auth.db')

function deleteUser(username) {
  const db = new DatabaseSync(DEFAULT_DB_PATH)

  try {
    const result = db.prepare('DELETE FROM auth_users WHERE username = ?').run(username)

    if (result.changes > 0) {
      console.log(`\n✅ User '${username}' deleted successfully!\n`)
      console.log('Now you can create a new user via the web interface or CLI.\n')
      return true
    } else {
      console.log(`\n❌ User '${username}' not found\n`)
      return false
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n')
    return false
  } finally {
    db.close()
  }
}

const username = process.argv[2] || 'admin'
deleteUser(username)
