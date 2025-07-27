#!/bin/bash

# DLMM流动性管理器 - 增强版快速启动脚本
# 支持详细日志输出和自动重启机制

set -e  # 遇到错误时退出

echo "🚀 DLMM流动性管理器 - 增强版快速启动 v3.0.0"
echo "=================================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 全局变量
SCRIPT_START_TIME=$(date +%s)
SERVICES_STARTED=0
VERBOSE_MODE=false
AUTO_START=true
LOG_FILE="logs/startup-$(date +%Y%m%d-%H%M%S).log"

# 参数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-auto|-n)
            AUTO_START=false
            shift
            ;;
        --verbose|-v)
            VERBOSE_MODE=true
            shift
            ;;
        --help|-h)
            echo "用法: $0 [选项]"
            echo "选项:"
            echo "  --no-auto, -n   不自动启动服务，仅进行环境检查"
            echo "  --verbose, -v   详细输出模式"
            echo "  --help, -h      显示此帮助信息"
            exit 0
            ;;
        *)
            echo "未知选项: $1"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

# 创建日志目录
mkdir -p logs

# 日志函数
log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")
            echo -e "${BLUE}[INFO]${NC} $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} $message"
            ;;
        "DEBUG")
            if [ "$VERBOSE_MODE" = true ]; then
                echo -e "${CYAN}[DEBUG]${NC} $message"
            fi
            ;;
    esac
    
    # 写入日志文件
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

# 检查Node.js版本
check_node_version() {
    log "INFO" "📋 检查Node.js版本..."
    
    if ! command -v node &> /dev/null; then
        log "ERROR" "❌ 未找到Node.js，请先安装Node.js >= 18.0.0"
        return 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"
    
    log "DEBUG" "当前Node.js版本: $NODE_VERSION"
    log "DEBUG" "要求最低版本: $REQUIRED_VERSION"
    
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
        log "SUCCESS" "✅ Node.js版本检查通过: $NODE_VERSION"
        return 0
    else
        log "ERROR" "❌ Node.js版本过低，需要 >= $REQUIRED_VERSION，当前版本: $NODE_VERSION"
        return 1
    fi
}

# 检查TypeScript
check_typescript() {
    log "INFO" "📋 检查TypeScript环境..."
    
    if command -v tsc &> /dev/null; then
        TS_VERSION=$(tsc -v | cut -d' ' -f2)
        log "SUCCESS" "✅ 全局TypeScript: $TS_VERSION"
    elif [ -f "./node_modules/.bin/tsc" ]; then
        TS_VERSION=$(./node_modules/.bin/tsc -v | cut -d' ' -f2)
        log "SUCCESS" "✅ 本地TypeScript: $TS_VERSION"
    else
        log "WARN" "⚠️ 未找到TypeScript编译器，将在安装依赖时获取"
    fi
}

# 自动清理端口并启动服务
auto_kill_ports_and_start() {
    log "INFO" "🔄 自动清理相关端口..."
    
    local ports=("7000" "7001" "7002" "7003")
    local port_names=("后端API服务器" "前端Web界面" "WebSocket服务" "监控服务")
    local killed_any=false
    
    for i in "${!ports[@]}"; do
        local port="${ports[$i]}"
        local service_name="${port_names[$i]}"
        
        if lsof -ti:$port >/dev/null 2>&1; then
            log "WARN" "⚠️ 端口 $port ($service_name) 已被占用，正在清理..."
            
            # 获取占用端口的进程ID
            local pids=$(lsof -ti:$port)
            
            for pid in $pids; do
                if kill -9 $pid 2>/dev/null; then
                    log "SUCCESS" "✅ 已清理端口 $port 的进程 (PID: $pid)"
                    killed_any=true
                else
                    log "WARN" "⚠️ 无法清理端口 $port 的进程 (PID: $pid)"
                fi
            done
        else
            log "DEBUG" "端口 $port ($service_name) 可用"
        fi
    done
    
    if [ "$killed_any" = true ]; then
        log "INFO" "等待端口释放..."
        sleep 2
        log "SUCCESS" "✅ 端口清理完成"
    else
        log "SUCCESS" "✅ 所有端口都可用"
    fi
}

# 检查已运行的服务 (修改后的版本)
check_running_services() {
    log "INFO" "🔍 检查已运行的服务..."
    
    local ports=("7000" "7001" "7002" "7003")
    local port_names=("后端API服务器" "前端Web界面" "WebSocket服务" "监控服务")
    local any_running=false
    
    for i in "${!ports[@]}"; do
        local port="${ports[$i]}"
        local service_name="${port_names[$i]}"
        
        if lsof -ti:$port >/dev/null 2>&1; then
            local port_info=$(lsof -i:$port | tail -n +2 | head -n 1)
            log "WARN" "⚠️ 端口 $port ($service_name) 已被占用: $port_info"
            any_running=true
        else
            log "DEBUG" "端口 $port ($service_name) 可用"
        fi
    done
    
    if [ "$any_running" = true ]; then
        log "INFO" "🔄 自动清理所有占用的端口..."
        auto_kill_ports_and_start
    else
        log "SUCCESS" "✅ 所有端口都可用"
    fi
}

# 安装依赖
install_dependencies() {
    log "INFO" "📦 检查和安装项目依赖..."
    
    # 检查package.json是否存在
    if [ ! -f "package.json" ]; then
        log "ERROR" "❌ 未找到package.json文件"
        return 1
    fi
    
    # 检查node_modules是否存在
    if [ ! -d "node_modules" ]; then
        log "INFO" "node_modules目录不存在，开始安装依赖..."
    else
        log "DEBUG" "node_modules目录已存在，检查是否需要更新..."
        # 检查package.json是否比node_modules新
        if [ "package.json" -nt "node_modules" ]; then
            log "INFO" "package.json已更新，重新安装依赖..."
        else
            log "INFO" "依赖已是最新，跳过安装..."
            return 0
        fi
    fi
    
    # 选择包管理器
    if command -v pnpm &> /dev/null; then
        log "INFO" "使用pnpm安装依赖..."
        pnpm install >> "$LOG_FILE" 2>&1
    elif command -v yarn &> /dev/null; then
        log "INFO" "使用yarn安装依赖..."
        yarn install >> "$LOG_FILE" 2>&1
    else
        log "INFO" "使用npm安装依赖..."
        npm install >> "$LOG_FILE" 2>&1
    fi
    
    log "SUCCESS" "✅ 项目依赖安装完成"
    
    # 检查web子项目依赖
    if [ -d "web" ] && [ -f "web/package.json" ]; then
        log "INFO" "检查Web子项目依赖..."
        cd web
        
        if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
            log "INFO" "安装Web子项目依赖..."
            if command -v pnpm &> /dev/null; then
                pnpm install >> "../$LOG_FILE" 2>&1
            elif command -v yarn &> /dev/null; then
                yarn install >> "../$LOG_FILE" 2>&1
            else
                npm install >> "../$LOG_FILE" 2>&1
            fi
            log "SUCCESS" "✅ Web子项目依赖安装完成"
        else
            log "INFO" "Web子项目依赖已是最新"
        fi
        
        cd ..
    fi
}

# 编译TypeScript
build_project() {
    log "INFO" "🔨 编译TypeScript代码..."
    
    # TypeScript类型检查
    if [ -f "./node_modules/.bin/tsc" ]; then
        log "DEBUG" "使用本地TypeScript编译器进行类型检查..."
        if ./node_modules/.bin/tsc --noEmit >> "$LOG_FILE" 2>&1; then
            log "SUCCESS" "✅ TypeScript类型检查通过"
        else
            log "ERROR" "❌ TypeScript类型检查失败，查看日志: $LOG_FILE"
            return 1
        fi
    else
        log "WARN" "⚠️ 未找到TypeScript编译器，跳过类型检查"
    fi
    
    # 执行构建
    if npm run | grep -q "build"; then
        log "INFO" "执行项目构建..."
        if npm run build >> "$LOG_FILE" 2>&1; then
            log "SUCCESS" "✅ 项目构建完成"
        else
            log "ERROR" "❌ 项目构建失败，查看日志: $LOG_FILE"
            return 1
        fi
    else
        log "INFO" "未找到构建脚本，跳过构建步骤"
    fi
}

# 检查环境配置
check_environment() {
    log "INFO" "🔧 检查环境配置..."
    
    if [ ! -f ".env" ]; then
        if [ -f "env.example" ]; then
            log "WARN" "⚠️ .env文件不存在，从env.example创建..."
            cp env.example .env
            log "WARN" "⚠️ 请编辑.env文件配置您的环境变量"
        else
            log "WARN" "⚠️ 未找到环境配置文件和示例文件"
        fi
    else
        log "SUCCESS" "✅ 环境配置文件存在"
        
        # 检查关键配置项
        local required_vars=("SOLANA_RPC_URL" "PRIVATE_KEY")
        for var in "${required_vars[@]}"; do
            if grep -q "^${var}=" .env && [ -n "$(grep "^${var}=" .env | cut -d'=' -f2)" ]; then
                log "DEBUG" "环境变量 $var 已配置"
            else
                log "WARN" "⚠️ 环境变量 $var 未配置或为空"
            fi
        done
    fi
}

# 运行基础测试
run_basic_tests() {
    log "INFO" "🧪 运行系统基础测试..."
    
    # 测试依赖注入容器
    log "DEBUG" "测试依赖注入容器..."
    if node -e "
        try {
            require('./dist/di/container.js');
            console.log('✅ 依赖注入容器测试通过');
        } catch (e) {
            console.log('⚠️  依赖注入容器测试跳过 (构建文件不存在)');
        }
    " >> "$LOG_FILE" 2>&1; then
        log "SUCCESS" "✅ 依赖注入容器测试通过"
    else
        log "WARN" "⚠️ 依赖注入容器测试跳过"
    fi
    
    # 测试系统模块
    log "DEBUG" "测试系统模块结构..."
    if node -e "
        try {
            const fs = require('fs');
            const path = require('path');
            const srcPath = './src';
            if (fs.existsSync(srcPath)) {
                const requiredDirs = ['server', 'services', 'di', 'types'];
                for (const dir of requiredDirs) {
                    if (!fs.existsSync(path.join(srcPath, dir))) {
                        throw new Error(\`缺少必要目录: \${dir}\`);
                    }
                }
                console.log('✅ 源码目录结构验证通过');
            } else {
                throw new Error('源码目录不存在');
            }
        } catch (e) {
            console.log('❌ 系统模块测试失败:', e.message);
            process.exit(1);
        }
    " >> "$LOG_FILE" 2>&1; then
        log "SUCCESS" "✅ 系统模块结构测试通过"
    else
        log "ERROR" "❌ 系统模块结构测试失败"
        return 1
    fi
}

# 等待服务启动
wait_for_service() {
    local port="$1"
    local service_name="$2"
    local timeout="${3:-30}"
    local check_path="${4:-/}"
    
    log "INFO" "⏳ 等待 $service_name 启动 (端口 $port)..."
    
    local count=0
    while [ $count -lt $timeout ]; do
        if curl -s -f "http://localhost:$port$check_path" >/dev/null 2>&1; then
            log "SUCCESS" "✅ $service_name 启动成功 (耗时 ${count}秒)"
            return 0
        fi
        
        sleep 1
        ((count++))
        
        if [ $((count % 5)) -eq 0 ]; then
            log "DEBUG" "等待 $service_name 启动... (${count}/${timeout}秒)"
        fi
    done
    
    log "ERROR" "❌ $service_name 启动超时 (${timeout}秒)"
    return 1
}

# 检查服务健康状态
check_service_health() {
    local port="$1"
    local service_name="$2"
    local health_path="$3"
    
    log "DEBUG" "检查 $service_name 健康状态..."
    
    local response=$(curl -s "http://localhost:$port$health_path" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$response" ]; then
        log "SUCCESS" "✅ $service_name 健康检查通过"
        if [ "$VERBOSE_MODE" = true ]; then
            echo "$response" | head -n 3
        fi
        return 0
    else
        log "WARN" "⚠️ $service_name 健康检查失败或无响应"
        return 1
    fi
}

# 启动服务的通用函数
start_service() {
    local service_name="$1"
    local start_command="$2"
    local port="$3"
    local pid_file="$4"
    local health_path="${5:-/}"
    local restart_on_failure="${6:-true}"
    
    log "INFO" "🚀 启动 $service_name..."
    
    # 创建启动脚本
    local start_script=".start-${service_name,,}.sh"
    cat > "$start_script" << EOF
#!/bin/bash
cd "\$(dirname "\$0")"
while true; do
    echo "\$(date): 启动 $service_name..." >> logs/${service_name,,}-server.log
    $start_command >> logs/${service_name,,}-server.log 2>&1
    exit_code=\$?
    echo "\$(date): $service_name 退出，退出码: \$exit_code" >> logs/${service_name,,}-server.log
    
    if [ "$restart_on_failure" = "false" ]; then
        break
    fi
    
    echo "\$(date): $service_name 意外退出，3秒后重启..." >> logs/${service_name,,}-server.log
    sleep 3
done
EOF
    
    chmod +x "$start_script"
    
    # 启动服务
    nohup bash "$start_script" &
    local service_pid=$!
    echo $service_pid > "$pid_file"
    
    log "INFO" "$service_name PID: $service_pid"
    log "DEBUG" "PID文件: $pid_file"
    log "DEBUG" "启动脚本: $start_script"
    
    # 等待服务启动
    if wait_for_service "$port" "$service_name" 30 "$health_path"; then
        # 健康检查
        sleep 2
        if check_service_health "$port" "$service_name" "$health_path"; then
            ((SERVICES_STARTED++))
            log "SUCCESS" "🎉 $service_name 启动成功并通过健康检查"
            return 0
        else
            log "WARN" "⚠️ $service_name 启动但健康检查失败"
            return 1
        fi
    else
        log "ERROR" "❌ $service_name 启动失败"
        return 1
    fi
}

# 启动所有服务
start_all_services() {
    log "INFO" "🚀 启动完整DLMM系统..."
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}启动模式: 完整系统 (后端API + 前端Web + WebSocket)${NC}"
    
    if [ "$AUTO_START" = true ]; then
        echo -e "${YELLOW}提示: 5秒后自动启动，按Ctrl+C取消${NC}"
        
        # 5秒倒计时
        for i in 5 4 3 2 1; do
            echo -ne "\r${BLUE}⏰ $i 秒后启动...${NC}"
            sleep 1
        done
        echo -e "\r${GREEN}🚀 正在启动系统...${NC}              "
    fi
    
    echo ""
    
    # 初始化日志文件
    log "INFO" "📝 初始化日志文件..."
    > logs/api-server.log
    > logs/web-server.log
    > logs/monitor-server.log
    log "SUCCESS" "✅ 日志文件初始化完成"
    
    # 启动日志轮转守护进程
    log "INFO" "🔄 启动日志轮转守护进程..."
    nohup bash -c 'while true; do sleep 1800; ./scripts/log-rotator.sh >/dev/null 2>&1; done' &
    LOG_ROTATOR_PID=$!
    echo $LOG_ROTATOR_PID > .log-rotator.pid
    log "SUCCESS" "日志轮转守护进程启动 (PID: $LOG_ROTATOR_PID)"
    
    # 启动后端API服务器
    start_service "API" "npm run dev:api" "7000" ".api.pid" "/api/health"
    
    # 启动前端Web界面
    cd web 2>/dev/null || (log "ERROR" "❌ 未找到web目录"; return 1)
    
    # 根据环境变量选择启动命令
    if [ "${NODE_ENV:-development}" = "production" ]; then
        start_service "Web" "npm start" "7001" "../.web.pid" "/"
    else
        start_service "Web" "npm run dev" "7001" "../.web.pid" "/"
    fi
    
    cd ..
    
    log "SUCCESS" "🎉 DLMM系统启动完成！"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ 后端API服务器: http://localhost:7000${NC}"  
    echo -e "${GREEN}✅ 前端Web界面:   http://localhost:7001${NC}"
    echo -e "${GREEN}✅ WebSocket服务: ws://localhost:7002${NC}"
    echo -e "${GREEN}✅ API健康检查:   http://localhost:7000/api/health${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 显示测试命令
show_test_commands() {
    log "INFO" "🧪 可用的测试命令:"
    
    echo -e "${GREEN}# 基础功能测试${NC}"
    echo "curl http://localhost:7000/api/health"
    echo "curl http://localhost:7000/api/info"
    echo "curl http://localhost:7001/health"
    echo ""
    echo -e "${GREEN}# API功能测试${NC}"
    echo "curl http://localhost:7000/api/strategy/list"
    echo "curl http://localhost:7000/api/logs/instances"
    echo ""
    echo -e "${GREEN}# 创建测试策略${NC}"
    echo 'curl -X POST http://localhost:7000/api/strategy/create \'
    echo '  -H "Content-Type: application/json" \'
    echo '  -d '\''{"type": "SIMPLE_Y", "poolAddress": "test", "yAmount": 1000}'\'''
    echo ""
    echo -e "${GREEN}# 系统管理${NC}"
    echo "./scripts/quick-stop.sh           # 停止所有服务"
    echo "./scripts/quick-stop.sh --force   # 强制停止"
    echo "tail -f logs/api-server.log       # 查看API日志"
    echo "tail -f logs/web-server.log       # 查看Web日志"
    echo ""
}

# 生成启动报告
generate_startup_report() {
    local end_time=$(date +%s)
    local duration=$((end_time - SCRIPT_START_TIME))
    
    log "INFO" "📋 启动操作报告:"
    log "INFO" "  开始时间: $(date -d @$SCRIPT_START_TIME '+%Y-%m-%d %H:%M:%S')"
    log "INFO" "  结束时间: $(date -d @$end_time '+%Y-%m-%d %H:%M:%S')"
    log "INFO" "  总耗时: ${duration}秒"
    log "INFO" "  启动服务数: $SERVICES_STARTED"
    log "INFO" "  详细模式: $VERBOSE_MODE"
    log "INFO" "  自动启动: $AUTO_START"
    log "INFO" "  日志文件: $LOG_FILE"
    
    if [ -f "$LOG_FILE" ]; then
        local log_size=$(wc -l < "$LOG_FILE")
        log "INFO" "  日志行数: $log_size"
    fi
    
    echo ""
    echo -e "${GREEN}🎯 系统已完全启动，可以访问Web界面进行操作！${NC}"
    echo -e "${BLUE}主要功能: 钱包管理 | 策略管理 | 头寸监控 | 实时数据${NC}"
    echo ""
    echo -e "${YELLOW}按任意键退出启动脚本 (服务将继续在后台运行)...${NC}"
    read -n 1 -s
}

# 主函数
main() {
    log "INFO" "开始DLMM系统启动流程..."
    log "INFO" "详细模式: $VERBOSE_MODE | 自动启动: $AUTO_START"
    
    # 第一阶段：环境检查
    log "INFO" "🔄 第一阶段: 环境检查"
    check_node_version || exit 1
    check_typescript
    check_running_services
    
    # 第二阶段：项目准备
    log "INFO" "🔄 第二阶段: 项目准备"
    install_dependencies || exit 1
    check_environment
    build_project || exit 1
    
    # 第三阶段：功能测试
    log "INFO" "🔄 第三阶段: 基础功能测试"
    run_basic_tests || exit 1
    
    log "SUCCESS" "🎉 系统准备完成！"
    
    # 第四阶段：显示测试命令
    show_test_commands
    
    # 第五阶段：启动服务
    if [ "$AUTO_START" = true ]; then
        log "INFO" "🔄 第四阶段: 启动所有服务"
        start_all_services
        
        # 生成报告
        generate_startup_report
    else
        log "INFO" "跳过自动启动，系统检查完成"
        echo ""
        echo -e "${YELLOW}💡 手动启动命令:${NC}"
        echo "  ./scripts/quick-start.sh        # 完整启动"
        echo "  npm run dev:api                 # 仅启动后端"
        echo "  npm run dev:web                 # 仅启动前端"
    fi
}

# 错误处理
cleanup() {
    log "WARN" "⚠️ 启动过程被中断"
    log "INFO" "正在清理..."
    
    # 生成中断报告
    local end_time=$(date +%s)
    local duration=$((end_time - SCRIPT_START_TIME))
    log "INFO" "启动过程在 ${duration}秒 后被中断"
    
    exit 1
}

trap cleanup INT TERM

# 检查运行环境
if [ ! -f "package.json" ]; then
    log "ERROR" "❌ 错误: 请在项目根目录运行此脚本"
    echo -e "${BLUE}💡 正确用法: cd /path/to/dlmm-liquidity-manager && ./scripts/quick-start.sh${NC}"
    exit 1
fi

# 执行主函数
main "$@"