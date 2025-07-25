#!/bin/bash

# 日志轮转脚本
# 限制日志文件大小，自动清理旧日志

# 配置参数
MAX_SIZE_MB=2              # 最大文件大小(MB) 
MAX_FILES=3                # 最大保留文件数
LOG_DIR="./logs"           # 日志目录

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 需要轮转的日志文件列表
LOG_FILES=(
    "api-server.log"
    "web-server.log"
    "monitor-server.log"
)

# 转换MB到字节
MAX_SIZE_BYTES=$((MAX_SIZE_MB * 1024 * 1024))

# 检查并轮转单个日志文件
rotate_log_file() {
    local file_path="$1"
    local file_name=$(basename "$file_path")
    local dir_path=$(dirname "$file_path")
    
    # 检查文件是否存在
    if [ ! -f "$file_path" ]; then
        return 0
    fi
    
    # 获取文件大小
    local file_size=$(stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path" 2>/dev/null)
    
    if [ -z "$file_size" ]; then
        echo -e "${YELLOW}⚠️  无法获取文件大小: $file_path${NC}"
        return 1
    fi
    
    # 检查是否需要轮转
    if [ "$file_size" -lt "$MAX_SIZE_BYTES" ]; then
        return 0
    fi
    
    echo -e "${BLUE}🔄 轮转日志文件: $file_name (大小: $(($file_size / 1024 / 1024))MB)${NC}"
    
    # 🔥 关键修复：使用更安全的轮转方式
    # 1. 先复制文件内容到备份文件
    local backup_file="$dir_path/$file_name.1"
    
    # 删除最旧的文件
    local oldest_file="$dir_path/$file_name.$((MAX_FILES - 1))"
    if [ -f "$oldest_file" ]; then
        rm -f "$oldest_file"
        echo -e "${YELLOW}  🗑️  删除旧文件: $file_name.$((MAX_FILES - 1))${NC}"
    fi
    
    # 移动现有文件
    for ((i = MAX_FILES - 2; i >= 1; i--)); do
        local old_file="$dir_path/$file_name.$i"
        local new_file="$dir_path/$file_name.$((i + 1))"
        
        if [ -f "$old_file" ]; then
            mv "$old_file" "$new_file"
            echo -e "${BLUE}  📦 移动: $file_name.$i → $file_name.$((i + 1))${NC}"
        fi
    done
    
    # 🔥 关键操作：复制当前文件到备份位置，然后截断原文件
    cp "$file_path" "$backup_file"
    echo -e "${BLUE}  📄 备份: $file_name → $file_name.1${NC}"
    
    # 🔥 截断原文件而不是删除（保持文件描述符有效）
    > "$file_path"
    echo -e "${GREEN}  ✅ 截断原文件: $file_name (保持进程连接)${NC}"
    
    echo -e "${GREEN}  ✅ 轮转完成: $file_name${NC}"
}

# 🔥 新增：检查并轮转已轮转的日志文件
rotate_numbered_log_files() {
    local base_file="$1"
    local file_name=$(basename "$base_file")
    local dir_path=$(dirname "$base_file")
    
    echo -e "${BLUE}🔍 检查已轮转的日志文件: $file_name.*${NC}"
    
    # 检查 .log.1, .log.2 等文件
    for ((i = 1; i < MAX_FILES; i++)); do
        local numbered_file="$dir_path/$file_name.$i"
        
        if [ -f "$numbered_file" ]; then
            local file_size=$(stat -f%z "$numbered_file" 2>/dev/null || stat -c%s "$numbered_file" 2>/dev/null)
            
            if [ -n "$file_size" ] && [ "$file_size" -ge "$MAX_SIZE_BYTES" ]; then
                echo -e "${YELLOW}  ⚠️  发现超大已轮转文件: $file_name.$i ($(($file_size / 1024 / 1024))MB)${NC}"
                
                # 如果是最后一个编号，直接删除
                if [ $i -eq $((MAX_FILES - 1)) ]; then
                    rm -f "$numbered_file"
                    echo -e "${RED}  🗑️  删除超大文件: $file_name.$i${NC}"
                else
                    # 否则分割文件
                    split_large_log_file "$numbered_file"
                fi
            fi
        fi
    done
}

# 🔥 新增：分割超大日志文件
split_large_log_file() {
    local file_path="$1"
    local file_name=$(basename "$file_path")
    local dir_path=$(dirname "$file_path")
    local temp_dir="$dir_path/temp_split"
    
    echo -e "${BLUE}  ✂️  分割超大文件: $file_name${NC}"
    
    # 创建临时目录
    mkdir -p "$temp_dir"
    
    # 分割文件为2MB的块
    split -b 2m "$file_path" "$temp_dir/${file_name}_part_"
    
    # 删除原文件
    rm -f "$file_path"
    
    # 重命名分割后的文件，只保留最新的部分
    local part_files=($(ls "$temp_dir/${file_name}_part_"* 2>/dev/null | sort))
    local part_count=${#part_files[@]}
    
    if [ $part_count -gt 0 ]; then
        # 保留最后一个部分作为新的日志文件
        local last_part="${part_files[$((part_count - 1))]}"
        mv "$last_part" "$file_path"
        echo -e "${GREEN}    ✅ 保留最新部分: $file_name${NC}"
        
        # 删除其他部分
        for part_file in "${part_files[@]}"; do
            if [ "$part_file" != "$last_part" ]; then
                rm -f "$part_file"
            fi
        done
        echo -e "${YELLOW}    🗑️  删除旧部分: $((part_count - 1))个文件${NC}"
    fi
    
    # 清理临时目录
    rmdir "$temp_dir" 2>/dev/null
}

# 注意：由于使用截断方式轮转日志，不再需要复杂的进程重启逻辑

# 清理过期的日志文件
cleanup_old_logs() {
    echo -e "${BLUE}🧹 清理过期的日志文件...${NC}"
    
    # 清理各个子目录中的过期日志
    local sub_dirs=("system" "business" "strategies" "errors" "misc")
    
    for sub_dir in "${sub_dirs[@]}"; do
        local sub_path="$LOG_DIR/$sub_dir"
        if [ -d "$sub_path" ]; then
            # 查找并删除7天前的日志文件
            find "$sub_path" -name "*.log*" -type f -mtime +7 -delete 2>/dev/null
            find "$sub_path" -name "*.error*" -type f -mtime +7 -delete 2>/dev/null
        fi
    done
    
    echo -e "${GREEN}  ✅ 过期日志清理完成${NC}"
}

# 显示日志统计信息
show_log_stats() {
    echo -e "${BLUE}📊 日志文件统计:${NC}"
    
    if [ ! -d "$LOG_DIR" ]; then
        echo -e "${YELLOW}  ⚠️  日志目录不存在: $LOG_DIR${NC}"
        return
    fi
    
    local total_size=0
    local file_count=0
    
    for log_file in "${LOG_FILES[@]}"; do
        local file_path="$LOG_DIR/$log_file"
        
        if [ -f "$file_path" ]; then
            local file_size=$(stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path" 2>/dev/null)
            local size_mb=$((file_size / 1024 / 1024))
            
            echo -e "${GREEN}  📄 $log_file: ${size_mb}MB${NC}"
            total_size=$((total_size + file_size))
            file_count=$((file_count + 1))
            
            # 检查是否接近大小限制
            if [ "$file_size" -gt $((MAX_SIZE_BYTES * 80 / 100)) ]; then
                echo -e "${YELLOW}    ⚠️  文件接近大小限制 (${MAX_SIZE_MB}MB)${NC}"
            fi
        else
            echo -e "${YELLOW}  📄 $log_file: 不存在${NC}"
        fi
        
        # 🔥 同时显示已轮转的文件
        local base_name=$(basename "$log_file" .log)
        for ((i = 1; i < MAX_FILES; i++)); do
            local numbered_file="$LOG_DIR/$base_name.log.$i"
            if [ -f "$numbered_file" ]; then
                local file_size=$(stat -f%z "$numbered_file" 2>/dev/null || stat -c%s "$numbered_file" 2>/dev/null)
                local size_mb=$((file_size / 1024 / 1024))
                
                echo -e "${BLUE}    📄 $base_name.log.$i: ${size_mb}MB${NC}"
                total_size=$((total_size + file_size))
                file_count=$((file_count + 1))
                
                # 检查是否超过大小限制
                if [ "$file_size" -gt "$MAX_SIZE_BYTES" ]; then
                    echo -e "${RED}      ❌ 文件超过大小限制 (${MAX_SIZE_MB}MB)${NC}"
                elif [ "$file_size" -gt $((MAX_SIZE_BYTES * 80 / 100)) ]; then
                    echo -e "${YELLOW}      ⚠️  文件接近大小限制 (${MAX_SIZE_MB}MB)${NC}"
                fi
            fi
        done
    done
    
    local total_mb=$((total_size / 1024 / 1024))
    echo -e "${BLUE}  📊 总计: $file_count个文件, ${total_mb}MB${NC}"
}

# 主函数
main() {
    echo -e "${GREEN}🔄 DLMM日志轮转工具${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}最大文件大小: ${MAX_SIZE_MB}MB${NC}"
    echo -e "${BLUE}最大保留文件: ${MAX_FILES}个${NC}"
    echo -e "${BLUE}日志目录: $LOG_DIR${NC}"
    echo ""
    
    # 确保日志目录存在
    mkdir -p "$LOG_DIR"
    
    # 显示当前状态
    show_log_stats
    echo ""
    
    # 轮转日志文件
    echo -e "${BLUE}🔄 开始日志轮转...${NC}"
    for log_file in "${LOG_FILES[@]}"; do
        rotate_log_file "$LOG_DIR/$log_file"
        # 🔥 同时检查已轮转的文件
        rotate_numbered_log_files "$LOG_DIR/$log_file"
    done
    
    echo ""
    
    # 清理过期日志
    cleanup_old_logs
    
    echo ""
    echo -e "${GREEN}✅ 日志轮转完成！${NC}"
    
    # 显示轮转后状态
    echo ""
    show_log_stats
}

# 如果作为脚本直接执行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi 