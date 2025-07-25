#!/bin/bash

# 🔍 7000端口访问问题诊断脚本

echo "🔍 7000端口访问问题诊断"
echo "======================="

# 1. 检查应用是否运行
echo "1️⃣ 检查Node.js应用状态..."
if pgrep -f "node.*app" > /dev/null; then
    echo "✅ Node.js应用正在运行"
    echo "进程信息："
    pgrep -f "node.*app" | head -3 | xargs ps -p
else
    echo "❌ Node.js应用未运行"
    echo "请先启动应用: npm run start:api"
    exit 1
fi

# 2. 检查端口绑定
echo ""
echo "2️⃣ 检查端口绑定状态..."
PORT_STATUS=$(netstat -tlnp | grep :7000)
if [ -n "$PORT_STATUS" ]; then
    echo "✅ 端口7000已绑定"
    echo "$PORT_STATUS"
    
    # 检查是否绑定到正确的接口
    if echo "$PORT_STATUS" | grep "0.0.0.0:7000" > /dev/null; then
        echo "✅ 端口绑定到所有接口 (0.0.0.0)"
    elif echo "$PORT_STATUS" | grep "127.0.0.1:7000" > /dev/null; then
        echo "⚠️  端口仅绑定到本地回环 (127.0.0.1)"
        echo "这可能是问题所在！应该绑定到0.0.0.0"
    fi
else
    echo "❌ 端口7000未绑定"
    echo "应用可能启动失败或使用了其他端口"
fi

# 3. 检查防火墙规则
echo ""
echo "3️⃣ 检查防火墙规则..."
if command -v ufw > /dev/null; then
    UFW_STATUS=$(sudo ufw status | grep 7000)
    if [ -n "$UFW_STATUS" ]; then
        echo "✅ UFW防火墙已开放7000端口"
        echo "$UFW_STATUS"
    else
        echo "❌ UFW防火墙未开放7000端口"
        echo "修复命令: sudo ufw allow 7000"
    fi
else
    echo "ℹ️  未检测到UFW防火墙"
fi

# 检查iptables规则
if command -v iptables > /dev/null; then
    IPTABLES_STATUS=$(sudo iptables -L INPUT -n | grep 7000)
    if [ -n "$IPTABLES_STATUS" ]; then
        echo "✅ iptables已开放7000端口"
    else
        echo "⚠️  iptables可能未开放7000端口"
        echo "检查命令: sudo iptables -L INPUT -n | grep 7000"
    fi
fi

# 4. 检查应用日志
echo ""
echo "4️⃣ 检查应用启动日志..."
if [ -f "logs/system/system.log" ]; then
    echo "最近的系统日志："
    tail -5 logs/system/system.log | grep -E "(SSL|HTTPS|HTTP|服务器启动|API服务器)"
elif [ -f "nohup.out" ]; then
    echo "最近的应用日志："
    tail -10 nohup.out | grep -E "(SSL|HTTPS|HTTP|服务器启动|API服务器)"
else
    echo "ℹ️  未找到日志文件"
fi

# 5. 本地连接测试
echo ""
echo "5️⃣ 本地连接测试..."
echo "测试HTTP连接..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:7000/api/health 2>/dev/null | grep -q "200"; then
    echo "✅ HTTP本地连接成功"
else
    echo "❌ HTTP本地连接失败"
fi

echo "测试HTTPS连接..."
if curl -s -k -o /dev/null -w "%{http_code}" https://localhost:7000/api/health 2>/dev/null | grep -q "200"; then
    echo "✅ HTTPS本地连接成功"
else
    echo "❌ HTTPS本地连接失败"
fi

# 6. 检查.env配置
echo ""
echo "6️⃣ 检查SSL配置..."
if [ -f ".env" ]; then
    SSL_KEY_PATH=$(grep "^SSL_KEY_PATH=" .env | cut -d'=' -f2)
    SSL_CERT_PATH=$(grep "^SSL_CERT_PATH=" .env | cut -d'=' -f2)
    
    if [ -n "$SSL_KEY_PATH" ] && [ -n "$SSL_CERT_PATH" ]; then
        echo "✅ SSL配置存在"
        echo "私钥: $SSL_KEY_PATH"
        echo "证书: $SSL_CERT_PATH"
        
        # 检查证书文件
        if [ -f "$SSL_CERT_PATH" ] && [ -f "$SSL_KEY_PATH" ]; then
            echo "✅ SSL证书文件存在"
        else
            echo "❌ SSL证书文件不存在"
        fi
    else
        echo "❌ SSL配置不完整"
    fi
else
    echo "❌ .env文件不存在"
fi

# 7. 网络连接测试
echo ""
echo "7️⃣ 网络连接测试..."
echo "获取服务器IP地址..."
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null)
if [ -n "$SERVER_IP" ]; then
    echo "服务器公网IP: $SERVER_IP"
    echo "外部访问URL: https://$SERVER_IP:7000"
else
    echo "⚠️  无法获取服务器IP"
fi

# 8. 生成诊断报告
echo ""
echo "📋 诊断总结"
echo "==========="

# 检查关键问题
ISSUES=()

if ! pgrep -f "node.*app" > /dev/null; then
    ISSUES+=("Node.js应用未运行")
fi

if ! netstat -tlnp | grep :7000 > /dev/null; then
    ISSUES+=("端口7000未绑定")
fi

if netstat -tlnp | grep "127.0.0.1:7000" > /dev/null; then
    ISSUES+=("端口仅绑定到本地回环")
fi

if command -v ufw > /dev/null && ! sudo ufw status | grep 7000 > /dev/null; then
    ISSUES+=("防火墙未开放7000端口")
fi

if [ ${#ISSUES[@]} -eq 0 ]; then
    echo "🎉 未发现明显问题！"
    echo "如果仍然无法访问，请检查云服务器控制台的安全组设置"
else
    echo "🔧 发现以下问题："
    for issue in "${ISSUES[@]}"; do
        echo "  ❌ $issue"
    done
fi

echo ""
echo "🔧 建议的解决步骤："
echo "1. 确保Node.js应用正确启动SSL模式"
echo "2. 检查端口绑定到0.0.0.0而不是127.0.0.1"
echo "3. 开放防火墙端口: sudo ufw allow 7000"
echo "4. 检查云服务器安全组规则"
echo "5. 测试连接: curl -k https://your-domain:7000/api/health" 