/**
 * 🌐 DLMM流动性管理系统 - 统一API服务器
 * 整合所有服务模块，提供RESTful API接口
 * 与依赖注入系统集成，提供完整的API功能
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import * as fs from 'fs';

import { SocketIOService } from './socketio-server';

// 导入依赖注入系统
import { DIContainer, getService } from '../di/container';
import { TYPES } from '../types/interfaces';
import type { ILoggerService } from '../types/interfaces';

// 导入路由
import { createWalletRoutes } from './routes/wallet-routes';
import { createPositionRoutes } from './routes/position-routes';
import { createPoolRoutes } from './routes/pool-routes';
import { createStrategyRoutes } from './routes/strategy-routes';
import { createMonitorRoutes } from './routes/monitor-routes';
import { createAnalyticsRoutes } from './routes/analytics-routes';
import { createConfigRoutes } from './routes/config-routes';
import { createJupiterRoutes } from './routes/jupiter-routes';
import chainPositionRoutes from './routes/chain-position-routes';
import { createHealthRoutes } from './routes/health-routes';
import { createPoolCrawlerRoutes } from './routes/pool-crawler-routes';

/**
 * DLMM API服务器类
 * 统一管理所有服务和API路由
 */
export class DLMMAPIServer {
    private app: express.Application;
    private server: any;

    private socketIOService: SocketIOService | null = null;
    private port: number;



    // 服务实例 (简化版，避免复杂依赖注入)
    private services: any;
    private logger!: ILoggerService;

    // 系统状态
    private isInitialized: boolean = false;
    private startTime: number = 0;
    private requestCount: number = 0;
    private errorCount: number = 0;
    private isShuttingDown = false;

    // Handlers bound to the class instance
    private readonly boundHandleUncaughtException: (error: Error) => void;
    private readonly boundHandleUnhandledRejection: (reason: any, promise: Promise<any>) => void;

    constructor(port: number = 7000) {
        this.app = express();
        this.port = port;

        // Bind handlers in the constructor to ensure 'this' is always the class instance
        this.boundHandleUncaughtException = (error) => {
            this.handleUncaughtException(error).catch(err => {
                console.error('CRITICAL: API Server handleUncaughtException failed', err);
                process.exit(1);
            });
        };

        this.boundHandleUnhandledRejection = (reason, promise) => {
            this.handleUnhandledRejection(reason, promise).catch(err => {
                console.error('CRITICAL: API Server handleUnhandledRejection failed', err);
                process.exit(1);
            });
        };
    }

    /**
     * 初始化真实服务 (与依赖注入系统集成)
     */
    private async initializeServices(): Promise<void> {
        try {
            // 初始化依赖注入容器
            const diContainer = DIContainer.getInstance();
            diContainer.initialize();

            // 验证容器健康状态
            const isValid = await diContainer.validateContainer();
            if (!isValid) {
                throw new Error('依赖注入容器验证失败');
            }

            // 创建服务映射对象，从依赖注入容器获取真实服务
            this.services = {
                // 基础设施服务
                eventBus: getService(TYPES.EventBus),
                logger: getService(TYPES.LoggerService),
                config: getService(TYPES.ConfigService),
                state: getService(TYPES.StateService),
                cache: getService(TYPES.CacheService),

                // 区块链服务
                solanaWeb3: getService(TYPES.SolanaWeb3Service),
                wallet: getService(TYPES.WalletService),
                multiRPC: getService(TYPES.MultiRPCService),
                gas: getService(TYPES.GasService),

                // 外部服务
                jupiter: getService(TYPES.JupiterService),
                meteora: getService(TYPES.MeteoraService),
                helius: getService(TYPES.HeliusService),

                // 业务服务
                positionManager: getService(TYPES.PositionManager),
                yPositionManager: getService(TYPES.YPositionManager),
                xPositionManager: getService(TYPES.XPositionManager),
                positionFeeHarvester: getService(TYPES.PositionFeeHarvester),
                positionInfo: getService(TYPES.PositionInfoService),

                // 新策略架构
                strategyManager: getService(TYPES.StrategyManager),
                strategyRegistry: getService(TYPES.StrategyRegistry),
                strategyScheduler: getService(TYPES.StrategyScheduler),
                strategyStorage: getService(TYPES.StrategyStorage),
                simpleYExecutor: getService(TYPES.SimpleYExecutor),
                chainPositionExecutor: getService(TYPES.ChainPositionExecutor),
                healthChecker: getService(TYPES.StrategyHealthChecker),

                // 池爬虫服务（使用字符串令牌）
                // poolCrawler: require('tsyringe').container.resolve('PoolCrawlerService'),
                // qualifiedPoolsManager: require('tsyringe').container.resolve('QualifiedPoolsManager'),
                // tokenFilterManager: require('tsyringe').container.resolve('TokenFilterManager'),
                // poolPushStorageManager: require('tsyringe').container.resolve('PoolPushStorageManager')
            };

            // 立即设置logger引用，以便后续使用
            this.logger = this.services.logger;

            await this.logger.logSystem('INFO', '🔧 正在初始化依赖注入容器...');
            await this.logger.logSystem('INFO', '🔧 正在初始化关键服务...');

            // 默认配置
            const defaultConfig = {};

            // 安全地初始化服务，只对实现了IService接口的服务调用initialize
            const servicesToInitialize = [
                'wallet',  // WalletService实现了IService
                'solanaWeb3',  // SolanaWeb3Service实现了IService
                'multiRPC',  // MultiRPCService实现了IService
                'gas',  // GasService实现了IService
                'jupiter',  // JupiterService实现了IService
                'meteora',  // MeteoraService实现了IService
                'helius'  // HeliusService实现了IService
            ];

            for (const serviceName of servicesToInitialize) {
                const service = this.services[serviceName];
                if (service && typeof service.initialize === 'function') {
                    try {
                        await service.initialize(defaultConfig);
                        await this.logger.logBusinessOperation(`✅ ${serviceName} 服务初始化完成`, { serviceName });
                    } catch (error) {
                        await this.logger.logError('ServiceInit', `⚠️ ${serviceName} 服务初始化失败`, error as Error);
                    }
                }
            }

            await this.logger.logSystem('INFO', '✅ 关键服务初始化完成');

            // 🔧 启动需要start方法的服务
            const servicesToStart = ['gas']; // GasService需要调用start方法来启动定时更新

            for (const serviceName of servicesToStart) {
                const service = this.services[serviceName];
                if (service && typeof service.start === 'function') {
                    try {
                        await service.start();
                        await this.logger.logBusinessOperation(`🚀 ${serviceName} 服务启动完成`, { serviceName });
                    } catch (error) {
                        await this.logger.logError('ServiceStart', `⚠️ ${serviceName} 服务启动失败`, error as Error);
                    }
                }
            }

            await this.logger.logSystem('INFO', '✅ 所有服务初始化完成 (真实服务模式)');

            // 初始化策略管理器
            await this.initializeStrategyManager();

            this.isInitialized = true;

        } catch (error) {
            if (this.logger && typeof this.logger.logError === 'function') {
                await this.logger.logError('Server', '❌ 服务初始化失败', error as Error);
            } else {
                console.error('❌ 服务初始化失败(logger未初始化):', error);
            }
            throw error;
        }
    }

    /**
     * 初始化策略管理器
     */
    private async initializeStrategyManager(): Promise<void> {
        try {
            await this.logger.logSystem('INFO', '🎯 初始化策略管理器...');

            // 注册SimpleYExecutor到策略注册表
            const strategyRegistry = this.services.strategyRegistry;
            const simpleYExecutor = this.services.simpleYExecutor;

            if (strategyRegistry && simpleYExecutor) {
                await strategyRegistry.register('simple-y', simpleYExecutor);
                await this.logger.logSystem('INFO', '✅ SimpleYExecutor注册成功 (类型: simple-y)');
            }

            // 🔗 注册ChainPositionExecutor到策略注册表
            const chainPositionExecutor = getService(TYPES.ChainPositionExecutor);
            if (strategyRegistry && chainPositionExecutor) {
                await strategyRegistry.register('chain_position', chainPositionExecutor);
                await this.logger.logSystem('INFO', '✅ ChainPositionExecutor注册成功 (类型: chain_position)');
            }

            // 🚀 启动策略调度器 - 必须在StrategyManager初始化之前启动
            const strategyScheduler = this.services.strategyScheduler;
            if (strategyScheduler) {
                await strategyScheduler.start();
                await this.logger.logSystem('INFO', '✅ StrategyScheduler启动成功');
            }

            // 初始化策略管理器
            const strategyManager = this.services.strategyManager;
            if (strategyManager) {
                await strategyManager.initialize();
                await this.logger.logSystem('INFO', '✅ StrategyManager初始化成功');
            }

            // 启动健康检查服务
            const healthChecker = this.services.healthChecker;
            if (healthChecker) {
                await healthChecker.start();
                await this.logger.logSystem('INFO', '✅ StrategyHealthChecker启动成功');
            }

            await this.logger.logSystem('INFO', '🎯 策略管理器初始化完成');
        } catch (error) {
            if (this.logger && typeof this.logger.logError === 'function') {
                await this.logger.logError('Server', '❌ 策略管理器初始化失败', error as Error);
            } else {
                console.error('❌ 策略管理器初始化失败(logger未初始化):', error);
            }
            throw error;
        }
    }

    /**
     * 设置Express中间件
     */
    private async setupMiddleware(): Promise<void> {
        await this.logger.logSystem('INFO', '🔧 配置Express中间件...');
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    "default-src": ["'self'"],
                    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                    "style-src": ["'self'", "'unsafe-inline'"],
                    "object-src": ["'none'"],
                    "img-src": ["'self'", "data:", "https:"],
                    "connect-src": ["'self'", "ws:", "wss:"],
                    "base-uri": ["'self'"],
                    "font-src": ["'self'", "https:", "data:"],
                    "form-action": ["'self'"],
                    "frame-ancestors": ["'self'"],
                    "media-src": ["'self'"]
                },
            },
        }));
        this.app.use(cors({
            origin: true,  // 允许所有来源，因为现在前端和API在同一端口
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID']
        }));

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(compression());

        // 添加静态文件托管 - 让API服务器同时托管前端文件
        const path = require('path');
        const fs = require('fs');

        // 🔧 智能路径计算：适应不同的目录结构
        let staticPath: string;

        // 尝试多种可能的路径
        const possiblePaths = [
            path.join(__dirname, '../../web/public'),           // 标准结构
            path.join(__dirname, '../web/public'),              // 如果在dist/server/
            path.join(process.cwd(), 'web/public'),             // 使用工作目录
            path.join(process.cwd(), 'dlmm-liquidity-manager/web/public'), // 如果在上级目录
        ];

        // 查找第一个存在的路径
        staticPath = possiblePaths.find(p => {
            try {
                return fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'));
            } catch (error) {
                return false;
            }
        }) || possiblePaths[0]; // 如果都不存在，使用第一个作为默认值

        this.app.use(express.static(staticPath));
        await this.logger.logSystem('INFO', `📁 静态文件目录: ${staticPath}`);
        await this.logger.logSystem('INFO', `📁 目录存在: ${fs.existsSync(staticPath)}`);

        // 验证关键文件
        const indexPath = path.join(staticPath, 'index.html');
        const configPath = path.join(staticPath, 'js/config.js');
        await this.logger.logSystem('INFO', `📄 index.html存在: ${fs.existsSync(indexPath)}`);
        await this.logger.logSystem('INFO', `📄 config.js存在: ${fs.existsSync(configPath)}`);

        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 1000,
            message: { error: 'Too many requests' },
        });
        this.app.use('/api/', limiter);

        this.app.use((req, res, next) => {
            this.requestCount++;
            res.on('finish', () => {
                if (res.statusCode >= 400) this.errorCount++;
            });
            next();
        });

        await this.logger.logSystem('INFO', '✅ Express中间件配置完成');
    }

    /**
     * 设置API路由
     */
    private async setupRoutes(): Promise<void> {
        await this.logger.logSystem('INFO', '🔧 配置API路由...');

        const apiRouter = express.Router();

        // 健康检查
        apiRouter.get('/health', (req, res) => {
            const uptime = Date.now() - this.startTime;
            const memoryUsage = process.memoryUsage();

            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: uptime,
                services: this.getServicesStatus(),
                stats: {
                    totalRequests: this.requestCount,
                    errorRequests: this.errorCount,
                    successRate: this.requestCount > 0 ?
                        ((this.requestCount - this.errorCount) / this.requestCount * 100).toFixed(2) + '%' : '100%'
                },
                memory: {
                    used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
                    total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
                    external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB'
                },
                version: '1.0.0'
            });
        });

        // 系统信息
        apiRouter.get('/info', (req, res) => {
            res.json({
                name: 'DLMM Liquidity Management System',
                version: '1.0.0',
                description: '基于Solana的DLMM流动性管理系统',
                author: 'DLMM Team',
                features: [
                    'Solana钱包管理',
                    'DLMM流动性头寸管理',
                    '连锁头寸创建和管理',
                    'Jupiter聚合交易',
                    'Meteora协议集成',
                    '智能策略引擎',
                    '实时监控和预警',
                    '费用收集自动化'
                ],
                endpoints: {
                    wallet: '/api/wallet/*',
                    positions: '/api/positions/*',
                    health: '/api/health',
                    info: '/api/info'
                }
            });
        });

        // 🔧 WebSocket配置接口 - 云端部署适配
        apiRouter.get('/config/websocket', (req, res) => {
            const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
            const host = req.get('Host') || 'localhost:7000';

            // 智能推断WebSocket URL
            let websocketUrl: string;

            if (host.includes('localhost') || host.includes('127.0.0.1')) {
                // 本地开发环境
                websocketUrl = `ws://localhost:7000`;
            } else {
                // 生产环境：通过nginx代理，移除端口号
                const hostWithoutPort = host.split(':')[0];
                websocketUrl = `${protocol}://${hostWithoutPort}`;
            }

            res.json({
                success: true,
                data: {
                    websocketUrl: websocketUrl,
                    apiUrl: `${req.protocol}://${host}/api`,
                    environment: process.env.NODE_ENV || 'development',
                    serverInfo: {
                        host: host,
                        protocol: req.protocol,
                        secure: req.secure,
                        forwarded: req.headers['x-forwarded-proto']
                    }
                },
                timestamp: new Date().toISOString()
            });
        });

        // 🔧 完整的前端配置接口 - 云端部署适配
        apiRouter.get('/config/frontend', (req, res) => {
            const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
            const host = req.get('Host') || 'localhost:7000';

            // 智能推断各种URL
            let websocketUrl: string;
            let apiUrl: string;

            if (host.includes('localhost') || host.includes('127.0.0.1')) {
                // 本地开发环境
                websocketUrl = `ws://localhost:7000`;
                apiUrl = `http://localhost:7000/api`;
            } else {
                // 生产环境：通过nginx代理，移除端口号
                const hostWithoutPort = host.split(':')[0];
                websocketUrl = `${protocol}://${hostWithoutPort}`;
                apiUrl = `${req.protocol}://${hostWithoutPort}/api`;
            }

            res.json({
                success: true,
                data: {
                    websocketUrl: websocketUrl,
                    apiUrl: apiUrl,
                    environment: process.env.NODE_ENV || 'development',
                    features: {
                        realTimeUpdates: true,
                        strategyMonitoring: true,
                        poolCrawling: true,
                        chainPositions: true
                    }
                },
                timestamp: new Date().toISOString()
            });
        });

        // 性能指标监控
        apiRouter.get('/metrics', (req, res) => {
            const uptime = Date.now() - this.startTime;
            const memoryUsage = process.memoryUsage();

            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: {
                    ms: uptime,
                    seconds: Math.floor(uptime / 1000),
                    formatted: this.formatUptime(uptime)
                },
                requests: {
                    total: this.requestCount,
                    successful: this.requestCount - this.errorCount,
                    failed: this.errorCount,
                    successRate: this.requestCount > 0 ?
                        ((this.requestCount - this.errorCount) / this.requestCount * 100) : 100
                },
                memory: {
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    external: Math.round(memoryUsage.external / 1024 / 1024),
                    rss: Math.round(memoryUsage.rss / 1024 / 1024)
                },
                system: {
                    platform: process.platform,
                    arch: process.arch,
                    nodeVersion: process.version,
                    pid: process.pid
                },
                services: this.getServicesStatus()
            });
        });

        // ====== 日志查询API ======

        // 获取最近的日志
        apiRouter.get('/logs', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 50;
                const logs = await this.logger.getRecentLogs(limit);

                res.json({
                    success: true,
                    data: logs,
                    count: logs.length,
                    limit: limit,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                await this.logger.logError('API', '获取日志失败', error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取日志失败'
                });
            }
        });

        // 获取错误日志
        apiRouter.get('/logs/errors', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 20;
                const logs = await this.logger.getErrorLogs(limit);

                res.json({
                    success: true,
                    data: logs,
                    count: logs.length,
                    limit: limit,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                await this.logger.logError('API', '获取错误日志失败', error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取错误日志失败'
                });
            }
        });

        // 获取业务操作日志
        apiRouter.get('/logs/business/operations', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 50;
                const logs = await this.logger.getBusinessOperationLogs(limit);

                res.json({
                    success: true,
                    data: logs,
                    count: logs.length,
                    limit: limit,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                await this.logger.logError('API', '获取业务操作日志失败', error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取业务操作日志失败'
                });
            }
        });

        // 获取业务监控日志
        apiRouter.get('/logs/business/monitoring', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 50;
                const logs = await this.logger.getBusinessMonitoringLogs(limit);

                res.json({
                    success: true,
                    data: logs,
                    count: logs.length,
                    limit: limit,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                await this.logger.logError('API', '获取业务监控日志失败', error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取业务监控日志失败'
                });
            }
        });

        // 按类别获取日志
        apiRouter.get('/logs/category/:category', async (req, res) => {
            try {
                const category = req.params.category;
                const limit = parseInt(req.query.limit as string) || 50;
                const logs = await this.logger.getLogsByCategory(category, limit);

                res.json({
                    success: true,
                    data: logs,
                    category: category,
                    count: logs.length,
                    limit: limit,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                await this.logger.logError('API', `获取类别日志失败: ${req.params.category}`, error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取类别日志失败'
                });
            }
        });

        // 获取可用的日志文件列表
        apiRouter.get('/logs/files', async (req, res) => {
            try {
                const files = await this.logger.getAvailableLogFiles();

                res.json({
                    success: true,
                    data: files,
                    count: files.length,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                await this.logger.logError('API', '获取日志文件列表失败', error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取日志文件列表失败'
                });
            }
        });

        // 获取混合日志
        apiRouter.get('/logs/mixed', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 100;
                const logs = await this.logger.getMixedLogs(limit);

                res.json({
                    success: true,
                    data: logs,
                    count: logs.length,
                    limit: limit,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                await this.logger.logError('API', '获取混合日志失败', error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取混合日志失败'
                });
            }
        });

        // ====== 策略日志查看器API ======

        // 获取所有策略实例列表
        apiRouter.get('/logs/instances', async (req, res) => {
            try {
                const fs = require('fs').promises;
                const path = require('path');

                const logsBasePath = path.join(__dirname, '../../logs/strategies');
                const instances = [];

                // 添加API服务器日志到列表顶部
                const apiLogPath = path.join(__dirname, '../../logs/api-server.log');
                try {
                    const stats = await fs.stat(apiLogPath);
                    instances.push({
                        instanceId: 'api-server',
                        strategyName: 'API服务器',
                        strategyType: 'system',
                        strategyStatus: 'active',
                        lastModified: stats.mtime.toISOString(),
                        size: stats.size
                    });
                } catch (e) {
                    // API服务器日志文件不存在，添加占位符
                    instances.push({
                        instanceId: 'api-server',
                        strategyName: 'API服务器',
                        strategyType: 'system',
                        strategyStatus: 'active',
                        lastModified: new Date().toISOString(),
                        size: 0
                    });
                }

                // 获取策略管理器中的所有策略实例信息
                const strategyInstances = this.services.strategyManager.listInstances();
                const strategyMap = new Map();

                // 建立实例ID到策略信息的映射
                strategyInstances.forEach((strategy: any) => {
                    strategyMap.set(strategy.id, {
                        name: strategy.name,
                        type: strategy.type,
                        status: strategy.status,
                        createdAt: strategy.createdAt
                    });
                });

                const dirs = await fs.readdir(logsBasePath);

                for (const dir of dirs) {
                    if (dir.startsWith('instance-') && dir !== 'instance-APP') {
                        const instanceId = dir.replace('instance-', '');
                        
                        // 🔧 修复：统一日志路径结构，所有策略都使用相同的路径格式
                        let operationsLogPath;
                        let strategyType = 'unknown';
                        
                        // 所有策略都使用统一的路径结构
                        operationsLogPath = path.join(
                            logsBasePath,
                            dir,
                            'operations',
                            `strategy-${instanceId}.log`
                        );
                        
                        // 根据实例ID前缀确定策略类型
                        if (instanceId.startsWith('simple-y_')) {
                            strategyType = 'simple-y';
                        } else if (instanceId.startsWith('chain_position_')) {
                            strategyType = 'chain-position';
                        } else {
                            strategyType = 'unknown';
                        }

                        try {
                            const stats = await fs.stat(operationsLogPath);
                            const strategyInfo = strategyMap.get(instanceId);

                            instances.push({
                                instanceId,
                                strategyName: strategyInfo?.name || (strategyType === 'simple-y' ? '简单Y策略' : '连锁头寸策略'),
                                strategyType: strategyInfo?.type || strategyType,
                                strategyStatus: strategyInfo?.status || 'unknown',
                                lastModified: stats.mtime.toISOString(),
                                size: stats.size
                            });
                        } catch (e) {
                            // 日志文件不存在，跳过
                        }
                    }
                }

                res.json({
                    success: true,
                    instances,
                    count: instances.length
                });
            } catch (error) {
                await this.logger.logError('API', '获取策略实例列表失败', error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取策略实例列表失败'
                });
            }
        });

        // 获取指定实例的日志内容
        apiRouter.get('/logs/:instanceId', async (req, res) => {
            try {
                const fs = require('fs').promises;
                const path = require('path');

                const { instanceId } = req.params;
                const lines = parseInt(req.query.lines as string) || 100;

                let logPath;

                // 根据实例ID确定日志文件路径
                if (instanceId === 'api-server') {
                    // API服务器日志
                    logPath = path.join(__dirname, '../../logs/api-server.log');
                } else {
                    // 🔧 修复：统一策略日志路径，所有策略都使用相同的路径结构
                    logPath = path.join(
                        __dirname, '../../logs/strategies',
                        `instance-${instanceId}`,
                        'operations',
                        `strategy-${instanceId}.log`
                    );
                }

                // 检查文件是否存在
                try {
                    await fs.access(logPath);
                } catch (e) {
                    res.status(404).json({
                        success: false,
                        error: '日志文件不存在'
                    });
                    return;
                }

                // 读取文件内容
                const content = await fs.readFile(logPath, 'utf8');
                const allLines = content.split('\n').filter((line: string) => line.trim());

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
                await this.logger.logError('API', `获取实例日志失败 [${req.params.instanceId}]`, error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取实例日志失败'
                });
            }
        });

        // ====== 日志管理API ======

        // 获取日志统计信息
        apiRouter.get('/logs/statistics', async (req, res) => {
            try {
                const stats = await this.logger.getLogStatistics();

                res.json({
                    success: true,
                    data: {
                        ...stats,
                        totalSizeFormatted: this.formatBytes(stats.totalSize),
                        categoriesFormatted: Object.entries(stats.categories).reduce((acc, [key, value]) => {
                            acc[key] = {
                                ...value,
                                sizeFormatted: this.formatBytes(value.size)
                            };
                            return acc;
                        }, {} as any)
                    },
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                await this.logger.logError('API', '获取日志统计失败', error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取日志统计失败'
                });
            }
        });

        // 清理所有日志文件
        apiRouter.post('/logs/clear', async (req, res) => {
            try {
                await this.logger.logSystem('WARN', '🧹 用户请求清理所有日志文件');

                // 获取清理前的统计信息
                const beforeStats = await this.logger.getLogStatistics();

                // 执行清理
                await this.logger.clearAllLogs();

                // 获取清理后的统计信息
                const afterStats = await this.logger.getLogStatistics();

                res.json({
                    success: true,
                    message: '所有日志文件已清理完成',
                    data: {
                        before: {
                            ...beforeStats,
                            totalSizeFormatted: this.formatBytes(beforeStats.totalSize)
                        },
                        after: {
                            ...afterStats,
                            totalSizeFormatted: this.formatBytes(afterStats.totalSize)
                        },
                        cleared: {
                            files: beforeStats.totalFiles - afterStats.totalFiles,
                            size: beforeStats.totalSize - afterStats.totalSize,
                            sizeFormatted: this.formatBytes(beforeStats.totalSize - afterStats.totalSize)
                        }
                    },
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                await this.logger.logError('API', '清理日志文件失败', error as Error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '清理日志文件失败'
                });
            }
        });

        apiRouter.use('/wallet', createWalletRoutes(this.services));
        apiRouter.use('/positions', createPositionRoutes(this.services));
        apiRouter.use('/pools', createPoolRoutes(this.services));
        apiRouter.use('/strategy', createStrategyRoutes(this.services));
        apiRouter.use('/jupiter', createJupiterRoutes(this.services));
        apiRouter.use('/monitor', createMonitorRoutes(this.services));
        apiRouter.use('/chain-position', chainPositionRoutes);
        apiRouter.use('/health-check', createHealthRoutes(this.services));
        apiRouter.use('/pool-crawler', createPoolCrawlerRoutes(this.services));

        this.app.use('/api', apiRouter);

        // 处理前端路由 - 只处理HTML路由，排除静态文件
        this.app.get('*', (req, res) => {
            // 如果是API请求但没有匹配到路由，返回404 JSON
            if (req.path.startsWith('/api/')) {
                return res.status(404).json({
                    error: 'API Endpoint not found',
                    message: `The requested API endpoint ${req.method} ${req.originalUrl} was not found`,
                    availableEndpoints: [
                        'GET /api/health',
                        'GET /api/info',
                        'GET /api/metrics',
                        'GET /api/logs',
                        'GET /api/logs/errors',
                        'GET /api/logs/business/operations',
                        'GET /api/logs/business/monitoring',
                        'GET /api/logs/category/:category',
                        'GET /api/logs/mixed',
                        'GET /api/logs/files',
                        'GET /api/wallet/*',
                        'GET /api/positions/*',
                        'GET /api/pools/*',
                        'GET /api/jupiter/*',
                        'GET /api/monitor/*',
                        'POST /api/chain-position/create',
                        'GET /api/chain-position/calculate-ranges/:poolAddress',
                        'GET /api/chain-position/validate/:chainPositionId',
                        'GET /api/chain-position/health',
                        'GET /api/health-check',
                        'GET /api/health-check/statistics',
                        'GET /api/health-check/config',
                        'GET /api/health-check/instance/:instanceId',
                        'POST /api/health-check/check',
                        'POST /api/health-check/start',
                        'POST /api/health-check/stop',
                        'POST /api/health-check/force-cleanup/:instanceId'
                    ]
                });
            } else if (req.path.includes('.')) {
                // 🔧 过滤掉可以安全忽略的请求
                const ignoredPaths = [
                    '/.well-known/appspecific/com.chrome.devtools.json', // Chrome开发者工具
                    '/favicon.ico',                                        // 浏览器自动请求
                    '/.well-known/',                                       // Well-known规范路径
                    '/robots.txt',                                         // 搜索引擎爬虫
                    '/sitemap.xml'                                         // 站点地图
                ];

                const shouldIgnore = ignoredPaths.some(ignoredPath => req.path.startsWith(ignoredPath));

                if (shouldIgnore) {
                    // 静默处理，不记录错误日志
                    return res.status(404).json({
                        error: 'Not Found',
                        path: req.path
                    });
                }

                // 🔧 排除静态文件请求（包含文件扩展名的请求）
                console.log(`❌ 静态文件请求失败: ${req.path}`);
                return res.status(404).json({
                    error: '静态文件不存在',
                    path: req.path,
                    message: '请确认文件路径是否正确',
                    hint: '静态文件应该通过express.static中间件处理'
                });
            } else {
                // 🏠 SPA路由：返回主页面
                console.log(`🏠 SPA路由: ${req.path}`);
                const path = require('path');
                const fs = require('fs');

                // 🔧 使用与静态文件相同的智能路径计算
                const possibleIndexPaths = [
                    path.join(__dirname, '../../web/public/index.html'),
                    path.join(__dirname, '../web/public/index.html'),
                    path.join(process.cwd(), 'web/public/index.html'),
                    path.join(process.cwd(), 'dlmm-liquidity-manager/web/public/index.html'),
                ];

                const indexPath = possibleIndexPaths.find(p => {
                    try {
                        return fs.existsSync(p);
                    } catch (error) {
                        return false;
                    }
                }) || possibleIndexPaths[0];

                return res.sendFile(indexPath);
            }
        });

        await this.logger.logSystem('INFO', '✅ API路由配置完成');
    }

    /**
     * 格式化运行时间
     */
    private formatUptime(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}天 ${hours % 24}小时 ${minutes % 60}分钟`;
        if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
        if (minutes > 0) return `${minutes}分钟 ${seconds % 60}秒`;
        return `${seconds}秒`;
    }

    /**
     * 格式化字节大小
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }




    /**
     * 设置错误处理
     */
    private setupErrorHandling(): void {
        // 缓存方法引用，避免this上下文问题
        const logger = this.logger;
        const gracefulShutdown = this.gracefulShutdown.bind(this);

        // 全局错误处理中间件
        this.app.use(async (error: any, req: any, res: any, next: any) => {
            try {
                // 🔥 专门处理JSON解析错误
                if (error instanceof SyntaxError && 'body' in error && error.message.includes('JSON')) {
                    if (logger && typeof logger.logSystem === 'function') {
                        await logger.logSystem('ERROR', `JSON解析错误: ${error.message} | URL: ${req.originalUrl} | Method: ${req.method} | Content-Type: ${req.get('Content-Type')}`);
                    } else {
                        console.error('[SERVER] JSON解析错误:', {
                            error: error.message,
                            url: req.originalUrl,
                            method: req.method,
                            contentType: req.get('Content-Type')
                        });
                    }

                    return res.status(400).json({
                        success: false,
                        error: 'JSON格式错误，请检查请求数据格式',
                        details: error.message,
                        code: 'JSON_PARSE_ERROR',
                        timestamp: new Date().toISOString()
                    });
                }

                // 处理其他错误
                if (logger && typeof logger.logError === 'function') {
                    await logger.logError('Server', 'API错误:', error);
                } else {
                    console.error('[SERVER] API错误:', error);
                }
            } catch (logError) {
                console.error('[SERVER] 记录API错误失败:', logError);
                console.error('[SERVER] 原始API错误:', error);
            }
            
            res.status(500).json({
                error: 'Internal Server Error',
                message: error.message
            });
        });

        // Uncaught exception and unhandled rejection handlers
        process.removeListener('uncaughtException', this.boundHandleUncaughtException);
        process.removeListener('unhandledRejection', this.boundHandleUnhandledRejection);

        process.on('uncaughtException', this.boundHandleUncaughtException);
        process.on('unhandledRejection', this.boundHandleUnhandledRejection);

        // 信号处理
        process.on('SIGTERM', async () => {
            try {
                if (this.logger && typeof this.logger.logSystem === 'function') {
                    await this.logger.logSystem('INFO', '📨 收到SIGTERM信号');
                } else {
                    console.log('[SERVER] 📨 收到SIGTERM信号');
                }
            } catch (error) {
                console.log('[SERVER] 📨 收到SIGTERM信号');
            }
            await this.gracefulShutdown();
        });

        process.on('SIGINT', async () => {
            try {
                if (this.logger && typeof this.logger.logSystem === 'function') {
                    await this.logger.logSystem('INFO', '📨 收到SIGINT信号');
                } else {
                    console.log('[SERVER] 📨 收到SIGINT信号');
                }
            } catch (error) {
                console.log('[SERVER] 📨 收到SIGINT信号');
            }
            await this.gracefulShutdown();
        });
    }

    /**
     * 获取服务状态
     */
    private getServicesStatus(): any {
        if (!this.isInitialized) {
            return { status: 'initializing' };
        }

        return {
            blockchain: {
                solanaWeb3: this.services?.solanaWeb3 ? 'healthy' : 'error',
                wallet: this.services?.wallet ? 'healthy' : 'error',
                multiRPC: this.services?.multiRPC ? 'healthy' : 'error',
                gas: this.services?.gas ? 'healthy' : 'error'
            },
            external: {
                jupiter: this.services?.jupiter ? 'healthy' : 'error',
                meteora: this.services?.meteora ? 'healthy' : 'error',
                helius: this.services?.helius ? 'healthy' : 'error'
            },
            business: {
                positionManager: this.services?.positionManager ? 'healthy' : 'error',
                yPositionManager: this.services?.yPositionManager ? 'healthy' : 'error',
                xPositionManager: this.services?.xPositionManager ? 'healthy' : 'error',
                positionFeeHarvester: this.services?.positionFeeHarvester ? 'healthy' : 'error',
                positionInfo: this.services?.positionInfo ? 'healthy' : 'error'
            },
            strategy: {
                strategyManager: this.services?.strategyManager ? 'healthy' : 'error',
                strategyRegistry: this.services?.strategyRegistry ? 'healthy' : 'error',
                strategyScheduler: this.services?.strategyScheduler ? 'healthy' : 'error',
                strategyStorage: this.services?.strategyStorage ? 'healthy' : 'error',
                simpleYExecutor: this.services?.simpleYExecutor ? 'healthy' : 'error',
                healthChecker: this.services?.healthChecker ? 'healthy' : 'error'
            }
        };
    }

    /**
     * 🔒 创建服务器 - 支持HTTPS
     */
    private createServer(): any {
        // 检查是否有SSL证书配置
        const sslKey = process.env.SSL_KEY_PATH;
        const sslCert = process.env.SSL_CERT_PATH;
        const sslCA = process.env.SSL_CA_PATH; // CA证书链（可选）

        if (sslKey && sslCert) {
            try {
                // 检查证书文件是否存在
                if (fs.existsSync(sslKey) && fs.existsSync(sslCert)) {
                    const httpsOptions: any = {
                        key: fs.readFileSync(sslKey),
                        cert: fs.readFileSync(sslCert)
                    };

                    // 如果有CA证书链，添加到配置中（可选）
                    if (sslCA && fs.existsSync(sslCA)) {
                        httpsOptions.ca = fs.readFileSync(sslCA);
                        console.log('🔒 使用HTTPS服务器（包含CA证书链）');
                    } else {
                        console.log('🔒 使用HTTPS服务器（仅私钥+证书）');
                    }

                    return createHttpsServer(httpsOptions, this.app);
                } else {
                    console.log('⚠️  SSL证书文件不存在，降级为HTTP服务器');
                    console.log('证书路径:', { sslKey, sslCert });
                }
            } catch (error) {
                console.error('❌ SSL证书加载失败，降级为HTTP服务器:', error);
            }
        }

        // 使用HTTP服务器
        console.log('🌐 使用HTTP服务器');
        return createServer(this.app);
    }

    /**
     * 启动服务器
     */
    public async start(): Promise<void> {
        try {
            this.startTime = Date.now();
            await this.initializeServices();
            await this.logger.logSystem('INFO', '🚀 启动DLMM API服务器...');

            await this.setupMiddleware();
            await this.setupRoutes();
            this.setupErrorHandling();

            // 🔒 创建服务器 - 支持HTTPS
            this.server = this.createServer();

            // 🔧 修复：清理现有Socket.IO服务，防止重复监听器
            SocketIOService.cleanupExisting(this.socketIOService);

            // 🔥 初始化Socket.IO服务
            this.socketIOService = new SocketIOService(this.server, this.services.eventBus);
            await this.logger.logSystem('INFO', '🔌 Socket.IO服务已初始化（已清理旧实例）');

            // 启动服务器（同时支持API和Socket.IO）
            this.server.listen(this.port, async () => {
                const protocol = this.server.cert ? 'https' : 'http';
                const wsProtocol = this.server.cert ? 'wss' : 'ws';

                await this.logger.logSystem('INFO', `🎉 DLMM服务器启动成功在端口 ${this.port}`);
                await this.logger.logSystem('INFO', `📡 API服务器: ${protocol}://localhost:${this.port}`);
                await this.logger.logSystem('INFO', `🔌 Socket.IO服务器: ${protocol}://localhost:${this.port}/socket.io/`);
                await this.logger.logSystem('INFO', `🔌 WebSocket协议: ${wsProtocol}://localhost:${this.port}`);
            });

        } catch (error) {
            if (this.logger) {
                await this.logger.logError('Server', '❌ 服务器启动失败:', error as Error);
            } else {
                console.error('❌ 服务器启动失败(无Logger):', error);
            }
            throw error;
        }
    }



    /**
     * 优雅关闭
     */
    public async gracefulShutdown(): Promise<void> {
        if (this.isShuttingDown) {
            return;
        }
        this.isShuttingDown = true;

        await this.logger.logSystem('INFO', '🛑 开始优雅关闭服务器...');

        try {
            // 🔧 修复：清理Socket.IO服务，防止内存泄漏
            if (this.socketIOService) {
                this.socketIOService.cleanup();
                await this.logger.logSystem('INFO', '✅ Socket.IO服务已清理');
            }

            // 关闭HTTP服务器
            if (this.server) {
                this.server.close(async () => {
                    await this.logger.logSystem('INFO', '✅ HTTP服务器已关闭');
                });
            }



            // 关闭健康检查服务
            if (this.services?.healthChecker) {
                await this.services.healthChecker.stop();
                await this.logger.logSystem('INFO', '✅ StrategyHealthChecker已停止');
            }

            // 关闭策略管理器
            if (this.services?.strategyManager) {
                await this.services.strategyManager.shutdown();
            }

            await this.logger.logSystem('INFO', '✅ 所有服务已关闭');
            process.exit(0);

        } catch (error) {
            await this.logger.logError('Server', '❌ 关闭过程中发生错误:', error as Error);
            process.exit(1);
        }
    }

    /**
     * 处理未捕获的异常
     */
    private async handleUncaughtException(error: Error): Promise<void> {
        try {
            if (this.logger && typeof this.logger.logError === 'function') {
                await this.logger.logError('Server', '❌ 未捕获异常:', error);
            } else {
                console.error('[SERVER] ❌ 未捕获异常 (logger不可用):', error);
            }
        } catch (logError) {
            console.error('[SERVER] 记录异常日志失败:', logError);
            console.error('[SERVER] 原始异常:', error);
        }
        await this.gracefulShutdown();
    }

    /**
     * 处理未处理的Promise拒绝
     */
    private async handleUnhandledRejection(reason: any, promise: Promise<any>): Promise<void> {
        try {
            if (this.logger && typeof this.logger.logError === 'function') {
                await this.logger.logError('Server', '❌ 未处理的Promise拒绝:', new Error(String(reason)));
                await this.logger.logSystem('WARN', `Promise: ${String(promise)}`);
            } else {
                console.error('[SERVER] ❌ 未处理的Promise拒绝 (logger不可用):', reason);
                console.warn('[SERVER] Promise:', String(promise));
            }
        } catch (logError) {
            console.error('[SERVER] 记录Promise拒绝日志失败:', logError);
            console.error('[SERVER] 原始Promise拒绝:', reason);
        }
    }

    /**
     * 获取服务实例
     */
    public getServices() {
        return this.services;
    }

    /**
     * 获取应用实例
     */
    public getApp() {
        return this.app;
    }


}

// 主程序入口 - 检查是否直接运行
const isMainModule = process.argv[1] && (process.argv[1].endsWith('api-server.ts') || process.argv[1].endsWith('api-server.js'));

if (isMainModule) {
    const server = new DLMMAPIServer();
    server.start().catch(async (error) => {
        console.error('❌ 服务器启动失败:', error);
        process.exit(1);
    });
}

export default DLMMAPIServer; 