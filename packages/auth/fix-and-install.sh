#!/bin/bash
# 修复 bcrypt 问题并完成安装的一键脚本

echo "🔧 修复 bcrypt 安装问题..."
echo ""

# 进入项目根目录
cd "D:\File\VSCodeFile\QDHB\deepseek-harness"

echo "✅ 已将 bcrypt 替换为 bcryptjs（纯 JavaScript，无需编译）"
echo ""

echo "📦 开始安装依赖..."
pnpm install

if [ $? -ne 0 ]; then
    echo "❌ 安装失败，请检查错误信息"
    exit 1
fi

echo ""
echo "🔨 开始构建项目..."
pnpm run build

if [ $? -ne 0 ]; then
    echo "❌ 构建失败，请检查错误信息"
    exit 1
fi

echo ""
echo "✅ 安装和构建完成！"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 下一步操作："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  创建管理员账号："
echo "   ./node_modules/.bin/dsh auth create-user admin Admin@2024 --admin"
echo ""
echo "   或使用 pnpm："
echo "   pnpm exec dsh auth create-user admin Admin@2024 --admin"
echo ""
echo "2️⃣  启动 DeepSeek Harness："
echo "   pnpm dsh web"
echo ""
echo "3️⃣  访问登录页面："
echo "   http://127.0.0.1:3080"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 提示：使用 bcryptjs 代替 bcrypt"
echo "   - 无需 C++ 编译工具"
echo "   - 跨平台兼容性好"
echo "   - 性能对认证系统足够（登录不频繁）"
echo ""
