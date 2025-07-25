#!/bin/bash

# DLMM流动性管理器 - 增强版关闭脚本
# 提供更强大的进程管理和端口清理功能

set -e  # 遇到错误时退出

echo "🛑 DLMM流动性管理器 - 增强版关闭脚本 v3.0.0"
echo "============================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# 统计变量
stopped_count=0
force_killed_count=0
total_processes=0

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

log_debug() {
    echo -e "${PURPLE}[DEBUG]${NC} $1"
}

# 检查进程是否存在的函数
is_process_running() {
    local pid="$1"
    kill -0 "$pid" 2>/dev/null
}

# 优雅停止进程的函数
stop_process_gracefully() {
    local pid="$1"
    local description="$2"
    
    if is_process_running "$pid"; then
        log_info "停止 $description (PID: $pid)"
        if kill -TERM "$pid" 2>/dev/null; then
            log_success "已发送TERM信号到进程 $pid"
            return 0
        else
            log_warning "无法发送TERM信号到进程 $pid"
            return 1
        fi
    else
        log_warning "进程 $pid 已经不存在"
        return 1
    fi
}

# 强制停止进程的函数
force_kill_process() {
    local pid="$1"
    local description="$2"
    
    if is_process_running "$pid"; then
        log_warning "强制停止 $description (PID: $pid)"
        if kill -KILL "$pid" 2>/dev/null; then
            log_success "已强制停止进程 $pid"
            ((force_killed_count++))
            return 0
        else
            log_error "无法强制停止进程 $pid"
            return 1
        fi
    else
        log_info "进程 $pid 已经不存在"
        return 0
    fi
}

# 从PID文件停止进程
stop_from_pid_file() {
    local pid_file="$1"
    local description="$2"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if [ -n "$pid" ]; then
            log_info "从PID文件停止 $description (PID: $pid)"
            
            # 尝试优雅停止
            if stop_process_gracefully "$pid" "$description"; then
                # 等待进程停止
                local wait_count=0
                while is_process_running "$pid" && [ $wait_count -lt 10 ]; do
                    sleep 1
                    ((wait_count++))
                done
                
                # 如果进程仍在运行，强制停止
                if is_process_running "$pid"; then
                    log_warning "进程 $pid 未响应TERM信号，强制停止"
                    force_kill_process "$pid" "$description"
                else
                    log_success "进程 $pid 已优雅停止"
                    ((stopped_count++))
                fi
            fi
        fi
        rm -f "$pid_file"
        log_info "已删除PID文件: $pid_file"
    else
        log_info "PID文件不存在: $pid_file"
    fi
}

# 通过进程名停止进程
stop_processes_by_pattern() {
    local pattern="$1"
    local description="$2"
    
    log_info "查找 $description 进程..."
    
    local pids=$(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}')
    
    if [ -n "$pids" ]; then
        log_info "发现 $description 进程: $pids"
        echo "$pids" | while read -r pid; do
            if [ -n "$pid" ]; then
                # 尝试优雅停止
                if stop_process_gracefully "$pid" "$description"; then
                    # 等待进程停止
                    local wait_count=0
                    while is_process_running "$pid" && [ $wait_count -lt 5 ]; do
                        sleep 1
                        ((wait_count++))
                    done
                    
                    # 如果进程仍在运行，强制停止
                    if is_process_running "$pid"; then
                        log_warning "进程 $pid 未响应TERM信号，强制停止"
                        force_kill_process "$pid" "$description"
                    else
                        log_success "进程 $pid 已优雅停止"
                        ((stopped_count++))
                    fi
                fi
                ((total_processes++))
            fi
        done
    else
        log_success "未发现运行中的 $description"
    fi
}

# 清理端口占用
cleanup_ports() {
    local ports=("7000" "7001" "7002" "7003")
    local port_names=("后端API服务器" "前端Web界面" "WebSocket服务" "监控服务端点")
    local any_cleaned=false
    
    log_info "检查端口占用情况..."
    
    for i in "${!ports[@]}"; do
        local port="${ports[$i]}"
        local service_name="${port_names[$i]}"
        
        if lsof -ti:$port >/dev/null 2>&1; then
            log_warning "端口 $port ($service_name) 仍被占用"
            
            # 获取占用端口的进程
            local port_pids=$(lsof -ti:$port 2>/dev/null)
            if [ -n "$port_pids" ]; then
                echo "$port_pids" | while read -r pid; do
                    if [ -n "$pid" ]; then
                        # 检查是否是DLMM相关进程
                        local process_info=$(ps -p "$pid" -o pid,ppid,command --no-headers 2>/dev/null)
                        if echo "$process_info" | grep -q -E "(dlmm|meteora|DLMM|npm|node|bash.*\.start)"; then
                            log_warning "发现DLMM相关进程占用端口 $port (PID: $pid)"
                            log_info "进程信息: $process_info"
                            
                            # 尝试停止进程
                            if stop_process_gracefully "$pid" "端口占用进程"; then
                                sleep 2
                                if is_process_running "$pid"; then
                                    log_warning "强制停止端口占用进程 $pid"
                                    force_kill_process "$pid" "端口占用进程"
                                fi
                                any_cleaned=true
                            fi
                        else
                            log_info "端口 $port 被外部进程占用 (PID: $pid)"
                            log_info "进程信息: $process_info"
                        fi
                    fi
                done
            fi
        else
            log_success "端口 $port ($service_name) 已释放"
        fi
    done
    
    if [ "$any_cleaned" = true ]; then
        log_success "端口清理完成"
    fi
}

# 清理临时文件
cleanup_files() {
    log_info "清理临时文件..."
    
    # 清理PID文件
    local pid_files=(".api.pid" ".web.pid" ".log-rotator.pid" ".ws.pid" ".monitor.pid")
    for pid_file in "${pid_files[@]}"; do
        if [ -f "$pid_file" ]; then
            rm -f "$pid_file"
            log_info "已删除PID文件: $pid_file"
        fi
    done
    
    # 清理启动脚本
    local script_files=(".start-api.sh" ".start-web.sh")
    for script_file in "${script_files[@]}"; do
        if [ -f "$script_file" ]; then
            rm -f "$script_file"
            log_info "已删除启动脚本: $script_file"
        fi
    done
    
    # 清理日志文件
    if [ -d "logs" ]; then
        log_info "清理旧日志文件..."
        find logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
        log_success "旧日志文件已清理"
    fi
    
    # 清理临时配置文件
    if [ -f ".env.tmp" ]; then
        rm -f .env.tmp
        log_info "已删除临时配置文件: .env.tmp"
    fi
    
    log_success "临时文件清理完成"
}

# 显示系统状态
show_system_status() {
    log_info "当前系统状态:"
    echo ""
    
    # 检查DLMM相关进程
    local dlmm_processes=$(ps aux | grep -E "(dlmm|meteora|DLMM|bash.*\.start|npm.*dev)" | grep -v grep)
    if [ -n "$dlmm_processes" ]; then
        log_warning "仍有DLMM相关进程运行:"
        echo "$dlmm_processes"
    else
        log_success "无DLMM相关进程运行"
    fi
    
    echo ""
    
    # 检查Node.js进程
    local node_processes=$(ps aux | grep -E "(npm.*dev|node.*server|node.*dist|ts-node)" | grep -v grep)
    if [ -n "$node_processes" ]; then
        log_warning "仍有Node.js服务进程运行:"
        echo "$node_processes"
    else
        log_success "无Node.js服务进程运行"
    fi
    
    echo ""
    log_info "停止统计:"
    log_info "  优雅停止: $stopped_count 个进程"
    log_info "  强制停止: $force_killed_count 个进程"
    log_info "  总进程数: $total_processes 个进程"
}

# 主关闭流程
main() {
    log_info "开始增强版DLMM系统关闭流程..."
    echo ""
    
    # 第一阶段：从PID文件停止进程
    log_info "🔄 第一阶段: 从PID文件停止进程"
    echo ""
    
    stop_from_pid_file ".api.pid" "后端API服务器"
    stop_from_pid_file ".web.pid" "前端Web服务器"
    stop_from_pid_file ".log-rotator.pid" "日志轮转守护进程"
    
    echo ""
    
    # 第二阶段：通过进程名停止进程
    log_info "🔄 第二阶段: 通过进程名停止进程"
    echo ""
    
    stop_processes_by_pattern "bash.*\.start-api\.sh\|npm.*dev:api\|node.*dist/app\.js\|ts-node.*app\.ts" "后端API服务器"
    stop_processes_by_pattern "bash.*\.start-web\.sh\|npm.*dev\|node.*server\.js\|node.*web" "前端Web服务器"
    stop_processes_by_pattern "node.*websocket.*server\|WebSocket.*7002" "WebSocket服务器"
    stop_processes_by_pattern "dlmm\|meteora\|DLMM" "DLMM相关进程"
    
    echo ""
    
    # 第三阶段：清理端口占用
    log_info "🔄 第三阶段: 清理端口占用"
    echo ""
    
    cleanup_ports
    
    echo ""
    
    # 第四阶段：清理临时文件
    log_info "🔄 第四阶段: 清理临时文件"
    echo ""
    
    cleanup_files
    
    echo ""
    
    # 第五阶段：显示最终状态
    log_info "🔄 第五阶段: 显示系统状态"
    echo ""
    
    show_system_status
    
    echo ""
    log_success "🎉 增强版DLMM系统关闭流程完成！"
    echo ""
    
    # 显示重启命令
    log_info "💡 重新启动系统命令:"
    echo "cd $(pwd)"
    echo "./scripts/quick-start.sh"
    echo ""
    log_info "💡 单独启动命令:"
    echo "npm run dev:api     # 启动后端API服务器"
    echo "npm run dev:web     # 启动前端Web界面"
    echo ""
}

# 信号处理
cleanup() {
    echo ""
    log_warning "⚠️  关闭流程被中断"
    exit 1
}

trap cleanup INT TERM

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    log_error "❌ 错误: 请在项目根目录运行此脚本"
    log_info "💡 正确用法: cd /path/to/dlmm-liquidity-manager && ./scripts/enhanced-stop.sh"
    exit 1
fi

# 执行主函数
main "$@" 