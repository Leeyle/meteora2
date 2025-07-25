/**
 * 🚨 重要修改说明：Jupiter V6功能已全部注释
 * 
 * 修改日期：2025年1月
 * 修改原因：全面切换到Jupiter V7 API
 * 
 * V6功能状态：
 * - ✅ 已注释保留，可用于紧急回退
 * - 🔥 强制使用V7，忽略配置文件设置
 * - 📝 所有V6相关代码用注释块标记
 * 
 * 回退方法：
 * 1. 取消注释V6相关代码块
 * 2. 修改 useV7 = false
 * 3. 重启服务
 * 
 * V7优势：
 * - 更稳定的API端点 (lite-api.jup.ag/ultra/v1)
 * - 更高的交换成功率
 * - 统一的RPC连接管理
 * - 详细的RPC日志记录
 */

import { injectable, inject } from 'tsyringe';
import { Transaction, VersionedTransaction, PublicKey, Keypair } from '@solana/web3.js';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { IJupiterService, IConfigService, ILoggerService, ICacheService, ISolanaWeb3Service, IWalletService, TYPES } from '../../types/interfaces';
import { JupiterQuote, SwapParams, SwapResult, ModuleConfig, ModuleHealth, ModuleMetrics } from '../../types/interfaces';
import { JupiterServiceV7 } from './JupiterServiceV7';

interface JupiterAPIQuote {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    platformFee?: {
        amount: string;
        feeBps: number;
    };
    priceImpactPct: string;
    routePlan: any[];
    contextSlot?: number;
    timeTaken?: number;
}

interface JupiterSwapRequest {
    quoteResponse: JupiterAPIQuote;
    userPublicKey: string;
    wrapAndUnwrapSol?: boolean;
    useSharedAccounts?: boolean;
    feeAccount?: string;
    trackingAccount?: string;
    computeUnitPriceMicroLamports?: number;
    prioritizationFeeLamports?: number;
    asLegacyTransaction?: boolean;
    useTokenLedger?: boolean;
    destinationTokenAccount?: string;
}

interface JupiterSwapResponse {
    swapTransaction: string;
    lastValidBlockHeight: number;
    prioritizationFeeLamports?: number;
    computeUnitLimit?: number;
    prioritizationType?: {
        computeBudget?: {
            microLamports: number;
            estimatedTotalCost: number;
        };
    };
}

/**
 * Jupiter聚合器服务
 * 负责代币交换、价格查询、路由计算等功能
 * 参考原项目: DLMM_meme_zuowan/src/jupiter_swap.py
 */
@injectable()
export class JupiterService implements IJupiterService {
    public readonly name = 'JupiterService';
    public readonly version = '2.0.0';
    public readonly dependencies = ['ConfigService', 'LoggerService', 'CacheService', 'SolanaWeb3Service', 'WalletService'];

    private config: any;
    private apiClient!: AxiosInstance;
    private baseURL: string = 'https://quote-api.jup.ag/v6';
    private priceAPIURL: string = 'https://price.jup.ag/v4';
    private requestCount: number = 0;
    private errorCount: number = 0;
    private operationCount: number = 0;
    private lastOperationTime: number = 0;
    private totalResponseTime: number = 0;

    // V7 集成 - 全面切换到V7，V6功能已注释保留
    private v7Service: JupiterServiceV7;
    private useV7: boolean = true; // 🔥 强制使用V7，V6功能已注释

    // 缓存配置 - 已禁用关键缓存以确保高波动市场的交换成功
    private readonly quoteCacheTTL = 10000; // 🔥 已禁用：报价缓存影响交换成功率
    private readonly priceCacheTTL = 30000; // 🔥 已禁用：价格缓存影响交换决策
    private readonly routeCacheTTL = 300000; // 5分钟路由缓存（仅用于代币列表等非关键数据）

    // 交易配置
    private readonly defaultSlippageBps = 1000; // 10% - 与策略配置保持一致
    private readonly maxSlippageBps = 3000; // 30% - 支持更大的滑点范围
    private readonly minSwapAmount = 1000; // 最小交换金额 (lamports)

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.CacheService) private cacheService: ICacheService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        @inject(TYPES.WalletService) private walletService: IWalletService
    ) {
        // 初始化V7服务
        this.v7Service = new JupiterServiceV7(configService, loggerService, solanaService, walletService);
    }

    async initialize(config: ModuleConfig): Promise<void> {
        // 🔧 系统日志: 服务初始化
        await this.loggerService.logSystem('INFO', 'JupiterService开始初始化...');

        this.config = this.configService.get('jupiter', {});

        // 🔥 强制使用V7，忽略配置文件设置
        // this.useV7 = this.configService.get('jupiter.useV7', false); // V6回退时启用
        this.useV7 = true; // 强制使用V7

        // V6功能已注释，全面使用V7
        await this.loggerService.logSystem('INFO', '🚀 强制使用Jupiter Ultra API (lite-api.jup.ag/ultra/v1) - V6功能已注释');

        // 初始化API客户端
        this.initializeAPIClient();

        // 验证API连接
        await this.validateAPIConnection();

        // 🔧 系统日志: 初始化完成
        await this.loggerService.logSystem('INFO', `JupiterService初始化完成 v${this.version} - API: ${this.baseURL}`);
    }

    async start(): Promise<void> {
        await this.loggerService.logSystem('INFO', 'JupiterService启动完成');
    }

    async stop(): Promise<void> {
        await this.loggerService.logSystem('INFO', 'JupiterService已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        // 🔥 强制使用V7健康检查，通过V7服务进行
        try {
            // 使用V7服务进行健康检查
            const testQuote = await this.v7Service.getQuoteV7(
                'So11111111111111111111111111111111111111112', // SOL
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                '1000000', // 0.001 SOL
                this.defaultSlippageBps
            );

            if (testQuote && testQuote.outAmount) {
                return {
                    status: 'healthy',
                    message: 'Jupiter V7 API连接正常',
                    timestamp: Date.now(),
                    details: {
                        version: 'v7',
                        endpoint: 'lite-api.jup.ag/ultra/v1',
                        requestCount: this.requestCount,
                        errorCount: this.errorCount,
                        errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0
                    }
                };
            } else {
                return {
                    status: 'warning',
                    message: 'Jupiter V7 API响应异常',
                    timestamp: Date.now()
                };
            }
        } catch (error) {
            // 如果是余额不足错误，说明API连接正常
            if (error instanceof Error && error.message.includes('insufficient input')) {
                return {
                    status: 'healthy',
                    message: 'Jupiter Ultra API连接正常 (测试钱包余额不足)',
                    timestamp: Date.now(),
                    details: {
                        version: 'ultra-v1',
                        endpoint: 'lite-api.jup.ag/ultra/v1',
                        note: '健康检查通过，但测试钱包余额不足'
                    }
                };
            }

            return {
                status: 'error',
                message: `Jupiter Ultra API连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: Date.now()
            };
        }

        /* ==================== V6健康检查已注释，保留用于回退 ====================
        try {
            // 使用更快的quote端点进行健康检查，而不是tokens端点
            const startTime = Date.now();
            const response = await this.apiClient.get('/quote', {
                params: {
                    inputMint: 'So11111111111111111111111111111111111111112', // SOL
                    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                    amount: '1000000', // 0.001 SOL
                    slippageBps: this.defaultSlippageBps
                },
                timeout: 3000 // 减少超时时间
            });
            const responseTime = Date.now() - startTime;

            if (response.status === 200 && response.data) {
                return {
                    status: 'healthy',
                    message: `Jupiter API连接正常 (${responseTime}ms)`,
                    timestamp: Date.now(),
                    details: {
                        responseTime,
                        requestCount: this.requestCount,
                        errorCount: this.errorCount,
                        errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0
                    }
                };
            } else {
                return {
                    status: 'warning',
                    message: `Jupiter API响应异常: ${response.status}`,
                    timestamp: Date.now()
                };
            }
        } catch (error) {
            // 如果quote也失败，尝试最简单的连接测试
            try {
                const basicResponse = await axios.get('https://quote-api.jup.ag/v6', {
                    timeout: 2000
                });

                if (basicResponse.status === 200) {
                    return {
                        status: 'warning',
                        message: 'Jupiter API基础连接正常，但功能可能受限',
                        timestamp: Date.now()
                    };
                }
            } catch (basicError) {
                // 完全失败
            }

            return {
                status: 'error',
                message: `Jupiter API连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: Date.now()
            };
        }
        ==================== V6健康检查已注释，保留用于回退 ==================== */
    }

    getMetrics(): ModuleMetrics {
        const baseMetrics = {
            uptime: Date.now(),
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            lastActivity: Date.now(),
            performance: {
                avgResponseTime: 0, // TODO: 实现响应时间统计
                successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 100
            }
        };

        // 🔥 强制使用V7，返回V7统计信息
        const v7Metrics = this.v7Service.getMetrics();
        return {
            ...baseMetrics,
            version: 'v7',
            endpoint: v7Metrics.endpoint,
            v7Stats: v7Metrics,
            v6Stats: baseMetrics // 保留V6统计信息以备回退
        } as any;

        /* ==================== V6指标已注释，保留用于回退 ====================
        // 如果使用V7，添加版本信息和V7的统计信息
        if (this.useV7) {
            const v7Metrics = this.v7Service.getMetrics();
            return {
                ...baseMetrics,
                version: 'v7',
                endpoint: v7Metrics.endpoint,
                v7Stats: v7Metrics,
                v6Stats: baseMetrics
            } as any;
        }

        return {
            ...baseMetrics,
            version: 'v6',
            endpoint: this.baseURL
        } as any;
        ==================== V6指标已注释，保留用于回退 ==================== */
    }

    /**
     * 获取交换报价 - 实时版本（无缓存）
     * @param inputMint 输入代币mint地址
     * @param outputMint 输出代币mint地址  
     * @param amount 输入金额
     * @param slippageBps 滑点(基点)
     */
    async getQuote(
        inputMint: string,
        outputMint: string,
        amount: string,
        slippageBps: number = this.defaultSlippageBps
    ): Promise<JupiterQuote> {
        // 🔥 强制使用V7，V6功能已注释
        return await this.v7Service.getQuoteV7(inputMint, outputMint, amount, slippageBps);

        /* ==================== V6实现已注释，保留用于回退 ====================
        // 原V6实现（保持不变）
        const operationStart = Date.now();
        try {
            // 验证参数
            this.validateSwapParams(inputMint, outputMint, amount, slippageBps);

            // 🔥 直接调用API获取实时报价，不使用缓存
            await this.loggerService.logBusinessOperation('Jupiter V6实时报价-开始', {
                inputMint,
                outputMint,
                amount,
                slippageBps,
                version: 'v6',
                reason: '实时报价确保高波动市场交换成功',
                timestamp: Date.now()
            });

            this.requestCount++;
            const startTime = Date.now();

            // 调用Jupiter Quote API
            const response = await this.apiClient.get<JupiterAPIQuote>('/quote', {
                params: {
                    inputMint,
                    outputMint,
                    amount,
                    slippageBps,
                    onlyDirectRoutes: false,
                    asLegacyTransaction: false,
                    excludeDexes: '',
                    maxAccounts: 64,
                    swapMode: 'ExactIn'
                },
                timeout: 10000
            });

            const responseTime = Date.now() - startTime;
            const apiQuote = response.data;

            // 转换为内部格式
            const quote: JupiterQuote = {
                inputMint: apiQuote.inputMint,
                outputMint: apiQuote.outputMint,
                inAmount: apiQuote.inAmount,
                outAmount: apiQuote.outAmount,
                priceImpactPct: parseFloat(apiQuote.priceImpactPct) || 0,
                marketInfos: apiQuote.routePlan || []
            };

            // 🔥 不再缓存报价数据，确保每次都是实时的

            await this.loggerService.logBusinessOperation('Jupiter V6实时报价-成功', {
                inputMint,
                outputMint,
                inputAmount: quote.inAmount,
                outputAmount: quote.outAmount,
                priceImpact: quote.priceImpactPct,
                responseTime: Date.now() - operationStart,
                version: 'v6',
                reason: '实时报价获取成功',
                timestamp: Date.now()
            });

            return quote;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('jupiter-v6-quote', '获取Jupiter V6实时报价失败', error as Error);

            if (axios.isAxiosError(error)) {
                if (error.response?.status === 404) {
                    throw new Error(`找不到交换路由: ${inputMint} -> ${outputMint}`);
                } else if (error.response?.status === 429) {
                    throw new Error('Jupiter V6 API请求频率限制，请稍后重试');
                } else {
                    throw new Error(`Jupiter V6 API错误: ${error.response?.status || error.message}`);
                }
            }

            throw new Error(`获取V6实时报价失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
        ==================== V6实现已注释，保留用于回退 ==================== */
    }

    /**
     * 执行代币交换
     * @param params 交换参数
     */
    async executeSwap(params: SwapParams & { instanceId?: string }): Promise<SwapResult> {
        // 🔥 强制使用V7，V6功能已注释
        await this.loggerService.logFilteredInstanceOperation('Jupiter Ultra API交换-路由', {
            version: 'ultra-v1',
            endpoint: 'lite-api.jup.ag/ultra/v1',
            instanceId: params.instanceId
        }, params.instanceId);

        return await this.v7Service.executeSwapV7(params);

        /* ==================== V6实现已注释，保留用于回退 ====================
        // 原V6实现（保持不变）
        const operationStart = Date.now();
        try {
            // 🆕 使用实例感知的日志记录
            await this.loggerService.logFilteredInstanceOperation('Jupiter V6交换-开始', {
                inputMint: params.inputMint,
                outputMint: params.outputMint,
                amount: params.amount,
                slippageBps: params.slippageBps,
                version: 'v6',
                endpoint: 'quote-api.jup.ag/v6',
                timestamp: Date.now(),
                instanceId: params.instanceId
            }, params.instanceId);

            // 1. 获取报价
            const quote = await this.getQuote(
                params.inputMint,
                params.outputMint,
                params.amount,
                params.slippageBps
            );

            // 2. 获取交换交易
            const swapTransaction = await this.getSwapTransaction({
                quoteResponse: this.convertQuoteToAPIFormat(quote, params.slippageBps),
                userPublicKey: params.userPublicKey,
                wrapAndUnwrapSol: true,
                useSharedAccounts: false, // 🔥 修复：禁用共享账户以支持Simple AMMs
                computeUnitPriceMicroLamports: 50000, // 代币交换默认优先费用提升至50000
                asLegacyTransaction: false
            });

            // 3. 发送交易
            const result = await this.sendSwapTransaction(swapTransaction);

            // 🔥 使用实例感知的过滤日志方法：同时记录到业务操作日志、实例日志和系统日志
            await this.loggerService.logFilteredInstanceOperation(
                '🔄 Jupiter V6交换完成',
                {
                    inputMint: params.inputMint,
                    outputMint: params.outputMint,
                    inputAmount: quote.inAmount,
                    outputAmount: quote.outAmount,
                    actualOutputAmount: result.outputAmount,
                    signature: result.signature,
                    operationDuration: Date.now() - operationStart,
                    version: 'v6',
                    instanceId: params.instanceId
                },
                params.instanceId
            );

            return result;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('jupiter-v6-swap', 'Jupiter V6交换执行失败', error as Error);
            throw new Error(`V6交换失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
        ==================== V6实现已注释，保留用于回退 ==================== */
    }

    /**
     * 获取代币价格 - 实时版本（无缓存）
     * @param mints 代币mint地址数组
     */
    async getTokenPrices(mints: string[]): Promise<Record<string, number>> {
        const operationStart = Date.now();
        try {
            // 🔥 直接调用API获取实时价格，不使用缓存
            await this.loggerService.logBusinessOperation('Jupiter实时价格查询-开始', {
                tokens: mints.length,
                reason: '实时价格确保高波动市场数据准确',
                timestamp: Date.now()
            });

            this.requestCount++;

            // 调用Jupiter Price API
            const response = await axios.get(`${this.priceAPIURL}/price`, {
                params: {
                    ids: mints.join(',')
                },
                timeout: 5000
            });

            const prices: Record<string, number> = {};

            if (response.data && response.data.data) {
                Object.entries(response.data.data).forEach(([mint, priceData]: [string, any]) => {
                    prices[mint] = priceData.price || 0;
                });
            }

            // 🔥 不再缓存价格数据，确保每次都是实时的

            await this.loggerService.logBusinessOperation('Jupiter实时价格查询-成功', {
                tokensRequested: mints.length,
                tokensReceived: Object.keys(response.data.data || {}).length,
                responseTime: Date.now() - operationStart,
                reason: '实时价格获取成功',
                timestamp: Date.now()
            });

            return prices;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('jupiter-prices', '获取代币实时价格失败', error as Error);

            // 返回空价格对象，避免阻塞其他功能
            const emptyPrices: Record<string, number> = {};
            mints.forEach(mint => {
                emptyPrices[mint] = 0;
            });

            return emptyPrices;
        }
    }

    /**
     * 获取支持的代币列表
     */
    async getSupportedTokens(): Promise<Array<{
        address: string;
        symbol: string;
        name: string;
        decimals: number;
        logoURI?: string;
    }>> {
        const operationStart = Date.now();
        try {
            // 检查缓存
            const cacheKey = 'supported_tokens';
            const cachedTokens = await this.cacheService.get<any[]>(cacheKey);

            if (cachedTokens) {
                await this.loggerService.logSystem('DEBUG', '使用缓存的代币列表');
                return cachedTokens;
            }

            await this.loggerService.logBusinessOperation('Jupiter代币列表-开始', { timestamp: Date.now() });

            this.requestCount++;

            const response = await this.apiClient.get('/tokens', {
                timeout: 30000 // 增加超时时间到30秒
            });

            const tokens = response.data || [];

            // 缓存代币列表 (1小时)
            await this.cacheService.set(cacheKey, tokens, 3600000);

            await this.loggerService.logBusinessOperation('Jupiter代币列表-成功', {
                tokensCount: tokens.length,
                responseTime: Date.now() - operationStart,
                timestamp: Date.now()
            });

            return tokens;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('jupiter-tokens', '获取代币列表失败', error as Error);

            // 返回基本的代币列表作为后备
            const fallbackTokens = [
                {
                    address: 'So11111111111111111111111111111111111111112',
                    symbol: 'SOL',
                    name: 'Solana',
                    decimals: 9,
                    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
                },
                {
                    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    symbol: 'USDC',
                    name: 'USD Coin',
                    decimals: 6,
                    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
                },
                {
                    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
                    symbol: 'USDT',
                    name: 'Tether USD',
                    decimals: 6,
                    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png'
                },
                {
                    address: 'J8XNoBVdiLjuUd3wk9p7yj1cSqcwX9hpiBoU6Hpnmoon',
                    symbol: 'TEST',
                    name: 'Test Token',
                    decimals: 6
                }
            ];

            await this.loggerService.logSystem('WARN', `使用后备代币列表 (${fallbackTokens.length}个代币)`);
            return fallbackTokens;
        }
    }

    /**
     * 批量获取最佳路由 - 实时版本（无缓存）
     */
    async getBatchRoutes(requests: Array<{
        inputMint: string;
        outputMint: string;
        amount: string;
        slippageBps?: number;
    }>): Promise<JupiterQuote[]> {
        try {
            await this.loggerService.logBusinessOperation('Jupiter实时批量路由-开始', {
                requestsCount: requests.length,
                reason: '实时路由确保高波动市场最优路径',
                timestamp: Date.now()
            });

            const promises = requests.map(req =>
                this.getQuote(
                    req.inputMint,
                    req.outputMint,
                    req.amount,
                    req.slippageBps || this.defaultSlippageBps
                ).catch(error => {
                    this.loggerService.logError('jupiter-batch-route-item', '单个实时路由获取失败', error as Error);
                    return null;
                })
            );

            const results = await Promise.all(promises);
            const validQuotes = results.filter(quote => quote !== null) as JupiterQuote[];

            await this.loggerService.logBusinessOperation('Jupiter实时批量路由-成功', {
                requestsCount: requests.length,
                successCount: results.filter(r => r !== null).length,
                reason: '实时路由获取成功',
                timestamp: Date.now()
            });

            return validQuotes;
        } catch (error) {
            await this.loggerService.logError('jupiter-batch-routes', '批量获取实时路由失败', error as Error);
            return [];
        }
    }

    /**
     * 初始化API客户端
     */
    private initializeAPIClient(): void {
        this.apiClient = axios.create({
            baseURL: this.baseURL,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'DLMM-Manager/1.0.0'
            }
        });

        // 请求拦截器
        this.apiClient.interceptors.request.use(
            (config) => {
                this.loggerService.logSystem('DEBUG', `Jupiter API请求: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                this.loggerService.logError('jupiter-api-request', 'Jupiter API请求错误', error as Error);
                return Promise.reject(error);
            }
        );

        // 响应拦截器
        this.apiClient.interceptors.response.use(
            (response) => {
                // 只记录非健康检查的API调用，避免日志过多
                if (!response.config.url?.includes('/tokens') || response.status !== 200) {
                    this.loggerService.logSystem('DEBUG', `Jupiter API响应: ${response.status} (${response.data ? '有数据' : '无数据'})`);
                }
                return response;
            },
            (error) => {
                this.loggerService.logError('jupiter-api-response', 'Jupiter API响应错误', new Error(`Status: ${error.response?.status || 'unknown'}`));
                return Promise.reject(error);
            }
        );
    }

    /**
     * 验证API连接 (优化版本)
     */
    private async validateAPIConnection(): Promise<void> {
        try {
            // 跳过初始化时的API验证以加快启动速度
            // 在实际使用时进行惰性验证
            await this.loggerService.logSystem('INFO', 'Jupiter API连接验证跳过 (惰性加载)');
            return;

            // // 可选：使用更快的健康检查端点
            // const response = await this.apiClient.get('/health', {
            //     timeout: 2000
            // });

            // if (response.status !== 200) {
            //     throw new Error(`API连接测试失败: ${response.status}`);
            // }

            // await this.loggerService.logSystem('INFO', 'Jupiter API连接验证成功');
        } catch (error) {
            await this.loggerService.logError('jupiter-api-validation', 'Jupiter API连接验证失败', error as Error);
            // 不抛出错误，允许服务启动，在实际使用时再验证
            await this.loggerService.logSystem('WARN', 'Jupiter API验证失败，将在使用时重试');
        }
    }

    /**
     * 验证交换参数
     */
    private validateSwapParams(inputMint: string, outputMint: string, amount: string, slippageBps: number): void {
        if (!inputMint || !PublicKey.isOnCurve(inputMint)) {
            throw new Error('无效的输入代币地址');
        }

        if (!outputMint || !PublicKey.isOnCurve(outputMint)) {
            throw new Error('无效的输出代币地址');
        }

        if (inputMint === outputMint) {
            throw new Error('输入和输出代币不能相同');
        }

        const amountNum = parseInt(amount);
        if (isNaN(amountNum) || amountNum < this.minSwapAmount) {
            throw new Error(`交换金额过小，最小值: ${this.minSwapAmount}`);
        }

        if (slippageBps < 0 || slippageBps > this.maxSlippageBps) {
            throw new Error(`滑点超出范围 (0-${this.maxSlippageBps}基点，0-${(this.maxSlippageBps / 100).toFixed(1)}%)`);
        }
    }

    // 🔥 V6私有方法已删除，强制使用V7
    // 如需回退，请参考 JupiterService.backup.ts 或 JupiterService.v6.ts
    // V6私有方法已删除: 避免linter错误，保持代码简洁
    /**
     * 销毁服务，清理资源
     */
    async destroy(): Promise<void> {
        await this.loggerService.logSystem('INFO', 'JupiterService资源清理完成');
    }
} 