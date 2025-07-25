/**
 * 🚀 DLMM流动性管理系统 - 应用程序入口
 * 
 * 基于模块化架构的Solana DLMM流动性管理系统主入口
 */

import 'reflect-metadata';
import { config } from 'dotenv';
import { diContainer } from './di/container';
import { TYPES } from './types/interfaces';
import type {
    IConfigService,
    IEventBus,
    IHealthCheckService,
    ISolanaWeb3Service,
    IStrategyEngine,
    ILoggerService
} from './types/interfaces';

// 加载环境变量
config();

/**
 * DLMM应用程序主类
 */
class DLMMApplication {
    private logger: any; // 保留旧的logger用于兼容性
    private loggerService!: ILoggerService; // 新的日志服务
    private configService!: IConfigService;
    private eventBus!: IEventBus;
    private healthCheckService!: IHealthCheckService;
    private solanaService!: ISolanaWeb3Service;
    private strategyEngine!: IStrategyEngine;


    private isInitialized = false;
    private isRunning = false;
    private isShuttingDown = false; // 新增：关闭标志
    private startTime: number = 0;

    // Handlers bound to the class instance
    private readonly boundHandleUncaughtException: (error: Error) => void;
    private readonly boundHandleUnhandledRejection: (reason: any, promise: Promise<any>) => void;

    constructor() {
        // Bind handlers in the constructor to ensure 'this' is always the class instance
        this.boundHandleUncaughtException = (error) => {
            this.handleUncaughtException(error).catch(err => {
                // This is the last resort. If the handler itself fails, log and exit.
                console.error('CRITICAL: handleUncaughtException method failed catastrophically.', err);
                process.exit(1);
            });
        };

        this.boundHandleUnhandledRejection = (reason, promise) => {
            this.handleUnhandledRejection(reason, promise).catch(err => {
                // Last resort for promise rejection handler
                console.error('CRITICAL: handleUnhandledRejection method failed catastrophically.', err);
                process.exit(1);
            });
        };
    }

    /**
     * 初始化应用程序
     */
    public async initialize(): Promise<void> {
        try {
            console.log('🚀 启动DLMM流动性管理系统...');
            console.log('📋 系统版本: 1.0.0');
            console.log('🌐 Solana网络: ' + (process.env.SOLANA_NETWORK || 'mainnet-beta'));

            // 1. 初始化依赖注入容器
            diContainer.initialize();

            // 2. 验证容器健康状态
            const containerHealthy = await diContainer.validateContainer();
            if (!containerHealthy) {
                throw new Error('依赖注入容器验证失败');
            }

            // 3. 获取核心服务
            await this.initializeCoreServices();

            // 4. 初始化各个服务
            await this.initializeServices();

            // 5. 设置全局错误处理
            this.setupGlobalErrorHandling();

            // 6. 设置进程信号处理
            this.setupProcessHandlers();

            this.isInitialized = true;
            await this.loggerService.logSystem('INFO', '🔧 [APP] DLMM应用程序初始化完成');

        } catch (error) {
            console.error('❌ 应用程序初始化失败:', error);
            process.exit(1);
        }
    }

    /**
     * 初始化核心服务
     */
    private async initializeCoreServices(): Promise<void> {
        console.log('⚙️ 初始化核心服务...');

        // 获取基础设施服务
        this.loggerService = diContainer.getService<ILoggerService>(TYPES.LoggerService);
        this.configService = diContainer.getService<IConfigService>(TYPES.ConfigService);
        this.eventBus = diContainer.getService<IEventBus>(TYPES.EventBus);

        // 创建应用级日志器 (保留旧的兼容)
        this.logger = (this.loggerService as any).createStrategyLogger('APP');

        console.log('✅ 核心服务初始化完成');
    }

    /**
     * 初始化所有服务
     */
    /**
     * 初始化所有服务 (优化版 - 分阶段启动)
     */
    private async initializeServices(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🔧 [APP] 开始分阶段初始化系统服务...');

        try {
            // 阶段1：核心基础设施（必须成功）
            await this.initializeCoreInfrastructure();

            // 阶段2：区块链基础服务（允许降级）
            await this.initializeBlockchainServices();

            // 阶段3：外部服务（允许失败）
            await this.initializeExternalServices();

            // 阶段4：业务服务（依赖前面的服务）
            await this.initializeBusinessServices();

            await this.loggerService.logSystem('INFO', '🔧 [APP] 分阶段服务初始化完成');
        } catch (error) {
            await this.loggerService.logError('App', '❌ [APP] 服务初始化失败', error as Error);
            throw error;
        }
    }

    /**
     * 阶段1：初始化核心基础设施
     */
    private async initializeCoreInfrastructure(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🔧 [阶段1] 初始化核心基础设施...');

        // 核心服务必须成功
        this.configService = diContainer.getService<IConfigService>(TYPES.ConfigService);
        this.eventBus = diContainer.getService<IEventBus>(TYPES.EventBus);

        // 加载配置文件
        await this.loggerService.logSystem('INFO', '⚙️ [阶段1] 加载配置文件...');
        await this.configService.load();

        await this.loggerService.logSystem('INFO', '✅ [阶段1] 核心基础设施初始化完成');
    }

    /**
     * 阶段2：初始化区块链服务
     */
    private async initializeBlockchainServices(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🔧 [阶段2] 初始化区块链服务...');

        try {
            // 尝试初始化关键区块链服务
            const solanaService = diContainer.getService(TYPES.SolanaWeb3Service) as any;
            if (solanaService && typeof solanaService.initialize === 'function') {
                await solanaService.initialize({});
            }
            await this.loggerService.logSystem('INFO', '✅ [阶段2] 区块链服务初始化完成');
        } catch (error) {
            await this.loggerService.logSystem('WARN', '⚠️ [阶段2] 区块链服务初始化失败，继续启动', (error as Error).message);
            // 不抛出错误，允许系统继续启动
        }
    }

    /**
     * 阶段3：初始化外部服务
     */
    private async initializeExternalServices(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🔧 [阶段3] 初始化外部服务...');

        // 外部服务失败不应该阻止系统启动
        const externalServices = ['JupiterService', 'MeteoraService', 'HeliusService'];

        for (const serviceName of externalServices) {
            try {
                const serviceType = (TYPES as any)[serviceName];
                if (serviceType && diContainer.isRegistered(serviceType)) {
                    const service = diContainer.getService(serviceType) as any;
                    if (service && typeof service.initialize === 'function') {
                        await service.initialize({});
                    }
                    await this.loggerService.logSystem('INFO', `✅ [阶段3] ${serviceName} 初始化成功`);
                }
            } catch (error) {
                await this.loggerService.logSystem('WARN', `⚠️ [阶段3] ${serviceName} 初始化失败，跳过`, (error as Error).message);
                // 继续下一个服务
            }
        }

        await this.loggerService.logSystem('INFO', '✅ [阶段3] 外部服务初始化完成');
    }

    /**
     * 阶段4：初始化业务服务
     */
    private async initializeBusinessServices(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🔧 [阶段4] 初始化业务服务...');

        try {
            // 初始化策略相关服务
            await this.loggerService.logSystem('INFO', '🔧 [阶段4] 初始化策略管理器...');

            // 获取策略注册表和执行器
            const strategyRegistry = diContainer.getService(TYPES.StrategyRegistry) as any;
            const simpleYExecutor = diContainer.getService(TYPES.SimpleYExecutor) as any;
            const chainPositionExecutor = diContainer.getService(TYPES.ChainPositionExecutor) as any;

            // 注册策略执行器
            await strategyRegistry.register('simple-y', simpleYExecutor);
            await this.loggerService.logSystem('INFO', '✅ SimpleYExecutor已注册');
            await strategyRegistry.register('chain_position', chainPositionExecutor);
            await this.loggerService.logSystem('INFO', '✅ ChainPositionExecutor已注册');

            // 初始化策略管理器
            const strategyManager = diContainer.getService(TYPES.StrategyManager) as any;
            if (strategyManager && typeof strategyManager.initialize === 'function') {
                await strategyManager.initialize();
                await this.loggerService.logSystem('INFO', '✅ [策略] 策略管理器初始化完成');
            }

            await this.loggerService.logSystem('INFO', '✅ [阶段4] 业务服务初始化完成');
        } catch (error) {
            await this.loggerService.logSystem('WARN', '⚠️ [阶段4] 部分业务服务初始化失败', (error as Error).message);
            // 根据错误严重程度决定是否继续
            throw error; // 策略服务是核心功能，初始化失败应该停止启动
        }
    }

    /**
     * 启动应用程序
     */
    public async start(): Promise<void> {
        if (this.isRunning) {
            await this.loggerService.logSystem('WARN', '⚠️ [APP] 应用程序已在运行中');
            return;
        }

        await this.loggerService.logSystem('INFO', '🚀 [APP] 🎉 DLMM系统启动完成!');

        this.startTime = Date.now();
        this.isRunning = true;

        // 启动API服务器
        await this.startAPIServer();

        // 启动监控服务器
        await this.startMonitorServer();

        // 发布应用启动事件
        this.eventBus.publish('application.started', {
            startTime: this.startTime,
            version: process.env.npm_package_version || '1.0.0'
        });

        await this.loggerService.logSystem('INFO', `🌐 [APP] API服务器: http://localhost:${this.configService.get('server.port', 7000)}`);

        await this.loggerService.logSystem('INFO', `📊 [APP] 监控端点: http://localhost:${this.configService.get('monitor.port', 7003)}`);
    }

    /**
 * 启动API服务器
 */
    private async startAPIServer(): Promise<void> {
        const port = this.configService.get('server.port', 7000);

        await this.loggerService.logSystem('INFO', `🌐 [APP] API服务器将在端口 ${port} 启动`);

        try {
            const { DLMMAPIServer } = await import('./server/api-server');
            const apiServer = new DLMMAPIServer(port);
            await apiServer.start();

            await this.loggerService.logSystem('INFO', `✅ [APP] API服务器启动成功在端口 ${port}`);
        } catch (error) {
            await this.loggerService.logError('App', '❌ [APP] API服务器启动失败', error as Error);
            throw error;
        }
    }

    /**
 * 启动监控服务器
 */
    private async startMonitorServer(): Promise<void> {
        const port = this.configService.get('monitor.port', 7003);

        await this.loggerService.logSystem('INFO', `📊 [APP] 监控服务器将在端口 ${port} 启动`);

        // TODO: 实现监控服务器
        // const monitorServer = await import('./monitor/server.js');
        // await monitorServer.start(port);
    }

    /**
     * 停止应用程序
     */
    public async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        await this.loggerService.logSystem('INFO', '🛑 [APP] 开始关闭DLMM系统...');

        try {


            // 停止策略引擎
            if (this.strategyEngine) {
                await this.strategyEngine.stop();
            }

            // 停止区块链服务
            if (this.solanaService) {
                await this.solanaService.stop();
            }

            // 发布应用停止事件
            this.eventBus.publish('application.stopped', {
                stopTime: Date.now(),
                uptime: Date.now() - this.startTime
            });

            this.isRunning = false;
            await this.loggerService.logSystem('INFO', '✅ [APP] DLMM系统已安全关闭');

        } catch (error) {
            await this.loggerService.logError('App', '❌ [APP] 应用程序关闭时发生错误', error as Error);
            throw error;
        }
    }

    /**
     * 设置全局错误处理
     */
    private setupGlobalErrorHandling(): void {
        // Remove existing listeners to prevent duplicates, then add the bound handlers.
        process.removeListener('uncaughtException', this.boundHandleUncaughtException);
        process.removeListener('unhandledRejection', this.boundHandleUnhandledRejection);

        process.on('uncaughtException', this.boundHandleUncaughtException);
        process.on('unhandledRejection', this.boundHandleUnhandledRejection);
    }

    /**
     * 设置进程信号处理
     */
    private setupProcessHandlers(): void {
        const loggerService = this.loggerService;

        // SIGTERM 信号处理
        process.on('SIGTERM', async () => {
            try {
                if (loggerService && typeof loggerService.logSystem === 'function') {
                    await loggerService.logSystem('INFO', '🔔 [APP] 收到SIGTERM信号，开始优雅关闭...');
                } else {
                    console.log('🔔 [APP] 收到SIGTERM信号，开始优雅关闭...');
                }
            } catch (error) {
                console.log('🔔 [APP] 收到SIGTERM信号，开始优雅关闭...');
            }
            await this.gracefulShutdown('SIGTERM');
        });

        // SIGINT 信号处理 (Ctrl+C)
        process.on('SIGINT', async () => {
            try {
                if (loggerService && typeof loggerService.logSystem === 'function') {
                    await loggerService.logSystem('INFO', '🔔 [APP] 收到SIGINT信号，开始优雅关闭...');
                } else {
                    console.log('🔔 [APP] 收到SIGINT信号，开始优雅关闭...');
                }
            } catch (error) {
                console.log('🔔 [APP] 收到SIGINT信号，开始优雅关闭...');
            }
            await this.gracefulShutdown('SIGINT');
        });
    }

    /**
     * 优雅关闭
     */
    private async gracefulShutdown(reason: string): Promise<void> {
        // 防止重复进入关闭流程
        if (this.isShuttingDown) {
            console.log(`[APP] 已经处于关闭流程中，忽略新的关闭请求 (原因: ${reason})`);
            return;
        }
        this.isShuttingDown = true;

        try {
            if (this.loggerService && typeof this.loggerService.logSystem === 'function') {
                await this.loggerService.logSystem('INFO', `🔄 [APP] 开始优雅关闭 (原因: ${reason})`);
            } else {
                console.log(`🔄 [APP] 开始优雅关闭 (原因: ${reason})`);
            }
        } catch (error) {
            console.log(`🔄 [APP] 开始优雅关闭 (原因: ${reason}) - logger不可用`);
        }

        try {
            // 设置关闭超时
            const shutdownTimeout = setTimeout(async () => {
                try {
                    if (this.loggerService && typeof this.loggerService.logError === 'function') {
                        await this.loggerService.logError('App', '❌ [APP] 关闭超时，强制退出', new Error('Shutdown timeout'));
                    } else {
                        console.error('❌ [APP] 关闭超时，强制退出');
                    }
                } catch (error) {
                    console.error('❌ [APP] 关闭超时，强制退出');
                }
                process.exit(1);
            }, 30000); // 30秒超时

            await this.stop();

            clearTimeout(shutdownTimeout);

            try {
                if (this.loggerService && typeof this.loggerService.logSystem === 'function') {
                    await this.loggerService.logSystem('INFO', '✅ [APP] 优雅关闭完成');
                } else {
                    console.log('✅ [APP] 优雅关闭完成');
                }
            } catch (error) {
                console.log('✅ [APP] 优雅关闭完成');
            }

            process.exit(0);

        } catch (error) {
            try {
                if (this.loggerService && typeof this.loggerService.logError === 'function') {
                    await this.loggerService.logError('App', '❌ [APP] 优雅关闭失败', error as Error);
                } else {
                    console.error('❌ [APP] 优雅关闭失败:', error);
                }
            } catch (logError) {
                console.error('❌ [APP] 优雅关闭失败:', error);
            }
            process.exit(1);
        }
    }

    /**
     * 获取应用程序状态
     */
    public getStatus() {
        return {
            initialized: this.isInitialized,
            running: this.isRunning,
            uptime: this.isRunning ? Date.now() - this.startTime : 0,
            version: '1.0.0'
        };
    }

    /**
     * 重新加载配置
     */
    public async reloadConfig(): Promise<void> {
        await this.loggerService.logSystem('INFO', '⚙️ [APP] 重新加载配置...');
        await this.configService.reload();
        await this.loggerService.logSystem('INFO', '✅ [APP] 配置重新加载完成');
    }

    /**
     * @param error 异常对象
     */
    private async handleUncaughtException(error: Error): Promise<void> {
        try {
            if (this.loggerService && typeof this.loggerService.logError === 'function') {
                await this.loggerService.logError('App', '❌ [APP] 未捕获的异常', error);
            } else {
                console.error('❌ [APP] 未捕获的异常 (logger不可用):', error);
            }
        } catch (logError) {
            console.error('❌ [APP] 记录异常日志失败:', logError);
            console.error('❌ [APP] 原始异常:', error);
        }

        // 优雅关闭
        await this.gracefulShutdown('uncaughtException');
    }

    /**
     * @param reason 拒绝的原因
     * @param promise 被拒绝的Promise
     */
    private async handleUnhandledRejection(reason: any, promise: Promise<any>): Promise<void> {
        try {
            const errorMessage = reason instanceof Error ? reason.stack : String(reason);
            if (this.loggerService && typeof this.loggerService.logError === 'function') {
                await this.loggerService.logError('App', `❌ [APP] 未处理的Promise拒绝: ${errorMessage}`, reason instanceof Error ? reason : new Error(String(reason)));
            } else {
                console.error('❌ [APP] 未处理的Promise拒绝 (logger不可用):', reason);
            }
        } catch (logError) {
            console.error('❌ [APP] 记录Promise拒绝日志失败:', logError);
            console.error('❌ [APP] 原始Promise拒绝:', reason);
        }

        // 优雅关闭
        await this.gracefulShutdown('unhandledRejection');
    }
}

/**
 * 应用程序入口函数
 */
async function main(): Promise<void> {
    const app = new DLMMApplication();

    try {
        await app.initialize();
        await app.start();

        // 保持进程运行
        process.on('exit', () => {
            console.log('👋 感谢使用DLMM流动性管理系统!');
        });

    } catch (error) {
        console.error('💥 应用程序启动失败:', error);
        process.exit(1);
    }
}

// 启动应用程序
if (require.main === module) {
    main().catch((error) => {
        console.error('💥 启动失败:', error);
        process.exit(1);
    });
}

export { DLMMApplication }; 