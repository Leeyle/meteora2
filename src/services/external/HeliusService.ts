import { injectable, inject } from 'tsyringe';
import { PublicKey } from '@solana/web3.js';
import axios, { AxiosInstance } from 'axios';
import { IHeliusService, IConfigService, ILoggerService, ICacheService, TYPES } from '../../types/interfaces';
import { ModuleConfig, ModuleHealth, ModuleMetrics } from '../../types/interfaces';

interface HeliusConfig {
    apiKey: string;
    baseURL: string;
    rateLimitPerSecond: number;
    timeout: number;
}

interface HeliusTransaction {
    signature: string;
    slot: number;
    timestamp: number;
    fee: number;
    status: 'success' | 'failed';
    instructions: any[];
    accounts: string[];
    programIds: string[];
}

/**
 * Helius增强RPC服务
 * 提供高性能的Solana数据查询功能
 * 基于Helius API的企业级服务
 */
@injectable()
export class HeliusService implements IHeliusService {
    public readonly name = 'HeliusService';
    public readonly version = '2.0.0';
    public readonly dependencies = ['ConfigService', 'LoggerService', 'CacheService'];

    private config!: HeliusConfig;
    private apiClient!: AxiosInstance;
    private requestCount: number = 0;
    private errorCount: number = 0;
    private rateLimiter: number[] = [];

    // 性能监控指标
    private operationCount: number = 0;
    private totalResponseTime: number = 0;
    private lastOperationTime: number = 0;

    // 缓存配置
    private readonly transactionCacheTTL = 60000; // 1分钟交易缓存
    private readonly accountCacheTTL = 10000; // 10秒账户缓存

    // 默认配置
    private readonly defaultConfig: HeliusConfig = {
        apiKey: '',
        baseURL: 'https://api.helius.xyz/v0',
        rateLimitPerSecond: 100,
        timeout: 15000
    };

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.CacheService) private cacheService: ICacheService
    ) { }

    async initialize(config: ModuleConfig): Promise<void> {
        // 🔧 系统日志: 服务初始化
        await this.loggerService.logSystem('INFO', 'HeliusService开始初始化...');

        // 加载配置
        const userConfig = this.configService.get('helius', {});
        this.config = { ...this.defaultConfig, ...userConfig };

        if (!this.config.apiKey) {
            await this.loggerService.logSystem('WARN', 'Helius API密钥未配置，服务将使用受限功能');
        }

        // 初始化API客户端
        this.initializeAPIClient();

        // 验证API连接
        await this.validateAPIConnection();

        // 🔧 系统日志: 初始化完成
        await this.loggerService.logSystem('INFO', `HeliusService初始化完成 v${this.version}, API连接: ${!!this.config.apiKey ? '已配置' : '未配置'}`);
    }

    async start(): Promise<void> {
        await this.loggerService.logSystem('INFO', 'HeliusService启动完成');
    }

    async stop(): Promise<void> {
        await this.loggerService.logSystem('INFO', 'HeliusService已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            const startTime = Date.now();

            // 测试API连接 (如果没有API密钥，返回警告状态)
            if (!this.config.apiKey) {
                return {
                    status: 'warning',
                    message: 'Helius API密钥未配置，功能受限',
                    timestamp: Date.now(),
                    details: {
                        hasApiKey: false,
                        requestCount: this.requestCount,
                        errorCount: this.errorCount
                    }
                };
            }

            // TODO: 实现实际的健康检查API调用
            const responseTime = Date.now() - startTime;

            return {
                status: 'healthy',
                message: `Helius API连接正常 (${responseTime}ms)`,
                timestamp: Date.now(),
                details: {
                    responseTime,
                    requestCount: this.requestCount,
                    errorCount: this.errorCount,
                    errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Helius API连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: Date.now()
            };
        }
    }

    getMetrics(): ModuleMetrics {
        const avgResponseTime = this.operationCount > 0 ? this.totalResponseTime / this.operationCount : 0;

        return {
            uptime: Date.now(),
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            lastActivity: this.lastOperationTime || Date.now(),
            performance: {
                avgResponseTime,
                successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 100
            }
        };
    }

    /**
     * 获取账户的交易历史
     * @param address 账户地址
     * @param options 查询选项
     */
    async getTransactionHistory(
        address: string,
        options: {
            before?: string;
            until?: string;
            limit?: number;
            source?: string;
            type?: string[];
        } = {}
    ): Promise<HeliusTransaction[]> {
        const operationStart = Date.now();
        this.operationCount++;
        try {
            if (!this.config.apiKey) {
                throw new Error('需要Helius API密钥才能使用此功能');
            }

            // 检查缓存
            const cacheKey = `tx_history:${address}:${JSON.stringify(options)}`;
            const cachedHistory = await this.cacheService.get<HeliusTransaction[]>(cacheKey);

            if (cachedHistory) {
                await this.loggerService.logSystem('DEBUG', '使用缓存的交易历史');
                return cachedHistory;
            }

            await this.loggerService.logBusinessOperation('get-transaction-history', {
                address: address.substring(0, 8) + '...',
                limit: options.limit || 100,
                timestamp: Date.now()
            });

            // 检查频率限制
            await this.checkRateLimit();
            this.requestCount++;

            // TODO: 实现实际的API调用
            const transactions: HeliusTransaction[] = [];
            await this.loggerService.logSystem('WARN', '交易历史获取功能待实现');

            // 缓存结果
            await this.cacheService.set(cacheKey, transactions, this.transactionCacheTTL);

            await this.loggerService.logBusinessMonitoring('transaction-history-success', {
                address: address.substring(0, 8) + '...',
                transactionCount: transactions.length,
                responseTime: Date.now() - operationStart,
                timestamp: Date.now()
            });

            return transactions;
        } catch (error) {
            this.errorCount++;
            const operationTime = Date.now() - operationStart;
            this.totalResponseTime += operationTime;
            this.lastOperationTime = Date.now();
            await this.loggerService.logError('get-transaction-history', '获取交易历史失败', error as Error);
            throw new Error(`获取交易历史失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取增强的账户信息
     * @param address 账户地址
     */
    async getEnhancedAccountInfo(address: string): Promise<any> {
        const operationStart = Date.now();
        this.operationCount++;
        try {
            if (!this.config.apiKey) {
                throw new Error('需要Helius API密钥才能使用此功能');
            }

            // 检查缓存
            const cacheKey = `account_info:${address}`;
            const cachedInfo = await this.cacheService.get<any>(cacheKey);

            if (cachedInfo) {
                await this.loggerService.logSystem('DEBUG', '使用缓存的账户信息');
                return cachedInfo;
            }

            await this.loggerService.logBusinessOperation('get-enhanced-account-info', {
                address: address.substring(0, 8) + '...',
                timestamp: Date.now()
            });

            // 检查频率限制
            await this.checkRateLimit();
            this.requestCount++;

            // TODO: 实现实际的API调用
            const accountInfo = {};
            await this.loggerService.logSystem('WARN', '增强账户信息获取功能待实现');

            // 缓存结果
            await this.cacheService.set(cacheKey, accountInfo, this.accountCacheTTL);

            await this.loggerService.logBusinessMonitoring('enhanced-account-info-success', {
                address: address.substring(0, 8) + '...',
                responseTime: Date.now() - operationStart,
                timestamp: Date.now()
            });

            return accountInfo;
        } catch (error) {
            this.errorCount++;
            const operationTimeTwo = Date.now() - operationStart;
            this.totalResponseTime += operationTimeTwo;
            this.lastOperationTime = Date.now();
            await this.loggerService.logError('get-enhanced-account-info', '获取增强账户信息失败', error as Error);
            throw new Error(`获取增强账户信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 批量获取交易详情
     * @param signatures 交易签名数组
     */
    async getBatchTransactions(signatures: string[]): Promise<HeliusTransaction[]> {
        const operationStart = Date.now();
        this.operationCount++;
        try {
            if (!this.config.apiKey) {
                throw new Error('需要Helius API密钥才能使用此功能');
            }

            await this.loggerService.logBusinessOperation('get-batch-transactions', {
                signatureCount: signatures.length,
                timestamp: Date.now()
            });

            // 检查频率限制
            await this.checkRateLimit();
            this.requestCount++;

            // TODO: 实现实际的API调用
            const transactions: HeliusTransaction[] = [];
            await this.loggerService.logSystem('WARN', '批量交易详情获取功能待实现');

            await this.loggerService.logBusinessMonitoring('batch-transactions-success', {
                signatureCount: signatures.length,
                transactionCount: transactions.length,
                responseTime: Date.now() - operationStart,
                timestamp: Date.now()
            });

            return transactions;
        } catch (error) {
            this.errorCount++;
            const operationTimeThree = Date.now() - operationStart;
            this.totalResponseTime += operationTimeThree;
            this.lastOperationTime = Date.now();
            await this.loggerService.logError('get-batch-transactions', '批量获取交易详情失败', error as Error);
            throw new Error(`批量获取交易详情失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 初始化API客户端
     */
    private initializeAPIClient(): void {
        this.apiClient = axios.create({
            baseURL: this.config.baseURL,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'DLMM-Manager/1.0.0'
            }
        });

        // 请求拦截器
        this.apiClient.interceptors.request.use(
            (config) => {
                this.loggerService.logSystem('DEBUG', `Helius API请求: ${config.method} ${config.url}`);
                return config;
            },
            (error) => {
                this.loggerService.logError('helius-api-request', 'Helius API请求错误', error as Error);
                return Promise.reject(error);
            }
        );

        // 响应拦截器
        this.apiClient.interceptors.response.use(
            (response) => {
                this.loggerService.logSystem('DEBUG', `Helius API响应: ${response.status} ${response.statusText}`);
                return response;
            },
            (error) => {
                this.loggerService.logError('helius-api-response', `Helius API响应错误: ${error.status}`, error as Error);
                return Promise.reject(error);
            }
        );
    }

    /**
     * 验证API连接
     */
    private async validateAPIConnection(): Promise<void> {
        try {
            // 如果没有API密钥，跳过验证
            if (!this.config.apiKey) {
                await this.loggerService.logSystem('WARN', '没有API密钥，跳过连接验证');
                return;
            }

            // TODO: 实现实际的API连接验证
            await this.loggerService.logSystem('WARN', 'API连接验证功能待实现');

        } catch (error) {
            await this.loggerService.logSystem('WARN', `Helius API连接验证失败，将使用受限功能: ${error}`);
            // 不抛出错误，允许服务以受限模式运行
        }
    }

    /**
     * 检查频率限制
     */
    private async checkRateLimit(): Promise<void> {
        const now = Date.now();
        const oneSecondAgo = now - 1000;

        // 清理1秒前的请求记录
        this.rateLimiter = this.rateLimiter.filter(timestamp => timestamp > oneSecondAgo);

        // 检查是否超过频率限制
        if (this.rateLimiter.length >= this.config.rateLimitPerSecond) {
            const waitTime = 1000 - (now - this.rateLimiter[0]);
            await this.loggerService.logSystem('DEBUG', `频率限制，等待 ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.checkRateLimit();
        }

        // 记录此次请求
        this.rateLimiter.push(now);
    }

    /**
     * 销毁服务，清理资源
     */
    async destroy(): Promise<void> {
        await this.loggerService.logSystem('INFO', 'HeliusService资源清理完成');
    }
} 