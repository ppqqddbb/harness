@echo off
REM Windows 批处理脚本 - 修复 bcrypt 并完成安装

echo ======================================
echo   修复 bcrypt 安装问题
echo ======================================
echo.

cd /d D:\File\VSCodeFile\QDHB\deepseek-harness

echo [✓] 已将 bcrypt 替换为 bcryptjs（纯 JavaScript，无需编译）
echo.

echo [1/2] 安装依赖...
call pnpm install

if errorlevel 1 (
    echo.
    echo [X] 安装失败，请检查错误信息
    pause
    exit /b 1
)

echo.
echo [2/2] 构建项目...
call pnpm run build

if errorlevel 1 (
    echo.
    echo [X] 构建失败，请检查错误信息
    pause
    exit /b 1
)

echo.
echo ======================================
echo   安装和构建完成！
echo ======================================
echo.
echo 下一步操作：
echo.
echo 1. 创建管理员账号：
echo    pnpm exec dsh auth create-user admin Admin@2024 --admin
echo.
echo 2. 启动 DeepSeek Harness：
echo    pnpm dsh web
echo.
echo 3. 访问登录页面：
echo    http://127.0.0.1:3080
echo.
echo ======================================
echo.
echo 提示：已使用 bcryptjs 代替 bcrypt
echo   - 无需 Visual Studio Build Tools
echo   - 跨平台兼容性好
echo   - 性能对认证系统足够
echo.
pause
