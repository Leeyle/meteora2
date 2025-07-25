import { injectable, inject } from 'tsyringe';
import { Transaction, VersionedTransaction, PublicKey, Keypair } from '@solana/web3.js';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { IJupiterService, IConfigService, ILoggerService, ICacheService, ISolanaWeb3Service, IWalletService, TYPES } from '../../types/interfaces';
import { JupiterQuote, SwapParams, SwapResult, ModuleConfig, ModuleHealth, ModuleMetrics } from '../../types/interfaces';

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
    ) { }

    async initialize(config: ModuleConfig): Promise<void> {
        // 🔧 系统日志: 服务初始化
        await this.loggerService.logSystem('INFO', 'JupiterService开始初始化...');

        this.config = this.configService.get('jupiter', {});

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
    }

    getMetrics(): ModuleMetrics {
        return {
            uptime: Date.now(),
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            lastActivity: Date.now(),
            performance: {
                avgResponseTime: 0, // TODO: 实现响应时间统计
                successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 100
            }
        };
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
        const operationStart = Date.now();
        try {
            // 验证参数
            this.validateSwapParams(inputMint, outputMint, amount, slippageBps);

            // 🔥 直接调用API获取实时报价，不使用缓存
            await this.loggerService.logBusinessOperation('Jupiter实时报价-开始', {
                inputMint,
                outputMint,
                amount,
                slippageBps,
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

            await this.loggerService.logBusinessOperation('Jupiter实时报价-成功', {
                inputMint,
                outputMint,
                inputAmount: quote.inAmount,
                outputAmount: quote.outAmount,
                priceImpact: quote.priceImpactPct,
                responseTime: Date.now() - operationStart,
                reason: '实时报价获取成功',
                timestamp: Date.now()
            });

            return quote;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('jupiter-quote', '获取Jupiter实时报价失败', error as Error);

            if (axios.isAxiosError(error)) {
                if (error.response?.status === 404) {
                    throw new Error(`找不到交换路由: ${inputMint} -> ${outputMint}`);
                } else if (error.response?.status === 429) {
                    throw new Error('Jupiter API请求频率限制，请稍后重试');
                } else {
                    throw new Error(`Jupiter API错误: ${error.response?.status || error.message}`);
                }
            }

            throw new Error(`获取实时报价失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 执行代币交换
     * @param params 交换参数
     */
    async executeSwap(params: SwapParams & { instanceId?: string }): Promise<SwapResult> {
        const operationStart = Date.now();
        try {
            // 🆕 使用实例感知的日志记录
            await this.loggerService.logFilteredInstanceOperation('Jupiter交换-开始', {
                inputMint: params.inputMint,
                outputMint: params.outputMint,
                amount: params.amount,
                slippageBps: params.slippageBps,
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
                '🔄 代币交换完成',
                {
                    inputMint: params.inputMint,
                    outputMint: params.outputMint,
                    inputAmount: quote.inAmount,
                    outputAmount: quote.outAmount,
                    actualOutputAmount: result.outputAmount,
                    signature: result.signature,
                    operationDuration: Date.now() - operationStart,
                    instanceId: params.instanceId
                },
                params.instanceId
            );

            return result;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('jupiter-swap', 'Jupiter交换执行失败', error as Error);
            throw new Error(`交换失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
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

    /**
     * 获取交换交易
     */
    private async getSwapTransaction(request: JupiterSwapRequest): Promise<JupiterSwapResponse> {
        try {
            this.requestCount++;

            // 🔧 集成GasService：动态优先费用 - 代币交换专用配置
            const congestion = this.walletService.constructor.name.includes('Gas') ? 'medium' : 'medium'; // 临时兼容
            let priorityFee = 100000; // 代币交换最低标准提升至100000

            try {
                const networkCongestion = await this.getNetworkCongestion();
                switch (networkCongestion) {
                    case 'low':
                        priorityFee = 100000; // 代币交换低拥堵时使用100000
                        break;
                    case 'medium':
                        priorityFee = 120000; // 代币交换中等拥堵时使用120000
                        break;
                    case 'high':
                        priorityFee = 150000; // 代币交换高拥堵时使用150000
                        break;
                    default:
                        priorityFee = 120000; // 代币交换默认中等
                }
            } catch (error) {
                await this.loggerService.logSystem('WARN', '获取网络拥堵状态失败，使用代币交换默认优先费用120000');
                priorityFee = 120000;
            }

            // 更新请求中的优先费用
            const optimizedRequest = {
                ...request,
                computeUnitPriceMicroLamports: priorityFee
            };

            await this.loggerService.logBusinessOperation('Jupiter Gas优化', {
                originalFee: request.computeUnitPriceMicroLamports || 50000,
                optimizedFee: priorityFee,
                networkCongestion: await this.getNetworkCongestion().catch(() => 'unknown'),
                timestamp: Date.now()
            });

            const response = await this.apiClient.post<JupiterSwapResponse>('/swap', optimizedRequest, {
                timeout: 15000
            });

            return response.data;
        } catch (error) {
            await this.loggerService.logError('jupiter-swap-transaction', '获取交换交易失败', error as Error);
            throw new Error(`获取交换交易失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取网络拥堵状态 (简化版本)
     */
    private async getNetworkCongestion(): Promise<'low' | 'medium' | 'high'> {
        try {
            // 通过最近的优先费用数据判断网络拥堵情况
            const connection = this.solanaService.getConnection();
            const recentFees = await connection.getRecentPrioritizationFees();

            if (recentFees.length === 0) {
                return 'medium';
            }

            const avgFee = recentFees
                .map(fee => fee.prioritizationFee || 0)
                .filter(fee => fee > 0)
                .reduce((sum, fee, _, arr) => sum + fee / arr.length, 0);

            if (avgFee < 2000) {
                return 'low';
            } else if (avgFee < 8000) {
                return 'medium';
            } else {
                return 'high';
            }
        } catch (error) {
            return 'medium'; // 默认中等
        }
    }

    /**
     * 发送交换交易
     */
    private async sendSwapTransaction(swapResponse: JupiterSwapResponse): Promise<SwapResult> {
        try {
            // 🔧 智能钱包管理：参考头寸管理的实现
            let wallet: Keypair;
            if (this.walletService.isWalletUnlocked()) {
                // 钱包已解锁，直接使用
                wallet = this.walletService.getCurrentKeypair()!;
                await this.loggerService.logBusinessOperation('Jupiter使用已解锁钱包', {
                    message: '使用已解锁的钱包执行Jupiter交换'
                });
            } else {
                // 钱包未解锁，这种情况理论上不应该发生，因为路由已经检查了钱包状态
                throw new Error('钱包未解锁，无法执行交换。请先在钱包页面解锁钱包');
            }

            // 反序列化交易
            const transaction = this.deserializeTransaction(swapResponse.swapTransaction);

            // 签名交易
            if (transaction instanceof VersionedTransaction) {
                transaction.sign([wallet]);
            } else {
                transaction.sign(wallet);
            }

            // 发送交易
            const result = await this.solanaService.sendTransaction(transaction);

            if (!result.success) {
                throw new Error(`交易发送失败: ${result.error}`);
            }

            // 构造返回结果
            return {
                signature: result.signature,
                inputAmount: '0', // TODO: 从交易中提取实际金额
                outputAmount: '0', // TODO: 从交易中提取实际金额
                priceImpact: 0 // TODO: 从quote中获取
            };
        } catch (error) {
            await this.loggerService.logError('jupiter-send-transaction', '发送交换交易失败', error as Error);
            throw new Error(`发送交换交易失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 反序列化交易
     */
    private deserializeTransaction(transactionData: string): Transaction | VersionedTransaction {
        try {
            const buffer = Buffer.from(transactionData, 'base64');

            // 尝试反序列化为VersionedTransaction
            try {
                return VersionedTransaction.deserialize(buffer);
            } catch {
                // 如果失败，尝试反序列化为传统Transaction
                return Transaction.from(buffer);
            }
        } catch (error) {
            this.loggerService.logError('jupiter-deserialize-transaction', '交易反序列化失败', error as Error);
            throw new Error('交易数据格式无效');
        }
    }

    /**
     * 转换报价格式为API格式
     */
    private convertQuoteToAPIFormat(quote: JupiterQuote, slippageBps?: number): JupiterAPIQuote {
        return {
            inputMint: quote.inputMint,
            inAmount: quote.inAmount,
            outputMint: quote.outputMint,
            outAmount: quote.outAmount,
            otherAmountThreshold: quote.outAmount,
            swapMode: 'ExactIn',
            slippageBps: slippageBps || this.defaultSlippageBps,
            priceImpactPct: quote.priceImpactPct.toString(),
            routePlan: quote.marketInfos
        };
    }

    /**
     * 销毁服务，清理资源
     */
    async destroy(): Promise<void> {
        await this.loggerService.logSystem('INFO', 'JupiterService资源清理完成');
    }
} 