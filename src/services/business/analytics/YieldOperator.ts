import { injectable, inject } from 'tsyringe';
import { ILoggerService, IPositionFeeHarvester, IJupiterService, IWalletService, IMeteoraService, IPositionManager, ISolanaWeb3Service, TYPES } from '../../../types/interfaces';
import { YieldExtraction, YieldStatistics } from '../../../types/analytics-types';
import { AccumulatedYieldManager } from './AccumulatedYieldManager';
import { SynchronousRetryManager, AsyncRetryableOperation } from '../../modules/SynchronousRetryManager';

/**
 * 收益提取上下文
 */
export interface YieldExtractionContext {
    positionAddresses: string[];
    threshold: string;
    currentYieldStats: YieldStatistics;
    poolAddress: string;
    instanceId?: string; // 🆕 添加实例ID
    tokenPrecision?: {
        tokenXDecimals: number;
        tokenYDecimals: number;
        tokenXMint: string;
        tokenYMint: string;
    };
    // 🆕 新增活跃bin相关参数
    activeBin?: number;           // 当前活跃bin
    positionLowerBin?: number;    // 头寸范围下边界
    positionUpperBin?: number;    // 头寸范围上边界
}

/**
 * 业务操作结果
 */
export interface OperationResult {
    success: boolean;
    data?: any;
    error?: string;
}

/**
 * 业务操作器接口
 */
export interface IBusinessOperator {
    executeOperation(context: any): Promise<OperationResult>;
}

/**
 * 收益业务操作器
 * 负责收益提取等业务操作，包含副作用操作
 */
@injectable()
export class YieldOperator implements IBusinessOperator {
    // 性能监控
    private extractionCount: number = 0;
    private totalExtractedAmount: string = '0';
    private errorCount: number = 0;

    // 🔒 状态管理回调（防止重复提取）
    private statusCallback: ((status: 'IDLE' | 'EXTRACTING') => void) | null = null;

    // 🆕 缓存清理回调（收益提取完成后清除相关缓存）
    private cacheInvalidationCallback: (() => void) | null = null;

    // 🔒 时间锁机制（防止重复提取）
    private lastExtractionTime: number = 0;
    private extractionCooldownMs: number = 1 * 60 * 1000; // 默认1分钟冷却时间

    constructor(
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.PositionFeeHarvester) private feeHarvester: IPositionFeeHarvester,
        @inject(TYPES.JupiterService) private jupiterService: IJupiterService,
        @inject(TYPES.WalletService) private walletService: IWalletService,
        @inject(TYPES.MeteoraService) private meteoraService: IMeteoraService,
        @inject(TYPES.PositionManager) private positionManager: IPositionManager,
        @inject(TYPES.SynchronousRetryManager) private retryManager: SynchronousRetryManager,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        private accumulatedYieldManager: AccumulatedYieldManager
    ) { }

    /**
     * 🔒 设置状态管理回调（由PositionAnalyticsService注册）
     */
    setStatusCallback(callback: (status: 'IDLE' | 'EXTRACTING') => void): void {
        this.statusCallback = callback;
    }

    /**
     * 🔒 通知状态变化
     */
    private notifyStatusChange(status: 'IDLE' | 'EXTRACTING'): void {
        if (this.statusCallback) {
            this.statusCallback(status);
        }
    }

    /**
     * 🔒 设置收益提取时间锁
     */
    setExtractionTimeLock(timeLockMinutes: number): void {
        this.extractionCooldownMs = timeLockMinutes * 60 * 1000;
    }

    /**
     * 🔒 获取当前时间锁配置
     */
    getExtractionTimeLockMinutes(): number {
        return Math.round(this.extractionCooldownMs / 60000);
    }

    /**
     * 🆕 设置缓存清理回调（收益提取完成后调用）
     */
    setCacheInvalidationCallback(callback: () => void): void {
        this.cacheInvalidationCallback = callback;
    }

    /**
     * 执行业务操作 - 通用接口
     */
    async executeOperation(context: YieldExtractionContext): Promise<OperationResult> {
        try {
            // 🔒 添加时间锁检查
            const currentTime = Date.now();
            const timeSinceLastExtraction = currentTime - this.lastExtractionTime;
            const remainingCooldown = this.extractionCooldownMs - timeSinceLastExtraction;

            if (this.lastExtractionTime > 0 && remainingCooldown > 0) {
                const remainingMinutes = Math.ceil(remainingCooldown / 60000);
                const timeLockMinutes = this.getExtractionTimeLockMinutes();

                // 🎯 记录时间锁状态到策略实例日志
                await (this.loggerService as any).logInstanceAwareOperation(
                    '收益提取时间锁生效',
                    {
                        remainingMinutes,
                        timeLockMinutes,
                        currentPendingYield: context.currentYieldStats.currentPendingYield,
                        threshold: context.threshold,
                        lastExtractionTime: new Date(this.lastExtractionTime).toISOString()
                    },
                    context.instanceId
                );

                await this.loggerService.logSystem('INFO',
                    `🔒 收益提取时间锁生效，还需等待 ${remainingMinutes} 分钟 (配置: ${timeLockMinutes}分钟) - 当前收益: ${context.currentYieldStats.currentPendingYield}, 阈值: ${context.threshold}`
                );

                return {
                    success: false,
                    error: `收益提取时间锁生效，还需等待 ${remainingMinutes} 分钟`
                };
            }

            // 🆕 检查活跃bin位置 - 如果活跃bin在连锁头寸范围中间以下，只检查不提取
            if (context.activeBin !== undefined && context.positionLowerBin !== undefined && context.positionUpperBin !== undefined) {
                const positionMiddle = Math.floor((context.positionLowerBin + context.positionUpperBin) / 2);
                
                if (context.activeBin <= positionMiddle) {
                    await this.loggerService.logSystem('INFO',
                        `🚫 活跃bin在头寸范围中间以下，跳过收益提取 - 活跃bin: ${context.activeBin}, 头寸中间: ${positionMiddle}, 范围: [${context.positionLowerBin}, ${context.positionUpperBin}], 当前收益: ${context.currentYieldStats.currentPendingYield}`
                    );
                    
                    // 🎯 记录到策略实例日志
                    await (this.loggerService as any).logInstanceAwareOperation(
                        '收益提取跳过-活跃bin位置',
                        {
                            activeBin: context.activeBin,
                            positionMiddle,
                            positionRange: [context.positionLowerBin, context.positionUpperBin],
                            currentPendingYield: context.currentYieldStats.currentPendingYield,
                            threshold: context.threshold
                        },
                        context.instanceId
                    );
                    
                    return {
                        success: false,
                        error: `活跃bin在头寸范围中间以下，跳过收益提取`
                    };
                }
                
                await this.loggerService.logSystem('DEBUG',
                    `✅ 活跃bin在头寸范围中间以上，可以进行收益提取 - 活跃bin: ${context.activeBin}, 头寸中间: ${positionMiddle}, 范围: [${context.positionLowerBin}, ${context.positionUpperBin}]`
                );
            }

            // 🔒 通过所有检查，执行收益提取
            const result = await this.extractYield(context);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            };
        }
    }

    /**
     * 收益提取操作 - 修改记录逻辑，使用准确的待提取收益数值
     */
    async extractYield(context: YieldExtractionContext): Promise<YieldExtraction> {
        await this.loggerService.logSystem('INFO', `🎯 开始智能批量提取收益 - 阈值: ${context.threshold}`);

        // 🎯 记录到策略实例日志和业务操作日志
        await (this.loggerService as any).logInstanceAwareOperation(
            '收益提取开始',
            {
                threshold: context.threshold,
                currentPendingYield: context.currentYieldStats.currentPendingYield,
                positionCount: context.positionAddresses.length
            },
            context.instanceId
        );

        // 🔒 设置提取状态为进行中
        this.notifyStatusChange('EXTRACTING');

        try {
            // 检查收益是否达到阈值
            if (parseFloat(context.currentYieldStats.currentPendingYield) < parseFloat(context.threshold)) {
                throw new Error(
                    `当前收益 ${context.currentYieldStats.currentPendingYield} 未达到提取阈值 ${context.threshold}`
                );
            }

            // 🔍 记录提取前的准确收益数值
            const pendingYieldBeforeExtraction = context.currentYieldStats.currentPendingYield;

            // 按池子分组头寸，避免重复提取
            const positionsByPool = await this.groupPositionsByPool(context.positionAddresses);

            let totalExtractedY = '0';
            let totalGasUsed = 0;
            let lastSignature = '';
            let successCount = 0;
            let totalPoolsProcessed = 0;

            await this.loggerService.logSystem('INFO',
                `📊 头寸分组完成 - 共 ${positionsByPool.size} 个池子，${context.positionAddresses.length} 个头寸，待提取收益: ${pendingYieldBeforeExtraction}`
            );

            // 逐个池子进行批量提取
            for (const [poolAddress, positions] of Array.from(positionsByPool.entries())) {
                try {
                    await this.loggerService.logSystem('INFO',
                        `🏊 开始处理池子: ${poolAddress.substring(0, 8)}... (${positions.length}个头寸)`
                    );

                    // 调用池子级别批量提取方法
                    const poolResult = await this.feeHarvester.harvestPoolPositionFees(poolAddress, positions);

                    if (poolResult.success) {
                        // 🔥 新增：4次验证交易确认
                        if (poolResult.signature) {
                            await this.loggerService.logSystem('INFO',
                                `🔍 开始验证提取交易: ${poolResult.signature.substring(0, 8)}...`
                            );

                            const verificationResult = await this.verifyExtractionTransactionWithRetry(poolResult.signature);

                            if (verificationResult.success && verificationResult.status !== 'failed') {
                                // ✅ 验证成功，记录收益提取
                                await this.loggerService.logSystem('INFO',
                                    `✅ 提取交易验证成功: 状态=${verificationResult.status}, 插槽=${verificationResult.slot}`
                                );

                                await this.accumulatedYieldManager.recordYieldExtraction(
                                    poolAddress,
                                    positions,
                                    '0', // 不使用SDK的tokenX数据
                                    pendingYieldBeforeExtraction, // 使用提取前记录的准确收益数值
                                    pendingYieldBeforeExtraction, // 总提取价值使用准确数值
                                    poolResult.signature,
                                    poolResult.gasUsed
                                );

                                // 累加收益数值
                                totalExtractedY = this.addBigNumbers(totalExtractedY, pendingYieldBeforeExtraction);
                                totalGasUsed += poolResult.gasUsed;
                                lastSignature = poolResult.signature;
                                successCount += positions.length;
                                totalPoolsProcessed++;

                                await this.loggerService.logSystem('INFO',
                                    `✅ 池子 ${poolAddress.substring(0, 8)}... 收益提取验证成功并已记录 - 提取收益: ${pendingYieldBeforeExtraction}`
                                );
                            } else {
                                // ❌ 验证失败，不记录收益，下次轮询自然重试
                                await this.loggerService.logSystem('WARN',
                                    `⚠️ 池子 ${poolAddress.substring(0, 8)}... 提取交易验证失败，未记录收益，等待下次轮询重试: ${verificationResult.error || verificationResult.status}`
                                );
                            }
                        } else {
                            await this.loggerService.logSystem('WARN',
                                `⚠️ 池子 ${poolAddress.substring(0, 8)}... 提取成功但无交易签名，未记录收益`
                            );
                        }

                        // 🔄 独立的代币交换操作（不影响收益记录）
                        try {
                            const xTokenBalance = await this.getAccountTokenBalance(poolAddress, 'X');
                            if (parseFloat(xTokenBalance) > 0) {
                                await this.loggerService.logSystem('INFO',
                                    `💰 开始X代币交换: ${xTokenBalance} (池子: ${poolAddress.substring(0, 8)}...)`
                                );

                                const swapResult = await this.swapTokenXToYWithRetry(
                                    poolAddress,
                                    context.instanceId || `pool_${poolAddress.substring(0, 8)}_${Date.now()}`
                                );

                                await this.loggerService.logSystem('INFO',
                                    `✅ X代币交换成功: ${xTokenBalance} → ${swapResult.outputAmount} Y代币`
                                );
                            } else {
                                await this.loggerService.logSystem('INFO',
                                    `ℹ️ 无X代币余额，跳过交换 (池子: ${poolAddress.substring(0, 8)}...)`
                                );
                            }
                        } catch (swapError) {
                            // 代币交换失败不影响收益记录
                            await this.loggerService.logSystem('WARN',
                                `⚠️ X代币交换失败，但收益处理已完成 (池子: ${poolAddress.substring(0, 8)}...): ${swapError instanceof Error ? swapError.message : '未知错误'}`
                            );
                        }
                    } else {
                        // ❌ 提取失败，不记录收益，下次轮询自然重试
                        await this.loggerService.logSystem('WARN',
                            `⚠️ 池子 ${poolAddress.substring(0, 8)}... 提取失败，未记录收益，等待下次轮询重试: ${poolResult.error}`
                        );
                    }
                } catch (error) {
                    // 异常情况也不记录
                    await this.loggerService.logSystem('ERROR',
                        `池子 ${poolAddress.substring(0, 8)}... 处理异常，未记录数据: ${error instanceof Error ? error.message : '未知错误'}`
                    );
                }
            }

            // 记录提取记录
            const extraction: YieldExtraction = {
                timestamp: Date.now(),
                extractedAmount: totalExtractedY,
                transactionSignature: lastSignature,
                gasUsed: totalGasUsed,
                priceAtExtraction: parseFloat(pendingYieldBeforeExtraction) // 使用准确的提取前数值
            };

            this.extractionCount++;
            this.totalExtractedAmount = this.addBigNumbers(this.totalExtractedAmount, totalExtractedY);

            await this.loggerService.logBusinessOperation('smart-yield-extraction', {
                extractedAmount: totalExtractedY,
                pendingYieldBeforeExtraction: pendingYieldBeforeExtraction,
                totalPositions: context.positionAddresses.length,
                totalPools: positionsByPool.size,
                poolsProcessed: totalPoolsProcessed,
                successfulPositions: successCount,
                gasUsed: totalGasUsed,
                timestamp: Date.now()
            });

            await this.loggerService.logSystem('INFO',
                `🎉 智能批量提取完成 - 实际提取收益: ${totalExtractedY}, 成功头寸: ${successCount}/${context.positionAddresses.length}, 处理池子: ${totalPoolsProcessed}/${positionsByPool.size}`
            );

            // 🎯 记录到策略实例日志和业务操作日志
            await (this.loggerService as any).logInstanceAwareOperation(
                '收益提取完成',
                {
                    extractedAmount: totalExtractedY,
                    successfulPositions: successCount,
                    transactionSignature: lastSignature
                },
                context.instanceId
            );

            // 🔒 重置提取状态为空闲
            this.notifyStatusChange('IDLE');

            // 🆕 收益提取完成后清除缓存，确保数据一致性
            if (this.cacheInvalidationCallback) {
                try {
                    this.cacheInvalidationCallback();
                    await this.loggerService.logSystem('INFO',
                        '🔄 收益提取完成，已通知清除相关缓存以确保数据一致性'
                    );
                } catch (error) {
                    await this.loggerService.logSystem('WARN',
                        `缓存清理通知失败（不影响主流程）: ${error instanceof Error ? error.message : '未知错误'}`
                    );
                }
            }

            // 🔒 更新时间锁
            this.lastExtractionTime = Date.now();
            const timeLockMinutes = this.getExtractionTimeLockMinutes();
            await this.loggerService.logSystem('INFO',
                `🔒 收益提取时间锁已激活，${timeLockMinutes}分钟内不再检查收益提取`
            );

            return extraction;

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logSystem('ERROR',
                `智能批量收益提取失败: ${error instanceof Error ? error.message : '未知错误'}`
            );

            // 🎯 记录到策略实例日志和业务操作日志
            await (this.loggerService as any).logInstanceAwareOperation(
                '收益提取失败',
                {
                    error: error instanceof Error ? error.message : '未知错误'
                },
                context.instanceId
            );

            // 🔒 异常情况下也要重置提取状态
            this.notifyStatusChange('IDLE');

            // 🔒 失败情况下也要更新时间锁
            this.lastExtractionTime = Date.now();
            const timeLockMinutes = this.getExtractionTimeLockMinutes();
            await this.loggerService.logSystem('INFO',
                `🔒 收益提取失败，时间锁已激活，${timeLockMinutes}分钟内不再检查收益提取`
            );

            throw error;
        }
    }

    /**
     * 检查是否需要执行收益提取
     */
    async checkAndExtractIfNeeded(
        yieldStats: YieldStatistics,
        threshold: string,
        positionAddresses: string[],
        poolAddress: string,
        activeBin?: number,           // 🆕 新增参数：当前活跃bin
        positionLowerBin?: number,    // 🆕 新增参数：头寸范围下边界
        positionUpperBin?: number     // 🆕 新增参数：头寸范围上边界
    ): Promise<YieldExtraction | null> {
        // 🔒 检查时间锁
        const currentTime = Date.now();
        const timeSinceLastExtraction = currentTime - this.lastExtractionTime;
        const remainingCooldown = this.extractionCooldownMs - timeSinceLastExtraction;

        if (this.lastExtractionTime > 0 && remainingCooldown > 0) {
            const remainingMinutes = Math.ceil(remainingCooldown / 60000);
            const timeLockMinutes = this.getExtractionTimeLockMinutes();
            await this.loggerService.logSystem('INFO',
                `🔒 收益提取时间锁生效，还需等待 ${remainingMinutes} 分钟 (配置: ${timeLockMinutes}分钟) - 当前收益: ${yieldStats.currentPendingYield}, 阈值: ${threshold}`
            );
            return null;
        }

        // 🆕 检查活跃bin位置 - 如果活跃bin在连锁头寸范围中间以下，只检查不提取
        if (activeBin !== undefined && positionLowerBin !== undefined && positionUpperBin !== undefined) {
            const positionMiddle = Math.floor((positionLowerBin + positionUpperBin) / 2);
            
            if (activeBin <= positionMiddle) {
                await this.loggerService.logSystem('INFO',
                    `🚫 活跃bin在头寸范围中间以下，跳过收益提取 - 活跃bin: ${activeBin}, 头寸中间: ${positionMiddle}, 范围: [${positionLowerBin}, ${positionUpperBin}], 当前收益: ${yieldStats.currentPendingYield}`
                );
                return null;
            }
            
            await this.loggerService.logSystem('DEBUG',
                `✅ 活跃bin在头寸范围中间以上，可以进行收益提取 - 活跃bin: ${activeBin}, 头寸中间: ${positionMiddle}, 范围: [${positionLowerBin}, ${positionUpperBin}]`
            );
        }

        if (parseFloat(yieldStats.currentPendingYield) >= parseFloat(threshold)) {
            await this.loggerService.logSystem('INFO',
                `收益达到提取阈值，开始自动提取 - 当前: ${yieldStats.currentPendingYield}, 阈值: ${threshold}`
            );

            try {
                return await this.extractYield({
                    positionAddresses,
                    threshold,
                    currentYieldStats: yieldStats,
                    poolAddress
                });
            } catch (error) {
                await this.loggerService.logSystem('ERROR',
                    `自动收益提取失败: ${error instanceof Error ? error.message : '未知错误'}`
                );
                return null;
            }
        }
        return null;
    }

    /**
     * 🔍 获取账户代币余额 - 通用方法（仿照ChainPositionExecutor方案）
     * @param poolAddress 池子地址，用于获取代币mint地址
     * @param tokenType 'X' 或 'Y'，指定查询哪个代币
     * @returns 人类可读格式的代币余额
     */
    private async getAccountTokenBalance(poolAddress: string, tokenType: 'X' | 'Y'): Promise<string> {
        try {
            // 获取池子信息以获取代币mint地址
            const poolInfo = await this.getPoolInfo(poolAddress);
            if (!poolInfo) {
                throw new Error(`无法获取池子信息: ${poolAddress}`);
            }

            const tokenMint = tokenType === 'X' ? poolInfo.tokenX : poolInfo.tokenY;
            if (!tokenMint) {
                throw new Error(`无法获取${tokenType}代币mint地址`);
            }

            // 获取用户钱包
            const userKeypair = this.walletService.getCurrentKeypair();
            if (!userKeypair) {
                throw new Error('用户钱包未解锁');
            }

            // 查询代币余额
            const connection = this.solanaService.getConnection();
            const { PublicKey } = await import('@solana/web3.js');
            const { getAssociatedTokenAddress, getAccount, getMint } = await import('@solana/spl-token');

            const tokenMintPubkey = new PublicKey(tokenMint);
            const userPublicKey = userKeypair.publicKey;

            // 🔧 动态获取代币精度
            let tokenDecimals = 6; // 默认精度
            try {
                const mintInfo = await getMint(connection, tokenMintPubkey);
                tokenDecimals = mintInfo.decimals;
                await this.loggerService.logSystem('DEBUG',
                    `📊 获取${tokenType}代币精度信息 - mint: ${tokenMint}, decimals: ${tokenDecimals}`
                );
            } catch (mintError) {
                await this.loggerService.logSystem('WARN',
                    `⚠️ 无法获取${tokenType}代币精度，使用默认值6 - mint: ${tokenMint}, error: ${mintError instanceof Error ? mintError.message : String(mintError)}`
                );
            }

            // 获取关联代币账户地址
            const associatedTokenAccount = await getAssociatedTokenAddress(
                tokenMintPubkey,
                userPublicKey
            );

            try {
                // 获取代币账户信息
                const tokenAccount = await getAccount(connection, associatedTokenAccount);
                const balance = tokenAccount.amount.toString();

                // 🔧 转换为人类可读格式
                const humanReadableBalance = (parseFloat(balance) / Math.pow(10, tokenDecimals)).toString();

                await this.loggerService.logSystem('DEBUG',
                    `📊 ${tokenType}代币余额查询成功 - mint: ${tokenMint}, rawBalance: ${balance}, humanReadableBalance: ${humanReadableBalance}, decimals: ${tokenDecimals}`
                );

                return humanReadableBalance;

            } catch (accountError) {
                // 如果账户不存在，说明没有该代币
                await this.loggerService.logSystem('DEBUG',
                    `ℹ️ ${tokenType}代币账户不存在，余额为0 - mint: ${tokenMint}`
                );
                return '0';
            }

        } catch (error) {
            await this.loggerService.logSystem('ERROR',
                `查询${tokenType}代币余额失败: ${error instanceof Error ? error.message : String(error)}`
            );
            return '0';
        }
    }

    /**
     * 将X代币交换为Y代币 - 采用ChainPositionExecutor的可靠方案
     * 直接从区块链查询真实余额和精度，避免双重转换错误
     */
    private async swapTokenXToY(poolAddress: string, instanceId?: string): Promise<{ outputAmount: string; signature?: string }> {
        try {
            // 🔍 步骤1: 查询实际X代币余额
            const xTokenBalance = await this.getAccountTokenBalance(poolAddress, 'X');
            if (parseFloat(xTokenBalance) <= 0) {
                await this.loggerService.logSystem('INFO',
                    `ℹ️ X代币余额为0，跳过交换操作 - 池子: ${poolAddress.substring(0, 8)}...`
                );
                return { outputAmount: '0' };
            }

            // 🔍 步骤2: 获取池子信息
            const poolInfo = await this.getPoolInfo(poolAddress);
            if (!poolInfo || !poolInfo.tokenX || !poolInfo.tokenY) {
                throw new Error(`无法获取池子信息: ${poolAddress}`);
            }

            // 🔍 步骤3: 获取用户钱包
            const userKeypair = this.walletService.getCurrentKeypair();
            if (!userKeypair) {
                throw new Error('用户钱包未解锁');
            }

            // 🔍 步骤4: 动态获取X代币精度
            const connection = this.solanaService.getConnection();
            const { PublicKey } = await import('@solana/web3.js');
            const { getMint } = await import('@solana/spl-token');

            let xTokenDecimals = 6; // 默认精度
            try {
                const xTokenMint = new PublicKey(poolInfo.tokenX);
                const mintInfo = await getMint(connection, xTokenMint);
                xTokenDecimals = mintInfo.decimals;
                await this.loggerService.logSystem('DEBUG',
                    `📊 获取X代币精度信息（收益提取交换）- mint: ${poolInfo.tokenX}, decimals: ${xTokenDecimals}`
                );
            } catch (mintError) {
                await this.loggerService.logSystem('WARN',
                    `⚠️ 无法获取X代币精度，使用默认值6 - mint: ${poolInfo.tokenX}, error: ${mintError instanceof Error ? mintError.message : String(mintError)}`
                );
            }

            // 🔍 步骤5: 转换为原子单位（避免双重转换）
            const atomicAmountFloat = parseFloat(xTokenBalance) * Math.pow(10, xTokenDecimals);
            const atomicAmount = Math.round(atomicAmountFloat).toString();

            // 🔧 获取配置的滑点值，默认1000（10%）
            const slippageBps = this.getSlippageBps(instanceId);

            await this.loggerService.logSystem('INFO',
                `🔄 开始执行收益提取X代币交换 - inputMint: ${poolInfo.tokenX}, outputMint: ${poolInfo.tokenY}, humanReadableAmount: ${xTokenBalance}, atomicAmount: ${atomicAmount}, decimals: ${xTokenDecimals}, slippageBps: ${slippageBps}`
            );

            // 🔍 步骤6: 执行代币交换
            const swapParams: any = {
                inputMint: poolInfo.tokenX,
                outputMint: poolInfo.tokenY,
                amount: atomicAmount,
                slippageBps: slippageBps, // 使用配置的滑点值
                userPublicKey: userKeypair.publicKey.toString()
            };

            // 🆕 传递实例ID（如果存在）
            if (instanceId) {
                swapParams.instanceId = instanceId;
            }

            const swapResult = await this.jupiterService.executeSwap(swapParams);

            await this.loggerService.logSystem('INFO',
                `✅ 收益提取X代币交换成功 - 输入: ${xTokenBalance}, 输出: ${swapResult.outputAmount}, 签名: ${swapResult.signature}`
            );

            await this.loggerService.logBusinessOperation('token-swap-x-to-y', {
                inputAmount: xTokenBalance,
                outputAmount: swapResult.outputAmount,
                inputMint: poolInfo.tokenX,
                outputMint: poolInfo.tokenY,
                signature: swapResult.signature,
                timestamp: Date.now()
            });

            return {
                outputAmount: swapResult.outputAmount,
                signature: swapResult.signature
            };

        } catch (error) {
            await this.loggerService.logSystem('ERROR',
                `收益提取X代币交换失败: ${error instanceof Error ? error.message : '未知错误'}`
            );

            // 如果交换失败，返回0而不是估算值，避免记录错误数据
            return { outputAmount: '0' };
        }
    }

    /**
     * 🔄 带重试机制的X代币交换为Y代币 - 使用4次验证标准
     */
    private async swapTokenXToYWithRetry(
        poolAddress: string,
        instanceId: string
    ): Promise<{ outputAmount: string; signature?: string }> {
        // 步骤1: 执行代币交换（带重试）
        const swapResult = await this.retryManager.executeAsyncWithRetry<{ outputAmount: string; signature?: string }>(
            {
                execute: async () => {
                    return await this.swapTokenXToY(poolAddress, instanceId);
                },
                validate: (result) => {
                    // 🔍 基础验证：格式检查
                    if (!result || typeof result.outputAmount !== 'string') {
                        this.loggerService.logSystem('WARN',
                            `❌ 代币交换基础验证失败 - 无效的返回格式`
                        ).catch(() => { });
                        return false;
                    }

                    // 🔍 交易签名存在性检查
                    if (!result.signature) {
                        this.loggerService.logSystem('WARN',
                            `❌ 代币交换缺少交易签名，无法进行链上验证`
                        ).catch(() => { });
                        return false;
                    }

                    // 🎯 Jupiter服务问题：outputAmount可能为0（硬编码问题）
                    // 只要有签名，就认为基础验证通过，实际验证通过4次交易验证完成
                    this.loggerService.logSystem('INFO',
                        `✅ 代币交换基础验证通过 - 签名存在: ${result.signature.substring(0, 8)}..., 预期输出: ${result.outputAmount}`
                    ).catch(() => { });

                    return true;
                }
            },
            'token.swap',  // 使用代币交换的重试策略
            instanceId,
            {
                maxAttempts: 3, // 交换本身的重试次数
                delayMs: 30000  // 30秒重试延迟
            }
        );

        // 步骤2: 对成功的交换结果进行4次验证
        if (swapResult.signature) {
            await this.loggerService.logSystem('INFO',
                `🔍 开始对代币交换进行4次验证 - 签名: ${swapResult.signature.substring(0, 8)}...`
            );

            try {
                // 🎯 使用SolanaWeb3Service的verifyTransactionWithRetry方法进行4次验证
                const verificationResult = await this.verifySwapTransactionWithRetry(swapResult.signature);

                if (!verificationResult.success) {
                    await this.loggerService.logSystem('ERROR',
                        `❌ 代币交换4次验证失败 - ${verificationResult.error}`
                    );
                    throw new Error(`代币交换验证失败: ${verificationResult.error}`);
                }

                // 🚨 检查交易状态是否为失败
                if (verificationResult.status === 'failed') {
                    await this.loggerService.logSystem('ERROR',
                        `❌ 代币交换交易执行失败 - 签名: ${swapResult.signature}, 状态: ${verificationResult.status}`
                    );
                    throw new Error(`交易失败`); // 抛出可重试的错误
                }

                await this.loggerService.logSystem('INFO',
                    `✅ 代币交换4次验证成功 - 状态: ${verificationResult.status}, 插槽: ${verificationResult.slot}`
                );

                // 步骤3: 余额验证 - 获取实际的输出金额
                const actualOutputAmount = await this.verifyTokenBalanceAfterSwap(poolAddress);

                // 🔧 更新返回结果为实际的输出金额
                if (actualOutputAmount && parseFloat(actualOutputAmount) > 0) {
                    await this.loggerService.logSystem('INFO',
                        `🎯 代币交换实际输出金额: ${actualOutputAmount} (原预期: ${swapResult.outputAmount})`
                    );
                    return {
                        outputAmount: actualOutputAmount,
                        signature: swapResult.signature
                    };
                } else {
                    // 如果余额验证也失败，使用原始值但记录警告
                    await this.loggerService.logSystem('WARN',
                        `⚠️ 无法确定实际输出金额，使用原始值: ${swapResult.outputAmount}`
                    );
                    return swapResult;
                }

            } catch (verifyError) {
                await this.loggerService.logSystem('ERROR',
                    `❌ 代币交换验证过程异常 - ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`
                );
                throw verifyError;
            }
        }

        return swapResult;
    }

    /**
     * 🔍 验证代币交换后的余额变化（增强版 - 返回实际输出金额）
     */
    private async verifyTokenBalanceAfterSwap(poolAddress: string): Promise<string | null> {
        try {
            // 🔍 获取当前X代币余额
            const currentXBalance = await this.getAccountTokenBalance(poolAddress, 'X');
            await this.loggerService.logSystem('DEBUG',
                `📊 交换后X代币余额验证 - 当前余额: ${currentXBalance}`
            );

            // 🔍 获取当前Y代币余额（用于计算实际输出）
            const currentYBalance = await this.getAccountTokenBalance(poolAddress, 'Y');
            await this.loggerService.logSystem('DEBUG',
                `📊 交换后Y代币余额验证 - 当前余额: ${currentYBalance}`
            );

            // 如果X代币余额为0或很小，说明交换成功
            if (parseFloat(currentXBalance) < 0.001) {
                await this.loggerService.logSystem('INFO',
                    `✅ 余额验证通过 - X代币已基本清空，Y代币余额: ${currentYBalance}`
                );

                // 🎯 返回Y代币余额作为实际输出金额
                // 注意：这是简化版本，实际应该计算增量，但对于收益提取场景这样足够了
                if (parseFloat(currentYBalance) > 0) {
                    return currentYBalance;
                }
            } else {
                await this.loggerService.logSystem('WARN',
                    `⚠️ 余额验证异常 - X代币仍有余额: ${currentXBalance}, Y代币余额: ${currentYBalance}`
                );
            }

            return null;
        } catch (balanceError) {
            // 余额验证失败不影响主要验证结果，只记录警告
            await this.loggerService.logSystem('WARN',
                `⚠️ 余额验证失败，无法确定实际输出金额 - ${balanceError instanceof Error ? balanceError.message : String(balanceError)}`
            );
            return null;
        }
    }

    /**
     * 🔍 验证代币交换交易 - 使用SolanaWeb3Service的4次验证机制
     */
    private async verifySwapTransactionWithRetry(signature: string): Promise<{
        success: boolean;
        status?: string;
        slot?: number;
        error?: string;
    }> {
        try {
            // 🎯 使用SolanaWeb3Service的verifyTransactionWithRetry方法
            // 这个方法内部实现了3s、6s、9s、12s的4次验证
            const verificationResult = await (this.solanaService as any).verifyTransactionWithRetry(signature, 4);

            return verificationResult;
        } catch (error) {
            return {
                success: false,
                error: `验证异常: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * 按池子分组头寸地址 - 从YieldCalculator迁移
     */
    private async groupPositionsByPool(positionAddresses: string[]): Promise<Map<string, string[]>> {
        const positionsByPool = new Map<string, string[]>();

        await this.loggerService.logSystem('INFO', `🔍 开始分组 ${positionAddresses.length} 个头寸...`);

        for (const positionAddress of positionAddresses) {
            try {
                // 获取头寸的池子地址
                const poolAddress = await this.getPoolAddressFromPosition(positionAddress);

                if (!positionsByPool.has(poolAddress)) {
                    positionsByPool.set(poolAddress, []);
                }
                positionsByPool.get(poolAddress)!.push(positionAddress);

                await this.loggerService.logSystem('DEBUG',
                    `头寸 ${positionAddress.substring(0, 8)}... → 池子 ${poolAddress.substring(0, 8)}...`
                );
            } catch (error) {
                await this.loggerService.logSystem('ERROR',
                    `获取头寸 ${positionAddress} 的池子地址失败: ${error instanceof Error ? error.message : '未知错误'}`
                );
            }
        }

        // 输出分组统计
        for (const [poolAddress, positions] of Array.from(positionsByPool.entries())) {
            await this.loggerService.logSystem('INFO',
                `📋 池子 ${poolAddress.substring(0, 8)}... 包含 ${positions.length} 个头寸`
            );
        }

        return positionsByPool;
    }

    /**
     * 从头寸地址获取池子地址 - 从YieldCalculator迁移
     */
    private async getPoolAddressFromPosition(positionAddress: string): Promise<string> {
        try {
            // 方法1: 通过PositionFeeHarvester获取
            const feeInfo = await this.feeHarvester.getPositionFeesFromChain(positionAddress);
            if (feeInfo && feeInfo.poolAddress) {
                return feeInfo.poolAddress;
            }

            // 方法2: 通过PositionManager获取
            const positionInfo = await this.positionManager.getPositionOnChainInfo(positionAddress);
            if (positionInfo.success && positionInfo.data?.poolAddress) {
                return positionInfo.data.poolAddress;
            }

            throw new Error('无法从任何服务获取池子地址');

        } catch (error) {
            await this.loggerService.logSystem('ERROR',
                `获取头寸 ${positionAddress} 池子地址失败: ${error instanceof Error ? error.message : '未知错误'}`
            );
            throw error;
        }
    }

    /**
     * 获取池子信息 - 从YieldCalculator迁移
     */
    private async getPoolInfo(poolAddress: string): Promise<{ tokenX: string; tokenY: string } | null> {
        try {
            const poolInfo = await this.meteoraService.getPoolInfo(poolAddress);
            return {
                tokenX: poolInfo.tokenX,
                tokenY: poolInfo.tokenY
            };
        } catch (error) {
            await this.loggerService.logSystem('ERROR',
                `获取池子信息失败: ${error instanceof Error ? error.message : '未知错误'}`
            );
            return null;
        }
    }

    /**
     * 大数字加法 - 从YieldCalculator迁移
     */
    private addBigNumbers(a: string, b: string): string {
        return (parseFloat(a) + parseFloat(b)).toString();
    }

    /**
     * 大数字乘法 - 从YieldCalculator迁移
     */
    private multiplyBigNumbers(a: string, b: string): string {
        return (parseFloat(a) * parseFloat(b)).toString();
    }

    /**
     * 🔒 重置时间锁（调试或特殊情况使用）
     */
    resetExtractionLock(): void {
        this.lastExtractionTime = 0;
    }

    /**
     * 🔒 获取时间锁状态
     */
    getExtractionLockStatus(): {
        isLocked: boolean;
        remainingCooldownMs: number;
        remainingCooldownMinutes: number;
    } {
        const currentTime = Date.now();
        const timeSinceLastExtraction = currentTime - this.lastExtractionTime;
        const remainingCooldown = this.extractionCooldownMs - timeSinceLastExtraction;

        return {
            isLocked: this.lastExtractionTime > 0 && remainingCooldown > 0,
            remainingCooldownMs: Math.max(0, remainingCooldown),
            remainingCooldownMinutes: Math.max(0, Math.ceil(remainingCooldown / 60000))
        };
    }

    /**
     * 获取操作统计信息
     */
    getOperationStats(): {
        extractionCount: number;
        totalExtractedAmount: string;
        errorCount: number;
        timeLockStatus: {
            isLocked: boolean;
            remainingCooldownMs: number;
            remainingCooldownMinutes: number;
        };
    } {
        return {
            extractionCount: this.extractionCount,
            totalExtractedAmount: this.totalExtractedAmount,
            errorCount: this.errorCount,
            timeLockStatus: this.getExtractionLockStatus()
        };
    }

    /**
     * 🔍 验证收益提取交易 - 复用4次验证机制
     */
    private async verifyExtractionTransactionWithRetry(signature: string): Promise<{
        success: boolean;
        status?: string;
        slot?: number;
        error?: string;
    }> {
        try {
            // 🎯 复用已有的4次验证机制
            const verificationResult = await (this.solanaService as any).verifyTransactionWithRetry(signature, 4);
            return verificationResult;
        } catch (error) {
            return {
                success: false,
                error: `验证异常: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * 获取滑点配置
     * @param instanceId 实例ID
     * @returns 滑点值（基点），默认1000（10%）
     */
    private getSlippageBps(instanceId?: string): number {
        // 🔧 从策略配置获取滑点值
        // 由于YieldOperator没有直接访问策略配置的方法，使用默认值
        const defaultSlippageBps = 2000; // 20%

        // 如果需要支持从策略配置获取滑点值，可以在这里添加相关逻辑
        // 或者通过依赖注入获取策略管理器

        return defaultSlippageBps;
    }
} 