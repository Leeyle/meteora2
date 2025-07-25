#!/bin/bash

# DLMM流动性管理系统 - 统一管理脚本 v3.0.0
# 集成启动、停止、状态检查、重启等功能
# 使用方法: ./scripts/system-manager.sh [command] [options]

set -e

# 脚本配置
SCRIPT_VERSION="3.0.0"
PROJECT_NAME="DLMM流动性管理系统"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 服务配置
declare -A SERVICES
SERVICES=(
    ["api"]="后端API服务器:7000:npm run dev:api:api-server.log"
    ["web"]="前端Web界面:7001:npm run dev:web:web-server.log"
)

# 全局变量
LOGS_DIR="logs"
DATA_DIR="data"
CONFIG_DIR="config"
PID_DIR=".pids"

# 工具函数
log_header() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

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

# 创建必要目录
create_directories() {
    log_info "创建必要目录..."
    mkdir -p "$LOGS_DIR" "$DATA_DIR" "$CONFIG_DIR" "$PID_DIR"
    log_success "目录创建完成"
}

# 环境检查
check_environment() {
    log_info "检查运行环境..."
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js未安装，请先安装Node.js >= 18.0.0"
        exit 1
    fi
    
    local node_version=$(node -v | cut -d'v' -f2)
    log_success "Node.js版本: $node_version"
    
    # 检查项目文件
    if [ ! -f "package.json" ]; then
        log_error "未找到package.json，请确保在项目根目录运行"
        exit 1
    fi
    
    log_success "环境检查通过"
}

# 获取服务PID
get_service_pid() {
    local service="$1"
    local pid_file="$PID_DIR/${service}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        else
            rm -f "$pid_file"
        fi
    fi
    
    return 1
}

# 健康检查
health_check() {
    local service_name="$1"
    local port="$2"
    local max_attempts=15
    local attempt=0
    
    log_info "健康检查: $service_name (端口$port)"
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -f -s "http://localhost:$port" &> /dev/null || \
           curl -f -s "http://localhost:$port/health" &> /dev/null || \
           curl -f -s "http://localhost:$port/api/health" &> /dev/null; then
            log_success "$service_name 健康检查通过"
            return 0
        fi
        
        sleep 2
        ((attempt++))
        
        if [ $((attempt % 3)) -eq 0 ]; then
            log_info "等待 $service_name 启动... ($attempt/$max_attempts)"
        fi
    done
    
    log_warning "$service_name 健康检查超时"
    return 1
}

# 启动单个服务
start_service() {
    local service="$1"
    local service_info="${SERVICES[$service]}"
    
    if [ -z "$service_info" ]; then
        log_error "未知服务: $service"
        return 1
    fi
    
    IFS=':' read -r name port command logfile <<< "$service_info"
    
    log_info "启动 $name..."
    
    # 检查是否已经运行
    if get_service_pid "$service" &> /dev/null; then
        log_warning "$name 已经在运行"
        return 0
    fi
    
    # 启动服务
    local pid_file="$PID_DIR/${service}.pid"
    local log_file="$LOGS_DIR/$logfile"
    
    if [ "$service" = "web" ]; then
        # 前端服务需要在web目录运行
        cd web
        nohup $command > "../$log_file" 2>&1 &
        local pid=$!
        cd ..
    else
        nohup $command > "$log_file" 2>&1 &
        local pid=$!
    fi
    
    echo "$pid" > "$pid_file"
    log_success "$name 启动成功 (PID: $pid)"
    
    # 健康检查
    if [ -n "$port" ]; then
        health_check "$name" "$port"
    fi
    
    return 0
}

# 停止单个服务
stop_service() {
    local service="$1"
    local service_info="${SERVICES[$service]}"
    
    if [ -z "$service_info" ]; then
        log_error "未知服务: $service"
        return 1
    fi
    
    IFS=':' read -r name port command logfile <<< "$service_info"
    
    log_info "停止 $name..."
    
    local pid
    if pid=$(get_service_pid "$service"); then
        log_info "发送停止信号到进程 $pid"
        kill -TERM "$pid"
        
        # 等待优雅关闭
        local timeout=10
        while [ $timeout -gt 0 ] && kill -0 "$pid" 2>/dev/null; do
            sleep 1
            ((timeout--))
        done
        
        # 如果还在运行，强制终止
        if kill -0 "$pid" 2>/dev/null; then
            log_warning "强制终止进程 $pid"
            kill -KILL "$pid"
        fi
        
        rm -f "$PID_DIR/${service}.pid"
        log_success "$name 已停止"
    else
        log_warning "$name 未在运行"
    fi
    
    return 0
}

# 获取服务状态
get_service_status() {
    local service="$1"
    local service_info="${SERVICES[$service]}"
    
    if [ -z "$service_info" ]; then
        echo "unknown"
        return 1
    fi
    
    IFS=':' read -r name port command logfile <<< "$service_info"
    
    if get_service_pid "$service" &> /dev/null; then
        if [ -n "$port" ]; then
            if curl -f -s "http://localhost:$port" &> /dev/null || \
               curl -f -s "http://localhost:$port/health" &> /dev/null || \
               curl -f -s "http://localhost:$port/api/health" &> /dev/null; then
                echo "running"
            else
                echo "unhealthy"
            fi
        else
            echo "running"
        fi
    else
        echo "stopped"
    fi
}

# 显示所有服务状态
show_status() {
    log_header "$PROJECT_NAME - 服务状态"
    
    printf "%-20s %-15s %-10s %-10s %s\n" "服务名称" "状态" "端口" "PID" "日志文件"
    echo "────────────────────────────────────────────────────────────────"
    
    for service in "${!SERVICES[@]}"; do
        local service_info="${SERVICES[$service]}"
        IFS=':' read -r name port command logfile <<< "$service_info"
        
        local status=$(get_service_status "$service")
        local pid=""
        local status_display=""
        
        if pid=$(get_service_pid "$service" 2>/dev/null); then
            true  # pid变量已设置
        else
            pid="N/A"
        fi
        
        case "$status" in
            "running")
                status_display="运行中"
                ;;
            "unhealthy")
                status_display="不健康"
                ;;
            "stopped")
                status_display="已停止"
                ;;
            *)
                status_display="未知"
                ;;
        esac
        
        printf "%-20s %-15s %-10s %-10s %s\n" "$name" "$status_display" "$port" "$pid" "$logfile"
    done
    
    echo ""
}

# 启动所有服务
start_all() {
    log_header "$PROJECT_NAME - 启动所有服务"
    
    create_directories
    check_environment
    
    # 安装依赖
    log_info "检查依赖..."
    if [ ! -d "node_modules" ]; then
        log_info "安装项目依赖..."
        npm install
    fi
    
    if [ -d "web" ] && [ ! -d "web/node_modules" ]; then
        log_info "安装前端依赖..."
        cd web && npm install && cd ..
    fi
    
    # 构建项目
    if npm run | grep -q "build"; then
        log_info "构建项目..."
        npm run build
    fi
    
    log_info "启动服务..."
    
    # 按顺序启动服务
    start_service "api"
    sleep 3
    start_service "web"
    
    echo ""
    show_status
    
    echo ""
    log_success "🎉 所有服务启动完成！"
    echo ""
    echo -e "${BLUE}📡 服务地址:${NC}"
    echo "  后端API: http://localhost:7000"
    echo "  前端Web: http://localhost:7001"
    echo "  健康检查: http://localhost:7000/api/health"
    echo ""
    echo -e "${BLUE}📋 管理命令:${NC}"
    echo "  查看状态: $0 status"
    echo "  停止服务: $0 stop"
    echo "  重启服务: $0 restart"
    echo "  查看日志: $0 logs [service]"
    echo ""
}

# 停止所有服务
stop_all() {
    log_header "$PROJECT_NAME - 停止所有服务"
    
    for service in "${!SERVICES[@]}"; do
        stop_service "$service"
    done
    
    # 清理临时文件
    log_info "清理临时文件..."
    find "$PID_DIR" -name "*.pid" -delete 2>/dev/null || true
    
    echo ""
    show_status
    log_success "所有服务已停止"
}

# 重启所有服务
restart_all() {
    log_header "$PROJECT_NAME - 重启所有服务"
    
    stop_all
    sleep 2
    start_all
}

# 查看日志
show_logs() {
    local service="$1"
    
    if [ -z "$service" ]; then
        log_info "可用的日志文件:"
        for svc in "${!SERVICES[@]}"; do
            local service_info="${SERVICES[$svc]}"
            IFS=':' read -r name port command logfile <<< "$service_info"
            echo "  $svc: $LOGS_DIR/$logfile"
        done
        return
    fi
    
    local service_info="${SERVICES[$service]}"
    if [ -z "$service_info" ]; then
        log_error "未知服务: $service"
        return 1
    fi
    
    IFS=':' read -r name port command logfile <<< "$service_info"
    local log_file="$LOGS_DIR/$logfile"
    
    if [ -f "$log_file" ]; then
        log_info "显示 $name 日志 ($log_file)"
        echo "按 Ctrl+C 退出日志查看"
        echo ""
        tail -f "$log_file"
    else
        log_error "日志文件不存在: $log_file"
    fi
}

# 显示帮助信息
show_help() {
    echo -e "${CYAN}$PROJECT_NAME - 统一管理脚本 v$SCRIPT_VERSION${NC}"
    echo ""
    echo "使用方法:"
    echo "  $0 <command> [options]"
    echo ""
    echo -e "${GREEN}可用命令:${NC}"
    echo "  start     - 启动所有服务"
    echo "  stop      - 停止所有服务"
    echo "  restart   - 重启所有服务"
    echo "  status    - 查看服务状态"
    echo "  logs [service] - 查看日志"
    echo "  help      - 显示此帮助信息"
    echo ""
    echo -e "${GREEN}可用服务:${NC}"
    for service in "${!SERVICES[@]}"; do
        local service_info="${SERVICES[$service]}"
        IFS=':' read -r name port command logfile <<< "$service_info"
        echo "  $service - $name (端口: $port)"
    done
    echo ""
    echo -e "${GREEN}示例:${NC}"
    echo "  $0 start          # 启动所有服务"
    echo "  $0 logs api       # 查看API服务日志"
    echo "  $0 status         # 查看服务状态"
    echo ""
}

# 主函数
main() {
    local command="${1:-help}"
    local service="$2"
    
    case "$command" in
        "start")
            start_all
            ;;
        "stop")
            stop_all
            ;;
        "restart")
            restart_all
            ;;
        "status")
            show_status
            ;;
        "logs")
            show_logs "$service"
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log_error "未知命令: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 信号处理
cleanup() {
    echo ""
    log_warning "操作被中断"
    exit 1
}

trap cleanup INT TERM

# 执行主函数
main "$@" 