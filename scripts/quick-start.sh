#!/bin/bash

# DLMM流动性管理器 - 简化启动脚本（只启动一次，无守护进程）
# 用于开发/调试环境

set -e

echo "🚀 DLMM流动性管理器 - 简化启动（单进程）"
echo "================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查Node.js版本
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 未找到Node.js，请先安装Node.js >= 18.0.0${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo -e "${RED}❌ Node.js版本过低，需要 >= $REQUIRED_VERSION，当前版本: $NODE_VERSION${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js版本: $NODE_VERSION${NC}"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 安装依赖...${NC}"
    npm install
fi

echo -e "${GREEN}✅ 依赖检查完成${NC}"

# 检查环境变量文件
if [ ! -f ".env" ]; then
    if [ -f "env.example" ]; then
        cp env.example .env
        echo -e "${YELLOW}⚠️  已从env.example复制.env，请根据需要修改${NC}"
    else
        echo -e "${YELLOW}⚠️  未找到.env和env.example，请手动配置环境变量${NC}"
    fi
fi

echo -e "${GREEN}✅ 环境变量检查完成${NC}"

# 编译TypeScript（如有tsc）
if [ -f "./node_modules/.bin/tsc" ]; then
    echo -e "${BLUE}🔨 TypeScript编译检查...${NC}"
    ./node_modules/.bin/tsc --noEmit
    echo -e "${GREEN}✅ TypeScript编译检查通过${NC}"
fi

# 启动后端API服务（前台单进程）
echo -e "${GREEN}🔧 启动后端API服务...${NC}"
echo -e "${YELLOW}（按Ctrl+C可随时停止）${NC}"

# 你可以根据实际入口文件修改下面命令
npx ts-node src/app.ts

# 如果需要同时启动前端，可以新开一个终端，cd web && npm run dev 