# 认证系统快速安装脚本

本目录包含 DeepSeek Harness 的用户认证插件。

## 快速开始

### 1. 安装依赖

从项目根目录运行：

```bash
pnpm install
```

这会安装 `bcrypt` 和 `cookie` 等必需的依赖。

### 2. 构建插件

```bash
pnpm run build
```

### 3. 配置系统

将以下内容添加到你的 Web 配置文件中。

**选项 A: 用户级配置**（推荐）

编辑 `~/.dsh/web/cordis.patch.yml`（Windows: `C:\Users\你的用户名\.dsh\web\cordis.patch.yml`），添加：

```yaml
- insert:
    - id: auth-local
      name: '@deepseek-ai/dsh-auth-local'
      inject: [webServer, database]
      config:
        enabled: true
        cookieName: dsh_session
        sessionDuration: 604800
        dbPath: auth.db
        bcryptRounds: 12

    - id: cli-auth
      name: '@deepseek-ai/dsh-cli-auth'
      inject: [authLocal, commands]

    - id: ui-auth
      name: '@deepseek-ai/dsh-client-ui-auth'
```

**选项 B: 项目级配置**

将 `auth-config.yml` 的内容追加到 `packages/bundle/web-app/cordis.patch.yml` 文件末尾。

### 4. 创建管理员账号

```bash
npx @deepseek-ai/dsh auth create-user admin your-secure-password --admin
```

或生成随机密码：

```bash
npx @deepseek-ai/dsh auth create-user admin --admin
```

### 5. 启动系统

```bash
pnpm dsh web
```

访问 `http://127.0.0.1:3080`，你会看到登录页面！

## 目录结构

```
packages/auth/
├── auth-local/          # 后端认证服务（SQLite + bcrypt）
│   ├── src/index.ts
│   └── package.json
├── auth-config.yml      # Cordis 配置示例
└── README.md           # 完整文档

packages/client/ui-auth/  # 前端登录界面（React）
├── src/
│   ├── index.ts
│   └── client/index.tsx
└── package.json

packages/cli/auth-cli/    # CLI 用户管理命令
├── src/index.ts
└── package.json
```

## 用户管理

```bash
# 创建用户
dsh auth create-user <username> [password] [--admin]

# 列出所有用户
dsh auth list-users

# 删除用户
dsh auth delete-user <username>

# 修改密码
dsh auth change-password <username> [new-password]
```

## 更多信息

查看 [README.md](./README.md) 获取：
- 完整配置选项
- 安全建议
- 故障排除
- 架构说明
