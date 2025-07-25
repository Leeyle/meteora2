#!/bin/bash

# 🔒 SSL证书配置脚本
# 自动配置HTTPS证书路径

echo "🔒 SSL证书配置向导"
echo "====================="

# 检查是否存在.env文件
if [ ! -f .env ]; then
    echo "📋 创建.env文件..."
    cp enhanced-app.env.example .env
fi

echo ""
echo "请选择您的SSL证书配置："
echo "1. 我有自己的SSL证书文件"
echo "2. 我使用Let's Encrypt证书"
echo "3. 我想继续使用HTTP (不配置SSL)"
echo "4. 显示当前配置"

read -p "请选择 (1-4): " choice

case $choice in
    1)
        echo ""
        echo "📄 请输入您的SSL证书文件路径："
        read -p "SSL私钥文件路径 (例: /etc/ssl/private/server.key): " key_path
        read -p "SSL证书文件路径 (例: /etc/ssl/certs/server.crt): " cert_path
        
        # 验证文件是否存在
        if [ ! -f "$key_path" ]; then
            echo "❌ 私钥文件不存在: $key_path"
            exit 1
        fi
        
        if [ ! -f "$cert_path" ]; then
            echo "❌ 证书文件不存在: $cert_path"
            exit 1
        fi
        
        # 更新.env文件
        echo "SSL_KEY_PATH=$key_path" >> .env
        echo "SSL_CERT_PATH=$cert_path" >> .env
        
        echo "✅ SSL证书配置已添加到.env文件"
        echo "📝 私钥: $key_path"
        echo "📝 证书: $cert_path"
        ;;
        
    2)
        echo ""
        read -p "请输入您的域名 (例: example.com): " domain
        
        key_path="/etc/letsencrypt/live/$domain/privkey.pem"
        cert_path="/etc/letsencrypt/live/$domain/fullchain.pem"
        
        # 验证Let's Encrypt证书
        if [ ! -f "$key_path" ]; then
            echo "❌ Let's Encrypt私钥文件不存在: $key_path"
            echo "💡 请先运行: sudo certbot certonly --standalone -d $domain"
            exit 1
        fi
        
        if [ ! -f "$cert_path" ]; then
            echo "❌ Let's Encrypt证书文件不存在: $cert_path"
            echo "💡 请先运行: sudo certbot certonly --standalone -d $domain"
            exit 1
        fi
        
        # 更新.env文件
        echo "SSL_KEY_PATH=$key_path" >> .env
        echo "SSL_CERT_PATH=$cert_path" >> .env
        
        echo "✅ Let's Encrypt证书配置已添加到.env文件"
        echo "📝 域名: $domain"
        echo "📝 私钥: $key_path"
        echo "📝 证书: $cert_path"
        ;;
        
    3)
        echo ""
        echo "📝 继续使用HTTP模式"
        echo "⚠️  注意：HTTPS前端无法连接HTTP后端的WebSocket"
        echo "💡 建议使用反向代理或配置SSL证书"
        ;;
        
    4)
        echo ""
        echo "📋 当前SSL配置："
        echo "==================="
        if grep -q "SSL_KEY_PATH" .env; then
            echo "SSL私钥: $(grep SSL_KEY_PATH .env | cut -d'=' -f2)"
        else
            echo "SSL私钥: 未配置"
        fi
        
        if grep -q "SSL_CERT_PATH" .env; then
            echo "SSL证书: $(grep SSL_CERT_PATH .env | cut -d'=' -f2)"
        else
            echo "SSL证书: 未配置"
        fi
        ;;
        
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

echo ""
echo "🎉 SSL配置完成！"
echo "📖 使用说明："
echo "   1. 配置SSL证书后，后端将自动使用HTTPS协议"
echo "   2. 前端会自动连接到WSS WebSocket"
echo "   3. 重启服务器以应用新配置"
echo ""
echo "🚀 重启命令："
echo "   npm run restart"
echo "   或者"
echo "   npm run stop && npm run start" 