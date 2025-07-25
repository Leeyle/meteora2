#!/bin/bash

# 🛡️ DLMM安全环境设置脚本
# 在隔离环境中安装和运行依赖

set -e

echo "🛡️ 设置DLMM安全开发环境..."

# 检查Docker是否可用（最安全的隔离方式）
if command -v docker &> /dev/null; then
    echo "🐳 检测到Docker，推荐使用容器隔离"
    echo "是否使用Docker容器运行？(y/n)"
    read -p "> " use_docker
    
    if [ "$use_docker" = "y" ]; then
        echo "🔧 创建Docker隔离环境..."
        cat > Dockerfile.safe << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --only=production
COPY . .
EXPOSE 7000 7002
CMD ["node", "simple-server.js"]
EOF
        
        echo "✅ Docker环境配置完成"
        echo "🚀 启动命令: docker build -t dlmm-safe -f Dockerfile.safe . && docker run -p 7000:7000 -p 7002:7002 dlmm-safe"
        exit 0
    fi
fi

# 创建npm安全配置
echo "🔧 配置npm安全设置..."

# 创建.npmrc安全配置
cat > .npmrc << EOF
# npm安全配置
audit-level=moderate
fund=false
optional=false
save-exact=true
package-lock=true

# 禁用可能的安全风险
scripts-prepend-node-path=warn-only
EOF

# 创建安全的package.json（仅包含基础依赖）
echo "📦 创建安全依赖列表..."

cat > package-safe.json << 'EOF'
{
  "name": "dlmm-safe",
  "version": "1.0.0", 
  "description": "DLMM安全运行版本",
  "main": "simple-server.js",
  "scripts": {
    "start": "node simple-server.js",
    "audit": "npm audit --audit-level=moderate",
    "check": "npm ls --depth=0"
  },
  "dependencies": {
    "express": "4.18.2",
    "cors": "2.8.5",
    "ws": "8.14.2"
  },
  "devDependencies": {
    "@types/node": "20.10.5",
    "@types/express": "4.17.21",
    "@types/cors": "2.8.17",
    "@types/ws": "8.5.10"
  }
}
EOF

echo "🔍 检查依赖安全性..."

# 备份原始package.json
cp package.json package.json.backup

# 使用安全版本
cp package-safe.json package.json

echo "📊 安装前安全检查..."
echo "即将安装的依赖："
echo "- express: Web框架 (每周4000万下载)"
echo "- cors: 跨域支持 (每周300万下载)"  
echo "- ws: WebSocket支持 (每周700万下载)"
echo ""
echo "这些都是广泛使用的成熟包，安全风险极低。"
echo ""
echo "是否继续安装？(y/n)"
read -p "> " install_deps

if [ "$install_deps" = "y" ]; then
    echo "📦 安装基础依赖..."
    npm install
    
    echo "🔍 运行安全审计..."
    npm audit --audit-level=moderate
    
    echo "✅ 安全依赖安装完成"
    echo ""
    echo "🚀 启动命令："
    echo "   npm start"
    echo ""
    echo "🔧 恢复完整功能（如需要）："
    echo "   cp package.json.backup package.json"
    echo "   npm install"
else
    echo "❌ 安装已取消"
    # 恢复原始package.json
    cp package.json.backup package.json
    rm package-safe.json
fi

echo "🛡️ 安全环境设置完成" 