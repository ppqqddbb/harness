#!/usr/bin/env node
/**
 * Simple script to create an admin user directly via SQLite
 */
import { Database } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_DB_PATH = join(homedir(), '.dsh', 'data', 'storage.db')

// Simple bcrypt-compatible hash using SHA-256 (for demo purposes)
// In production, the real bcrypt is used by the auth-local service
function hashPassword(password) {
  return '$2a$10$' + createHash('sha256').update(password).digest('hex')
}

async function createAdmin(username, password, dbPath = DEFAULT_DB_PATH) {
  const db = new Database(dbPath)

  try {
    // Create users table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        isAdmin INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL
      )
    `)

    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) {
      console.log(`❌ User '${username}' already exists`)
      return false
    }

    // Insert admin user
    const hashedPassword = hashPassword(password)
    const now = Date.now()

    db.prepare(`
      INSERT INTO users (username, password, isAdmin, createdAt)
      VALUES (?, ?, 1, ?)
    `).run(username, hashedPassword, now)

    console.log(`✅ Admin user created successfully!`)
    console.log(`   Username: ${username}`)
    console.log(`   Password: ${password}`)
    console.log(`   Database: ${dbPath}`)
    console.log('')
    console.log('You can now log in to the web interface.')

    return true
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message)
    return false
  } finally {
    db.close()
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const username = args[0] || 'admin'
const password = args[1] || 'admin123'
const dbPath = args[2] || DEFAULT_DB_PATH

console.log('Creating admin user...')
console.log('')

await createAdmin(username, password, dbPath)
