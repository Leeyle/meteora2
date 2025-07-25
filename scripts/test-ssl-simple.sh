#!/bin/bash

# 🔒 SSL证书简化测试脚本

echo "🔒 SSL证书简化配置测试"
echo "==============================="

# 检查当前目录
if [ ! -f "package.json" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

# 获取用户输入
echo "请提供你的SSL证书文件路径:"
read -p "1. 私钥文件路径 (.key): " PRIVATE_KEY_PATH
read -p "2. 证书文件路径 (.crt): " CERT_PATH

# 验证文件存在
if [ ! -f "$PRIVATE_KEY_PATH" ]; then
    echo "❌ 私钥文件不存在: $PRIVATE_KEY_PATH"
    exit 1
fi

if [ ! -f "$CERT_PATH" ]; then
    echo "❌ 证书文件不存在: $CERT_PATH"
    exit 1
fi

# 创建SSL证书目录
echo "📁 创建SSL证书目录..."
mkdir -p ssl-certificates
chmod 700 ssl-certificates

# 复制证书文件
echo "📋 复制证书文件..."
cp "$PRIVATE_KEY_PATH" ssl-certificates/private.key
cp "$CERT_PATH" ssl-certificates/certificate.crt

# 设置文件权限
echo "🔐 设置文件权限..."
chmod 600 ssl-certificates/private.key
chmod 644 ssl-certificates/certificate.crt

# 验证证书
echo "🔍 验证证书..."

# 检查私钥格式
if openssl rsa -in ssl-certificates/private.key -check -noout > /dev/null 2>&1; then
    echo "✅ 私钥格式正确"
else
    echo "❌ 私钥格式错误"
    exit 1
fi

# 检查证书格式
if openssl x509 -in ssl-certificates/certificate.crt -text -noout > /dev/null 2>&1; then
    echo "✅ 证书格式正确"
else
    echo "❌ 证书格式错误"
    exit 1
fi

# 检查证书和私钥匹配
CERT_MODULUS=$(openssl x509 -noout -modulus -in ssl-certificates/certificate.crt | openssl md5)
KEY_MODULUS=$(openssl rsa -noout -modulus -in ssl-certificates/private.key | openssl md5)

if [ "$CERT_MODULUS" = "$KEY_MODULUS" ]; then
    echo "✅ 证书和私钥匹配"
else
    echo "❌ 证书和私钥不匹配"
    exit 1
fi

# 获取绝对路径
CURRENT_DIR=$(pwd)
SSL_KEY_PATH="$CURRENT_DIR/ssl-certificates/private.key"
SSL_CERT_PATH="$CURRENT_DIR/ssl-certificates/certificate.crt"

# 更新.env文件
echo "📝 更新.env文件..."

# 检查.env文件
if [ ! -f ".env" ]; then
    echo "创建.env文件..."
    cp env.example .env
fi

# 删除现有的SSL配置
sed -i.bak '/^SSL_KEY_PATH=/d' .env
sed -i.bak '/^SSL_CERT_PATH=/d' .env
sed -i.bak '/^SSL_CA_PATH=/d' .env

# 添加新的SSL配置
echo "" >> .env
echo "# 🔒 SSL证书配置（简化版）" >> .env
echo "SSL_KEY_PATH=$SSL_KEY_PATH" >> .env
echo "SSL_CERT_PATH=$SSL_CERT_PATH" >> .env
echo "# SSL_CA_PATH=  # 可选，如果有证书链文件可以取消注释" >> .env

# 显示证书信息
echo ""
echo "📋 证书信息:"
echo "--------------------------------"
openssl x509 -in ssl-certificates/certificate.crt -text -noout | grep -E "Subject:|Issuer:|Not Before:|Not After:"

# 检查是否需要证书链
echo ""
echo "🔍 证书链检查:"
echo "--------------------------------"
ISSUER=$(openssl x509 -in ssl-certificates/certificate.crt -noout -issuer)
SUBJECT=$(openssl x509 -in ssl-certificates/certificate.crt -noout -subject)

if [ "$ISSUER" = "$SUBJECT" ]; then
    echo "ℹ️  这是自签名证书，不需要证书链"
else
    echo "ℹ️  这是CA签名证书"
    echo "💡 大多数情况下不需要额外的证书链文件"
    echo "💡 如果浏览器提示证书问题，可能需要添加证书链"
fi

echo ""
echo "🎉 SSL证书配置完成！"
echo "=================================="
echo "配置文件："
echo "  私钥: $SSL_KEY_PATH"
echo "  证书: $SSL_CERT_PATH"
echo ""
echo "下一步："
echo "1. 重启服务器: npm run start:api"
echo "2. 测试HTTPS连接: curl -k https://localhost:7000/api/health"
echo "3. 检查浏览器连接: https://www.badkid.top:7000"
echo ""
echo "🔧 如果遇到浏览器证书警告，可能需要添加证书链文件" 