# DeepSeek Harness - 完整使用指南

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![PNPM](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-orange)](https://pnpm.io/)

DeepSeek Harness 是一个基于插件架构的 AI 模型测试和评估框架，采用 **MIT 开源许可证**，完全免费且支持二次开发。

---

## 📋 目录

- [项目特点](#项目特点)
- [许可证说明](#许可证说明)
- [系统要求](#系统要求)
- [快速开始](#快速开始)
- [完整命令列表](#完整命令列表)
- [认证系统](#认证系统)
- [开发指南](#开发指南)
- [项目结构](#项目结构)
- [常见问题](#常见问题)

---

## 🌟 项目特点

- ✅ **MIT 开源许可** - 可自由使用、修改、商业化
- 🔌 **插件化架构** - Everything is a plugin
- 🎨 **现代 Web UI** - 基于 React + TypeScript
- 🔐 **内置认证系统** - 用户管理和会话控制
- 📦 **Monorepo 结构** - pnpm workspace 管理
- 🚀 **开发者友好** - 完整的 TypeScript 支持

---

## 📜 许可证说明

**MIT License** - 这意味着你可以：

✅ **免费使用** - 无需付费
✅ **修改代码** - 根据需求定制
✅ **二次开发** - 构建自己的产品
✅ **商业使用** - 用于商业项目
✅ **重新分发** - 分享给他人
✅ **出售** - 可以销售修改后的版本

**唯一要求**：在代码副本中保留原始的版权声明和许可证文本。

⚠️ **注意**：项目目前处于 **Developer Preview** 阶段，可能会有破坏性的兼容性变更。

---

## 💻 系统要求

- **Node.js**: >= 18.0.0
- **pnpm**: >= 9.0.0
- **操作系统**: Windows / macOS / Linux
- **Git**: 用于克隆仓库

---

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
```

### 2. 安装依赖

```bash
pnpm install
```

> 💡 如果没有安装 pnpm，先运行：`npm install -g pnpm`

### 3. 构建项目

```bash
pnpm build
```

构建时间约 1-2 分钟，会编译所有 TypeScript 代码。

### 4. 创建管理员账号

```bash
node scripts/create-admin-final.mjs admin admin123
```

**输出示例**：
```
🔧 DeepSeek Harness 认证系统 - 管理员创建工具

🔐 正在生成密码哈希...

✅ 管理员用户创建成功！

📝 详细信息:
   用户名: admin
   角色: 管理员
   用户 ID: 1
   数据库: C:\Users\<你的用户名>\.dsh\auth.db
```

### 5. 启动 Web 服务器

```bash
pnpm dsh web
```

**输出示例**：
```
[INFO] Starting DeepSeek Harness Web Server
[INFO] Server listening on http://127.0.0.1:3080
```

### 6. 访问 Web UI

打开浏览器访问：**http://127.0.0.1:3080**

使用刚才创建的凭据登录：
- 用户名: `admin`
- 密码: `admin123`

---

## 📚 完整命令列表

### 开发命令

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装所有依赖 |
| `pnpm build` | 构建整个项目 |
| `pnpm build --filter <package>` | 构建指定包 |
| `pnpm dev` | 开发模式（热重载） |
| `pnpm clean` | 清理构建产物 |
| `pnpm lint` | 代码检查 |
| `pnpm test` | 运行测试 |

### 运行时命令

| 命令 | 说明 |
|------|------|
| `pnpm dsh web` | 启动 Web 服务器 |
| `pnpm dsh --help` | 查看帮助信息 |
| `pnpm dsh plugin --profile web list` | 列出 web profile 的插件 |
| `pnpm dsh plugin --profile web add <package>` | 添加插件到 web profile |

### 认证管理命令

| 命令 | 说明 |
|------|------|
| `node scripts/create-admin-final.mjs <用户名> <密码>` | 创建管理员账号 |
| `rm ~/.dsh/auth.db` (Linux/Mac) | 删除认证数据库 |
| `del %USERPROFILE%\.dsh\auth.db` (Windows) | 删除认证数据库 (PowerShell: `rm ~\.dsh\auth.db`) |

### 包管理命令

```bash
# 在特定包中添加依赖
pnpm add <package> --filter <workspace-package>

# 示例：给 auth-local 添加依赖
pnpm add lodash --filter @deepseek-ai/dsh-auth-local

# 全局添加开发依赖
pnpm add -Dw <package>

# 更新所有依赖
pnpm update
```

---

## 🔐 认证系统

### 认证数据库位置

**Windows**: `C:\Users\<用户名>\.dsh\auth.db`
**Linux/Mac**: `~/.dsh/auth.db`

### API 端点

认证系统提供以下 HTTP API：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/logout` | POST | 用户登出 |
| `/api/auth/me` | GET | 获取当前用户信息 |

### 登录 API 示例

```bash
curl -X POST http://127.0.0.1:3080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**响应**：
```json
{
  "success": true,
  "user": {
    "username": "admin",
    "isAdmin": true
  }
}
```

### 重置管理员密码

```bash
# 1. 删除数据库
rm ~/.dsh/auth.db  # Linux/Mac
# 或
rm ~\.dsh\auth.db  # Windows PowerShell

# 2. 重新创建管理员
node scripts/create-admin-final.mjs admin 新密码
```

---

## 🛠️ 开发指南

### 项目架构

DeepSeek Harness 采用 **Profile-Based** 架构：

```
dsh <profile> [options]
```

- **Profile**: 配置文件，定义要加载哪些插件
- **Plugin**: 插件，提供具体功能
- **Everything is a plugin**: 所有功能都是插件

### 创建自定义插件

```typescript
// packages/my-plugin/src/index.ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context, config: any): void {
  ctx.on('ready', () => {
    console.log('My plugin is ready!')
  })
}
```

### 添加插件到 Profile

```bash
pnpm dsh plugin --profile web add ./packages/my-plugin
```

### 热重载开发

```bash
# 在一个终端运行构建监听
pnpm build --watch

# 在另一个终端运行服务器
pnpm dsh web
```

---

## 📁 项目结构

```
deepseek-harness/
├── apps/                      # 应用程序
│   ├── cli/                   # CLI 工具
│   └── web/                   # Web 应用
├── packages/                  # 核心包
│   ├── auth/                  # 认证系统
│   │   ├── auth-local/        # 本地认证服务
│   │   └── auth-ui/           # 认证界面
│   ├── boot/                  # 启动引导
│   ├── host/                  # 主机服务
│   └── ...
├── scripts/                   # 工具脚本
│   ├── create-admin-final.mjs # 创建管理员
│   └── ...
├── pnpm-workspace.yaml       # pnpm workspace 配置
├── package.json              # 根 package.json
├── tsconfig.json             # TypeScript 配置
└── README.md                 # 本文件
```

### 核心包说明

| 包名 | 说明 |
|------|------|
| `@deepseek-ai/cordis` | 插件系统核心 |
| `@deepseek-ai/dsh-auth-local` | 本地认证服务 |
| `@deepseek-ai/dsh-auth-ui` | 认证界面组件 |
| `@deepseek-ai/dsh-host-webserver` | Web 服务器 |
| `@deepseek-ai/dsh-app-boot` | 应用启动器 |

---

## ❓ 常见问题

### Q1: `pnpm dsh auth:create-user` 为什么不工作？

**A**: `auth:create-user` 不是一个 profile，而是被误认为的命令名。DeepSeek Harness 的认证系统**没有内置 CLI 命令**来创建用户。

**解决方案**：使用我们提供的脚本：
```bash
node scripts/create-admin-final.mjs <用户名> <密码>
```

### Q2: 构建时出现 TypeScript 错误怎么办？

**A**: 确保你的 Node.js 版本 >= 18，并且运行了：
```bash
pnpm install
pnpm build
```

如果问题持续，尝试清理并重建：
```bash
pnpm clean
pnpm install
pnpm build
```

### Q3: Web 服务器启动后无法访问？

**A**: 检查：
1. 端口 3080 是否被占用
2. 防火墙是否允许
3. 浏览器访问 `http://127.0.0.1:3080`（不是 localhost）

### Q4: 如何更改 Web 服务器端口？

**A**: 编辑 profile 配置或设置环境变量：
```bash
DSH_PORT=8080 pnpm dsh web
```

### Q5: 用户密码忘记了怎么办？

**A**: 删除数据库并重新创建用户：
```bash
rm ~/.dsh/auth.db
node scripts/create-admin-final.mjs admin 新密码
```

### Q6: 可以用于商业项目吗？

**A**: ✅ 可以！MIT 许可证允许商业使用，只需保留原始版权声明。

### Q7: 如何贡献代码？

**A**:
1. Fork 仓库
2. 创建特性分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -am 'Add my feature'`
4. 推送分支：`git push origin feature/my-feature`
5. 创建 Pull Request

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)

### Q8: 数据存储在哪里?

**A**:
- **认证数据**: `~/.dsh/auth.db` (SQLite)
- **配置文件**: `~/.dsh/config/`
- **日志文件**: `~/.dsh/logs/`

---

## 📖 更多资源

- **官方仓库**: [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- **Discord 社区**: [加入 Discord](https://discord.gg/deepseek)
- **问题反馈**: [GitHub Issues](https://github.com/deepseek-ai/deepseek-harness/issues)
- **安全政策**: [SAFETY.md](./SAFETY.md)
- **贡献指南**: [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 🎯 快速命令参考

```bash
# === 初始化项目 ===
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm build

# === 创建管理员 ===
node scripts/create-admin-final.mjs admin admin123

# === 启动服务 ===
pnpm dsh web

# === 访问 ===
# 打开浏览器: http://127.0.0.1:3080
# 登录: admin / admin123

# === 重置密码 ===
rm ~/.dsh/auth.db  # 删除数据库
node scripts/create-admin-final.mjs admin 新密码  # 重新创建

# === 开发模式 ===
pnpm build --watch  # 终端 1
pnpm dsh web        # 终端 2
```

---

## 📝 变更日志

### 最新改进 (2024-10-14)

✅ **认证系统增强**
- 替换 `bcrypt` 为 `bcryptjs`（无需 C++ 编译）
- 添加管理员创建脚本
- 实现完整的登录/登出流程
- 添加会话管理和自动清理

✅ **Web UI 改进**
- 深色主题界面
- 响应式登录表单
- 现代化视觉设计
- 流畅的动画效果

✅ **开发体验**
- 修复所有 TypeScript 错误
- 优化构建流程
- 完善文档和示例

---

## 🤝 贡献者

感谢所有为 DeepSeek Harness 做出贡献的开发者！

---

## 📄 许可证

本项目采用 **MIT License** 开源。

```
MIT License

Copyright (c) 2024 DeepSeek AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

⭐ **如果这个项目对你有帮助，请给我们一个 Star！**

---

**最后更新**: 2024-10-14
**维护者**: DeepSeek AI Team
**状态**: Developer Preview ⚠️ (可能有破坏性变更)
