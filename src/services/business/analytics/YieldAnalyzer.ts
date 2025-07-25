import { injectable, inject } from 'tsyringe';
import { ILoggerService, TYPES } from '../../../types/interfaces';
import { YieldStatistics, DualYieldRates } from '../../../types/analytics-types';
import { UnifiedMarketData, UnifiedDataProvider } from './UnifiedDataProvider';
import { AccumulatedYieldManager } from './AccumulatedYieldManager';

/**
 * 纯计算器通用接口
 * 
 * 定义了分析服务的标准契约：
 * - 接收统一的市场数据
 * - 返回特定类型的分析结果
 * - 支持异步计算
 * 
 * @template T 分析结果类型
 */
export interface IPureCalculator<T> {
    /**
     * 执行分析计算
     * @param data 统一市场数据输入
     * @returns 分析结果
     */
    calculate(data: UnifiedMarketData): Promise<T>;
}

/**
 * 收益预测结果
 */
export interface YieldProjection {
    hourlyRate: number;
    dailyRate: number;
    timeframe: number;
    confidence: number;
    basedOnSamples: number;
}

/**
 * 收益分析服务
 * 
 * 核心职责：
 * - 收益统计计算和分析
 * - 收益预测和趋势判断
 * - 真实盈亏分析
 * - 收益数据聚合和展示
 * 
 * 设计原则：
 * - 纯分析逻辑：只负责计算和统计，不涉及数据获取
 * - 依赖注入：通过UnifiedDataProvider获取双重收益率等基础指标
 * - 分层计算：复杂指标由数据层计算，分析层专注业务逻辑
 * 
 * 架构定位：
 * 业务分析层，消费统一数据服务的输出，提供上层业务所需的分析结果
 */
@injectable()
export class YieldAnalyzer implements IPureCalculator<YieldStatistics> {
    constructor(
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.UnifiedDataProvider) private dataProvider: UnifiedDataProvider,
        private accumulatedYieldManager: AccumulatedYieldManager
    ) { }

    /**
     * 收益统计主计算方法
     * 
     * 功能：
     * - 聚合基础收益数据
     * - 调用数据层获取双重收益率
     * - 计算收益预测和趋势
     * - 生成完整的收益分析报告
     * 
     * @param data 统一市场数据
     * @returns 完整的收益统计分析结果
     */
    async calculate(data: UnifiedMarketData): Promise<YieldStatistics> {
        try {
            // 🔥 计算真实总收益（当前待提取 + 历史累积提取）
            const realYieldCalculation = this.accumulatedYieldManager.calculateRealTotalYield(
                data.poolAddress,
                data.positions.map(p => p.address),
                data.currentPendingYield
            );

            const yieldProjection = this.projectYieldRate(data.yieldHistory, 5); // 基于5分钟窗口预测
            const realPnL = this.calculateRealPnL(data, realYieldCalculation.realTotalYield); // 使用真实总收益计算盈亏

            // 计算双重收益率
            const dualYieldRates = this.dataProvider.calculateDualYieldRates(data);

            const result: YieldStatistics & {
                yieldGrowthRate: number;
                yieldTrend: 'increasing' | 'decreasing' | 'stable';
                realPnL: any;
                realTotalYield: string;
                extractionCount: number;
            } = {
                totalExtractedYield: realYieldCalculation.totalExtractedYield, // 使用累积提取记录
                currentPendingYield: realYieldCalculation.currentPendingYield,
                realTotalYield: realYieldCalculation.realTotalYield, // 🔥 新增：真实总收益
                extractionCount: realYieldCalculation.extractionCount, // 🔥 新增：提取次数
                totalYieldCount: data.yieldHistory.length,
                avgYieldPerPeriod: this.calculateAverageYieldPerPeriod(data.yieldHistory),
                lastExtractionTime: this.getLastExtractionTime(data),
                nextProjectedExtraction: this.calculateNextProjectedExtraction(data, yieldProjection),
                yieldProjection,
                recentYields: data.yieldHistory.slice(-10), // 最近10条记录
                dualYieldRates, // 新增：双重收益率
                yieldGrowthRate: yieldProjection.hourlyRate, // 添加收益增长率
                yieldTrend: this.determineYieldTrend(yieldProjection), // 添加收益趋势
                realPnL // 添加真实盈亏
            };

            return result;
        } catch (error) {
            await this.loggerService.logSystem('ERROR',
                `收益统计计算失败: ${error instanceof Error ? error.message : '未知错误'}`
            );
            throw error;
        }
    }

    /**
     * 预测收益率 - 从YieldCalculator迁移的纯计算逻辑
     */
    private projectYieldRate(yieldHistory: any[], timeframe: number): YieldProjection {
        const cutoffTime = Date.now() - (timeframe * 60 * 1000);
        const recentYields = yieldHistory.filter(y => y.timestamp >= cutoffTime);

        // 即使数据不足也要提供基础收益率计算
        if (recentYields.length < 2) {
            // 如果有至少一条记录，基于当前收益计算简单预测
            if (recentYields.length === 1) {
                const currentYield = parseFloat(recentYields[0].totalYieldInY);
                const timeElapsed = (Date.now() - recentYields[0].timestamp) / (60 * 1000); // 分钟

                // 添加合理性检查，避免异常高收益率
                if (timeElapsed > 0 && currentYield > 0 && timeElapsed >= 1) {
                    const yieldPerMinute = currentYield / timeElapsed;
                    let hourlyRate = yieldPerMinute * 60;
                    let dailyRate = hourlyRate * 24;

                    // 添加收益率上限检查（年化不超过1000%）
                    const maxHourlyRate = 10 / 365 / 24; // 约0.00114每小时 (年化10%)
                    const maxDailyRate = 10 / 365; // 约0.0274每天 (年化10%)

                    if (Math.abs(hourlyRate) > maxHourlyRate) {
                        hourlyRate = hourlyRate > 0 ? maxHourlyRate : -maxHourlyRate;
                        dailyRate = hourlyRate * 24;
                    }

                    return {
                        hourlyRate: hourlyRate * 100, // 转换为百分比
                        dailyRate: dailyRate * 100,   // 转换为百分比
                        timeframe,
                        confidence: 0.2, // 低置信度
                        basedOnSamples: 1
                    };
                }
            }

            return {
                hourlyRate: 0,
                dailyRate: 0,
                timeframe,
                confidence: 0,
                basedOnSamples: recentYields.length
            };
        }

        // 计算时间窗口内的收益增长
        const oldestYield = recentYields[0];
        const newestYield = recentYields[recentYields.length - 1];

        const yieldGrowth = parseFloat(newestYield.totalYieldInY) - parseFloat(oldestYield.totalYieldInY);
        const timeSpanMinutes = (newestYield.timestamp - oldestYield.timestamp) / (60 * 1000);

        if (timeSpanMinutes <= 0 || timeSpanMinutes < 1) {
            // 时间跨度太短时，返回保守估计
            return {
                hourlyRate: 0,
                dailyRate: 0,
                timeframe,
                confidence: 0,
                basedOnSamples: recentYields.length
            };
        }

        // 计算每分钟收益率
        const yieldPerMinute = yieldGrowth / timeSpanMinutes;
        let hourlyRate = yieldPerMinute * 60;
        let dailyRate = hourlyRate * 24;

        // 添加收益率合理性检查
        const maxHourlyRate = 10 / 365 / 24; // 年化10%的小时收益率
        const maxDailyRate = 10 / 365;       // 年化10%的日收益率

        if (Math.abs(hourlyRate) > maxHourlyRate) {
            hourlyRate = hourlyRate > 0 ? maxHourlyRate : -maxHourlyRate;
            dailyRate = hourlyRate * 24;
        }

        // 改进置信度计算，确保合理的置信度值
        const sampleConfidence = Math.min(recentYields.length / 10, 1.0) * 0.6; // 样本数量影响
        const timeConfidence = Math.min(timeSpanMinutes / timeframe, 1.0) * 0.4; // 时间跨度影响
        const confidence = sampleConfidence + timeConfidence;

        return {
            hourlyRate: hourlyRate * 100, // 转换为百分比
            dailyRate: dailyRate * 100,   // 转换为百分比
            timeframe,
            confidence,
            basedOnSamples: recentYields.length
        };
    }

    /**
     * 计算平均每期收益
     */
    private calculateAverageYieldPerPeriod(yieldHistory: any[]): number {
        if (yieldHistory.length === 0) {
            return 0;
        }

        const totalYield = yieldHistory.reduce((sum, yield_) => {
            return sum + parseFloat(yield_.totalYieldInY);
        }, 0);

        return totalYield / yieldHistory.length;
    }

    /**
     * 获取最后提取时间 - 简化处理
     */
    private getLastExtractionTime(data: UnifiedMarketData): number {
        // 简化处理，返回0表示无提取记录
        return 0;
    }

    /**
     * 计算预计下次提取时间
     */
    private calculateNextProjectedExtraction(data: UnifiedMarketData, projection: YieldProjection): number {
        const extractionThreshold = 10; // 默认阈值，可配置

        if (extractionThreshold <= 0) {
            return 0;
        }

        const currentYield = parseFloat(data.currentPendingYield);
        const remainingNeeded = extractionThreshold - currentYield;

        if (remainingNeeded <= 0) {
            return Date.now(); // 已经可以提取
        }

        // 基于预测收益率计算
        if (projection.hourlyRate <= 0) {
            return 0;
        }

        const hoursNeeded = remainingNeeded / (projection.hourlyRate / 100);
        return Date.now() + (hoursNeeded * 60 * 60 * 1000);
    }

    /**
     * 计算真实盈亏 - 纯计算逻辑
     */
    private calculateRealPnL(data: UnifiedMarketData, realTotalYield?: string): any {
        // 🔥 使用真实总收益（如果提供）
        const totalYieldValue = realTotalYield ? parseFloat(realTotalYield) :
            (parseFloat(data.totalExtractedYield) + parseFloat(data.currentPendingYield));

        const positionValue = parseFloat(data.totalPositionValue);
        const initialValue = parseFloat(data.initialInvestment);

        // 计算真实盈亏：真实总收益 + 头寸当前价值 - 初始投入
        const realPnLAmount = totalYieldValue + positionValue - initialValue;
        const realPnLPercentage = initialValue > 0 ? (realPnLAmount / initialValue) * 100 : 0;

        return {
            realTotalYield: totalYieldValue.toString(),
            currentPositionValue: positionValue.toString(),
            initialInvestment: initialValue.toString(),
            realPnLAmount: realPnLAmount.toString(),
            realPnLPercentage,
            timestamp: Date.now(),
            breakdown: {
                totalYieldValue,
                positionValue,
                initialValue,
                positionValueChange: positionValue - initialValue,
                totalReturn: realPnLAmount
            }
        };
    }

    /**
     * 确定收益趋势
     */
    private determineYieldTrend(projection: YieldProjection): 'increasing' | 'decreasing' | 'stable' {
        const rate = projection.hourlyRate;

        if (Math.abs(rate) < 0.1) { // 小于0.1%认为是稳定
            return 'stable';
        } else if (rate > 0) {
            return 'increasing';
        } else {
            return 'decreasing';
        }
    }
} 