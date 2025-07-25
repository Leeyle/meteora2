/**
 * 🎯 简单Y头寸策略执行器 v3.0 - 模块化架构
 * 
 * 精简版主执行器，专注于：
 * 1. 策略生命周期管理（创建、启动、停止、清理）
 * 2. 模块间协调和上下文传递
 * 3. 状态管理和错误处理
 * 4. 实例隔离和日志管理
 * 
 * 所有具体业务逻辑都委托给专业子模块：
 * - SimpleYPositionService: 头寸创建和管理
 * - SimpleYMonitoringService: 监控和数据收集
 * - SimpleYRiskService: 智能止损和风险管理
 * - SimpleYUtilityService: 工具和优化功能
 */

import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { TYPES, ILoggerService, IEventBus, IStrategyLogger, IPositionManager, IDLMMMonitorService, ISolanaWeb3Service, IWalletService, IJupiterService, IGasService } from '../../../types/interfaces';
import { IStrategyExecutor, ExecutorStatus } from '../StrategyRegistry';
import { ChainPositionManager } from '../../business/ChainPositionManager';
import { SmartStopLossModule, MarketData } from '../../modules/SmartStopLossModule';
import { PositionRecreationModule } from '../../modules/PositionRecreationModule';
import { PositionAnalyticsService } from '../../business/PositionAnalyticsService';
import { SynchronousRetryMixin } from './mixins/SynchronousRetryMixin';
import { InstanceAwareServiceFactory } from '../../business/InstanceAwareServiceFactory';

// 🆕 导入模块化服务
import { 
    SimpleYPositionService, 
    SimpleYMonitoringService, 
    SimpleYRiskService, 
    SimpleYUtilityService,
    SimpleYModuleContext,
    ISimpleYPositionService,
    ISimpleYMonitoringService,
    ISimpleYRiskService,
    ISimpleYUtilityService
} from './simple-y-modules';

// 简单Y头寸策略配置接口
export interface SimpleYConfig {
    poolAddress: string;
    positionAmount: number;
    binRange: number;
    monitoringInterval: number;
    outOfRangeTimeout: number;
    yieldExtractionThreshold?: string;
    yieldExtractionTimeLock?: number;
    maxPriceForRecreation?: number;
    minPriceForRecreation?: number;
    benchmarkYieldThreshold5Min?: number;
    minActiveBinPositionThreshold?: number;
    slippageBps?: number;
    enableSmartStopLoss: boolean;
    stopLossConfig?: any;
    stopLoss?: {
        activeBinSafetyThreshold?: number;
        observationPeriodMinutes?: number;
        lossThresholdPercentage?: number;
    };
    smartStopLoss?: {
        activeBinSafetyThreshold?: number;
        observationPeriodMinutes?: number;
        lossThresholdPercentage?: number;
    };
    positionRecreation?: {
        enableMarketOpportunityRecreation?: boolean;
        enableLossRecoveryRecreation?: boolean;
        enableDynamicProfitRecreation?: boolean;
        marketOpportunity?: {
            positionThreshold?: number;
            profitThreshold?: number;
        };
        lossRecovery?: {
            markPositionThreshold?: number;
            markLossThreshold?: number;
            triggerPositionThreshold?: number;
            triggerProfitThreshold?: number;
        };
        dynamicProfitRecreation?: {
            positionThreshold?: number;
            benchmarkTier1Max?: number;
            benchmarkTier2Max?: number;
            benchmarkTier3Max?: number;
            benchmarkTier4Max?: number;
            profitThresholdTier1?: number;
            profitThresholdTier2?: number;
            profitThresholdTier3?: number;
            profitThresholdTier4?: number;
        };
    };
}

// 策略状态接口
export interface SimpleYState {
    instanceId: string;
    config: SimpleYConfig;
    phase: 'CREATED' | 'CREATING' | 'MONITORING' | 'ANALYZING' | 'STOPPING' | 'STOPPED' | 'ERROR' | 'CLEANING';
    positionAddress?: string | null;
    positionRange: [number, number] | null;
    currentActiveBin: number | null;
    isInRange: boolean;
    createdAt: Date;
    lastMonitoringTime: Date | null;
    isActive: boolean;
    hasBeenCreated: boolean;

    // 🔥 区分不同的STOPPING原因
    stoppingReason?: 'STOP_LOSS' | 'POSITION_RECREATION' | 'MANUAL_STOP' | 'USER_STOP' | null;

    // 🆕 清理重试相关字段
    cleanupRetryCount?: number;           // 清理重试次数
    cleanupTargets?: string[];            // 需要清理的头寸地址
    lastCleanupAttempt?: Date;            // 上次清理尝试时间

    // 🆕 动态重建开关相关字段
    dynamicRecreationSwitchEnabled?: boolean;  // 动态重建开关状态
    lastBenchmarkYield5Min?: number;           // 最后一次基准收益率
    lastSwitchUpdateTime?: Date;               // 开关状态最后更新时间
}

/**
 * 🎯 简单Y头寸策略执行器 - 精简模块化版本
 */
@injectable()
export class SimpleYExecutor extends SynchronousRetryMixin implements IStrategyExecutor {

    getType(): string {
        return 'simple-y';
    }

    getVersion(): string {
        return 'v3.0.0-modular';
    }

    async initialize(config: SimpleYConfig): Promise<void> {
        // 执行器级别的初始化
    }

    // 核心状态管理
    private instanceStates: Map<string, SimpleYState> = new Map();
    private instanceConfigs: Map<string, SimpleYConfig> = new Map();
    private executorStatuses: Map<string, ExecutorStatus> = new Map();
    private instanceLoggers: Map<string, IStrategyLogger> = new Map();
    private smartStopLossModules: Map<string, SmartStopLossModule> = new Map();
    private positionRecreationModules: Map<string, PositionRecreationModule> = new Map();
    private monitoringTimers: Map<string, NodeJS.Timeout> = new Map();
    private analyticsServiceSetup: Map<string, boolean> = new Map();
    private positionAnalyticsServices: Map<string, PositionAnalyticsService> = new Map();
    private instanceTokenPrecisionCache: Map<string, any> = new Map();
    private swapOperationLocks: Map<string, boolean> = new Map();
    private instanceMarketDataCache: Map<string, any> = new Map();
    private monitoringCycleCounters: Map<string, number> = new Map();

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
        @inject(TYPES.GasService) private gasService: IGasService,
        
        // 🆕 注入模块化服务
        @inject(SimpleYPositionService) private positionService: ISimpleYPositionService,
        @inject(SimpleYMonitoringService) private monitoringService: ISimpleYMonitoringService,
        @inject(SimpleYRiskService) private riskService: ISimpleYRiskService,
        @inject(SimpleYUtilityService) private utilityService: ISimpleYUtilityService
    ) {
        super();
        
        // 🔧 添加强制停止事件监听器（备用停止机制）
        this.eventBus.subscribe('strategy.force.stop', async (eventData) => {
            const data = eventData as any; // 转换类型以访问自定义属性
            if (data && data.instanceId) {
                try {
                    const logger = this.getInstanceLogger(data.instanceId);
                    if (logger) {
                        await logger.logOperation('📡 收到强制停止事件，执行备用停止机制', {
                            instanceId: data.instanceId,
                            reason: data.reason || 'force_stop',
                            message: data.message || '强制停止策略'
                        });
                    }
                    
                    // 直接调用执行器的停止方法
                    await this.stop(data.instanceId);
                    
                    if (logger) {
                        await logger.logOperation('✅ 强制停止执行完成', {
                            instanceId: data.instanceId,
                            method: 'SimpleYExecutor.stop'
                        });
                    }
                    
                } catch (error) {
                    console.error(`❌ 处理强制停止事件失败: ${error instanceof Error ? error.message : String(error)}`);
                    const logger = this.getInstanceLogger(data.instanceId);
                    if (logger) {
                        await logger.logError(`❌ 强制停止执行失败: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
        });
    }

    /**
     * 🚀 执行策略 - 模块化版本
     */
    async execute(instanceId: string): Promise<void> {
        const logger = this.getInstanceLogger(instanceId) || this.createInstanceLogger(instanceId);

        try {
            const config = this.instanceConfigs.get(instanceId);
            if (!config) {
                throw new Error(`策略配置不存在: ${instanceId}`);
            }

            // 检查是否已经创建过头寸
            const existingState = this.instanceStates.get(instanceId);
            if (existingState && existingState.hasBeenCreated) {
                await logger.logMonitoring(`策略实例已创建过简单Y头寸，跳过重复创建`, {
                    positionAddress: existingState.positionAddress,
                    phase: existingState.phase,
                    hasBeenCreated: existingState.hasBeenCreated
                });

                if (existingState.phase === 'CREATED' || existingState.phase === 'STOPPED') {
                    await this.startModularMonitoring(instanceId);
                }
                return;
            }

            // 初始化状态
            const state: SimpleYState = {
                instanceId,
                config,
                phase: 'CREATING',
                positionAddress: null,
                positionRange: null,
                currentActiveBin: null,
                isInRange: false,
                createdAt: new Date(),
                lastMonitoringTime: null,
                isActive: true,
                hasBeenCreated: false
            };

            this.instanceStates.set(instanceId, state);

            // 创建模块化上下文
            const context = this.createModuleContext(instanceId, config, state);

            // 初始化动态重建开关状态
            await this.utilityService.initializeDynamicRecreationSwitch(context);

            // 使用模块化服务创建简单Y头寸
            const positionResult = await this.positionService.createPosition(context);
            
            if (!positionResult.success) {
                throw new Error(`头寸创建失败: ${positionResult.error}`);
            }

            // 标记已创建
            state.hasBeenCreated = true;
            state.phase = 'CREATED';

            // 启动模块化监控
            await this.startModularMonitoring(instanceId);

        } catch (error) {
            if (logger) {
                await logger.logError(`简单Y头寸策略启动失败: ${error instanceof Error ? error.message : String(error)}`);
            }
            const state = this.instanceStates.get(instanceId);
            if (state) {
                state.phase = 'ERROR';
            }
            throw error;
        }
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
        this.positionRecreationModules.delete(instanceId);
        this.instanceLoggers.delete(instanceId);
        this.positionAnalyticsServices.delete(instanceId);
        this.analyticsServiceSetup.delete(instanceId);
        this.monitoringTimers.delete(instanceId);
        this.instanceTokenPrecisionCache.delete(instanceId);
        this.swapOperationLocks.delete(instanceId);

        // 🔧 清理新增的缓存数据
        this.instanceMarketDataCache.delete(instanceId);
        this.monitoringCycleCounters.delete(instanceId);
    }

    setInstanceConfig(instanceId: string, config: SimpleYConfig): void {
        this.instanceConfigs.set(instanceId, config);
    }

    getStatus(instanceId: string): ExecutorStatus {
        return this.executorStatuses.get(instanceId) || { isRunning: false };
    }

    private getInstanceLogger(instanceId: string): IStrategyLogger | undefined {
        return this.instanceLoggers.get(instanceId);
    }

    private createInstanceLogger(instanceId: string): IStrategyLogger {
        const logger = this.loggerService.createStrategyLogger(instanceId);
        this.instanceLoggers.set(instanceId, logger);
        return logger;
    }

    /**
     * 📝 创建简单Y头寸 - 委托给模块化服务
     */
    private async createSimpleYPosition(instanceId: string): Promise<void> {
        const config = this.instanceConfigs.get(instanceId);
        const state = this.instanceStates.get(instanceId);
        
        if (!config || !state) {
            throw new Error(`实例配置或状态不存在: ${instanceId}`);
        }

        const context = this.createModuleContext(instanceId, config, state);
        const result = await this.positionService.createPosition(context);
        
        if (!result.success) {
            throw new Error(`头寸创建失败: ${result.error}`);
        }
    }

    // 🔧 修复：删除未使用的startEventDrivenMonitoring方法，避免与startModularMonitoring重复

    /**
     * 🎯 获取简单Y头寸的bin范围
     */
    private async calculateSimpleYPositionBinRange(instanceId: string): Promise<{
        activeBin: number;
        positionLowerBin: number;
        positionUpperBin: number;
    }> {
        const state = this.instanceStates.get(instanceId);
        if (!state) throw new Error('策略状态不存在');

        try {
            const activeBin = await this.dlmmMonitor.getActiveBin(state.config.poolAddress);
            const halfRange = Math.floor(state.config.binRange / 2);
            const positionLowerBin = activeBin - halfRange;
            const positionUpperBin = activeBin + halfRange;

            return {
                activeBin,
                positionLowerBin,
                positionUpperBin
            };

        } catch (error) {
            const halfRange = Math.floor(state.config.binRange / 2);
            return {
                activeBin: 0,
                positionLowerBin: -halfRange,
                positionUpperBin: halfRange
            };
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
     * 📊 监控周期执行逻辑 - 委托给模块化监控服务
     */
    private async performMonitoringCycle(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const config = this.instanceConfigs.get(instanceId);
        
        if (!state || !config) return;

        // 创建模块化上下文并委托给监控服务
        const context = this.createModuleContext(instanceId, config, state);
        await this.monitoringService.performMonitoringCycle(context);

        // 如果启用智能止损，执行分析
        if (state.config.enableSmartStopLoss) {
            await this.performSmartStopLossAnalysis(instanceId);
        }
    }

    /**
     * 🧠 执行智能止损分析 - 与连锁头寸策略完全一致
     */
    private async performSmartStopLossAnalysis(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        const stopLossModule = this.smartStopLossModules.get(instanceId);

        if (!state || !logger || !stopLossModule) return;



        try {
            state.phase = 'ANALYZING';

            // 1. 收集市场数据
            const context = this.createModuleContext(instanceId, state.config, state);
            const marketData = await this.monitoringService.collectMarketData(context);

            // 2. 执行智能止损分析（传入instanceId确保观察期状态正确维持）
            const decision = await stopLossModule.evaluate(marketData, instanceId);

            await logger.logMonitoring('🧠 简单Y智能止损分析完成', {
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
            await logger.logError(`简单Y智能止损分析失败: ${error instanceof Error ? error.message : String(error)}`);
            state.phase = 'MONITORING'; // 恢复监控状态
        }
    }

    /**
     * 🆕 处理止损决策 - 从连锁头寸策略完整复制
     */
    private async handleStopLossDecision(instanceId: string, decision: any): Promise<void> {
        const logger = this.getInstanceLogger(instanceId);
        if (!logger) return;

        const config = this.instanceConfigs.get(instanceId);
        const state = this.instanceStates.get(instanceId);
        if (!config || !state) return;

        switch (decision.action) {
            case 'HOLD':
                await logger.logMonitoring('✅ 简单Y策略继续运行', {
                    置信度: `${decision.confidence.toFixed(2)}%`,
                    风险评分: decision.riskScore.toFixed(2),
                    策略状态: '正常运行中'
                });
                break;

            case 'ALERT':
                await logger.logMonitoring('⚠️ 简单Y风险警告', {
                    紧急程度: decision.urgency === 'LOW' ? '低' :
                        decision.urgency === 'MEDIUM' ? '中' : '高',
                    警告原因: decision.reasoning || ['检测到潜在风险']
                });
                break;

            case 'PARTIAL_EXIT':
                await logger.logMonitoring('🔄 简单Y建议部分止损', {
                    建议退出百分比: `${decision.suggestedExitPercentage || 50}%`,
                    紧急程度: decision.urgency === 'LOW' ? '低' :
                        decision.urgency === 'MEDIUM' ? '中' : '高'
                });
                // 简单Y策略采用全进全出策略，不实现部分止损功能
                break;

            case 'FULL_EXIT':
                await logger.logMonitoring('🛑 简单Y建议完全止损', {
                    紧急程度: decision.urgency === 'LOW' ? '低' :
                        decision.urgency === 'MEDIUM' ? '中' : '高',
                    止损原因: decision.reasoning || ['触发完全止损条件']
                });

                // 🔥 关键修复：立即设置止损状态和阶段，防止监控循环继续执行
                state.phase = 'STOPPING';           // ← 关键修复：设置STOPPING阶段
                state.stoppingReason = 'STOP_LOSS';

                await logger.logMonitoring('🛑 简单Y智能止损状态已设置，监控循环将暂停', {
                    instanceId,
                    currentPhase: state.phase,
                    stoppingReason: state.stoppingReason,
                    note: '后续监控循环将检测到STOPPING状态并跳过执行'
                });

                // 🔥 广播策略状态更新到前端（智能止损开始）
                await this.broadcastStrategyStatusUpdate(instanceId, 'stopping', 'smart_stop_loss_started');

                // 🔑 执行完全止损 - 委托给风险服务
                await this.executeFullStopLoss(instanceId);
                break;
        }
    }

    /**
     * 🆕 提供高级重试能力给子模块使用 - 解决子模块无法继承SynchronousRetryMixin的问题
     */
    async executeCleanupWithAdvancedRetry<T>(
        instanceId: string,
        operation: () => Promise<T>,
        retryCount: number = 0
    ): Promise<T> {
        return this.executeCleanupWithRetry(operation, instanceId, retryCount);
    }

    /**
     * 🆕 提供批量清理能力给子模块使用
     */
    async executeBatchCleanupWithAdvancedRetry<T>(
        instanceId: string,
        cleanupTargets: string[],
        cleanupFunction: (positionAddress: string) => Promise<any>,
        retryCount: number = 0
    ): Promise<T[]> {
        return this.executeBatchCleanupWithRetry(
            cleanupTargets,
            cleanupFunction,
            instanceId,
            retryCount
        );
    }

    /**
     * 🆕 执行完全止损 - 委托给风险服务
     */
    private async executeFullStopLoss(instanceId: string): Promise<void> {
        const logger = this.getInstanceLogger(instanceId);
        const config = this.instanceConfigs.get(instanceId);
        const state = this.instanceStates.get(instanceId);
        
        if (!logger || !config || !state) return;

        try {
            // 🔧 关键修复：在开始止损前立即停止监控循环，防止干扰
            const timer = this.monitoringTimers.get(instanceId);
            if (timer) {
                clearInterval(timer);
                this.monitoringTimers.delete(instanceId);
                await logger.logOperation('⏹️ 简单Y监控定时器已立即停止', {
                    instanceId,
                    reason: 'stop_loss_started',
                    note: '防止止损过程中监控循环干扰'
                });
            }

            await logger.logOperation('🛑 开始执行简单Y完全止损', {
                instanceId,
                positionAddress: state.positionAddress,
                reason: state.stoppingReason || 'STOP_LOSS'
            });

            // 委托给风险服务执行止损
            const context = this.createModuleContext(instanceId, config, state);
            const result = await this.riskService.executeStopLoss(context);

            if (result.success) {
                await logger.logOperation('✅ 简单Y完全止损执行成功', {
                    instanceId,
                    signature: result.signature,
                    finalPhase: state.phase
                });

                // 🔥 广播策略状态更新到前端（止损完成）
                await this.broadcastStrategyStatusUpdate(instanceId, 'stopped', 'stop_loss_completed');

                // 🔧 修复：止损成功后完全清理监控相关资源
                await this.stopMonitoring(instanceId);

                await logger.logOperation('🛑 简单Y监控系统已停止', {
                    instanceId,
                    reason: 'stop_loss_completed'
                });
            } else {
                await logger.logError(`简单Y完全止损执行失败: ${result.error || '未知错误'}`);
                
                // 🔧 修复：即使失败也要停止监控，避免继续触发错误
                await this.stopMonitoring(instanceId);
                
                await logger.logOperation('🛑 简单Y监控系统已停止（止损失败后）', {
                    instanceId,
                    reason: 'stop_loss_failed_cleanup'
                });
            }

        } catch (error) {
            await logger.logError(`简单Y完全止损执行异常: ${error instanceof Error ? error.message : String(error)}`);
            
            // 🔧 确保异常情况下也停止监控
            try {
                await this.stopMonitoring(instanceId);
            } catch (stopError) {
                console.error('停止监控时发生异常:', stopError);
            }
        }
    }

    /**
     * 🆕 手动止损入口 - 复用现有的完整止损流程
     */
    async executeManualStopLoss(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!logger) {
            throw new Error(`简单Y策略实例日志器未找到: ${instanceId}`);
        }

        await logger.logOperation('🔧 简单Y手动止损触发', {
            instanceId,
            reason: 'manual_stop_loss_triggered',
            triggerType: 'user_manual'
        });

        // 🔥 关键修复：立即设置止损状态和阶段，防止监控循环继续执行
        if (state) {
            state.phase = 'STOPPING';           // ← 关键修复：设置STOPPING阶段
            state.stoppingReason = 'MANUAL_STOP';
        }

        await logger.logOperation('🛑 简单Y手动止损状态已设置，监控循环将暂停', {
            instanceId,
            currentPhase: state?.phase,
            stoppingReason: state?.stoppingReason,
            note: '后续监控循环将检测到STOPPING状态并跳过执行'
        });

        // 🔥 广播策略状态更新到前端（手动止损开始）
        await this.broadcastStrategyStatusUpdate(instanceId, 'stopping', 'manual_stop_loss_started');

        // 直接调用现有的完整止损流程
        await this.executeFullStopLoss(instanceId);
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
    }

    // 🆕 模块化架构方法

    /**
     * 创建模块化上下文
     */
    private createModuleContext(instanceId: string, config: SimpleYConfig, state: SimpleYState): SimpleYModuleContext {
        return {
            instanceId,
            config,
            state
        };
    }

    /**
     * 🔧 修复：启动模块化监控 - 包含完整的初始化流程
     */
    private async startModularMonitoring(instanceId: string): Promise<void> {
        const config = this.instanceConfigs.get(instanceId);
        const state = this.instanceStates.get(instanceId);
        
        if (!config || !state) {
            throw new Error(`实例配置或状态不存在: ${instanceId}`);
        }

        const context = this.createModuleContext(instanceId, config, state);
        
        try {
            // 设置分析服务（通过监控服务）
            await this.monitoringService.setupAnalyticsService(context);
            this.analyticsServiceSetup.set(instanceId, true);

            // 初始化智能止损模块（如果启用）
            if (state.config.enableSmartStopLoss) {
                await this.initializeSmartStopLoss(instanceId);
            }

            // 🔧 关键修复：初始化头寸重建模块
            await this.initializePositionRecreation(instanceId);

            // 启动模块化监控服务
            await this.monitoringService.startMonitoring(context);
            
            // 🔧 关键修复：启动主监控循环以触发智能止损分析和数据广播
            this.startMonitoringLoop(instanceId);
            
            // 更新状态
            state.phase = 'MONITORING';
            state.isActive = true;

            const logger = this.getInstanceLogger(instanceId);
            if (logger) {
                await logger.logMonitoring('🔄 模块化监控系统已启动', {
                    monitoringInterval: state.config.monitoringInterval,
                    enableSmartStopLoss: state.config.enableSmartStopLoss,
                    positionAddress: state.positionAddress,
                    analyticsServiceSetup: this.analyticsServiceSetup.get(instanceId),
                    instanceId,
                    monitoringLoopStarted: true
                });
            }

        } catch (error) {
            const logger = this.getInstanceLogger(instanceId);
            if (logger) {
                await logger.logError(`❌ 模块化监控启动失败: ${error instanceof Error ? error.message : String(error)}`);
            }
            state.phase = 'ERROR';
            throw error;
        }
    }

    /**
     * 停止模块化监控
     */
    private async stopModularMonitoring(instanceId: string): Promise<void> {
        const config = this.instanceConfigs.get(instanceId);
        const state = this.instanceStates.get(instanceId);
        
        if (!config || !state) {
            return;
        }

        const context = this.createModuleContext(instanceId, config, state);
        
        // 使用模块化监控服务
        await this.monitoringService.stopMonitoring(context);
        
        const logger = this.getInstanceLogger(instanceId);
        if (logger) {
            await logger.logMonitoring('🛑 模块化监控系统已停止', { instanceId });
        }
    }

    /**
     * 🔧 初始化智能止损模块 - 使用服务工厂实现实例隔离
     */
    private async initializeSmartStopLoss(instanceId: string): Promise<void> {
        const state = this.instanceStates.get(instanceId);
        const logger = this.getInstanceLogger(instanceId);
        if (!state || !logger) return;

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

        await logger.logMonitoring('🧠 简单Y智能止损模块已初始化', {
            instanceId,
            activeBinSafetyThreshold: smartStopLossConfig.activeBinSafetyThreshold,
            observationPeriodMinutes: smartStopLossConfig.observationPeriodMinutes,
            lossThresholdPercentage: smartStopLossConfig.lossThresholdPercentage,
            riskThreshold: stopLossModule.getConfig().riskThreshold,
            factoryManaged: true
        });
    }

    private async initializePositionRecreation(instanceId: string): Promise<void> {
        const logger = this.getInstanceLogger(instanceId);
        const config = this.instanceConfigs.get(instanceId);
        const state = this.instanceStates.get(instanceId);
        
        if (!logger || !config || !state) return;

        try {
            // 委托给头寸服务进行初始化
            const context = this.createModuleContext(instanceId, config, state);
            await this.positionService.initializePositionRecreation(context);

            await logger.logMonitoring('🏗️ 简单Y头寸重建模块初始化完成（通过头寸服务）', { instanceId });

        } catch (error) {
            await logger.logError(`简单Y头寸重建模块初始化失败: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * 📡 广播策略状态更新到前端
     */
    private async broadcastStrategyStatusUpdate(instanceId: string, status: string, reason: string): Promise<void> {
        try {
            const state = this.instanceStates.get(instanceId);
            if (!state) return;

            const statusData = {
                instanceId,
                status,
                reason,
                phase: state.phase,
                isActive: state.isActive,
                stoppingReason: state.stoppingReason,
                positionAddress: state.positionAddress,
                lastUpdateTime: Date.now(),
                timestamp: Date.now()
            };

            // 通过事件总线发送策略状态更新
            await this.eventBus.publish('strategy.status.update', statusData);

            const logger = this.getInstanceLogger(instanceId);
            await logger?.logMonitoring('📡 简单Y策略状态更新已广播到前端', {
                instanceId,
                status,
                reason,
                phase: state.phase
            });

        } catch (error) {
            const logger = this.getInstanceLogger(instanceId);
            await logger?.logError(`简单Y广播策略状态更新失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 📡 广播智能止损数据到前端 - 与连锁头寸策略完全一致
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
                    },

                    // 🆕 新增：基准收益率数据
                    benchmarkYieldRates: marketData.benchmarkYieldRates || null,

                    // 🔥 新增：动态重建开关状态
                    dynamicRecreationSwitchEnabled: marketData.dynamicRecreationSwitchEnabled || false
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
            await logger?.logMonitoring('📡 简单Y智能止损数据已广播到前端', {
                instanceId,
                action: decision.action,
                confidence: decision.confidence
            });

        } catch (error) {
            const logger = this.getInstanceLogger(instanceId);
            await logger?.logError(`简单Y广播智能止损数据失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
} 