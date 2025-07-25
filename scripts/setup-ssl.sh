#!/bin/bash

# 🔒 DLMM系统SSL证书快速配置脚本

echo "🔒 DLMM系统SSL证书配置向导"
echo "=================================="

# 检查当前目录
if [ ! -f "package.json" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

# 创建SSL证书目录
echo "📁 创建SSL证书目录..."
mkdir -p ssl-certificates
chmod 700 ssl-certificates
echo "✅ SSL证书目录创建完成"

# 检查.env文件
if [ ! -f ".env" ]; then
    echo "📝 创建.env文件..."
    cp env.example .env
    echo "✅ .env文件创建完成"
fi

# 获取用户输入
echo ""
echo "请提供证书文件路径:"
read -p "私钥文件路径 (private.key): " PRIVATE_KEY_PATH
read -p "证书文件路径 (certificate.crt): " CERT_PATH
read -p "CA证书链路径 (ca-bundle.crt, 可选): " CA_PATH

# 验证文件存在
if [ ! -f "$PRIVATE_KEY_PATH" ]; then
    echo "❌ 私钥文件不存在: $PRIVATE_KEY_PATH"
    exit 1
fi

if [ ! -f "$CERT_PATH" ]; then
    echo "❌ 证书文件不存在: $CERT_PATH"
    exit 1
fi

# 复制证书文件
echo "📋 复制证书文件到项目目录..."
cp "$PRIVATE_KEY_PATH" ssl-certificates/private.key
cp "$CERT_PATH" ssl-certificates/certificate.crt

if [ -f "$CA_PATH" ]; then
    cp "$CA_PATH" ssl-certificates/ca-bundle.crt
    echo "✅ CA证书链已复制"
fi

# 设置文件权限
echo "🔐 设置文件权限..."
chmod 600 ssl-certificates/private.key
chmod 644 ssl-certificates/certificate.crt
if [ -f "ssl-certificates/ca-bundle.crt" ]; then
    chmod 644 ssl-certificates/ca-bundle.crt
fi

# 获取绝对路径
CURRENT_DIR=$(pwd)
SSL_KEY_PATH="$CURRENT_DIR/ssl-certificates/private.key"
SSL_CERT_PATH="$CURRENT_DIR/ssl-certificates/certificate.crt"
SSL_CA_PATH="$CURRENT_DIR/ssl-certificates/ca-bundle.crt"

# 更新.env文件
echo "📝 更新.env文件..."

# 删除现有的SSL配置
sed -i.bak '/^SSL_KEY_PATH=/d' .env
sed -i.bak '/^SSL_CERT_PATH=/d' .env
sed -i.bak '/^SSL_CA_PATH=/d' .env

# 添加新的SSL配置
echo "" >> .env
echo "# 🔒 SSL证书配置" >> .env
echo "SSL_KEY_PATH=$SSL_KEY_PATH" >> .env
echo "SSL_CERT_PATH=$SSL_CERT_PATH" >> .env
if [ -f "ssl-certificates/ca-bundle.crt" ]; then
    echo "SSL_CA_PATH=$SSL_CA_PATH" >> .env
fi

echo "✅ .env文件更新完成"

# 验证证书
echo "🔍 验证证书配置..."

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

# 显示证书信息
echo ""
echo "📋 证书信息:"
echo "--------------------------------"
openssl x509 -in ssl-certificates/certificate.crt -text -noout | grep -E "Subject:|Issuer:|Not Before:|Not After:"

echo ""
echo "🎉 SSL证书配置完成!"
echo "=================================="
echo "配置文件位置:"
echo "  私钥: $SSL_KEY_PATH"
echo "  证书: $SSL_CERT_PATH"
if [ -f "ssl-certificates/ca-bundle.crt" ]; then
    echo "  CA链: $SSL_CA_PATH"
fi
echo ""
echo "下一步："
echo "1. 检查云服务器防火墙设置: sudo ufw allow 7000"
echo "2. 重启服务器: npm run start:api"
echo "3. 测试HTTPS连接: curl -k https://localhost:7000/api/health"
echo ""
echo "📖 详细说明请参考: docs/SSL配置指南.md" 