import { DatabaseSync } from 'node:sqlite';
import bcrypt from '../node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs/index.js';

const dbPath = 'C:\\Users\\WYT\\.dsh\\auth.db';
const db = new DatabaseSync(dbPath);

console.log('🔍 Testing password verification...\n');

// Get admin user from database
const stmt = db.prepare('SELECT * FROM auth_users WHERE username = ?');
const user = stmt.get('admin');

if (!user) {
  console.log('❌ User "admin" not found in database');
  process.exit(1);
}

console.log('✅ User found:');
console.log('   ID:', user.id);
console.log('   Username:', user.username);
console.log('   Hash:', user.password_hash.substring(0, 20) + '...');
console.log('   Is Admin:', user.is_admin === 1 ? 'Yes' : 'No');
console.log();

// Test password verification
const testPassword = 'admin123';
console.log(`🔑 Testing password: "${testPassword}"`);

try {
  const isValid = await bcrypt.compare(testPassword, user.password_hash);

  if (isValid) {
    console.log('✅ Password verification PASSED!');
    console.log('   The password is correct.');
  } else {
    console.log('❌ Password verification FAILED!');
    console.log('   The password does not match the hash.');
  }
} catch (error) {
  console.log('❌ Error during verification:', error.message);
}

db.close();
