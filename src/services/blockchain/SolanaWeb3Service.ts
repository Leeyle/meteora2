import { injectable, inject, container } from 'tsyringe';
import { Connection, PublicKey, Commitment, ConfirmOptions, SendOptions, Transaction, VersionedTransaction, SendTransactionError, TransactionSignature, AccountInfo, ParsedAccountData, Keypair } from '@solana/web3.js';
import { ISolanaWeb3Service, IConfigService, ILoggerService, IMultiRPCService, IGasService, TYPES, CustomSendOptions } from '../../types/interfaces';
import { SolanaConfig, TransactionResult, BalanceResult, AccountInfoResult, TransactionStatus } from '../../types/interfaces';

/**
 * Solana Web3 服务 (已升级到新日志系统)
 * 负责Solana区块链连接、RPC管理、基础查询功能
 * 
 * 🆕 使用新的三层分离架构日志系统:
 * - 🔧 系统日志: 连接状态、健康检查、端点切换
 * - 📝 业务操作日志: 交易发送、余额查询、账户操作
 * - 📊 业务监控日志: RPC响应时间、成功率、性能指标
 */
@injectable()
export class SolanaWeb3Service implements ISolanaWeb3Service {
    private connection!: Connection;
    private config: SolanaConfig;
    private currentEndpointIndex: number = 0;
    private lastHealthCheck: number = 0;
    private healthCheckInterval: number = 60000; // 1分钟健康检查
    private startTime = Date.now();

    // 性能监控
    private operationCount = 0;
    private errorCount = 0;
    private totalResponseTime = 0;

    // IService 接口实现
    readonly name = 'SolanaWeb3Service';
    readonly version = '2.0.0';
    readonly dependencies: string[] = ['ConfigService', 'LoggerService', 'MultiRPCService'];

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.MultiRPCService) private multiRPCService: IMultiRPCService
    ) {
        this.config = this.configService.get('solana');
        this.initializeConnection();
    }

    /**
     * 初始化Solana连接 - 使用新日志系统
     */
    private initializeConnection(): void {
        const initStart = Date.now();

        try {
            const primaryEndpoint = this.config.rpcEndpoints[0];

            const commitment: Commitment = (this.config.commitment as Commitment) || 'confirmed';
            const confirmOptions: ConfirmOptions = {
                commitment,
                preflightCommitment: commitment,
                skipPreflight: false,
                maxRetries: 3
            };

            this.connection = new Connection(primaryEndpoint, {
                commitment,
                confirmTransactionInitialTimeout: 60000,
                ...(this.config.wsEndpoint && { wsEndpoint: this.config.wsEndpoint })
            });

            // 🔧 系统日志: 连接初始化
            this.loggerService.logSystem('INFO', `Solana连接初始化完成: ${primaryEndpoint}`);

            // 📊 业务监控日志: 初始化性能
            this.loggerService.logBusinessMonitoring('solana-connection-init', {
                endpoint: primaryEndpoint,
                commitment,
                duration: Date.now() - initStart,
                wsEnabled: !!this.config.wsEndpoint
            });

        } catch (error) {
            this.errorCount++;
            this.loggerService.logError('solana-connection', 'Solana连接初始化失败', error as Error);
            throw error;
        }
    }

    /**
     * 获取当前连接实例
     */
    getConnection(): Connection {
        return this.connection;
    }

    /**
     * 获取当前RPC端点
     */
    getCurrentEndpoint(): string {
        return this.config.rpcEndpoints[this.currentEndpointIndex];
    }

    /**
     * 切换到下一个RPC端点 - 使用新日志系统
     */
    async switchToNextEndpoint(): Promise<boolean> {
        const switchStart = Date.now();

        try {
            // 📝 业务操作日志: 开始端点切换
            await this.loggerService.logBusinessOperation('RPC端点切换-开始', {
                currentEndpoint: this.getCurrentEndpoint(),
                timestamp: switchStart
            });

            const nextEndpoint = await this.multiRPCService.getNextHealthyEndpoint();
            if (nextEndpoint) {
                this.connection = new Connection(nextEndpoint, {
                    commitment: (this.config.commitment as Commitment) || 'confirmed',
                    confirmTransactionInitialTimeout: 60000
                });

                // 📝 业务操作日志: 端点切换成功
                await this.loggerService.logBusinessOperation('RPC端点切换-成功', {
                    newEndpoint: nextEndpoint,
                    previousEndpoint: this.getCurrentEndpoint(),
                    duration: Date.now() - switchStart
                });

                // 🔧 系统日志: 端点切换
                await this.loggerService.logSystem('INFO', `已切换到RPC端点: ${nextEndpoint}`);

                return true;
            }

            // 📝 业务操作日志: 无可用端点
            await this.loggerService.logBusinessOperation('RPC端点切换-失败', {
                reason: 'no-healthy-endpoints',
                duration: Date.now() - switchStart
            });

            return false;
        } catch (error) {
            this.errorCount++;

            // 📝 业务操作日志: 端点切换异常
            await this.loggerService.logBusinessOperation('RPC端点切换-错误', {
                error: error instanceof Error ? error.message : '未知错误',
                duration: Date.now() - switchStart
            });

            await this.loggerService.logError('rpc-endpoint-switch', '切换RPC端点失败', error as Error);
            return false;
        }
    }

    /**
     * 检查连接健康状态 - 使用新日志系统
     */
    async checkHealth(): Promise<boolean> {
        const healthStart = Date.now();

        try {
            const now = Date.now();

            // 避免频繁健康检查
            if (now - this.lastHealthCheck < this.healthCheckInterval) {
                return true;
            }

            const startTime = Date.now();
            const version = await this.connection.getVersion();
            const responseTime = Date.now() - startTime;

            this.lastHealthCheck = now;

            // 响应时间超过5秒认为不健康
            const isHealthy = responseTime < 5000 && !!version['solana-core'];

            // 📊 业务监控日志: 健康检查结果
            await this.loggerService.logBusinessMonitoring('rpc-health-check', {
                endpoint: this.getCurrentEndpoint(),
                responseTime,
                isHealthy,
                version: version['solana-core'],
                checkDuration: Date.now() - healthStart
            });

            if (!isHealthy) {
                // 🔧 系统日志: 健康状态警告
                await this.loggerService.logSystem('WARN', `RPC端点响应较慢: ${responseTime}ms`);
            }

            return isHealthy;
        } catch (error) {
            this.errorCount++;

            // 📊 业务监控日志: 健康检查失败
            await this.loggerService.logBusinessMonitoring('rpc-health-check', {
                endpoint: this.getCurrentEndpoint(),
                isHealthy: false,
                error: error instanceof Error ? error.message : '未知错误',
                checkDuration: Date.now() - healthStart
            });

            await this.loggerService.logError('rpc-health-check', '健康检查失败', error as Error);
            return false;
        }
    }

    /**
     * 获取账户余额 (SOL) - 使用新日志系统
     */
    async getBalance(publicKey: PublicKey): Promise<BalanceResult> {
        const operationStart = Date.now();
        this.operationCount++;

        try {
            // 📊 监控日志: 开始余额查询 (定时轮询属于监控类型)
            await this.loggerService.logBusinessMonitoring('balance-query-start', {
                publicKey: publicKey.toString(),
                endpoint: this.getCurrentEndpoint()
            });

            const balance = await this.connection.getBalance(publicKey);
            const responseTime = Date.now() - operationStart;
            this.totalResponseTime += responseTime;

            // 📊 监控日志: 余额查询成功 (定时轮询属于监控类型)
            await this.loggerService.logBusinessMonitoring('balance-query-success', {
                publicKey: publicKey.toString(),
                balance: balance / 1e9,
                lamports: balance,
                responseTime
            });

            // 📊 业务监控日志: 查询性能
            await this.loggerService.logBusinessMonitoring('balance-query-performance', {
                responseTime,
                success: true,
                endpoint: this.getCurrentEndpoint()
            });

            return {
                success: true,
                balance: balance / 1e9, // 转换为SOL
                lamports: balance
            };
        } catch (error) {
            this.errorCount++;

            // 📊 监控日志: 余额查询失败，尝试重试 (定时轮询属于监控类型)
            await this.loggerService.logBusinessMonitoring('balance-query-retry', {
                publicKey: publicKey.toString(),
                error: error instanceof Error ? error.message : '未知错误',
                attemptDuration: Date.now() - operationStart
            });

            // 尝试切换RPC端点重试
            if (await this.switchToNextEndpoint()) {
                try {
                    const retryStart = Date.now();
                    const balance = await this.connection.getBalance(publicKey);
                    const retryTime = Date.now() - retryStart;

                    // 📊 监控日志: 重试成功 (定时轮询属于监控类型)
                    await this.loggerService.logBusinessMonitoring('balance-query-retry-success', {
                        publicKey: publicKey.toString(),
                        balance: balance / 1e9,
                        retryTime,
                        totalTime: Date.now() - operationStart
                    });

                    return {
                        success: true,
                        balance: balance / 1e9,
                        lamports: balance
                    };
                } catch (retryError) {
                    await this.loggerService.logError('balance-query-retry', '重试获取余额失败', retryError as Error);
                }
            }

            // 📊 业务监控日志: 查询失败
            await this.loggerService.logBusinessMonitoring('balance-query-performance', {
                responseTime: Date.now() - operationStart,
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : '获取余额失败',
                balance: 0,
                lamports: 0
            };
        }
    }

    /**
     * 获取代币账户余额 - 使用新日志系统
     */
    async getTokenBalance(tokenAccount: PublicKey): Promise<BalanceResult> {
        const operationStart = Date.now();
        this.operationCount++;

        try {
            // 📊 监控日志: 开始代币余额查询 (定时轮询属于监控类型)
            await this.loggerService.logBusinessMonitoring('token-balance-query-start', {
                tokenAccount: tokenAccount.toString(),
                endpoint: this.getCurrentEndpoint()
            });

            const tokenAmount = await this.connection.getTokenAccountBalance(tokenAccount);
            const responseTime = Date.now() - operationStart;
            this.totalResponseTime += responseTime;

            // 📊 监控日志: 代币余额查询成功 (定时轮询属于监控类型)
            await this.loggerService.logBusinessMonitoring('token-balance-query-success', {
                tokenAccount: tokenAccount.toString(),
                amount: tokenAmount.value.amount,
                decimals: tokenAmount.value.decimals,
                uiAmount: tokenAmount.value.uiAmount,
                responseTime
            });

            // 📊 业务监控日志: 查询性能
            await this.loggerService.logBusinessMonitoring('token-balance-query-performance', {
                responseTime,
                success: true,
                endpoint: this.getCurrentEndpoint()
            });

            return {
                success: true,
                balance: parseFloat(tokenAmount.value.amount),
                decimals: tokenAmount.value.decimals,
                uiAmount: tokenAmount.value.uiAmount
            };
        } catch (error) {
            this.errorCount++;

            // 尝试切换RPC端点重试
            if (await this.switchToNextEndpoint()) {
                try {
                    const retryStart = Date.now();
                    const tokenAmount = await this.connection.getTokenAccountBalance(tokenAccount);

                    // 📊 监控日志: 重试成功 (定时轮询属于监控类型)
                    await this.loggerService.logBusinessMonitoring('token-balance-query-retry-success', {
                        tokenAccount: tokenAccount.toString(),
                        amount: tokenAmount.value.amount,
                        retryTime: Date.now() - retryStart
                    });

                    return {
                        success: true,
                        balance: parseFloat(tokenAmount.value.amount),
                        decimals: tokenAmount.value.decimals,
                        uiAmount: tokenAmount.value.uiAmount
                    };
                } catch (retryError) {
                    await this.loggerService.logError('token-balance-retry', '重试获取代币余额失败', retryError as Error);
                }
            }

            // 📊 业务监控日志: 查询失败
            await this.loggerService.logBusinessMonitoring('token-balance-query-performance', {
                responseTime: Date.now() - operationStart,
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : '获取代币余额失败',
                balance: 0
            };
        }
    }

    /**
     * 获取账户信息 - 使用新日志系统
     */
    async getAccountInfo(publicKey: PublicKey): Promise<AccountInfoResult> {
        const operationStart = Date.now();
        this.operationCount++;

        try {
            // 📝 业务操作日志: 开始账户信息查询
            await this.loggerService.logBusinessOperation('account-info-query-start', {
                publicKey: publicKey.toString(),
                endpoint: this.getCurrentEndpoint()
            });

            const accountInfo = await this.connection.getAccountInfo(publicKey);
            const responseTime = Date.now() - operationStart;
            this.totalResponseTime += responseTime;

            if (!accountInfo) {
                // 📝 业务操作日志: 账户不存在
                await this.loggerService.logBusinessOperation('account-info-not-found', {
                    publicKey: publicKey.toString(),
                    responseTime
                });

                return {
                    success: false,
                    error: '账户不存在',
                    exists: false
                };
            }

            // 📝 业务操作日志: 账户信息查询成功
            await this.loggerService.logBusinessOperation('account-info-query-success', {
                publicKey: publicKey.toString(),
                owner: accountInfo.owner.toString(),
                lamports: accountInfo.lamports,
                executable: accountInfo.executable,
                dataSize: accountInfo.data.length,
                responseTime
            });

            // 📊 业务监控日志: 查询性能
            await this.loggerService.logBusinessMonitoring('account-info-query-performance', {
                responseTime,
                success: true,
                endpoint: this.getCurrentEndpoint()
            });

            return {
                success: true,
                exists: true,
                accountInfo: {
                    executable: accountInfo.executable,
                    owner: accountInfo.owner.toString(),
                    lamports: accountInfo.lamports,
                    data: accountInfo.data,
                    ...(accountInfo.rentEpoch !== undefined && { rentEpoch: accountInfo.rentEpoch })
                }
            };
        } catch (error) {
            this.errorCount++;

            // 📊 业务监控日志: 查询失败
            await this.loggerService.logBusinessMonitoring('account-info-query-performance', {
                responseTime: Date.now() - operationStart,
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            });

            await this.loggerService.logError('account-info-query', `获取账户信息失败 for ${publicKey.toString()}`, error as Error);
            return { success: false, exists: false, error: (error as Error).message };
        }
    }

    /**
     * 发送和确认交易 (已升级到新日志系统和签名逻辑)
     * @param transaction 待发送的交易 (V0或传统)
     * @param sendOptions 发送选项，可包含签名者
     * @returns 交易结果
     */
    async sendTransaction(
        transaction: Transaction | VersionedTransaction,
        sendOptions?: CustomSendOptions
    ): Promise<TransactionResult> {
        const operationStart = Date.now();
        this.operationCount++;
        const gasService = container.resolve<IGasService>(TYPES.GasService);

        try {
            await this.loggerService.logBusinessOperation('🚀 开始发送交易', {
                endpoint: this.getCurrentEndpoint(),
                transactionType: transaction instanceof VersionedTransaction ? 'versioned' : 'legacy',
                timestamp: operationStart
            });

            // 从发送选项中提取签名者
            const signers = sendOptions?.signers;

            // 创建一个新的选项对象，移除自定义的signers属性
            const connectionOptions: SendOptions = { ...sendOptions };
            if (sendOptions?.signers) {
                delete (connectionOptions as any).signers;
            }

            // 动态获取优先费
            const priorityFee = await gasService.getOptimalPriorityFee();
            await this.loggerService.logBusinessOperation('⚡ 交易Gas设置', {
                priorityFee: priorityFee,
                source: 'GasService'
            });

            // 🔧 添加计算预算指令到交易中
            if (!(transaction instanceof VersionedTransaction)) {
                // 只对传统交易添加计算预算指令
                const gasEstimate = {
                    priorityFee: priorityFee,
                    baseFee: 0,
                    totalFee: priorityFee,
                    units: 200000
                };
                transaction = await gasService.addComputeBudgetInstructions(transaction as Transaction, gasEstimate);
                await this.loggerService.logBusinessOperation('💰 计算预算指令已添加', {
                    priorityFee: priorityFee,
                    instructionCount: (transaction as Transaction).instructions.length
                });
            }

            const options: SendOptions = {
                skipPreflight: connectionOptions.skipPreflight ?? false,
                maxRetries: connectionOptions.maxRetries ?? 3,
                preflightCommitment: 'confirmed',
                ...connectionOptions
            };

            await this.loggerService.logBusinessMonitoring('transaction-parameters', {
                skipPreflight: options.skipPreflight,
                maxRetries: options.maxRetries,
                priorityFee: priorityFee
            });

            let signature: TransactionSignature;
            if (transaction instanceof VersionedTransaction) {
                // 版本化交易必须预先签名
                if (signers && signers.length > 0) {
                    transaction.sign(signers);
                }
                signature = await this.connection.sendTransaction(transaction, options);
            } else {
                // 旧版交易直接将签名者传递给sendTransaction
                signature = await this.connection.sendTransaction(transaction, signers || [], options);
            }

            await this.loggerService.logBusinessOperation('📡 交易已发送', {
                signature,
                endpoint: this.getCurrentEndpoint(),
            });

            const verificationResult = await this.verifyTransactionWithRetry(signature);
            const responseTime = Date.now() - operationStart;
            this.totalResponseTime += responseTime;

            if (verificationResult.success) {
                await this.loggerService.logBusinessOperation('✅ 交易确认成功', {
                    signature,
                    slot: verificationResult.slot,
                    status: verificationResult.status,
                    responseTime
                });
                await this.loggerService.logBusinessMonitoring('transaction-performance', {
                    responseTime,
                    success: true,
                    endpoint: this.getCurrentEndpoint()
                });

                const result: TransactionResult = {
                    success: true,
                    signature,
                };
                if (verificationResult.status) {
                    result.status = verificationResult.status;
                }
                if (verificationResult.slot) {
                    result.slot = verificationResult.slot;
                }
                return result;

            } else {
                throw new Error(verificationResult.error || '交易验证失败');
            }

        } catch (error) {
            this.errorCount++;
            const responseTime = Date.now() - operationStart;

            await this.loggerService.logError('service', '发送交易失败:', error as Error);
            await this.loggerService.logBusinessMonitoring('transaction-performance', {
                responseTime,
                success: false,
                error: (error as Error).message,
                endpoint: this.getCurrentEndpoint()
            });

            let errorMessage = '交易失败';
            if (error instanceof SendTransactionError) {
                errorMessage = `发送交易错误: ${error.message}`;
                if (error.logs) {
                    await this.loggerService.logSystem('ERROR', `交易日志: ${error.logs.join('\n')}`);
                }
            } else if (error instanceof Error) {
                errorMessage = `交易失败: ${error.message}`;
            }

            return { success: false, signature: '', error: errorMessage };
        }
    }

    /**
     * 🔧 优化的交易验证策略
     * 根据网络拥堵状况动态调整验证策略
     */
    private async verifyTransactionWithRetry(
        signature: string,
        maxRetries: number = 5  // 修改为5次验证
    ): Promise<{
        success: boolean;
        status?: TransactionStatus;
        slot?: number;
        error?: string;
    }> {
        // 🔧 优化：根据网络拥堵动态调整验证间隔
        const verificationDelays = [2000, 5000, 8000, 12000, 12000]; // 2s、5s、8s、12s、12s (移除最后一次25s)

        for (let i = 0; i < maxRetries; i++) {
            try {
                // 等待指定时间
                if (verificationDelays[i] > 0) {
                    await new Promise(resolve => setTimeout(resolve, verificationDelays[i]));
                }

                // 统一使用标准验证方法，取消备用验证
                const result = await this.connection.getSignatureStatus(signature);

                if (result?.value) {
                    const status = result.value;

                    if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
                        await this.loggerService.logSystem('INFO',
                            `✅ 交易验证: ${signature.substring(0, 8)}... (第${i + 1}次尝试) ${status.confirmationStatus}`
                        );

                        // 🔧 修复：检查交易执行结果，而不仅仅是确认状态
                        if (status.err) {
                            await this.loggerService.logSystem('ERROR',
                                `❌ 交易确认但执行失败: ${signature.substring(0, 8)}... 错误: ${JSON.stringify(status.err)}`
                            );
                            return {
                                success: false,  // 修复：交易失败时返回false
                                status: 'failed',
                                error: `交易执行失败: ${JSON.stringify(status.err)}`,
                                slot: status.slot
                            };
                        }

                        // 交易确认且执行成功
                        return {
                            success: true,
                            status: 'confirmed',
                            slot: status.slot
                        };
                    }

                    if (status.err) {
                        await this.loggerService.logError('Service', `❌ 交易执行失败 (第${i + 1}次):`, status.err as Error);
                        return {
                            success: false,
                            error: `交易执行失败: ${JSON.stringify(status.err)}`
                        };
                    }
                }

                // 只在最后一次才记录未确认的日志
                if (i === maxRetries - 1) {
                    await this.loggerService.logSystem('WARN',
                        `⏳ 交易验证超时: ${signature.substring(0, 8)}... (${maxRetries}次尝试后未确认)`
                    );
                }

            } catch (error) {
                await this.loggerService.logError('Service', `❌ 第${i + 1}次验证失败:`, error as Error);

                if (i === maxRetries - 1) {
                    return {
                        success: false,
                        error: `验证失败: ${error instanceof Error ? error.message : '未知错误'}`
                    };
                }
            }
        }

        return {
            success: false,
            error: '交易验证超时'
        };
    }



    /**
     * 判断是否为RPC相关错误
     */
    private isRPCError(error: any): boolean {
        const rpcErrorPatterns = [
            'fetch failed',
            'network error',
            'timeout',
            'connection refused',
            'rate limit',
            '429',
            '502',
            '503',
            '504'
        ];

        const errorMessage = error?.message?.toLowerCase() || '';
        return rpcErrorPatterns.some(pattern => errorMessage.includes(pattern));
    }

    /**
     * 获取最新区块哈希
     */
    async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number } | null> {
        try {
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            return { blockhash, lastValidBlockHeight };
        } catch (error) {
            await this.loggerService.logError('Service', '❌ 获取最新区块哈希失败:', error as Error);

            // 尝试切换RPC端点重试
            if (await this.switchToNextEndpoint()) {
                try {
                    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                    return { blockhash, lastValidBlockHeight };
                } catch (retryError) {
                    await this.loggerService.logError('Service', '❌ 重试获取区块哈希失败:', retryError as Error);
                }
            }

            return null;
        }
    }

    /**
     * 模拟交易
     */
    async simulateTransaction(transaction: Transaction | VersionedTransaction): Promise<{
        success: boolean;
        logs?: string[];
        error?: string;
        unitsConsumed?: number;
    }> {
        try {
            let result: any;
            if (transaction instanceof VersionedTransaction) {
                result = await this.connection.simulateTransaction(transaction);
            } else {
                result = await this.connection.simulateTransaction(transaction);
            }

            if (result.value.err) {
                return {
                    success: false,
                    error: `模拟失败: ${JSON.stringify(result.value.err)}`,
                    logs: result.value.logs || []
                };
            }

            return {
                success: true,
                logs: result.value.logs || [],
                unitsConsumed: result.value.unitsConsumed || 0
            };
        } catch (error) {
            await this.loggerService.logError('Service', '❌ 交易模拟失败:', error as Error);
            return {
                success: false,
                error: error instanceof Error ? error.message : '交易模拟失败'
            };
        }
    }

    /**
     * 获取程序账户
     */
    async getProgramAccounts(
        programId: PublicKey,
        configOrCommitment?: any
    ): Promise<Array<{
        pubkey: PublicKey;
        account: AccountInfo<Buffer | ParsedAccountData>;
    }> | null> {
        try {
            const response = await this.connection.getProgramAccounts(programId, configOrCommitment);
            // 如果返回的是RpcResponseAndContext，提取value；否则直接返回
            return Array.isArray(response) ? response : (response as any).value || response;
        } catch (error) {
            await this.loggerService.logError('Service', '❌ 获取程序账户失败:', error as Error);

            // 尝试切换RPC端点重试
            if (await this.switchToNextEndpoint()) {
                try {
                    const response = await this.connection.getProgramAccounts(programId, configOrCommitment);
                    return Array.isArray(response) ? response : (response as any).value || response;
                } catch (retryError) {
                    await this.loggerService.logError('Service', '❌ 重试获取程序账户失败:', retryError as Error);
                }
            }

            return null;
        }
    }

    /**
     * 订阅账户变化
     */
    onAccountChange(
        publicKey: PublicKey,
        callback: (accountInfo: AccountInfo<Buffer>, context: { slot: number }) => void,
        commitment?: Commitment
    ): number {
        return this.connection.onAccountChange(publicKey, callback, commitment);
    }

    /**
     * 取消订阅
     */
    async removeAccountChangeListener(id: number): Promise<void> {
        await this.connection.removeAccountChangeListener(id);
    }

    /**
     * 获取Slot
     */
    async getSlot(): Promise<number | null> {
        try {
            return await this.connection.getSlot();
        } catch (error) {
            await this.loggerService.logError('Service', '❌ 获取Slot失败:', error as Error);
            return null;
        }
    }

    /**
     * 获取Solana网络版本信息
     * 用于网络状态检查和健康监控
     */
    async getVersion(): Promise<any> {
        try {
            const version = await this.connection.getVersion();

            // 📝 业务操作日志: 版本查询成功
            await this.loggerService.logBusinessOperation('solana-version-query', {
                version: version['solana-core'],
                timestamp: Date.now(),
                endpoint: this.getCurrentEndpoint()
            });

            return version;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('Service', '❌ 获取Solana版本失败:', error as Error);

            // 尝试切换RPC端点重试
            if (await this.switchToNextEndpoint()) {
                try {
                    const version = await this.connection.getVersion();

                    await this.loggerService.logBusinessOperation('solana-version-query-retry', {
                        version: version['solana-core'],
                        timestamp: Date.now(),
                        endpoint: this.getCurrentEndpoint()
                    });

                    return version;
                } catch (retryError) {
                    await this.loggerService.logError('Service', '❌ 重试获取Solana版本失败:', retryError as Error);
                }
            }

            throw error;
        }
    }

    /**
     * 销毁服务，清理资源
     */
    async destroy(): Promise<void> {
        try {
            // 清理WebSocket连接等资源
            await this.loggerService.logSystem('INFO', '🧹 SolanaWeb3Service资源清理完成');
        } catch (error) {
            await this.loggerService.logError('Service', '❌ SolanaWeb3Service资源清理失败:', error as Error);
        }
    }

    // IService 接口方法实现
    async initialize(config: any): Promise<void> {
        this.config = { ...this.config, ...config };
        this.initializeConnection();
    }

    async start(): Promise<void> {
        // SolanaWeb3Service 在构造时就已启动
    }

    async stop(): Promise<void> {
        await this.destroy();
    }

    async healthCheck(): Promise<any> {
        const isHealthy = await this.checkHealth();
        return {
            status: isHealthy ? 'healthy' : 'unhealthy',
            message: isHealthy ? 'Solana connection is healthy' : 'Solana connection issues',
            timestamp: Date.now()
        };
    }

    getMetrics(): any {
        return {
            uptime: Date.now() - this.startTime,
            requestCount: this.operationCount,
            errorCount: this.errorCount,
            lastActivity: Date.now(),
            currentEndpoint: this.getCurrentEndpoint(),
            totalResponseTime: this.totalResponseTime,
            averageResponseTime: this.totalResponseTime / this.operationCount
        };
    }
} 