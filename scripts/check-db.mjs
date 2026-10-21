#!/usr/bin/env node
/**
 * Check database users
 */
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_DB_DIR = join(homedir(), '.dsh')
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'auth.db')

console.log(`\n📊 Checking database: ${DEFAULT_DB_PATH}\n`)

try {
  const db = new DatabaseSync(DEFAULT_DB_PATH)

  const users = db.prepare('SELECT id, username, is_admin, created_at, substr(password_hash, 1, 20) as hash_prefix FROM auth_users').all()

  if (users.length === 0) {
    console.log('❌ No users found in database!\n')
  } else {
    console.log('✅ Found users:\n')
    users.forEach(user => {
      console.log(`  ID: ${user.id}`)
      console.log(`  Username: ${user.username}`)
      console.log(`  Is Admin: ${user.is_admin ? 'Yes' : 'No'}`)
      console.log(`  Hash Prefix: ${user.hash_prefix}...`)
      console.log(`  Created: ${new Date(user.created_at).toISOString()}`)
      console.log('')
    })
  }

  db.close()
} catch (error) {
  console.error('❌ Error:', error.message, '\n')
}
