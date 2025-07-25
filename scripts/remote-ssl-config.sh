#!/bin/bash

# 🌐 远程服务器SSL配置脚本
# 这个脚本需要在云服务器上运行

echo "🌐 远程服务器SSL配置"
echo "===================="

# 检查是否在云服务器上运行
if [ -d "/Volumes" ]; then
    echo "❌ 检测到这是本地Mac机器"
    echo "请将此脚本上传到云服务器并在云服务器上运行"
    echo ""
    echo "上传命令示例:"
    echo "scp scripts/remote-ssl-config.sh user@your-server:/tmp/"
    echo "ssh user@your-server 'bash /tmp/remote-ssl-config.sh'"
    exit 1
fi

echo "✅ 正在云服务器上运行"

# 1. 查找Nginx SSL证书配置
echo "🔍 查找Nginx SSL证书配置..."
SSL_CONFIGS=$(grep -r "ssl_certificate" /etc/nginx/ 2>/dev/null | head -5)

if [ -z "$SSL_CONFIGS" ]; then
    echo "❌ 未找到Nginx SSL配置"
    echo "请手动检查Nginx配置文件"
    exit 1
fi

echo "发现SSL配置:"
echo "$SSL_CONFIGS"

# 2. 提取证书路径
echo ""
echo "🔍 提取证书路径..."
CERT_PATH=$(echo "$SSL_CONFIGS" | grep "ssl_certificate[^_]" | head -1 | sed 's/.*ssl_certificate[[:space:]]*\([^;]*\);.*/\1/')
KEY_PATH=$(echo "$SSL_CONFIGS" | grep "ssl_certificate_key" | head -1 | sed 's/.*ssl_certificate_key[[:space:]]*\([^;]*\);.*/\1/')

echo "证书文件: $CERT_PATH"
echo "私钥文件: $KEY_PATH"

# 3. 验证证书文件存在
if [ ! -f "$CERT_PATH" ]; then
    echo "❌ 证书文件不存在: $CERT_PATH"
    exit 1
fi

if [ ! -f "$KEY_PATH" ]; then
    echo "❌ 私钥文件不存在: $KEY_PATH"
    exit 1
fi

echo "✅ 证书文件验证通过"

# 4. 查找项目目录
echo ""
echo "🔍 查找项目目录..."
PROJECT_DIRS=(
    "/home/*/dlmm-liquidity-manager"
    "/opt/dlmm-liquidity-manager"
    "/var/www/dlmm-liquidity-manager"
    "/root/dlmm-liquidity-manager"
)

PROJECT_DIR=""
for dir in "${PROJECT_DIRS[@]}"; do
    if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
        PROJECT_DIR="$dir"
        break
    fi
done

if [ -z "$PROJECT_DIR" ]; then
    echo "❌ 未找到项目目录"
    echo "请手动指定项目路径:"
    read -p "项目完整路径: " PROJECT_DIR
fi

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ 项目目录不存在: $PROJECT_DIR"
    exit 1
fi

echo "✅ 项目目录: $PROJECT_DIR"

# 5. 配置.env文件
echo ""
echo "📝 配置.env文件..."
cd "$PROJECT_DIR"

# 创建.env文件如果不存在
if [ ! -f ".env" ]; then
    if [ -f "env.example" ]; then
        cp env.example .env
        echo "✅ 从env.example创建.env文件"
    else
        touch .env
        echo "✅ 创建空的.env文件"
    fi
fi

# 删除现有SSL配置
sed -i.bak '/^SSL_KEY_PATH=/d' .env
sed -i.bak '/^SSL_CERT_PATH=/d' .env
sed -i.bak '/^SSL_CA_PATH=/d' .env

# 添加新的SSL配置
echo "" >> .env
echo "# 🔒 SSL证书配置 (共享Nginx证书)" >> .env
echo "SSL_KEY_PATH=$KEY_PATH" >> .env
echo "SSL_CERT_PATH=$CERT_PATH" >> .env

echo "✅ .env文件配置完成"

# 6. 检查权限
echo ""
echo "🔐 检查文件权限..."
if [ -r "$KEY_PATH" ] && [ -r "$CERT_PATH" ]; then
    echo "✅ 证书文件权限正常"
else
    echo "⚠️  证书文件权限可能有问题，可能需要调整权限"
fi

# 7. 显示配置摘要
echo ""
echo "🎉 配置完成！"
echo "================"
echo "项目目录: $PROJECT_DIR"
echo "证书文件: $CERT_PATH"
echo "私钥文件: $KEY_PATH"
echo ""
echo "下一步:"
echo "1. 编辑Nginx配置，删除7000端口转发"
echo "2. 重启Nginx: sudo systemctl reload nginx"
echo "3. 重启Node.js应用: npm run start:api"
echo "4. 测试连接: curl -k https://your-domain:7000/api/health" 