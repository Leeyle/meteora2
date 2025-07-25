/**
 * 简单Y头寸服务模块
 * 
 * 职责：
 * - Y头寸创建和销毁
 * - 头寸状态跟踪
 * - 头寸重建逻辑
 * - bin范围计算
 */

import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { TYPES, IPositionManager, IDLMMMonitorService, ILoggerService, IEventBus, IYPositionManager } from '../../../../types/interfaces';
import { ISimpleYPositionService, SimpleYModuleContext } from './types';
import { PositionRecreationModule, PositionRecreationConfig, RecreationCheckParams, RecreationDecision } from '../../../modules/PositionRecreationModule';
import { MarketData } from '../../../modules/SmartStopLossModule';
import { SynchronousRetryMixin } from '../mixins/SynchronousRetryMixin';

@injectable()
export class SimpleYPositionService extends SynchronousRetryMixin implements ISimpleYPositionService {
    
    // 🆕 头寸重建模块管理
    private positionRecreationModules: Map<string, PositionRecreationModule> = new Map();
    
    // 🔧 新增：策略日志器缓存，避免重复创建
    private strategyLoggerCache = new Map<string, any>();
    
    // 🔒 新增：重建操作锁定机制，防止并发重建
    private recreationOperationLocks: Map<string, boolean> = new Map();
    
    // 🔒 新增：锁定时间记录，用于超时保护
    private recreationLockTimestamps: Map<string, number> = new Map();
    
    constructor(
        @inject(TYPES.PositionManager) private positionManager: IPositionManager,
        @inject(TYPES.DLMMMonitorService) private dlmmMonitor: IDLMMMonitorService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.EventBus) private eventBus: IEventBus,
        @inject(TYPES.YPositionManager) private yPositionManager: IYPositionManager
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
     * 🔧 修复：创建简单Y头寸，使用缓存的日志器
     */
    async createPosition(context: SimpleYModuleContext): Promise<{
        success: boolean;
        positionAddress?: string;
        error?: string;
    }> {
        const logger = this.getCachedLogger(context.instanceId);
        
        try {
            await logger.logOperation('🎯 开始创建简单Y头寸 (使用构造函数注入的YPositionManager)', {
                poolAddress: context.config.poolAddress,
                amount: context.config.positionAmount,
                binRange: context.config.binRange,
                instanceId: context.instanceId
            });

            // 🔧 计算Y头寸的bin范围
            const binRangeData = await this.calculatePositionRange(context);

            // 🔑 关键修复：使用构造函数注入的YPositionManager实例
            if (!this.yPositionManager) {
                throw new Error('YPositionManager服务不可用');
            }

            // 创建Y头寸参数（适配YPositionManager接口）
            const createParams = {
                poolAddress: context.config.poolAddress,
                lowerBinId: binRangeData.positionLowerBin,
                upperBinId: binRangeData.positionUpperBin,
                amount: context.config.positionAmount.toString(),
                tokenMint: '',  // Y头寸将使用池的tokenY
                binRange: context.config.binRange,
                activeBin: binRangeData.activeBin,
                slippageBps: context.config.slippageBps || 800,
                strategy: 'simple-y',
                password: '' // 策略执行使用解锁的钱包
            };

            // 🔑 调用YPositionManager.createYPosition() - 单Y头寸创建，无添加流动性操作
            const result = await this.executeAsyncCreatePositionWithRetry(
                async () => {
                    const createResult = await this.yPositionManager.createYPosition(createParams);
                    if (!createResult.success) {
                        throw new Error(`简单Y头寸创建失败: ${createResult.error || '未知错误'}`);
                    }
                    return createResult;
                },
                context.instanceId,
                {
                    maxAttempts: 3,
                    retryableErrors: [
                        'Y头寸创建失败', '交易验证超时', '交易失败', 
                        'RPC_ERROR', 'NETWORK_ERROR', 'SLIPPAGE_ERROR',
                        'failed to get info about account'
                    ],
                    delayMs: 15000 // 15秒间隔，与连锁头寸策略保持一致
                }
            );

            // 更新上下文状态
            context.state.positionAddress = result.positionAddress || null;
            context.state.positionRange = [binRangeData.positionLowerBin, binRangeData.positionUpperBin];

            await logger.logOperation('✅ 简单Y头寸创建成功', {
                positionAddress: result.positionAddress?.substring(0, 8) + '...',
                signature: result.signature,
                gasUsed: result.gasUsed,
                binRange: `[${binRangeData.positionLowerBin}, ${binRangeData.positionUpperBin}]`,
                method: 'YPositionManager.createYPosition'
            });

            return {
                success: true,
                ...(result.positionAddress && { positionAddress: result.positionAddress })
            };

        } catch (error) {
            await logger.logError(`简单Y头寸创建失败: ${error instanceof Error ? error.message : String(error)}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 🆕 初始化头寸重建模块 - 从连锁头寸策略完整复制
     */
    async initializePositionRecreation(context: SimpleYModuleContext): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);
        
        try {
            // 创建头寸重建模块实例 - 传递完整的配置参数
            const recreationConfig: Partial<PositionRecreationConfig> = {
                outOfRangeTimeout: context.config.outOfRangeTimeout,
                enablePriceCheck: true,
                // 🔧 修复：与连锁头寸策略保持一致的默认配置
                enableMarketOpportunityRecreation: context.config.positionRecreation?.enableMarketOpportunityRecreation ?? true,  // 方法2：默认启用
                enableLossRecoveryRecreation: context.config.positionRecreation?.enableLossRecoveryRecreation ?? false,         // 方法3：默认禁用  
                enableDynamicProfitRecreation: context.config.positionRecreation?.enableDynamicProfitRecreation ?? false        // 方法4：默认禁用
            };

            // 🔧 修复：传递用户的具体参数配置（类型兼容处理）
            if (context.config.positionRecreation?.marketOpportunity) {
                recreationConfig.marketOpportunity = {
                    positionThreshold: context.config.positionRecreation.marketOpportunity.positionThreshold ?? 70,
                    profitThreshold: context.config.positionRecreation.marketOpportunity.profitThreshold ?? 1
                };
            }
            
            if (context.config.positionRecreation?.lossRecovery) {
                recreationConfig.lossRecovery = {
                    markPositionThreshold: context.config.positionRecreation.lossRecovery.markPositionThreshold ?? 65,
                    markLossThreshold: context.config.positionRecreation.lossRecovery.markLossThreshold ?? 0.5,
                    triggerPositionThreshold: context.config.positionRecreation.lossRecovery.triggerPositionThreshold ?? 70,
                    triggerProfitThreshold: context.config.positionRecreation.lossRecovery.triggerProfitThreshold ?? 0.5
                };
            }
            
            if (context.config.positionRecreation?.dynamicProfitRecreation) {
                recreationConfig.dynamicProfitRecreation = {
                    positionThreshold: context.config.positionRecreation.dynamicProfitRecreation.positionThreshold ?? 70,
                    benchmarkTier1Max: context.config.positionRecreation.dynamicProfitRecreation.benchmarkTier1Max ?? 0.5,
                    benchmarkTier2Max: context.config.positionRecreation.dynamicProfitRecreation.benchmarkTier2Max ?? 1.5,
                    benchmarkTier3Max: context.config.positionRecreation.dynamicProfitRecreation.benchmarkTier3Max ?? 3.0,
                    benchmarkTier4Max: context.config.positionRecreation.dynamicProfitRecreation.benchmarkTier4Max ?? 999,
                    profitThresholdTier1: context.config.positionRecreation.dynamicProfitRecreation.profitThresholdTier1 ?? 0.5,
                    profitThresholdTier2: context.config.positionRecreation.dynamicProfitRecreation.profitThresholdTier2 ?? 1.5,
                    profitThresholdTier3: context.config.positionRecreation.dynamicProfitRecreation.profitThresholdTier3 ?? 3.0,
                    profitThresholdTier4: context.config.positionRecreation.dynamicProfitRecreation.profitThresholdTier4 ?? 5.0
                };
            }

            // 只有当值存在时才添加到配置中
            if (context.config.maxPriceForRecreation !== undefined) {
                recreationConfig.maxPriceForRecreation = context.config.maxPriceForRecreation;
            }
            if (context.config.minPriceForRecreation !== undefined) {
                recreationConfig.minPriceForRecreation = context.config.minPriceForRecreation;
            }

            const positionRecreationModule = new PositionRecreationModule(recreationConfig);

            this.positionRecreationModules.set(context.instanceId, positionRecreationModule);

            await logger.logMonitoring('🏗️ 简单Y头寸重建模块初始化完成', {
                instanceId: context.instanceId,
                outOfRangeTimeout: context.config.outOfRangeTimeout,
                enabledFeatures: {
                    marketOpportunity: recreationConfig.enableMarketOpportunityRecreation,
                    lossRecovery: recreationConfig.enableLossRecoveryRecreation,
                    dynamicProfit: recreationConfig.enableDynamicProfitRecreation
                },
                configParameters: {
                    marketOpportunity: recreationConfig.marketOpportunity,
                    lossRecovery: recreationConfig.lossRecovery,
                    dynamicProfitRecreation: recreationConfig.dynamicProfitRecreation
                }
            });

        } catch (error) {
            await logger.logError(`简单Y头寸重建模块初始化失败: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * 🆕 检查是否需要重建头寸 - 从连锁头寸策略适配
     */
    async shouldRecreatePosition(context: SimpleYModuleContext, marketData: MarketData): Promise<RecreationDecision> {
        const logger = this.getCachedLogger(context.instanceId);
        
        // 🔧 修复：只在模块不存在时才初始化，保持状态持久性
        let recreationModule = this.positionRecreationModules.get(context.instanceId);
        
        if (!recreationModule) {
            await logger.logMonitoring('🔧 初始化头寸重建模块（首次或重建后）', {
                instanceId: context.instanceId,
                reason: 'module_not_exists'
            });
            
            // 初始化模块
            await this.initializePositionRecreation(context);
            recreationModule = this.positionRecreationModules.get(context.instanceId);
            
            if (!recreationModule) {
                throw new Error('头寸重建模块初始化失败');
            }
        } else {
            // 🔧 模块已存在，记录状态持续信息
            await logger.logMonitoring('🔄 使用现有头寸重建模块（状态持续）', {
                instanceId: context.instanceId,
                reason: 'maintain_state_continuity'
            });
        }

        // 准备重建检查参数
        const strategyConfig: any = {
            poolAddress: context.config.poolAddress,
            outOfRangeTimeout: context.config.outOfRangeTimeout,
            monitoringInterval: context.config.monitoringInterval
        };

        if (context.config.maxPriceForRecreation !== undefined) {
            strategyConfig.maxPriceForRecreation = context.config.maxPriceForRecreation;
        }

        if (context.config.minPriceForRecreation !== undefined) {
            strategyConfig.minPriceForRecreation = context.config.minPriceForRecreation;
        }

        const recreationParams: RecreationCheckParams = {
            marketData: marketData,
            position1Address: context.state.positionAddress || null, // 确保类型正确
            position2Address: null, // 简单Y没有第二个头寸
            positionRange: context.state.positionRange || [0, 0], // 提供默认值
            outOfRangeStartTime: null, // 模块内部管理状态
            outOfRangeDirection: null, // 模块内部管理状态
            isInRange: context.state.isInRange,
            strategyConfig: strategyConfig,
            instanceId: context.instanceId,
            phase: context.state.phase
        };

        return await recreationModule.shouldRecreatePosition(recreationParams);
    }

    /**
     * 🆕 执行头寸重建 - 从连锁头寸策略适配
     */
    async recreatePosition(context: SimpleYModuleContext, instanceAwareServiceFactory?: any): Promise<{
        success: boolean;
        newPositionAddress?: string;
        error?: string;
    }> {
        const logger = this.getCachedLogger(context.instanceId);
        
        // 🔒 检查重建操作锁定状态，防止并发重建
        const isLocked = this.recreationOperationLocks.get(context.instanceId);
        const lockTimestamp = this.recreationLockTimestamps.get(context.instanceId);
        const currentTime = Date.now();
        const lockTimeout = 5 * 60 * 1000; // 5分钟超时
        
        if (isLocked) {
            if (lockTimestamp && (currentTime - lockTimestamp) > lockTimeout) {
                // 🕐 锁定超时，强制释放
                await logger.logError(`简单Y头寸重建锁定超时（${lockTimeout/60000}分钟），强制释放锁定`, {
                    instanceId: context.instanceId,
                    lockDuration: Math.round((currentTime - lockTimestamp) / 1000),
                    action: 'force_unlock'
                });
                
                this.recreationOperationLocks.delete(context.instanceId);
                this.recreationLockTimestamps.delete(context.instanceId);
            } else {
                // 🔒 仍在锁定期内
                const lockDuration = lockTimestamp ? Math.round((currentTime - lockTimestamp) / 1000) : 0;
                const errorMsg = `简单Y头寸重建操作正在进行中，跳过重复执行 (实例: ${context.instanceId}, 锁定时长: ${lockDuration}秒)`;
                await logger.logError(errorMsg);
                return {
                    success: false,
                    error: errorMsg
                };
            }
        }

        // 🔒 设置重建操作锁定和时间戳
        this.recreationOperationLocks.set(context.instanceId, true);
        this.recreationLockTimestamps.set(context.instanceId, currentTime);
        
        try {
            // 🔍 步骤0: 获取当前头寸地址
            const currentPositionAddress = context.state.positionAddress;
            
            // 🔄 用于控制是否继续执行重建的标志变量
            let shouldContinueRecreation = true;
            let stopResult: { success: false; error: string } | null = null;

            await logger.logOperation('🔍 简单Y头寸重建开始', {
                currentPositionAddress: currentPositionAddress?.substring(0, 8) + '...' || 'null',
                instanceId: context.instanceId,
                reason: 'position_recreation_start'
            });

            context.state.phase = 'STOPPING';
            context.state.stoppingReason = 'POSITION_RECREATION';

            await logger.logOperation('🚨 简单Y头寸重建核心流程开始', {
                positionAddress: currentPositionAddress,
                reason: 'position_recreation_execution'
            });

            // 🔧 关键修复：获取最新的头寸地址，避免使用缓存的旧状态
            // const currentPositionAddress = context.state.positionAddress; // This line is removed as per the new_code
            
            await logger.logOperation('🔍 当前头寸状态检查', {
                positionAddress: currentPositionAddress?.substring(0, 8) + '...' || 'null',
                positionRange: context.state.positionRange,
                phase: context.state.phase,
                instanceId: context.instanceId
            });

            // 🔥 步骤1: 智能安全关闭现有简单Y头寸（使用高级错误处理）
            if (currentPositionAddress) {
                const closeResult = await this.closePositionSafely(context, currentPositionAddress, '简单Y头寸');
                
                if (!closeResult.success && !closeResult.alreadyClosed) {
                    throw new Error(`简单Y头寸关闭失败: ${closeResult.error || '未知错误'}`);
                }

                await logger.logOperation('🛑 简单Y头寸关闭完成（重建）', {
                    positionAddress: currentPositionAddress?.substring(0, 8) + '...',
                    ...(closeResult.signature && { signature: closeResult.signature }),
                    reason: 'position_recreation',
                    method: closeResult.alreadyClosed ? 'already_closed' : 'normal_close'
                });
                
                // 🔧 修复：不要立即清理状态，让新头寸创建后自然更新
                // 移除：context.state.positionAddress = null; context.state.positionRange = null;
            } else {
                await logger.logOperation('ℹ️ 无需关闭头寸（地址为空）', {
                    instanceId: context.instanceId,
                    reason: 'no_position_to_close'
                });
            }

            // 🔥 步骤2: 检查并卖出X代币余额（重建专用）
            await logger.logOperation('🔍 开始查询账户X代币余额（重建）', {
                poolAddress: context.config.poolAddress,
                reason: 'position_recreation_token_swap'
            });

            // 获取工具服务和风险服务实例
            const { container } = await import('tsyringe');
            const utilityService = container.resolve<any>('SimpleYUtilityService');
            const riskService = container.resolve<any>('SimpleYRiskService');
            const xTokenBalance = await utilityService.getAccountXTokenBalance(context);

            if (parseFloat(xTokenBalance) > 0) {
                await logger.logOperation('💰 检测到X代币余额，准备卖出（重建）', {
                    xTokenAmount: xTokenBalance,
                    poolAddress: context.config.poolAddress,
                    reason: 'position_recreation_token_cleanup'
                });

                // 🔥 卖出所有X代币为Y代币（使用头寸重建专用的代币交换）
                try {
                    const swapResult = await riskService.swapXTokensForRecreation(context, xTokenBalance);

                    await logger.logOperation('✅ 简单Y重建-X代币卖出成功', {
                        inputAmount: xTokenBalance,
                        outputAmount: swapResult.outputAmount,
                        signature: swapResult.signature,
                        poolAddress: context.config.poolAddress,
                        context: 'position_recreation_cleanup'
                    });
                } catch (swapError) {
                    // 🚨 代币交换失败不应阻止重建继续，但要记录错误
                    await logger.logError(`❌ 简单Y重建-X代币卖出失败，但重建继续进行: ${swapError instanceof Error ? swapError.message : String(swapError)}`);
                }
            } else {
                await logger.logOperation('ℹ️ 未检测到X代币余额，跳过卖出操作（重建）', {
                    xTokenBalance: xTokenBalance,
                    reason: 'no_x_tokens_to_swap_recreation'
                });
            }

            // 🔥 步骤2.5: 价格下限检查（从连锁头寸策略完整复制）
            const needTokenSwap = parseFloat(xTokenBalance) > 0;
            if (needTokenSwap && context.config.minPriceForRecreation && context.config.minPriceForRecreation > 0) {
                try {
                    // 获取当前市场数据以检查价格
                    const marketData = await this.collectMarketDataForPriceCheck(context);
                    const currentPrice = marketData.currentPrice;
                    const minPriceLimit = context.config.minPriceForRecreation;

                    if (currentPrice < minPriceLimit) {
                        // 🚨 价格低于下限，停止策略而不是重建头寸
                        await logger.logOperation('🚨 简单Y价格下限触发策略停止', {
                            currentPrice: currentPrice,
                            minPriceLimit: minPriceLimit,
                            reason: '当前价格低于设定下限，策略自动停止',
                            action: '策略将停止，头寸已关闭，X代币已卖出'
                        });

                        // 停止策略
                        context.state.phase = 'STOPPED';
                        context.state.isActive = false;
                        context.state.stoppingReason = 'MANUAL_STOP';

                        // 🔥 通过EventBus广播策略状态更新（价格下限触发停止）
                        await this.eventBus.publish('strategy.status.update', {
                            instanceId: context.instanceId,
                            status: 'stopped',
                            reason: 'price_limit_triggered',
                            phase: context.state.phase,
                            isActive: context.state.isActive,
                            stoppingReason: context.state.stoppingReason,
                            positionAddress: context.state.positionAddress,
                            lastUpdateTime: Date.now(),
                            timestamp: Date.now()
                        });

                        // 🔧 关键修复：停止监控服务，防止分析服务继续查询旧头寸
                        try {
                            // 🔥 方案1：使用正确的依赖注入Token
                            const { container } = await import('tsyringe');
                            const { TYPES } = await import('../../../../types/interfaces');
                            const strategyManager = container.resolve<any>(TYPES.StrategyManager);
                            
                            await strategyManager.stopInstance(context.instanceId);
                            await logger.logOperation('🛑 已通过StrategyManager停止策略实例', {
                                instanceId: context.instanceId,
                                reason: 'price_limit_triggered',
                                method: 'StrategyManager.stopInstance',
                                success: true
                            });
                            
                        } catch (strategyManagerError) {
                            await logger.logError(`⚠️ StrategyManager停止失败，使用EventBus备用方案: ${strategyManagerError instanceof Error ? strategyManagerError.message : String(strategyManagerError)}`);
                            
                            // 🔧 备用方案：通过EventBus通知执行器停止
                            try {
                                await this.eventBus.publish('strategy.force.stop', {
                                    instanceId: context.instanceId,
                                    reason: 'price_limit_triggered',
                                    stopType: 'force_stop',
                                    message: '价格下限触发强制停止'
                                });
                                
                                await logger.logOperation('📡 已发布强制停止事件作为备用方案', {
                                    instanceId: context.instanceId,
                                    reason: 'price_limit_triggered',
                                    method: 'EventBus.force.stop'
                                });
                            } catch (eventError) {
                                await logger.logError(`❌ 所有停止方案均失败: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
                            }
                        }

                        // 🔧 修复：设置停止标志和结果，不直接return
                        shouldContinueRecreation = false;
                        stopResult = {
                            success: false,
                            error: `价格下限触发策略停止：当前价格 ${currentPrice} 低于设定下限 ${minPriceLimit}`
                        };
                    } else {
                        // 价格检查通过
                        await logger.logOperation('✅ 简单Y价格下限检查通过', {
                            currentPrice: currentPrice,
                            minPriceLimit: minPriceLimit,
                            reason: '当前价格高于设定下限，可以继续创建头寸'
                        });
                    }
                } catch (priceCheckError) {
                    // 价格检查失败不应阻止头寸重建，但要记录警告
                    await logger.logError(`⚠️ 简单Y价格下限检查失败，继续执行头寸重建: ${priceCheckError instanceof Error ? priceCheckError.message : String(priceCheckError)}`);
                }
            } else if (needTokenSwap) {
                // 记录未启用价格下限检查的情况
                await logger.logOperation('ℹ️ 简单Y未设置价格下限检查', {
                    minPriceForRecreation: context.config.minPriceForRecreation,
                    reason: '未配置价格下限或设置为0，跳过价格下限检查'
                });
            }

            // 🆕 步骤2.6: 动态重建开关检查（从连锁头寸策略完整复制）
            if (shouldContinueRecreation && needTokenSwap && context.config.benchmarkYieldThreshold5Min && context.config.benchmarkYieldThreshold5Min > 0) {
                if (this.isDynamicRecreationSwitchEnabled(context)) {
                    // 🚨 开关开启，禁止重建（关闭头寸但不重建，等同止损）
                    await logger.logOperation('🚨 简单Y动态重建开关触发策略停止', {
                        switchEnabled: true,
                        lastBenchmarkYield5Min: context.state.lastBenchmarkYield5Min,
                        threshold: context.config.benchmarkYieldThreshold5Min,
                        reason: '动态重建开关已开启，禁止重建头寸',
                        action: '策略将自动停止'
                    });

                    // 停止策略
                    context.state.phase = 'STOPPED';
                    context.state.isActive = false;
                    context.state.stoppingReason = 'MANUAL_STOP';

                    // 🔥 通过EventBus广播策略状态更新（动态重建开关触发停止）
                    await this.eventBus.publish('strategy.status.update', {
                        instanceId: context.instanceId,
                        status: 'stopped',
                        reason: 'dynamic_recreation_switch_triggered',
                        phase: context.state.phase,
                        isActive: context.state.isActive,
                        stoppingReason: context.state.stoppingReason,
                        positionAddress: context.state.positionAddress,
                        lastUpdateTime: Date.now(),
                        timestamp: Date.now()
                    }); // 标记为止损类型的停止

                    // 🔧 关键修复：停止监控服务，防止分析服务继续查询旧头寸
                    try {
                        // 🔥 方案1：使用正确的依赖注入Token
                        const { container } = await import('tsyringe');
                        const { TYPES } = await import('../../../../types/interfaces');
                        const strategyManager = container.resolve<any>(TYPES.StrategyManager);
                        
                        await strategyManager.stopInstance(context.instanceId);
                        await logger.logOperation('🛑 已通过StrategyManager停止策略实例', {
                            instanceId: context.instanceId,
                            reason: 'dynamic_recreation_switch_triggered',
                            method: 'StrategyManager.stopInstance',
                            success: true
                        });
                        
                    } catch (strategyManagerError) {
                        await logger.logError(`⚠️ StrategyManager停止失败，使用EventBus备用方案: ${strategyManagerError instanceof Error ? strategyManagerError.message : String(strategyManagerError)}`);
                        
                        // 🔧 备用方案：通过EventBus通知执行器停止
                        try {
                            await this.eventBus.publish('strategy.force.stop', {
                                instanceId: context.instanceId,
                                reason: 'dynamic_recreation_switch_triggered',
                                stopType: 'force_stop',
                                message: '动态重建开关触发强制停止'
                            });
                            
                            await logger.logOperation('📡 已发布强制停止事件作为备用方案', {
                                instanceId: context.instanceId,
                                reason: 'dynamic_recreation_switch_triggered',
                                method: 'EventBus.force.stop'
                            });
                        } catch (eventError) {
                            await logger.logError(`❌ 所有停止方案均失败: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
                        }
                    }

                    await logger.logOperation('✅ 简单Y策略已停止', {
                        switchEnabled: true,
                        finalBenchmarkYield5Min: context.state.lastBenchmarkYield5Min,
                        threshold: context.config.benchmarkYieldThreshold5Min,
                        stopReason: '动态重建开关触发',
                        note: '头寸已关闭，X代币已卖出，实际效果等同于止损'
                    });

                    // 🔧 修复：设置停止标志和结果，不直接return
                    shouldContinueRecreation = false;
                    stopResult = {
                        success: false,
                        error: `动态重建开关触发策略停止：基准收益率 ${context.state.lastBenchmarkYield5Min}% < 阈值 ${context.config.benchmarkYieldThreshold5Min}%`
                    };
                } else {
                    // 开关关闭，允许重建
                    await logger.logOperation('✅ 简单Y动态重建开关检查通过', {
                        switchEnabled: false,
                        lastBenchmarkYield5Min: context.state.lastBenchmarkYield5Min,
                        threshold: context.config.benchmarkYieldThreshold5Min,
                        reason: '动态重建开关已关闭，允许重建头寸'
                    });
                }
            } else {
                // 记录未启用动态重建开关的情况
                await logger.logOperation('ℹ️ 简单Y未设置动态重建开关检查', {
                    benchmarkYieldThreshold5Min: context.config.benchmarkYieldThreshold5Min,
                    reason: '未配置15分钟平均基准收益率阈值或设置为0，跳过动态重建开关检查'
                });
            }

            // 🔄 步骤3: 重新创建简单Y头寸（仅在未触发停止条件时执行）
            if (shouldContinueRecreation) {
                const createResult = await this.createPosition(context);
                
                if (!createResult.success) {
                    throw new Error(`简单Y头寸重建失败: ${createResult.error}`);
                }

                // 🔧 验证新头寸地址已正确设置
                await logger.logOperation('🔍 新头寸创建验证', {
                    newPositionAddress: context.state.positionAddress?.substring(0, 8) + '...' || 'null',
                    createResultAddress: createResult.positionAddress?.substring(0, 8) + '...' || 'null',
                    addressMatch: context.state.positionAddress === createResult.positionAddress,
                    instanceId: context.instanceId
                });

                // 🔥 步骤4: 更新分析服务的头寸地址（关键修复）
                if (instanceAwareServiceFactory) {
                    await this.updatePositionAnalyticsService(context, instanceAwareServiceFactory);
                    
                    // 🔧 强制刷新：清除可能的缓存，确保新头寸地址立即生效
                    await logger.logOperation('🔄 强制刷新缓存，确保新头寸地址立即生效', {
                        newPositionAddress: context.state.positionAddress?.substring(0, 8) + '...' || 'null',
                        instanceId: context.instanceId
                    });
                } else {
                    await logger.logError('⚠️ InstanceAwareServiceFactory未提供，跳过分析服务更新');
                }

                // 恢复监控状态
                context.state.phase = 'MONITORING';
                context.state.stoppingReason = null;

                // 🧹 重建完成，清理模块状态以便下次重新计时
                await this.cleanupRecreationModule(context);

                await logger.logOperation('✅ 简单Y头寸重建完成', {
                    newPositionAddress: context.state.positionAddress,
                    reason: 'position_recreation_success'
                });

                return {
                    success: true,
                    newPositionAddress: context.state.positionAddress || ''
                };
            } else {
                // 🛑 触发停止条件，不执行重建，直接返回停止结果
                await logger.logOperation('🛑 简单Y重建被停止条件阻止', {
                    reason: 'stop_condition_triggered',
                    instanceId: context.instanceId
                });
                
                // 🧹 停止时也要清理模块状态
                await this.cleanupRecreationModule(context);
                
                return stopResult!;
            }

        } catch (error) {
            // 🧹 重建失败时也要清理模块状态
            await this.cleanupRecreationModule(context);
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // 🔧 修复：区分正常停止和真正的错误
            if (errorMessage.includes('价格下限触发策略停止') || errorMessage.includes('动态重建开关触发策略停止')) {
                // 价格下限和动态开关触发的停止是正常业务逻辑，记录为INFO
                await logger.logOperation(`ℹ️ 简单Y策略正常停止: ${errorMessage}`, {
                    reason: '业务逻辑触发',
                    instanceId: context.instanceId,
                    action: '策略已完全停止'
                });
            } else {
                // 其他错误仍记录为ERROR
                await logger.logError(`简单Y头寸重建失败: ${errorMessage}`);
                
                // 恢复监控状态
                context.state.phase = 'MONITORING';
                context.state.stoppingReason = null;
            }

            return {
                success: false,
                error: errorMessage
            };
        } finally {
            // 🔒 释放重建操作锁定和时间戳
            this.recreationOperationLocks.delete(context.instanceId);
            this.recreationLockTimestamps.delete(context.instanceId);
            await logger.logOperation('🔓 简单Y头寸重建操作锁定已释放', {
                instanceId: context.instanceId,
                lockStatus: 'released'
            });
        }
    }

    /**
     * 🆕 更新分析服务的头寸地址（用于头寸重建后的同步）
     */
    async updatePositionAnalyticsService(context: SimpleYModuleContext, instanceAwareServiceFactory: any): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);

        // 🔍 DEBUG: 方法开始调用
        await logger.logOperation('🔍 [DEBUG] 开始更新分析服务头寸地址', {
            instanceId: context.instanceId,
            currentPositionAddress: context.state.positionAddress,
            reason: 'position_recreation_sync'
        });

        try {
            // 🔍 DEBUG: 步骤1 - 验证传入的服务工厂
            await logger.logOperation('�� [DEBUG] 步骤1: 验证传入的InstanceAwareServiceFactory', {
                hasFactory: !!instanceAwareServiceFactory,
                factoryType: typeof instanceAwareServiceFactory
            });
            
            if (!instanceAwareServiceFactory) {
                await logger.logError('❌ [DEBUG] InstanceAwareServiceFactory参数为null或undefined');
                return;
            }
            
            // 🔍 DEBUG: 步骤2 - 获取实例容器
            await logger.logOperation('🔍 [DEBUG] 步骤2: 获取实例容器', { instanceId: context.instanceId });
            const instanceContainer = instanceAwareServiceFactory.getInstanceContainer(context.instanceId);
            
            if (!instanceContainer) {
                await logger.logError('❌ [DEBUG] 实例容器获取失败，未找到对应的实例容器', {
                    instanceId: context.instanceId,
                    factoryType: typeof instanceAwareServiceFactory,
                    hasGetInstanceContainer: typeof instanceAwareServiceFactory.getInstanceContainer === 'function'
                });
                return;
            }

            // 🔍 DEBUG: 步骤3 - 直接获取PositionAnalyticsService
            await logger.logOperation('🔍 [DEBUG] 步骤3: 从实例容器获取PositionAnalyticsService', {});
            const analyticsService = instanceContainer.positionAnalyticsService; // 直接访问属性，不需要resolve
            
            if (!analyticsService) {
                await logger.logError('❌ [DEBUG] PositionAnalyticsService获取失败，服务不存在', {
                    containerType: typeof instanceContainer,
                    hasPositionAnalyticsService: 'positionAnalyticsService' in instanceContainer
                });
                return;
            }

            // 🔍 DEBUG: 步骤4 - 构建新头寸地址列表
            const newPositionAddresses: string[] = [];
            if (context.state.positionAddress) {
                newPositionAddresses.push(context.state.positionAddress);
            }
            
            await logger.logOperation('�� [DEBUG] 步骤4: 构建新头寸地址列表', {
                newPositionAddresses,
                hasCurrentPosition: !!context.state.positionAddress,
                listLength: newPositionAddresses.length
            });

            // 🔍 DEBUG: 步骤5 - 检查更新方法是否存在
            const hasUpdateMethod = typeof analyticsService.updatePositionAddresses === 'function';
            await logger.logOperation('🔍 [DEBUG] 步骤5: 检查updatePositionAddresses方法', {
                hasUpdateMethod,
                serviceType: typeof analyticsService
            });

            if (!hasUpdateMethod) {
                await logger.logError('❌ [DEBUG] updatePositionAddresses方法不存在');
                return;
            }

            // 🔍 DEBUG: 步骤6 - 执行更新操作
            await logger.logOperation('🔍 [DEBUG] 步骤6: 执行updatePositionAddresses操作', {
                addressesToUpdate: newPositionAddresses
            });
            
            // 更新头寸监控配置
            await analyticsService.updatePositionAddresses(newPositionAddresses);
            
            await logger.logOperation('✅ [DEBUG] updatePositionAddresses执行成功', {
                updatedAddresses: newPositionAddresses
            });

            // 🆕 清除基准收益率数据，重新开始记录
            try {
                await logger.logOperation('🔍 [DEBUG] 步骤7: 清除基准收益率数据', {});
                const unifiedDataProvider = (analyticsService as any).dataProvider;
                
                if (unifiedDataProvider && typeof unifiedDataProvider.clearBenchmarkYieldRates === 'function') {
                    unifiedDataProvider.clearBenchmarkYieldRates();
                    await logger.logMonitoring('🆕 基准收益率数据已清除', {
                        reason: 'position_recreation_complete',
                        newPositionRange: context.state.positionRange,
                        message: '简单Y头寸重建完成，基准收益率数据已清除并重新开始记录'
                    });
                } else {
                    await logger.logOperation('🔍 [DEBUG] 基准收益率清除跳过', {
                        hasDataProvider: !!unifiedDataProvider,
                        hasClearMethod: !!(unifiedDataProvider && typeof unifiedDataProvider.clearBenchmarkYieldRates === 'function')
                    });
                }
            } catch (benchmarkError) {
                await logger.logError(`清除基准收益率数据失败: ${benchmarkError instanceof Error ? benchmarkError.message : String(benchmarkError)}`);
                // 不抛出错误，避免影响主流程
            }

            // 🔍 DEBUG: 最终成功日志
            await logger.logMonitoring('✅ [DEBUG] 简单Y头寸分析服务更新完成', {
                newPositionAddress: context.state.positionAddress,
                newPositionCount: newPositionAddresses.length,
                updateReason: 'position_recreation_complete',
                allStepsCompleted: true
            });

        } catch (error) {
            await logger.logError(`❌ [DEBUG] 更新PositionAnalyticsService失败: ${error instanceof Error ? error.message : String(error)}`, {
                errorStack: error instanceof Error ? error.stack : undefined,
                errorType: typeof error,
                instanceId: context.instanceId,
                positionAddress: context.state.positionAddress
            });
            // 不抛出错误，避免影响主流程
        }
    }

    /**
     * 🆕 清理头寸重建模块状态 - 重建完成后调用
     */
    async cleanupRecreationModule(context: SimpleYModuleContext): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);
        
        // 清除模块实例，下次检查时会重新创建
        this.positionRecreationModules.delete(context.instanceId);
        
        await logger.logMonitoring('🧹 头寸重建模块状态已清理', {
            instanceId: context.instanceId,
            reason: 'position_recreation_completed'
        });
    }

    /**
     * 🆕 智能安全头寸关闭 - 与风险服务保持一致的错误处理
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
            await logger.logOperation(`🛑 开始关闭${positionName}（重建）`, {
                address: positionAddress.substring(0, 8) + '...',
                instanceId: context.instanceId
            });

            // 使用统一的重试机制包装
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

            await logger.logOperation(`✅ ${positionName}关闭成功（重建）`, {
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

            // 🔥 智能判断：头寸不存在 = 已经关闭成功
            if (errorMsg.includes('头寸不存在') ||
                errorMsg.includes('不属于当前用户') ||
                errorMsg.includes('position does not exist') ||
                errorMsg.includes('Position not found')) {
                
                await logger.logOperation(`ℹ️ ${positionName}已经不存在，视为已关闭（重建）`, {
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
            await logger.logError(`❌ ${positionName}关闭失败（重建）: ${errorMsg}`);
            return { 
                success: false, 
                error: errorMsg 
            };
        }
    }

    /**
     * 🆕 收集市场数据用于价格检查 - 从连锁头寸策略复制
     */
    private async collectMarketDataForPriceCheck(context: SimpleYModuleContext): Promise<{ currentPrice: number }> {
        try {
            // 获取基础池信息
            const poolData = await this.dlmmMonitor.getPoolInfo(context.config.poolAddress);
            return {
                currentPrice: poolData.activePrice
            };
        } catch (error) {
            this.getCachedLogger(context.instanceId).logError(`获取价格数据失败: ${error instanceof Error ? error.message : String(error)}`);
            return { currentPrice: 0 };
        }
    }

    /**
     * 🆕 检查动态重建开关是否已启用 - 从连锁头寸策略复制
     */
    private isDynamicRecreationSwitchEnabled(context: SimpleYModuleContext): boolean {
        return context.state.dynamicRecreationSwitchEnabled === true;
    }

    /**
     * 计算简单Y头寸的bin范围
     */
    async calculatePositionRange(context: SimpleYModuleContext): Promise<{
        activeBin: number;
        positionLowerBin: number;
        positionUpperBin: number;
    }> {
        try {
            // 获取当前活跃bin
            const activeBin = await this.dlmmMonitor.getActiveBin(context.config.poolAddress);

            // 🎯 简单Y头寸的bin范围计算：
            // Y头寸是价格下跌方向的头寸，应该从活跃bin开始向下创建
            // 这样当价格下跌时，X代币可以逐步换成Y代币获得手续费
            const positionUpperBin = activeBin;
            const positionLowerBin = activeBin - context.config.binRange + 1; // +1 因为包含activeBin本身

            await this.getCachedLogger(context.instanceId).logOperation(
                '🎯 计算简单Y头寸bin范围',
                {
                    activeBin,
                    binRange: context.config.binRange,
                    positionLowerBin,
                    positionUpperBin,
                    totalBins: positionUpperBin - positionLowerBin + 1,
                    strategy: '从活跃bin向下创建Y头寸'
                }
            );

            return {
                activeBin,
                positionLowerBin,
                positionUpperBin
            };

        } catch (error) {
            // 出错时返回默认值 - 也使用向下的范围
            return {
                activeBin: 0,
                positionLowerBin: -(context.config.binRange - 1),
                positionUpperBin: 0
            };
        }
    }

    /**
     * 关闭头寸
     */
    async closePosition(context: SimpleYModuleContext): Promise<{
        success: boolean;
        signature?: string;
        error?: string;
    }> {
        try {
            if (!context.state.positionAddress) {
                return {
                    success: true // 没有头寸需要关闭
                };
            }

            // 🔧 使用统一的重试机制包装
            const result = await this.executeAsyncClosePositionWithRetry(
                async () => {
                    const closeResult = await this.positionManager.closePosition(context.state.positionAddress!);
                    if (!closeResult.success) {
                        // 检查是否是头寸不存在的情况（视为成功）
                        const errorMsg = closeResult.error || '';
                        if (errorMsg.includes('头寸不存在') || 
                            errorMsg.includes('不属于当前用户') ||
                            errorMsg.includes('position does not exist') ||
                            errorMsg.includes('Position not found')) {
                            
                            return { 
                                ...closeResult, 
                                success: true, 
                                alreadyClosed: true 
                            };
                        }
                        
                        throw new Error(`简单Y头寸关闭失败: ${closeResult.error || '未知错误'}`);
                    }
                    return closeResult;
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

            // 清理状态
            context.state.positionAddress = null;
            context.state.positionRange = null;

            return {
                success: true,
                ...(result.signature && { signature: result.signature })
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}