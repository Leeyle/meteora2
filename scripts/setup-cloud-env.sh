#!/bin/bash

# 🌐 DLMM 云服务器环境变量配置脚本
# 自动检测并设置云服务器环境变量

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🌐 DLMM 云服务器环境变量配置${NC}"
echo "=================================="

# 检测当前环境
echo -e "${BLUE}🔍 检测当前环境...${NC}"

# 获取公网IP和域名信息
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipecho.net/plain 2>/dev/null || echo "")
HOSTNAME=$(hostname)
CURRENT_USER=$(whoami)

echo -e "${GREEN}主机名: ${HOSTNAME}${NC}"
echo -e "${GREEN}公网IP: ${PUBLIC_IP}${NC}"
echo -e "${GREEN}当前用户: ${CURRENT_USER}${NC}"

# 询问使用IP还是域名
echo ""
echo -e "${BLUE}🌐 请选择访问方式：${NC}"
echo "1. 使用IP地址访问 (${PUBLIC_IP})"
echo "2. 使用域名访问"
echo "3. 自动检测（推荐）- 前端会自动适配当前访问地址"

read -p "请选择 (1/2/3): " access_choice

case $access_choice in
    1)
        if [ -n "$PUBLIC_IP" ]; then
            SERVER_ADDRESS="$PUBLIC_IP"
            echo -e "${GREEN}✅ 将使用IP地址: ${SERVER_ADDRESS}${NC}"
        else
            echo -e "${RED}❌ 无法获取公网IP${NC}"
            exit 1
        fi
        ;;
    2)
        echo -e "${BLUE}请输入您的域名（不包含http://）:${NC}"
        read -p "域名: " DOMAIN_NAME
        if [ -n "$DOMAIN_NAME" ]; then
            SERVER_ADDRESS="$DOMAIN_NAME"
            echo -e "${GREEN}✅ 将使用域名: ${SERVER_ADDRESS}${NC}"
        else
            echo -e "${RED}❌ 域名不能为空${NC}"
            exit 1
        fi
        ;;
    3)
        echo -e "${GREEN}✅ 选择自动检测模式，前端将自动适配访问地址${NC}"
        SERVER_ADDRESS="auto-detect"
        ;;
    *)
        echo -e "${YELLOW}⚠️ 无效选择，使用自动检测模式${NC}"
        SERVER_ADDRESS="auto-detect"
        ;;
esac

# 创建环境变量文件
ENV_FILE=".env.cloud"
echo -e "${BLUE}📝 创建云服务器环境变量文件: ${ENV_FILE}${NC}"

if [ "$SERVER_ADDRESS" = "auto-detect" ]; then
    cat > "$ENV_FILE" << EOF
# 🌐 DLMM 云服务器环境变量配置 - 自动检测模式
# 自动生成于: $(date)

# 环境设置
NODE_ENV=production
PROTOCOL=http
HOSTNAME=${HOSTNAME}

# 自动检测模式 - 前端将自动适配当前访问地址
# 无需设置具体的API_BASE_URL，前端会动态检测

# 端口配置
PORT=7001
API_PORT=7000
WS_PORT=7002
MONITOR_PORT=7003

# 日志配置
LOG_LEVEL=info
LOG_FILE_MAX_SIZE=10MB
LOG_MAX_FILES=5
EOF
else
    cat > "$ENV_FILE" << EOF
# 🌐 DLMM 云服务器环境变量配置
# 自动生成于: $(date)

# 环境设置
NODE_ENV=production
PROTOCOL=http
PUBLIC_IP=${PUBLIC_IP}
SERVER_NAME=${SERVER_ADDRESS}
HOSTNAME=${HOSTNAME}

# API配置
API_BASE_URL=http://${SERVER_ADDRESS}:7000

# 端口配置
PORT=7001
API_PORT=7000
WS_PORT=7002
MONITOR_PORT=7003

# 日志配置
LOG_LEVEL=info
LOG_FILE_MAX_SIZE=10MB
LOG_MAX_FILES=5
EOF
fi

echo -e "${GREEN}✅ 环境变量文件已创建: ${ENV_FILE}${NC}"

# 检查是否存在现有的.env文件
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️ 检测到现有的.env文件${NC}"
    echo "选择操作："
    echo "1. 备份现有.env并使用新配置"
    echo "2. 合并配置到现有.env"
    echo "3. 仅创建.env.cloud，不修改现有配置"
    
    read -p "请选择 (1/2/3): " choice
    
    case $choice in
        1)
            cp .env .env.backup
            cp "$ENV_FILE" .env
            echo -e "${GREEN}✅ 已备份现有.env为.env.backup并应用新配置${NC}"
            ;;
        2)
            # 合并配置
            echo -e "${BLUE}🔄 合并配置到现有.env...${NC}"
            
            # 更新或添加关键配置
            if [ "$SERVER_ADDRESS" != "auto-detect" ]; then
                if grep -q "PUBLIC_IP=" .env; then
                    sed -i "s/PUBLIC_IP=.*/PUBLIC_IP=${PUBLIC_IP}/" .env
                else
                    echo "PUBLIC_IP=${PUBLIC_IP}" >> .env
                fi
                
                if grep -q "API_BASE_URL=" .env; then
                    sed -i "s|API_BASE_URL=.*|API_BASE_URL=http://${SERVER_ADDRESS}:7000|" .env
                else
                    echo "API_BASE_URL=http://${SERVER_ADDRESS}:7000" >> .env
                fi
                
                if grep -q "SERVER_NAME=" .env; then
                    sed -i "s/SERVER_NAME=.*/SERVER_NAME=${SERVER_ADDRESS}/" .env
                else
                    echo "SERVER_NAME=${SERVER_ADDRESS}" >> .env
                fi
            else
                # 自动检测模式，移除固定配置
                sed -i '/^API_BASE_URL=/d' .env 2>/dev/null || true
                sed -i '/^SERVER_NAME=/d' .env 2>/dev/null || true
                echo "# 自动检测模式 - 前端会动态检测地址" >> .env
            fi
            
            if grep -q "NODE_ENV=" .env; then
                sed -i "s/NODE_ENV=.*/NODE_ENV=production/" .env
            else
                echo "NODE_ENV=production" >> .env
            fi
            
            echo -e "${GREEN}✅ 配置已合并到现有.env文件${NC}"
            ;;
        3)
            echo -e "${BLUE}ℹ️ 仅创建了.env.cloud文件，现有配置未修改${NC}"
            ;;
        *)
            echo -e "${RED}❌ 无效选择，仅创建了.env.cloud文件${NC}"
            ;;
    esac
else
    cp "$ENV_FILE" .env
    echo -e "${GREEN}✅ 已创建.env文件${NC}"
fi

echo ""
echo -e "${BLUE}🔧 配置完成！${NC}"
echo "=================================="
if [ "$SERVER_ADDRESS" = "auto-detect" ]; then
    echo -e "${GREEN}🌐 自动检测模式已启用${NC}"
    echo -e "${YELLOW}前端将自动适配您的访问地址${NC}"
    echo -e "${BLUE}访问示例:${NC}"
    echo -e "${GREEN}  - 通过域名: http://您的域名:7001${NC}"
    echo -e "${GREEN}  - 通过IP: http://${PUBLIC_IP}:7001${NC}"
else
    echo -e "${GREEN}前端地址: http://${SERVER_ADDRESS}:7001${NC}"
    echo -e "${GREEN}API地址: http://${SERVER_ADDRESS}:7000${NC}"
    echo -e "${GREEN}监控地址: http://${SERVER_ADDRESS}:7003${NC}"
fi
echo ""
echo -e "${YELLOW}📋 下一步操作：${NC}"
echo "1. 确保云服务器防火墙开放端口: 7000, 7001, 7002, 7003"
echo "2. 重启服务: ./scripts/quick-stop.sh && ./scripts/quick-start.sh"
if [ "$SERVER_ADDRESS" = "auto-detect" ]; then
    echo "3. 通过您的域名或IP访问前端，系统会自动适配"
else
    echo "3. 在浏览器中访问: http://${SERVER_ADDRESS}:7001"
fi
echo ""
echo -e "${RED}⚠️ 注意：${NC}"
echo "- 请确保云服务器安全组/防火墙已正确配置"
echo "- 建议配置域名和SSL证书以提高安全性"
echo "- 生产环境建议使用Nginx反向代理" 