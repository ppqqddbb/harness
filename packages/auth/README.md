# DeepSeek Harness 用户认证系统

本文档说明如何启用和使用 DeepSeek Harness 的用户认证系统。

## 功能概述

- ✅ 管理员创建用户账号和密码
- ✅ 用户登录后才能访问 Web 界面
- ✅ 基于 SQLite 的本地用户数据库
- ✅ bcrypt 密码加密存储
- ✅ 会话管理（默认 7 天有效期）
- ✅ 登录页“记住我”控制持久 Cookie 或浏览器会话 Cookie
- ✅ CLI 命令管理用户

## 安装依赖

首先安装新增的依赖包：

```bash
cd D:\File\VSCodeFile\QDHB\deepseek-harness
pnpm install
```

需要安装的包：
- `bcrypt` - 密码哈希
- `cookie` - Cookie 解析和序列化

## 构建插件

构建新创建的认证插件：

```bash
pnpm run build
```

或者只构建认证相关的包：

```bash
cd packages/auth/auth-local && pnpm run build
cd packages/client/ui-auth && pnpm run build
cd packages/cli/auth-cli && pnpm run build
```

## 启用认证系统

### 方法 1: 通过配置文件（推荐）

编辑你的 Cordis 配置文件（通常是 `~/.dsh/web/cordis.patch.yml` 或项目中的配置文件），添加以下内容：

```yaml
- insert:
    # 后端认证服务
    - id: auth-local
      name: '@deepseek-ai/dsh-auth-local'
      inject: [webServer, database]
      config:
        enabled: true
        cookieName: dsh_session
        sessionDuration: 604800  # 7天（秒）
        dbPath: auth.db
        bcryptRounds: 12

    # CLI 用户管理命令
    - id: cli-auth
      name: '@deepseek-ai/dsh-cli-auth'
      inject: [authLocal, commands]

    # 前端登录界面
    - id: ui-auth
      name: '@deepseek-ai/dsh-client-ui-auth'
```

### 方法 2: 直接修改 web-app bundle

将 `packages/auth/auth-config.yml` 的内容追加到 `packages/bundle/web-app/cordis.patch.yml` 文件末尾。

## 创建管理员账号

启动 DeepSeek Harness 前，先创建一个管理员账号：

```bash
npx @deepseek-ai/dsh auth create-user admin yourpassword --admin
```

或者让系统生成随机密码：

```bash
npx @deepseek-ai/dsh auth create-user admin --admin
```

**注意：** 请妥善保存生成的密码。

## 启动系统

```bash
pnpm dsh web
```

现在访问 `http://127.0.0.1:3080` 会看到登录页面。

## 用户管理命令

### 创建用户

```bash
# 创建普通用户
dsh auth create-user username password

# 创建管理员用户
dsh auth create-user username password --admin

# 自动生成密码
dsh auth create-user username --admin
```

### 列出所有用户

```bash
dsh auth list-users
```

### 删除用户

```bash
dsh auth delete-user username
```

### 修改密码

```bash
# 指定新密码
dsh auth change-password username newpassword

# 自动生成新密码
dsh auth change-password username
```

## 配置选项

在 Cordis 配置中，`auth-local` 插件支持以下选项：

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | true | 是否启用认证系统 |
| `cookieName` | string | 'dsh_session' | 会话 Cookie 名称 |
| `sessionDuration` | number | 604800 | 会话有效期（秒），默认 7 天 |
| `dbPath` | string | 'auth.db' | 数据库文件路径（相对于 harness home） |
| `bcryptRounds` | number | 12 | bcrypt 哈希强度（10-15） |

### 禁用认证（临时）

如果需要临时禁用认证，将配置中的 `enabled` 设为 `false`：

```yaml
- id: auth-local
  config:
    enabled: false
```

## 数据库位置

用户数据库默认存储在：
- Windows: `C:\Users\<用户名>\.dsh\auth.db`
- Linux/Mac: `~/.dsh/auth.db`

可以通过 `dbPath` 配置项修改路径。

## 安全建议

1. **首次部署时立即创建管理员账号**
2. **使用强密码** - 建议至少 12 位，包含大小写字母、数字和特殊字符
3. **定期更换密码** - 尤其是管理员密码
4. **限制管理员数量** - 只给必要的人员分配管理员权限
5. **如果部署到外网**：
   - 启用 HTTPS（修改 webserver 配置）
   - 将 Cookie 的 `secure` 选项设为 `true`
   - 考虑添加速率限制防止暴力破解

## 故障排除

### 无法创建用户

确认以下事项：
1. 数据库服务已启动（`database` 服务在 Cordis 中已注册）
2. 有权限写入数据库文件目录
3. 用户名不重复

### 登录后立即退出

可能的原因：
1. 会话过期 - 检查 `sessionDuration` 配置
2. Cookie 被阻止 - 检查浏览器 Cookie 设置
3. 时钟不同步 - 确保服务器时间正确

### 前端无登录页面

1. 确认 `ui-auth` 插件已加载
2. 检查浏览器控制台错误信息
3. 重新构建前端：`pnpm run build`

## 架构说明

认证系统由三个插件组成：

1. **@deepseek-ai/dsh-auth-local** (后端)
   - 用户数据库管理（SQLite）
   - 密码加密验证（bcrypt）
   - 会话管理
   - HTTP API 路由（/api/auth/login, /api/auth/logout, /api/auth/me）

2. **@deepseek-ai/dsh-client-ui-auth** (前端)
   - React 登录页面组件
   - 认证状态管理
   - 路由守卫

3. **@deepseek-ai/dsh-cli-auth** (CLI)
   - 用户管理命令
   - 密码生成工具

## 开发和调试

### 查看认证日志

```bash
DEBUG=auth-local dsh web
```

### 检查数据库内容

```bash
sqlite3 ~/.dsh/auth.db "SELECT * FROM auth_users;"
```

### 清空所有用户（谨慎使用）

```bash
sqlite3 ~/.dsh/auth.db "DELETE FROM auth_users;"
```

## 许可证

与 DeepSeek Harness 主项目相同，使用 MIT 许可证。
