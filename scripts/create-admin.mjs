#!/usr/bin/env node
/**
 * 创建管理员用户的独立脚本
 * 使用方法: node scripts/create-admin.mjs <username> <password>
 */

import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const DB_DIR = join(__dirname, '..', '.dsh', 'data');
const DB_PATH = join(DB_DIR, 'auth.db');

// 确保数据目录存在
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
  console.log(`✓ Created database directory: ${DB_DIR}`);
}

// 获取命令行参数
const [,, username, password] = process.argv;

if (!username || !password) {
  console.error('❌ Usage: node scripts/create-admin.mjs <username> <password>');
  console.error('   Example: node scripts/create-admin.mjs admin Admin@2024');
  process.exit(1);
}

// 验证密码强度
if (password.length < 6) {
  console.error('❌ Password must be at least 6 characters long');
  process.exit(1);
}

try {
  // 打开数据库
  const db = new DatabaseSync(DB_PATH);

  // 创建表（如果不存在）
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);

  // 检查用户是否已存在
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

  if (existingUser) {
    console.error(`❌ User "${username}" already exists`);
    process.exit(1);
  }

  // 生成密码哈希
  console.log('🔐 Hashing password...');
  const passwordHash = bcrypt.hashSync(password, 12);

  // 插入用户
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO users (username, password_hash, is_admin, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?)
  `);

  const result = stmt.run(username, passwordHash, now, now);

  console.log('');
  console.log('✅ Admin user created successfully!');
  console.log('');
  console.log('  📝 Details:');
  console.log(`     Username: ${username}`);
  console.log(`     Role: Administrator`);
  console.log(`     User ID: ${result.lastInsertRowid}`);
  console.log('');
  console.log('  🚀 Next steps:');
  console.log('     1. Start the server: pnpm dsh web');
  console.log('     2. Open browser: http://127.0.0.1:3080');
  console.log(`     3. Login with username "${username}" and your password`);
  console.log('');

  db.close();
} catch (error) {
  console.error('❌ Error creating user:', error.message);
  process.exit(1);
}
