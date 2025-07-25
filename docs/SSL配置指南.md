# 🔒 SSL证书配置指南

## 概述
本指南帮助你为DLMM系统的7000端口配置SSL证书，实现HTTPS访问。

## 证书文件说明

购买的SSL证书通常包含以下文件：

### 1. 私钥文件 (Private Key)
- 文件扩展名: `.key` 或 `.pem`
- 示例文件名: `private.key`, `domain.key`, `www.badkid.top.key`
- 内容格式: 
```
-----BEGIN PRIVATE KEY-----
[加密的私钥内容]
-----END PRIVATE KEY-----
```

### 2. 证书文件 (Certificate)
- 文件扩展名: `.crt`, `.pem`, `.cer`
- 示例文件名: `certificate.crt`, `domain.crt`, `www.badkid.top.crt`
- 内容格式:
```
-----BEGIN CERTIFICATE-----
[证书内容]
-----END CERTIFICATE-----
```

### 3. CA证书链 (Certificate Authority Chain)
- 文件扩展名: `.ca-bundle`, `.crt`, `.pem`
- 示例文件名: `ca-bundle.crt`, `intermediate.crt`, `chain.pem`
- 内容格式:
```
-----BEGIN CERTIFICATE-----
[中间证书内容]
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
[根证书内容]
-----END CERTIFICATE-----
```

## 配置步骤

### 第1步：创建证书目录
```bash
# 在项目根目录创建SSL证书目录
mkdir -p ssl-certificates
chmod 700 ssl-certificates
```

### 第2步：上传证书文件
将你的证书文件上传到 `ssl-certificates` 目录：
```
ssl-certificates/
├── private.key          # 私钥文件
├── certificate.crt      # 证书文件
└── ca-bundle.crt       # CA证书链（可选）
```

### 第3步：设置文件权限
```bash
chmod 600 ssl-certificates/private.key
chmod 644 ssl-certificates/certificate.crt
chmod 644 ssl-certificates/ca-bundle.crt
```

### 第4步：配置环境变量
编辑 `.env` 文件：
```env
# 🔒 SSL证书配置
SSL_KEY_PATH=/path/to/your/ssl-certificates/private.key
SSL_CERT_PATH=/path/to/your/ssl-certificates/certificate.crt
SSL_CA_PATH=/path/to/your/ssl-certificates/ca-bundle.crt
```

**绝对路径示例：**
```env
SSL_KEY_PATH=/home/user/dlmm-liquidity-manager/ssl-certificates/private.key
SSL_CERT_PATH=/home/user/dlmm-liquidity-manager/ssl-certificates/certificate.crt
SSL_CA_PATH=/home/user/dlmm-liquidity-manager/ssl-certificates/ca-bundle.crt
```

### 第5步：验证证书配置
```bash
# 验证私钥格式
openssl rsa -in ssl-certificates/private.key -check

# 验证证书格式
openssl x509 -in ssl-certificates/certificate.crt -text -noout

# 验证证书和私钥匹配
openssl x509 -noout -modulus -in ssl-certificates/certificate.crt | openssl md5
openssl rsa -noout -modulus -in ssl-certificates/private.key | openssl md5
```

### 第6步：重启服务器
```bash
# 重启服务器应用SSL配置
npm run start:api
```

## 验证SSL配置

### 1. 检查服务器启动日志
启动成功后应该看到：
```
🔒 使用HTTPS服务器（包含CA证书链），证书路径: { sslKey: '...', sslCert: '...', sslCA: '...' }
📡 API服务器: https://localhost:7000
🔌 Socket.IO服务器: https://localhost:7000/socket.io/
🔌 WebSocket协议: wss://localhost:7000
```

### 2. 测试HTTPS连接
```bash
# 测试本地HTTPS访问
curl -k https://localhost:7000/api/health

# 测试外部HTTPS访问
curl https://www.badkid.top:7000/api/health
```

### 3. 测试WebSocket连接
使用浏览器开发者工具检查WebSocket连接：
```javascript
const socket = io('https://www.badkid.top:7000', {
    transports: ['websocket'],
    secure: true
});
```

## 常见问题

### 1. 证书文件不存在
**错误信息:** `⚠️  SSL证书文件不存在，降级为HTTP服务器`

**解决方法:**
- 检查证书文件路径是否正确
- 检查文件权限是否正确
- 确保使用绝对路径

### 2. 证书格式错误
**错误信息:** `❌ SSL证书加载失败，降级为HTTP服务器`

**解决方法:**
- 使用 `openssl` 命令验证证书格式
- 确保私钥和证书文件匹配
- 检查证书是否已过期

### 3. 端口访问被拒绝
**错误信息:** `Connection refused`

**解决方法:**
- 检查防火墙设置：`sudo ufw allow 7000`
- 检查云服务器安全组规则
- 确保端口7000对外开放

### 4. WebSocket连接失败
**错误信息:** `WebSocket connection failed`

**解决方法:**
- 使用 `wss://` 协议而不是 `ws://`
- 检查证书是否支持WebSocket升级
- 确保防火墙允许WebSocket连接

## 最佳实践

1. **证书安全**
   - 私钥文件权限设置为600
   - 不要将私钥文件提交到Git仓库
   - 定期更新证书

2. **备份证书**
   - 定期备份证书文件
   - 设置证书过期提醒

3. **监控证书状态**
   - 监控证书过期时间
   - 定期检查证书有效性

4. **性能优化**
   - 使用HTTP/2协议
   - 启用GZIP压缩
   - 配置适当的缓存策略

## 生产环境建议

1. **使用Nginx代理**
   - 让Nginx处理SSL终止
   - 内部使用HTTP通信
   - 更好的性能和安全性

2. **证书自动更新**
   - 如果使用Let's Encrypt，配置自动更新
   - 设置证书更新通知

3. **安全配置**
   - 禁用不安全的SSL/TLS版本
   - 配置强密码套件
   - 启用HSTS头部 