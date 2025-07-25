/**
 * 🔄 连锁头寸数据适配器
 * 数据桥接组件，负责将各种服务的数据转换为智能止损模块需要的标准格式
 * 
 * 核心功能：
 * - 价格数据获取和转换
 * - 收益数据计算和格式化
 * - 流动性数据分析
 * - 数据标准化处理
 */

import { MarketData, PricePoint } from './SmartStopLossModule';
import { IPositionAnalyticsService } from '../../types/analytics-types';
import { IDLMMMonitorService } from '../../types/interfaces';

/**
 * 连锁头寸数据适配器配置
 */
export interface ChainPositionDataConfig {
    poolAddress: string;
    positionAddresses: string[];
    initialInvestmentAmount: number;
    dataHistoryWindow: number; // 历史数据窗口（分钟）
    priceUpdateInterval: number; // 价格更新间隔（秒）
}

/**
 * 数据收集状态
 */
interface DataCollectionState {
    isCollecting: boolean;
    lastCollectionTime: number;
    collectionCount: number;
    errorCount: number;
    priceHistory: PricePoint[];
    startTime: number;
}

/**
 * 连锁头寸数据适配器
 */
export class ChainPositionDataAdapter {
    private config: ChainPositionDataConfig;
    private state: DataCollectionState;

    constructor(
        poolAddress: string,
        private analyticsService: IPositionAnalyticsService,
        private dlmmMonitor: IDLMMMonitorService,
        private initialInvestment: number = 0,
        private positionAddresses: string[] = []
    ) {
        this.config = {
            poolAddress,
            positionAddresses,
            initialInvestmentAmount: initialInvestment,
            dataHistoryWindow: 60, // 默认1小时历史数据
            priceUpdateInterval: 30 // 默认30秒更新间隔
        };

        this.state = {
            isCollecting: false,
            lastCollectionTime: 0,
            collectionCount: 0,
            errorCount: 0,
            priceHistory: [],
            startTime: Date.now()
        };
    }

    /**
     * 🔄 收集完整的市场数据
     */
    async collectMarketData(): Promise<MarketData> {
        try {
            this.state.isCollecting = true;
            this.state.collectionCount++;

            // 并行收集各种数据
            const [
                priceData,
                yieldData,
                pnlData,
                liquidityData,
                positionData
            ] = await Promise.all([
                this.collectPriceData(),
                this.collectYieldData(),
                this.collectPnLData(),
                this.collectLiquidityData(),
                this.collectPositionData()
            ]);

            // 计算时间相关数据
            const timeData = this.calculateTimeData();

            // 组装标准化市场数据
            const marketData: MarketData = {
                // 价格相关
                currentPrice: priceData.currentPrice,
                priceHistory: priceData.priceHistory,
                priceVolatility: priceData.volatility,
                priceDropPercentage: priceData.dropPercentage,

                // 收益相关
                totalReturn: yieldData.totalReturn,
                yieldRate: yieldData.yieldRate,
                yieldTrend: yieldData.trend,
                yieldGrowthRate: yieldData.growthRate,

                // 🔥 新增：手续费数据（已转换为Y代币价值）
                currentPendingYield: '0',  // TODO: 从实际数据源获取未提取手续费
                totalExtractedYield: '0',  // TODO: 从实际数据源获取已提取手续费

                // 头寸相关
                positionValue: positionData.currentValue,
                initialInvestment: this.config.initialInvestmentAmount,
                netPnL: pnlData.netPnL,
                netPnLPercentage: pnlData.netPnLPercentage,

                // 流动性相关 - 使用bin数据（TODO: 需要从连锁头寸获取真实数据）
                activeBin: 0,           // TODO: 从实际数据源获取
                positionLowerBin: 0,    // TODO: 从连锁头寸计算
                positionUpperBin: 0,    // TODO: 从连锁头寸计算

                // 时间相关
                holdingDuration: timeData.holdingDuration,
                lastUpdateTime: Date.now()
            };

            this.state.lastCollectionTime = Date.now();
            this.state.isCollecting = false;

            return marketData;

        } catch (error) {
            this.state.errorCount++;
            this.state.isCollecting = false;
            throw new Error(`数据收集失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 📈 收集价格数据
     */
    private async collectPriceData(): Promise<{
        currentPrice: number;
        priceHistory: PricePoint[];
        volatility: number;
        dropPercentage: number;
    }> {
        // 获取当前价格
        const currentPrice = await this.analyticsService.getCurrentPrice();

        // 更新价格历史
        this.updatePriceHistory(currentPrice);

        // 计算波动性
        const volatility = this.calculateVolatility(this.state.priceHistory);

        // 计算价格下跌百分比
        const dropPercentage = this.calculatePriceDropPercentage(this.state.priceHistory);

        return {
            currentPrice,
            priceHistory: [...this.state.priceHistory],
            volatility,
            dropPercentage
        };
    }

    /**
 * 💰 收集收益数据
 */
    private async collectYieldData(): Promise<{
        totalReturn: number;
        yieldRate: number;
        trend: 'increasing' | 'decreasing' | 'stable';
        growthRate: number;
    }> {
        const yieldStats = await this.analyticsService.getYieldStatistics();

        return {
            totalReturn: parseFloat(yieldStats.totalExtractedYield),
            yieldRate: yieldStats.yieldProjection?.hourlyRate || 0,
            trend: 'stable', // 简化处理，实际需要根据趋势分析
            growthRate: yieldStats.yieldProjection?.dailyRate || 0
        };
    }

    /**
 * 📊 收集盈亏数据
 */
    private async collectPnLData(): Promise<{
        netPnL: number;
        netPnLPercentage: number;
    }> {
        const pnlReport = await this.analyticsService.getRealPnLReport();

        return {
            netPnL: parseFloat(pnlReport.realPnLAmount),
            netPnLPercentage: pnlReport.realPnLPercentage
        };
    }

    /**
     * 💧 收集流动性数据
     */
    private async collectLiquidityData(): Promise<{
        inRangePercentage: number;
        healthScore: number;
        activeBinDistance: number;
    }> {
        try {
            // 获取活跃bin
            const activeBin = await this.dlmmMonitor.getActiveBin(this.config.poolAddress);

            // 获取头寸信息（假设我们有头寸地址）
            let inRangePercentage = 100;
            let activeBinDistance = 0;

            if (this.config.positionAddresses.length > 0) {
                // 这里需要根据实际的头寸管理器接口来获取头寸范围
                // 暂时使用模拟数据
                const positionRange = await this.getPositionRange();
                if (positionRange) {
                    const [lowerBin, upperBin] = positionRange;
                    inRangePercentage = activeBin >= lowerBin && activeBin <= upperBin ? 100 : 0;
                    activeBinDistance = activeBin < lowerBin ? lowerBin - activeBin :
                        activeBin > upperBin ? activeBin - upperBin : 0;
                }
            }

            // 计算流动性健康分数
            const healthScore = this.calculateLiquidityHealthScore(inRangePercentage, activeBinDistance);

            return {
                inRangePercentage,
                healthScore,
                activeBinDistance
            };
        } catch (error) {
            // 返回默认值
            return {
                inRangePercentage: 50,
                healthScore: 50,
                activeBinDistance: 0
            };
        }
    }

    /**
     * 🏢 收集头寸数据
     */
    private async collectPositionData(): Promise<{
        currentValue: number;
    }> {
        try {
            const pnlReport = await this.analyticsService.getRealPnLReport();
            return {
                currentValue: parseFloat(pnlReport.currentPositionValue)
            };
        } catch (error) {
            return {
                currentValue: this.config.initialInvestmentAmount
            };
        }
    }

    /**
     * ⏰ 计算时间数据
     */
    private calculateTimeData(): {
        holdingDuration: number;
    } {
        const holdingDurationMs = Date.now() - this.state.startTime;
        const holdingDuration = holdingDurationMs / (1000 * 60 * 60); // 转换为小时

        return {
            holdingDuration
        };
    }

    /**
     * 📈 更新价格历史
     */
    private updatePriceHistory(currentPrice: number): void {
        const now = Date.now();

        // 添加新的价格点
        this.state.priceHistory.push({
            timestamp: now,
            price: currentPrice
        });

        // 清理过期的历史数据
        const cutoffTime = now - (this.config.dataHistoryWindow * 60 * 1000);
        this.state.priceHistory = this.state.priceHistory.filter(
            point => point.timestamp > cutoffTime
        );
    }

    /**
     * 📊 计算价格波动性
     */
    private calculateVolatility(priceHistory: PricePoint[]): number {
        if (priceHistory.length < 2) return 0;

        const prices = priceHistory.map(point => point.price);
        const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;

        const variance = prices.reduce((sum, price) => {
            const diff = price - mean;
            return sum + diff * diff;
        }, 0) / prices.length;

        const standardDeviation = Math.sqrt(variance);
        const volatility = (standardDeviation / mean) * 100;

        return Math.min(100, volatility);
    }

    /**
     * 📉 计算价格下跌百分比
     */
    private calculatePriceDropPercentage(priceHistory: PricePoint[]): number {
        if (priceHistory.length < 2) return 0;

        // 计算最近一段时间的最高价和当前价格
        const recentPrices = priceHistory.slice(-10); // 最近10个价格点
        const currentPrice = priceHistory[priceHistory.length - 1].price;
        const maxPrice = Math.max(...recentPrices.map(p => p.price));

        if (maxPrice === 0) return 0;

        const dropPercentage = ((maxPrice - currentPrice) / maxPrice) * 100;
        return Math.max(0, dropPercentage);
    }

    /**
     * 💧 计算流动性健康分数
     */
    private calculateLiquidityHealthScore(inRangePercentage: number, activeBinDistance: number): number {
        let healthScore = inRangePercentage;

        // 根据活跃bin距离调整健康分数
        if (activeBinDistance > 0) {
            const distancePenalty = Math.min(50, activeBinDistance * 5);
            healthScore -= distancePenalty;
        }

        return Math.max(0, Math.min(100, healthScore));
    }

    /**
     * 📍 获取头寸范围（模拟实现）
     */
    private async getPositionRange(): Promise<[number, number] | null> {
        // 这里需要根据实际的头寸管理器接口来实现
        // 暂时返回null，表示无法获取头寸范围
        return null;
    }

    /**
     * ⚙️ 更新配置
     */
    updateConfig(config: Partial<ChainPositionDataConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * 📖 获取当前配置
     */
    getConfig(): ChainPositionDataConfig {
        return { ...this.config };
    }

    /**
     * 📊 获取收集状态
     */
    getCollectionState(): DataCollectionState {
        return { ...this.state };
    }

    /**
     * 🔄 重置状态
     */
    resetState(): void {
        this.state = {
            isCollecting: false,
            lastCollectionTime: 0,
            collectionCount: 0,
            errorCount: 0,
            priceHistory: [],
            startTime: Date.now()
        };
    }

    /**
     * 🧹 清理资源
     */
    cleanup(): void {
        this.resetState();
    }

    /**
     * 📈 获取价格历史
     */
    getPriceHistory(): PricePoint[] {
        return [...this.state.priceHistory];
    }

    /**
     * 📊 获取数据收集统计
     */
    getCollectionStats(): {
        totalCollections: number;
        errorRate: number;
        avgCollectionTime: number;
        isCurrentlyCollecting: boolean;
    } {
        const errorRate = this.state.collectionCount > 0 ?
            (this.state.errorCount / this.state.collectionCount) * 100 : 0;

        return {
            totalCollections: this.state.collectionCount,
            errorRate,
            avgCollectionTime: 0, // 需要实际测量
            isCurrentlyCollecting: this.state.isCollecting
        };
    }
} 