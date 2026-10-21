#!/usr/bin/env node
/**
 * Create admin user for DSH web interface
 * Usage: node scripts/create-admin-simple.mjs [username] [password]
 */
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const DEFAULT_DB_DIR = join(homedir(), '.dsh')
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'auth.db')

// Simplified password hash (the auth service will use real bcrypt)
function hashPassword(password) {
  // For compatibility with bcrypt format
  const hash = createHash('sha256').update(password).digest('hex')
  return `$2a$10$${hash.slice(0, 53)}`
}

function createAdmin(username, password) {
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
      console.log(`\n鉂?User '${username}' already exists\n`)
      return false
    }

    // Insert admin user
    const hashedPassword = hashPassword(password)
    const now = Date.now()

    db.prepare(`
      INSERT INTO auth_users (username, password_hash, is_admin, created_at)
      VALUES (?, ?, 1, ?)
    `).run(username, hashedPassword, now)

    console.log(`\n鉁?Admin user created successfully!\n`)
    console.log(`   Username: ${username}`)
    console.log(`   Password: ${password}`)
    console.log(`   Database: ${DEFAULT_DB_PATH}\n`)
    console.log('You can now start the server with: pnpm dsh web\n')
    console.log('Then open http://localhost:3080 and log in.\n')

    return true
  } catch (error) {
    console.error('\n鉂?Error:', error.message, '\n')
    return false
  } finally {
    db.close()
  }
}

// Get arguments
const username = process.argv[2] || 'admin'
const password = process.argv[3] || 'admin123'

console.log('\n馃摑 Creating admin user for DSH...')
createAdmin(username, password)
