# 🔒 HTTPS配置说明

## 🚨 问题描述

当前遇到的问题是：**HTTPS前端无法连接到HTTP后端的WebSocket**

```
WebSocket connection to 'wss://www.baibid.top:7000' failed
```

**原因分析**：
- 前端运行在HTTPS (7001端口)
- 后端运行在HTTP (7000端口)
- 浏览器安全策略阻止HTTPS页面连接HTTP WebSocket

## 🔧 解决方案

### 方案1：配置后端HTTPS支持 (推荐)

#### 步骤1：准备SSL证书

**选项A：使用Let's Encrypt (免费)**
```bash
# 安装certbot
sudo apt-get install certbot  # Ubuntu/Debian
sudo yum install certbot      # CentOS/RHEL

# 申请证书
sudo certbot certonly --standalone -d www.baibid.top
```

**选项B：使用自有SSL证书**
- 准备私钥文件 (.key)
- 准备证书文件 (.crt 或 .pem)

#### 步骤2：配置环境变量

**方法1：使用配置脚本**
```bash
# 给脚本添加执行权限
chmod +x scripts/setup-ssl-config.sh

# 运行配置脚本
./scripts/setup-ssl-config.sh
```

**方法2：手动配置**
1. 复制配置文件：
```bash
cp enhanced-app.env.example .env
```

2. 编辑`.env`文件，添加SSL证书路径：
```bash
# Let's Encrypt证书
SSL_KEY_PATH=/etc/letsencrypt/live/www.baibid.top/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/www.baibid.top/fullchain.pem

# 或者自有证书
SSL_KEY_PATH=/path/to/your/private.key
SSL_CERT_PATH=/path/to/your/certificate.crt
```

#### 步骤3：重启服务器

```bash
# 停止服务
npm run stop

# 启动服务
npm run start

# 或者重启
npm run restart
```

#### 步骤4：验证配置

查看启动日志应该显示：
```
🔒 使用HTTPS服务器，证书路径: {...}
📡 API服务器: https://localhost:7000
🔌 WebSocket协议: wss://localhost:7000
```

### 方案2：使用反向代理 (替代方案)

如果无法直接配置SSL证书，可以使用nginx反向代理：

#### nginx配置示例：
```nginx
server {
    listen 443 ssl;
    server_name www.baibid.top;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    # 代理前端
    location / {
        proxy_pass http://localhost:7001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # 代理后端API
    location /api/ {
        proxy_pass http://localhost:7000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # 代理WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔍 故障排除

### 1. 检查证书文件权限
```bash
ls -la /etc/letsencrypt/live/www.baibid.top/
```

### 2. 验证证书有效性
```bash
openssl x509 -in /etc/letsencrypt/live/www.baibid.top/fullchain.pem -text -noout
```

### 3. 检查端口占用
```bash
netstat -tlnp | grep :7000
```

### 4. 测试HTTPS连接
```bash
curl -k https://www.baibid.top:7000/api/health
```

## 🎯 最佳实践

1. **使用Let's Encrypt**：免费、自动续期
2. **配置自动续期**：
   ```bash
   echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
   ```
3. **防火墙配置**：确保7000端口开放
4. **监控证书过期**：设置提醒

## 📞 技术支持

如果配置过程中遇到问题，请提供：
1. 系统类型和版本
2. SSL证书类型
3. 错误日志
4. 配置文件内容

---

**配置完成后，系统将自动使用HTTPS协议，前端WebSocket连接问题将得到解决。** 