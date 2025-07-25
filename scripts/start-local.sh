#!/bin/bash

# 🏠 DLMM本地开发启动脚本
# 无需Docker，直接在本地运行所有服务

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查Node.js环境
check_environment() {
    log_info "检查本地环境..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js未安装，请先安装Node.js (版本 >= 18)"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm未安装，请先安装npm"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt "18" ]; then
        log_warning "建议使用Node.js 18或更高版本，当前版本: $(node --version)"
    fi
    
    log_success "环境检查通过"
}

# 安装依赖
install_dependencies() {
    log_info "检查依赖..."
    
    if [ ! -d "node_modules" ]; then
        log_info "安装项目依赖..."
        npm install
        log_success "依赖安装完成"
    else
        log_info "依赖已安装，跳过"
    fi
    
    # 检查web目录依赖
    if [ -d "web" ] && [ ! -d "web/node_modules" ]; then
        log_info "安装前端依赖..."
        cd web && npm install && cd ..
        log_success "前端依赖安装完成"
    fi
}

# 创建本地配置
setup_local_config() {
    log_info "配置本地环境..."
    
    # 创建本地环境配置
    if [ ! -f ".env.local" ]; then
        cat > .env.local << EOF
# DLMM本地开发环境配置
NODE_ENV=development
LOG_LEVEL=debug

# 服务端口
API_PORT=7000
WS_PORT=7002
WEB_PORT=7001

# Solana配置 (使用devnet进行开发)
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WS_URL=wss://api.devnet.solana.com

# Jupiter API (测试环境)
JUPITER_API_URL=https://quote-api.jup.ag

# Meteora API (测试环境)  
METEORA_API_URL=https://dlmm-api.meteora.ag

# 本地数据存储 (使用文件存储，无需数据库)
DATA_STORAGE=file
DATA_PATH=./data

# 本地缓存 (使用内存缓存，无需Redis)
CACHE_TYPE=memory

# 日志配置
LOG_FILE=./logs/dlmm.log
EOF
        log_success "本地配置文件已创建: .env.local"
    fi
    
    # 创建必要目录
    mkdir -p logs data config
    log_success "本地目录创建完成"
}

# 编译TypeScript
build_project() {
    log_info "编译TypeScript代码..."
    
    if [ ! -f "tsconfig.json" ]; then
        log_warning "tsconfig.json不存在，使用默认配置"
        cat > tsconfig.json << EOF
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
EOF
    fi
    
    npm run build
    log_success "代码编译完成"
}

# 启动API服务器 (后台运行)
start_api_server() {
    log_info "启动API服务器..."
    
    # 设置环境变量
    export NODE_ENV=development
    export $(cat .env.local | grep -v '^#' | xargs)
    
    # 启动API服务器 (后台运行) - 使用简化版
    nohup npm run dev:simple > logs/api-server.log 2>&1 &
    API_PID=$!
    echo $API_PID > .api.pid
    
    # 等待服务器启动
    log_info "等待API服务器启动..."
    sleep 5
    
    # 检查API服务器是否启动成功
    if curl -f http://localhost:7000/api/health &> /dev/null; then
        log_success "API服务器启动成功 (PID: $API_PID)"
        log_info "API地址: http://localhost:7000"
        log_info "健康检查: http://localhost:7000/api/health"
    else
        log_error "API服务器启动失败，查看日志: tail -f logs/api-server.log"
        return 1
    fi
}

# 启动前端服务器 (后台运行)
start_web_server() {
    if [ -d "web" ]; then
        log_info "启动前端服务器..."
        
        cd web
        nohup npm run dev > ../logs/web-server.log 2>&1 &
        WEB_PID=$!
        echo $WEB_PID > ../.web.pid
        cd ..
        
        # 等待前端服务器启动
        log_info "等待前端服务器启动..."
        sleep 3
        
        log_success "前端服务器启动成功 (PID: $WEB_PID)"
        log_info "前端地址: http://localhost:7001"
    else
        log_warning "前端目录不存在，跳过前端服务器启动"
    fi
}

# 显示启动信息
show_startup_info() {
    echo ""
    log_success "🎉 DLMM本地开发环境启动完成!"
    echo ""
    echo "📡 服务地址:"
    echo "   API服务器: http://localhost:7000"
    echo "   健康检查: http://localhost:7000/api/health"
    echo "   系统信息: http://localhost:7000/api/info"
    if [ -d "web" ]; then
        echo "   前端界面: http://localhost:7001"
    fi
    echo ""
    echo "📋 管理命令:"
    echo "   查看API日志: tail -f logs/api-server.log"
    if [ -d "web" ]; then
        echo "   查看前端日志: tail -f logs/web-server.log"
    fi
    echo "   停止服务: ./scripts/start-local.sh stop"
    echo "   重启服务: ./scripts/start-local.sh restart"
    echo ""
    echo "🔧 开发提示:"
    echo "   配置文件: .env.local"
    echo "   数据目录: ./data"
    echo "   日志目录: ./logs"
    echo ""
    
    # 测试API
    log_info "测试API连接..."
    if curl -s http://localhost:7000/api/health | jq . &> /dev/null; then
        echo "✅ API测试成功"
    else
        echo "ℹ️  API响应正常 (需要安装jq来美化JSON输出: brew install jq)"
    fi
}

# 停止服务
stop_services() {
    log_info "停止本地服务..."
    
    # 停止API服务器
    if [ -f ".api.pid" ]; then
        API_PID=$(cat .api.pid)
        if kill -0 $API_PID 2>/dev/null; then
            kill $API_PID
            log_success "API服务器已停止 (PID: $API_PID)"
        fi
        rm -f .api.pid
    fi
    
    # 停止前端服务器
    if [ -f ".web.pid" ]; then
        WEB_PID=$(cat .web.pid)
        if kill -0 $WEB_PID 2>/dev/null; then
            kill $WEB_PID
            log_success "前端服务器已停止 (PID: $WEB_PID)"
        fi
        rm -f .web.pid
    fi
    
    # 清理其他可能的进程
    pkill -f "npm run dev:server" 2>/dev/null || true
    pkill -f "ts-node.*api-server" 2>/dev/null || true
    
    log_success "所有服务已停止"
}

# 查看服务状态
show_status() {
    log_info "检查服务状态..."
    
    # 检查API服务器
    if [ -f ".api.pid" ]; then
        API_PID=$(cat .api.pid)
        if kill -0 $API_PID 2>/dev/null; then
            if curl -f http://localhost:7000/api/health &> /dev/null; then
                log_success "API服务器运行正常 (PID: $API_PID)"
            else
                log_warning "API服务器进程存在但无响应 (PID: $API_PID)"
            fi
        else
            log_error "API服务器未运行"
        fi
    else
        log_error "API服务器未启动"
    fi
    
    # 检查前端服务器
    if [ -f ".web.pid" ]; then
        WEB_PID=$(cat .web.pid)
        if kill -0 $WEB_PID 2>/dev/null; then
            log_success "前端服务器运行正常 (PID: $WEB_PID)"
        else
            log_error "前端服务器未运行"
        fi
    else
        log_warning "前端服务器未启动"
    fi
}

# 主启动函数
start_all() {
    log_info "🚀 启动DLMM本地开发环境..."
    
    check_environment
    install_dependencies
    setup_local_config
    build_project
    start_api_server
    start_web_server
    show_startup_info
}

# 处理命令行参数
case "${1:-start}" in
    "start")
        start_all
        ;;
    "stop")
        stop_services
        ;;
    "restart")
        stop_services
        sleep 2
        start_all
        ;;
    "status")
        show_status
        ;;
    "logs")
        if [ "$2" = "api" ]; then
            tail -f logs/api-server.log
        elif [ "$2" = "web" ]; then
            tail -f logs/web-server.log
        else
            echo "用法: $0 logs [api|web]"
        fi
        ;;
    "help")
        echo "DLMM本地开发脚本使用说明:"
        echo "  ./start-local.sh [command]"
        echo ""
        echo "可用命令:"
        echo "  start   - 启动所有服务 (默认)"
        echo "  stop    - 停止所有服务"  
        echo "  restart - 重启所有服务"
        echo "  status  - 查看服务状态"
        echo "  logs    - 查看日志 [api|web]"
        echo "  help    - 显示帮助"
        ;;
    *)
        log_error "未知命令: $1"
        echo "使用 '$0 help' 查看帮助"
        exit 1
        ;;
esac 