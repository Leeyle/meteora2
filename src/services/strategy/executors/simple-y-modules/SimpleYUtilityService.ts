/**
 * 简单Y工具服务模块
 * 
 * 职责：
 * - Gas费用优化
 * - 代币精度信息获取
 * - 日志记录和错误处理
 * - 资源清理和状态管理
 */

import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { TYPES, IPositionManager, ILoggerService, IEventBus, ISolanaWeb3Service, IDLMMMonitorService, IGasService } from '../../../../types/interfaces';
import { ISimpleYUtilityService, SimpleYModuleContext } from './types';
import { SynchronousRetryMixin } from '../mixins/SynchronousRetryMixin';
import { TokenPrecisionConverter } from '../../../../utils/TokenPrecisionConverter';

@injectable()
export class SimpleYUtilityService extends SynchronousRetryMixin implements ISimpleYUtilityService {
    
    // 🔧 新增：策略实例级别的代币精度缓存
    private instanceTokenPrecisionCache: Map<string, {
        tokenXDecimals: number;
        tokenYDecimals: number;
        tokenXMint: string;
        tokenYMint: string;
        cachedAt: number;
    }> = new Map();

    // 🔧 新增：策略日志器缓存，避免重复创建
    private strategyLoggerCache = new Map<string, any>();

    constructor(
        @inject(TYPES.PositionManager) private positionManager: IPositionManager,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.EventBus) private eventBus: IEventBus,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        @inject(TYPES.DLMMMonitorService) private dlmmMonitor: IDLMMMonitorService,
        @inject(TYPES.GasService) private gasService: IGasService
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
     * 🔧 修复：优化Gas费用，使用缓存的日志器
     */
    async optimizeGas(context: SimpleYModuleContext, operationType: string): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);
        
        try {
            await logger.logMonitoring('⛽ 开始Gas费用优化', {
                instanceId: context.instanceId,
                operationType,
                timestamp: Date.now()
            });

            // 根据操作类型优化Gas
            switch (operationType) {
                case 'STOP_LOSS':
                    await this.optimizeForStopLoss();
                    break;
                case 'SWAP':
                    await this.optimizeForSwap();
                    break;
                case 'POSITION_CREATION':
                    await this.optimizeForPositionCreation();
                    break;
                case 'POSITION_CLOSE':
                    await this.optimizeForPositionClose();
                    break;
                default:
                    await this.optimizeGeneral();
                    break;
            }

            await logger.logMonitoring('✅ Gas费用优化完成', {
                instanceId: context.instanceId,
                operationType
            });

        } catch (error) {
            await logger.logError(`Gas费用优化失败: ${error instanceof Error ? error.message : String(error)}`);
            // Gas优化失败不应该阻塞主流程
        }
    }

    /**
     * 🔧 修复：获取代币精度信息 - 使用真实的代币精度而非硬编码
     */
    async getTokenPrecision(context: SimpleYModuleContext): Promise<{
        tokenXDecimals: number;
        tokenYDecimals: number;
        tokenXMint: string;
        tokenYMint: string;
    }> {
        const logger = this.getCachedLogger(context.instanceId);
        
        try {
            // 检查缓存
            const cached = this.instanceTokenPrecisionCache.get(context.config.poolAddress);
            if (cached && (Date.now() - cached.cachedAt) < 10 * 60 * 1000) { // 10分钟缓存
                await logger.logMonitoring('🎯 使用缓存的代币精度信息', {
                    instanceId: context.instanceId,
                    poolAddress: context.config.poolAddress,
                    cacheAge: Date.now() - cached.cachedAt,
                    tokenXDecimals: cached.tokenXDecimals,
                    tokenYDecimals: cached.tokenYDecimals
                });
                
                return {
                    tokenXDecimals: cached.tokenXDecimals,
                    tokenYDecimals: cached.tokenYDecimals,
                    tokenXMint: cached.tokenXMint,
                    tokenYMint: cached.tokenYMint
                };
            }

            await logger.logMonitoring('🔍 获取真实代币精度信息', {
                instanceId: context.instanceId,
                poolAddress: context.config.poolAddress
            });

            // 🔧 修复：使用与连锁头寸策略相同的精度获取逻辑
            // 动态导入DLMM SDK
            const DLMMSdk = await import('@meteora-ag/dlmm');
            const { PublicKey } = await import('@solana/web3.js');
            const { TokenPrecisionConverter } = await import('../../../../utils/TokenPrecisionConverter');

            const connection = this.solanaService.getConnection();
            const poolPubkey = new PublicKey(context.config.poolAddress);

            // 创建DLMM池实例以获取代币地址
            const dlmmPool = await DLMMSdk.default.create(connection, poolPubkey);
            const tokenXMint = dlmmPool.lbPair.tokenXMint.toString();
            const tokenYMint = dlmmPool.lbPair.tokenYMint.toString();

            // 使用TokenPrecisionConverter获取真实精度
            const precisionConverter = new TokenPrecisionConverter(connection);
            const tokenXDecimals = await precisionConverter.getTokenDecimals(new PublicKey(tokenXMint));
            const tokenYDecimals = await precisionConverter.getTokenDecimals(new PublicKey(tokenYMint));

            // 构建精度信息
            const precisionInfo = {
                tokenXDecimals,
                tokenYDecimals,
                tokenXMint,
                tokenYMint
            };

            // 缓存结果
            this.instanceTokenPrecisionCache.set(context.config.poolAddress, {
                ...precisionInfo,
                cachedAt: Date.now()
            });

            await logger.logMonitoring('✅ 真实代币精度信息获取成功', {
                instanceId: context.instanceId,
                tokenXDecimals: precisionInfo.tokenXDecimals,
                tokenYDecimals: precisionInfo.tokenYDecimals,
                tokenXMint: precisionInfo.tokenXMint,
                tokenYMint: precisionInfo.tokenYMint,
                cached: false,
                source: 'TokenPrecisionConverter'
            });

            return precisionInfo;

        } catch (error) {
            await logger.logError(`获取代币精度信息失败: ${error instanceof Error ? error.message : String(error)}`);
            
            // 🔧 失败时尝试获取基础池信息作为备用方案
            try {
                const poolInfo = await this.dlmmMonitor.getPoolInfo(context.config.poolAddress);
                if (poolInfo && poolInfo.tokenX && poolInfo.tokenY) {
                    await logger.logMonitoring('⚠️ 使用默认精度作为备用方案', {
                        tokenXMint: poolInfo.tokenX,
                        tokenYMint: poolInfo.tokenY,
                        defaultDecimals: 6
                    });
                    
                    return {
                        tokenXDecimals: 6,
                        tokenYDecimals: 6,
                        tokenXMint: poolInfo.tokenX,
                        tokenYMint: poolInfo.tokenY
                    };
                }
            } catch (fallbackError) {
                await logger.logError(`备用方案也失败: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
            }
            
            // 最终默认值
            return {
                tokenXDecimals: 6,
                tokenYDecimals: 6,
                tokenXMint: '',
                tokenYMint: ''
            };
        }
    }

    /**
     * 清理资源
     */
    async cleanup(context: SimpleYModuleContext): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);
        
        try {
            await logger.logMonitoring('🧹 开始资源清理', {
                instanceId: context.instanceId,
                phase: context.state.phase,
                positionAddress: context.state.positionAddress
            });

            // 清理缓存
            this.instanceTokenPrecisionCache.delete(context.config.poolAddress);

            // 更新状态
            context.state.phase = 'CLEANING';
            context.state.isActive = false;

            await logger.logMonitoring('✅ 资源清理完成', {
                instanceId: context.instanceId,
                phase: context.state.phase
            });

        } catch (error) {
            await logger.logError(`资源清理失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 🔧 修复：记录操作日志，使用缓存的日志器
     */
    async logOperation(context: SimpleYModuleContext, message: string, data?: any): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);
        await logger.logMonitoring(message, {
            instanceId: context.instanceId,
            timestamp: Date.now(),
            ...data
        });
    }

    /**
     * 🔧 修复：记录错误日志，使用缓存的日志器
     */
    async logError(context: SimpleYModuleContext, message: string, error?: Error): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);
        await logger.logError(`${message} [${context.instanceId}]`, error);
    }

    /**
     * 🎯 智能Gas优化：在重要交易前更新Gas参数 - 从主执行器迁移
     */
    async optimizeGasForTransaction(context: SimpleYModuleContext, operationType: string): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);

        try {
            // 1. 获取当前网络拥堵状态
            const congestionLevel = this.gasService.getNetworkCongestion();

            // 2. 更新优先费用数据
            await this.gasService.updatePriorityFeeForTransaction();

            // 3. 获取最新Gas设置
            const gasSettings = await this.gasService.getCurrentGasSettings();

            await logger.logOperation(`🎯 智能Gas优化完成: ${operationType}`, {
                operationType,
                networkCongestion: congestionLevel,
                baseFee: gasSettings.baseFee,
                priorityFee: gasSettings.priorityFee,
                timestamp: Date.now()
            });

        } catch (error) {
            // Gas优化失败不影响主要业务流程，只记录警告
            await logger.logError(`⚠️ Gas优化失败，继续执行: ${operationType}`, error as Error);
        }
    }

    /**
     * 🔧 获取策略实例的代币精度信息（带缓存） - 从主执行器迁移
     */
    async getInstanceTokenPrecision(context: SimpleYModuleContext): Promise<{
        tokenXDecimals: number;
        tokenYDecimals: number;
        tokenXMint: string;
        tokenYMint: string;
    }> {
        const logger = this.getCachedLogger(context.instanceId);

        // 检查缓存
        const cached = this.instanceTokenPrecisionCache.get(context.instanceId);
        if (cached) {
            return cached;
        }

        // 首次获取代币精度
        const config = context.config;

        try {
            // 动态导入DLMM SDK
            const DLMMSdk = await import('@meteora-ag/dlmm');
            const { PublicKey } = await import('@solana/web3.js');
            const { TokenPrecisionConverter } = await import('../../../../utils/TokenPrecisionConverter');

            const connection = this.solanaService.getConnection();
            const poolPubkey = new PublicKey(config.poolAddress);

            // 创建DLMM池实例以获取代币地址
            const dlmmPool = await DLMMSdk.default.create(connection, poolPubkey);
            const tokenXMint = dlmmPool.lbPair.tokenXMint.toString();
            const tokenYMint = dlmmPool.lbPair.tokenYMint.toString();

            // 使用TokenPrecisionConverter获取真实精度
            const precisionConverter = new TokenPrecisionConverter(connection);
            const tokenXDecimals = await precisionConverter.getTokenDecimals(new PublicKey(tokenXMint));
            const tokenYDecimals = await precisionConverter.getTokenDecimals(new PublicKey(tokenYMint));

            // 缓存结果
            const precisionInfo = {
                tokenXDecimals,
                tokenYDecimals,
                tokenXMint,
                tokenYMint,
                cachedAt: Date.now()
            };

            this.instanceTokenPrecisionCache.set(context.instanceId, precisionInfo);

            await logger.logOperation('🔧 代币精度信息获取成功', {
                tokenXMint,
                tokenYMint,
                tokenXDecimals,
                tokenYDecimals,
                cached: false
            });

            return precisionInfo;

        } catch (error) {
            await logger.logError(`获取代币精度信息失败: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * 🆕 初始化动态重建开关状态 - 从主执行器迁移
     */
    async initializeDynamicRecreationSwitch(context: SimpleYModuleContext): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);

        // 初始化开关为关闭状态（允许重建）
        context.state.dynamicRecreationSwitchEnabled = false;
        delete context.state.lastBenchmarkYield5Min; // 删除字段而不是设置为undefined
        context.state.lastSwitchUpdateTime = new Date();

        await logger.logOperation('🆕 动态重建开关状态已初始化', {
            dynamicRecreationSwitchEnabled: context.state.dynamicRecreationSwitchEnabled,
            lastSwitchUpdateTime: context.state.lastSwitchUpdateTime
        });
    }

    /**
     * 🔄 更新动态重建开关状态 - 从主执行器迁移
     */
    async updateDynamicRecreationSwitch(context: SimpleYModuleContext, benchmarkYield5Min: number | null | undefined): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);

        try {
            const config = context.config;
            const state = context.state;

            // 🔍 调试日志：方法入口（与连锁头寸策略一致）
            await logger.logMonitoring('🔍 进入updateDynamicRecreationSwitch方法', {
                instanceId: context.instanceId,
                benchmarkYield5Min: benchmarkYield5Min,
                configThreshold: config.benchmarkYieldThreshold5Min,
                currentSwitchState: state.dynamicRecreationSwitchEnabled
            });

            // 检查是否启用了动态重建开关功能
            if (!config.benchmarkYieldThreshold5Min || config.benchmarkYieldThreshold5Min <= 0) {
                await logger.logMonitoring('🔍 动态重建开关功能未启用，退出方法', {
                    threshold: config.benchmarkYieldThreshold5Min,
                    reason: !config.benchmarkYieldThreshold5Min ? '阈值未配置' : '阈值为0或负数'
                });
                return; // 未启用，不处理
            }

            // 检查基准收益率数据是否有效（null和undefined为无效，0和正数为有效）
            if (benchmarkYield5Min === null || benchmarkYield5Min === undefined) {
                await logger.logMonitoring('⚠️ 基准收益率数据无效，跳过开关状态更新', {
                    benchmarkYield5Min: benchmarkYield5Min,
                    reason: benchmarkYield5Min === null ? 'null值' : 'undefined值'
                });
                return; // 数据无效，不更新开关状态
            }

            // 判断是否需要开启开关（禁止重建）- 修复逻辑：基准收益率低于阈值时开启开关
            const threshold = config.benchmarkYieldThreshold5Min;
            const previousSwitchEnabled = state.dynamicRecreationSwitchEnabled === true;
            const currentSwitchEnabled = (benchmarkYield5Min * 100) < threshold;

            // 🔍 详细调试日志：状态计算（与连锁头寸策略一致）
            await logger.logMonitoring('🔍 简单Y动态重建开关状态计算', {
                benchmarkYield5Min: benchmarkYield5Min,
                threshold: threshold,
                previousSwitchEnabled: previousSwitchEnabled,
                currentSwitchEnabled: currentSwitchEnabled,
                comparison: `${(benchmarkYield5Min * 100).toFixed(4)}% ${(benchmarkYield5Min * 100) < threshold ? '<' : '>='} ${threshold}%`,
                willChangeState: previousSwitchEnabled !== currentSwitchEnabled
            });

            // 更新状态
            state.lastBenchmarkYield5Min = benchmarkYield5Min;
            state.lastSwitchUpdateTime = new Date();

            // 如果开关状态发生变化，记录日志（与连锁头寸策略完全一致）
            if (previousSwitchEnabled !== currentSwitchEnabled) {
                state.dynamicRecreationSwitchEnabled = currentSwitchEnabled;

                // 🔍 调试日志：状态变化
                await logger.logMonitoring('🔍 简单Y动态重建开关状态发生变化', {
                    previousSwitchEnabled: previousSwitchEnabled,
                    currentSwitchEnabled: currentSwitchEnabled,
                    stateAfterUpdate: state.dynamicRecreationSwitchEnabled,
                    benchmarkYield5Min: benchmarkYield5Min,
                    threshold: threshold
                });

                // 🔧 修复：使用logOperation记录重要的状态变化（与连锁头寸策略对应）
                await logger.logOperation('🔄 简单Y动态重建开关状态变化', {
                    previousState: previousSwitchEnabled ? '开启（禁止重建）' : '关闭（允许重建）',
                    currentState: currentSwitchEnabled ? '开启（禁止重建）' : '关闭（允许重建）',
                    benchmarkYield5Min: benchmarkYield5Min,
                    threshold: threshold,
                    switchEnabled: currentSwitchEnabled,
                    updateTime: state.lastSwitchUpdateTime.toISOString(),
                    comparison: `${(benchmarkYield5Min * 100).toFixed(4)}% ${(benchmarkYield5Min * 100) < threshold ? '<' : '>='} ${threshold}%`
                });

            } else {
                // 🔍 调试日志：状态保持不变（与连锁头寸策略一致）
                await logger.logMonitoring('🔍 简单Y动态重建开关状态保持不变', {
                    switchEnabled: currentSwitchEnabled,
                    benchmarkYield5Min: benchmarkYield5Min,
                    threshold: threshold,
                    reason: currentSwitchEnabled ? '基准收益率仍低于阈值' : '基准收益率仍高于阈值'
                });
            }

        } catch (error) {
            await logger.logError(`更新动态重建开关状态失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 🆕 检查动态重建开关是否开启 - 与连锁头寸策略一致
     */
    isDynamicRecreationSwitchEnabled(context: SimpleYModuleContext): boolean {
        // 默认开关关闭（允许重建）
        return context.state.dynamicRecreationSwitchEnabled === true;
    }

    /**
     * 🆕 获取账户X代币余额 - 从连锁头寸策略完整复制
     */
    async getAccountXTokenBalance(context: SimpleYModuleContext): Promise<string> {
        const logger = this.getCachedLogger(context.instanceId);

        try {
            // 获取池子信息以获取X代币mint地址
            const poolInfo = await this.dlmmMonitor.getPoolInfo(context.config.poolAddress);
            if (!poolInfo || !poolInfo.tokenX) {
                throw new Error(`无法获取池子信息: ${context.config.poolAddress}`);
            }

            // 获取用户钱包 - 通过容器解析
            const { container } = await import('tsyringe');
            const walletService = container.resolve<any>('WalletService');
            const userKeypair = walletService.getCurrentKeypair();
            if (!userKeypair) {
                throw new Error('用户钱包未解锁');
            }

            // 查询X代币余额
            const connection = this.solanaService.getConnection();
            const { PublicKey } = await import('@solana/web3.js');
            const { getAssociatedTokenAddress, getAccount, getMint } = await import('@solana/spl-token');

            const xTokenMint = new PublicKey(poolInfo.tokenX);
            const userPublicKey = userKeypair.publicKey;

            // 🔧 动态获取代币精度
            let tokenDecimals = 6; // 默认精度
            try {
                const mintInfo = await getMint(connection, xTokenMint);
                tokenDecimals = mintInfo.decimals;
            } catch (mintError) {
                // 使用默认精度，不记录日志避免冗余
            }

            // 获取关联代币账户地址
            const associatedTokenAccount = await getAssociatedTokenAddress(
                xTokenMint,
                userPublicKey
            );

            try {
                // 获取代币账户信息
                const tokenAccount = await getAccount(connection, associatedTokenAccount);
                const balance = tokenAccount.amount.toString();

                // 🔧 使用动态获取的精度转换为人类可读格式
                const humanReadableBalance = (parseFloat(balance) / Math.pow(10, tokenDecimals)).toString();

                await logger.logOperation('📊 简单Y-X代币余额查询成功', {
                    xTokenMint: poolInfo.tokenX,
                    rawBalance: balance,
                    humanReadableBalance: humanReadableBalance,
                    decimals: tokenDecimals,
                    associatedTokenAccount: associatedTokenAccount.toString(),
                    instanceId: context.instanceId
                });

                return humanReadableBalance;

            } catch (accountError) {
                // 如果账户不存在，说明没有该代币
                await logger.logOperation('ℹ️ 简单Y-X代币账户不存在，余额为0', {
                    xTokenMint: poolInfo.tokenX,
                    error: accountError instanceof Error ? accountError.message : String(accountError),
                    instanceId: context.instanceId
                });
                return '0';
            }

        } catch (error) {
            await logger.logError(`简单Y查询X代币余额失败: ${error instanceof Error ? error.message : String(error)}`);
            return '0';
        }
    }

    /**
     * 🆕 获取账户Y代币余额 - 扩展功能
     */
    async getAccountYTokenBalance(context: SimpleYModuleContext): Promise<string> {
        const logger = this.getCachedLogger(context.instanceId);

        try {
            // 获取池子信息以获取Y代币mint地址
            const poolInfo = await this.dlmmMonitor.getPoolInfo(context.config.poolAddress);
            if (!poolInfo || !poolInfo.tokenY) {
                throw new Error(`无法获取池子信息: ${context.config.poolAddress}`);
            }

            // 获取用户钱包 - 通过容器解析
            const { container } = await import('tsyringe');
            const walletService = container.resolve<any>('WalletService');
            const userKeypair = walletService.getCurrentKeypair();
            if (!userKeypair) {
                throw new Error('用户钱包未解锁');
            }

            // 查询Y代币余额
            const connection = this.solanaService.getConnection();
            const { PublicKey } = await import('@solana/web3.js');
            const { getAssociatedTokenAddress, getAccount, getMint } = await import('@solana/spl-token');

            const yTokenMint = new PublicKey(poolInfo.tokenY);
            const userPublicKey = userKeypair.publicKey;

            // 🔧 动态获取代币精度
            let tokenDecimals = 6; // 默认精度
            try {
                const mintInfo = await getMint(connection, yTokenMint);
                tokenDecimals = mintInfo.decimals;
            } catch (mintError) {
                // 使用默认精度，不记录日志避免冗余
            }

            // 获取关联代币账户地址
            const associatedTokenAccount = await getAssociatedTokenAddress(
                yTokenMint,
                userPublicKey
            );

            try {
                // 获取代币账户信息
                const tokenAccount = await getAccount(connection, associatedTokenAccount);
                const balance = tokenAccount.amount.toString();

                // 🔧 使用动态获取的精度转换为人类可读格式
                const humanReadableBalance = (parseFloat(balance) / Math.pow(10, tokenDecimals)).toString();

                await logger.logOperation('📊 简单Y-Y代币余额查询成功', {
                    yTokenMint: poolInfo.tokenY,
                    rawBalance: balance,
                    humanReadableBalance: humanReadableBalance,
                    decimals: tokenDecimals,
                    associatedTokenAccount: associatedTokenAccount.toString(),
                    instanceId: context.instanceId
                });

                return humanReadableBalance;

            } catch (accountError) {
                // 如果账户不存在，说明没有该代币
                await logger.logOperation('ℹ️ 简单Y-Y代币账户不存在，余额为0', {
                    yTokenMint: poolInfo.tokenY,
                    error: accountError instanceof Error ? accountError.message : String(accountError),
                    instanceId: context.instanceId
                });
                return '0';
            }

        } catch (error) {
            await logger.logError(`简单Y查询Y代币余额失败: ${error instanceof Error ? error.message : String(error)}`);
            return '0';
        }
    }

    /**
     * 🔧 修复：执行清理重试 - 使用主执行器的高级重试管理器
     */
    async executeCleanupRetry(context: SimpleYModuleContext): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);

        const retryCount = context.state.cleanupRetryCount || 0;
        const cleanupTargets = context.state.cleanupTargets || [];

        if (cleanupTargets.length === 0) {
            await logger.logOperation('ℹ️ 简单Y没有需要清理的目标', { instanceId: context.instanceId });
            return;
        }

        try {
            await logger.logOperation(`🧹 简单Y开始高级清理重试 (第${retryCount + 1}次)`, {
                cleanupTargets: cleanupTargets.map(addr => addr.substring(0, 8) + '...'),
                retryCount: retryCount,
                instanceId: context.instanceId,
                usingAdvancedRetry: true
            });

            // 🔥 使用主执行器的高级批量清理重试机制
            const { container } = await import('tsyringe');
            const { TYPES } = await import('../../../../types/interfaces');
            const simpleYExecutor = container.resolve<any>(TYPES.SimpleYExecutor);
            
            if (simpleYExecutor && simpleYExecutor.executeBatchCleanupWithAdvancedRetry) {
                await simpleYExecutor.executeBatchCleanupWithAdvancedRetry(
                    context.instanceId,
                    cleanupTargets,
                    (positionAddress: string) => this.cleanupSinglePositionCore(context, positionAddress),
                    retryCount
                );
            } else {
                // 回退到简单清理方式
                await logger.logOperation('⚠️ 无法获取高级重试能力，使用简单清理方式', {
                    instanceId: context.instanceId
                });
                for (const positionAddress of cleanupTargets) {
                    await this.cleanupSinglePosition(context, positionAddress);
                }
            }

            // 清理完全成功，更新状态
            await logger.logOperation('✅ 简单Y高级清理重试成功，进入创建重试状态', {
                instanceId: context.instanceId,
                usingAdvancedRetry: true
            });
            
            context.state.phase = 'CREATING';
            delete context.state.cleanupRetryCount;
            delete context.state.cleanupTargets;
            delete context.state.lastCleanupAttempt;

            // 清理状态中的头寸地址
            context.state.positionAddress = null;

        } catch (error) {
            // 🔧 智能错误处理：使用与连锁头寸策略一致的错误判断逻辑
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            // 智能判断：如果是头寸不存在类错误，视为清理成功
            if (this.isPositionNotExistError(errorMsg)) {
                await logger.logOperation('ℹ️ 简单Y头寸已不存在，清理视为成功', {
                    instanceId: context.instanceId,
                    error: errorMsg
                });
                
                context.state.phase = 'CREATING';
                delete context.state.cleanupRetryCount;
                delete context.state.cleanupTargets;
                delete context.state.lastCleanupAttempt;
                context.state.positionAddress = null;
                return;
            }

            // 真正的清理失败，更新重试计数
            context.state.cleanupRetryCount = retryCount + 1;
            context.state.lastCleanupAttempt = new Date();

            if (context.state.cleanupRetryCount >= 3) {
                await logger.logError(`🚨 简单Y高级清理重试次数超限(3次)，进入ERROR状态`);
                context.state.phase = 'ERROR';
            } else {
                await logger.logOperation('⚠️ 简单Y高级清理失败，等待下次重试', {
                    error: errorMsg,
                    nextRetryCount: context.state.cleanupRetryCount + 1,
                    instanceId: context.instanceId,
                    retryType: 'advanced_cleanup_retry'
                });
                // 保持CLEANING状态，等待下次监控循环重试
            }
        }
    }

    /**
     * 🆕 清理单个头寸 - 核心方法，供高级重试使用
     */
    async cleanupSinglePositionCore(context: SimpleYModuleContext, positionAddress: string): Promise<any> {
        const logger = this.getCachedLogger(context.instanceId);

        // 🔧 使用统一的重试机制包装
        const closeResult = await this.executeAsyncClosePositionWithRetry(
            async () => {
                // 获取PositionManager实例
                const { container } = await import('tsyringe');
                const positionManager = container.resolve<any>('PositionManager');
                
                const result = await positionManager.closePosition(positionAddress);
                if (!result.success) {
                    throw new Error(`简单Y头寸清理失败: ${result.error || '未知错误'}`);
                }
                return result;
            },
            context.instanceId,
            {
                maxAttempts: 3,
                retryableErrors: [
                    '头寸关闭失败', '交易验证超时', '交易失败',
                    'RPC_ERROR', 'NETWORK_ERROR', 'SLIPPAGE_ERROR',
                    'failed to get info about account', 'Position not found',
                    '头寸不存在', '不属于当前用户'
                ],
                delayMs: 15000 // 15秒间隔
            }
        );

        await logger.logOperation(`✅ 简单Y头寸清理成功`, {
            positionAddress: positionAddress.substring(0, 8) + '...',
            signature: closeResult.signature,
            instanceId: context.instanceId
        });

        return closeResult;
    }

    /**
     * 🆕 清理单个头寸 - 简化版本（保持向后兼容）
     */
    async cleanupSinglePosition(context: SimpleYModuleContext, positionAddress: string): Promise<any> {
        const logger = this.getCachedLogger(context.instanceId);

        await logger.logOperation(`🧹 简单Y开始清理头寸`, {
            positionAddress: positionAddress.substring(0, 8) + '...',
            instanceId: context.instanceId
        });

        return this.cleanupSinglePositionCore(context, positionAddress);
    }

    /**
     * 🆕 智能错误判断 - 与连锁头寸策略保持一致
     */
    private isPositionNotExistError(errorMsg: string): boolean {
        return errorMsg.includes('头寸不存在') ||
               errorMsg.includes('不属于当前用户') ||
               errorMsg.includes('position does not exist') ||
               errorMsg.includes('Position not found');
    }

    /**
     * 🆕 处理创建失败清理 - 从连锁头寸策略适配
     */
    async handleCreateFailureCleanup(context: SimpleYModuleContext, error: any): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);

        const errorMsg = error instanceof Error ? error.message : String(error);

        // 检查是否为部分创建成功的情况 - 简单Y策略通常只有一个头寸
        if (errorMsg.includes('头寸创建失败') || errorMsg.includes('Y头寸创建失败')) {
            // 解析可能成功创建的头寸地址
            const cleanupTargets: string[] = [];

            // 简化处理：如果有头寸地址存在，加入清理列表
            if (context.state.positionAddress) {
                cleanupTargets.push(context.state.positionAddress);
            }

            if (cleanupTargets.length > 0) {
                await logger.logOperation('🧹 简单Y检测到部分创建成功，启动清理流程', {
                    cleanupTargets: cleanupTargets.map(addr => addr.substring(0, 8) + '...'),
                    error: errorMsg,
                    instanceId: context.instanceId
                });

                // 初始化清理状态
                context.state.phase = 'CLEANING';
                context.state.cleanupRetryCount = 0;
                context.state.cleanupTargets = cleanupTargets;
                context.state.lastCleanupAttempt = new Date();

                // 立即尝试第一次清理
                await this.executeCleanupRetry(context);
            } else {
                // 没有需要清理的头寸，直接进入创建重试
                context.state.phase = 'CREATING';
                await logger.logOperation('📝 简单Y没有需要清理的头寸，进入创建重试状态', {
                    instanceId: context.instanceId
                });
            }
        } else {
            // 完全创建失败，直接进入创建重试
            context.state.phase = 'CREATING';
            await logger.logOperation('📝 简单Y完全创建失败，进入创建重试状态', { 
                error: errorMsg,
                instanceId: context.instanceId
            });
        }
    }

    // 私有Gas优化方法 - 已实现基础功能
    private async optimizeForStopLoss(): Promise<void> {
        try {
            await this.gasService.optimizeGasForOperation('stop_loss');
        } catch (error) {
            // 忽略Gas优化错误，使用默认设置
        }
    }

    private async optimizeForSwap(): Promise<void> {
        try {
            await this.gasService.optimizeGasForOperation('swap');
        } catch (error) {
            // 忽略Gas优化错误，使用默认设置
        }
    }

    private async optimizeForPositionCreation(): Promise<void> {
        try {
            await this.gasService.optimizeGasForOperation('position_creation');
        } catch (error) {
            // 忽略Gas优化错误，使用默认设置
        }
    }

    private async optimizeForPositionClose(): Promise<void> {
        try {
            await this.gasService.optimizeGasForOperation('position_close');
        } catch (error) {
            // 忽略Gas优化错误，使用默认设置
        }
    }

    private async optimizeGeneral(): Promise<void> {
        try {
            await this.gasService.optimizeGasForOperation('general');
        } catch (error) {
            // 忽略Gas优化错误，使用默认设置
        }
    }
} 