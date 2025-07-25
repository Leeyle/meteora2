import { injectable, inject } from 'tsyringe';
import { Connection, VersionedTransaction, PublicKey, Keypair } from '@solana/web3.js';
import axios, { AxiosInstance } from 'axios';
import { IJupiterService, IConfigService, ILoggerService, ISolanaWeb3Service, IWalletService, TYPES } from '../../types/interfaces';
import { JupiterQuote, SwapParams, SwapResult, ModuleConfig, ModuleHealth, ModuleMetrics } from '../../types/interfaces';

/**
 * Jupiter Ultra API Service 实现
 * 基于官方文档 https://dev.jup.ag/docs/ultra-api/execute-order
 * 使用正确的 Ultra API 端点和流程
 * 
 * Ultra API 流程：
 * 1. POST /ultra/v1/order - 获取订单和交易
 * 2. 签名交易
 * 3. POST /ultra/v1/execute - 执行交易
 * 
 * 优势：
 * - Jupiter 团队维护，更可靠
 * - 内置重试和优化机制
 * - 自动处理交易发送和确认
 * - 更好的错误处理
 */
@injectable()
export class JupiterServiceV7 {
    private baseURL: string = 'https://lite-api.jup.ag';
    private apiClient!: AxiosInstance;

    // 统计指标
    private requestCount: number = 0;
    private errorCount: number = 0;
    private successCount: number = 0;
    private totalResponseTime: number = 0;

    // 配置参数 - 根据Ultra API文档
    private readonly defaultSlippageBps = 300; // 3% - Ultra API推荐
    private readonly maxSlippageBps = 3000; // 30%
    private readonly minSwapAmount = 1000;

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        @inject(TYPES.WalletService) private walletService: IWalletService
    ) {
        this.initializeAPIClient();
    }

    /**
     * 初始化API客户端 - Ultra API配置
     */
    private initializeAPIClient(): void {
        this.apiClient = axios.create({
            baseURL: this.baseURL,
            timeout: 60000, // Ultra API可能需要更长时间
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'DLMM-Liquidity-Manager/2.0.0-Ultra'
                // 注意：Ultra API 当前不需要 API Key
            }
        });

        // 请求拦截器
        this.apiClient.interceptors.request.use(
            (config) => {
                this.requestCount++;
                this.loggerService.logBusinessOperation('Ultra API请求', {
                    method: config.method?.toUpperCase(),
                    url: `${config.baseURL}${config.url}`,
                    data: config.data,
                    timestamp: Date.now()
                });
                return config;
            },
            (error) => {
                this.errorCount++;
                return Promise.reject(error);
            }
        );

        // 响应拦截器
        this.apiClient.interceptors.response.use(
            (response) => {
                this.successCount++;
                return response;
            },
            (error) => {
                this.errorCount++;
                this.loggerService.logError('ultra-api-error', 'Ultra API请求失败', {
                    ...error,
                    response: error.response?.data,
                    status: error.response?.status,
                    statusText: error.response?.statusText
                });
                return Promise.reject(error);
            }
        );
    }

    /**
     * 获取报价 - Ultra API版本
     * 注意：Ultra API 不提供单独的报价端点，这里模拟报价功能
     */
    async getQuoteV7(
        inputMint: string,
        outputMint: string,
        amount: string,
        slippageBps: number = this.defaultSlippageBps
    ): Promise<JupiterQuote> {
        const operationStart = Date.now();

        try {
            await this.loggerService.logBusinessOperation('Ultra API模拟报价-开始', {
                inputMint,
                outputMint,
                amount,
                slippageBps,
                endpoint: `${this.baseURL}/ultra/v1/order`,
                timestamp: Date.now()
            });

            // 验证参数
            this.validateSwapParams(inputMint, outputMint, amount, slippageBps);

            // 获取钱包信息用于报价
            if (!this.walletService.isWalletUnlocked()) {
                throw new Error('钱包未解锁，无法获取报价');
            }

            const wallet = this.walletService.getCurrentKeypair()!;
            const userPublicKey = wallet.publicKey.toString();

            // 调用Ultra API获取订单（这实际上包含了报价信息）
            const orderResponse = await this.getUltraOrder(
                inputMint,
                outputMint,
                amount,
                slippageBps,
                userPublicKey
            );

            // 从订单响应中提取报价信息
            const quote: JupiterQuote & { ultraOrderData?: any } = {
                inputMint: orderResponse.inputMint || inputMint,
                outputMint: orderResponse.outputMint || outputMint,
                inAmount: orderResponse.inAmount || amount,
                outAmount: orderResponse.outAmount || '0',
                priceImpactPct: parseFloat(orderResponse.priceImpactPct || '0'),
                marketInfos: orderResponse.routePlan || [],
                // 保存Ultra API特有的数据
                ultraOrderData: {
                    transaction: orderResponse.transaction,
                    requestId: orderResponse.requestId,
                    lastValidBlockHeight: orderResponse.lastValidBlockHeight
                }
            };

            const responseTime = Date.now() - operationStart;
            this.totalResponseTime += responseTime;

            await this.loggerService.logBusinessOperation('Ultra API模拟报价-成功', {
                inputMint,
                outputMint,
                inputAmount: quote.inAmount,
                outputAmount: quote.outAmount,
                priceImpact: quote.priceImpactPct,
                responseTime,
                hasTransaction: !!orderResponse.transaction,
                hasRequestId: !!orderResponse.requestId,
                timestamp: Date.now()
            });

            return quote;

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('ultra-api-quote', '获取Ultra API报价失败', error as Error);
            throw new Error(`Ultra API报价失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 执行交换 - Ultra API版本
     */
    async executeSwapV7(params: SwapParams & { instanceId?: string }): Promise<SwapResult> {
        const operationStart = Date.now();

        try {
            await this.loggerService.logFilteredInstanceOperation('Ultra API交换-开始', {
                inputMint: params.inputMint,
                outputMint: params.outputMint,
                amount: params.amount,
                slippageBps: params.slippageBps,
                endpoint: `${this.baseURL}/ultra/v1`,
                timestamp: Date.now(),
                instanceId: params.instanceId
            }, params.instanceId);

            // 验证参数
            this.validateSwapParams(params.inputMint, params.outputMint, params.amount, params.slippageBps);

            // 验证钱包
            if (!this.walletService.isWalletUnlocked()) {
                throw new Error('钱包未解锁，无法执行Ultra API交换');
            }

            const wallet = this.walletService.getCurrentKeypair()!;
            const userPublicKey = wallet.publicKey.toString();

            // 步骤1：获取Ultra订单
            const orderResponse = await this.getUltraOrder(
                params.inputMint,
                params.outputMint,
                params.amount,
                params.slippageBps,
                userPublicKey
            );

            // 步骤2：签名交易
            const signedTransaction = await this.signUltraTransaction(
                orderResponse.transaction,
                wallet
            );

            // 步骤3：执行Ultra交换
            const executeResult = await this.executeUltraOrder(
                signedTransaction,
                orderResponse.requestId
            );

            const operationDuration = Date.now() - operationStart;

            await this.loggerService.logFilteredInstanceOperation(
                '🔄 Ultra API交换完成',
                {
                    inputMint: params.inputMint,
                    outputMint: params.outputMint,
                    inputAmount: orderResponse.inAmount,
                    outputAmount: orderResponse.outAmount,
                    actualInputAmount: executeResult.inputAmountResult,
                    actualOutputAmount: executeResult.outputAmountResult,
                    signature: executeResult.signature,
                    operationDuration,
                    endpoint: `${this.baseURL}/ultra/v1`,
                    version: 'ultra-v1',
                    status: executeResult.status,
                    slot: executeResult.slot,
                    instanceId: params.instanceId
                },
                params.instanceId
            );

            // 转换为标准SwapResult格式
            return {
                signature: executeResult.signature,
                inputAmount: executeResult.inputAmountResult || orderResponse.inAmount,
                outputAmount: executeResult.outputAmountResult || orderResponse.outAmount,
                priceImpact: parseFloat(orderResponse.priceImpactPct || '0')
            };

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('ultra-api-swap', 'Ultra API交换执行失败', error as Error);
            throw new Error(`Ultra API交换失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取Ultra订单 - 第一步
     */
    private async getUltraOrder(
        inputMint: string,
        outputMint: string,
        amount: string,
        slippageBps: number,
        userPublicKey: string
    ): Promise<any> {
        try {
            await this.loggerService.logBusinessOperation('Ultra API获取订单-开始', {
                inputMint,
                outputMint,
                amount,
                slippageBps,
                userPublicKey,
                endpoint: `${this.baseURL}/ultra/v1/order`,
                timestamp: Date.now()
            });

            // 根据官方例子使用GET请求和查询参数
            const response = await this.apiClient.get('/ultra/v1/order', {
                params: {
                    inputMint,
                    outputMint,
                    amount,
                    slippageBps,
                    taker: userPublicKey  // 官方例子使用taker而不是userPublicKey
                },
                timeout: 30000
            });

            if (!response.data) {
                throw new Error('Ultra API返回空响应');
            }

            // 检查是否有错误信息
            if (response.data.errorMessage) {
                throw new Error(`Ultra API错误: ${response.data.errorMessage}`);
            }

            // 验证必要字段 - transaction可能为空字符串，但requestId必须存在
            if (!response.data.requestId) {
                throw new Error(`Ultra API响应缺少requestId: ${JSON.stringify(response.data)}`);
            }

            // 如果transaction为空，说明无法执行交换
            if (!response.data.transaction) {
                throw new Error(`Ultra API无法生成交易: ${response.data.errorMessage || '未知原因'}`);
            }

            await this.loggerService.logBusinessOperation('Ultra API获取订单-成功', {
                inputMint,
                outputMint,
                hasTransaction: !!response.data.transaction,
                hasRequestId: !!response.data.requestId,
                inAmount: response.data.inAmount,
                outAmount: response.data.outAmount,
                timestamp: Date.now()
            });

            return response.data;

        } catch (error) {
            await this.loggerService.logError('ultra-api-order', '获取Ultra订单失败', error as Error);
            
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const data = error.response?.data;
                
                switch (status) {
                    case 400:
                        throw new Error(`Ultra API参数错误: ${data?.error || error.message}`);
                    case 404:
                        throw new Error(`找不到交换路由: ${inputMint} -> ${outputMint}`);
                    case 429:
                        throw new Error('Ultra API请求频率限制，请稍后重试');
                    case 500:
                        throw new Error(`Ultra API服务器错误: ${data?.error || error.message}`);
                    default:
                        throw new Error(`Ultra API错误 (${status}): ${data?.error || error.message}`);
                }
            }
            
            throw new Error(`获取Ultra订单失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 签名Ultra交易 - 第二步
     */
    private async signUltraTransaction(transaction: string, wallet: Keypair): Promise<string> {
        try {
            await this.loggerService.logBusinessOperation('Ultra API签名交易-开始', {
                transactionLength: transaction.length,
                walletPublicKey: wallet.publicKey.toString(),
                timestamp: Date.now()
            });

            // 根据官方文档，交易是base64编码的VersionedTransaction
            const transactionBuffer = Buffer.from(transaction, 'base64');
            const versionedTransaction = VersionedTransaction.deserialize(transactionBuffer);

            if (!versionedTransaction) {
                throw new Error('无法解析Ultra交易数据');
            }

            // 签名交易
            versionedTransaction.sign([wallet]);

            // 序列化签名后的交易
            const signedTransaction = Buffer.from(versionedTransaction.serialize()).toString('base64');

            await this.loggerService.logBusinessOperation('Ultra API签名交易-成功', {
                signedTransactionLength: signedTransaction.length,
                timestamp: Date.now()
            });

            return signedTransaction;

        } catch (error) {
            await this.loggerService.logError('ultra-api-sign', 'Ultra交易签名失败', error as Error);
            throw new Error(`Ultra交易签名失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 执行Ultra订单 - 第三步
     */
    private async executeUltraOrder(signedTransaction: string, requestId: string): Promise<any> {
        try {
            await this.loggerService.logBusinessOperation('Ultra API执行订单-开始', {
                requestId,
                signedTransactionLength: signedTransaction.length,
                endpoint: `${this.baseURL}/ultra/v1/execute`,
                timestamp: Date.now()
            });

            const requestBody = {
                signedTransaction,
                requestId
            };

            const response = await this.apiClient.post('/ultra/v1/execute', requestBody, {
                timeout: 60000 // 执行可能需要更长时间
            });

            if (!response.data) {
                throw new Error('Ultra API执行返回空响应');
            }

            const result = response.data;

            // 检查执行状态
            if (result.status === 'Success') {
                await this.loggerService.logBusinessOperation('Ultra API执行订单-成功', {
                    signature: result.signature,
                    status: result.status,
                    slot: result.slot,
                    inputAmountResult: result.inputAmountResult,
                    outputAmountResult: result.outputAmountResult,
                    timestamp: Date.now()
                });
            } else {
                // 处理失败响应 - 根据官方文档格式
                await this.loggerService.logBusinessOperation('Ultra API执行订单-失败', {
                    signature: result.signature,
                    status: result.status,
                    error: result.error,
                    code: result.code,
                    slot: result.slot,
                    timestamp: Date.now()
                });
                
                // 提供更详细的错误信息
                const errorMessage = this.formatUltraAPIError(result.error, result.code);
                throw new Error(`Ultra API执行失败: ${errorMessage} (Signature: ${result.signature || 'N/A'})`);
            }

            return result;

        } catch (error) {
            await this.loggerService.logError('ultra-api-execute', 'Ultra订单执行失败', error as Error);
            
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const data = error.response?.data;
                
                switch (status) {
                    case -1:
                        throw new Error('Ultra API: 缓存订单丢失，requestId可能已过期');
                    case -2:
                        throw new Error('Ultra API: 签名交易无效，请检查签名过程');
                    case -3:
                        throw new Error('Ultra API: 消息字节无效，交易格式错误');
                    case -1000:
                        throw new Error('Ultra API: 交易未能在网络上确认');
                    default:
                        throw new Error(`Ultra API执行错误 (${status}): ${data?.error || error.message}`);
                }
            }
            
            throw new Error(`Ultra订单执行失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 格式化Ultra API错误信息
     */
    private formatUltraAPIError(error: string, code: number): string {
        if (!error) return 'Unknown error';
        
        // 常见错误代码的解释
        const errorCodeMap: Record<number, string> = {
            6023: '自定义程序错误 - 可能是滑点或余额问题',
            4615026: '交易执行失败 - 网络或程序错误',
            // 可以根据需要添加更多错误代码
        };
        
        const codeDescription = errorCodeMap[code] || `错误代码: ${code}`;
        return `${error} (${codeDescription})`;
    }

    /**
     * 参数验证 - Ultra API要求
     */
    private validateSwapParams(inputMint: string, outputMint: string, amount: string, slippageBps: number): void {
        if (!inputMint || !outputMint) {
            throw new Error('输入和输出代币地址不能为空');
        }

        if (inputMint.length < 32 || outputMint.length < 32) {
            throw new Error('代币地址格式无效');
        }

        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            throw new Error('交换金额必须是正数');
        }

        if (Number(amount) < this.minSwapAmount) {
            throw new Error(`交换金额不能少于 ${this.minSwapAmount} lamports`);
        }

        if (slippageBps < 0 || slippageBps > this.maxSlippageBps) {
            throw new Error(`滑点超出范围 (0-${this.maxSlippageBps}基点，0-${(this.maxSlippageBps / 100).toFixed(1)}%)`);
        }

        if (inputMint === outputMint) {
            throw new Error('输入和输出代币不能相同');
        }
    }

    /**
     * 获取统计指标 - Ultra API版本
     */
    getMetrics(): {
        requestCount: number;
        errorCount: number;
        successCount: number;
        successRate: number;
        avgResponseTime: number;
        version: string;
        endpoint: string;
    } {
        return {
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            successCount: this.successCount,
            successRate: this.requestCount > 0 ? (this.successCount / this.requestCount) * 100 : 0,
            avgResponseTime: this.successCount > 0 ? this.totalResponseTime / this.successCount : 0,
            version: 'ultra-v1',
            endpoint: `${this.baseURL}/ultra/v1`
        };
    }
} 