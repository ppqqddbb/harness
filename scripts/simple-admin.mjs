/**
 * 简易管理员创建工具
 * 直接使用 Node.js 内置 SQLite 和手动哈希
 */

import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, pbkdf2Sync } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// 使用 PBKDF2 作为 bcrypt 的简单替代（仅用于初始化）
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

// 配置
const HOME = process.env.USERPROFILE || process.env.HOME || '.';
const DB_DIR = join(HOME, '.dsh');
const DB_PATH = join(DB_DIR, 'auth.db');

// 获取命令行参数
const [,, username = 'admin', password = 'Admin@2024'] = process.argv;

console.log('🔧 DeepSeek Harness 认证系统 - 管理员创建工具\n');

// 确保数据目录存在
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
  console.log(`✓ 创建数据目录: ${DB_DIR}`);
}

try {
  // 打开数据库
  const db = new DatabaseSync(DB_PATH);

  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    )
  `);

  // 检查用户是否已存在
  const existingUser = db.prepare('SELECT id FROM auth_users WHERE username = ?').get(username);

  if (existingUser) {
    console.log(`⚠️  用户 "${username}" 已存在`);
    console.log('');
    console.log('要重置密码，请先删除用户：');
    console.log(`   node scripts/simple-admin.mjs delete ${username}`);
    console.log('');
    db.close();
    process.exit(0);
  }

  // 注意：这里使用 PBKDF2，不是 bcryptjs
  // 生产环境应该修改 auth-local 服务支持 PBKDF2 或直接使用 bcryptjs
  console.log('⚠️  注意：此脚本使用 PBKDF2 哈希，与 bcryptjs 不兼容');
  console.log('    建议使用下面的临时 bcrypt 哈希创建脚本\n');

  const passwordHash = hashPassword(password);
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO auth_users (username, password_hash, is_admin, created_at)
    VALUES (?, ?, 1, ?)
  `);

  const result = stmt.run(username, passwordHash, now);

  console.log('✅ 管理员用户已创建（使用 PBKDF2 哈希）\n');
  console.log('📝 详细信息:');
  console.log(`   用户名: ${username}`);
  console.log(`   角色: 管理员`);
  console.log(`   用户 ID: ${result.lastInsertRowid}`);
  console.log(`   数据库: ${DB_PATH}\n`);
  console.log('⚠️  重要提示:');
  console.log('   此用户使用 PBKDF2 哈希，可能无法登录');
  console.log('   请使用下面的 bcrypt 兼容脚本重新创建\n');

  db.close();
} catch (error) {
  console.error('❌ 错误:', error.message);
  process.exit(1);
}
