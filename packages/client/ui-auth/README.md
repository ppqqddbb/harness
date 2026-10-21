# @deepseek-ai/dsh-client-ui-auth

Browser authentication UI for DeepSeek Harness: the login gate and the administrator-only User management settings section.

The plugin checks `/api/auth/me`, blocks the application until a session exists, and registers the `users` settings section only when the signed-in account is an administrator. The section creates accounts through the local authentication service, supports generated or manually specified credentials, and shows a generated password once.

No invariant companion is published because the browser half owns only DOM and slot registrations whose behavior is covered by its client specs.
