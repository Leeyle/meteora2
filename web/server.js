const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const http = require('http');

/**
 * DLMM Web前端服务器
 * 提供静态文件服务、API代理和WebSocket实时通信
 * 端口配置: 前端7001，后端7000，WebSocket7002，监控7003
 */
class DLMMWebServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.wsServer = null;
        this.port = process.env.PORT || 7001;

        // 🌐 动态配置API基础URL
        this.apiBaseUrl = this.getApiBaseUrl();
        console.log('🔧 API代理地址:', this.apiBaseUrl);

        this.setupMiddleware();
        this.setupRoutes();

    }

    /**
     * 🌐 动态获取API基础URL
     */
    getApiBaseUrl() {
        // 检查环境变量
        if (process.env.API_BASE_URL) {
            return process.env.API_BASE_URL;
        }

        // 如果在开发环境或本地运行
        if (process.env.NODE_ENV === 'development' ||
            process.env.NODE_ENV === 'dev' ||
            !process.env.NODE_ENV) {
            return 'http://localhost:7000';
        }

        // 生产环境：使用内网地址连接API服务器
        return 'http://127.0.0.1:7000';
    }

    setupMiddleware() {
        // 安全中间件
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: [
                        "'self'",
                        // 🔧 生产环境：允许连接到当前域名
                        "ws:", "wss:",
                        "http:", "https:"
                    ]
                }
            }
        }));

        // CORS配置 - 支持生产环境
        this.app.use(cors({
            origin: (origin, callback) => {
                // 允许无origin的请求（如移动应用、Postman等）
                if (!origin) return callback(null, true);

                // 开发环境：允许localhost
                if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                    return callback(null, true);
                }

                // 生产环境：允许所有HTTPS域名
                const url = new URL(origin);
                if (url.protocol === 'https:') {
                    console.log('🌐 允许HTTPS跨域访问:', origin);
                    return callback(null, true);
                }

                // 允许HTTP（用于测试）
                if (url.protocol === 'http:' && process.env.NODE_ENV !== 'production') {
                    console.log('🌐 允许HTTP跨域访问（非生产环境）:', origin);
                    return callback(null, true);
                }

                console.log('🚫 拒绝跨域访问:', origin);
                callback(new Error('CORS策略不允许此来源'));
            },
            credentials: true
        }));

        // 压缩响应
        this.app.use(compression());

        // 速率限制
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15分钟
            max: 1000, // 每个IP最多1000次请求
            message: {
                error: '请求过于频繁，请稍后再试'
            }
        });
        this.app.use('/api/', limiter);

        // 解析JSON
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // 静态文件服务
        this.app.use(express.static(path.join(__dirname, 'public'), {
            maxAge: '1d',
            etag: true
        }));

        // 请求日志
        this.app.use((req, res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
            next();
        });
    }

    setupRoutes() {
        // 健康检查
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                service: 'dlmm-web-frontend',
                version: '1.0.0'
            });
        });

        // API代理路由 - 转发到后端服务
        this.app.use('/api', this.createApiProxy());

        // Socket.IO库代理 - 转发到后端服务器
        this.app.get('/socket.io/socket.io.js', async (req, res) => {
            try {
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(`${this.apiBaseUrl}/socket.io/socket.io.js`);

                if (!response.ok) {
                    throw new Error(`Socket.IO库获取失败: ${response.status}`);
                }

                const jsContent = await response.text();
                res.setHeader('Content-Type', 'application/javascript');
                res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
                res.send(jsContent);

                console.log('📡 Socket.IO库代理成功');
            } catch (error) {
                console.error('❌ Socket.IO库代理失败:', error);
                res.status(500).send('Socket.IO库加载失败');
            }
        });

        // SPA路由 - 只处理HTML路由，排除静态文件
        this.app.get('*', (req, res) => {
            // 🔧 排除静态文件请求（包含文件扩展名的请求）
            if (req.path.includes('.')) {
                console.log('❌ 静态文件请求失败:', req.path);
                return res.status(404).json({
                    error: '静态文件不存在',
                    path: req.path,
                    message: '请确认文件路径是否正确'
                });
            }

            // 🏠 SPA路由：返回主页面
            console.log('🏠 SPA路由:', req.path);
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // 错误处理中间件
        this.app.use((err, req, res, next) => {
            console.error('服务器错误:', err);
            res.status(500).json({
                error: '服务器内部错误',
                message: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试'
            });
        });
    }

    createApiProxy() {
        const router = express.Router();

        // 钱包相关API
        router.get('/wallet/info', this.proxyRequest('GET', '/wallet/info'));
        router.post('/wallet/create', this.proxyRequest('POST', '/wallet/create'));
        router.get('/wallet/balance/:tokenMint?', this.proxyRequest('GET', '/wallet/balance'));

        // 头寸相关API
        router.get('/position/user', this.proxyRequest('GET', '/position/user'));
        router.post('/position/y/create', this.proxyRequest('POST', '/position/y/create'));
        router.post('/position/x/create', this.proxyRequest('POST', '/position/x/create'));
        router.delete('/position/:address', this.proxyRequest('DELETE', '/position'));
        router.get('/position/:address/info', this.proxyRequest('GET', '/position/info'));

        // 策略相关API
        router.get('/strategy/list', this.proxyRequest('GET', '/strategy/list'));
        router.post('/strategy/create', this.proxyRequest('POST', '/strategy/create'));
        router.post('/strategy/:instanceId/start', this.proxyRequest('POST', '/strategy/start'));
        router.post('/strategy/:instanceId/stop', this.proxyRequest('POST', '/strategy/stop'));
        router.get('/strategy/:instanceId/status', this.proxyRequest('GET', '/strategy/status'));

        // 监控相关API
        router.get('/monitor/dashboard', this.proxyRequest('GET', '/monitor/dashboard'));
        router.get('/monitor/alerts', this.proxyRequest('GET', '/monitor/alerts'));
        router.post('/monitor/alert/:alertId/ack', this.proxyRequest('POST', '/monitor/alert/ack'));
        router.get('/monitor/report/:instanceId', this.proxyRequest('GET', '/monitor/report'));

        // Jupiter交换相关API
        router.get('/jupiter/tokens', this.proxyRequest('GET', '/jupiter/tokens'));
        router.post('/jupiter/quote', this.proxyRequest('POST', '/jupiter/quote'));
        router.post('/jupiter/swap', this.proxyRequest('POST', '/jupiter/swap'));

        // 日志查看器API
        router.get('/logs/instances', this.handleLogsInstances.bind(this));
        router.get('/logs/:instanceId', this.handleLogsContent.bind(this));

        return router;
    }

    proxyRequest(method, basePath) {
        return async (req, res) => {
            try {
                const fetch = (await import('node-fetch')).default;

                // 构建完整URL
                let url = `${this.apiBaseUrl}${basePath}`;
                if (req.params) {
                    // 替换路径参数
                    Object.entries(req.params).forEach(([key, value]) => {
                        url = url.replace(`:${key}`, value);
                    });
                }

                // 添加查询参数
                if (req.query && Object.keys(req.query).length > 0) {
                    const searchParams = new URLSearchParams(req.query);
                    url += `?${searchParams.toString()}`;
                }

                // 准备请求选项
                const options = {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        ...req.headers
                    }
                };

                // 添加请求体（对于POST、PUT等）
                if (['POST', 'PUT', 'PATCH'].includes(method) && req.body) {
                    options.body = JSON.stringify(req.body);
                }

                // 发送请求到后端
                const response = await fetch(url, options);
                const data = await response.json();

                // 转发响应
                res.status(response.status).json(data);

            } catch (error) {
                console.error('API代理错误:', error);
                res.status(500).json({
                    error: 'API请求失败',
                    message: error.message
                });
            }
        };
    }



    start() {
        this.server = this.app.listen(this.port, () => {
            console.log('🚀 DLMM Web前端服务器启动成功!');
            console.log(`📱 前端界面: http://localhost:${this.port}`);

            console.log(`🔗 API代理: http://localhost:${this.port}/api`);
            console.log('✨ 现代化仪表盘界面已就绪!');
        });

        // 优雅关闭
        process.on('SIGTERM', () => this.gracefulShutdown());
        process.on('SIGINT', () => this.gracefulShutdown());
    }

    /**
     * 🔍 获取所有策略实例列表（包括API服务器日志）
     */
    async handleLogsInstances(req, res) {
        try {
            const fs = require('fs').promises;
            const path = require('path');

            const instances = [];

            // 添加API服务器日志到列表顶部
            const apiLogPath = path.join(__dirname, '..', 'logs', 'api-server.log');
            try {
                const stats = await fs.stat(apiLogPath);
                instances.push({
                    instanceId: 'api-server',
                    strategyName: 'API服务器',
                    type: 'system',
                    lastModified: stats.mtime.toISOString(),
                    size: stats.size
                });
            } catch (e) {
                // API服务器日志文件不存在，添加占位符
                instances.push({
                    instanceId: 'api-server',
                    strategyName: 'API服务器',
                    type: 'system',
                    lastModified: new Date().toISOString(),
                    size: 0
                });
            }

            // 添加策略实例日志
            const logsBasePath = path.join(__dirname, '..', 'logs', 'strategies');

            try {
                const dirs = await fs.readdir(logsBasePath);

                for (const dir of dirs) {
                    if (dir.startsWith('instance-') && dir !== 'instance-APP') {
                        const instanceId = dir.replace('instance-', '');
                        const operationsLogPath = path.join(
                            logsBasePath,
                            dir,
                            'operations',
                            'strategies',
                            `strategy-${instanceId}.log`
                        );

                        try {
                            const stats = await fs.stat(operationsLogPath);
                            instances.push({
                                instanceId,
                                strategyName: '策略实例',
                                type: 'strategy',
                                lastModified: stats.mtime.toISOString(),
                                size: stats.size
                            });
                        } catch (e) {
                            // 日志文件不存在，跳过
                        }
                    }
                }
            } catch (e) {
                // strategies目录不存在或无法访问，继续执行
                console.warn('无法访问策略日志目录:', e.message);
            }

            res.json({
                success: true,
                instances,
                count: instances.length
            });
        } catch (error) {
            console.error('获取实例列表失败:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * 📄 获取指定实例的日志内容
     */
    async handleLogsContent(req, res) {
        try {
            const fs = require('fs').promises;
            const path = require('path');

            const { instanceId } = req.params;
            const lines = parseInt(req.query.lines) || 100;

            const logPath = path.join(
                __dirname, '..', 'logs', 'strategies',
                `instance-${instanceId}`,
                'operations',
                'strategies',
                `strategy-${instanceId}.log`
            );

            // 检查文件是否存在
            try {
                await fs.access(logPath);
            } catch (e) {
                return res.status(404).json({
                    success: false,
                    error: '日志文件不存在'
                });
            }

            // 读取文件内容
            const content = await fs.readFile(logPath, 'utf8');
            const allLines = content.split('\n').filter(line => line.trim());

            // 获取最新的指定行数
            const recentLines = allLines.slice(-lines);

            // 获取文件状态
            const stats = await fs.stat(logPath);

            res.json({
                success: true,
                instanceId,
                logs: recentLines,
                totalLines: allLines.length,
                requestedLines: lines,
                lastModified: stats.mtime.toISOString(),
                fileSize: stats.size
            });

        } catch (error) {
            console.error(`获取日志失败 [${req.params.instanceId}]:`, error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    gracefulShutdown() {
        console.log('🛑 正在关闭Web服务器...');

        // 关闭HTTP服务器
        if (this.server) {
            this.server.close(() => {
                console.log('✅ HTTP服务器已关闭');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    }
}

// 启动服务器
const webServer = new DLMMWebServer();
webServer.start();

module.exports = DLMMWebServer; 