# 🔐 DLMM流动性管理系统 - HTTPS配置指南

## 📋 概述

本指南介绍如何为DLMM流动性管理系统配置HTTPS，使用购买的SSL证书 + Nginx反向代理方案。

**✅ 优势：**
- 无需修改主程序代码
- 性能优异，生产环境标准
- 支持自动HTTP到HTTPS重定向
- 完整的SSL安全配置

## 🎯 架构说明

```
用户浏览器 → Nginx(443端口,HTTPS) → DLMM应用(7000端口,HTTP)
```

- **Nginx**: 处理HTTPS连接和SSL证书
- **DLMM应用**: 继续在7000端口运行HTTP（内部访问）
- **自动重定向**: HTTP(80端口) 自动重定向到 HTTPS(443端口)

## 🚀 配置流程

### 步骤1：准备SSL证书文件

购买SSL证书后，您会收到以下文件：

```
your-domain.crt      # 主证书文件
your-domain.key      # 私钥文件  
bundle.crt           # 证书链文件（可选，某些提供商提供）
intermediate.crt     # 中间证书（可选）
```

### 步骤2：上传证书到服务器

```bash
# 在服务器上创建证书目录
sudo mkdir -p /etc/ssl/certs/dlmm
sudo mkdir -p /etc/ssl/private/dlmm

# 上传证书文件到服务器（使用scp或其他方式）
# 然后复制到正确位置
sudo cp your-domain.crt /etc/ssl/certs/dlmm/
sudo cp your-domain.key /etc/ssl/private/dlmm/
sudo cp bundle.crt /etc/ssl/certs/dlmm/  # 如果有证书链文件

# 设置正确权限
sudo chmod 644 /etc/ssl/certs/dlmm/*
sudo chmod 600 /etc/ssl/private/dlmm/*
sudo chown root:root /etc/ssl/certs/dlmm/*
sudo chown root:root /etc/ssl/private/dlmm/*
```

### 步骤3：安装Nginx

#### Ubuntu/Debian系统
```bash
sudo apt update
sudo apt install nginx
```

#### CentOS/RHEL系统
```bash
# CentOS 7
sudo yum install nginx

# CentOS 8/Rocky Linux/AlmaLinux
sudo dnf install nginx
```

### 步骤4：配置Nginx

创建DLMM专用配置文件：

```bash
sudo nano /etc/nginx/sites-available/dlmm
```

添加以下配置内容（**请替换 `your-domain.com` 为您的实际域名**）：

```nginx
# HTTP服务器 - 重定向到HTTPS
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    # 重定向所有HTTP请求到HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS服务器 - 主要服务
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL证书配置
    ssl_certificate /etc/ssl/certs/dlmm/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/dlmm/your-domain.key;
    
    # 如果有证书链文件，取消注释下面这行
    # ssl_trusted_certificate /etc/ssl/certs/dlmm/bundle.crt;

    # SSL安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 安全头配置
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 反向代理到DLMM应用
    location / {
        proxy_pass http://localhost:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket支持
    location /socket.io/ {
        proxy_pass http://localhost:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 静态文件缓存优化
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:7000;
        proxy_set_header Host $host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API路径
    location /api/ {
        proxy_pass http://localhost:7000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 步骤5：启用Nginx配置

#### Ubuntu/Debian系统
```bash
# 创建软链接启用站点
sudo ln -s /etc/nginx/sites-available/dlmm /etc/nginx/sites-enabled/

# 删除默认配置（避免冲突）
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置语法
sudo nginx -t
```

#### CentOS/RHEL系统
```bash
# 直接复制配置文件
sudo cp /etc/nginx/sites-available/dlmm /etc/nginx/conf.d/dlmm.conf

# 测试配置语法
sudo nginx -t
```

### 步骤6：启动和配置服务

```bash
# 启动Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 重启Nginx（如果已在运行）
sudo systemctl restart nginx

# 确保DLMM应用正在运行
cd /path/to/dlmm-liquidity-manager
./scripts/quick-start.sh
```

## 🔥 防火墙配置

### 需要开放的端口

| 端口 | 协议 | 用途 | 是否必需 |
|------|------|------|----------|
| **22** | TCP | SSH远程管理 | ✅ 必需 |
| **80** | TCP | HTTP（重定向到HTTPS） | ✅ 必需 |
| **443** | TCP | HTTPS主要服务 | ✅ 必需 |

### Ubuntu/Debian防火墙配置
```bash
# 重置防火墙规则
sudo ufw --force reset

# 允许必要端口
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp  
sudo ufw allow 443/tcp

# 启用防火墙
sudo ufw enable

# 检查状态
sudo ufw status
```

### CentOS/RHEL防火墙配置
```bash
# 开放端口
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp

# 或使用服务规则
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# 重载配置
sudo firewall-cmd --reload

# 检查状态
sudo firewall-cmd --list-all
```

### 云服务商安全组配置

#### 阿里云ECS
1. 登录阿里云控制台
2. 进入 **云服务器ECS** → **实例**
3. 点击 **管理** → **安全组**
4. 添加安全组规则：

```
入方向规则：
- 端口范围: 22/22, 协议: TCP, 授权对象: 0.0.0.0/0
- 端口范围: 80/80, 协议: TCP, 授权对象: 0.0.0.0/0  
- 端口范围: 443/443, 协议: TCP, 授权对象: 0.0.0.0/0
```

#### 腾讯云CVM
1. 登录腾讯云控制台
2. 进入 **云服务器** → **安全组**
3. 创建规则：

```
入站规则：
- 类型: 自定义, 端口: 22, 来源: 0.0.0.0/0
- 类型: HTTP(80), 端口: 80, 来源: 0.0.0.0/0
- 类型: HTTPS(443), 端口: 443, 来源: 0.0.0.0/0
```

## 🔍 验证和测试

### 1. 检查服务状态

```bash
# 检查Nginx状态
sudo systemctl status nginx

# 检查端口监听
sudo netstat -tlnp | grep -E ":80|:443|:7000"

# 查看Nginx进程
ps aux | grep nginx
```

### 2. 测试SSL配置

```bash
# 测试HTTPS连接
curl -I https://your-domain.com

# 测试HTTP重定向
curl -I http://your-domain.com

# 测试SSL证书详情
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

### 3. 浏览器测试

1. 访问：`https://your-domain.com`
2. 检查地址栏是否显示绿色锁图标
3. 测试所有功能是否正常工作
4. 验证WebSocket连接是否正常

### 4. SSL安全性检测

使用在线工具检测SSL配置：
- SSL Labs: https://www.ssllabs.com/ssltest/
- 输入您的域名进行全面安全测试

## 🚨 故障排查

### 常见问题及解决方法

#### 1. 证书路径错误
```bash
# 检查证书文件是否存在
ls -la /etc/ssl/certs/dlmm/
ls -la /etc/ssl/private/dlmm/

# 检查文件权限
sudo chmod 644 /etc/ssl/certs/dlmm/*
sudo chmod 600 /etc/ssl/private/dlmm/*
```

#### 2. Nginx配置错误
```bash
# 查看详细错误信息
sudo nginx -t

# 查看Nginx日志
sudo tail -f /var/log/nginx/error.log

# 查看系统日志
sudo journalctl -u nginx -f
```

#### 3. DLMM应用未运行
```bash
# 检查7000端口是否被占用
sudo netstat -tlnp | grep 7000

# 检查DLMM应用状态
cd /path/to/dlmm-liquidity-manager
./scripts/quick-start.sh status

# 查看DLMM应用日志
tail -f logs/api-server.log
```

#### 4. 域名解析问题
```bash
# 检查域名解析
nslookup your-domain.com
dig your-domain.com

# 测试从外部访问
curl -I http://your-external-ip
```

#### 5. 防火墙阻止
```bash
# 检查防火墙状态
sudo ufw status
# 或
sudo firewall-cmd --list-all

# 临时关闭防火墙测试
sudo ufw disable
# 或
sudo systemctl stop firewalld
```

## 📋 维护和更新

### SSL证书更新

1. **证书到期前更新**
```bash
# 备份旧证书
sudo cp /etc/ssl/certs/dlmm/your-domain.crt /etc/ssl/certs/dlmm/your-domain.crt.backup

# 上传新证书
sudo cp new-certificate.crt /etc/ssl/certs/dlmm/your-domain.crt
sudo cp new-private.key /etc/ssl/private/dlmm/your-domain.key

# 重新加载Nginx
sudo nginx -s reload
```

2. **验证新证书**
```bash
# 检查证书有效期
openssl x509 -in /etc/ssl/certs/dlmm/your-domain.crt -text -noout | grep "Not After"

# 测试HTTPS连接
curl -I https://your-domain.com
```

### 日志管理

```bash
# 查看访问日志
sudo tail -f /var/log/nginx/access.log

# 查看错误日志
sudo tail -f /var/log/nginx/error.log

# 配置日志轮转（在nginx配置中添加）
access_log /var/log/nginx/dlmm_access.log;
error_log /var/log/nginx/dlmm_error.log;
```

## ✅ 配置完成检查清单

- [ ] SSL证书文件已正确上传和配置
- [ ] Nginx配置文件语法正确
- [ ] 防火墙已开放80和443端口
- [ ] 云服务商安全组已配置
- [ ] DLMM应用在7000端口正常运行
- [ ] HTTP自动重定向到HTTPS
- [ ] HTTPS页面可以正常访问
- [ ] 所有功能（钱包、策略、监控等）正常工作
- [ ] WebSocket连接正常
- [ ] SSL安全评级良好（A级及以上）

## 🎉 完成后的效果

✅ **用户访问体验**：`https://your-domain.com` - 安全的HTTPS连接  
✅ **自动重定向**：访问HTTP自动跳转到HTTPS  
✅ **性能优化**：Nginx处理静态文件，缓存优化  
✅ **安全保障**：完整的SSL安全配置  
✅ **代码无修改**：主程序代码完全保持原样  
✅ **功能完整**：所有DLMM功能正常工作  

## 📞 技术支持

如遇到配置问题，请检查：

1. **日志文件**：`/var/log/nginx/error.log`
2. **DLMM日志**：`logs/api-server.log`
3. **系统日志**：`sudo journalctl -u nginx`
4. **端口状态**：`sudo netstat -tlnp`

配置完成后，您就拥有了一个安全、高性能的DLMM HTTPS服务！ 