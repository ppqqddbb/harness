#!/usr/bin/env node
/**
 * Create admin user with real bcrypt hashing
 * Usage: node scripts/create-admin-bcrypt.mjs [username] [password]
 */
import { DatabaseSync } from 'node:sqlite'
import bcrypt from 'bcryptjs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const DEFAULT_DB_DIR = join(homedir(), '.dsh')
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'auth.db')

async function createAdmin(username, password) {
  // Ensure directory exists
  if (!existsSync(DEFAULT_DB_DIR)) {
    mkdirSync(DEFAULT_DB_DIR, { recursive: true })
  }

  const db = new DatabaseSync(DEFAULT_DB_PATH)

  try {
    // Create users table (matching auth-local schema)
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

    if (existing) {
      console.log(`\n⚠️  User '${username}' already exists. Updating password...\n`)

      // Update password with bcrypt hash
      const hashedPassword = await bcrypt.hash(password, 12)
      db.prepare('UPDATE auth_users SET password_hash = ? WHERE username = ?').run(hashedPassword, username)

      console.log(`✅ Password updated successfully!\n`)
      console.log(`   Username: ${username}`)
      console.log(`   Password: ${password}`)
      console.log(`   Database: ${DEFAULT_DB_PATH}\n`)
    } else {
      // Insert new admin user with bcrypt hash
      const hashedPassword = await bcrypt.hash(password, 12)
      const now = Date.now()

      db.prepare(`
        INSERT INTO auth_users (username, password_hash, is_admin, created_at)
        VALUES (?, ?, 1, ?)
      `).run(username, hashedPassword, now)

      console.log(`\n✅ Admin user created successfully!\n`)
      console.log(`   Username: ${username}`)
      console.log(`   Password: ${password}`)
      console.log(`   Database: ${DEFAULT_DB_PATH}\n`)
    }

    console.log('You can now log in at http://localhost:3080\n')

    return true
  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n')
    return false
  } finally {
    db.close()
  }
}

// Get arguments
const username = process.argv[2] || 'admin'
const password = process.argv[3] || 'admin123'

console.log('\n📝 Creating/updating admin user for DSH...')
await createAdmin(username, password)
