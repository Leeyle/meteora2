/**
 * 🔗 连锁头寸策略执行器 v2.0 - 事件驱动架构
 * 
 * 架构设计：
 * 1. execute() 只负责一次性创建头寸
 * 2. 创建成功后自动启动事件驱动监控
 * 3. 监控通过定时器 + 智能止损模块实现
 * 4. 止损决策通过事件总线触发相应操作
 */

import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { TYPES, ILoggerService, IEventBus, IStrategyLogger, IPositionManager, IDLMMMonitorService, ISolanaWeb3Service, IWalletService, IJupiterService, IGasService } from '../../../types/interfaces';
import { IStrategyExecutor, ExecutorStatus } from '../StrategyRegistry';
import { ChainPositionManager } from '../../business/ChainPositionManager';
import { SmartStopLossModule, MarketData } from '../../modules/SmartStopLossModule';
import { PositionRecreationModule, PositionRecreationConfig, RecreationCheckParams, RecreationDecision } from '../../modules/PositionRecreationModule';
import { PositionAnalyticsService } from '../../business/PositionAnalyticsService';
import { PositionSetupParams, AnalyticsReport } from '../../../types/analytics-types';
import { AccumulatedYieldManager } from '../../business/analytics/AccumulatedYieldManager';
import { SynchronousRetryMixin } from './mixins/SynchronousRetryMixin';
import { InstanceAwareServiceFactory } from '../../business/InstanceAwareServiceFactory';

// 连锁头寸策略配置接口
export interface ChainPositionConfig {
    poolAddress: string;
    chainPositionType: 'Y_CHAIN' | 'X_CHAIN' | 'DUAL_CHAIN';
    positionAmount: number;
    binRange: number;
    monitoringInterval: number;
    outOfRangeTimeout: number;
    yieldExtractionThreshold?: string; // 收益提取阈值，可选参数
    maxPriceForRecreation?: number;    // 重新创建头寸的最大价格上限，可选参数
    enableSmartStopLoss: boolean;
    stopLossConfig?: any; // 兼容旧配置
    stopLoss?: {         // 新的前端配置路径
        activeBinSafetyThreshold?: number;
        observationPeriodMinutes?: number;
        lossThresholdPercentage?: number;
    };
    smartStopLoss?: {    // 智能止损配置路径
        activeBinSafetyThreshold?: number;
        observationPeriodMinutes?: number;
        lossThresholdPercentage?: number;
    };

    // 🏗️ 头寸重建配置
    positionRecreation?: {
        enableMarketOpportunityRecreation?: boolean;    // 方法2：智能头寸重建
        enableLossRecoveryRecreation?: boolean;         // 方法3：止损后反弹重建
        marketOpportunity?: {
            positionThreshold?: number;      // 活跃bin位置阈值(%)，默认70
            profitThreshold?: number;        // 盈利阈值(%)，默认1
        };
        lossRecovery?: {
            markPositionThreshold?: number;      // 标记时位置阈值(%)，默认65
            markLossThreshold?: number;          // 标记时亏损阈值(%)，默认0.5
            triggerPositionThreshold?: number;   // 触发时位置阈值(%)，默认70
            triggerProfitThreshold?: number;     // 触发时盈利阈值(%)，默认0.5
        };
    };
}

// 策略状态接口 - 简化，移除决策相关状态
export interface ChainPositionState {
    instanceId: string;
    config: ChainPositionConfig;
    phase: 'CREATED' | 'CREATING' | 'MONITORING' | 'ANALYZING' | 'STOPPING' | 'STOPPED' | 'ERROR' | 'CLEANING';
    position1Address?: string | null;
    position2Address?: string | null;
    positionRange: [number, number] | null;
    currentActiveBin: number | null;
    isInRange: boolean;
    createdAt: Date;
    lastMonitoringTime: Date | null;
    isActive: boolean;
    hasBeenCreated: boolean; // 🔑 关键标志：防止重复创建

    // 🔥 新增：区分不同的STOPPING原因
    stoppingReason?: 'STOP_LOSS' | 'POSITION_RECREATION' | 'MANUAL_STOP' | 'USER_STOP' | null;

    // 🔥 清理重试相关字段（保留，因为这是执行器级别的状态）
    cleanupRetryCount?: number;           // 清理重试次数
    cleanupTargets?: string[];            // 需要清理的头寸地址
    lastCleanupAttempt?: Date;            // 上次清理尝试时间
}

/**
 * 🔗 连锁头寸策略执行器 (已修复 - 使用ChainPositionManager)
 * 
 * ✅ 修复说明：
 * - 不再使用有问题的 PositionManager.createPosition()
 * - 改用专门的 ChainPositionManager.createChainPosition()
 * - 支持真正的138个bin连锁头寸创建
 * - 正确处理两个头寸地址的状态管理
 * 
 * 🎯 功能特性：
 * - 自动创建连锁头寸（两个连续的69个bin头寸）
 * - 差异化资金分配策略（20%-60%-20%）
 * - 实时监控和范围检查
 * - 智能止损和重新创建机制
 */
@injectable()
export class ChainPositionExecutor extends SynchronousRetryMixin implements IStrategyExecutor {

    getType(): string {
        return 'chain_position';
    }

    getVersion(): string {
        return 'vv2.0.0-event-driven';
    }

    async initialize(config: ChainPositionConfig): Promise<void> {
        // 执行器级别的初始化（如果需要）
    }

    // 实例状态管理
    private instanceStates: Map<string, ChainPositionState> = new Map();
    private instanceConfigs: Map<string, ChainPositionConfig> = new Map();
    private executorStatuses: Map<string, ExecutorStatus> = new Map();
    private instanceLoggers: Map<string, IStrategyLogger> = new Map();
    private smartStopLossModules: Map<string, SmartStopLossModule> = new Map();
    private positionRecreationModules: Map<string, PositionRecreationModule> = new Map(); // 🔥 新增：头寸重建模块
    private monitoringTimers: Map<string, NodeJS.Timeout> = new Map();
    private analyticsServiceSetup: Map<string, boolean> = new Map(); // 跟踪分析服务设置状态
    private positionAnalyticsServices: Map<string, PositionAnalyticsService> = new Map(); // 🔑 每个实例独立的分析服务

    // 🔧 新增：策略实例级别的代币精度缓存
    private instanceTokenPrecisionCache: Map<string, {
        tokenXDecimals: number;
        tokenYDecimals: number;
        tokenXMint: string;
        tokenYMint: string;
        cachedAt: number;
    }> = new Map();

    constructor(
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.PositionManager) private positionManager: IPositionManager,
        @inject(TYPES.DLMMMonitorService) private dlmmMonitor: IDLMMMonitorService,
        @inject(TYPES.EventBus) private eventBus: IEventBus,
        @inject(ChainPositionManager) private chainPositionManager: ChainPositionManager,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        @inject(TYPES.WalletService) private walletService: IWalletService,
        @inject(TYPES.JupiterService) private jupiterService: IJupiterService,
        @inject(InstanceAwareServiceFactory) private instanceAwareServiceFactory: InstanceAwareServiceFactory,
        @inject(TYPES.GasService) private gasService: IGasService
    ) {
        super(); // 调用SynchronousRetryMixin的构造函数
    }

    /**
     * 🚀 执行策略 - 仅负责创建连锁头寸（解决双重调用问题）
     * 创建成功后自动启动事件驱动监控
     */
    async execute(instanceId: string): Promise<void> {
        const logger = this.getInstanceLogger(instanceId);
        if (!logger) {
            this.createInstanceLogger(instanceId);
        }

        try {
            const config = this.instanceConfigs.get(instanceId);
            if (!config) {
                throw new Error(`策略配置不存在: ${instanceId}`);
            }



            // 🔑 核心修复：检查是否已经创建过头寸，防止重复调用
            const existingState = this.instanceStates.get(instanceId);
            if (existingState && existingState.hasBeenCreated) {
                await this.getInstanceLogger(instanceId)?.logMonitoring(`策略实例已创建过连锁头寸，跳过重复创建`, {
                    position1Address: existingState.position1Address,
                    position2Address: existingState.position2Address,
                    phase: existingState.phase,
                    hasBeenCreated: existingState.hasBeenCreated
                });

                // 如果未启动监控，则启动监控
                if (existingState.phase === 'CREATED' || existingState.phase === 'STOPPED') {
                    await this.startEventDrivenMonitoring(instanceId);
                }
                return;
            }

            // 初始化状态 - 仅创建阶段
            const state: ChainPositionState = {
                instanceId,
                config,
                phase: 'CREATING',
                position1Address: null,
                position2Address: null,
                positionRange: null,
                currentActiveBin: null,
                isInRange: false,
                createdAt: new Date(),
                lastMonitoringTime: null,
                isActive: true,
                hasBeenCreated: false // 🔑 初始化为false
            };

            this.instanceStates.set(instanceId, state);

            // 🎯 步骤1: 创建连锁头寸
            await this.createChainPosition(instanceId);

            // 🔑 标记已创建，防止重复调用
            state.hasBeenCreated = true;
            state.phase = 'CREATED';

            // 🎯 步骤2: 创建成功后立即启动事件驱动监控
            await this.startEventDrivenMonitoring(instanceId);

        } catch (error) {
            const logger = this.getInstanceLogger(instanceId);
            if (logger) {
                await logger.logError(`连锁头寸策略启动失败: ${error instanceof Error ? error.message : String(error)}`);
            }
            // 更新状态为错误
            const state = this.instanceStates.get(instanceId);
            if (state) {
                state.phase = 'ERROR';
            }
            throw error;
        }
    }

    /**
     * 📝 创建连锁头寸
     */
    private async createChainPosition(instanceId: string): Promise<void> {
        const logger = this.getInstanceLogger(instanceId);
        if (!logger) return;

        try {
            const config = this.instanceConfigs.get(instanceId);
            if (!config) {
                throw new Error(`策略配置不存在: ${instanceId}`);
            }

            // 🎯 智能Gas优化：对创建连锁头寸操作进行Gas优化
            await this.optimizeGasForTransaction(instanceId, '创建连锁头寸');

            // 记录到实例日志
            await logger.logOperation('🔗 开始创建连锁头寸 (事件驱动v2.0)', {
                chainType: config.chainPositionType || 'DUAL_CHAIN',
                poolAddress: config.poolAddress,
                amount: config.positionAmount,
                instanceId
            });

            // 创建连锁头寸参数（增加实例ID）
            const createParams = {
                poolAddress: config.poolAddress,
                totalAmount: config.positionAmount,
                password: '',  // 策略执行使用解锁的钱包
                slippageBps: 500,
                instanceId // 🔑 传递实例ID
            };

            // 调用ChainPositionManager创建连锁头寸
            const result = await this.chainPositionManager.createChainPosition(createParams);

            if (!result.success) {
                throw new Error(`连锁头寸创建失败: ${result.error}`);
            }

            // 保存结果到状态
            const state = this.instanceStates.get(instanceId);
            if (state) {
                state.position1Address = result.position1Address || null;
                state.position2Address = result.position2Address || null;

                // 🔧 设置头寸范围（修复范围检查被绕过的问题）
                const binRangeData = await this.calculateChainPositionBinRange(instanceId);
                state.positionRange = [binRangeData.positionLowerBin, binRangeData.positionUpperBin];

                // 记录成功到实例日志
                await logger.logOperation('🎯 连锁头寸创建成功，准备启动监控', {
                    position1Address: result.position1Address,
                    position2Address: result.position2Address,
                    positionRange: state.positionRange,
                    totalBinRange: result.totalBinRange || '未知',
                    instanceId
                });
            }

        } catch (error) {
            const state = this.instanceStates.get(instanceId);
            if (state) {
                state.phase = 'ERROR';
            }

            await logger?.logError(`创建连锁头寸失败: ${error instanceof Error ? error.message : '未知错误'}`, error instanceof Error ? error : undefined);
            throw error;
        }
    }

    /**
     * 🔄 启动事件驱动监控
     */
    private async startEventDrivenMonitoring(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) return;

        try {
            state.phase = 'MONITORING';

            // 🎯 步骤1: 设置PositionAnalyticsService
            await this.setupPositionAnalyticsService(instanceId);

            // 🎯 步骤2: 初始化智能止损模块
            if (state.config.enableSmartStopLoss) {
                if (!state.config.stopLossConfig) {
                    state.config.stopLossConfig = {
                        maxLossPercentage: 0.05,
                        checkInterval: 30,
                        conditions: ['PRICE_DEVIATION', 'TIME_BASED']
                    };
                }
                await this.initializeSmartStopLoss(instanceId);
            }

            // 🎯 步骤3: 初始化头寸重建模块
            await this.initializePositionRecreation(instanceId);

            await logger.logMonitoring('🔄 启动事件驱动监控系统', {
                monitoringInterval: state.config.monitoringInterval,
                enableSmartStopLoss: state.config.enableSmartStopLoss,
                position1Address: state.position1Address,
                position2Address: state.position2Address,
                analyticsServiceSetup: this.analyticsServiceSetup.get(instanceId)
            });

            // 🎯 步骤3: 启动定时监控循环
            this.startMonitoringLoop(instanceId);

        } catch (error) {
            await logger.logError(`❌ 启动监控失败: ${error instanceof Error ? error.message : String(error)}`);
            state.phase = 'ERROR';
            throw error;
        }
    }

    /**
     * ⏰ 启动监控循环
     */
    private startMonitoringLoop(instanceId: string): void {
        const state = this.instanceStates.get(instanceId);
        if (!state) return;

        // 清理旧的定时器
        const existingTimer = this.monitoringTimers.get(instanceId);
        if (existingTimer) {
            clearInterval(existingTimer);
        }

        // 启动新的监控定时器
        const timer = setInterval(async () => {
            try {
                await this.performMonitoringCycle(instanceId);
            } catch (error) {
                const logger = this.getInstanceLogger(instanceId);
                if (logger) {
                    await logger.logError(`监控循环错误: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }, state.config.monitoringInterval * 1000);

        this.monitoringTimers.set(instanceId, timer);
    }

    /**
     * 📊 执行监控周期（完整版本）
     */
    private async performMonitoringCycle(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) return;

        // 🎯 监控周期开始框架
        await this.printMonitoringFrameStart(instanceId);

        // 🔄 头寸重建重试：仅处理头寸重建失败的情况
        if (state.phase === 'STOPPING' && state.stoppingReason === 'POSITION_RECREATION') {
            await logger.logMonitoring('🔄 头寸重建重试机制触发', {
                currentPhase: state.phase,
                stoppingReason: state.stoppingReason,
                reason: '上次头寸重建未完成，执行重试'
            });

            // 重试头寸重建操作
            await this.executePositionRecreation(instanceId);

            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(instanceId);
            return; // STOPPING状态下不执行正常监控
        }

        // 🛑 止损过程中，跳过监控循环
        if (state.phase === 'STOPPING' &&
            (state.stoppingReason === 'STOP_LOSS' || state.stoppingReason === 'MANUAL_STOP')) {
            await logger.logMonitoring('🛑 止损进行中，跳过监控循环', {
                currentPhase: state.phase,
                stoppingReason: state.stoppingReason,
                reason: '止损操作进行中，暂停正常监控'
            });

            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(instanceId);
            return; // 止损状态下不执行正常监控
        }

        // 🧹 处理CLEANING状态：执行清理重试
        if (state.phase === 'CLEANING') {
            await logger.logMonitoring('🧹 检测到CLEANING状态，执行清理重试', {
                currentPhase: state.phase,
                cleanupRetryCount: state.cleanupRetryCount || 0,
                cleanupTargets: state.cleanupTargets?.length || 0
            });

            await this.executeCleanupRetry(instanceId);
            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(instanceId);
            return; // CLEANING状态下不执行正常监控
        }

        // 正常监控状态检查
        if (state.phase !== 'MONITORING') {
            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(instanceId);
            return;
        }

        try {
            state.lastMonitoringTime = new Date();

            // 🔄 开始新的轮询周期 - 修复轮询周期总是0的问题
            const analyticsService = this.positionAnalyticsServices.get(instanceId);
            if (analyticsService) {
                // 获取UnifiedDataProvider并启动新轮询周期
                const unifiedDataProvider = (analyticsService as any).dataProvider;
                if (unifiedDataProvider && typeof unifiedDataProvider.startNewPollingCycle === 'function') {
                    unifiedDataProvider.startNewPollingCycle(state.config.monitoringInterval * 1000);

                    const pollingInfo = unifiedDataProvider.getCurrentPollingInfo();
                    await logger.logMonitoring('🔄 新轮询周期已启动', {
                        pollingCycle: pollingInfo.cycle,
                        pollingInterval: pollingInfo.interval,
                        monitoringInterval: state.config.monitoringInterval
                    });
                } else {
                    await logger.logError('❌ 无法访问UnifiedDataProvider，轮询周期管理失败');
                }
            } else {
                await logger.logError('❌ PositionAnalyticsService未初始化，无法启动轮询周期');
            }

            // 1. 获取当前活跃bin
            const currentActiveBin = await this.dlmmMonitor.getActiveBin(state.config.poolAddress);
            state.currentActiveBin = currentActiveBin;

            // 2. 检查活跃bin位置
            await this.checkActiveBinPosition(instanceId);

            // 3. 如果启用智能止损，执行完整分析
            if (state.config.enableSmartStopLoss) {
                await this.performSmartStopLossAnalysis(instanceId);
            }

        } catch (error) {
            await logger.logError(`监控周期执行失败: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // 🎯 监控周期结束框架
            await this.printMonitoringFrameEnd(instanceId);
        }
    }

    /**
     * 🎯 打印监控周期开始框架
     */
    private async printMonitoringFrameStart(instanceId: string): Promise<void> {
        const logger = this.getInstanceLogger(instanceId);
        if (!logger) return;

        const timestamp = new Date().toLocaleTimeString('zh-CN');
        const frameWidth = 60;
        const title = `连锁头寸策略监控 [${instanceId.slice(-8)}] - ${timestamp}`;
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
        const logger = this.getInstanceLogger(instanceId);
        if (!logger) return;

        const frameWidth = 60;
        await logger.logMonitoring('monitoring-frame-end', `└${'─'.repeat(frameWidth - 2)}┘`);
        await logger.logMonitoring('monitoring-frame-space', ''); // 空行分隔
    }

    /**
     * 🧠 执行智能止损分析
     */
    private async performSmartStopLossAnalysis(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        const stopLossModule = this.smartStopLossModules.get(instanceId);

        if (!state || !logger || !stopLossModule) return;

        try {
            state.phase = 'ANALYZING';

            // 1. 收集市场数据
            const marketData = await this.collectMarketData(instanceId);

            // 2. 执行智能止损分析（传入instanceId确保观察期状态正确维持）
            const decision = await stopLossModule.evaluate(marketData, instanceId);

            await logger.logMonitoring('🧠 智能止损分析完成', {
                决策行动: decision.action === 'HOLD' ? '继续持有' :
                    decision.action === 'ALERT' ? '风险警告' :
                        decision.action === 'PARTIAL_EXIT' ? '部分止损' : '完全止损',
                置信度: `${decision.confidence.toFixed(2)}%`,
                风险评分: decision.riskScore.toFixed(2),
                紧急程度: decision.urgency === 'LOW' ? '低' :
                    decision.urgency === 'MEDIUM' ? '中' : '高',
                分析原因: decision.reasoning || ['当前风险可控，继续持有']
            });

            // 🔥 广播智能止损数据到前端
            await this.broadcastSmartStopLossData(instanceId, marketData, decision);

            // 3. 处理止损决策
            await this.handleStopLossDecision(instanceId, decision);

            state.phase = 'MONITORING';

        } catch (error) {
            await logger.logError(`智能止损分析失败: ${error instanceof Error ? error.message : String(error)}`);
            state.phase = 'MONITORING'; // 恢复监控状态
        }
    }

    /**
     * 📈 收集市场数据 - 提供bin位置数据
     */
    private async collectMarketData(instanceId: string): Promise<MarketData> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state) throw new Error('策略状态不存在');

        try {
            // 🎯 尝试使用完整的PositionAnalyticsService
            const analyticsService = this.positionAnalyticsServices.get(instanceId);
            if (analyticsService) {
                await logger?.logMonitoring('📊 开始调用PositionAnalyticsService获取分析数据', {
                    poolAddress: state.config.poolAddress,
                    positionCount: [state.position1Address, state.position2Address].filter(Boolean).length
                });

                try {
                    // 🔥 只调用一次PositionAnalyticsService获取智能止损数据（避免重复日志）
                    const smartStopLossData = await analyticsService.getSmartStopLossData();

                    await logger?.logMonitoring('✅ PositionAnalyticsService数据获取成功', {
                        currentPrice: smartStopLossData.currentPrice,
                        positionValue: smartStopLossData.positionValue,
                        netPnL: smartStopLossData.netPnL,
                        netPnLPercentage: smartStopLossData.netPnLPercentage,
                        activeBin: smartStopLossData.activeBin,
                        positionLowerBin: smartStopLossData.positionLowerBin,
                        positionUpperBin: smartStopLossData.positionUpperBin,
                        holdingDuration: smartStopLossData.holdingDuration
                    });

                    // 🎯 获取完整分析报告（包含收益提取功能）
                    try {
                        const completeReport = await analyticsService.getCompleteAnalyticsReport();

                        // 🎯 紧凑格式日志输出（保持数据完整性）
                        await logger?.logMonitoring('📈 完整分析报告', {
                            // 基础信息（一行）
                            价格: completeReport.currentPrice,
                            监控时长: `${Math.round(completeReport.monitoringDuration / 60000)}分钟`,

                            // 收益数据（一行）
                            收益统计: `待提取:${completeReport.yieldStatistics.currentPendingYield} | 已提取:${completeReport.yieldStatistics.totalExtractedYield} | 平均:${completeReport.yieldStatistics.avgYieldPerPeriod} | 次数:${completeReport.yieldStatistics.totalYieldCount}`,

                            // 头寸损失（一行）
                            头寸损失: completeReport.positionLossAnalysis.map(loss =>
                                `${loss.positionAddress.substring(0, 8)}...:${loss.lossPercentage}%`
                            ).join(' | '),

                            // 性能指标（一行）
                            性能: `API调用:${completeReport.performanceMetrics.totalApiCalls} | 平均响应:${Math.round(completeReport.performanceMetrics.avgResponseTime)}ms | 错误率:${completeReport.performanceMetrics.errorRate.toFixed(1)}%`
                        });
                    } catch (reportError) {
                        await logger?.logError(`完整分析报告生成失败: ${reportError instanceof Error ? reportError.message : String(reportError)}`);
                    }

                    return smartStopLossData;

                } catch (analyticsError) {
                    await logger?.logError(`PositionAnalyticsService调用失败，回退到简化数据: ${analyticsError instanceof Error ? analyticsError.message : String(analyticsError)}`);
                    return await this.collectSimpleMarketData(instanceId);
                }
            } else {
                await logger?.logError('PositionAnalyticsService未初始化，使用简化数据收集');
                return await this.collectSimpleMarketData(instanceId);
            }

        } catch (error) {
            await logger?.logError(`市场数据收集失败: ${error instanceof Error ? error.message : String(error)}`);
            return await this.collectSimpleMarketData(instanceId);
        }
    }

    /**
     * 📊 简化市场数据收集（临时方案）
     */
    private async collectSimpleMarketData(instanceId: string): Promise<MarketData> {
        const state = this.instanceStates.get(instanceId);
        if (!state) throw new Error('策略状态不存在');

        // 获取基础数据
        const poolData = await this.dlmmMonitor.getPoolInfo(state.config.poolAddress);
        const currentPrice = poolData.activePrice;

        // 计算连锁头寸的bin范围
        const { activeBin, positionLowerBin, positionUpperBin } = await this.calculateChainPositionBinRange(instanceId);

        return {
            // 价格相关
            currentPrice,
            priceHistory: [],
            priceVolatility: 0,
            priceDropPercentage: 0,

            // 收益相关
            totalReturn: 0,
            yieldRate: 0,
            yieldTrend: 'stable' as const,
            yieldGrowthRate: 0,

            // 🔥 新增：手续费数据（简化版本使用默认值）
            currentPendingYield: '0',  // 未提取手续费
            totalExtractedYield: '0',  // 已提取手续费

            // 头寸相关
            positionValue: state.config.positionAmount,
            initialInvestment: state.config.positionAmount,
            netPnL: 0,
            netPnLPercentage: 0,

            // 核心bin数据
            activeBin,
            positionLowerBin,
            positionUpperBin,

            // 时间相关
            holdingDuration: (Date.now() - state.createdAt.getTime()) / (1000 * 60 * 60),
            lastUpdateTime: Date.now()
        };
    }

    /**
     * 🎯 获取连锁头寸的bin范围（从创建时保存的数据）
     */
    private async calculateChainPositionBinRange(instanceId: string): Promise<{
        activeBin: number;
        positionLowerBin: number;
        positionUpperBin: number;
    }> {
        const state = this.instanceStates.get(instanceId);
        if (!state) throw new Error('策略状态不存在');

        try {
            // 获取当前活跃bin
            const activeBin = await this.dlmmMonitor.getActiveBin(state.config.poolAddress);

            // 🎯 使用创建连锁头寸时保存的bin范围数据
            if (state.positionRange && state.positionRange.length === 2) {
                const [positionLowerBin, positionUpperBin] = state.positionRange;

                return {
                    activeBin,
                    positionLowerBin,
                    positionUpperBin
                };
            }

            // 如果没有保存的范围数据（可能是旧版本或创建失败），使用默认值
            const logger = this.getInstanceLogger(instanceId);
            await logger?.logError('⚠️ 未找到连锁头寸bin范围数据，使用默认计算方法');

            // 🎯 连锁头寸正确的bin范围计算：
            // - 上边界 = 活跃bin（价格高的头寸上边界）
            // - 下边界 = 活跃bin - 137（价格低的头寸下边界，总共138个bin）
            const positionUpperBin = activeBin;
            const positionLowerBin = activeBin - 137;

            return {
                activeBin,
                positionLowerBin,
                positionUpperBin
            };

        } catch (error) {
            // 出错时返回默认值
            return {
                activeBin: 0,
                positionLowerBin: -69,
                positionUpperBin: 69
            };
        }
    }

    /**
     * 📡 广播智能止损数据到前端
     */
    private async broadcastSmartStopLossData(instanceId: string, marketData: MarketData, decision: any): Promise<void> {
        try {
            // 🔥 准备广播数据
            const broadcastData = {
                instanceId,
                marketData: {
                    currentPrice: marketData.currentPrice,
                    positionValue: marketData.positionValue,
                    netPnL: marketData.netPnL,
                    netPnLPercentage: marketData.netPnLPercentage,
                    activeBin: marketData.activeBin,
                    positionLowerBin: marketData.positionLowerBin,
                    positionUpperBin: marketData.positionUpperBin,
                    holdingDuration: marketData.holdingDuration,
                    lastUpdateTime: marketData.lastUpdateTime,

                    // 🔥 新增：手续费数据
                    currentPendingYield: marketData.currentPendingYield || '0',  // 未提取手续费
                    totalExtractedYield: marketData.totalExtractedYield || '0',  // 已提取手续费

                    // 🔥 新增：历史价格变化数据
                    historicalPriceChanges: marketData.historicalPriceChanges || {
                        last5Minutes: 0,
                        last15Minutes: 0,
                        lastHour: 0
                    },
                    // 🔥 新增：历史收益率数据
                    historicalYieldRates: marketData.historicalYieldRates || {
                        totalReturnRate: 0,
                        feeYieldEfficiency: {
                            last5Minutes: 0,
                            last15Minutes: 0,
                            lastHour: 0
                        },
                        recentSnapshots: []
                    }
                },
                stopLossDecision: {
                    action: decision.action,
                    actionLabel: decision.action === 'HOLD' ? '继续持有' :
                        decision.action === 'ALERT' ? '风险警告' :
                            decision.action === 'PARTIAL_EXIT' ? '部分止损' : '完全止损',
                    confidence: decision.confidence,
                    riskScore: decision.riskScore,
                    urgency: decision.urgency,
                    reasoning: decision.reasoning || ['当前风险可控，继续持有']
                },
                timestamp: Date.now()
            };



            // 通过事件总线发送数据，Socket.IO服务器会监听这些事件
            await this.eventBus.publish('strategy.smart-stop-loss.update', broadcastData);

            const logger = this.getInstanceLogger(instanceId);
            await logger?.logMonitoring('📡 智能止损数据已广播到前端', {
                instanceId,
                action: decision.action,
                confidence: decision.confidence
            });

        } catch (error) {
            const logger = this.getInstanceLogger(instanceId);
            await logger?.logError(`广播智能止损数据失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * ⚡ 处理止损决策
     */
    private async handleStopLossDecision(instanceId: string, decision: any): Promise<void> {
        const logger = this.getInstanceLogger(instanceId);
        if (!logger) return;

        switch (decision.action) {
            case 'HOLD':
                await logger.logMonitoring('✅ 策略继续运行', {
                    置信度: `${decision.confidence.toFixed(2)}%`,
                    风险评分: decision.riskScore.toFixed(2),
                    策略状态: '正常运行中'
                });
                break;

            case 'ALERT':
                await logger.logMonitoring('⚠️ 风险警告', {
                    紧急程度: decision.urgency === 'LOW' ? '低' :
                        decision.urgency === 'MEDIUM' ? '中' : '高',
                    警告原因: decision.reasoning || ['检测到潜在风险']
                });
                break;

            case 'PARTIAL_EXIT':
                await logger.logMonitoring('🔄 建议部分止损', {
                    建议退出百分比: `${decision.suggestedExitPercentage || 50}%`,
                    紧急程度: decision.urgency === 'LOW' ? '低' :
                        decision.urgency === 'MEDIUM' ? '中' : '高'
                });
                // TODO: 实现部分止损逻辑
                break;

            case 'FULL_EXIT':
                await logger.logMonitoring('🛑 建议完全止损', {
                    紧急程度: decision.urgency === 'LOW' ? '低' :
                        decision.urgency === 'MEDIUM' ? '中' : '高',
                    止损原因: decision.reasoning || ['触发完全止损条件']
                });

                // 🔥 设置智能止损原因标识
                const state = this.instanceStates.get(instanceId);
                if (state) {
                    state.stoppingReason = 'STOP_LOSS';
                }

                // TODO: 实现完全止损逻辑
                await this.executeFullStopLoss(instanceId);
                break;
        }
    }

    /**
     * 🛑 手动止损入口 - 复用现有的完整止损流程
     */
    async executeManualStopLoss(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!logger) {
            throw new Error(`策略实例日志器未找到: ${instanceId}`);
        }

        await logger.logOperation('🔧 手动止损触发', {
            instanceId,
            reason: 'manual_stop_loss_triggered',
            triggerType: 'user_manual'
        });

        // 🔥 设置止损原因标识
        if (state) {
            state.stoppingReason = 'MANUAL_STOP';
        }

        // 直接调用现有的完整止损流程
        await this.executeFullStopLoss(instanceId);
    }

    /**
     * 🛑 执行完全止损
     */
    private async executeFullStopLoss(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) return;

        try {
            state.phase = 'STOPPING';

            // 🚀 预先优化Gas费用：为止损操作使用最高级优先费用
            await this.optimizeGasForStopLoss(instanceId, '智能止损-预优化');

            await logger.logOperation('🛑 开始执行智能止损', {
                position1Address: state.position1Address,
                position2Address: state.position2Address,
                reason: 'smart_stop_loss_triggered'
            });

            // 🔥 步骤1: 并行关闭所有头寸（连锁头寸有两个头寸）
            const closeResults: any[] = [];
            const closePromises: Promise<any>[] = [];

            if (state.position1Address) {
                await logger.logOperation('🔄 开始关闭头寸1', {
                    address: state.position1Address
                });

                const closePromise1 = this.executeAsyncStopLossWithRetry(
                    async () => {
                        const result = await this.positionManager.closePosition(state.position1Address!);
                        if (!result.success) {
                            throw new Error(`头寸1关闭失败: ${result.error || '未知错误'}`);
                        }
                        return { ...result, positionType: 'position1' };
                    },
                    instanceId
                );
                closePromises.push(closePromise1);
            }

            if (state.position2Address) {
                await logger.logOperation('🔄 开始关闭头寸2', {
                    address: state.position2Address
                });

                const closePromise2 = this.executeAsyncStopLossWithRetry(
                    async () => {
                        const result = await this.positionManager.closePosition(state.position2Address!);
                        if (!result.success) {
                            throw new Error(`头寸2关闭失败: ${result.error || '未知错误'}`);
                        }
                        return { ...result, positionType: 'position2' };
                    },
                    instanceId
                );
                closePromises.push(closePromise2);
            }

            // 等待所有头寸关闭完成 - 使用容错策略
            if (closePromises.length > 0) {
                const results = await Promise.allSettled(closePromises);

                // 收集成功的结果
                for (const result of results) {
                    if (result.status === 'fulfilled') {
                        closeResults.push(result.value);
                    }
                }

                // 如果有失败但有成功的，继续执行后续流程
                const successCount = closeResults.length;
                const totalCount = results.length;

                if (successCount > 0 && successCount < totalCount) {
                    await logger.logOperation('⚠️ 部分头寸关闭成功，继续执行代币卖出', {
                        successCount,
                        totalCount
                    });
                } else if (successCount === 0) {
                    throw new Error('所有头寸关闭失败');
                }

                // 只记录成功关闭的头寸
                for (const successResult of closeResults) {
                    const positionAddress = successResult.positionType === 'position1' ? state.position1Address : state.position2Address;
                    await this.loggerService.logStrategyOperationWithEcho(
                        instanceId,
                        `🛑 智能止损-${successResult.positionType}关闭完成`,
                        {
                            positionAddress: positionAddress?.substring(0, 8) + '...',
                            positionType: successResult.positionType,
                            signature: successResult.signature,
                            gasUsed: successResult.gasUsed,
                            reason: 'smart_stop_loss'
                        },
                        `✅ 智能止损: ${successResult.positionType}关闭成功 ${successResult.signature}`
                    );
                }
            }

            // 🔥 步骤2: 查询当前账户X代币余额
            await logger.logOperation('🔍 开始查询账户X代币余额', {
                poolAddress: state.config.poolAddress
            });

            const xTokenBalance = await this.getAccountXTokenBalance(instanceId);

            if (parseFloat(xTokenBalance) > 0) {
                await logger.logOperation('💰 检测到X代币余额，准备卖出', {
                    xTokenAmount: xTokenBalance,
                    poolAddress: state.config.poolAddress
                });

                // 🔥 步骤3: 卖出所有X代币为Y代币（使用专门的止损代币交换重试）
                const swapResult = await this.executeStopLossTokenSwapWithRetry(
                    async () => {
                        return await this.swapAllXTokensToY(instanceId, xTokenBalance);
                    },
                    instanceId
                );

                await logger.logOperation('✅ X代币卖出成功', {
                    inputAmount: xTokenBalance,
                    outputAmount: swapResult.outputAmount,
                    signature: swapResult.signature,
                    poolAddress: state.config.poolAddress
                });
            } else {
                await logger.logOperation('ℹ️ 未检测到X代币余额，跳过卖出操作', {
                    xTokenBalance: xTokenBalance
                });
            }

            // 🔥 步骤4: 更新策略状态
            state.phase = 'STOPPED';
            state.isActive = false;
            state.stoppingReason = null; // 🔥 清除止损标识

            await logger.logOperation('✅ 智能止损执行完成', {
                reason: 'smart_stop_loss_triggered',
                positionsClosedCount: closeResults.length,
                xTokenSwapped: parseFloat(xTokenBalance) > 0,
                finalXTokenBalance: '0' // 已全部卖出
            });

            // 停止监控
            await this.stopMonitoring(instanceId);

        } catch (error) {
            await logger.logError(`智能止损执行失败: ${error instanceof Error ? error.message : String(error)}`);
            state.phase = 'ERROR';
            state.stoppingReason = null; // 🔥 清除止损标识

            // 即使失败也要停止监控，避免继续触发
            await this.stopMonitoring(instanceId);

            throw error;
        }
    }

    /**
     * 🔍 获取账户X代币余额
     */
    private async getAccountXTokenBalance(instanceId: string): Promise<string> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) return '0';

        try {
            // 获取池子信息以获取X代币mint地址
            const poolInfo = await this.dlmmMonitor.getPoolInfo(state.config.poolAddress);
            if (!poolInfo || !poolInfo.tokenX) {
                throw new Error(`无法获取池子信息: ${state.config.poolAddress}`);
            }

            // 获取用户钱包
            const userKeypair = this.walletService.getCurrentKeypair();
            if (!userKeypair) {
                throw new Error('用户钱包未解锁');
            }

            // 查询X代币余额
            const connection = this.solanaService.getConnection();
            const { PublicKey } = await import('@solana/web3.js');
            const { getAssociatedTokenAddress, getAccount, getMint } = await import('@solana/spl-token');

            const xTokenMint = new PublicKey(poolInfo.tokenX);
            const userPublicKey = userKeypair.publicKey;

            // 🔧 修复：动态获取代币精度
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

                // 🔧 修复：使用动态获取的精度转换为人类可读格式
                const humanReadableBalance = (parseFloat(balance) / Math.pow(10, tokenDecimals)).toString();

                await logger.logOperation('📊 X代币余额查询成功', {
                    xTokenMint: poolInfo.tokenX,
                    rawBalance: balance,
                    humanReadableBalance: humanReadableBalance,
                    decimals: tokenDecimals,
                    associatedTokenAccount: associatedTokenAccount.toString()
                });

                return humanReadableBalance;

            } catch (accountError) {
                // 如果账户不存在，说明没有该代币
                await logger.logOperation('ℹ️ X代币账户不存在，余额为0', {
                    xTokenMint: poolInfo.tokenX,
                    error: accountError instanceof Error ? accountError.message : String(accountError)
                });
                return '0';
            }

        } catch (error) {
            await logger.logError(`查询X代币余额失败: ${error instanceof Error ? error.message : String(error)}`);
            return '0';
        }
    }

    /**
     * 🔄 卖出所有X代币为Y代币 - 止损专用
     */
    private async swapAllXTokensToY(instanceId: string, xTokenAmount: string): Promise<{
        outputAmount: string;
        signature: string;
    }> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) {
            throw new Error('策略状态或日志器不存在');
        }

        try {
            // 获取池子信息以获取代币mint地址
            const poolInfo = await this.dlmmMonitor.getPoolInfo(state.config.poolAddress);
            if (!poolInfo || !poolInfo.tokenX || !poolInfo.tokenY) {
                throw new Error(`无法获取池子信息: ${state.config.poolAddress}`);
            }

            // 获取用户钱包
            const userKeypair = this.walletService.getCurrentKeypair();
            if (!userKeypair) {
                throw new Error('用户钱包未解锁');
            }

            // 🔧 修复：动态获取X代币精度
            const connection = this.solanaService.getConnection();
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

            // 🔧 修复：使用Math.round避免浮点数精度问题，确保原子单位是整数
            const atomicAmountFloat = parseFloat(xTokenAmount) * Math.pow(10, xTokenDecimals);
            const atomicAmount = Math.round(atomicAmountFloat).toString();

            await logger.logOperation('🔄 开始执行止损X代币交换', {
                inputMint: poolInfo.tokenX,
                outputMint: poolInfo.tokenY,
                humanReadableAmount: xTokenAmount,
                atomicAmountFloat: atomicAmountFloat,
                atomicAmount: atomicAmount,
                decimals: xTokenDecimals,
                slippageBps: 500, // 5%滑点，止损时使用更宽松的滑点
                userPublicKey: userKeypair.publicKey.toString()
            });



            // 调用Jupiter进行代币交换
            const swapResult = await this.jupiterService.executeSwap({
                inputMint: poolInfo.tokenX,
                outputMint: poolInfo.tokenY,
                amount: atomicAmount, // 🔧 修复：使用四舍五入后的整数原子单位
                slippageBps: 500, // 5%滑点
                userPublicKey: userKeypair.publicKey.toString(),
                instanceId // 🔑 传递实例ID用于日志记录
            });

            // 🚨 验证交易状态 - 与YieldOperator保持一致
            const verificationResult = await (this.solanaService as any).verifyTransactionWithRetry(swapResult.signature, 4);
            if (verificationResult.status === 'failed') {
                await logger.logError(`❌ 止损代币交换交易执行失败 - 签名: ${swapResult.signature}, 状态: ${verificationResult.status}`);
                throw new Error(`交易失败`); // 抛出可重试的错误
            }

            await logger.logOperation('✅ 止损X代币交换成功', {
                inputAmount: xTokenAmount,
                inputAtomicAmount: atomicAmount,
                inputDecimals: xTokenDecimals,
                outputAmount: swapResult.outputAmount,
                signature: swapResult.signature,
                inputMint: poolInfo.tokenX,
                outputMint: poolInfo.tokenY
            });

            return {
                outputAmount: swapResult.outputAmount,
                signature: swapResult.signature
            };

        } catch (error) {
            await logger.logError(`止损X代币交换失败: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * 🛑 停止监控
     */
    private async stopMonitoring(instanceId: string): Promise<void> {
        const timer = this.monitoringTimers.get(instanceId);
        if (timer) {
            clearInterval(timer);
            this.monitoringTimers.delete(instanceId);
        }

        const logger = this.getInstanceLogger(instanceId);
        if (logger) {
            await logger.logMonitoring('🛑 监控系统已停止', { instanceId });
        }
    }

    /**
     * 🔄 更新PositionAnalyticsService的头寸列表（用于头寸重新创建后的同步）
     */
    private async updatePositionAnalyticsService(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) return;

        try {
            const analyticsService = this.positionAnalyticsServices.get(instanceId);
            if (!analyticsService) {
                await logger.logError('❌ 未找到PositionAnalyticsService实例，无法更新头寸列表');
                return;
            }

            // 构建新的头寸地址列表
            const newPositionAddresses: string[] = [];
            if (state.position1Address) newPositionAddresses.push(state.position1Address);
            if (state.position2Address) newPositionAddresses.push(state.position2Address);

            // 更新头寸监控配置
            await analyticsService.updatePositionAddresses(newPositionAddresses);

            await logger.logMonitoring('📊 头寸分析服务已更新', {
                newPosition1Address: state.position1Address,
                newPosition2Address: state.position2Address,
                newPositionCount: newPositionAddresses.length,
                updateReason: 'out_of_range_timeout_recovery'
            });

        } catch (error) {
            await logger.logError(`更新PositionAnalyticsService头寸列表失败: ${error instanceof Error ? error.message : String(error)}`);
            // 不抛出错误，避免影响主流程
        }
    }

    /**
     * 🔧 获取或创建实例专用的PositionAnalyticsService - 使用服务工厂实现数据隔离
     */
    private async getOrCreatePositionAnalyticsService(instanceId: string): Promise<PositionAnalyticsService> {
        let analyticsService = this.positionAnalyticsServices.get(instanceId);

        if (!analyticsService) {
            // 🏭 使用服务工厂创建实例隔离的分析服务
            analyticsService = await this.instanceAwareServiceFactory.createAnalyticsServiceForInstance(instanceId);

            // 🔑 设置策略日志器，让分析服务使用实例级日志
            const strategyLogger = this.getInstanceLogger(instanceId);
            if (strategyLogger) {
                analyticsService.setStrategyLogger(strategyLogger);
            }

            this.positionAnalyticsServices.set(instanceId, analyticsService);

            const logger = this.getInstanceLogger(instanceId);
            if (logger) {
                await logger.logMonitoring('🏭 实例专用分析服务已创建', {
                    instanceId,
                    serviceType: 'PositionAnalyticsService',
                    dataIsolation: true,
                    factoryManaged: true
                });
            }
        }

        return analyticsService;
    }

    /**
     * 🎯 设置头寸分析服务
     */
    private async setupPositionAnalyticsService(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) return;

        try {
            // 构建头寸设置参数
            const positionAddresses: string[] = [];
            if (state.position1Address) positionAddresses.push(state.position1Address);
            if (state.position2Address) positionAddresses.push(state.position2Address);

            // 🔧 获取策略实例的代币精度缓存
            const tokenPrecision = await this.getInstanceTokenPrecision(instanceId);

            const setupParams: PositionSetupParams = {
                poolAddress: state.config.poolAddress,
                positionAddresses: positionAddresses,
                initialInvestmentAmount: state.config.positionAmount.toString(),
                tokenPrecision: tokenPrecision,
                config: {
                    // 价格监控配置
                    priceMonitorInterval: 30000, // 30秒
                    trendAnalysisTimeframes: [5, 15, 30, 60], // 5分钟、15分钟、30分钟、1小时
                    priceDropThresholds: [
                        { timeframe: 5, threshold: 5, enabled: true },   // 5分钟内下跌5%
                        { timeframe: 15, threshold: 10, enabled: true },  // 15分钟内下跌10%
                        { timeframe: 60, threshold: 20, enabled: true }   // 1小时内下跌20%
                    ],
                    // 收益计算配置
                    yieldCalculationInterval: 60000, // 1分钟
                    yieldExtractionThreshold: state.config.yieldExtractionThreshold ? String(state.config.yieldExtractionThreshold) : '10', // 确保数字转字符串
                    projectionTimeframe: 5, // 5分钟窗口预测
                    // 数据管理配置
                    maxHistoryDays: 7, // 7天历史数据
                    cleanupInterval: 3600000, // 1小时清理一次
                    // 重试配置
                    maxRetries: 3,
                    retryDelay: 1000, // 1秒
                    // 日志配置
                    logLevel: 'INFO',
                    logPerformance: true
                }
            };

            // 设置头寸监控
            const analyticsService = await this.getOrCreatePositionAnalyticsService(instanceId);
            await analyticsService.setupPositionMonitoring(setupParams);
            this.analyticsServiceSetup.set(instanceId, true);

            await logger.logMonitoring('📊 头寸分析服务已设置', {
                poolAddress: setupParams.poolAddress,
                positionCount: positionAddresses.length,
                positionAddresses: positionAddresses,
                initialInvestment: setupParams.initialInvestmentAmount,
                yieldExtractionThreshold: setupParams.config?.yieldExtractionThreshold // 添加阈值日志
            });

        } catch (error) {
            await logger.logError(`头寸分析服务设置失败: ${error instanceof Error ? error.message : String(error)}`);
            this.analyticsServiceSetup.set(instanceId, false);
            throw error;
        }
    }

    /**
     * 🔧 初始化智能止损模块 - 使用服务工厂实现实例隔离
     */
    private async initializeSmartStopLoss(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        if (!state) return;

        // 🔥 合并前端配置的智能止损参数 (修复配置路径，支持多个配置源)
        const smartStopLossConfig = {
            // 合并多个可能的配置源
            ...state.config.stopLoss,
            ...state.config.smartStopLoss,
            // 确保关键参数有默认值
            activeBinSafetyThreshold:
                state.config.smartStopLoss?.activeBinSafetyThreshold ||
                state.config.stopLoss?.activeBinSafetyThreshold || 50,
            observationPeriodMinutes:
                state.config.smartStopLoss?.observationPeriodMinutes ||
                state.config.stopLoss?.observationPeriodMinutes || 15,
            lossThresholdPercentage:
                state.config.smartStopLoss?.lossThresholdPercentage ||
                state.config.stopLoss?.lossThresholdPercentage || 5  // 默认5%亏损阈值
        };

        // 🏭 使用服务工厂创建实例隔离的智能止损模块
        const stopLossModule = this.instanceAwareServiceFactory.createSmartStopLossModuleForInstance(
            instanceId,
            smartStopLossConfig
        );
        this.smartStopLossModules.set(instanceId, stopLossModule);

        const logger = this.getInstanceLogger(instanceId);
        if (logger) {
            await logger.logMonitoring('🧠 智能止损模块已初始化', {
                instanceId,
                activeBinSafetyThreshold: smartStopLossConfig.activeBinSafetyThreshold,
                observationPeriodMinutes: smartStopLossConfig.observationPeriodMinutes,
                lossThresholdPercentage: smartStopLossConfig.lossThresholdPercentage,
                riskThreshold: stopLossModule.getConfig().riskThreshold,
                factoryManaged: true
            });
        }
    }

    /**
     * 🏗️ 初始化头寸重建模块
     */
    private async initializePositionRecreation(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        if (!state) return;

        // 🔥 配置头寸重建模块参数
        const positionRecreationConfig = state.config.positionRecreation || {};

        const recreationConfig: Partial<PositionRecreationConfig> = {
            outOfRangeTimeout: state.config.outOfRangeTimeout,
            enablePriceCheck: true,
            // 🏗️ 从前端配置读取方法2和方法3的启用状态
            enableMarketOpportunityRecreation: positionRecreationConfig.enableMarketOpportunityRecreation ?? true, // 🧠 智能头寸重建（方法2），默认启用
            enableLossRecoveryRecreation: positionRecreationConfig.enableLossRecoveryRecreation ?? true, // 🚀 止损后反弹重建（方法3），默认启用

            // 🏗️ 方法2自定义参数
            marketOpportunity: {
                positionThreshold: positionRecreationConfig.marketOpportunity?.positionThreshold ?? 70,
                profitThreshold: positionRecreationConfig.marketOpportunity?.profitThreshold ?? 1
            },

            // 🚀 方法3自定义参数
            lossRecovery: {
                markPositionThreshold: positionRecreationConfig.lossRecovery?.markPositionThreshold ?? 65,
                markLossThreshold: positionRecreationConfig.lossRecovery?.markLossThreshold ?? 0.5,
                triggerPositionThreshold: positionRecreationConfig.lossRecovery?.triggerPositionThreshold ?? 70,
                triggerProfitThreshold: positionRecreationConfig.lossRecovery?.triggerProfitThreshold ?? 0.5
            },

            minRecreationInterval: 10 * 60 * 1000, // 10分钟
            maxRecreationCost: 0.01 // 1%
        };

        // 🔥 只有当maxPriceForRecreation有值时才设置
        if (state.config.maxPriceForRecreation !== undefined) {
            recreationConfig.maxPriceForRecreation = state.config.maxPriceForRecreation;
        }

        // 🏭 创建头寸重建模块实例
        const recreationModule = new PositionRecreationModule(recreationConfig);
        this.positionRecreationModules.set(instanceId, recreationModule);

        const logger = this.getInstanceLogger(instanceId);
        if (logger) {
            await logger.logMonitoring('🏗️ 头寸重建模块已初始化', {
                instanceId,
                outOfRangeTimeout: recreationConfig.outOfRangeTimeout,
                maxPriceForRecreation: recreationConfig.maxPriceForRecreation,
                enablePriceCheck: recreationConfig.enablePriceCheck,
                enableMarketOpportunityRecreation: recreationConfig.enableMarketOpportunityRecreation,
                enableLossRecoveryRecreation: recreationConfig.enableLossRecoveryRecreation,
                marketOpportunity: recreationConfig.marketOpportunity,
                lossRecovery: recreationConfig.lossRecovery,
                minRecreationInterval: recreationConfig.minRecreationInterval
            });
        }
    }

    async cleanup(instanceId: string): Promise<void> {
        await this.stopMonitoring(instanceId);

        // 🏭 使用服务工厂清理实例服务
        try {
            const cleanupSuccess = await this.instanceAwareServiceFactory.cleanupInstance(instanceId);
            if (cleanupSuccess) {
                const logger = this.getInstanceLogger(instanceId);
                if (logger) {
                    await logger.logOperation('🏭 服务工厂清理成功', {
                        instanceId,
                        action: 'factory_cleanup_success',
                        servicesCleared: true
                    });
                }
            }
        } catch (error) {
            const logger = this.getInstanceLogger(instanceId);
            if (logger) {
                await logger.logError(`服务工厂清理失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // 停止分析服务监控（如果服务工厂清理失败的话）
        const analyticsSetup = this.analyticsServiceSetup.get(instanceId);
        if (analyticsSetup) {
            try {
                const analyticsService = this.positionAnalyticsServices.get(instanceId);
                if (analyticsService) {
                    await analyticsService.stopMonitoring();
                }
            } catch (error) {
                console.warn('停止分析服务监控失败:', error);
            }
        }

        // 清理模块状态
        const recreationModule = this.positionRecreationModules.get(instanceId);
        if (recreationModule) {
            recreationModule.cleanupInstanceState(instanceId);
        }

        // 清理本地状态
        this.instanceStates.delete(instanceId);
        this.instanceConfigs.delete(instanceId);
        this.executorStatuses.delete(instanceId);
        this.smartStopLossModules.delete(instanceId);
        this.positionRecreationModules.delete(instanceId); // 🔥 清理头寸重建模块
        this.analyticsServiceSetup.delete(instanceId);
        this.positionAnalyticsServices.delete(instanceId);
        this.instanceTokenPrecisionCache.delete(instanceId);

        const logger = this.instanceLoggers.get(instanceId);
        if (logger) {
            await logger.logLifecycle('stop', { instanceId, action: 'cleanup' });
        }
        this.instanceLoggers.delete(instanceId);
    }

    async stop(instanceId: string): Promise<void> {
        await this.stopMonitoring(instanceId);
        const state = this.instanceStates.get(instanceId);
        if (state) {
            state.phase = 'STOPPED';
            state.isActive = false;
            state.stoppingReason = null; // 🔥 清除任何stopping标识
        }
    }

    setConfig(instanceId: string, config: ChainPositionConfig): void {
        this.instanceConfigs.set(instanceId, config);
    }

    setInstanceConfig(instanceId: string, config: ChainPositionConfig): void {
        this.instanceConfigs.set(instanceId, config);
    }

    getStatus(instanceId: string): ExecutorStatus {
        const state = this.instanceStates.get(instanceId);
        const status: ExecutorStatus = {
            isRunning: state?.isActive || false
        };
        if (state?.lastMonitoringTime) {
            status.lastExecutionTime = state.lastMonitoringTime;
        }
        return this.executorStatuses.get(instanceId) || status;
    }

    private createInstanceLogger(instanceId: string): void {
        const logger = this.loggerService.createStrategyLogger(instanceId);
        this.instanceLoggers.set(instanceId, logger);
    }

    private getInstanceLogger(instanceId: string): IStrategyLogger | undefined {
        return this.instanceLoggers.get(instanceId);
    }

    /**
     * 🔧 公共方法：确保实例日志器被创建（用于测试）
     */
    public ensureInstanceLogger(instanceId: string): void {
        const logger = this.getInstanceLogger(instanceId);
        if (!logger) {
            this.createInstanceLogger(instanceId);
        }
    }

    /**
     * 🔧 公共方法：获取实例的PositionAnalyticsService（用于测试）
     */
    public getPositionAnalyticsService(instanceId: string): PositionAnalyticsService | undefined {
        // 确保实例日志器存在
        this.ensureInstanceLogger(instanceId);

        // 直接从缓存中获取，如果不存在则返回undefined
        // 注意：这个方法是同步的，主要用于测试和调试
        return this.positionAnalyticsServices.get(instanceId);
    }

    /**
     * 🔍 检查活跃bin位置 - 简化版本，只调用模块决策
     */
    private async checkActiveBinPosition(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        const recreationModule = this.positionRecreationModules.get(instanceId);

        if (!state || !logger || !recreationModule || !state.positionRange || state.currentActiveBin === null) return;

        const [lowerBin, upperBin] = state.positionRange;
        const activeBin = state.currentActiveBin;
        const wasInRange = state.isInRange;
        state.isInRange = activeBin >= lowerBin && activeBin <= upperBin;

        // 🔥 收集市场数据
        let marketData: MarketData;
        try {
            marketData = await this.collectMarketData(instanceId);
        } catch (error) {
            await logger.logError(`收集市场数据失败: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }

        // 🔥 准备重建检查参数
        const strategyConfig: any = {
            poolAddress: state.config.poolAddress,
            outOfRangeTimeout: state.config.outOfRangeTimeout,
            monitoringInterval: state.config.monitoringInterval
        };

        // 🔥 只有当maxPriceForRecreation有值时才设置
        if (state.config.maxPriceForRecreation !== undefined) {
            strategyConfig.maxPriceForRecreation = state.config.maxPriceForRecreation;
        }

        const recreationParams: RecreationCheckParams = {
            marketData: marketData,
            position1Address: state.position1Address || null,
            position2Address: state.position2Address || null,
            positionRange: state.positionRange,
            outOfRangeStartTime: null, // 模块内部管理状态
            outOfRangeDirection: null, // 模块内部管理状态
            isInRange: wasInRange,
            strategyConfig: strategyConfig,
            instanceId: instanceId,
            phase: state.phase
        };

        // 🔥 使用头寸重建模块进行决策
        const decision = await recreationModule.shouldRecreatePosition(recreationParams);

        // 🔥 简化处理：只执行操作，不处理决策逻辑
        await this.executeRecreationAction(instanceId, decision);
    }

    /**
     * 🏗️ 头寸重建决策处理：根据模块决策结果执行相应操作
     */
    private async executeRecreationAction(instanceId: string, decision: RecreationDecision): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) return;

        // 🔥 记录决策结果（增强版）
        const logData = {
            shouldRecreate: decision.shouldRecreate,
            reason: decision.reason,
            recreationType: decision.recreationType,
            confidence: decision.confidence,
            urgency: decision.urgency,
            recommendedAction: decision.recommendedAction,
            hasOutOfRangeDetails: !!decision.outOfRangeDetails,
            timeRemaining: decision.outOfRangeDetails?.timeRemaining || null
        };

        // 🔥 一次性输出到策略实例日志 + 汇总日志
        await this.loggerService.logStrategyOperationWithEcho(
            instanceId,
            '🏗️ 头寸重建决策结果',
            logData,
            `🎯 [${instanceId}] 智能状态选择: ${decision.recreationType} - ${decision.reason}`
        );

        // 🔥 如果状态选择了特定的有价值信息，输出详细说明
        if (decision.reason.includes('智能选择:')) {
            const detailsData = {
                selectedReason: decision.reason,
                stateType: decision.recreationType,
                confidence: decision.confidence
            };

            // 一次性输出详细信息到两个日志
            await this.loggerService.logStrategyOperationWithEcho(
                instanceId,
                '🎯 智能状态选择详情',
                detailsData,
                `🎯 [${instanceId}] 智能选择详情: ${decision.recreationType} (置信度: ${decision.confidence}%)`
            );
        }

        // 🔥 触发正常头寸重建：首次检测到需要重建
        if (decision.shouldRecreate) {
            await this.loggerService.logStrategyOperationWithEcho(
                instanceId,
                '🚨 正常头寸重建触发',
                {
                    activeBin: state.currentActiveBin,
                    positionRange: state.positionRange,
                    reason: decision.reason,
                    action: '即将关闭头寸并重新创建'
                },
                `🚨 重建触发！${decision.reason} - 即将重新创建头寸`
            );

            // 🛑 执行头寸重建主流程
            await this.executePositionRecreation(instanceId);
            return;
        }

        // 🔥 处理价格检查失败的情况
        if (decision.recreationType === 'PRICE_CHECK_FAILED' && decision.priceCheckDetails?.shouldKeepPosition) {
            await logger.logOperation('🚫 价格超过上限，保持头寸不关闭', {
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
                const startTimeoutData = {
                    activeBin: state.currentActiveBin,
                    positionRange: state.positionRange,
                    direction: details.direction === 'ABOVE' ? '向上超出' : '向下超出',
                    action: '开始计时'
                };

                // 一次性输出到策略实例日志 + 汇总日志
                await this.loggerService.logStrategyOperationWithEcho(
                    instanceId,
                    '❌ 活跃bin脱离头寸范围',
                    startTimeoutData,
                    `⚠️ [${instanceId}] 活跃bin(${state.currentActiveBin})${details.direction === 'ABOVE' ? '向上' : '向下'}脱离头寸范围[${state.positionRange![0]}, ${state.positionRange![1]}] - 开始计时`
                );
            } else if (details.timeRemaining > 0) {
                const outOfRangeMinutes = details.timeElapsed / 60;
                const countdownData = {
                    activeBin: state.currentActiveBin,
                    positionRange: state.positionRange,
                    direction: details.direction === 'ABOVE' ? '向上超出' : '向下超出',
                    outOfRangeTime: `${outOfRangeMinutes.toFixed(2)}分钟 (${details.timeElapsed}秒)`,
                    timeoutThreshold: `${state.config.outOfRangeTimeout}秒`,
                    timeRemaining: `${details.timeRemaining}秒`
                };

                // 一次性输出倒计时信息到策略实例日志 + 汇总日志
                await this.loggerService.logStrategyOperationWithEcho(
                    instanceId,
                    '⏰ 活跃bin持续超出范围',
                    countdownData,
                    `⏰ [${instanceId}] 超出范围倒计时: ${details.timeRemaining}秒 (已超出${outOfRangeMinutes.toFixed(1)}分钟)`
                );
            }
        }

        // 🔥 处理回到范围内的情况
        if (state.isInRange && decision.recreationType === 'OUT_OF_RANGE' && decision.confidence === 0) {
            await logger.logMonitoring('✅ 活跃bin回到头寸范围内', {
                activeBin: state.currentActiveBin,
                positionRange: state.positionRange
            });
        }
    }

    /**
     * 🚨 头寸重建核心逻辑：关闭现有头寸并创建新头寸（支持重试）
     */
    private async executePositionRecreation(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) return;

        // 🔥 定义头寸关闭结果类型
        interface PositionCloseResult {
            success: boolean;
            result?: any;
            alreadyClosed?: boolean;
            skipped?: boolean;
            error?: string;
        }

        try {
            state.phase = 'STOPPING';
            // 🔥 设置头寸重建原因标识
            state.stoppingReason = 'POSITION_RECREATION';

            await logger.logOperation('🚨 头寸重建核心流程开始', {
                position1Address: state.position1Address,
                position2Address: state.position2Address,
                reason: 'position_recreation_execution'
            });

            // 🔥 智能头寸关闭函数
            const closePositionSafely = async (positionAddress: string, positionName: string): Promise<PositionCloseResult> => {
                try {
                    await logger.logOperation(`🔄 开始关闭${positionName}`, { address: positionAddress });



                    const result = await this.executeAsyncClosePositionWithRetry(
                        async () => {
                            const closeResult = await this.positionManager.closePosition(positionAddress);
                            if (!closeResult.success) {
                                throw new Error(`${positionName}关闭失败: ${closeResult.error || '未知错误'}`);
                            }
                            return closeResult;
                        },
                        instanceId
                    );
                    await logger.logOperation(`✅ ${positionName}关闭成功`, {
                        address: positionAddress,
                        signature: result.signature
                    });
                    return { success: true, result };
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);

                    // 🔥 智能判断：头寸不存在 = 已经关闭成功
                    if (errorMsg.includes('头寸不存在') ||
                        errorMsg.includes('不属于当前用户') ||
                        errorMsg.includes('position does not exist') ||
                        errorMsg.includes('Position not found')) {
                        await logger.logOperation(`ℹ️ ${positionName}已经不存在，视为已关闭`, {
                            address: positionAddress,
                            reason: 'position_not_exists'
                        });
                        return { success: true, alreadyClosed: true };
                    }

                    // 真正的失败
                    await logger.logError(`❌ ${positionName}关闭失败: ${errorMsg}`);
                    return { success: false, error: errorMsg };
                }
            };

            // 🛑 步骤1: 并行关闭所有头寸
            const [pos1Result, pos2Result] = await Promise.all([
                state.position1Address ?
                    closePositionSafely(state.position1Address, '头寸1') :
                    Promise.resolve({ success: true, skipped: true } as PositionCloseResult),
                state.position2Address ?
                    closePositionSafely(state.position2Address, '头寸2') :
                    Promise.resolve({ success: true, skipped: true } as PositionCloseResult)
            ]);

            // 🔥 严格判断：所有头寸都必须成功关闭才能继续
            const canProceed = pos1Result.success && pos2Result.success;

            if (!canProceed) {
                const failedPositions = [];
                if (!pos1Result.success) failedPositions.push(`头寸1=${pos1Result.error || '未处理'}`);
                if (!pos2Result.success) failedPositions.push(`头寸2=${pos2Result.error || '未处理'}`);

                await logger.logOperation('📊 头寸关闭结果汇总', {
                    position1: pos1Result.success ? (pos1Result.alreadyClosed ? '已关闭' : pos1Result.skipped ? '跳过' : '关闭成功') : '关闭失败',
                    position2: pos2Result.success ? (pos2Result.alreadyClosed ? '已关闭' : pos2Result.skipped ? '跳过' : '关闭成功') : '关闭失败',
                    canProceed: false,
                    reason: '存在头寸关闭失败，不能创建新头寸'
                });

                // 🔄 保持STOPPING状态等待下次监控循环重试
                await logger.logOperation('⏳ 头寸关闭失败，保持STOPPING状态等待重试', {
                    nextRetryIn: `${state.config.monitoringInterval}秒`,
                    failedPositions: failedPositions.join(', ')
                });

                state.phase = 'STOPPING';
                return;
            }

            await logger.logOperation('📊 头寸关闭结果汇总', {
                position1: pos1Result.success ? (pos1Result.alreadyClosed ? '已关闭' : pos1Result.skipped ? '跳过' : '关闭成功') : '关闭失败',
                position2: pos2Result.success ? (pos2Result.alreadyClosed ? '已关闭' : pos2Result.skipped ? '跳过' : '关闭成功') : '关闭失败',
                canProceed: true,
                reason: '所有头寸关闭成功，可以创建新头寸'
            });

            // 🔄 步骤2: 重新创建连锁头寸
            await logger.logOperation('🔄 开始重新创建连锁头寸', {
                reason: 'position_recreation'
            });

            // 重置状态为创建阶段
            state.phase = 'CREATING';
            state.position1Address = null;
            state.position2Address = null;
            state.positionRange = null;
            state.currentActiveBin = null;
            state.isInRange = false;



            // 重新创建连锁头寸
            await this.createChainPosition(instanceId);

            // 🔄 步骤3: 更新PositionAnalyticsService的头寸列表
            await this.updatePositionAnalyticsService(instanceId);

            // 标记创建完成
            state.phase = 'MONITORING';
            state.stoppingReason = null; // 🔥 清除头寸重建标识

            await logger.logOperation('✅ 头寸重建完成', {
                newPosition1Address: state.position1Address,
                newPosition2Address: state.position2Address,
                newPositionRange: state.positionRange
            });

        } catch (error) {
            await logger.logError(`头寸重建失败: ${error instanceof Error ? error.message : String(error)}`);
            state.phase = 'ERROR';
            state.stoppingReason = null; // 🔥 清除头寸重建标识
        }
    }

    /**
     * 🔧 获取策略实例的代币精度信息（带缓存）
     */
    private async getInstanceTokenPrecision(instanceId: string): Promise<{
        tokenXDecimals: number;
        tokenYDecimals: number;
        tokenXMint: string;
        tokenYMint: string;
    }> {
        const logger = this.getInstanceLogger(instanceId);

        // 检查缓存
        const cached = this.instanceTokenPrecisionCache.get(instanceId);
        if (cached) {

            return cached;
        }

        // 首次获取代币精度
        const config = this.instanceConfigs.get(instanceId);
        if (!config) {
            throw new Error(`策略配置不存在: ${instanceId}`);
        }



        // 动态导入DLMM SDK
        const DLMMSdk = await import('@meteora-ag/dlmm');
        const { PublicKey } = await import('@solana/web3.js');
        const { TokenPrecisionConverter } = await import('../../../utils/TokenPrecisionConverter');

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

        this.instanceTokenPrecisionCache.set(instanceId, precisionInfo);



        return precisionInfo;
    }

    /**
     * 🔥 处理创建失败的清理逻辑
     */
    private async handleCreateFailureCleanup(instanceId: string, error: any): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) return;

        const errorMsg = error instanceof Error ? error.message : String(error);

        // 检查是否为部分创建成功的情况
        if (errorMsg.includes('头寸1创建失败') || errorMsg.includes('头寸2基础创建失败')) {
            // 解析可能成功创建的头寸地址
            const cleanupTargets: string[] = [];

            // 这里可以通过更精确的错误解析来确定哪些头寸需要清理
            // 简化处理：如果有任何头寸地址存在，都加入清理列表
            if (state.position1Address) cleanupTargets.push(state.position1Address);
            if (state.position2Address) cleanupTargets.push(state.position2Address);

            if (cleanupTargets.length > 0) {
                await logger.logOperation('🧹 检测到部分创建成功，启动清理流程', {
                    cleanupTargets: cleanupTargets.map(addr => addr.substring(0, 8) + '...'),
                    error: errorMsg
                });

                // 初始化清理状态
                state.phase = 'CLEANING';
                state.cleanupRetryCount = 0;
                state.cleanupTargets = cleanupTargets;
                state.lastCleanupAttempt = new Date();

                // 立即尝试第一次清理
                await this.executeCleanupRetry(instanceId);
            } else {
                // 没有需要清理的头寸，直接进入创建重试
                state.phase = 'CREATING';
                await logger.logOperation('📝 没有需要清理的头寸，进入创建重试状态', {});
            }
        } else {
            // 完全创建失败，直接进入创建重试
            state.phase = 'CREATING';
            await logger.logOperation('📝 完全创建失败，进入创建重试状态', { error: errorMsg });
        }
    }

    /**
     * 🧹 执行清理重试 - 使用重试管理器
     */
    private async executeCleanupRetry(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger || !state.cleanupTargets) return;

        const retryCount = state.cleanupRetryCount || 0;

        try {
            await logger.logOperation(`🧹 开始清理重试 (第${retryCount + 1}次)`, {
                cleanupTargets: state.cleanupTargets.map(addr => addr.substring(0, 8) + '...'),
                retryCount: retryCount
            });

            // 🔥 使用重试管理器执行批量清理
            await this.executeBatchCleanupWithRetry(
                state.cleanupTargets,
                (positionAddress: string) => this.cleanupSinglePosition(positionAddress, instanceId),
                instanceId,
                retryCount
            );

            // 清理完全成功，进入创建重试
            await logger.logOperation('✅ 所有头寸清理成功，进入创建重试状态', {});
            state.phase = 'CREATING';
            delete state.cleanupRetryCount;
            delete state.cleanupTargets;
            delete state.lastCleanupAttempt;

            // 清理状态中的头寸地址
            state.position1Address = null;
            state.position2Address = null;

        } catch (error) {
            // 更新重试计数
            state.cleanupRetryCount = retryCount + 1;
            state.lastCleanupAttempt = new Date();

            if (state.cleanupRetryCount >= 3) {
                await logger.logError(`🚨 清理重试次数超限(3次)，进入ERROR状态`);
                state.phase = 'ERROR';
            } else {
                await logger.logOperation('⚠️ 清理失败，等待下次重试', {
                    error: error instanceof Error ? error.message : String(error),
                    nextRetryCount: state.cleanupRetryCount + 1
                });
                // 保持CLEANING状态，等待下次监控循环重试
            }
        }
    }

    /**
     * 🧹 清理单个头寸 - 简化版本
     */
    private async cleanupSinglePosition(positionAddress: string, instanceId: string): Promise<any> {
        const logger = this.getInstanceLogger(instanceId);
        if (!logger) throw new Error('Logger不存在');

        await logger.logOperation(`🧹 开始清理头寸`, {
            positionAddress: positionAddress.substring(0, 8) + '...'
        });

        // 直接调用头寸关闭，不再嵌套重试（重试由上层管理）
        const closeResult = await this.positionManager.closePosition(positionAddress);
        if (!closeResult.success) {
            throw new Error(`头寸关闭失败: ${closeResult.error || '未知错误'}`);
        }

        await logger.logOperation(`✅ 头寸清理成功`, {
            positionAddress: positionAddress.substring(0, 8) + '...',
            signature: closeResult.signature
        });

        return closeResult;
    }

    /**
     * 🎯 智能Gas优化：在重要交易前更新Gas参数
     */
    private async optimizeGasForTransaction(instanceId: string, operationType: string): Promise<void> {
        const logger = this.getInstanceLogger(instanceId);

        try {
            // 1. 获取当前网络拥堵状态
            const congestionLevel = this.gasService.getNetworkCongestion();

            // 2. 更新优先费用数据
            await this.gasService.updatePriorityFeeForTransaction();

            // 3. 获取最新Gas设置
            const gasSettings = await this.gasService.getCurrentGasSettings();

            await logger?.logOperation(`🎯 智能Gas优化完成: ${operationType}`, {
                operationType,
                networkCongestion: congestionLevel,
                baseFee: gasSettings.baseFee,
                priorityFee: gasSettings.priorityFee,
                timestamp: Date.now()
            });

        } catch (error) {
            // Gas优化失败不影响主要业务流程，只记录警告
            await logger?.logError(`⚠️ Gas优化失败，继续执行: ${operationType}`, error as Error);
        }
    }

    /**
     * 🚀 止损专用Gas优化：使用最高级优先费用确保交易快速处理
     */
    private async optimizeGasForStopLoss(instanceId: string, operationType: string): Promise<void> {
        const logger = this.getInstanceLogger(instanceId);

        try {
            // 1. 获取当前网络拥堵状态
            const congestionLevel = this.gasService.getNetworkCongestion();

            // 2. 更新优先费用数据
            await this.gasService.updatePriorityFeeForTransaction();

            // 3. 获取止损专用的最高级优先费用
            const stopLossMaxPriorityFee = await this.gasService.getStopLossMaxPriorityFee();

            // 4. 获取基础费用
            const baseFee = await this.gasService.getCurrentBaseFee();

            await logger?.logOperation(`🚀 止损Gas优化完成: ${operationType}`, {
                operationType,
                networkCongestion: congestionLevel,
                baseFee,
                stopLossMaxPriorityFee,
                priorityFeeType: 'STOP_LOSS_MAX',
                timestamp: Date.now()
            });



        } catch (error) {
            // Gas优化失败不影响主要业务流程，只记录警告
            await logger?.logError(`⚠️ 止损Gas优化失败，继续执行: ${operationType}`, error as Error);
        }
    }

} 