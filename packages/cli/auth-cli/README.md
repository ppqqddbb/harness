# @deepseek-ai/dsh-cli-auth

CLI commands for creating and managing DeepSeek Harness local authentication accounts.

Mount it with `authLocal` and `commands`; the commands call the local authentication service rather than opening the database directly.

No invariant companion is published because the package only registers commands over the service definition owned by `@deepseek-ai/dsh-auth-local`.
