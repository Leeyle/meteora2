#!/bin/bash

# 立即清理日志脚本
# 手动执行日志轮转和清理，用于紧急情况

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🧹 DLMM日志立即清理工具${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 检查日志目录
if [ ! -d "./logs" ]; then
    echo -e "${YELLOW}⚠️  日志目录不存在，无需清理${NC}"
    exit 0
fi

# 显示清理前状态
echo -e "${BLUE}📊 清理前日志状态:${NC}"
ls -lh logs/*.log 2>/dev/null | while read -r line; do
    echo -e "${BLUE}  $line${NC}"
done

# 获取总大小
total_size=$(du -sh logs 2>/dev/null | cut -f1)
echo -e "${BLUE}  📊 日志目录总大小: $total_size${NC}"
echo ""

# 询问用户确认
echo -e "${YELLOW}⚠️  即将执行以下操作:${NC}"
echo "  1. 轮转超过2MB的日志文件"
echo "  2. 清理7天前的旧日志文件"
echo "  3. 清理内部日志系统的过期文件"
echo ""
read -p "确认执行清理操作? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ 用户取消操作${NC}"
    exit 0
fi

echo ""
echo -e "${GREEN}🚀 开始清理操作...${NC}"

# 1. 执行日志轮转
echo -e "${BLUE}🔄 步骤1: 执行日志轮转...${NC}"
if [ -f "./scripts/log-rotator.sh" ]; then
    ./scripts/log-rotator.sh
else
    echo -e "${YELLOW}  ⚠️  日志轮转脚本不存在，跳过${NC}"
fi

echo ""

# 2. 清理主要日志文件中的重复内容
echo -e "${BLUE}🔄 步骤2: 清理重复日志内容...${NC}"

# 压缩并清理api-server.log
if [ -f "logs/api-server.log" ]; then
    echo -e "${BLUE}  处理 api-server.log...${NC}"
    
    # 保留最后1000行
    tail -n 1000 logs/api-server.log > logs/api-server.log.tmp
    mv logs/api-server.log.tmp logs/api-server.log
    
    echo -e "${GREEN}  ✅ api-server.log 已压缩到最后1000行${NC}"
fi

# 压缩并清理web-server.log
if [ -f "logs/web-server.log" ]; then
    echo -e "${BLUE}  处理 web-server.log...${NC}"
    
    # 保留最后1000行
    tail -n 1000 logs/web-server.log > logs/web-server.log.tmp
    mv logs/web-server.log.tmp logs/web-server.log
    
    echo -e "${GREEN}  ✅ web-server.log 已压缩到最后1000行${NC}"
fi

echo ""

# 3. 清理过期的系统日志文件
echo -e "${BLUE}🔄 步骤3: 清理过期系统日志...${NC}"

# 清理各个子目录中的过期日志
sub_dirs=("system" "business" "strategies" "errors" "misc")

for sub_dir in "${sub_dirs[@]}"; do
    sub_path="logs/$sub_dir"
    if [ -d "$sub_path" ]; then
        echo -e "${BLUE}  清理 $sub_dir 目录...${NC}"
        
        # 删除7天前的文件
        deleted_count=$(find "$sub_path" -name "*.log*" -type f -mtime +7 -delete -print 2>/dev/null | wc -l)
        error_deleted_count=$(find "$sub_path" -name "*.error*" -type f -mtime +7 -delete -print 2>/dev/null | wc -l)
        
        total_deleted=$((deleted_count + error_deleted_count))
        if [ $total_deleted -gt 0 ]; then
            echo -e "${GREEN}    ✅ 删除了 $total_deleted 个过期文件${NC}"
        else
            echo -e "${BLUE}    ℹ️  无过期文件需要删除${NC}"
        fi
    fi
done

echo ""

# 4. 清理临时文件和备份文件
echo -e "${BLUE}🔄 步骤4: 清理临时文件...${NC}"

# 清理.tmp文件
tmp_count=$(find logs -name "*.tmp" -type f -delete -print 2>/dev/null | wc -l)
if [ $tmp_count -gt 0 ]; then
    echo -e "${GREEN}  ✅ 删除了 $tmp_count 个临时文件${NC}"
fi

# 清理.bak文件
bak_count=$(find logs -name "*.bak" -type f -delete -print 2>/dev/null | wc -l)
if [ $bak_count -gt 0 ]; then
    echo -e "${GREEN}  ✅ 删除了 $bak_count 个备份文件${NC}"
fi

# 清理空目录
find logs -type d -empty -delete 2>/dev/null

echo ""

# 5. 显示清理后状态
echo -e "${BLUE}📊 清理后日志状态:${NC}"
if [ -d "./logs" ]; then
    ls -lh logs/*.log 2>/dev/null | while read -r line; do
        echo -e "${GREEN}  $line${NC}"
    done
    
    # 获取清理后总大小
    new_total_size=$(du -sh logs 2>/dev/null | cut -f1)
    echo -e "${GREEN}  📊 日志目录总大小: $new_total_size${NC}"
else
    echo -e "${GREEN}  📊 日志目录为空${NC}"
fi

echo ""
echo -e "${GREEN}🎉 日志清理完成！${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}💡 建议:${NC}"
echo "  • 系统已配置自动日志轮转（每30分钟检查一次）"
echo "  • 如需手动轮转: ./scripts/log-rotator.sh"
echo "  • 如需完全重置日志: rm -rf logs && mkdir logs"
echo "" 