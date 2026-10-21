# @deepseek-ai/dsh-auth-local

Local SQLite-backed authentication for DeepSeek Harness Web profiles: password verification, sessions, and administrator-issued accounts.

Mount it with `webServer`; it registers the login, session, and administrator account routes. Passwords are stored as salted bcrypt hashes and the administration API returns only safe account fields.

No invariant companion is published because the service owns its SQLite tables directly and exposes no cross-plugin mutable registry.
