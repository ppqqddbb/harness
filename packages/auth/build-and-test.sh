#!/bin/bash
# 完整的构建和测试脚本

echo "================================================"
echo "  DeepSeek Harness 认证系统 - 构建脚本"
echo "================================================"
echo ""

cd "D:\File\VSCodeFile\QDHB\deepseek-harness"

echo "✅ 已完成的修复："
echo "  1. bcrypt → bcryptjs (无需编译)"
echo "  2. 添加到 tsconfig.host.json"
echo "  3. 添加到 tsconfig.client.json"
echo "  4. 更新所有 TypeScript 配置"
echo ""

echo "📦 重新安装依赖..."
pnpm install --force

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 安装失败"
    exit 1
fi

echo ""
echo "🔨 开始构建..."
pnpm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "================================================"
    echo "  ✅ 构建成功！"
    echo "================================================"
    echo ""
    echo "下一步："
    echo ""
    echo "1. 创建管理员账号："
    echo "   pnpm exec dsh auth create-user admin Admin@2024 --admin"
    echo ""
    echo "2. 启动系统："
    echo "   pnpm dsh web"
    echo ""
    echo "3. 访问登录页面："
    echo "   http://127.0.0.1:3080"
    echo ""
    echo "================================================"
else
    echo ""
    echo "❌ 构建失败，请检查上面的错误信息"
    echo ""
    echo "常见问题："
    echo "  - 如果是 TypeScript 错误，检查 tsconfig 配置"
    echo "  - 如果是依赖问题，运行 pnpm install --force"
    echo ""
    exit 1
fi
