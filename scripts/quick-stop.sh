#!/bin/bash

# DLMM流动性管理器 - 快速关闭脚本
# 用于一键停止所有相关服务进程

set -e  # 遇到错误时退出

echo "🛑 DLMM流动性管理器 - 快速关闭 v2.0.0"
echo "======================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 停止计数器
stopped_count=0
total_processes=0

# 检查并停止进程的函数
stop_process() {
    local process_name="$1"
    local grep_pattern="$2"
    local description="$3"
    
    echo -e "${BLUE}🔍 检查 ${description}...${NC}"
    
    # 查找匹配的进程
    local pids=$(ps aux | grep "$grep_pattern" | grep -v grep | awk '{print $2}')
    
    if [ -n "$pids" ]; then
        echo -e "${YELLOW}📋 发现进程: ${description}${NC}"
        echo "$pids" | while read -r pid; do
            if [ -n "$pid" ]; then
                echo -e "${BLUE}  停止进程 PID: $pid${NC}"
                if kill -TERM "$pid" 2>/dev/null; then
                    echo -e "${GREEN}  ✅ 进程 $pid 已发送停止信号${NC}"
                    ((stopped_count++))
                else
                    echo -e "${YELLOW}  ⚠️  进程 $pid 可能已经停止${NC}"
                fi
                ((total_processes++))
            fi
        done
    else
        echo -e "${GREEN}  ✅ 未发现运行中的 ${description}${NC}"
    fi
}

# 强制停止进程的函数
force_stop_process() {
    local grep_pattern="$1"
    local description="$2"
    
    echo -e "${YELLOW}🔨 强制停止 ${description}...${NC}"
    
    local pids=$(ps aux | grep "$grep_pattern" | grep -v grep | awk '{print $2}')
    
    if [ -n "$pids" ]; then
        echo "$pids" | while read -r pid; do
            if [ -n "$pid" ]; then
                echo -e "${RED}  强制终止进程 PID: $pid${NC}"
                kill -KILL "$pid" 2>/dev/null || echo -e "${YELLOW}    进程 $pid 已经不存在${NC}"
            fi
        done
    fi
}

# 等待进程停止
wait_for_processes() {
    echo -e "${BLUE}⏳ 等待进程优雅停止...${NC}"
    sleep 3
}

# 检查端口占用
check_ports() {
    echo -e "${BLUE}🔍 检查端口占用情况...${NC}"
    
    local ports=("7000" "7001" "7002" "7003")
    local port_names=("后端API服务器" "前端Web界面" "WebSocket服务" "监控服务端点")
    local any_occupied=false
    
    for i in "${!ports[@]}"; do
        local port="${ports[$i]}"
        local service_name="${port_names[$i]}"
        
        if lsof -ti:$port >/dev/null 2>&1; then
            echo -e "${YELLOW}  ⚠️  端口 $port ($service_name) 仍被占用${NC}"
            any_occupied=true
            
            # 显示占用端口的进程信息
            local port_info=$(lsof -i:$port 2>/dev/null | tail -n +2)
            if [ -n "$port_info" ]; then
                echo -e "${BLUE}    占用进程信息:${NC}"
                echo "$port_info" | while IFS= read -r line; do
                    echo -e "${BLUE}    $line${NC}"
                done
            fi
            
            # 检查是否是DLMM相关进程
            local dlmm_process=$(lsof -ti:$port 2>/dev/null | xargs ps -p 2>/dev/null | grep -E "(dlmm|meteora|DLMM|npm|node)" | grep -v grep)
            if [ -n "$dlmm_process" ]; then
                echo -e "${RED}    🔥 发现DLMM相关进程占用端口，需要强制停止${NC}"
            else
                echo -e "${YELLOW}    ℹ️  端口被外部进程占用，非DLMM相关${NC}"
            fi
        else
            echo -e "${GREEN}  ✅ 端口 $port ($service_name) 已释放${NC}"
        fi
    done
    
    if [ "$any_occupied" = true ]; then
        echo -e "${YELLOW}  💡 如需强制释放端口，请使用: sudo lsof -ti:PORT | xargs kill -9${NC}"
    fi
}

# 清理临时文件
cleanup_files() {
    echo -e "${BLUE}🧹 清理临时文件...${NC}"
    
    # 清理可能的日志文件
    if [ -d "logs" ]; then
        echo -e "${BLUE}  清理日志文件...${NC}"
        find logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
        echo -e "${GREEN}  ✅ 旧日志文件已清理${NC}"
    fi
    
    # 清理临时配置文件
    if [ -f ".env.tmp" ]; then
        rm -f .env.tmp
        echo -e "${GREEN}  ✅ 临时配置文件已清理${NC}"
    fi
    
    # 清理进程ID文件
    if [ -f "server.pid" ]; then
        rm -f server.pid
        echo -e "${GREEN}  ✅ 进程ID文件已清理${NC}"
    fi
    
    # 清理我们的PID文件
    if [ -f ".api.pid" ] || [ -f ".web.pid" ]; then
        rm -f .api.pid .web.pid
        echo -e "${GREEN}  ✅ 服务PID文件已清理${NC}"
    fi
    
    # 清理其他可能的PID文件
    if [ -f ".ws.pid" ] || [ -f ".monitor.pid" ] || [ -f ".log-rotator.pid" ]; then
        rm -f .ws.pid .monitor.pid .log-rotator.pid
        echo -e "${GREEN}  ✅ 其他PID文件已清理${NC}"
    fi
    
    # 🔥 清理新增的启动脚本
    if [ -f ".start-api.sh" ] || [ -f ".start-web.sh" ]; then
        rm -f .start-api.sh .start-web.sh
        echo -e "${GREEN}  ✅ 启动脚本已清理${NC}"
    fi
    
    echo -e "${GREEN}  ✅ 临时文件清理完成${NC}"
}

# 显示系统状态
show_system_status() {
    echo -e "${BLUE}📊 当前系统状态:${NC}"
    echo ""
    
    # 检查DLMM相关进程
    local dlmm_processes=$(ps aux | grep -E "(dlmm|meteora|DLMM)" | grep -v grep)
    if [ -n "$dlmm_processes" ]; then
        echo -e "${YELLOW}⚠️  仍有DLMM相关进程运行:${NC}"
        echo "$dlmm_processes"
    else
        echo -e "${GREEN}✅ 无DLMM相关进程运行${NC}"
    fi
    
    echo ""
    
    # 检查Node.js进程  
    local node_processes=$(ps aux | grep -E "npm.*dev|node.*server|node.*dist|ts-node" | grep -v grep)
    if [ -n "$node_processes" ]; then
        echo -e "${YELLOW}⚠️  仍有Node.js服务进程运行:${NC}"
        echo "$node_processes"
    else
        echo -e "${GREEN}✅ 无Node.js服务进程运行${NC}"
    fi
}

# 主关闭流程
main() {
    echo -e "${BLUE}开始关闭DLMM系统...${NC}"
    echo ""
    
    # 第一阶段：优雅停止
    echo -e "${BLUE}🔄 第一阶段: 优雅停止进程${NC}"
    echo ""
    
    # 从PID文件停止进程
    if [ -f ".api.pid" ]; then
        echo -e "${BLUE}🔍 从PID文件停止后端API服务器...${NC}"
        local api_pid=$(cat .api.pid)
        if [ -n "$api_pid" ] && kill -0 "$api_pid" 2>/dev/null; then
            echo -e "${BLUE}  停止后端API进程 PID: $api_pid${NC}"
            kill -TERM "$api_pid"
            sleep 2
            # 检查进程是否还在运行
            if kill -0 "$api_pid" 2>/dev/null; then
                echo -e "${YELLOW}  ⚠️  进程 $api_pid 仍在运行，发送强制停止信号${NC}"
                kill -KILL "$api_pid" 2>/dev/null
            fi
        fi
        rm -f .api.pid
    fi
    
    if [ -f ".web.pid" ]; then
        echo -e "${BLUE}🔍 从PID文件停止前端Web服务器...${NC}"
        local web_pid=$(cat .web.pid)
        if [ -n "$web_pid" ] && kill -0 "$web_pid" 2>/dev/null; then
            echo -e "${BLUE}  停止前端Web进程 PID: $web_pid${NC}"
            kill -TERM "$web_pid"
            sleep 2
            # 检查进程是否还在运行
            if kill -0 "$web_pid" 2>/dev/null; then
                echo -e "${YELLOW}  ⚠️  进程 $web_pid 仍在运行，发送强制停止信号${NC}"
                kill -KILL "$web_pid" 2>/dev/null
            fi
        fi
        rm -f .web.pid
    fi
    
    # 停止日志轮转守护进程
    if [ -f ".log-rotator.pid" ]; then
        echo -e "${BLUE}🔍 从PID文件停止日志轮转守护进程...${NC}"
        local log_rotator_pid=$(cat .log-rotator.pid)
        if [ -n "$log_rotator_pid" ] && kill -0 "$log_rotator_pid" 2>/dev/null; then
            echo -e "${BLUE}  停止日志轮转进程 PID: $log_rotator_pid${NC}"
            kill -TERM "$log_rotator_pid"
            sleep 1
            # 检查进程是否还在运行
            if kill -0 "$log_rotator_pid" 2>/dev/null; then
                echo -e "${YELLOW}  ⚠️  进程 $log_rotator_pid 仍在运行，发送强制停止信号${NC}"
                kill -KILL "$log_rotator_pid" 2>/dev/null
            fi
        fi
        rm -f .log-rotator.pid
    fi
    
    # 停止后端API服务器 - 匹配启动脚本创建的进程
    stop_process "api-server" "bash.*\.start-api\.sh\|npm.*dev:api\|node.*dist/app\.js\|ts-node.*app\.ts" "后端API服务器"
    
    # 停止前端Web服务器 - 匹配启动脚本创建的进程
    stop_process "web-server" "bash.*\.start-web\.sh\|npm.*dev\|node.*server\.js\|node.*web" "前端Web服务器"
    
    # 停止WebSocket服务器
    stop_process "websocket-server" "node.*websocket.*server\|WebSocket.*7002" "WebSocket服务器"
    
    # 停止其他可能的DLMM进程
    stop_process "dlmm-process" "dlmm\|meteora\|DLMM" "DLMM相关进程"
    
    # 等待进程停止
    wait_for_processes
    
    # 第二阶段：检查是否需要强制停止
    echo ""
    echo -e "${BLUE}🔄 第二阶段: 检查剩余进程${NC}"
    echo ""
    
    # 检查是否还有相关进程运行
    local remaining_processes=$(ps aux | grep -E "(bash.*\.start-api\.sh|bash.*\.start-web\.sh|npm.*dev|node.*dist/app\.js|node.*server\.js|node.*websocket)" | grep -v grep)
    
    if [ -n "$remaining_processes" ]; then
        echo -e "${YELLOW}⚠️  发现仍在运行的进程，询问是否强制停止...${NC}"
        echo "$remaining_processes"
        echo ""
        
        read -p "是否强制停止剩余进程? (y/N): " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}🔨 执行强制停止...${NC}"
            force_stop_process "bash.*\.start-api\.sh\|npm.*dev:api\|node.*dist/app\.js" "后端API服务器"
            force_stop_process "bash.*\.start-web\.sh\|npm.*dev\|node.*server\.js" "前端Web服务器"
            force_stop_process "node.*websocket.*server" "WebSocket服务器"
            force_stop_process "dlmm\|meteora\|DLMM" "DLMM相关进程"
        fi
    fi
    
    # 第三阶段：清理和检查
    echo ""
    echo -e "${BLUE}🔄 第三阶段: 清理和状态检查${NC}"
    echo ""
    
    # 检查端口占用
    check_ports
    
    echo ""
    
    # 清理临时文件
    cleanup_files
    
    echo ""
    
    # 显示最终状态
    show_system_status
    
    echo ""
    echo -e "${GREEN}🎉 DLMM系统关闭流程完成！${NC}"
    echo ""
    
    # 显示重启命令
    echo -e "${BLUE}💡 重新启动系统命令:${NC}"
    echo "cd $(pwd)"
    echo "./scripts/quick-start.sh"
    echo ""
    echo -e "${BLUE}💡 单独启动命令:${NC}"
    echo "npm run dev:api     # 启动后端API服务器"
    echo "npm run dev:web     # 启动前端Web界面"
    echo ""

}

# 信号处理
cleanup() {
    echo ""
    echo -e "${YELLOW}⚠️  关闭流程被中断${NC}"
    exit 1
}

trap cleanup INT TERM

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    echo -e "${BLUE}💡 正确用法: cd /path/to/dlmm-liquidity-manager && ./scripts/quick-stop.sh${NC}"
    exit 1
fi

# 执行主函数
main "$@" 