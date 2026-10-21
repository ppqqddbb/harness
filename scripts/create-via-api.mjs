#!/usr/bin/env node
/**
 * Create admin user via Web API (requires server running)
 * Usage: node scripts/create-via-api.mjs [username] [password]
 */

async function createUserViaAPI(username, password) {
  const apiUrl = 'http://localhost:3080/api/auth/create-user'

  try {
    console.log(`\n📝 Creating user '${username}' via API...\n`)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        isAdmin: true
      }),
    })

    const data = await response.json()

    if (response.ok && data.success) {
      console.log(`✅ User created successfully!\n`)
      console.log(`   Username: ${username}`)
      console.log(`   Password: ${password}\n`)
      console.log('You can now log in at http://localhost:3080\n')
      return true
    } else {
      console.error(`❌ Failed to create user: ${data.error || data.message || 'Unknown error'}\n`)
      return false
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`)
    console.error('\nMake sure the DSH web server is running (pnpm dsh web)\n')
    return false
  }
}

const username = process.argv[2] || 'admin'
const password = process.argv[3] || 'admin123'

await createUserViaAPI(username, password)
