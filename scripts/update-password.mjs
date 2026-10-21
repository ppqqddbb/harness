#!/usr/bin/env node
/**
 * Update admin password using bcryptjs from pnpm store
 */
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const bcrypt = require('../node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs')

const DEFAULT_DB_DIR = join(homedir(), '.dsh')
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'auth.db')

async function createUser(username, password) {
  const db = new DatabaseSync(DEFAULT_DB_PATH)

  try {
    // Create table
    db.exec(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `)

    // Check if user exists
    const existing = db.prepare('SELECT id FROM auth_users WHERE username = ?').get(username)

    // Hash password with real bcrypt
    const hashedPassword = await bcrypt.hash(password, 12)

    if (existing) {
      // Update existing user
      db.prepare('UPDATE auth_users SET password_hash = ? WHERE username = ?').run(hashedPassword, username)
      console.log(`\n✅ Password updated successfully!\n`)
    } else {
      // Create new user
      const now = Date.now()
      db.prepare(`
        INSERT INTO auth_users (username, password_hash, is_admin, created_at)
        VALUES (?, ?, 1, ?)
      `).run(username, hashedPassword, now)
      console.log(`\n✅ Admin user created successfully!\n`)
    }

    console.log(`   Username: ${username}`)
    console.log(`   Password: ${password}`)
    console.log(`   Database: ${DEFAULT_DB_PATH}\n`)
    console.log('You can now log in at http://localhost:3080\n')

    return true
  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n')
    return false
  } finally {
    db.close()
  }
}

const username = process.argv[2] || 'admin'
const password = process.argv[3] || 'admin123'

console.log('\n🔄 Creating/updating admin user with bcrypt...')
await createUser(username, password)
