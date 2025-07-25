/**
 * 简单Y监控服务模块
 * 
 * 职责：
 * - 定时监控循环
 * - 市场数据收集和缓存
 * - 分析服务集成
 * - 监控框架显示
 */

import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { TYPES, ILoggerService, IDLMMMonitorService } from '../../../../types/interfaces';
import { ISimpleYMonitoringService, SimpleYModuleContext, ISimpleYUtilityService } from './types';
import { MarketData } from '../../../modules/SmartStopLossModule';
import { PositionAnalyticsService } from '../../../business/PositionAnalyticsService';
import { InstanceAwareServiceFactory } from '../../../business/InstanceAwareServiceFactory';
import { PositionSetupParams } from '../../../../types/analytics-types';

@injectable()
export class SimpleYMonitoringService implements ISimpleYMonitoringService {
    
    // 🔧 修复：移除定时器管理，只保留监控周期计数器（供主执行器使用）
    private monitoringCycleCounters: Map<string, number> = new Map();

    // 🔧 新增：策略日志器缓存，避免重复创建
    private strategyLoggerCache = new Map<string, any>();
    
    // 分析服务管理
    private positionAnalyticsServices: Map<string, PositionAnalyticsService> = new Map();
    private analyticsServiceSetup: Map<string, boolean> = new Map();
    
    // 市场数据缓存
    private instanceMarketDataCache: Map<string, {
        data: MarketData;
        timestamp: number;
        cycleId: number;
    }> = new Map();

    constructor(
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.DLMMMonitorService) private dlmmMonitor: IDLMMMonitorService,
        @inject(InstanceAwareServiceFactory) private instanceAwareServiceFactory: InstanceAwareServiceFactory
    ) {}

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
     * 启动监控
     */
    async startMonitoring(context: SimpleYModuleContext): Promise<void> {
        // 🔧 修复：只设置分析服务，不启动重复的监控循环
        // 监控循环由 SimpleYExecutor 统一管理
        await this.setupAnalyticsService(context);
        
        const logger = this.getCachedLogger(context.instanceId);
        await logger.logMonitoring('🔄 简单Y监控服务已启动（数据收集模式）', {
            instanceId: context.instanceId,
            monitoringInterval: context.config.monitoringInterval,
            positionAddress: context.state.positionAddress,
            note: '监控循环由主执行器管理，避免重复循环'
        });
    }

    /**
     * 停止监控
     */
    async stopMonitoring(context: SimpleYModuleContext): Promise<void> {
        // 🔧 修复：移除定时器管理，因为定时器在SimpleYExecutor中
        // 只清理数据缓存
        this.instanceMarketDataCache.delete(context.instanceId);
        this.monitoringCycleCounters.delete(context.instanceId);

        const logger = this.getCachedLogger(context.instanceId);
        await logger.logMonitoring('🛑 简单Y监控服务已停止', {
            instanceId: context.instanceId
        });
    }

    // 🔧 修复：移除 startMonitoringLoop 方法，避免重复监控循环

    /**
     * 执行监控周期 - 从主执行器迁移
     */
    async performMonitoringCycle(context: SimpleYModuleContext): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);

        // 🎯 监控周期开始框架
        await this.printMonitoringFrameStart(context.instanceId);

        // 🔥 递增监控周期计数器
        const currentCycle = (this.monitoringCycleCounters.get(context.instanceId) || 0) + 1;
        this.monitoringCycleCounters.set(context.instanceId, currentCycle);

        // 🔥 清除上一个周期的市场数据缓存
        this.instanceMarketDataCache.delete(context.instanceId);

        // 🔄 头寸重建重试：仅处理头寸重建失败的情况
        if (context.state.phase === 'STOPPING' && context.state.stoppingReason === 'POSITION_RECREATION') {
            await logger.logMonitoring('🔄 简单Y头寸重建重试机制触发', {
                currentPhase: context.state.phase,
                stoppingReason: context.state.stoppingReason,
                reason: '上次头寸重建未完成，执行重试'
            });

            // 重试头寸重建操作
            await this.executePositionRecreation(context);

            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(context.instanceId);
            return; // STOPPING状态下不执行正常监控
        }

        // 🛑 策略停止或止损过程中，跳过监控循环
        if (context.state.phase === 'STOPPED' || 
            (context.state.phase === 'STOPPING' &&
            (context.state.stoppingReason === 'STOP_LOSS' || context.state.stoppingReason === 'MANUAL_STOP'))) {
            await logger.logMonitoring('🛑 简单Y策略已停止或止损进行中，跳过监控循环', {
                currentPhase: context.state.phase,
                stoppingReason: context.state.stoppingReason,
                reason: context.state.phase === 'STOPPED' ? '策略已完全停止' : '止损操作进行中，暂停正常监控'
            });

            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(context.instanceId);
            return; // 停止状态下不执行任何监控
        }

        // CLEANING状态处理逻辑
        if (context.state.phase === 'CLEANING') {
            await logger.logMonitoring('🧹 检测到CLEANING状态，执行清理重试', {
                currentPhase: context.state.phase,
                cleanupRetryCount: context.state.cleanupRetryCount || 0,
                cleanupTargets: context.state.cleanupTargets?.length || 0
            });

            // 🔧 修复：调用清理重试方法
            const { container } = await import('tsyringe');
            const utilityService = container.resolve<any>('SimpleYUtilityService');
            if (utilityService && utilityService.executeCleanupRetry) {
                await utilityService.executeCleanupRetry(context);
            } else {
                await logger.logError('❌ SimpleYUtilityService不可用，跳过清理重试');
            }
            
            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(context.instanceId);
            return; // CLEANING状态下不执行正常监控
        }

        // 🔧 修复：策略停止检查 - 使用isActive状态替代phase检查
        if (!context.state.isActive) {
            await logger.logMonitoring('🛑 策略已停止，终止所有监控活动', {
                currentPhase: context.state.phase,
                isActive: context.state.isActive,
                stoppingReason: context.state.stoppingReason,
                reason: '策略已停止，停止所有业务逻辑'
            });
            
            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(context.instanceId);
            return;
        }

        // 正常监控状态检查
        if (context.state.phase !== 'MONITORING') {
            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(context.instanceId);
            return;
        }

        try {
            context.state.lastMonitoringTime = new Date();

            // 🔄 开始新的轮询周期
            const analyticsService = this.positionAnalyticsServices.get(context.instanceId);
            if (analyticsService) {
                // 获取UnifiedDataProvider并启动新轮询周期
                const unifiedDataProvider = (analyticsService as any).dataProvider;
                if (unifiedDataProvider && typeof unifiedDataProvider.startNewPollingCycle === 'function') {
                    unifiedDataProvider.startNewPollingCycle(context.config.monitoringInterval * 1000);

                    const pollingInfo = unifiedDataProvider.getCurrentPollingInfo();
                    await logger.logMonitoring('🔄 新轮询周期已启动', {
                        pollingCycle: pollingInfo.cycle,
                        pollingInterval: pollingInfo.interval,
                        monitoringInterval: context.config.monitoringInterval
                    });
                } else {
                    await logger.logError('❌ 无法访问UnifiedDataProvider，轮询周期管理失败');
                }
            } else {
                await logger.logError('❌ PositionAnalyticsService未初始化，无法启动轮询周期');
            }

            // 1. 获取当前活跃bin
            const currentActiveBin = await this.dlmmMonitor.getActiveBin(context.config.poolAddress);
            context.state.currentActiveBin = currentActiveBin;

            // 2. 检查活跃bin位置
            await this.checkActiveBinPosition(context);

            // 3. 更新动态重建开关状态（与连锁头寸策略完全一致）
            // 🔍 调试日志：检查动态重建开关配置
            await logger.logMonitoring('🔍 检查动态重建开关配置', {
                benchmarkYieldThreshold5Min: context.config.benchmarkYieldThreshold5Min,
                isThresholdValid: !!(context.config.benchmarkYieldThreshold5Min && context.config.benchmarkYieldThreshold5Min > 0),
                currentSwitchEnabled: context.state.dynamicRecreationSwitchEnabled,
                lastBenchmarkYield5Min: context.state.lastBenchmarkYield5Min,
                lastSwitchUpdateTime: context.state.lastSwitchUpdateTime
            });
            
            if (context.config.benchmarkYieldThreshold5Min && context.config.benchmarkYieldThreshold5Min > 0) {
                try {
                    const marketData = await this.collectMarketData(context);
                    const benchmarkYield5Min = marketData.benchmarkYieldRates?.average15MinuteBenchmark;
                    
                    // 🔍 详细调试日志：数据获取和比较（与连锁头寸策略一致）
                    await logger.logMonitoring('🔍 动态重建开关数据分析', {
                        benchmarkYield5Min: benchmarkYield5Min,
                        threshold: context.config.benchmarkYieldThreshold5Min,
                        isDataValid: benchmarkYield5Min !== null && benchmarkYield5Min !== undefined,
                        comparisonResult: benchmarkYield5Min !== null && benchmarkYield5Min !== undefined ? 
                            (benchmarkYield5Min < context.config.benchmarkYieldThreshold5Min ? '低于阈值(开关开启)' : '高于阈值(开关关闭)') : 
                            '数据无效',
                        willUpdateSwitch: benchmarkYield5Min !== null && benchmarkYield5Min !== undefined
                    });
                    
                    // 🔧 调用SimpleYUtilityService的动态重建开关更新方法
                    const { container } = await import('tsyringe');
                    const utilityService = container.resolve<any>('SimpleYUtilityService');
                    if (utilityService && utilityService.updateDynamicRecreationSwitch) {
                        await utilityService.updateDynamicRecreationSwitch(context, benchmarkYield5Min);
                    } else {
                        await logger.logMonitoring('⚠️ SimpleYUtilityService不可用，跳过动态开关更新', {
                            benchmarkYield5Min
                        });
                    }
                } catch (error) {
                    await logger.logError(`更新动态重建开关状态失败: ${error instanceof Error ? error.message : String(error)}`);
                }
            } else {
                await logger.logMonitoring('⚠️ 动态重建开关功能未启用', {
                    benchmarkYieldThreshold5Min: context.config.benchmarkYieldThreshold5Min,
                    reason: !context.config.benchmarkYieldThreshold5Min ? '阈值未配置' : '阈值为0或负数'
                });
            }

        } catch (error) {
            await logger.logError(`监控周期执行失败: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(context.instanceId);

            // 🔧 清理当前周期的市场数据缓存
            this.instanceMarketDataCache.delete(context.instanceId);
        }
    }

    /**
     * 🆕 处理重建决策结果 - 从连锁头寸策略适配
     */
    private async executeRecreationAction(context: SimpleYModuleContext, decision: any): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);

        // 🔥 触发正常头寸重建：首次检测到需要重建
        if (decision.shouldRecreate) {
            await logger.logOperation('🚨 简单Y头寸重建触发', {
                activeBin: context.state.currentActiveBin,
                positionRange: context.state.positionRange,
                reason: decision.reason,
                action: '即将关闭头寸并重新创建'
            });

            // 🛑 执行头寸重建主流程
            const { container } = await import('tsyringe');
            const positionService = container.resolve<any>('SimpleYPositionService');
            const instanceAwareServiceFactory = container.resolve(InstanceAwareServiceFactory);
            
            if (positionService && positionService.recreatePosition) {
                const result = await positionService.recreatePosition(context, instanceAwareServiceFactory);
                
                if (result.success) {
                    await logger.logOperation('✅ 简单Y头寸重建执行成功', {
                        newPositionAddress: result.newPositionAddress,
                        instanceId: context.instanceId
                    });
                } else {
                    await logger.logError(`简单Y头寸重建执行失败: ${result.error || '未知错误'}`);
                }
            } else {
                await logger.logError('❌ SimpleYPositionService不可用，跳过头寸重建');
            }
            return;
        }

        // 🔥 处理价格检查失败的情况
        if (decision.recreationType === 'PRICE_CHECK_FAILED' && decision.priceCheckDetails?.shouldKeepPosition) {
            await logger.logOperation('🚫 简单Y价格超过上限，保持头寸不关闭', {
                currentPrice: decision.priceCheckDetails.currentPrice,
                maxPriceLimit: decision.priceCheckDetails.maxPriceLimit,
                reason: '价格过高，保持现有头寸继续运行',
                action: '继续监控状态'
            });
            return;
        }

        // 🔥 其他情况（如开始计时、持续超出范围等）的日志记录
        if (decision.outOfRangeDetails) {
            const details = decision.outOfRangeDetails;

            if (details.shouldStartTimeout) {
                await logger.logOperation('❌ 简单Y活跃bin脱离头寸范围', {
                    activeBin: context.state.currentActiveBin,
                    positionRange: context.state.positionRange,
                    direction: details.direction === 'ABOVE' ? '向上超出' : '向下超出',
                    action: '开始计时'
                });
            } else if (details.timeElapsed && details.timeRemaining) {
                const outOfRangeMinutes = details.timeElapsed / 60;
                await logger.logMonitoring('⏰ 简单Y活跃bin持续超出范围', {
                    activeBin: context.state.currentActiveBin,
                    positionRange: context.state.positionRange,
                    direction: details.direction === 'ABOVE' ? '向上超出' : '向下超出',
                    outOfRangeTime: `${outOfRangeMinutes.toFixed(2)}分钟 (${details.timeElapsed}秒)`,
                    timeoutThreshold: `${context.config.outOfRangeTimeout}秒`,
                    timeRemaining: `${details.timeRemaining}秒`
                });
            }
        }

        // 🔥 处理回到范围内的情况
        if (context.state.isInRange && decision.recreationType === 'OUT_OF_RANGE' && decision.confidence === 0) {
            await logger.logMonitoring('✅ 简单Y活跃bin回到头寸范围内', {
                activeBin: context.state.currentActiveBin,
                positionRange: context.state.positionRange
            });
        }
    }

    /**
     * 🆕 执行头寸重建 - 委托给头寸服务处理
     */
    async executePositionRecreation(context: SimpleYModuleContext): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);
        
        try {
            // 委托给头寸服务执行重建
            const { container } = await import('tsyringe');
            const positionService = container.resolve<any>('SimpleYPositionService');
            const instanceAwareServiceFactory = container.resolve(InstanceAwareServiceFactory);
            
            if (positionService && positionService.recreatePosition) {
                const result = await positionService.recreatePosition(context, instanceAwareServiceFactory);
                
                if (result.success) {
                    await logger.logOperation('✅ 简单Y头寸重建重试成功', {
                        newPositionAddress: result.newPositionAddress,
                        instanceId: context.instanceId
                    });
                } else {
                    await logger.logError(`简单Y头寸重建重试失败: ${result.error || '未知错误'}`);
                }
            } else {
                await logger.logError('❌ SimpleYPositionService不可用，跳过头寸重建重试');
            }
        } catch (error) {
            await logger.logError(`简单Y头寸重建重试异常: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 收集市场数据 - 完整复刻连锁头寸策略的实现
     */
    async collectMarketData(context: SimpleYModuleContext): Promise<MarketData> {
        const currentCycle = this.monitoringCycleCounters.get(context.instanceId) || 0;
        const logger = this.getCachedLogger(context.instanceId);

        // 🔒 首先检查收益提取状态，如果正在提取则直接返回缓存数据（无论cycleId）
        const analyticsService = this.positionAnalyticsServices.get(context.instanceId);
        if (analyticsService) {
            const extractionStatus = analyticsService.getExtractionStatus();
            if (extractionStatus.status === 'EXTRACTING') {
                const cachedData = this.instanceMarketDataCache.get(context.instanceId);
                if (cachedData) {
                    await logger.logMonitoring('🔒 收益提取进行中，使用缓存数据跳过计算', {
                        extractionStatus: extractionStatus.status,
                        lastExtractionTime: extractionStatus.lastExtractionTime,
                        cycleId: currentCycle,
                        reason: '防止收益提取期间重复计算'
                    });
                    return cachedData.data;
                } else {
                    await logger.logMonitoring('⚠️ 收益提取进行中但无缓存数据，生成简化数据', {
                        extractionStatus: extractionStatus.status,
                        cycleId: currentCycle
                    });
                    return await this.generateSimplifiedMarketData(context);
                }
            }
        }

        // 🔧 检查是否有当前周期的缓存数据（仅在非提取状态下使用）
        const cachedData = this.instanceMarketDataCache.get(context.instanceId);
        if (cachedData && cachedData.cycleId === currentCycle) {
            await logger.logMonitoring('📊 使用缓存的市场数据', {
                cycleId: currentCycle,
                cacheAge: Date.now() - cachedData.timestamp,
                reason: '防止重复调用PositionAnalyticsService'
            });
            return cachedData.data;
        }

        try {
            // 🎯 尝试使用完整的PositionAnalyticsService
            if (analyticsService) {
                await logger.logMonitoring('📊 开始调用PositionAnalyticsService获取分析数据', {
                    poolAddress: context.config.poolAddress,
                    positionAddress: context.state.positionAddress, // 简单Y只有一个头寸
                    cycleId: currentCycle
                });

                try {
                    // 🔧 更新服务访问时间，防止被误清理
                    this.instanceAwareServiceFactory.getInstanceContainer(context.instanceId);

                    // 🔥 只调用一次PositionAnalyticsService获取智能止损数据（避免重复日志）
                    const smartStopLossData = await analyticsService.getSmartStopLossData('简单Y策略监控');

                    await logger.logMonitoring('✅ PositionAnalyticsService数据获取成功', {
                        currentPrice: smartStopLossData.currentPrice,
                        positionValue: smartStopLossData.positionValue,
                        netPnL: smartStopLossData.netPnL,
                        netPnLPercentage: smartStopLossData.netPnLPercentage,
                        activeBin: smartStopLossData.activeBin,
                        positionLowerBin: smartStopLossData.positionLowerBin,
                        positionUpperBin: smartStopLossData.positionUpperBin,
                        holdingDuration: smartStopLossData.holdingDuration
                    });

                    // 🔥 获取完整分析报告，包含收益数据
                    try {
                        // 🎯 记录收益数据获取开始（监控轮询）
                        await logger.logMonitoring('收益数据获取开始', {
                            poolAddress: context.config.poolAddress,
                            positionAddress: context.state.positionAddress
                        });

                        const completeReport = await analyticsService.getCompleteAnalyticsReport();

                        // 🎯 记录收益数据获取完成（监控轮询）
                        await logger.logMonitoring('收益数据获取完成', {
                            currentPendingYield: completeReport.yieldStatistics.currentPendingYield,
                            totalExtractedYield: completeReport.yieldStatistics.totalExtractedYield
                        });

                        await logger.logMonitoring('开始获取完整分析报告 - 使用统一数据流', {
                            poolAddress: context.config.poolAddress,
                            positionAddress: context.state.positionAddress
                        });

                        // 🔧 构建MarketData，包含收益数据
                        const marketData: MarketData = {
                            ...smartStopLossData,
                            // 🔥 新增：收益数据
                            currentPendingYield: completeReport.yieldStatistics.currentPendingYield,
                            totalExtractedYield: completeReport.yieldStatistics.totalExtractedYield,
                            // 🔥 新增：历史价格变化数据
                            historicalPriceChanges: smartStopLossData.historicalPriceChanges || {
                                last5Minutes: 0,
                                last15Minutes: 0,
                                lastHour: 0
                            },
                            // 🔥 新增：历史收益率数据
                            historicalYieldRates: smartStopLossData.historicalYieldRates || {
                                totalReturnRate: 0,
                                feeYieldEfficiency: {
                                    last5Minutes: 0,
                                    last15Minutes: 0,
                                    lastHour: 0
                                },
                                recentSnapshots: []
                            },
                            // 🔥 新增：基准收益率数据（如果存在）
                            ...(smartStopLossData.benchmarkYieldRates && { benchmarkYieldRates: smartStopLossData.benchmarkYieldRates }),
                            // 🔥 新增：动态重建开关状态
                            dynamicRecreationSwitchEnabled: context.state.dynamicRecreationSwitchEnabled || false
                        };

                        // 🔧 缓存市场数据，防止重复调用
                        this.instanceMarketDataCache.set(context.instanceId, {
                            data: marketData,
                            timestamp: Date.now(),
                            cycleId: currentCycle
                        });

                        return marketData;

                    } catch (reportError) {
                        // 🎯 记录收益数据获取失败（监控轮询）
                        await logger.logMonitoring('收益数据获取失败', {
                            error: reportError instanceof Error ? reportError.message : String(reportError)
                        });

                        await logger.logError(`获取完整分析报告失败: ${reportError instanceof Error ? reportError.message : String(reportError)}`);
                        // 如果完整分析失败，返回基础数据
                        const basicMarketData: MarketData = {
                            ...smartStopLossData,
                            currentPendingYield: '0',
                            totalExtractedYield: '0',
                            historicalPriceChanges: {
                                last5Minutes: 0,
                                last15Minutes: 0,
                                lastHour: 0
                            },
                            historicalYieldRates: {
                                totalReturnRate: 0,
                                feeYieldEfficiency: {
                                    last5Minutes: 0,
                                    last15Minutes: 0,
                                    lastHour: 0
                                },
                                recentSnapshots: []
                            },
                            // 🔥 新增：动态重建开关状态
                            dynamicRecreationSwitchEnabled: context.state.dynamicRecreationSwitchEnabled || false
                        };

                        // 缓存基础数据
                        this.instanceMarketDataCache.set(context.instanceId, {
                            data: basicMarketData,
                            timestamp: Date.now(),
                            cycleId: currentCycle
                        });

                        return basicMarketData;
                    }

                } catch (serviceError) {
                    await logger.logError(`PositionAnalyticsService调用失败: ${serviceError instanceof Error ? serviceError.message : String(serviceError)}`);
                    throw serviceError;
                }
            } else {
                // 如果没有分析服务，使用简化数据收集
                return await this.collectSimpleMarketData(context);
            }

        } catch (error) {
            await logger.logError(`收集市场数据失败: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * 设置分析服务
     */
    async setupAnalyticsService(context: SimpleYModuleContext): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);

        try {
            // 构建头寸设置参数
            const positionAddresses: string[] = [];
            if (context.state.positionAddress) positionAddresses.push(context.state.positionAddress);

            // 获取代币精度信息
            const tokenPrecision = await this.getTokenPrecision(context);

            const setupParams: PositionSetupParams = {
                poolAddress: context.config.poolAddress,
                positionAddresses: positionAddresses,
                initialInvestmentAmount: context.config.positionAmount.toString(),
                tokenPrecision: tokenPrecision,
                config: {
                    priceMonitorInterval: (context.config.monitoringInterval || 30) * 1000,
                    trendAnalysisTimeframes: [5, 15, 30, 60],
                    priceDropThresholds: [
                        { timeframe: 5, threshold: 5, enabled: true },
                        { timeframe: 15, threshold: 10, enabled: true },
                        { timeframe: 60, threshold: 20, enabled: true }
                    ],
                    yieldCalculationInterval: 60000,
                    yieldExtractionThreshold: context.config.yieldExtractionThreshold ? String(context.config.yieldExtractionThreshold) : '10',
                    yieldExtractionTimeLock: context.config.yieldExtractionTimeLock !== undefined ? context.config.yieldExtractionTimeLock : 1,
                    projectionTimeframe: 5,
                    maxHistoryDays: 7,
                    cleanupInterval: 3600000,
                    maxRetries: 3,
                    retryDelay: 1000,
                    logLevel: 'INFO',
                    logPerformance: true
                }
            };

            // 设置头寸监控
            const analyticsService = await this.getOrCreatePositionAnalyticsService(context.instanceId);
            await analyticsService.setupPositionMonitoring(setupParams);
            this.analyticsServiceSetup.set(context.instanceId, true);

            await logger.logMonitoring('📊 头寸分析服务已设置', {
                poolAddress: setupParams.poolAddress,
                positionCount: positionAddresses.length,
                positionAddresses: positionAddresses,
                initialInvestment: setupParams.initialInvestmentAmount
            });

        } catch (error) {
            await logger.logError(`头寸分析服务设置失败: ${error instanceof Error ? error.message : String(error)}`);
            this.analyticsServiceSetup.set(context.instanceId, false);
            throw error;
        }
    }

    /**
     * 🔧 修复：获取或创建实例专用的PositionAnalyticsService，避免重复日志器创建
     */
    private async getOrCreatePositionAnalyticsService(instanceId: string): Promise<PositionAnalyticsService> {
        let analyticsService = this.positionAnalyticsServices.get(instanceId);

        if (!analyticsService) {
            analyticsService = await this.instanceAwareServiceFactory.createAnalyticsServiceForInstance(instanceId);

            // 🔧 使用缓存的策略日志器，避免重复创建
            const strategyLogger = this.getCachedLogger(instanceId);
            analyticsService.setStrategyLogger(strategyLogger);

            this.positionAnalyticsServices.set(instanceId, analyticsService);

            // 只在首次创建时记录日志
            await strategyLogger.logMonitoring('🏭 实例专用分析服务已创建', {
                instanceId,
                serviceType: 'PositionAnalyticsService',
                dataIsolation: true,
                factoryManaged: true
            });
        } else {
            // 更新访问时间，防止被误清理
            const container = this.instanceAwareServiceFactory.getInstanceContainer(instanceId);
            if (container) {
                container.lastAccessedAt = Date.now();
            }
        }

        return analyticsService;
    }

    /**
     * 检查活跃bin位置 - 完整版本，包含头寸重建决策
     */
    private async checkActiveBinPosition(context: SimpleYModuleContext): Promise<void> {
        const logger = this.getCachedLogger(context.instanceId);
        
        if (!context.state.positionRange || context.state.currentActiveBin === null) {
            await logger.logMonitoring('⚠️ 缺少头寸范围或活跃bin数据，跳过位置检查', {
                positionRange: context.state.positionRange,
                currentActiveBin: context.state.currentActiveBin
            });
            return;
        }

        // 🚨 收益提取期间跳过业务逻辑，避免使用错误盈亏数据
        const analyticsService = this.positionAnalyticsServices.get(context.instanceId);
        if (analyticsService) {
            const extractionStatus = analyticsService.getExtractionStatus();
            if (extractionStatus.status === 'EXTRACTING') {
                await logger.logMonitoring('🔒 收益提取进行中，跳过简单Y头寸重建检查', {
                    extractionStatus: extractionStatus.status,
                    reason: '防止错误盈亏数据触发误操作'
                });
                return;
            }
        }

        const [lowerBin, upperBin] = context.state.positionRange;
        const activeBin = context.state.currentActiveBin;
        const wasInRange = context.state.isInRange;
        context.state.isInRange = activeBin >= lowerBin && activeBin <= upperBin;

        await logger.logMonitoring('🔍 活跃bin位置检查', {
            activeBin,
            positionRange: `[${lowerBin}, ${upperBin}]`,
            isInRange: context.state.isInRange,
            wasInRange,
            statusChanged: wasInRange !== context.state.isInRange
        });

        // 如果状态发生变化，记录详细信息
        if (wasInRange !== context.state.isInRange) {
            if (context.state.isInRange) {
                await logger.logMonitoring('✅ 头寸重新进入范围', {
                    activeBin,
                    positionRange: `[${lowerBin}, ${upperBin}]`
                });
            } else {
                await logger.logMonitoring('⚠️ 头寸脱离范围', {
                    activeBin,
                    positionRange: `[${lowerBin}, ${upperBin}]`,
                    outOfRangeTimeout: context.config.outOfRangeTimeout
                });
            }
        }

        // 🔥 添加头寸重建决策逻辑 - 与连锁头寸策略完全一致
        await logger.logMonitoring('🚀 开始执行头寸重建检查', {
            instanceId: context.instanceId,
            activeBin: context.state.currentActiveBin,
            positionRange: context.state.positionRange
        });
        
        try {
            await logger.logMonitoring('🔥 开始收集市场数据', {
                instanceId: context.instanceId
            });

            // 🔥 收集市场数据
            const marketData = await this.collectMarketData(context);

            await logger.logMonitoring('✅ 市场数据收集完成', {
                instanceId: context.instanceId,
                hasMarketData: !!marketData
            });

            // 🔥 委托给头寸服务进行重建决策
            const { container } = await import('tsyringe');
            
            await logger.logMonitoring('🔥 开始解析头寸服务', {
                instanceId: context.instanceId
            });
            
            const positionService = container.resolve<any>('SimpleYPositionService');

            await logger.logMonitoring('🔥 头寸服务解析完成', {
                instanceId: context.instanceId,
                hasPositionService: !!positionService,
                hasShouldRecreateMethod: !!(positionService && positionService.shouldRecreatePosition)
            });
            
            if (positionService && positionService.shouldRecreatePosition) {
                await logger.logMonitoring('🔥 开始调用shouldRecreatePosition', {
                    instanceId: context.instanceId
                });
                
                const decision = await positionService.shouldRecreatePosition(context, marketData);
                
                await logger.logMonitoring('🔥 shouldRecreatePosition决策完成', {
                    instanceId: context.instanceId,
                    decision: decision
                });
                
                // 🔥 处理重建决策结果
                await logger.logMonitoring('🔥 开始执行重建决策', {
                    instanceId: context.instanceId,
                    decision: decision
                });
                
                await this.executeRecreationAction(context, decision);

                await logger.logMonitoring('✅ 重建决策执行完成', {
                    instanceId: context.instanceId
                });
            } else {
                await logger.logMonitoring('❌ SimpleYPositionService不可用或方法不存在', {
                    instanceId: context.instanceId,
                    hasPositionService: !!positionService,
                    hasMethod: !!(positionService && positionService.shouldRecreatePosition)
                });
                
                await logger.logError('❌ SimpleYPositionService不可用，跳过头寸重建检查');
            }
        } catch (error) {
            await logger.logMonitoring('❌ 头寸重建检查发生异常', {
                error: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                instanceId: context.instanceId
            });
            
            await logger.logError(`头寸重建检查失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async collectSimpleMarketData(context: SimpleYModuleContext): Promise<MarketData> {
        // 简化的市场数据收集
        const activeBin = await this.dlmmMonitor.getActiveBin(context.config.poolAddress);
        const halfRange = Math.floor(context.config.binRange / 2);

        return {
            currentPrice: 0,
            priceHistory: [],
            priceVolatility: 0,
            priceDropPercentage: 0,
            totalReturn: 0,
            yieldRate: 0,
            yieldTrend: 'stable' as const,
            yieldGrowthRate: 0,
            currentPendingYield: '0',
            totalExtractedYield: '0',
            positionValue: context.config.positionAmount,
            initialInvestment: context.config.positionAmount,
            netPnL: 0,
            netPnLPercentage: 0,
            activeBin,
            positionLowerBin: activeBin - halfRange,
            positionUpperBin: activeBin + halfRange,
            holdingDuration: (Date.now() - context.state.createdAt.getTime()) / (1000 * 60 * 60),
            lastUpdateTime: Date.now(),
            dynamicRecreationSwitchEnabled: context.state.dynamicRecreationSwitchEnabled || false
        };
    }

    /**
     * 🔒 生成简化的市场数据（用于收益提取期间）
     */
    private async generateSimplifiedMarketData(context: SimpleYModuleContext): Promise<MarketData> {
        try {
            // 获取基础数据
            const poolData = await this.dlmmMonitor.getPoolInfo(context.config.poolAddress);
            const currentPrice = poolData.activePrice;

            // 计算简单Y头寸的bin范围
            const activeBin = await this.dlmmMonitor.getActiveBin(context.config.poolAddress);
            const halfRange = Math.floor(context.config.binRange / 2);

            return {
                // 价格相关
                currentPrice,
                priceHistory: [],
                priceVolatility: 0,
                priceDropPercentage: 0,

                // 收益相关（提取期间设为0）
                totalReturn: 0,
                yieldRate: 0,
                yieldTrend: 'stable' as const,
                yieldGrowthRate: 0,

                // 🔒 手续费数据（提取期间设为0，避免重复触发）
                currentPendingYield: '0',
                totalExtractedYield: '0',

                // 头寸相关
                positionValue: context.config.positionAmount,
                initialInvestment: context.config.positionAmount,
                netPnL: 0,
                netPnLPercentage: 0,

                // 核心bin数据
                activeBin,
                positionLowerBin: activeBin - halfRange,
                positionUpperBin: activeBin + halfRange,

                // 时间相关
                holdingDuration: (Date.now() - context.state.createdAt.getTime()) / (1000 * 60 * 60),
                lastUpdateTime: Date.now(),

                // 🔥 新增：动态重建开关状态
                dynamicRecreationSwitchEnabled: context.state.dynamicRecreationSwitchEnabled || false
            };
        } catch (error) {
            // 出错时返回最基本的默认值
            return {
                currentPrice: 0,
                priceHistory: [],
                priceVolatility: 0,
                priceDropPercentage: 0,
                totalReturn: 0,
                yieldRate: 0,
                yieldTrend: 'stable' as const,
                yieldGrowthRate: 0,
                currentPendingYield: '0',
                totalExtractedYield: '0',
                positionValue: context.config.positionAmount,
                initialInvestment: context.config.positionAmount,
                netPnL: 0,
                netPnLPercentage: 0,
                activeBin: 0,
                positionLowerBin: -Math.floor(context.config.binRange / 2),
                positionUpperBin: Math.floor(context.config.binRange / 2),
                holdingDuration: (Date.now() - context.state.createdAt.getTime()) / (1000 * 60 * 60),
                lastUpdateTime: Date.now(),
                dynamicRecreationSwitchEnabled: context.state.dynamicRecreationSwitchEnabled || false
            };
        }
    }

    /**
     * 🔧 修复：获取代币精度信息 - 使用工具服务的真实精度获取
     */
    private async getTokenPrecision(context: SimpleYModuleContext): Promise<{
        tokenXDecimals: number;
        tokenYDecimals: number;
        tokenXMint: string;
        tokenYMint: string;
    }> {
        const logger = this.getCachedLogger(context.instanceId);
        
        try {
            // 🔧 修复：使用工具服务的真实精度获取，而不是硬编码
            const { container } = await import('tsyringe');
            const utilityService = container.resolve<any>('SimpleYUtilityService');
            const precisionInfo = await utilityService.getTokenPrecision(context);

            await logger.logMonitoring('✅ 监控服务使用真实代币精度', {
                instanceId: context.instanceId,
                tokenXDecimals: precisionInfo.tokenXDecimals,
                tokenYDecimals: precisionInfo.tokenYDecimals,
                tokenXMint: precisionInfo.tokenXMint,
                tokenYMint: precisionInfo.tokenYMint,
                source: 'SimpleYUtilityService'
            });

            return precisionInfo;

        } catch (error) {
            await logger.logError(`监控服务获取代币精度失败: ${error instanceof Error ? error.message : String(error)}`);
            
            // 返回默认值（只在异常情况下使用）
            return {
                tokenXDecimals: 6,
                tokenYDecimals: 6,
                tokenXMint: '',
                tokenYMint: ''
            };
        }
    }

    /**
     * 🎯 打印监控周期开始框架
     */
    private async printMonitoringFrameStart(instanceId: string): Promise<void> {
        const logger = this.getCachedLogger(instanceId);

        const timestamp = new Date().toLocaleTimeString('zh-CN');
        const frameWidth = 60;
        const title = `简单Y头寸策略监控 [${instanceId.slice(-8)}] - ${timestamp}`;
        const padding = Math.max(0, frameWidth - title.length - 2);
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;

        await logger.logMonitoring('monitoring-frame-start', `┌${'─'.repeat(frameWidth - 2)}┐`);
        await logger.logMonitoring('monitoring-frame-title', `│${' '.repeat(leftPad)}${title}${' '.repeat(rightPad)}│`);
        await logger.logMonitoring('monitoring-frame-separator', `├${'─'.repeat(frameWidth - 2)}┤`);
    }

    /**
     * 🎯 打印监控周期结束框架
     */
    private async printMonitoringFrameEnd(instanceId: string): Promise<void> {
        const logger = this.getCachedLogger(instanceId);

        const frameWidth = 60;
        await logger.logMonitoring('monitoring-frame-end', `└${'─'.repeat(frameWidth - 2)}┘`);
        await logger.logMonitoring('monitoring-frame-space', ''); // 空行分隔
    }
} 