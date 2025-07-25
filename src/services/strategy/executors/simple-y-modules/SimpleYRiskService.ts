/**
 * 简单Y风险服务模块
 * 
 * 职责：
 * - 智能止损分析和执行
 * - 代币交换操作
 * - 风险事件广播
 * - 紧急情况处理
 */

import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { TYPES, IPositionManager, ILoggerService, IGasService, IEventBus, IJupiterService, IMeteoraService, ISolanaWeb3Service, IWalletService } from '../../../../types/interfaces';
import { ISimpleYRiskService, SimpleYModuleContext } from './types';
import { SynchronousRetryMixin } from '../mixins/SynchronousRetryMixin';

@injectable()
export class SimpleYRiskService extends SynchronousRetryMixin implements ISimpleYRiskService {
    
    // 止损分析缓存
    private stopLossAnalysisCache: Map<string, {
        result: any;
        timestamp: number;
        cycleId: number;
    }> = new Map();
    
    // 🔧 新增：策略日志器缓存，避免重复创建
    private strategyLoggerCache = new Map<string, any>();
    
    // 🆕 交换操作锁定机制 - 防止并发交换
    private swapOperationLocks: Map<string, boolean> = new Map();
    
    // 交换操作状态跟踪
    private swapOperationStates: Map<string, {
        inProgress: boolean;
        lastAttempt: number;
        retryCount: number;
    }> = new Map();
    
    constructor(
        @inject(TYPES.PositionManager) private positionManager: IPositionManager,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.GasService) private gasService: IGasService,
        @inject(TYPES.EventBus) private eventBus: IEventBus,
        @inject(TYPES.JupiterService) private jupiterService: IJupiterService,
        @inject(TYPES.MeteoraService) private meteoraService: IMeteoraService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        @inject(TYPES.WalletService) private walletService: IWalletService
    ) {
        super(); // 调用父类的构造函数
    }

    /**
     * 🔧 新增：获取缓存的策略日志器，避免重复创建
     */
    private getCachedLogger(instanceId: string): any {
        if (!this.strategyLoggerCache.has(instanceId)) {
            const logger = this.loggerService.createStrategyLogger(instanceId);
            this.strategyLoggerCache.set(instanceId, logger);
        }
        return this.strategyLoggerCache.get(instanceId);
    }

    /**
     * 执行止损操作
     */
    async executeStopLoss(context: SimpleYModuleContext): Promise<{
        success: boolean;
        signature?: string;
        error?: string;
    }> {
        const logger = this.getCachedLogger(context.instanceId);
        
        try {
            if (!context.state.positionAddress) {
                return {
                    success: false,
                    error: '没有有效的头寸地址'
                };
            }

            await logger.logOperation('🛑 开始执行简单Y完全止损', {
                instanceId: context.instanceId,
                positionAddress: context.state.positionAddress
            });

            // 🔥 步骤1: 智能安全头寸关闭 - 使用与连锁头寸策略一致的错误处理
            await this.gasService.optimizeGasForOperation('stop_loss');
            
            const closeResult = await this.closePositionSafely(context, context.state.positionAddress!, '简单Y头寸');
            
            if (!closeResult.success && !closeResult.alreadyClosed) {
                return {
                    success: false,
                    error: `头寸关闭失败: ${closeResult.error}`
                };
            }

            await logger.logOperation('✅ 简单Y头寸关闭完成', {
                positionAddress: context.state.positionAddress?.substring(0, 8) + '...',
                signature: closeResult.signature,
                reason: 'stop_loss'
            });

            // 🔥 步骤2: 查询当前账户X代币余额（从工具服务获取）
            await logger.logOperation('🔍 开始查询账户X代币余额', {
                poolAddress: context.config.poolAddress,
                reason: 'stop_loss_token_swap'
            });

            // 获取工具服务实例
            const { container } = await import('tsyringe');
            const utilityService = container.resolve<any>('SimpleYUtilityService');
            const xTokenBalance = await utilityService.getAccountXTokenBalance(context);

            if (parseFloat(xTokenBalance) > 0) {
                await logger.logOperation('💰 检测到X代币余额，准备卖出', {
                    xTokenAmount: xTokenBalance,
                    poolAddress: context.config.poolAddress,
                    reason: 'stop_loss_token_cleanup'
                });

                // 🔥 步骤3: 卖出所有X代币为Y代币（使用专门的止损代币交换重试）
                try {
                    const swapResult = await this.executeTokenSwapWithCustomRetry(context, xTokenBalance, 'STOP_LOSS');

                    await logger.logOperation('✅ 简单Y止损-X代币卖出成功', {
                        inputAmount: xTokenBalance,
                        outputAmount: swapResult.outputAmount,
                        signature: swapResult.signature,
                        poolAddress: context.config.poolAddress,
                        context: 'stop_loss_cleanup'
                    });
                } catch (swapError) {
                    // 🚨 代币交换失败不应阻止止损完成，但要记录错误
                    await logger.logError(`❌ 简单Y止损-X代币卖出失败，但止损仍视为成功: ${swapError instanceof Error ? swapError.message : String(swapError)}`);
                }
            } else {
                await logger.logOperation('ℹ️ 未检测到X代币余额，跳过卖出操作', {
                    xTokenBalance: xTokenBalance,
                    reason: 'no_x_tokens_to_swap'
                });
            }

            // 🔥 步骤4: 更新状态
            context.state.positionAddress = null;
            context.state.positionRange = null;
            context.state.phase = 'STOPPED';
            context.state.isActive = false;
            context.state.stoppingReason = 'STOP_LOSS';

            await logger.logOperation('✅ 简单Y完全止损执行完成', {
                instanceId: context.instanceId,
                signature: closeResult.signature,
                phase: context.state.phase,
                reason: 'smart_stop_loss_triggered',
                xTokenSwapped: parseFloat(xTokenBalance) > 0,
                finalXTokenBalance: '0'
            });

            return {
                success: true,
                ...(closeResult.signature && { signature: closeResult.signature })
            };

        } catch (error) {
            await logger.logError(`简单Y止损操作执行失败: ${error instanceof Error ? error.message : String(error)}`);
            
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 🆕 卖出X代币为Y代币 - 止损专用（带锁定机制）
     */
    async swapAllXTokensToY(context: SimpleYModuleContext, xTokenAmount: string): Promise<{
        outputAmount: string;
        signature: string;
    }> {
        return await this.executeSwapWithLock(context, () => this.swapXTokensToYCore(context, xTokenAmount, 'STOP_LOSS'), 'STOP_LOSS');
    }

    /**
     * 🆕 卖出X代币为Y代币 - 头寸重建专用（带重试机制）
     */
    async swapXTokensForRecreation(context: SimpleYModuleContext, xTokenAmount: string): Promise<{
        outputAmount: string;
        signature: string;
    }> {
        return await this.executeSwapWithLock(context, () => this.executeTokenSwapWithCustomRetry(context, xTokenAmount, 'POSITION_RECREATION'), 'POSITION_RECREATION');
    }

    /**
     * 🆕 智能安全头寸关闭 - 与连锁头寸策略保持一致的错误处理
     */
    private async closePositionSafely(
        context: SimpleYModuleContext, 
        positionAddress: string, 
        positionName: string
    ): Promise<{
        success: boolean;
        alreadyClosed?: boolean;
        signature?: string;
        error?: string;
    }> {
        const logger = this.getCachedLogger(context.instanceId);

        try {
            await logger.logOperation(`🛑 开始关闭${positionName}`, {
                address: positionAddress.substring(0, 8) + '...',
                instanceId: context.instanceId
            });

            // 🔧 使用统一的重试机制包装
            const closeResult = await this.executeAsyncClosePositionWithRetry(
                async () => {
                    const result = await this.positionManager.closePosition(positionAddress);
                    if (!result.success) {
                        throw new Error(`${positionName}关闭失败: ${result.error || '未知错误'}`);
                    }
                    return result;
                },
                context.instanceId,
                {
                    maxAttempts: 3,
                    retryableErrors: [
                        '头寸关闭失败', '交易验证超时', '交易失败',
                        'RPC_ERROR', 'NETWORK_ERROR', 'SLIPPAGE_ERROR',
                        'failed to get info about account'
                    ],
                    delayMs: 15000 // 15秒间隔
                }
            );

            await logger.logOperation(`✅ ${positionName}关闭成功`, {
                positionAddress: positionAddress.substring(0, 8) + '...',
                signature: closeResult.signature,
                instanceId: context.instanceId
            });

            return {
                success: true,
                ...(closeResult.signature && { signature: closeResult.signature })
            };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);

            // 🔥 智能判断：头寸不存在 = 已经关闭成功（与连锁头寸策略一致）
            if (errorMsg.includes('头寸不存在') ||
                errorMsg.includes('不属于当前用户') ||
                errorMsg.includes('position does not exist') ||
                errorMsg.includes('Position not found')) {
                
                await logger.logOperation(`ℹ️ ${positionName}已经不存在，视为已关闭`, {
                    address: positionAddress.substring(0, 8) + '...',
                    reason: 'position_not_exists',
                    instanceId: context.instanceId
                });
                
                return { 
                    success: true, 
                    alreadyClosed: true 
                };
            }

            // 真正的失败
            await logger.logError(`❌ ${positionName}关闭失败: ${errorMsg}`);
            return { 
                success: false, 
                error: errorMsg 
            };
        }
    }

    /**
     * 🆕 执行代币交换（带锁定机制） - 防止并发操作
     */
    private async executeSwapWithLock<T>(
        context: SimpleYModuleContext,
        operation: () => Promise<T>,
        operationType: 'STOP_LOSS' | 'POSITION_RECREATION'
    ): Promise<T> {
        const logger = this.getCachedLogger(context.instanceId);

        if (this.swapOperationLocks.get(context.instanceId)) {
            const errorMsg = `简单Y代币交换操作正在进行中，请稍后重试 (当前操作类型: ${operationType})`;
            await logger.logError(errorMsg);
            throw new Error(errorMsg);
        }

        this.swapOperationLocks.set(context.instanceId, true);
        try {
            await logger.logOperation('🔒 简单Y代币交换操作加锁', {
                operationType,
                instanceId: context.instanceId,
                lockStatus: 'acquired'
            });
            return await operation();
        } finally {
            this.swapOperationLocks.delete(context.instanceId);
            await logger.logOperation('🔓 简单Y代币交换操作解锁', {
                operationType,
                instanceId: context.instanceId,
                lockStatus: 'released'
            });
        }
    }

    /**
     * 🆕 执行代币交换（带重试机制） - 专用于头寸重建和止损的自定义重试逻辑
     */
    private async executeTokenSwapWithCustomRetry(context: SimpleYModuleContext, xTokenAmount: string, swapContext: 'STOP_LOSS' | 'POSITION_RECREATION'): Promise<{
        outputAmount: string;
        signature: string;
    }> {
        const logger = this.getCachedLogger(context.instanceId);

        const maxRetries = 4;
        const retryDelay = 10000; // 10秒

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // 🔧 修复：增加try-catch保护日志记录
                try {
                    await logger.logOperation(`🔄 第${attempt}次尝试简单Y${swapContext === 'STOP_LOSS' ? '止损' : '头寸重建'}代币交换`, {
                        attempt: attempt,
                        maxRetries: maxRetries,
                        xTokenAmount: xTokenAmount,
                        context: swapContext
                    });
                } catch (logError) {
                    console.log(`[简单Y-重试日志失败] 第${attempt}次尝试 ${swapContext}`, { error: logError });
                }

                const result = await this.swapXTokensToYCore(context, xTokenAmount, swapContext);

                // 🔧 修复：增加try-catch保护日志记录
                try {
                    await logger.logOperation(`✅ 第${attempt}次简单Y${swapContext === 'STOP_LOSS' ? '止损' : '头寸重建'}代币交换成功`, {
                        attempt: attempt,
                        outputAmount: result.outputAmount,
                        signature: result.signature,
                        context: swapContext
                    });
                } catch (logError) {
                    console.log(`[简单Y-成功日志失败] 第${attempt}次成功 ${swapContext}`, { result, error: logError });
                }

                return result;

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                
                // 🔧 修复：增加try-catch保护日志记录，防止日志失败中断重试
                try {
                    await logger.logError(`❌ 第${attempt}次简单Y${swapContext === 'STOP_LOSS' ? '止损' : '头寸重建'}代币交换失败: ${errorMsg}`);
                } catch (logError) {
                    console.error(`[简单Y-错误日志失败] 第${attempt}次失败 ${swapContext}`, { originalError: errorMsg, logError });
                }

                if (attempt === maxRetries) {
                    // 🔧 修复：增加try-catch保护最终失败日志
                    try {
                        await logger.logError(`简单Y${swapContext === 'STOP_LOSS' ? '止损' : '头寸重建'}代币交换最终失败，已重试${maxRetries}次`);
                    } catch (logError) {
                        console.error(`[简单Y-最终失败日志失败] ${swapContext}`, { originalError: errorMsg, logError });
                    }
                    throw error;
                }

                // 🔧 修复：增加try-catch保护重试日志
                try {
                    await logger.logOperation(`⏳ ${retryDelay / 1000}秒后进行第${attempt + 1}次重试`, {
                        nextAttempt: attempt + 1,
                        delayMs: retryDelay,
                        context: swapContext
                    });
                } catch (logError) {
                    console.log(`[简单Y-重试等待日志失败] 第${attempt}次等待重试 ${swapContext}`, { delayMs: retryDelay, logError });
                }

                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        throw new Error(`简单Y${swapContext === 'STOP_LOSS' ? '止损' : '头寸重建'}代币交换失败：已达到最大重试次数`);
    }

    /**
     * 执行代币交换 - 保持接口兼容性
     */
    async swapTokens(context: SimpleYModuleContext, amount: string, swapType: 'STOP_LOSS' | 'RECREATION'): Promise<{
        success: boolean;
        outputAmount?: string;
        signature?: string;
        error?: string;
    }> {
        try {
            if (swapType === 'STOP_LOSS') {
                const result = await this.swapAllXTokensToY(context, amount);
                return {
                    success: true,
                    outputAmount: result.outputAmount,
                    signature: result.signature
                };
            } else {
                const result = await this.swapXTokensForRecreation(context, amount);
                return {
                    success: true,
                    outputAmount: result.outputAmount,
                    signature: result.signature
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 🆕 代币交换核心逻辑 - 不含操作类型特定的日志和标识（从连锁头寸策略完整复制）
     */
    private async swapXTokensToYCore(
        context: SimpleYModuleContext,
        xTokenAmount: string,
        swapContext: 'STOP_LOSS' | 'POSITION_RECREATION'
    ): Promise<{
        outputAmount: string;
        signature: string;
    }> {
        const logger = this.getCachedLogger(context.instanceId);

        try {
            // 获取池子信息以获取代币mint地址
            const { container } = await import('tsyringe');
            const dlmmMonitor = container.resolve<any>('DLMMMonitorService');
            const poolInfo = await dlmmMonitor.getPoolInfo(context.config.poolAddress);
            if (!poolInfo || !poolInfo.tokenX || !poolInfo.tokenY) {
                throw new Error(`无法获取池子信息: ${context.config.poolAddress}`);
            }

            // 获取用户钱包
            const walletService = container.resolve<any>('WalletService');
            const userKeypair = walletService.getCurrentKeypair();
            if (!userKeypair) {
                throw new Error('用户钱包未解锁');
            }

            // 🔧 修复：动态获取X代币精度
            const solanaService = container.resolve<any>('SolanaWeb3Service');
            const connection = solanaService.getConnection();
            const { PublicKey } = await import('@solana/web3.js');
            const { getMint } = await import('@solana/spl-token');

            let xTokenDecimals = 6; // 默认精度
            try {
                const xTokenMint = new PublicKey(poolInfo.tokenX);
                const mintInfo = await getMint(connection, xTokenMint);
                xTokenDecimals = mintInfo.decimals;
            } catch (mintError) {
                // 使用默认精度，不记录日志避免冗余
            }

            // 🔧 获取配置的滑点值，默认2000（20%）
            const slippageBps = context.config.slippageBps || 2000;

            // 🔧 修复：使用Math.round避免浮点数精度问题，确保原子单位是整数
            const atomicAmountFloat = parseFloat(xTokenAmount) * Math.pow(10, xTokenDecimals);
            const atomicAmount = Math.round(atomicAmountFloat).toString();

            await logger.logOperation(`🔄 开始执行简单Y-${swapContext === 'STOP_LOSS' ? '止损' : '头寸重建'}X代币交换`, {
                inputMint: poolInfo.tokenX,
                outputMint: poolInfo.tokenY,
                humanReadableAmount: xTokenAmount,
                atomicAmountFloat: atomicAmountFloat,
                atomicAmount: atomicAmount,
                decimals: xTokenDecimals,
                slippageBps: slippageBps, // 使用配置的滑点值
                userPublicKey: userKeypair.publicKey.toString(),
                context: swapContext
            });

            // 调用Jupiter进行代币交换
            const swapResult = await this.jupiterService.executeSwap({
                inputMint: poolInfo.tokenX,
                outputMint: poolInfo.tokenY,
                amount: atomicAmount, // 🔧 修复：使用四舍五入后的整数原子单位
                slippageBps: slippageBps, // 使用配置的滑点值
                userPublicKey: userKeypair.publicKey.toString(),
                instanceId: context.instanceId // 🔑 传递实例ID用于日志记录
            });

            // 🚨 验证交易状态 - 与连锁头寸策略保持一致
            const verificationResult = await (solanaService as any).verifyTransactionWithRetry(swapResult.signature, 4);
            if (verificationResult.status === 'failed') {
                await logger.logError(`❌ 简单Y-${swapContext === 'STOP_LOSS' ? '止损' : '头寸重建'}代币交换交易执行失败 - 签名: ${swapResult.signature}, 状态: ${verificationResult.status}`);
                throw new Error(`交易失败`); // 抛出可重试的错误
            }

            await logger.logOperation(`✅ 简单Y-${swapContext === 'STOP_LOSS' ? '止损' : '头寸重建'}X代币交换成功`, {
                inputAmount: xTokenAmount,
                inputAtomicAmount: atomicAmount,
                inputDecimals: xTokenDecimals,
                outputAmount: swapResult.outputAmount,
                signature: swapResult.signature,
                inputMint: poolInfo.tokenX,
                outputMint: poolInfo.tokenY,
                context: swapContext
            });

            return {
                outputAmount: swapResult.outputAmount,
                signature: swapResult.signature
            };

        } catch (error) {
            await logger.logError(`简单Y-${swapContext === 'STOP_LOSS' ? '止损' : '头寸重建'}X代币交换失败: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * 🆕 广播风险事件
     */
    async broadcastRiskEvent(context: SimpleYModuleContext, event: any): Promise<void> {
        try {
            await this.eventBus.publish(event.event, event);
        } catch (error) {
            // 广播失败不应影响主要逻辑
            const logger = this.getCachedLogger(context.instanceId);
            await logger.logError(`广播风险事件失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // 私有辅助方法
    private getCachedStopLossAnalysis(instanceId: string): any | null {
        const cached = this.stopLossAnalysisCache.get(instanceId);
        if (!cached) return null;
        
        // 检查缓存是否过期（5分钟）
        const cacheAge = Date.now() - cached.timestamp;
        if (cacheAge > 5 * 60 * 1000) {
            this.stopLossAnalysisCache.delete(instanceId);
            return null;
        }
        
        return cached;
    }

    private cacheStopLossAnalysis(instanceId: string, result: any): void {
        // 获取当前监控周期ID（如果可用）
        const cycleId = Date.now(); // 简化实现，实际应该从监控服务获取
        
        this.stopLossAnalysisCache.set(instanceId, {
            result,
            timestamp: Date.now(),
            cycleId
        });
    }

    /**
     * 🆕 获取池子代币信息
     */
    private async getPoolTokenInfo(context: SimpleYModuleContext): Promise<{
        tokenX: string;
        tokenY: string;
    } | null> {
        try {
            const { container } = await import('tsyringe');
            const dlmmMonitor = container.resolve<any>('DLMMMonitorService');
            const poolInfo = await dlmmMonitor.getPoolInfo(context.config.poolAddress);
            
            if (!poolInfo || !poolInfo.tokenX || !poolInfo.tokenY) {
                return null;
            }
            
            return {
                tokenX: poolInfo.tokenX,
                tokenY: poolInfo.tokenY
            };
        } catch (error) {
            return null;
        }
    }
} 