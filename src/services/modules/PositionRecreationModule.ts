/**
 * 🏗️ 头寸重建模块
 * 独立的重建决策引擎，可以嵌入到任何策略中
 * 
 * 核心功能：
 * - 超出范围检测和决策
 * - 价格检查逻辑
 * - 重建条件评估
 * - 重建建议生成
 * 
 * 设计原则：
 * - 与智能止损模块一致的数据接口
 * - 重建流程与原始策略执行器完全一致
 * - 只负责决策，不包含重试机制
 */

// 导入智能止损模块的MarketData接口，确保数据结构一致
import { MarketData } from './SmartStopLossModule';

// 头寸重建配置接口
export interface PositionRecreationConfig {
    // 超出范围配置
    outOfRangeTimeout: number;           // 超出范围超时时间（秒）

    // 价格检查配置
    maxPriceForRecreation?: number;      // 重新创建头寸的最大价格上限
    minPriceForRecreation?: number;      // 重新创建头寸的最小价格下限
    enablePriceCheck: boolean;           // 是否启用价格检查

    // 市场机会配置（智能重建）
    enableMarketOpportunityRecreation: boolean;  // 是否启用智能头寸重建（70%位置+1%盈利）

    // 🚀 第三个智能判断方法：止损后反弹重建配置
    enableLossRecoveryRecreation: boolean;       // 启用止损后反弹重建

    // 🌟 第四个智能判断方法：动态盈利阈值重建配置
    enableDynamicProfitRecreation: boolean;      // 启用基于基准收益率的动态盈利阈值重建

    // 🏗️ 方法2：智能头寸重建自定义参数
    marketOpportunity?: {
        positionThreshold: number;       // 活跃bin位置阈值(%)，默认70
        profitThreshold: number;         // 盈利阈值(%)，默认1
    };

    // 🚀 方法3：止损后反弹重建自定义参数
    lossRecovery?: {
        markPositionThreshold: number;       // 标记时位置阈值(%)，默认65
        markLossThreshold: number;           // 标记时亏损阈值(%)，默认0.5
        triggerPositionThreshold: number;    // 触发时位置阈值(%)，默认70
        triggerProfitThreshold: number;      // 触发时盈利阈值(%)，默认0.5
    };

    // 🌟 方法4：动态盈利阈值重建自定义参数
    dynamicProfitRecreation?: {
        positionThreshold: number;       // 活跃bin位置阈值(%)，默认70
        // 基准收益率档位边界
        benchmarkTier1Max: number;       // 第一档最大值(%)，默认0.5
        benchmarkTier2Max: number;       // 第二档最大值(%)，默认1.5
        benchmarkTier3Max: number;       // 第三档最大值(%)，默认3.0
        benchmarkTier4Max: number;       // 第四档最大值(%)，默认以上
        // 对应的盈利阈值
        profitThresholdTier1: number;    // 第一档盈利阈值(%)，默认0.5
        profitThresholdTier2: number;    // 第二档盈利阈值(%)，默认1.5
        profitThresholdTier3: number;    // 第三档盈利阈值(%)，默认3.0
        profitThresholdTier4: number;    // 第四档盈利阈值(%)，默认5.0
    };

    // 通用配置
    minRecreationInterval: number;       // 最小重建间隔（毫秒）
    maxRecreationCost: number;          // 最大重建成本
    minActiveBinPositionThreshold?: number; // 🆕 最低活跃bin位置阈值(%)，低于此值禁止重建
}

// 重建检查参数接口 - 使用与智能止损模块一致的MarketData
export interface RecreationCheckParams {
    // 🔥 核心市场数据 - 与智能止损模块完全一致
    marketData: MarketData;

    // 🔥 头寸状态信息
    position1Address?: string | null;
    position2Address?: string | null;
    positionRange: [number, number];

    // 🔥 超出范围状态
    outOfRangeStartTime?: Date | null;
    outOfRangeDirection?: 'ABOVE' | 'BELOW' | null;
    isInRange: boolean;

    // 🔥 策略配置
    strategyConfig: {
        poolAddress: string;
        outOfRangeTimeout: number;
        maxPriceForRecreation?: number;
        minPriceForRecreation?: number;
        monitoringInterval: number;
        [key: string]: any;
    };

    // 🔥 实例信息
    instanceId: string;
    phase: string;
}

// 重建决策接口
export interface RecreationDecision {
    shouldRecreate: boolean;
    reason: string;
    recreationType: 'OUT_OF_RANGE' | 'MARKET_OPPORTUNITY' | 'PRICE_CHECK_FAILED' | 'LOSS_RECOVERY' | 'DYNAMIC_PROFIT' | 'POSITION_TOO_LOW' | 'NONE';
    confidence: number;
    urgency: 'low' | 'medium' | 'high' | 'critical';

    // 🔥 决策详情
    outOfRangeDetails?: {
        direction: 'ABOVE' | 'BELOW';
        timeElapsed: number;
        timeRemaining: number;
        shouldStartTimeout: boolean;
    };

    // 🔥 价格检查详情
    priceCheckDetails?: {
        currentPrice: number;
        maxPriceLimit?: number;
        priceCheckPassed: boolean;
        shouldKeepPosition: boolean;
    };

    // 🔥 推荐操作
    recommendedAction: string;
    nextEvaluationTime?: number;

    // 🔥 扩展数据
    customData?: any;
}

// 重建执行参数接口
export interface RecreationExecutionParams {
    decision: RecreationDecision;
    currentPositions: {
        position1Address?: string | null;
        position2Address?: string | null;
    };
    marketData: MarketData;
    instanceId: string;
    executionContext: any;
}

// 重建执行结果接口
export interface RecreationResult {
    success: boolean;
    newPositions?: {
        position1Address?: string | null;
        position2Address?: string | null;
    };
    error?: string;
    executionTime: number;
    cost?: number;
    skippedReason?: string;
}

/**
 * 头寸重建模块主类
 */
export class PositionRecreationModule {
    private config: PositionRecreationConfig;
    private lastRecreationTime: number = 0;

    // 🔥 新增：实例级状态管理（与原始脚本一致）
    private instanceStates: Map<string, {
        outOfRangeStartTime: Date | null;
        outOfRangeDirection: 'ABOVE' | 'BELOW' | null;
        // 🚀 第三个智能判断方法：止损后反弹重建状态
        lossRecoveryMarked: boolean;  // 是否已标记亏损状态
    }> = new Map();

    // 默认配置
    private static readonly DEFAULT_CONFIG: PositionRecreationConfig = {
        outOfRangeTimeout: 30 * 60, // 30分钟（秒）
        enablePriceCheck: true,
        enableMarketOpportunityRecreation: true, // 🔥 启用市场机会重建（包含智能重建逻辑）
        enableLossRecoveryRecreation: true, // 🚀 启用止损后反弹重建
        enableDynamicProfitRecreation: true, // 🌟 启用动态盈利阈值重建
        minRecreationInterval: 10 * 60 * 1000, // 10分钟（毫秒）
        maxRecreationCost: 0.01, // 1%
        minActiveBinPositionThreshold: 0, // 🆕 默认0表示无限制
        // 🏗️ 方法2默认参数
        marketOpportunity: {
            positionThreshold: 70,   // 活跃bin位置阈值70%
            profitThreshold: 1       // 盈利阈值1%
        },
        // 🚀 方法3默认参数
        lossRecovery: {
            markPositionThreshold: 65,       // 标记时位置阈值65%
            markLossThreshold: 0.5,          // 标记时亏损阈值0.5%
            triggerPositionThreshold: 70,    // 触发时位置阈值70%
            triggerProfitThreshold: 0.5      // 触发时盈利阈值0.5%
        },
        // 🌟 方法4默认参数
        dynamicProfitRecreation: {
            positionThreshold: 70,           // 活跃bin位置阈值70%
            benchmarkTier1Max: 0.5,          // 第一档：0% - 0.5%
            benchmarkTier2Max: 1.5,          // 第二档：0.5% - 1.5%
            benchmarkTier3Max: 3.0,          // 第三档：1.5% - 3.0%
            benchmarkTier4Max: 999,          // 第四档：3.0%以上
            profitThresholdTier1: 0.5,       // 第一档盈利阈值0.5%
            profitThresholdTier2: 1.5,       // 第二档盈利阈值1.5%
            profitThresholdTier3: 3.0,       // 第三档盈利阈值3.0%
            profitThresholdTier4: 5.0        // 第四档盈利阈值5.0%
        }
    };

    constructor(config: Partial<PositionRecreationConfig> = {}) {
        this.config = { ...PositionRecreationModule.DEFAULT_CONFIG, ...config };
    }

    /**
     * 🎯 主要评估方法 - 分析是否需要重建头寸
     * 完全复制原始策略执行器的checkActiveBinPosition逻辑
     */
    async shouldRecreatePosition(params: RecreationCheckParams): Promise<RecreationDecision> {
        const { marketData, positionRange, isInRange, strategyConfig, instanceId } = params;

        // 🆕 步骤0: 通用最低活跃bin位置检查（适用于所有方法）
        if (this.config.minActiveBinPositionThreshold && this.config.minActiveBinPositionThreshold > 0) {
            const [lowerBin, upperBin] = positionRange;
            const activeBin = marketData.activeBin;
            const totalRange = upperBin - lowerBin;
            const positionPercentage = totalRange > 0
                ? Math.max(0, Math.min(100, ((activeBin - lowerBin) / totalRange) * 100))
                : 0;

            if (positionPercentage < this.config.minActiveBinPositionThreshold) {
                return {
                    shouldRecreate: false,
                    reason: `活跃bin位置过低：${positionPercentage.toFixed(1)}% < ${this.config.minActiveBinPositionThreshold}%，禁止所有重建方法`,
                    recreationType: 'POSITION_TOO_LOW',
                    confidence: 0,
                    urgency: 'low',
                    recommendedAction: '等待活跃bin位置回升'
                };
            }
        }

        // 🔥 获取实例状态（模块内部管理）
        const instanceState = this.getInstanceState(instanceId);
        const outOfRangeStartTime = instanceState.outOfRangeStartTime;
        const outOfRangeDirection = instanceState.outOfRangeDirection;

        // 🔥 步骤1: 检查超出范围情况（复制原始逻辑）
        const outOfRangeResult = await this.checkOutOfRange({
            ...params,
            outOfRangeStartTime,
            outOfRangeDirection
        });

        // 🔥 更新实例状态（根据决策结果）
        this.updateInstanceState(instanceId, outOfRangeResult);

        if (outOfRangeResult.shouldRecreate) {
            // 🔥 步骤2: 如果需要重建，进行价格检查（复制原始逻辑）
            const priceCheckResult = await this.checkPriceForRecreation({
                ...params,
                outOfRangeStartTime,
                outOfRangeDirection
            }, outOfRangeResult);

            // 🔥 如果价格检查失败且需要重置状态
            if (priceCheckResult.recreationType === 'PRICE_CHECK_FAILED' && priceCheckResult.priceCheckDetails?.shouldKeepPosition) {
                this.resetInstanceState(instanceId);
            }

            return priceCheckResult;
        }

        // 🔧 修复：一次性收集所有方法的结果，避免重复调用和状态混乱
        const allResults = [outOfRangeResult];
        
        // 收集启用的方法结果
        let marketOpportunityResult: RecreationDecision | null = null;
        if (this.config.enableMarketOpportunityRecreation) {
            marketOpportunityResult = await this.checkMarketOpportunity(params);
            allResults.push(marketOpportunityResult);
        }

        let thirdSmartJudgmentResult: RecreationDecision | null = null;
        if (this.config.enableLossRecoveryRecreation) {
            thirdSmartJudgmentResult = await this.checkThirdSmartJudgment(params);
            allResults.push(thirdSmartJudgmentResult);
        }

        let fourthSmartJudgmentResult: RecreationDecision | null = null;
        if (this.config.enableDynamicProfitRecreation) {
            fourthSmartJudgmentResult = await this.checkFourthSmartJudgment(params);
            allResults.push(fourthSmartJudgmentResult);
        }

        // 🔮 第五个智能判断方法（预留扩展占位符）
        const fifthSmartJudgmentResult = await this.checkFifthSmartJudgment(params);
        if (fifthSmartJudgmentResult.shouldRecreate) {
            return fifthSmartJudgmentResult;
        }

        // 🔥 按优先级检查重建条件：谁先满足条件就执行谁
        
        // 步骤3: 检查方法2（市场机会）
        if (marketOpportunityResult?.shouldRecreate) {
            return marketOpportunityResult;
        }

        // 步骤4: 检查方法3（止损反弹）
        if (thirdSmartJudgmentResult?.shouldRecreate) {
            return thirdSmartJudgmentResult;
        }

        // 步骤5: 检查方法4（动态盈利）
        if (fourthSmartJudgmentResult?.shouldRecreate) {
            return fourthSmartJudgmentResult;
        }

        // 🔧 没有任何方法需要重建时，选择最有价值的状态信息用于显示
        return this.selectMostValuableState(allResults, instanceId);
    }

    /**
     * 🔧 获取实例状态
     */
    private getInstanceState(instanceId: string): {
        outOfRangeStartTime: Date | null;
        outOfRangeDirection: 'ABOVE' | 'BELOW' | null;
        lossRecoveryMarked: boolean;
    } {
        if (!this.instanceStates.has(instanceId)) {
            this.instanceStates.set(instanceId, {
                outOfRangeStartTime: null,
                outOfRangeDirection: null,
                lossRecoveryMarked: false
            });
        }
        return this.instanceStates.get(instanceId)!;
    }

    /**
     * 🔧 更新实例状态
     */
    private updateInstanceState(instanceId: string, decision: RecreationDecision): void {
        const state = this.getInstanceState(instanceId);

        if (decision.outOfRangeDetails?.shouldStartTimeout) {
            // 开始计时
            state.outOfRangeStartTime = new Date();
            state.outOfRangeDirection = decision.outOfRangeDetails.direction;
        } else if (decision.recreationType === 'OUT_OF_RANGE' && decision.confidence === 0) {
            // 回到范围内，重置状态
            state.outOfRangeStartTime = null;
            state.outOfRangeDirection = null;
        }

        // 🚀 第三个智能判断方法：如果触发重建，清除标记
        if (decision.shouldRecreate && decision.recreationType === 'LOSS_RECOVERY') {
            state.lossRecoveryMarked = false;
        }
    }

    /**
     * 🔧 重置实例状态（用于价格检查失败等情况）
     */
    private resetInstanceState(instanceId: string): void {
        const state = this.getInstanceState(instanceId);
        state.outOfRangeStartTime = null;
        state.outOfRangeDirection = null;
        state.lossRecoveryMarked = false;  // 🚀 同时重置止损反弹标记
    }

    /**
     * 🔧 清理实例状态（用于策略停止时）
     */
    public cleanupInstanceState(instanceId: string): void {
        this.instanceStates.delete(instanceId);
    }

    /**
     * 🔍 第一个智能判断方法：检查超出范围情况 - 完全复制原始逻辑
     */
    private async checkOutOfRange(params: RecreationCheckParams): Promise<RecreationDecision> {
        const { marketData, positionRange, outOfRangeStartTime, outOfRangeDirection, isInRange, strategyConfig } = params;

        const [lowerBin, upperBin] = positionRange;
        const activeBin = marketData.activeBin;
        const currentIsInRange = activeBin >= lowerBin && activeBin <= upperBin;

        // 🔥 如果在范围内，不需要重建
        if (currentIsInRange) {
            return {
                shouldRecreate: false,
                reason: 'Position is within range',
                recreationType: 'OUT_OF_RANGE',
                confidence: 0,
                urgency: 'low',
                recommendedAction: 'Continue monitoring'
            };
        }

        // 🔥 确定超出方向
        const currentDirection: 'ABOVE' | 'BELOW' = activeBin > upperBin ? 'ABOVE' : 'BELOW';

        // 🔥 如果是新的超出范围状态，需要开始计时
        if (isInRange || !outOfRangeStartTime || outOfRangeDirection !== currentDirection) {
            return {
                shouldRecreate: false,
                reason: 'Out of range detected, starting timeout',
                recreationType: 'OUT_OF_RANGE',
                confidence: 50,
                urgency: 'medium',
                recommendedAction: 'Start timeout monitoring',
                outOfRangeDetails: {
                    direction: currentDirection,
                    timeElapsed: 0,
                    timeRemaining: strategyConfig.outOfRangeTimeout,
                    shouldStartTimeout: true
                }
            };
        }

        // 🔥 计算超出范围的时间
        const timeElapsed = Math.floor((Date.now() - outOfRangeStartTime.getTime()) / 1000);
        const timeRemaining = strategyConfig.outOfRangeTimeout - timeElapsed;

        // 🔥 检查是否超过超时阈值
        if (timeElapsed >= strategyConfig.outOfRangeTimeout) {
            return {
                shouldRecreate: true,
                reason: `Out of range timeout exceeded (${timeElapsed}s >= ${strategyConfig.outOfRangeTimeout}s)`,
                recreationType: 'OUT_OF_RANGE',
                confidence: 95,
                urgency: 'critical',
                recommendedAction: 'Recreate position to restore liquidity',
                outOfRangeDetails: {
                    direction: currentDirection,
                    timeElapsed: timeElapsed,
                    timeRemaining: 0,
                    shouldStartTimeout: false
                }
            };
        } else {
            return {
                shouldRecreate: false,
                reason: `Waiting for timeout (${timeRemaining}s remaining)`,
                recreationType: 'OUT_OF_RANGE',
                confidence: 70,
                urgency: 'medium',
                recommendedAction: 'Continue waiting',
                outOfRangeDetails: {
                    direction: currentDirection,
                    timeElapsed: timeElapsed,
                    timeRemaining: timeRemaining,
                    shouldStartTimeout: false
                }
            };
        }
    }

    /**
     * 💰 第一个智能判断方法：价格检查逻辑 - 完全复制原始逻辑
     */
    private async checkPriceForRecreation(params: RecreationCheckParams, outOfRangeDecision: RecreationDecision): Promise<RecreationDecision> {
        const { marketData, strategyConfig } = params;

        // 🔥 只有向上超出范围且配置了价格上限时才进行价格检查
        const direction = outOfRangeDecision.outOfRangeDetails?.direction;
        if (direction === 'ABOVE' && this.config.enablePriceCheck && strategyConfig.maxPriceForRecreation && strategyConfig.maxPriceForRecreation > 0) {
            const currentPrice = marketData.currentPrice;
            const maxPriceLimit = strategyConfig.maxPriceForRecreation;

            if (currentPrice > maxPriceLimit) {
                // 🔥 价格超过上限，保持头寸不关闭
                return {
                    shouldRecreate: false,
                    reason: `Price too high for recreation (${currentPrice} > ${maxPriceLimit})`,
                    recreationType: 'PRICE_CHECK_FAILED',
                    confidence: 90,
                    urgency: 'low',
                    recommendedAction: 'Keep position, wait for price to drop',
                    priceCheckDetails: {
                        currentPrice: currentPrice,
                        maxPriceLimit: maxPriceLimit,
                        priceCheckPassed: false,
                        shouldKeepPosition: true
                    }
                };
            } else {
                // 🔥 价格检查通过，可以重建
                return {
                    ...outOfRangeDecision,
                    reason: `${outOfRangeDecision.reason} and price check passed`,
                    priceCheckDetails: {
                        currentPrice: currentPrice,
                        maxPriceLimit: maxPriceLimit,
                        priceCheckPassed: true,
                        shouldKeepPosition: false
                    }
                };
            }
        }

        // 🔥 不需要价格检查或向下超出范围，直接返回原决策
        return outOfRangeDecision;
    }

    /**
     * 📊 第二个智能判断方法：检查市场机会（智能头寸重建逻辑）
     * 
     * 🎯 触发条件（使用配置参数）：
     * 1. 活跃bin在头寸范围内的位置低于配置的位置阈值
     * 2. 当前盈亏百分比大于配置的盈利阈值
     * 
     * 📝 计算公式：
     * 位置百分比 = (活跃bin - 头寸下边界) / (头寸上边界 - 头寸下边界) * 100
     */
    private async checkMarketOpportunity(params: RecreationCheckParams): Promise<RecreationDecision> {
        const { marketData, positionRange } = params;

        // 🧠 智能头寸重建逻辑：当活跃bin在头寸范围内低于配置阈值时，且盈亏百分比大于配置阈值时，执行头寸重建
        const [lowerBin, upperBin] = positionRange;
        const activeBin = marketData.activeBin;

        // 🏗️ 获取配置参数（使用配置或默认值）
        const positionThreshold = this.config.marketOpportunity?.positionThreshold || 70;
        const profitThreshold = this.config.marketOpportunity?.profitThreshold || 1;

        // 计算位置百分比（与智能止损模块完全一致）
        const totalRange = upperBin - lowerBin;
        if (totalRange > 0) {
            const positionInRange = activeBin - lowerBin;
            const positionPercentage = Math.max(0, Math.min(100, (positionInRange / totalRange) * 100));

            // 🔥 智能重建条件1：活跃bin位置低于配置阈值
            const isPositionBelowThreshold = positionPercentage < positionThreshold;

            // 🔥 智能重建条件2：盈亏百分比大于配置阈值
            const isPnLAboveThreshold = marketData.netPnLPercentage > profitThreshold;

            // 🔥 两个条件都满足时触发智能重建
            if (isPositionBelowThreshold && isPnLAboveThreshold) {
                return {
                    shouldRecreate: true,
                    reason: `智能重建触发: 活跃bin位置${positionPercentage.toFixed(1)}%低于${positionThreshold}%阈值，且盈利${marketData.netPnLPercentage.toFixed(2)}%超过${profitThreshold}%阈值`,
                    recreationType: 'MARKET_OPPORTUNITY',
                    confidence: 85,
                    urgency: 'medium',
                    recommendedAction: '执行智能头寸重建以优化收益位置'
                };
            }

            // 🔍 调试信息：记录为什么没有触发智能重建
            const debugReason = [];
            if (!isPositionBelowThreshold) debugReason.push(`位置${positionPercentage.toFixed(1)}% >= ${positionThreshold}%`);
            if (!isPnLAboveThreshold) debugReason.push(`盈利${marketData.netPnLPercentage.toFixed(2)}% <= ${profitThreshold}%`);

            return {
                shouldRecreate: false,
                reason: `智能重建条件未满足: ${debugReason.join(', ')}`,
                recreationType: 'MARKET_OPPORTUNITY',
                confidence: 0,
                urgency: 'low',
                recommendedAction: '继续监控智能重建条件'
            };
        }

        return {
            shouldRecreate: false,
            reason: '头寸范围无效，无法计算位置百分比',
            recreationType: 'MARKET_OPPORTUNITY',
            confidence: 0,
            urgency: 'low',
            recommendedAction: '检查头寸配置'
        };
    }

    /**
     * 🚀 第三个智能判断方法：止损后反弹重建
     * 
     * 逻辑（使用配置参数）：
     * 1. 活跃bin位置低于配置的标记位置阈值 且 亏损>=配置的标记亏损阈值 → 标记亏损状态
     * 2. 已标记状态下，位置仍<=配置的触发位置阈值 且 转为盈利>=配置的触发盈利阈值 → 触发重建
     * 3. 触发重建后清除标记
     * 
     * @param params 重建检查参数
     * @returns 重建决策结果
     */
    private async checkThirdSmartJudgment(params: RecreationCheckParams): Promise<RecreationDecision> {
        // 🔧 检查是否启用此功能
        if (!this.config.enableLossRecoveryRecreation) {
            return {
                shouldRecreate: false,
                reason: 'Loss recovery recreation is disabled',
                recreationType: 'LOSS_RECOVERY',
                confidence: 0,
                urgency: 'low',
                recommendedAction: 'Feature disabled'
            };
        }

        const { marketData, positionRange, instanceId } = params;
        const [lowerBin, upperBin] = positionRange;
        const activeBin = marketData.activeBin;

        // 🏗️ 获取配置参数（使用配置或默认值）
        const markPositionThreshold = this.config.lossRecovery?.markPositionThreshold || 65;
        const markLossThreshold = this.config.lossRecovery?.markLossThreshold || 0.5;
        const triggerPositionThreshold = this.config.lossRecovery?.triggerPositionThreshold || 70;
        const triggerProfitThreshold = this.config.lossRecovery?.triggerProfitThreshold || 0.5;

        // 🧮 计算位置百分比（与第二个方法完全一致）
        const totalRange = upperBin - lowerBin;
        if (totalRange <= 0) {
            return {
                shouldRecreate: false,
                reason: 'Invalid position range',
                recreationType: 'LOSS_RECOVERY',
                confidence: 0,
                urgency: 'low',
                recommendedAction: 'Check position configuration'
            };
        }

        const positionInRange = activeBin - lowerBin;
        const positionPercentage = Math.max(0, Math.min(100, (positionInRange / totalRange) * 100));
        const netPnLPercentage = marketData.netPnLPercentage;

        // 🔥 获取实例状态
        const state = this.getInstanceState(instanceId);

        // 🎯 步骤1：检查是否需要标记亏损状态
        if (!state.lossRecoveryMarked) {
            // 检查标记条件：位置 < 配置的标记位置阈值 且 亏损 >= 配置的标记亏损阈值
            const isPositionBelowThreshold = positionPercentage < markPositionThreshold;
            const isInLoss = netPnLPercentage <= -markLossThreshold;

            if (isPositionBelowThreshold && isInLoss) {
                // 🚨 标记亏损状态
                state.lossRecoveryMarked = true;

                return {
                    shouldRecreate: false,
                    reason: `止损状态标记：位置${positionPercentage.toFixed(1)}% < ${markPositionThreshold}%，亏损${netPnLPercentage.toFixed(2)}% <= -${markLossThreshold}%`,
                    recreationType: 'LOSS_RECOVERY',
                    confidence: 60,
                    urgency: 'medium',
                    recommendedAction: '已标记亏损状态，等待反弹机会'
                };
            }

            return {
                shouldRecreate: false,
                reason: `监控中：位置${positionPercentage.toFixed(1)}%，盈亏${netPnLPercentage.toFixed(2)}%，未达到标记条件`,
                recreationType: 'LOSS_RECOVERY',
                confidence: 0,
                urgency: 'low',
                recommendedAction: '继续监控标记条件'
            };
        }

        // 🎯 步骤2：已标记状态，检查反弹重建条件
        const isPositionStillLow = positionPercentage <= triggerPositionThreshold;
        const hasTurnedProfit = netPnLPercentage >= triggerProfitThreshold;

        if (isPositionStillLow && hasTurnedProfit) {
            // 🚀 触发反弹重建！
            return {
                shouldRecreate: true,
                reason: `🚀 止损后反弹重建触发！位置${positionPercentage.toFixed(1)}% <= ${triggerPositionThreshold}%，盈利${netPnLPercentage.toFixed(2)}% >= ${triggerProfitThreshold}%`,
                recreationType: 'LOSS_RECOVERY',
                confidence: 95,
                urgency: 'critical',
                recommendedAction: '立即执行反弹重建以锁定盈利'
            };
        }

        // 🔄 条件不满足但保持标记状态
        return {
            shouldRecreate: false,
            reason: `等待反弹：位置${positionPercentage.toFixed(1)}%，盈亏${netPnLPercentage.toFixed(2)}%，条件未满足但保持标记`,
            recreationType: 'LOSS_RECOVERY',
            confidence: 70,
            urgency: 'medium',
            recommendedAction: '继续等待反弹重建条件'
        };
    }

    /**
     * 🌟 第四个智能判断方法：基于基准收益率动态调节盈利阈值重建
     * 
     * �� 核心逻辑：
     * 1. 检查15分钟平均基准收益率是否有效（>0且非null）
     * 2. 根据基准收益率确定档位（3个档位）
     * 3. 根据档位选择对应的盈利阈值
     * 4. 检查位置和盈利条件，决定是否重建
     * 
     * 📊 档位设计：
     * - 第一档：0% - benchmarkTier1Max%，对应盈利阈值：profitThresholdTier1%
     * - 第二档：benchmarkTier1Max% - benchmarkTier2Max%，对应盈利阈值：profitThresholdTier2%
     * - 第三档：benchmarkTier2Max%以上，对应盈利阈值：profitThresholdTier3%
     * 
     * @param params 重建检查参数（包含所有必要数据）
     * @returns 重建决策结果
     */
    private async checkFourthSmartJudgment(params: RecreationCheckParams): Promise<RecreationDecision> {
        const { marketData, positionRange } = params;
        const [lowerBin, upperBin] = positionRange;
        const activeBin = marketData.activeBin;
        const netPnLPercentage = marketData.netPnLPercentage;

        // 🔧 获取配置参数
        const config = this.config.dynamicProfitRecreation!;
        const {
            positionThreshold,
            benchmarkTier1Max,
            benchmarkTier2Max,
            benchmarkTier3Max,
            profitThresholdTier1,
            profitThresholdTier2,
            profitThresholdTier3,
            profitThresholdTier4
        } = config;

        // 🧮 计算位置百分比（与第二、三个方法一致）
        const totalRange = upperBin - lowerBin;
        const positionPercentage = totalRange > 0
            ? Math.max(0, Math.min(100, ((activeBin - lowerBin) / totalRange) * 100))
            : 0;

        // 🎯 步骤1：检查15分钟平均基准收益率是否有效
        const average15MinuteBenchmark = marketData.benchmarkYieldRates?.average15MinuteBenchmark;

        if (!average15MinuteBenchmark || average15MinuteBenchmark <= 0) {
            return {
                shouldRecreate: false,
                reason: `动态盈利阈值暂不可用：15分钟平均基准收益率${average15MinuteBenchmark === null ? '未就绪' : '无效'}（需要策略启动20分钟后）`,
                recreationType: 'DYNAMIC_PROFIT',
                confidence: 0,
                urgency: 'low',
                recommendedAction: '等待15分钟平均基准收益率数据'
            };
        }

        // 🎯 步骤2：根据基准收益率确定档位和对应的盈利阈值
        const benchmarkPercentage = average15MinuteBenchmark * 100;
        let currentProfitThreshold: number;
        let tierDescription: string;

        if (benchmarkPercentage <= benchmarkTier1Max) {
            currentProfitThreshold = profitThresholdTier1;
            tierDescription = `第一档(0%-${benchmarkTier1Max}%)`;
        } else if (benchmarkPercentage <= benchmarkTier2Max) {
            currentProfitThreshold = profitThresholdTier2;
            tierDescription = `第二档(${benchmarkTier1Max}%-${benchmarkTier2Max}%)`;
        } else if (benchmarkPercentage <= benchmarkTier3Max) {
            currentProfitThreshold = profitThresholdTier3;
            tierDescription = `第三档(${benchmarkTier2Max}%-${benchmarkTier3Max}%)`;
        } else {
            currentProfitThreshold = profitThresholdTier4;
            tierDescription = `第四档(${benchmarkTier3Max}%以上)`;
        }

        // 🎯 步骤3：检查位置和盈利条件
        // 🔧 修正判断逻辑：与其他方法保持一致，当位置低于或等于阈值时触发重建
        const isPositionBelowThreshold = positionPercentage <= positionThreshold;
        const isProfitMeetsThreshold = netPnLPercentage >= currentProfitThreshold;

        if (isPositionBelowThreshold && isProfitMeetsThreshold) {
            return {
                shouldRecreate: true,
                reason: `🌟 动态盈利阈值重建触发！位置${positionPercentage.toFixed(1)}% <= ${positionThreshold}%，盈利${netPnLPercentage.toFixed(2)}% >= ${currentProfitThreshold}%（${tierDescription}，基准收益率${benchmarkPercentage.toFixed(3)}%）`,
                recreationType: 'DYNAMIC_PROFIT',
                confidence: 90,
                urgency: 'high',
                recommendedAction: '立即执行动态盈利阈值重建'
            };
        }

        return {
            shouldRecreate: false,
            reason: `动态盈利阈值监控：位置${positionPercentage.toFixed(1)}%/${positionThreshold}%，盈利${netPnLPercentage.toFixed(2)}%/${currentProfitThreshold}%（${tierDescription}，基准收益率${benchmarkPercentage.toFixed(3)}%）`,
            recreationType: 'DYNAMIC_PROFIT',
            confidence: 60,
            urgency: 'medium',
            recommendedAction: '继续监控动态盈利阈值条件'
        };
    }

    /**
     * 🔮 第五个智能判断方法：预留扩展占位符
     * 
     * 📝 注意：这是一个占位符方法，暂未实现具体功能
     * 用于未来扩展新的智能重建逻辑
     * 
     * @param params 重建检查参数
     * @returns 重建决策结果（目前总是返回不重建）
     */
    private async checkFifthSmartJudgment(params: RecreationCheckParams): Promise<RecreationDecision> {
        // 🔮 占位符：未来可在此处实现新的智能重建逻辑
        return {
            shouldRecreate: false,
            reason: '第五个智能判断方法：预留扩展（暂未实现）',
            recreationType: 'NONE',
            confidence: 0,
            urgency: 'low',
            recommendedAction: '占位符方法，暂无操作'
        };
    }

    /**
     * 📊 获取配置
     */
    getConfig(): PositionRecreationConfig {
        return { ...this.config };
    }

    /**
     * 🔧 更新配置
     */
    updateConfig(config: Partial<PositionRecreationConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * 📈 获取最后重建时间
     */
    getLastRecreationTime(): number {
        return this.lastRecreationTime;
    }

    /**
     * 🔧 设置最后重建时间（由执行器调用）
     */
    setLastRecreationTime(time: number): void {
        this.lastRecreationTime = time;
    }

    /**
     * 🔧 检查重建间隔
     */
    canRecreate(): boolean {
        const timeSinceLastRecreation = Date.now() - this.lastRecreationTime;
        return timeSinceLastRecreation >= this.config.minRecreationInterval;
    }

    /**
 * 🧠 智能状态选择：从所有决策结果中选择最有价值的状态信息
 */
    private selectMostValuableState(decisions: RecreationDecision[], instanceId: string): RecreationDecision {
        // 🏆 第一优先级：有具体倒计时信息的状态（最有价值）
        const countdownState = decisions.find(d =>
            d.recreationType === 'OUT_OF_RANGE' &&
            d.outOfRangeDetails?.timeRemaining && d.outOfRangeDetails.timeRemaining > 0
        );
        if (countdownState) {
            // 🔥 增强状态信息，标记选择原因
            return {
                ...countdownState,
                reason: `${countdownState.reason} (智能选择: 超出范围倒计时)`
            };
        }

        // 🏆 第二优先级：有具体进度标记的状态
        const markedState = decisions.find(d =>
            d.recreationType === 'LOSS_RECOVERY' &&
            (d.reason.includes('已标记') || d.reason.includes('等待反弹'))
        );
        if (markedState) {
            return {
                ...markedState,
                reason: `${markedState.reason} (智能选择: 止损反弹标记状态)`
            };
        }

        // 🏆 第三优先级：动态盈利阈值状态（第四个方法）
        const dynamicProfitState = decisions.find(d =>
            d.recreationType === 'DYNAMIC_PROFIT' &&
            d.confidence > 0
        );
        if (dynamicProfitState) {
            return {
                ...dynamicProfitState,
                reason: `${dynamicProfitState.reason} (智能选择: 动态盈利阈值状态)`
            };
        }

        // 🏆 第四优先级：有分析数据的状态
        const analyticsState = decisions.find(d =>
            d.recreationType === 'MARKET_OPPORTUNITY' &&
            d.confidence > 0
        );
        if (analyticsState) {
            return {
                ...analyticsState,
                reason: `${analyticsState.reason} (智能选择: 市场机会分析状态)`
            };
        }

        // 🏆 第五优先级：任何非NONE的状态
        const activeState = decisions.find(d =>
            d.recreationType !== 'NONE' &&
            d.recreationType !== undefined &&
            d.confidence > 0
        );
        if (activeState) {
            return {
                ...activeState,
                reason: `${activeState.reason} (智能选择: 活跃状态)`
            };
        }

        // 🏆 最后：返回默认状态
        return {
            shouldRecreate: false,
            reason: 'No recreation needed (智能选择: 默认状态)',
            recreationType: 'NONE' as const,
            confidence: 0,
            urgency: 'low' as const,
            recommendedAction: 'Continue monitoring'
        };
    }


} 