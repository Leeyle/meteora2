#!/bin/bash

# DLMM流动性管理器 - 增强版快速关闭脚本
# 支持强制关闭和详细日志输出

set -e  # 遇到错误时退出

echo "🛑 DLMM流动性管理器 - 增强版快速关闭 v3.0.0"
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
TOTAL_PROCESSES_FOUND=0
TOTAL_PROCESSES_STOPPED=0
FORCE_MODE=false
VERBOSE_MODE=false
LOG_FILE="logs/shutdown-$(date +%Y%m%d-%H%M%S).log"

# 参数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE_MODE=true
            shift
            ;;
        --verbose|-v)
            VERBOSE_MODE=true
            shift
            ;;
        --help|-h)
            echo "用法: $0 [选项]"
            echo "选项:"
            echo "  --force, -f     强制关闭所有进程，无需确认"
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

# 详细的进程检查函数
check_process_detailed() {
    local grep_pattern="$1"
    local description="$2"
    
    log "INFO" "🔍 检查进程: $description"
    log "DEBUG" "使用grep模式: $grep_pattern"
    
    # 获取进程详细信息
    local processes=$(ps aux | grep -E "$grep_pattern" | grep -v grep | grep -v "$0")
    
    if [ -n "$processes" ]; then
        log "WARN" "发现 $description 进程:"
        echo "$processes" | while IFS= read -r process; do
            local pid=$(echo "$process" | awk '{print $2}')
            local cpu=$(echo "$process" | awk '{print $3}')
            local mem=$(echo "$process" | awk '{print $4}')
            local cmd=$(echo "$process" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')
            
            log "WARN" "  PID: $pid | CPU: $cpu% | MEM: $mem% | CMD: $cmd"
            echo "$pid"
        done
        ((TOTAL_PROCESSES_FOUND++))
        return 0
    else
        log "SUCCESS" "✅ 未发现 $description 进程"
        return 1
    fi
}

# 增强的进程停止函数
stop_process_enhanced() {
    local grep_pattern="$1"
    local description="$2"
    local timeout="${3:-10}"
    
    log "INFO" "🛑 停止进程: $description"
    
    # 获取进程PID列表
    local pids=$(ps aux | grep -E "$grep_pattern" | grep -v grep | grep -v "$0" | awk '{print $2}')
    
    if [ -z "$pids" ]; then
        log "INFO" "没有找到需要停止的 $description 进程"
        return 0
    fi
    
    # 显示将要停止的进程
    log "INFO" "找到以下 $description 进程:"
    echo "$pids" | while read -r pid; do
        if [ -n "$pid" ]; then
            local process_info=$(ps -p "$pid" -o pid,ppid,pcpu,pmem,cmd --no-headers 2>/dev/null || echo "进程不存在")
            log "INFO" "  PID $pid: $process_info"
        fi
    done
    
    # 第一步：发送TERM信号
    log "INFO" "发送TERM信号进行优雅关闭..."
    local stopped_count=0
    echo "$pids" | while read -r pid; do
        if [ -n "$pid" ]; then
            if kill -0 "$pid" 2>/dev/null; then
                log "DEBUG" "向PID $pid 发送TERM信号"
                if kill -TERM "$pid" 2>/dev/null; then
                    log "SUCCESS" "✅ 成功发送TERM信号到PID $pid"
                    ((stopped_count++))
                else
                    log "ERROR" "❌ 发送TERM信号失败: PID $pid"
                fi
            else
                log "INFO" "PID $pid 已经不存在"
            fi
        fi
    done
    
    # 等待进程停止
    log "INFO" "等待进程优雅停止... (超时: ${timeout}秒)"
    local wait_count=0
    while [ $wait_count -lt $timeout ]; do
        local remaining_pids=$(ps aux | grep -E "$grep_pattern" | grep -v grep | grep -v "$0" | awk '{print $2}')
        if [ -z "$remaining_pids" ]; then
            log "SUCCESS" "✅ 所有 $description 进程已成功停止"
            ((TOTAL_PROCESSES_STOPPED++))
            return 0
        fi
        
        sleep 1
        ((wait_count++))
        if [ $((wait_count % 3)) -eq 0 ]; then
            log "DEBUG" "等待中... (${wait_count}/${timeout}秒)"
        fi
    done
    
    # 第二步：强制停止剩余进程
    local remaining_pids=$(ps aux | grep -E "$grep_pattern" | grep -v grep | grep -v "$0" | awk '{print $2}')
    if [ -n "$remaining_pids" ]; then
        log "WARN" "⚠️ 优雅停止超时，将强制停止剩余进程"
        
        if [ "$FORCE_MODE" = false ]; then
            echo -e "${YELLOW}发现以下进程仍在运行:${NC}"
            echo "$remaining_pids" | while read -r pid; do
                if [ -n "$pid" ]; then
                    local process_info=$(ps -p "$pid" -o pid,cmd --no-headers 2>/dev/null || echo "进程信息获取失败")
                    echo "  $process_info"
                fi
            done
            
            read -p "是否强制停止这些进程? (y/N): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log "INFO" "用户选择不强制停止，跳过"
                return 1
            fi
        fi
        
        log "WARN" "🔨 执行强制停止 (SIGKILL)"
        echo "$remaining_pids" | while read -r pid; do
            if [ -n "$pid" ]; then
                if kill -0 "$pid" 2>/dev/null; then
                    log "DEBUG" "强制终止PID $pid"
                    if kill -KILL "$pid" 2>/dev/null; then
                        log "SUCCESS" "✅ 强制停止成功: PID $pid"
                        ((TOTAL_PROCESSES_STOPPED++))
                    else
                        log "ERROR" "❌ 强制停止失败: PID $pid"
                    fi
                else
                    log "INFO" "PID $pid 已经不存在"
                fi
            fi
        done
        
        # 最终确认
        sleep 2
        local final_check=$(ps aux | grep -E "$grep_pattern" | grep -v grep | grep -v "$0")
        if [ -n "$final_check" ]; then
            log "ERROR" "❌ 仍有进程未能停止:"
            echo "$final_check"
            return 1
        else
            log "SUCCESS" "✅ 所有进程已成功停止"
            ((TOTAL_PROCESSES_STOPPED++))
            return 0
        fi
    fi
}

# 从PID文件停止进程
stop_from_pid_file() {
    local pid_file="$1"
    local description="$2"
    
    if [ ! -f "$pid_file" ]; then
        log "DEBUG" "PID文件不存在: $pid_file"
        return 1
    fi
    
    local pid=$(cat "$pid_file" 2>/dev/null)
    if [ -z "$pid" ]; then
        log "WARN" "PID文件为空: $pid_file"
        rm -f "$pid_file"
        return 1
    fi
    
    log "INFO" "从PID文件停止 $description (PID: $pid)"
    
    if kill -0 "$pid" 2>/dev/null; then
        local process_info=$(ps -p "$pid" -o pid,cmd --no-headers 2>/dev/null || echo "进程信息获取失败")
        log "INFO" "进程信息: $process_info"
        
        if kill -TERM "$pid" 2>/dev/null; then
            log "SUCCESS" "✅ 成功发送停止信号到PID $pid"
            
            # 等待进程停止
            local wait_count=0
            while [ $wait_count -lt 10 ]; do
                if ! kill -0 "$pid" 2>/dev/null; then
                    log "SUCCESS" "✅ 进程 $pid 已停止"
                    rm -f "$pid_file"
                    ((TOTAL_PROCESSES_STOPPED++))
                    return 0
                fi
                sleep 1
                ((wait_count++))
            done
            
            # 强制停止
            if [ "$FORCE_MODE" = true ] || kill -KILL "$pid" 2>/dev/null; then
                log "WARN" "🔨 强制停止进程 $pid"
                sleep 1
                if ! kill -0 "$pid" 2>/dev/null; then
                    log "SUCCESS" "✅ 进程 $pid 已强制停止"
                    rm -f "$pid_file"
                    ((TOTAL_PROCESSES_STOPPED++))
                    return 0
                fi
            fi
        fi
    else
        log "INFO" "PID $pid 进程不存在，清理PID文件"
        rm -f "$pid_file"
        return 1
    fi
    
    log "ERROR" "❌ 无法停止进程 $pid"
    return 1
}

# 检查端口占用详情
check_ports_detailed() {
    log "INFO" "🔍 检查端口占用情况..."
    
    local ports=("7000" "7001" "7002" "7003")
    local port_names=("后端API服务器" "前端Web界面" "WebSocket服务" "监控服务端点")
    local any_occupied=false
    
    for i in "${!ports[@]}"; do
        local port="${ports[$i]}"
        local service_name="${port_names[$i]}"
        
        if lsof -ti:$port >/dev/null 2>&1; then
            log "WARN" "⚠️ 端口 $port ($service_name) 被占用"
            any_occupied=true
            
            # 获取占用端口的进程详细信息
            local port_info=$(lsof -i:$port 2>/dev/null)
            if [ -n "$port_info" ]; then
                log "INFO" "占用端口 $port 的进程信息:"
                echo "$port_info" | tail -n +2 | while IFS= read -r line; do
                    log "INFO" "  $line"
                done
            fi
        else
            log "SUCCESS" "✅ 端口 $port ($service_name) 已释放"
        fi
    done
    
    if [ "$any_occupied" = true ]; then
        log "WARN" "💡 强制释放端口命令示例:"
        for port in "${ports[@]}"; do
            log "INFO" "  sudo lsof -ti:$port | xargs kill -9  # 强制释放端口 $port"
        done
    fi
}

# 清理系统资源
cleanup_system_resources() {
    log "INFO" "🧹 清理系统资源..."
    
    # 清理PID文件
    local pid_files=(".api.pid" ".web.pid" ".ws.pid" ".monitor.pid" ".log-rotator.pid" "server.pid")
    for pid_file in "${pid_files[@]}"; do
        if [ -f "$pid_file" ]; then
            log "INFO" "清理PID文件: $pid_file"
            rm -f "$pid_file"
        fi
    done
    
    # 清理临时启动脚本
    local temp_scripts=(".start-api.sh" ".start-web.sh")
    for script in "${temp_scripts[@]}"; do
        if [ -f "$script" ]; then
            log "INFO" "清理临时脚本: $script"
            rm -f "$script"
        fi
    done
    
    # 清理临时配置文件
    local temp_configs=(".env.tmp" "nohup.out")
    for config in "${temp_configs[@]}"; do
        if [ -f "$config" ]; then
            log "INFO" "清理临时配置: $config"
            rm -f "$config"
        fi
    done
    
    # 清理过期日志文件 (7天前)
    if [ -d "logs" ]; then
        log "INFO" "清理过期日志文件 (7天前)..."
        local old_logs=$(find logs -name "*.log" -mtime +7 2>/dev/null | wc -l)
        if [ "$old_logs" -gt 0 ]; then
            find logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
            log "SUCCESS" "✅ 清理了 $old_logs 个过期日志文件"
        else
            log "INFO" "没有找到过期日志文件"
        fi
    fi
    
    log "SUCCESS" "✅ 系统资源清理完成"
}

# 显示详细的系统状态
show_detailed_system_status() {
    log "INFO" "📊 系统状态详情:"
    
    # 检查DLMM相关进程
    local dlmm_processes=$(ps aux | grep -E "(dlmm|meteora|DLMM|npm.*dev)" | grep -v grep | grep -v "$0")
    if [ -n "$dlmm_processes" ]; then
        log "WARN" "⚠️ 仍有DLMM相关进程运行:"
        echo "$dlmm_processes" | while IFS= read -r process; do
            local pid=$(echo "$process" | awk '{print $2}')
            local cpu=$(echo "$process" | awk '{print $3}')
            local mem=$(echo "$process" | awk '{print $4}')
            local cmd=$(echo "$process" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')
            log "WARN" "  PID: $pid | CPU: $cpu% | MEM: $mem% | CMD: $cmd"
        done
    else
        log "SUCCESS" "✅ 无DLMM相关进程运行"
    fi
    
    # 检查Node.js进程
    local node_processes=$(ps aux | grep -E "node|npm" | grep -v grep | grep -v "$0")
    if [ -n "$node_processes" ]; then
        log "INFO" "Node.js进程:"
        echo "$node_processes" | while IFS= read -r process; do
            local pid=$(echo "$process" | awk '{print $2}')
            local cmd=$(echo "$process" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')
            log "INFO" "  PID: $pid | CMD: $cmd"
        done
    else
        log "SUCCESS" "✅ 无Node.js进程运行"
    fi
    
    # 系统资源使用情况
    local memory_usage=$(free -h | grep "Mem:")
    local disk_usage=$(df -h . | tail -n 1)
    
    log "INFO" "系统资源使用情况:"
    log "INFO" "  内存: $memory_usage"
    log "INFO" "  磁盘: $disk_usage"
    
    # 网络连接
    local network_connections=$(netstat -tulpn 2>/dev/null | grep -E ":700[0-3]" | wc -l)
    log "INFO" "  活跃网络连接 (端口7000-7003): $network_connections"
}

# 生成关闭报告
generate_shutdown_report() {
    local end_time=$(date +%s)
    local duration=$((end_time - SCRIPT_START_TIME))
    
    log "INFO" "📋 关闭操作报告:"
    log "INFO" "  开始时间: $(date -d @$SCRIPT_START_TIME '+%Y-%m-%d %H:%M:%S')"
    log "INFO" "  结束时间: $(date -d @$end_time '+%Y-%m-%d %H:%M:%S')"
    log "INFO" "  总耗时: ${duration}秒"
    log "INFO" "  发现进程数: $TOTAL_PROCESSES_FOUND"
    log "INFO" "  停止进程数: $TOTAL_PROCESSES_STOPPED"
    log "INFO" "  强制模式: $FORCE_MODE"
    log "INFO" "  详细模式: $VERBOSE_MODE"
    log "INFO" "  日志文件: $LOG_FILE"
    
    if [ -f "$LOG_FILE" ]; then
        local log_size=$(wc -l < "$LOG_FILE")
        log "INFO" "  日志行数: $log_size"
    fi
}

# 主要关闭流程
main() {
    log "INFO" "开始DLMM系统关闭流程..."
    log "INFO" "强制模式: $FORCE_MODE | 详细模式: $VERBOSE_MODE"
    
    # 第一阶段：从PID文件停止进程
    log "INFO" "🔄 第一阶段: 从PID文件停止进程"
    stop_from_pid_file ".api.pid" "后端API服务器"
    stop_from_pid_file ".web.pid" "前端Web服务器"
    stop_from_pid_file ".ws.pid" "WebSocket服务器"
    stop_from_pid_file ".monitor.pid" "监控服务"
    stop_from_pid_file ".log-rotator.pid" "日志轮转守护进程"
    
    # 第二阶段：按进程类型停止
    log "INFO" "🔄 第二阶段: 按进程类型停止"
    stop_process_enhanced "npm.*dev:api|node.*dist/app\.js|ts-node.*app\.ts" "后端API服务器进程" 15
    stop_process_enhanced "npm.*dev.*web|node.*server\.js|node.*web" "前端Web服务器进程" 10
    stop_process_enhanced "node.*websocket|WebSocket.*7002" "WebSocket服务器进程" 5
    stop_process_enhanced "node.*monitor|monitor.*7003" "监控服务进程" 5
    stop_process_enhanced "log-rotator|bash.*log-rotator" "日志轮转进程" 5
    
    # 第三阶段：清理剩余DLMM进程
    log "INFO" "🔄 第三阶段: 清理剩余DLMM进程"
    stop_process_enhanced "dlmm|meteora|DLMM" "DLMM相关进程" 5
    
    # 第四阶段：检查端口和清理资源
    log "INFO" "🔄 第四阶段: 检查端口和清理资源"
    check_ports_detailed
    cleanup_system_resources
    
    # 第五阶段：最终状态检查
    log "INFO" "🔄 第五阶段: 最终状态检查"
    show_detailed_system_status
    
    # 生成报告
    generate_shutdown_report
    
    log "SUCCESS" "🎉 DLMM系统关闭流程完成！"
    
    # 显示重启命令
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}💡 重新启动系统:${NC}"
    echo "  ./scripts/quick-start.sh"
    echo ""
    echo -e "${GREEN}💡 单独启动服务:${NC}"
    echo "  npm run dev:api     # 启动后端API服务器"
    echo "  npm run dev:web     # 启动前端Web界面"
    echo ""
    echo -e "${GREEN}💡 查看关闭日志:${NC}"
    echo "  cat $LOG_FILE"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 信号处理
cleanup() {
    log "WARN" "⚠️ 关闭流程被中断"
    log "INFO" "正在清理..."
    generate_shutdown_report
    exit 1
}

trap cleanup INT TERM

# 检查运行环境
if [ ! -f "package.json" ]; then
    log "ERROR" "❌ 错误: 请在项目根目录运行此脚本"
    echo -e "${BLUE}💡 正确用法: cd /path/to/dlmm-liquidity-manager && ./scripts/quick-stop.sh${NC}"
    exit 1
fi

# 执行主函数
main "$@" 