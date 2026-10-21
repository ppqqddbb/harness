#!/usr/bin/env node
/**
 * 创建管理员用户 - 使用相对路径导入 bcryptjs
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// 从项目 node_modules 导入 bcryptjs (pnpm 结构)
const bcrypt = require('../node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs/index.js');

// 配置
const HOME = process.env.USERPROFILE || process.env.HOME || '.';
const DB_DIR = join(HOME, '.dsh');
const DB_PATH = join(DB_DIR, 'auth.db');

// 获取命令行参数
const [,, username, password] = process.argv;

if (!username || !password) {
  console.error('❌ 用法: node scripts/create-admin-final.mjs <用户名> <密码>');
  console.error('   示例: node scripts/create-admin-final.mjs admin Admin@2024');
  process.exit(1);
}

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

  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON auth_sessions(expires_at)`);

  // 检查用户是否已存在
  const existingUser = db.prepare('SELECT id FROM auth_users WHERE username = ?').get(username);

  if (existingUser) {
    console.log(`⚠️  用户 "${username}" 已存在\n`);
    console.log('如需重新创建，请先删除数据库文件：');
    console.log(`   ${DB_PATH}\n`);
    db.close();
    process.exit(0);
  }

  // 生成密码哈希
  console.log('🔐 正在生成密码哈希...');
  const passwordHash = bcrypt.hashSync(password, 12);

  // 插入用户
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO auth_users (username, password_hash, is_admin, created_at)
    VALUES (?, ?, 1, ?)
  `);

  const result = stmt.run(username, passwordHash, now);

  console.log('');
  console.log('✅ 管理员用户创建成功！\n');
  console.log('📝 详细信息:');
  console.log(`   用户名: ${username}`);
  console.log(`   角色: 管理员`);
  console.log(`   用户 ID: ${result.lastInsertRowid}`);
  console.log(`   数据库: ${DB_PATH}\n`);
  console.log('🚀 下一步:');
  console.log('   1. 启动服务器: pnpm dsh web');
  console.log('   2. 打开浏览器: http://127.0.0.1:3080');
  console.log(`   3. 使用用户名 "${username}" 和您的密码登录\n`);

  db.close();
} catch (error) {
  console.error('❌ 错误:', error.message);
  console.error('\n详细错误信息:');
  console.error(error);
  process.exit(1);
}
