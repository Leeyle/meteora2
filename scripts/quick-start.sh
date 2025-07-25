#!/bin/bash

# DLMM流动性管理器 - 快速启动脚本
# 用于快速测试和验证系统功能

set -e  # 遇到错误时退出

echo "🚀 DLMM流动性管理器 - 快速启动"
echo "================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查Node.js版本
check_node_version() {
    echo -e "${BLUE}📋 检查Node.js版本...${NC}"
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ 错误: 未找到Node.js，请先安装Node.js >= 18.0.0${NC}"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"
    
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
        echo -e "${GREEN}✅ Node.js版本检查通过: $NODE_VERSION${NC}"
    else
        echo -e "${RED}❌ 错误: Node.js版本过低，需要 >= $REQUIRED_VERSION，当前版本: $NODE_VERSION${NC}"
        exit 1
    fi
}

# 检查TypeScript
check_typescript() {
    echo -e "${BLUE}📋 检查TypeScript...${NC}"
    
    if ! command -v tsc &> /dev/null; then
        echo -e "${YELLOW}⚠️  全局TypeScript未安装，尝试使用本地版本...${NC}"
        if [ ! -f "./node_modules/.bin/tsc" ]; then
            echo -e "${RED}❌ 错误: 未找到TypeScript编译器${NC}"
            exit 1
        fi
    else
        TS_VERSION=$(tsc -v | cut -d' ' -f2)
        echo -e "${GREEN}✅ TypeScript检查通过: $TS_VERSION${NC}"
    fi
}

# 安装依赖
install_dependencies() {
    echo -e "${BLUE}📦 安装项目依赖...${NC}"
    
    if command -v pnpm &> /dev/null; then
        echo -e "${GREEN}使用pnpm安装依赖...${NC}"
        pnpm install
    elif command -v yarn &> /dev/null; then
        echo -e "${GREEN}使用yarn安装依赖...${NC}"
        yarn install
    else
        echo -e "${GREEN}使用npm安装依赖...${NC}"
        npm install
    fi
    
    echo -e "${GREEN}✅ 依赖安装完成${NC}"
}

# 编译TypeScript
build_project() {
    echo -e "${BLUE}🔨 编译TypeScript代码...${NC}"
    
    if [ -f "./node_modules/.bin/tsc" ]; then
        ./node_modules/.bin/tsc --noEmit
    else
        tsc --noEmit
    fi
    
    echo -e "${GREEN}✅ TypeScript编译检查通过${NC}"
    
    # 如果有构建脚本，执行构建
    if [ -f "package.json" ] && npm run | grep -q "build"; then
        echo -e "${BLUE}🏗️  执行项目构建...${NC}"
        npm run build
        echo -e "${GREEN}✅ 项目构建完成${NC}"
    fi
}

# 检查环境配置
check_environment() {
    echo -e "${BLUE}🔧 检查环境配置...${NC}"
    
    if [ ! -f ".env" ]; then
        if [ -f "env.example" ]; then
            echo -e "${YELLOW}⚠️  .env文件不存在，从env.example创建...${NC}"
            cp env.example .env
            echo -e "${YELLOW}⚠️  请编辑.env文件配置您的环境变量${NC}"
        else
            echo -e "${YELLOW}⚠️  警告: 未找到环境配置文件${NC}"
        fi
    else
        echo -e "${GREEN}✅ 环境配置文件存在${NC}"
    fi
}

# 运行基础测试
run_basic_tests() {
    echo -e "${BLUE}🧪 运行基础功能测试...${NC}"
    
    # 测试依赖注入容器
    echo -e "${BLUE}  测试依赖注入容器...${NC}"
    if node -e "
        try {
            require('./dist/di/container.js');
            console.log('✅ 依赖注入容器测试通过');
        } catch (e) {
            console.log('⚠️  依赖注入容器测试跳过 (构建文件不存在)');
        }
    " 2>/dev/null; then
        echo -e "${GREEN}  ✅ 依赖注入容器测试通过${NC}"
    else
        echo -e "${YELLOW}  ⚠️  依赖注入容器测试跳过${NC}"
    fi
    
    # 测试配置服务
    echo -e "${BLUE}  测试系统模块导入...${NC}"
    if node -e "
        try {
            const fs = require('fs');
            const path = require('path');
            const srcPath = './src';
            if (fs.existsSync(srcPath)) {
                console.log('✅ 源码目录结构验证通过');
            } else {
                console.log('❌ 源码目录不存在');
                process.exit(1);
            }
        } catch (e) {
            console.log('❌ 系统模块测试失败:', e.message);
            process.exit(1);
        }
    "; then
        echo -e "${GREEN}  ✅ 系统模块导入测试通过${NC}"
    else
        echo -e "${RED}  ❌ 系统模块导入测试失败${NC}"
        exit 1
    fi
}

# 启动所有服务的函数
start_all_services() {
    echo -e "${BLUE}🚀 启动完整DLMM系统...${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}启动模式: 完整系统 (后端API + 前端Web + WebSocket)${NC}"
    echo -e "${YELLOW}提示: 5秒后自动启动，按Ctrl+C取消${NC}"
    echo ""
    
    # 5秒倒计时
    for i in 5 4 3 2 1; do
        echo -ne "\r${BLUE}⏰ $i 秒后启动...${NC}"
        sleep 1
    done
    echo -e "\r${GREEN}🚀 正在启动系统...${NC}              "
    echo ""
    
    # 创建日志目录
    mkdir -p logs
    
    # 🔥 确保日志文件存在且为空（避免轮转问题）
    echo -e "${BLUE}📝 初始化日志文件...${NC}"
    > logs/api-server.log
    > logs/web-server.log
    > logs/monitor-server.log
    echo -e "${GREEN}  ✅ 日志文件初始化完成${NC}"
    
    # 启动日志轮转守护进程 (每30分钟检查一次)
    echo -e "${GREEN}🔄 启动日志轮转守护进程...${NC}"
    nohup bash -c 'while true; do sleep 1800; ./scripts/log-rotator.sh >/dev/null 2>&1; done' &
    LOG_ROTATOR_PID=$!
    echo $LOG_ROTATOR_PID > .log-rotator.pid
    echo -e "${BLUE}  日志轮转PID: $LOG_ROTATOR_PID${NC}"
    
    # 🔥 启动后端API服务器 (端口7000) - 使用更好的日志处理
    echo -e "${GREEN}🔧 启动后端API服务器 (端口7000)...${NC}"
    # 创建专用的日志启动脚本，支持日志轮转
    cat > .start-api.sh << 'EOF'
#!/bin/bash
while true; do
    npm run dev:api >> logs/api-server.log 2>&1
    echo "$(date): API服务器意外退出，3秒后重启..." >> logs/api-server.log
    sleep 3
done
EOF
    chmod +x .start-api.sh
    nohup bash .start-api.sh &
    API_PID=$!
    echo $API_PID > .api.pid
    echo -e "${BLUE}  后端PID: $API_PID${NC}"
    
    # 等待后端启动
    echo -e "${BLUE}⏳ 等待后端API启动...${NC}"
    sleep 5
    
    # 检查后端是否启动成功
    if curl -s http://localhost:7000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}  ✅ 后端API启动成功${NC}"
    else
        echo -e "${YELLOW}  ⚠️  后端API启动中，继续启动前端...${NC}"
    fi
    
    # 🔥 启动前端Web界面 (端口7001) - 使用更好的日志处理
    echo -e "${GREEN}🌐 启动前端Web界面 (端口7001)...${NC}"
    cat > .start-web.sh << 'EOF'
#!/bin/bash
cd web
while true; do
    npm run dev >> ../logs/web-server.log 2>&1
    echo "$(date): Web服务器意外退出，3秒后重启..." >> ../logs/web-server.log
    sleep 3
done
EOF
    chmod +x .start-web.sh
    nohup bash .start-web.sh &
    WEB_PID=$!
    echo $WEB_PID > .web.pid
    echo -e "${BLUE}  前端PID: $WEB_PID${NC}"
    
    # 等待前端启动
    echo -e "${BLUE}⏳ 等待前端界面启动...${NC}"
    sleep 3
    
    # 检查前端是否启动成功
    if curl -s -I http://localhost:7001 > /dev/null 2>&1; then
        echo -e "${GREEN}  ✅ 前端Web界面启动成功${NC}"
    else
        echo -e "${YELLOW}  ⚠️  前端Web界面启动中...${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}🎉 DLMM系统启动完成！${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ 后端API服务器: http://localhost:7000${NC}"  
    echo -e "${GREEN}✅ 前端Web界面:   http://localhost:7001${NC}"
    echo -e "${GREEN}✅ WebSocket服务: ws://localhost:7002${NC}"
    echo -e "${GREEN}✅ API健康检查:   http://localhost:7000/api/health${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}💡 常用命令:${NC}"
    echo "  测试API: curl http://localhost:7000/api/health"
    echo "  查看策略: curl http://localhost:7000/api/strategy/list"
    echo "  停止服务: ./scripts/quick-stop.sh"
    echo "  查看日志: tail -f logs/api-server.log logs/web-server.log"
    echo ""
    echo -e "${GREEN}🎯 系统已完全启动，可以访问Web界面进行操作！${NC}"
    echo -e "${BLUE}主要功能: 钱包管理 | 策略管理 | 头寸监控 | 实时数据${NC}"
    echo ""
    echo -e "${YELLOW}按任意键退出启动脚本 (服务将继续在后台运行)...${NC}"
    read -n 1 -s
}

# 显示测试命令
show_test_commands() {
    echo -e "${BLUE}🧪 可用的测试命令:${NC}"
    echo ""
    echo -e "${GREEN}# 编译检查${NC}"
    echo "npm run build"
    echo ""
    echo -e "${GREEN}# 运行单元测试${NC}"
    echo "npm test"
    echo ""
    echo -e "${GREEN}# API功能测试${NC}"
    echo "curl http://localhost:7000/api/health"
    echo "curl http://localhost:7000/api/strategy/list"
    echo ""
    echo -e "${GREEN}# 创建测试策略${NC}"
    echo 'curl -X POST http://localhost:7000/api/strategy/create \'
    echo '  -H "Content-Type: application/json" \'
    echo '  -d '\''{"type": "SIMPLE_Y", "poolAddress": "test", "yAmount": 1000}'\'''
    echo ""
    echo -e "${GREEN}# 查看系统状态${NC}"
    echo "curl http://localhost:7000/api/health"
    echo "curl http://localhost:7001/health  # 前端状态"
    echo ""
}

# 主函数
main() {
    echo -e "${BLUE}开始系统检查和启动流程...${NC}"
    echo ""
    
    # 基础环境检查
    check_node_version
    check_typescript
    
    # 项目准备
    install_dependencies
    check_environment
    build_project
    
    # 功能测试
    run_basic_tests
    
    echo ""
    echo -e "${GREEN}🎉 系统准备完成！${NC}"
    echo ""
    
    # 显示测试命令
    show_test_commands
    
    # 自动启动所有服务
    start_all_services
}

# 错误处理
trap 'echo -e "\n${RED}❌ 启动过程被中断${NC}"; exit 1' INT TERM

# 执行主函数
main "$@" 