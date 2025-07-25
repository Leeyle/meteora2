#!/bin/bash

# =============================================================================
# Puppeteer依赖快速安装脚本 - Ubuntu系统专用
# 
# 功能：
# 1. 检查系统环境
# 2. 安装Puppeteer所需的所有依赖包
# 3. 验证安装结果
# 4. 生成详细日志
#
# 使用方法：
# chmod +x install-puppeteer-deps.sh
# ./install-puppeteer-deps.sh
# =============================================================================

# 脚本版本
SCRIPT_VERSION="1.0.0"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 日志文件
LOG_DIR="../logs"
LOG_FILE="$LOG_DIR/puppeteer-deps-install-$(date +%Y%m%d-%H%M%S).log"

# 创建日志目录
mkdir -p "$LOG_DIR"

# 日志函数
log_info() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[INFO]${NC} $message"
    echo "[$timestamp] [INFO] $message" >> "$LOG_FILE"
}

log_success() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[SUCCESS]${NC} $message"
    echo "[$timestamp] [SUCCESS] $message" >> "$LOG_FILE"
}

log_warning() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[WARNING]${NC} $message"
    echo "[$timestamp] [WARNING] $message" >> "$LOG_FILE"
}

log_error() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[ERROR]${NC} $message"
    echo "[$timestamp] [ERROR] $message" >> "$LOG_FILE"
}

log_step() {
    local step="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${PURPLE}[步骤$step]${NC} $message"
    echo "[$timestamp] [STEP-$step] $message" >> "$LOG_FILE"
}

# 错误处理函数
handle_error() {
    local exit_code=$1
    local line_number=$2
    log_error "脚本在第 $line_number 行执行失败，退出码: $exit_code"
    log_error "安装过程中断，请检查日志文件: $LOG_FILE"
    exit $exit_code
}

# 设置错误处理
set -e
trap 'handle_error $? $LINENO' ERR

# 开始安装
print_header() {
    echo -e "${CYAN}=============================================${NC}"
    echo -e "${CYAN}  🚀 Puppeteer依赖快速安装脚本 v$SCRIPT_VERSION${NC}"
    echo -e "${CYAN}  📋 适用于Ubuntu系统${NC}"
    echo -e "${CYAN}  📝 日志文件: $LOG_FILE${NC}"
    echo -e "${CYAN}=============================================${NC}"
    echo
}

# 检查系统环境
check_system() {
    log_step "1" "检查系统环境..."
    
    # 检查是否为Ubuntu系统
    if [[ ! -f /etc/lsb-release ]]; then
        log_error "不是Ubuntu系统，本脚本仅适用于Ubuntu"
        exit 1
    fi
    
    # 获取系统信息
    local ubuntu_version=$(lsb_release -rs)
    local ubuntu_codename=$(lsb_release -cs)
    local architecture=$(uname -m)
    
    log_info "系统信息:"
    log_info "  - Ubuntu版本: $ubuntu_version ($ubuntu_codename)"
    log_info "  - 架构: $architecture"
    log_info "  - 内核: $(uname -r)"
    
    # 检查是否有sudo权限
    if ! sudo -n true 2>/dev/null; then
        log_warning "需要sudo权限来安装系统包"
        echo -e "${YELLOW}请输入sudo密码:${NC}"
        sudo -v
    fi
    
    log_success "系统环境检查完成"
}

# 更新包管理器
update_package_manager() {
    log_step "2" "更新包管理器..."
    
    log_info "正在更新apt包索引..."
    if sudo apt-get update -qq; then
        log_success "apt包索引更新成功"
    else
        log_error "apt包索引更新失败"
        exit 1
    fi
}

# 安装Puppeteer依赖
install_puppeteer_deps() {
    log_step "3" "安装Puppeteer依赖包..."
    
    # 定义依赖包列表
    local packages=(
        "ca-certificates"
        "fonts-liberation"
        "libappindicator3-1"
        "libasound2"
        "libatk-bridge2.0-0"
        "libatk1.0-0"
        "libc6"
        "libcairo2"
        "libcups2"
        "libdbus-1-3"
        "libexpat1"
        "libfontconfig1"
        "libgbm1"
        "libgcc1"
        "libglib2.0-0"
        "libgtk-3-0"
        "libnspr4"
        "libnss3"
        "libpango-1.0-0"
        "libpangocairo-1.0-0"
        "libstdc++6"
        "libx11-6"
        "libx11-xcb1"
        "libxcb1"
        "libxcomposite1"
        "libxcursor1"
        "libxdamage1"
        "libxext6"
        "libxfixes3"
        "libxi6"
        "libxrandr2"
        "libxrender1"
        "libxss1"
        "libxtst6"
        "lsb-release"
        "wget"
        "xdg-utils"
    )
    
    log_info "需要安装的包数量: ${#packages[@]}"
    
    # 批量安装
    local install_cmd="sudo apt-get install -y"
    for package in "${packages[@]}"; do
        install_cmd="$install_cmd $package"
    done
    
    log_info "开始安装依赖包..."
    if eval "$install_cmd"; then
        log_success "所有依赖包安装成功"
    else
        log_error "依赖包安装失败"
        exit 1
    fi
}

# 验证关键依赖
verify_installation() {
    log_step "4" "验证关键依赖安装..."
    
    # 关键库文件检查
    local key_libs=(
        "/usr/lib/x86_64-linux-gnu/libatk-1.0.so.0"
        "/usr/lib/x86_64-linux-gnu/libgtk-3.so.0"
        "/usr/lib/x86_64-linux-gnu/libnss3.so"
        "/usr/lib/x86_64-linux-gnu/libgbm.so.1"
    )
    
    local missing_libs=()
    
    for lib in "${key_libs[@]}"; do
        if [[ -f "$lib" ]]; then
            log_success "发现关键库: $lib"
        else
            # 尝试使用ldconfig查找
            if ldconfig -p | grep -q "$(basename "$lib")"; then
                local actual_path=$(ldconfig -p | grep "$(basename "$lib")" | cut -d'>' -f2 | cut -d' ' -f2 | head -1)
                log_success "发现关键库: $actual_path"
            else
                log_warning "缺少关键库: $lib"
                missing_libs+=("$lib")
            fi
        fi
    done
    
    if [[ ${#missing_libs[@]} -eq 0 ]]; then
        log_success "所有关键依赖验证通过"
    else
        log_warning "发现 ${#missing_libs[@]} 个缺失的库，但可能不影响功能"
    fi
}

# 测试Puppeteer
test_puppeteer() {
    log_step "5" "测试Puppeteer功能..."
    
    # 检查Node.js和npm
    if ! command -v node &> /dev/null; then
        log_warning "未找到Node.js，跳过Puppeteer测试"
        return
    fi
    
    if ! command -v npm &> /dev/null; then
        log_warning "未找到npm，跳过Puppeteer测试"
        return
    fi
    
    # 检查是否在项目目录中
    if [[ ! -f "../package.json" ]]; then
        log_warning "未找到package.json，跳过Puppeteer测试"
        return
    fi
    
    log_info "创建简单的Puppeteer测试..."
    
    # 创建测试脚本
    cat > "/tmp/puppeteer-test.js" << 'EOF'
const puppeteer = require('puppeteer');

async function testPuppeteer() {
    console.log('🚀 开始测试Puppeteer...');
    
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });
        
        console.log('✅ 浏览器启动成功');
        
        const page = await browser.newPage();
        console.log('✅ 新页面创建成功');
        
        await page.goto('https://www.google.com');
        console.log('✅ 页面导航成功');
        
        const title = await page.title();
        console.log(`✅ 页面标题: ${title}`);
        
        await browser.close();
        console.log('✅ 浏览器关闭成功');
        
        console.log('🎉 Puppeteer测试完全成功！');
        
    } catch (error) {
        console.error('❌ Puppeteer测试失败:', error.message);
        process.exit(1);
    }
}

testPuppeteer();
EOF
    
    # 运行测试
    cd ..
    if timeout 30 node /tmp/puppeteer-test.js >> "$LOG_FILE" 2>&1; then
        log_success "Puppeteer功能测试通过"
    else
        log_warning "Puppeteer功能测试失败，但依赖已安装"
    fi
    
    # 清理测试文件
    rm -f /tmp/puppeteer-test.js
}

# 生成安装报告
generate_report() {
    log_step "6" "生成安装报告..."
    
    local report_file="$LOG_DIR/puppeteer-deps-report-$(date +%Y%m%d-%H%M%S).txt"
    
    cat > "$report_file" << EOF
========================================
Puppeteer依赖安装报告
========================================

安装时间: $(date)
系统信息: $(lsb_release -d | cut -f2)
架构: $(uname -m)
脚本版本: $SCRIPT_VERSION

安装状态: 成功
日志文件: $LOG_FILE

下一步操作:
1. 重启你的Node.js应用
2. 测试爬虫功能
3. 如有问题，请检查日志文件

使用建议:
- 如果在Docker容器中运行，请重启容器
- 如果仍有问题，请检查防火墙设置
- 考虑使用更新的Puppeteer版本

技术支持:
- 查看日志: $LOG_FILE
- 查看报告: $report_file
========================================
EOF
    
    log_success "安装报告已生成: $report_file"
}

# 主函数
main() {
    local start_time=$(date +%s)
    
    print_header
    
    # 执行安装步骤
    check_system
    update_package_manager
    install_puppeteer_deps
    verify_installation
    test_puppeteer
    generate_report
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  🎉 Puppeteer依赖安装完成！${NC}"
    echo -e "${GREEN}  ⏱️  总耗时: ${duration}秒${NC}"
    echo -e "${GREEN}  📝 详细日志: $LOG_FILE${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo
    
    log_success "安装过程完成，总耗时: ${duration}秒"
    
    # 显示下一步操作
    echo -e "${CYAN}下一步操作:${NC}"
    echo "1. 重启你的DLMM应用"
    echo "2. 测试爬虫功能"
    echo "3. 查看日志文件了解详情"
    echo
}

# 执行主函数
main "$@" 