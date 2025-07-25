#!/bin/bash

# 🧪 SSL配置测试脚本
# 用于验证SSL证书配置是否正确

echo "🧪 SSL配置测试"
echo "==============="

# 检查是否在项目目录
if [ ! -f "package.json" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

# 1. 检查.env文件
echo "📝 检查.env文件..."
if [ ! -f ".env" ]; then
    echo "❌ .env文件不存在"
    exit 1
fi

# 提取SSL配置
SSL_KEY_PATH=$(grep "^SSL_KEY_PATH=" .env | cut -d'=' -f2)
SSL_CERT_PATH=$(grep "^SSL_CERT_PATH=" .env | cut -d'=' -f2)

echo "私钥路径: $SSL_KEY_PATH"
echo "证书路径: $SSL_CERT_PATH"

if [ -z "$SSL_KEY_PATH" ] || [ -z "$SSL_CERT_PATH" ]; then
    echo "❌ SSL配置不完整"
    echo "请确保.env文件包含："
    echo "SSL_KEY_PATH=/path/to/private.key"
    echo "SSL_CERT_PATH=/path/to/certificate.crt"
    exit 1
fi

# 2. 检查证书文件存在
echo ""
echo "📁 检查证书文件..."
if [ ! -f "$SSL_CERT_PATH" ]; then
    echo "❌ 证书文件不存在: $SSL_CERT_PATH"
    exit 1
fi

if [ ! -f "$SSL_KEY_PATH" ]; then
    echo "❌ 私钥文件不存在: $SSL_KEY_PATH"
    exit 1
fi

echo "✅ 证书文件存在"

# 3. 检查文件权限
echo ""
echo "🔐 检查文件权限..."
if [ -r "$SSL_CERT_PATH" ]; then
    echo "✅ 证书文件可读"
else
    echo "❌ 证书文件不可读"
    echo "尝试修复权限: sudo chmod 644 $SSL_CERT_PATH"
    exit 1
fi

if [ -r "$SSL_KEY_PATH" ]; then
    echo "✅ 私钥文件可读"
else
    echo "❌ 私钥文件不可读"
    echo "尝试修复权限: sudo chmod 600 $SSL_KEY_PATH"
    exit 1
fi

# 4. 验证证书格式
echo ""
echo "🔍 验证证书格式..."
if openssl x509 -in "$SSL_CERT_PATH" -text -noout > /dev/null 2>&1; then
    echo "✅ 证书格式正确"
else
    echo "❌ 证书格式错误"
    exit 1
fi

if openssl rsa -in "$SSL_KEY_PATH" -check -noout > /dev/null 2>&1; then
    echo "✅ 私钥格式正确"
else
    echo "❌ 私钥格式错误"
    exit 1
fi

# 5. 检查证书和私钥匹配
echo ""
echo "🔗 检查证书和私钥匹配..."
CERT_MODULUS=$(openssl x509 -noout -modulus -in "$SSL_CERT_PATH" | openssl md5)
KEY_MODULUS=$(openssl rsa -noout -modulus -in "$SSL_KEY_PATH" | openssl md5)

if [ "$CERT_MODULUS" = "$KEY_MODULUS" ]; then
    echo "✅ 证书和私钥匹配"
else
    echo "❌ 证书和私钥不匹配"
    exit 1
fi

# 6. 显示证书信息
echo ""
echo "📋 证书信息:"
echo "============"
openssl x509 -in "$SSL_CERT_PATH" -text -noout | grep -E "Subject:|Issuer:|Not Before:|Not After:"

# 7. 检查证书有效期
echo ""
echo "⏰ 检查证书有效期..."
if openssl x509 -in "$SSL_CERT_PATH" -checkend 86400 > /dev/null 2>&1; then
    echo "✅ 证书在24小时内有效"
else
    echo "⚠️  证书即将过期或已过期"
fi

# 8. 端口检查
echo ""
echo "🔌 检查端口7000..."
if netstat -tlnp | grep :7000 > /dev/null 2>&1; then
    echo "⚠️  端口7000已被占用"
    echo "当前占用进程:"
    netstat -tlnp | grep :7000
else
    echo "✅ 端口7000可用"
fi

# 9. 测试启动Node.js
echo ""
echo "🚀 测试Node.js SSL启动..."
echo "即将启动应用进行测试..."
echo "请观察日志中是否出现："
echo "  🔒 使用HTTPS服务器"
echo "  📡 API服务器: https://localhost:7000"
echo ""
echo "如果看到这些信息，说明SSL配置成功！"
echo "如果看到'降级为HTTP服务器'，说明配置有问题"
echo ""
read -p "按Enter键开始测试启动..."

# 启动测试（5秒后自动停止）
timeout 5s npm run start:api 2>&1 | grep -E "(HTTPS|HTTP|SSL|证书|服务器启动|API服务器)"

echo ""
echo "🎉 SSL配置测试完成！"
echo "==================="
echo "如果上面显示'🔒 使用HTTPS服务器'，配置成功！"
echo "如果显示'🌐 使用HTTP服务器'，请检查证书配置"
echo ""
echo "下一步:"
echo "1. 删除Nginx的7000端口转发配置"
echo "2. 重启Nginx: sudo systemctl reload nginx"
echo "3. 启动应用: npm run start:api"
echo "4. 测试连接: curl -k https://your-domain:7000/api/health" 