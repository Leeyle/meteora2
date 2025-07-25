#!/bin/bash

# 🚀 DLMM开发模式启动脚本
# 跳过TypeScript严格检查，专注功能开发

echo "🚀 启动DLMM开发服务器..."

# 设置环境变量跳过类型检查
export TS_NODE_SKIP_IGNORE=true
export TS_NODE_TRANSPILE_ONLY=true

# 启动简化版API服务器
echo "📡 启动API服务器 (简化版)..."
node simple-server.js &
API_PID=$!

# 等待服务器启动
sleep 3

# 检查服务器是否启动成功
if curl -f http://localhost:7000/api/health > /dev/null 2>&1; then
    echo "✅ API服务器启动成功!"
    echo ""
    echo "📡 服务地址:"
    echo "   API: http://localhost:7000"
    echo "   健康检查: http://localhost:7000/api/health"
    echo "   系统信息: http://localhost:7000/api/info"
    echo ""
    echo "🔧 测试命令:"
    echo "   curl http://localhost:7000/api/health"
    echo ""
    echo "按 Enter 键停止服务器..."
    read
    
    # 停止服务器
    kill $API_PID
    echo "✅ 服务器已停止"
else
    echo "❌ API服务器启动失败"
    kill $API_PID 2>/dev/null
    exit 1
fi 