#!/bin/bash

# 🔄 共享Nginx SSL证书给Node.js应用

echo "🔄 共享Nginx SSL证书配置"
echo "=========================="

# 检查常见的Nginx SSL证书路径
SSL_PATHS=(
    "/etc/nginx/ssl"
    "/etc/ssl/certs"
    "/etc/letsencrypt/live"
    "/usr/local/nginx/conf/ssl"
    "/etc/nginx/conf.d/ssl"
)

echo "🔍 搜索现有SSL证书..."

for path in "${SSL_PATHS[@]}"; do
    if [ -d "$path" ]; then
        echo "发现SSL目录: $path"
        find "$path" -name "*.crt" -o -name "*.pem" -o -name "*.key" | head -5
    fi
done

echo ""
echo "🔍 检查Nginx配置文件中的SSL设置..."

# 搜索Nginx配置中的SSL证书路径
NGINX_CONFIGS=(
    "/etc/nginx/nginx.conf"
    "/etc/nginx/sites-available"
    "/etc/nginx/conf.d"
)

for config_path in "${NGINX_CONFIGS[@]}"; do
    if [ -e "$config_path" ]; then
        echo "搜索配置: $config_path"
        find "$config_path" -name "*.conf" -exec grep -l "ssl_certificate" {} \; 2>/dev/null | head -3
    fi
done

echo ""
echo "📋 请手动检查你的Nginx配置文件，找到类似这样的配置："
echo "ssl_certificate /path/to/certificate.crt;"
echo "ssl_certificate_key /path/to/private.key;"
echo ""
echo "然后在.env文件中配置相同的路径:"
echo "SSL_KEY_PATH=/path/to/private.key"
echo "SSL_CERT_PATH=/path/to/certificate.crt"
echo ""
echo "⚠️  注意：确保Node.js进程有权限读取这些文件" 