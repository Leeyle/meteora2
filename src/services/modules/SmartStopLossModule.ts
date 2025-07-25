/**
 * 🧠 智能止损模块
 * 独立的决策引擎，可以嵌入到任何策略中
 * 
 * 核心功能：
 * - 风险评估算法
 * - 止损条件判断
 * - 决策逻辑处理
 * - 建议输出生成
 */

// 智能止损配置接口
export interface SmartStopLossConfig {
    riskThreshold: number;         // 风险阈值 (0-100)
    confidenceThreshold: number;   // 决策置信度阈值 (0-100)
    maxLossPercentage: number;     // 最大损失百分比
    evaluationInterval: number;    // 评估间隔（秒）

    // 🔥 新增：可配置的核心参数
    activeBinSafetyThreshold: number;    // 活跃bin位置安全阈值(%)
    observationPeriodMinutes: number;    // 观察期时长(分钟)
    lossThresholdPercentage: number;     // 亏损阈值百分比（用户配置）

    // 风险评估参数
    riskFactors: {
        priceDropWeight: number;        // 价格下跌权重
        volatilityWeight: number;       // 波动性权重
        yieldDeclineWeight: number;     // 收益下降权重
        liquidityHealthWeight: number;  // 流动性健康权重
        timeFactorWeight: number;       // 时间因素权重
    };

    // 止损条件
    stopLossConditions: {
        maxPriceDropPercentage: number;    // 最大价格下跌百分比
        maxVolatilityThreshold: number;    // 最大波动性阈值
        minYieldGrowthRate: number;        // 最小收益增长率
        maxHoldingDuration: number;        // 最大持有时间（小时）

        // 新增：基于bin位置的风险阈值
        maxBelowRangeBins: number;         // 最大允许向下脱离的bin数量
        criticalBelowRangeBins: number;    // 触发紧急止损的向下脱离bin数量
    };
}

// 历史价格变化数据接口
export interface HistoricalPriceChanges {
    last5Minutes: number;    // 过去5分钟价格变化百分比
    last15Minutes: number;   // 过去15分钟价格变化百分比
    lastHour: number;        // 过去1小时价格变化百分比
}

// 历史收益率数据接口
export interface HistoricalYieldRates {
    totalReturnRate: number; // 真实盈亏百分比（总体投资表现）
    feeYieldEfficiency: {
        last5Minutes: number;    // 过去5分钟日化收益率
        last15Minutes: number;   // 过去15分钟日化收益率
        lastHour: number;        // 过去1小时日化收益率
    };
    recentSnapshots: {
        timestamp: number;
        timeframe: number;       // 时间窗口长度（分钟）
        yieldAmount: string;     // 该时间段内的收益数量
        yieldRate: number;       // 该时间段的收益率 (%)
        annualizedRate: number;  // 年化收益率 (%)
    }[];
}

// 🆕 基准收益率数据接口
export interface BenchmarkYieldRates {
    current5MinuteBenchmark: number | null;      // 5分钟基准收益率（null表示不可用）
    average5MinuteBenchmark: number | null;      // 5分钟平均基准收益率（null表示时间不满足）
    average15MinuteBenchmark: number | null;     // 15分钟平均基准收益率（null表示时间不满足）
    average30MinuteBenchmark: number | null;     // 30分钟平均基准收益率（null表示时间不满足）
    binOffset: number;                           // 当前活跃bin偏移数量
    lastCalculationTime: number;                 // 最后计算时间
}

// 市场数据接口 - 标准化的输入数据格式
export interface MarketData {
    // 价格相关
    currentPrice: number;
    priceHistory: PricePoint[];
    priceVolatility: number;
    priceDropPercentage: number;

    // 🔥 新增：历史价格变化数据
    historicalPriceChanges?: HistoricalPriceChanges;

    // 收益相关
    totalReturn: number;
    yieldRate: number;
    yieldTrend: 'increasing' | 'decreasing' | 'stable';
    yieldGrowthRate: number;

    // 🔥 新增：历史收益率数据
    historicalYieldRates?: HistoricalYieldRates;

    // 🆕 新增：基准收益率数据
    benchmarkYieldRates?: BenchmarkYieldRates;

    // 🔥 新增：手续费数据（已转换为Y代币价值）
    currentPendingYield: string;  // 未提取手续费（Y代币价值）
    totalExtractedYield: string;  // 已提取手续费（Y代币价值）

    // 🔥 新增：动态重建开关状态
    dynamicRecreationSwitchEnabled?: boolean;  // 动态重建开关状态

    // 头寸相关
    positionValue: number;
    initialInvestment: number;
    netPnL: number;
    netPnLPercentage: number;

    // 流动性相关 - 简化为核心bin数据
    activeBin: number;           // 当前活跃bin
    positionLowerBin: number;    // 连锁头寸下边界
    positionUpperBin: number;    // 连锁头寸上边界

    // 时间相关
    holdingDuration: number;
    lastUpdateTime: number;
}

// 价格点接口
export interface PricePoint {
    timestamp: number;
    price: number;
    volume?: number;
}

// 止损决策接口
export interface StopLossDecision {
    action: 'HOLD' | 'PARTIAL_EXIT' | 'FULL_EXIT' | 'ALERT';
    confidence: number; // 0-100
    riskScore: number; // 0-100
    reasoning: string[];
    suggestedExitPercentage?: number | undefined;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    nextEvaluationTime: number;

    // 详细分析数据
    analysis: {
        priceRisk: number;
        volatilityRisk: number;
        yieldRisk: number;
        liquidityRisk: number;
        timeRisk: number;
        overallRisk: number;
    };
}

// 风险评估结果
export interface RiskAssessment {
    priceRisk: number;
    volatilityRisk: number;
    yieldRisk: number;
    liquidityRisk: number;
    timeRisk: number;
    overallRisk: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * 智能止损模块主类
 */
export class SmartStopLossModule {
    private config: SmartStopLossConfig;
    private evaluationHistory: StopLossDecision[] = [];

    // 🔥 新增：观察期状态存储
    private observationPeriods: Map<string, {
        startTime: number;
        initialPosition: number;
        initialProfitPercentage: number;  // 进入观察期时的盈利百分比
        strategyId: string;
    }> = new Map();

    // 默认配置
    private static readonly DEFAULT_CONFIG: SmartStopLossConfig = {
        riskThreshold: 70,
        confidenceThreshold: 80,
        maxLossPercentage: 20,
        evaluationInterval: 60,

        riskFactors: {
            priceDropWeight: 0.3,
            volatilityWeight: 0.2,
            yieldDeclineWeight: 0.2,
            liquidityHealthWeight: 0.15,
            timeFactorWeight: 0.15
        },

        stopLossConditions: {
            maxPriceDropPercentage: 15,
            maxVolatilityThreshold: 30,
            minYieldGrowthRate: -10,
            maxHoldingDuration: 24,

            // 新增：基于bin位置的风险阈值
            maxBelowRangeBins: 10,        // 最大允许向下脱离10个bin
            criticalBelowRangeBins: 20    // 向下脱离20个bin触发紧急止损
        },

        activeBinSafetyThreshold: 50,
        observationPeriodMinutes: 15,
        lossThresholdPercentage: 5
    };

    constructor(config: Partial<SmartStopLossConfig> = {}) {
        this.config = { ...SmartStopLossModule.DEFAULT_CONFIG, ...config };
    }

    /**
     * 🎯 主要评估方法 - 分析市场数据并生成止损决策
     */
    async evaluate(marketData: MarketData, strategyId?: string): Promise<StopLossDecision> {
        // 🔥 修复：使用传入的strategyId或生成固定ID，避免每次都创建新的观察期
        const fixedStrategyId = strategyId || `strategy_${marketData.activeBin}_${marketData.positionLowerBin}_${marketData.positionUpperBin}`;

        // 计算bin位置百分比
        const positionPercentage = this.calculatePositionPercentage(marketData);

        // 简化风险评估
        const riskAssessment = this.calculateSimplifiedRiskScore(marketData, positionPercentage);

        // 评估止损条件（传入固定的strategyId）
        const shouldStopLoss = this.evaluateSimplifiedStopLossConditions(marketData, positionPercentage, fixedStrategyId);

        // 生成决策
        const decision = this.generateSimplifiedDecision(shouldStopLoss, riskAssessment, marketData, positionPercentage);

        // 记录评估历史
        this.evaluationHistory.push(decision);

        // 清理历史记录
        this.cleanupHistory();

        return decision;
    }

    /**
     * 🧮 计算位置百分比
     */
    private calculatePositionPercentage(marketData: MarketData): number {
        const { activeBin, positionLowerBin, positionUpperBin } = marketData;

        // 防止除零错误
        const totalRange = positionUpperBin - positionLowerBin;
        if (totalRange <= 0) {
            return 50; // 默认返回中间位置
        }

        // 计算位置百分比
        const positionInRange = activeBin - positionLowerBin;
        const percentage = (positionInRange / totalRange) * 100;

        // 限制在0-100%范围内
        return Math.max(0, Math.min(100, percentage));
    }

    /**
     * 🔍 简化的风险评分计算
     */
    private calculateSimplifiedRiskScore(marketData: MarketData, positionPercentage: number): RiskAssessment {
        // 🔥 简化版本：主要基于位置百分比
        const liquidityRisk = positionPercentage <= this.config.activeBinSafetyThreshold ? 80 : 20;

        // 保留基本的价格和收益风险计算（用于扩展）
        const priceRisk = this.calculatePriceRisk(marketData);
        const yieldRisk = this.calculateYieldRisk(marketData);

        // 简化其他风险为固定值
        const volatilityRisk = 30;
        const timeRisk = 20;

        // 综合风险评分：主要权重给流动性风险
        const overallRisk = liquidityRisk * 0.6 + priceRisk * 0.2 + yieldRisk * 0.2;

        const riskLevel = this.getRiskLevel(overallRisk);

        return {
            priceRisk,
            volatilityRisk,
            yieldRisk,
            liquidityRisk,
            timeRisk,
            overallRisk,
            riskLevel
        };
    }

    /**
     * 📈 计算价格风险（保留用于扩展）
     */
    private calculatePriceRisk(marketData: MarketData): number {
        const { priceDropPercentage, netPnLPercentage } = marketData;

        // 基于价格下跌幅度的风险
        const priceDropRisk = Math.min(100, Math.abs(priceDropPercentage) * 5);

        // 基于净盈亏的风险
        const pnlRisk = netPnLPercentage < 0 ? Math.min(100, Math.abs(netPnLPercentage) * 3) : 0;

        return Math.max(priceDropRisk, pnlRisk);
    }

    /**
     * 📊 计算波动性风险（保留用于扩展）
     */
    private calculateVolatilityRisk(marketData: MarketData): number {
        const { priceVolatility } = marketData;

        // 将波动性转换为风险分数 (0-100)
        return Math.min(100, priceVolatility * 2);
    }

    /**
     * 💰 计算收益风险（保留用于扩展）
     */
    private calculateYieldRisk(marketData: MarketData): number {
        const { yieldGrowthRate, yieldTrend } = marketData;

        let riskScore = 0;

        // 基于收益增长率的风险
        if (yieldGrowthRate < 0) {
            riskScore += Math.min(50, Math.abs(yieldGrowthRate) * 2);
        }

        // 基于收益趋势的风险
        switch (yieldTrend) {
            case 'decreasing':
                riskScore += 30;
                break;
            case 'stable':
                riskScore += 10;
                break;
            case 'increasing':
                riskScore += 0;
                break;
        }

        return Math.min(100, riskScore);
    }

    /**
     * ⏰ 计算时间风险（保留用于扩展）
     */
    private calculateTimeRisk(marketData: MarketData): number {
        const { holdingDuration } = marketData;
        const maxDuration = this.config.stopLossConditions.maxHoldingDuration;

        // 基于持有时间的风险
        const timeRatio = holdingDuration / maxDuration;
        return Math.min(100, timeRatio * 80);
    }

    /**
     * 🚨 简化的止损条件评估
     */
    private evaluateSimplifiedStopLossConditions(marketData: MarketData, positionPercentage: number, strategyId: string): boolean {
        // 🔥 核心逻辑：只有位置 ≤ 安全阈值 时才考虑止损
        if (positionPercentage > this.config.activeBinSafetyThreshold) {
            return false; // 安全区域，不止损
        }

        // 位置 ≤ 安全阈值 时的判断逻辑
        const { netPnLPercentage } = marketData;

        // 情况1：亏损超过阈值才止损
        if (netPnLPercentage < 0 && Math.abs(netPnLPercentage) >= this.config.lossThresholdPercentage) {
            return true;
        }

        // 情况2：盈利时管理观察期
        return this.manageObservationPeriod(strategyId, positionPercentage, netPnLPercentage);
    }

    /**
     * ⏱️ 管理观察期
     */
    private manageObservationPeriod(strategyId: string, currentPosition: number, currentProfitPercentage: number): boolean {
        const now = Date.now();
        const observationDuration = this.config.observationPeriodMinutes * 60 * 1000; // 可配置观察期

        // 检查是否已在观察期内
        if (this.observationPeriods.has(strategyId)) {
            const observation = this.observationPeriods.get(strategyId)!;

            // 如果位置回到 > 安全阈值，结束观察期
            if (currentPosition > this.config.activeBinSafetyThreshold) {
                this.observationPeriods.delete(strategyId);
                return false;
            }

            // 检查观察期是否已满
            if (now - observation.startTime >= observationDuration) {
                // 比较当前盈利与进入观察期时的盈利
                if (currentProfitPercentage >= observation.initialProfitPercentage) {
                    // 盈利水平未降低，开始新一轮观察期
                    observation.startTime = now;
                    observation.initialProfitPercentage = currentProfitPercentage;
                    return false; // 继续观察
                } else {
                    // 盈利水平降低，触发止损
                    this.observationPeriods.delete(strategyId);
                    return true;
                }
            }

            return false; // 仍在观察期内，不止损
        } else {
            // 开始新的观察期
            this.observationPeriods.set(strategyId, {
                startTime: now,
                initialPosition: currentPosition,
                initialProfitPercentage: currentProfitPercentage,
                strategyId
            });
            return false; // 刚开始观察期，不止损
        }
    }

    /**
     * 🎯 生成简化决策
     */
    private generateSimplifiedDecision(
        shouldStopLoss: boolean,
        riskAssessment: RiskAssessment,
        marketData: MarketData,
        positionPercentage: number
    ): StopLossDecision {
        const reasoning: string[] = [];
        let action: StopLossDecision['action'] = 'HOLD';
        let confidence = 0;
        let urgency: StopLossDecision['urgency'] = 'LOW';
        let suggestedExitPercentage: number | undefined;

        // 🔥 简化的决策逻辑
        if (positionPercentage > this.config.activeBinSafetyThreshold) {
            // 安全区域
            action = 'HOLD';
            confidence = 90;
            urgency = 'LOW';
            reasoning.push(`位置安全: 活跃bin位置${positionPercentage.toFixed(1)}%，高于${this.config.activeBinSafetyThreshold}%安全线`);
        } else if (shouldStopLoss) {
            // 需要止损
            if (marketData.netPnLPercentage < 0 && Math.abs(marketData.netPnLPercentage) >= this.config.lossThresholdPercentage) {
                action = 'FULL_EXIT';
                confidence = 85;
                urgency = 'HIGH';
                reasoning.push(`立即止损: 位置${positionPercentage.toFixed(1)}%且亏损${Math.abs(marketData.netPnLPercentage).toFixed(1)}%超过阈值${this.config.lossThresholdPercentage}%`);
            } else {
                action = 'FULL_EXIT';
                confidence = 75;
                urgency = 'MEDIUM';
                reasoning.push(`观察期止损: 盈利水平降低，位置${positionPercentage.toFixed(1)}%`);
            }
        } else {
            // 观察期内
            action = 'ALERT';
            confidence = 60;
            urgency = 'MEDIUM';
            reasoning.push(`观察期: 位置${positionPercentage.toFixed(1)}%但盈利中，进行${this.config.observationPeriodMinutes}分钟观察`);
        }

        return {
            action,
            confidence,
            riskScore: riskAssessment.overallRisk,
            reasoning,
            suggestedExitPercentage,
            urgency,
            nextEvaluationTime: Date.now() + (this.config.evaluationInterval * 1000),
            analysis: {
                priceRisk: riskAssessment.priceRisk,
                volatilityRisk: riskAssessment.volatilityRisk,
                yieldRisk: riskAssessment.yieldRisk,
                liquidityRisk: riskAssessment.liquidityRisk,
                timeRisk: riskAssessment.timeRisk,
                overallRisk: riskAssessment.overallRisk
            }
        };
    }

    /**
     * 📊 获取风险等级
     */
    private getRiskLevel(riskScore: number): RiskAssessment['riskLevel'] {
        if (riskScore >= 80) return 'CRITICAL';
        if (riskScore >= 60) return 'HIGH';
        if (riskScore >= 40) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * 🧹 清理评估历史
     */
    private cleanupHistory(): void {
        // 只保留最近100次评估记录
        if (this.evaluationHistory.length > 100) {
            this.evaluationHistory = this.evaluationHistory.slice(-100);
        }

        // 🔥 清理过期的观察期（超过1小时的）
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        // 使用Array.from避免编译错误
        const expiredStrategies: string[] = [];
        this.observationPeriods.forEach((observation, strategyId) => {
            if (now - observation.startTime > oneHour) {
                expiredStrategies.push(strategyId);
            }
        });

        // 删除过期的观察期
        expiredStrategies.forEach(strategyId => {
            this.observationPeriods.delete(strategyId);
        });
    }

    /**
     * 📈 获取评估历史
     */
    getEvaluationHistory(): StopLossDecision[] {
        return [...this.evaluationHistory];
    }

    /**
     * ⚙️ 更新配置
     */
    updateConfig(config: Partial<SmartStopLossConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * 📖 获取当前配置
     */
    getConfig(): SmartStopLossConfig {
        return { ...this.config };
    }

    /**
     * 📊 获取风险评估统计
     */
    getRiskStatistics(): {
        averageRisk: number;
        maxRisk: number;
        minRisk: number;
        recentTrend: 'increasing' | 'decreasing' | 'stable';
    } {
        if (this.evaluationHistory.length === 0) {
            return {
                averageRisk: 0,
                maxRisk: 0,
                minRisk: 0,
                recentTrend: 'stable'
            };
        }

        const risks = this.evaluationHistory.map(h => h.riskScore);
        const averageRisk = risks.reduce((sum, risk) => sum + risk, 0) / risks.length;
        const maxRisk = Math.max(...risks);
        const minRisk = Math.min(...risks);

        // 计算趋势
        const recentCount = Math.min(10, risks.length);
        const recentRisks = risks.slice(-recentCount);
        const firstHalf = recentRisks.slice(0, Math.floor(recentCount / 2));
        const secondHalf = recentRisks.slice(Math.floor(recentCount / 2));

        const firstAvg = firstHalf.reduce((sum, risk) => sum + risk, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, risk) => sum + risk, 0) / secondHalf.length;

        let recentTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
        if (secondAvg > firstAvg + 5) {
            recentTrend = 'increasing';
        } else if (secondAvg < firstAvg - 5) {
            recentTrend = 'decreasing';
        }

        return {
            averageRisk,
            maxRisk,
            minRisk,
            recentTrend
        };
    }

    /**
     * 🔍 获取观察期状态（用于调试和监控）
     */
    getObservationPeriods(): Map<string, {
        startTime: number;
        initialPosition: number;
        initialProfitPercentage: number;
        strategyId: string;
    }> {
        return new Map(this.observationPeriods);
    }
} 