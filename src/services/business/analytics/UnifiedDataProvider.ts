import { injectable, inject } from 'tsyringe';
import axios from 'axios';
import { ILoggerService, IPositionFeeHarvester, IMeteoraService, IPositionManager, TYPES } from '../../../types/interfaces';
import { MarketData, BenchmarkYieldRates } from '../../modules/SmartStopLossModule';
import { TokenPrecisionConverter } from '../../../utils/TokenPrecisionConverter';
import { AccumulatedYieldManager } from './AccumulatedYieldManager';

/**
 * 统一数据获取参数
 */
export interface DataFetchParams {
    poolAddress: string;
    positionAddresses: string[];
    initialInvestment: string;
    // 🔧 新增：可选的代币精度信息（来自策略实例缓存）
    tokenPrecision?: {
        tokenXDecimals: number;
        tokenYDecimals: number;
        tokenXMint: string;
        tokenYMint: string;
    };
}

/**
 * 头寸信息
 */
export interface PositionInfo {
    address: string;
    poolAddress: string;
    currentTokenX: string;
    currentTokenY: string;
    currentValueInY: string;
    feeX: string;
    feeY: string;
}

/**
 * 价格点数据
 */
export interface PricePoint {
    timestamp: number;
    price: number;
    volume?: number;
}

/**
 * 收益记录
 */
export interface YieldRecord {
    timestamp: number;
    tokenXAmount: string;
    tokenYAmount: string;
    totalYieldInY: string;
    yieldUsdValue: number;
    currentPrice: number;
}

/**
 * 时间段收益记录（用于手续费收益率计算）
 */
export interface TimeframeYieldRecord {
    timestamp: number;
    timeframe: number; // 时间窗口长度（分钟）
    yieldAmount: string; // 该时间段内的收益数量
    yieldRate: number; // 该时间段的收益率 (%)
    annualizedRate: number; // 年化收益率 (%)
}

/**
 * 两种收益率计算结果
 */
export interface DualYieldRates {
    // 1. 真实盈亏百分比（总体投资表现）
    totalReturnRate: number; // 真实盈亏百分比 (%)

    // 2. 手续费收益效率（日化收益率）
    feeYieldEfficiency: {
        last5Minutes: number; // 过去5分钟日化收益率 (% × 12 × 24)
        last15Minutes: number; // 过去15分钟日化收益率 (% × 4 × 24)
        lastHour: number; // 过去1小时日化收益率 (% × 24)
    };

    // 历史收益快照（仅存储1小时内）
    recentYieldSnapshots: TimeframeYieldRecord[];
}

/**
 * 🆕 基准收益率快照（缓存用）
 */
export interface BenchmarkSnapshot {
    timestamp: number;        // 时间戳
    benchmarkRate: number;    // 基准收益率
    binOffset: number;        // bin偏移数量
    baseYieldRate: number;    // 基础5分钟收益率
}

/**
 * 统一市场数据结构
 */
export interface UnifiedMarketData {
    // 价格数据
    currentPrice: number;
    priceHistory: PricePoint[];
    priceVolatility: number;
    priceDropPercentage: number; // 短期价格变化（相邻两次调用）
    priceTrendAnalysis: {
        last5Minutes: number;    // 过去5分钟价格变化百分比
        last15Minutes: number;   // 过去15分钟价格变化百分比
        lastHour: number;        // 过去1小时价格变化百分比
    };

    // 头寸数据
    positions: PositionInfo[];
    totalPositionValue: string;

    // 收益数据
    totalExtractedYield: string;
    currentPendingYield: string;
    yieldHistory: YieldRecord[];

    // 🔧 新增：bin数据（避免重复RPC调用）
    activeBin: number;

    // 元数据
    timestamp: number;
    poolAddress: string;
    initialInvestment: string;
}

/**
 * 统一市场数据服务接口
 * 
 * 职责范围：
 * 1. 市场数据获取和缓存管理
 * 2. 基础市场指标计算（价格、收益率等）
 * 3. 数据格式转换和标准化
 * 4. 轮询周期管理
 */
export interface IUnifiedDataProvider {
    // 核心数据获取
    fetchAllMarketData(params: DataFetchParams): Promise<UnifiedMarketData>;
    getCachedData(): UnifiedMarketData | null;
    invalidateCache(): void;

    // 数据转换服务
    transformToSmartStopLossData(
        data: UnifiedMarketData,
        binData?: {
            activeBin: number;
            positionLowerBin: number;
            positionUpperBin: number;
        }
    ): MarketData;

    // 轮询周期管理
    startNewPollingCycle(intervalMs?: number): void;
    getCurrentPollingInfo(): { cycle: number; interval: number; hasCachedData: boolean };

    // 市场指标计算服务
    calculateDualYieldRates(data: UnifiedMarketData): DualYieldRates;
    getDualYieldRates(): DualYieldRates | null;
    calculatePriceTrendAnalysis(): { last5Minutes: number; last15Minutes: number; lastHour: number };

    // 🆕 基准收益率计算服务
    calculateBenchmarkYieldRates(
        currentActiveBin: number,
        positionLowerBin: number,
        positionUpperBin: number,
        fiveMinuteYieldRate: number
    ): BenchmarkYieldRates | null;

    // 🆕 清除基准收益率数据（用于头寸重建后重新开始记录）
    clearBenchmarkYieldRates(): void;
}

/**
 * 统一市场数据服务实现
 * 
 * 核心职责：
 * - 整合多源市场数据（价格、头寸、收益等）
 * - 提供基础市场指标计算（收益率、双重收益率等）
 * - 管理数据缓存和轮询周期
 * - 为上层分析服务提供标准化数据
 * 
 * 设计原则：
 * - 数据就近计算：基础指标在数据获取时同步计算，避免跨层传递
 * - 原子性操作：确保数据一致性
 * - 缓存优先：减少重复API调用，提升性能
 * 
 * 架构定位：
 * 作为数据层与业务层的桥梁，承担数据整合和基础计算职责
 */
@injectable()
export class UnifiedDataProvider implements IUnifiedDataProvider {
    private dataCache: UnifiedMarketData | null = null;
    private currentPollingCycle: number = 0; // 当前轮询周期ID
    private cachePollingCycle: number = -1;  // 缓存所属的轮询周期ID
    private pollingInterval: number = 30000; // 轮询间隔（毫秒），默认30秒，由前端动态设置

    // 历史数据存储配置
    private readonly MAX_HISTORY_RECORDS = 150; // 统一历史记录数量限制（约2.5小时@1分钟间隔）

    // 历史数据存储
    private priceHistory: PricePoint[] = [];
    private yieldHistory: YieldRecord[] = [];
    private totalExtractedYield: string = '0';

    // 新增：收益快照（保留75分钟确保60分钟历史数据可用）
    private yieldSnapshots: { timestamp: number; totalYield: string }[] = [];
    private readonly SNAPSHOT_RETENTION_MS = 75 * 60 * 1000; // 75分钟（确保60分钟历史数据可用）

    // 新增：价格快照（保留75分钟确保60分钟历史数据可用）
    private priceSnapshots: { timestamp: number; price: number }[] = [];

    // 🆕 新增：基准收益率快照缓存（保留75分钟确保60分钟历史数据可用）
    private benchmarkSnapshots: BenchmarkSnapshot[] = [];
    private readonly BENCHMARK_RETENTION_MS = 75 * 60 * 1000; // 75分钟

    // 🆕 基准收益率状态跟踪
    private isActiveBinInRange: boolean = true; // 活跃bin是否在头寸范围内
    private lastRangeCheckTime: number = 0; // 上次范围检查时间

    // 服务启动时间
    private serviceStartTime: number = Date.now();

    // 价格异常检测相关
    private readonly PRICE_ANOMALY_THRESHOLD = 100; // 100%变化阈值
    private lastValidPrice: number = 0;

    constructor(
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.PositionFeeHarvester) private feeHarvester: IPositionFeeHarvester,
        @inject(TYPES.MeteoraService) private meteoraService: IMeteoraService,
        @inject(TYPES.PositionManager) private positionManager: IPositionManager,
        private accumulatedYieldManager: AccumulatedYieldManager
    ) { }

    /**
     * 统一市场数据获取入口
     * 
     * 功能：
     * - 优先返回缓存数据（轮询周期内有效）
     * - 整合多源数据：价格、头寸、收益历史
     * - 计算基础指标：收益率、波动率等
     * - 更新历史数据和缓存
     * 
     * @param params 数据获取参数
     * @returns 统一格式的市场数据
     */
    async fetchAllMarketData(params: DataFetchParams): Promise<UnifiedMarketData> {
        // 🚀 优先检查缓存
        const cachedData = this.getCachedData();
        if (cachedData) {
            return cachedData;
        }

        const startTime = Date.now();

        try {
            // 1. 获取当前价格和activeBin
            const { price, activeBin } = await this.fetchCurrentPriceAndBin(params.poolAddress);

            // 2. 并行获取所有头寸数据
            const positions = await this.fetchAllPositionsData(params.positionAddresses, price, params.tokenPrecision);

            // 3. 计算衍生数据
            const totalPositionValue = this.calculateTotalPositionValue(positions);
            const currentPendingYield = this.calculateCurrentPendingYield(positions, price, params.tokenPrecision);
            const priceVolatility = this.calculatePriceVolatility();
            const priceDropPercentage = this.calculatePriceDropPercentage();

            // 4. 更新历史数据
            this.updatePriceHistory(price);
            this.updateYieldHistory(positions, price, params.tokenPrecision);

            // 5. 计算多时间段价格趋势分析
            const priceTrendAnalysis = this.calculatePriceTrendAnalysis();

            const marketData: UnifiedMarketData = {
                currentPrice: price,
                priceHistory: [...this.priceHistory],
                priceVolatility,
                priceDropPercentage,
                priceTrendAnalysis,
                positions,
                totalPositionValue,
                totalExtractedYield: await this.getTotalExtractedFromAccumulated(params.poolAddress, params.positionAddresses),
                currentPendingYield,
                yieldHistory: [...this.yieldHistory],
                activeBin,
                timestamp: Date.now(),
                poolAddress: params.poolAddress,
                initialInvestment: params.initialInvestment
            };

            // 6. 计算双重收益率并打印收益率历史变化
            try {
                this.calculateDualYieldRates(marketData);
            } catch (dualYieldError) {
                await this.loggerService.logSystem('WARN',
                    `双重收益率计算失败: ${dualYieldError instanceof Error ? dualYieldError.message : '未知错误'}`
                );
            }

            // 7. 更新缓存
            this.updateCache(marketData);

            const duration = Date.now() - startTime;
            // 合并打印数据获取完成信息
            await this.loggerService.logSystem('DEBUG',
                `🔄 数据更新完成: 池${params.poolAddress.substring(0, 8)}..., 头寸${positions.length}个, 价格${price.toFixed(8)}, 收益${currentPendingYield}, 耗时${duration}ms`
            );

            return marketData;

        } catch (error) {
            await this.loggerService.logSystem('ERROR',
                `统一数据获取失败: ${error instanceof Error ? error.message : '未知错误'}`
            );
            throw error;
        }
    }

    /**
     * 获取缓存数据
     */
    getCachedData(): UnifiedMarketData | null {
        if (this.isCacheValid()) {
            return this.dataCache;
        }
        return null;
    }

    /**
     * 使缓存失效
     */
    invalidateCache(): void {
        this.dataCache = null;
        this.cachePollingCycle = -1;
    }

    /**
     * 轮询周期管理：开始新周期
     * 
     * 功能：
     * - 递增轮询周期ID
     * - 清空当前缓存（强制重新获取数据）
     * - 更新轮询间隔设置
     * 
     * 使用场景：前端每次开始新的监控周期时调用
     * 
     * @param intervalMs 可选的轮询间隔（毫秒）
     */
    startNewPollingCycle(intervalMs?: number): void {
        this.currentPollingCycle++;
        if (intervalMs && intervalMs > 0) {
            this.pollingInterval = intervalMs;
        }
        // 清除上一轮询周期的缓存
        this.invalidateCache();

        // 静默开始新轮询周期（避免频繁打印）
    }

    /**
     * 轮询周期状态查询
     * 
     * @returns 当前轮询周期的详细信息
     * - cycle: 当前周期ID
     * - interval: 轮询间隔（毫秒）
     * - hasCachedData: 是否有当前周期的缓存数据
     */
    getCurrentPollingInfo(): { cycle: number; interval: number; hasCachedData: boolean } {
        return {
            cycle: this.currentPollingCycle,
            interval: this.pollingInterval,
            hasCachedData: this.dataCache !== null && this.cachePollingCycle === this.currentPollingCycle
        };
    }

    /**
     * 价格异常检测和修复
     */
    private validateAndFixPrice(currentPrice: number): number {
        // 如果是第一个价格，直接接受
        if (this.lastValidPrice === 0) {
            this.lastValidPrice = currentPrice;
            return currentPrice;
        }

        // 计算价格变化百分比
        const changePercent = Math.abs((currentPrice - this.lastValidPrice) / this.lastValidPrice) * 100;

        // 如果变化超过阈值，认为是异常数据
        if (changePercent > this.PRICE_ANOMALY_THRESHOLD) {
            // 合并打印价格异常检测信息
            this.loggerService.logSystem('WARN',
                `🚨 价格异常: ${this.lastValidPrice}→${currentPrice} (变化${changePercent.toFixed(1)}%), 使用上次价格`
            );
            return this.lastValidPrice; // 返回上次有效价格
        }

        // 价格正常，更新最后有效价格
        this.lastValidPrice = currentPrice;
        return currentPrice;
    }

    /**
     * 转换为智能止损模块所需的数据格式 - 简化版本
     */
    transformToSmartStopLossData(
        data: UnifiedMarketData,
        binData?: {
            activeBin: number;
            positionLowerBin: number;
            positionUpperBin: number;
            benchmarkYieldRates?: BenchmarkYieldRates;
        }
    ): MarketData {
        const holdingDuration = this.calculateHoldingDuration();
        const yieldGrowthRate = this.calculateYieldGrowthRate(data.yieldHistory);
        const yieldTrend = this.determineYieldTrend(data.yieldHistory);
        const netPnL = parseFloat(data.totalExtractedYield) + parseFloat(data.currentPendingYield) + parseFloat(data.totalPositionValue) - parseFloat(data.initialInvestment);
        const netPnLPercentage = (netPnL / parseFloat(data.initialInvestment)) * 100;

        // 🔥 计算历史价格变化和历史收益率数据
        const historicalPriceChanges = this.calculatePriceTrendAnalysis();
        const dualYieldRates = this.calculateDualYieldRates(data);

        return {
            // 价格相关
            currentPrice: data.currentPrice,
            priceHistory: data.priceHistory,
            priceVolatility: data.priceVolatility,
            priceDropPercentage: data.priceDropPercentage,

            // 🔥 新增：历史价格变化数据
            historicalPriceChanges: {
                last5Minutes: historicalPriceChanges.last5Minutes,
                last15Minutes: historicalPriceChanges.last15Minutes,
                lastHour: historicalPriceChanges.lastHour
            },

            // 收益相关
            totalReturn: netPnL,
            yieldRate: yieldGrowthRate,
            yieldTrend,
            yieldGrowthRate,

            // 🔥 新增：历史收益率数据
            historicalYieldRates: {
                totalReturnRate: dualYieldRates.totalReturnRate,
                feeYieldEfficiency: dualYieldRates.feeYieldEfficiency,
                recentSnapshots: dualYieldRates.recentYieldSnapshots
            },

            // 🔥 新增：手续费数据（已转换为Y代币价值）
            currentPendingYield: data.currentPendingYield,  // 未提取手续费
            totalExtractedYield: data.totalExtractedYield,  // 已提取手续费

            // 头寸相关
            positionValue: parseFloat(data.totalPositionValue),
            initialInvestment: parseFloat(data.initialInvestment),
            netPnL,
            netPnLPercentage,

            // 流动性相关 - 简化为核心bin数据
            activeBin: binData?.activeBin || 0,
            positionLowerBin: binData?.positionLowerBin || 0,
            positionUpperBin: binData?.positionUpperBin || 0,

            // 时间相关
            holdingDuration,
            lastUpdateTime: data.timestamp,

            // 🆕 条件性添加：基准收益率数据
            ...(binData?.benchmarkYieldRates && { benchmarkYieldRates: binData.benchmarkYieldRates })
        };
    }

    /**
     * 获取当前价格和activeBin - 优化版本，一次获取两个数据
     */
    private async fetchCurrentPriceAndBin(poolAddress: string): Promise<{ price: number; activeBin: number }> {
        try {
            // 检查MeteoraService是否可用
            if (!this.meteoraService) {
                throw new Error('MeteoraService未初始化');
            }

            // 直接使用MeteoraService获取价格和bin信息
            if (!this.meteoraService.getPoolPriceAndBin) {
                throw new Error('MeteoraService不支持getPoolPriceAndBin方法');
            }

            const priceAndBin = await this.meteoraService.getPoolPriceAndBin(poolAddress);

            if (!priceAndBin || typeof priceAndBin.activePrice !== 'number' || typeof priceAndBin.activeBin !== 'number') {
                throw new Error('无效的价格或bin数据格式');
            }

            // 价格异常检测和修复
            const validatedPrice = this.validateAndFixPrice(priceAndBin.activePrice);

            return {
                price: validatedPrice,
                activeBin: priceAndBin.activeBin
            };

        } catch (error) {
            await this.loggerService.logSystem('ERROR',
                `获取价格和bin失败: ${error instanceof Error ? error.message : '未知错误'}`
            );

            // 返回默认值，但记录警告
            await this.loggerService.logSystem('WARN', '使用默认价格1.0和activeBin=0继续执行');
            return {
                price: 1.0,
                activeBin: 0
            };
        }
    }

    /**
     * 获取所有头寸数据 - 使用子服务中的方法
     */
    private async fetchAllPositionsData(
        positionAddresses: string[],
        currentPrice: number,
        tokenPrecision?: { tokenXDecimals: number; tokenYDecimals: number }
    ): Promise<PositionInfo[]> {
        const positions: PositionInfo[] = [];

        // 并行获取所有头寸数据
        const positionPromises = positionAddresses.map(async (address) => {
            try {
                // 使用PositionManager获取头寸基本信息
                const positionResult = await this.positionManager.getPositionOnChainInfo(address);
                if (!positionResult.success || !positionResult.data) {
                    throw new Error(`获取头寸信息失败: ${positionResult.error}`);
                }

                // 使用PositionFeeHarvester获取收益信息
                const feeInfo = await this.feeHarvester.getPositionFeesFromChain(address);

                // 计算头寸总价值（转换为Y代币价值）
                const tokenXAmount = parseFloat(positionResult.data.totalXAmount || '0');
                const tokenYAmount = parseFloat(positionResult.data.totalYAmount || '0');

                // 🔧 优先使用传入的代币精度，否则使用默认值
                const tokenXDecimals = tokenPrecision?.tokenXDecimals || 6;
                const tokenYDecimals = tokenPrecision?.tokenYDecimals || 9;

                // 使用正确的代币精度转换为人类可读格式
                const tokenXFormatted = TokenPrecisionConverter.rawToFormatted(tokenXAmount.toString(), tokenXDecimals);
                const tokenYFormatted = TokenPrecisionConverter.rawToFormatted(tokenYAmount.toString(), tokenYDecimals);

                // 计算总价值（以Y代币为单位）
                const tokenXValueInY = parseFloat(tokenXFormatted) * currentPrice;
                const totalValueInY = tokenXValueInY + parseFloat(tokenYFormatted);

                const position: PositionInfo = {
                    address,
                    poolAddress: positionResult.data.poolAddress,
                    currentTokenX: tokenXFormatted,
                    currentTokenY: tokenYFormatted,
                    currentValueInY: totalValueInY.toString(),
                    feeX: feeInfo?.feeX || '0',
                    feeY: feeInfo?.feeY || '0'
                };

                return position;
            } catch (error) {
                await this.loggerService.logSystem('ERROR',
                    `获取头寸 ${address} 数据失败: ${error instanceof Error ? error.message : '未知错误'}`
                );

                // 返回默认值避免中断
                return {
                    address,
                    poolAddress: '',
                    currentTokenX: '0',
                    currentTokenY: '0',
                    currentValueInY: '0',
                    feeX: '0',
                    feeY: '0'
                };
            }
        });

        const results = await Promise.all(positionPromises);
        positions.push(...results);

        return positions;
    }

    /**
     * 计算总头寸价值
     */
    private calculateTotalPositionValue(positions: PositionInfo[]): string {
        const total = positions.reduce((sum, pos) => {
            return sum + parseFloat(pos.currentValueInY);
        }, 0);
        return total.toString();
    }

    /**
     * 计算当前待提取收益 - 使用YieldCalculator中的计算方法
     */
    private calculateCurrentPendingYield(
        positions: PositionInfo[],
        currentPrice: number,
        tokenPrecision?: { tokenXDecimals: number; tokenYDecimals: number }
    ): string {
        let totalFeeX = '0';
        let totalFeeY = '0';

        // 累加所有头寸的收益
        positions.forEach(pos => {
            totalFeeX = this.addBigNumbers(totalFeeX, pos.feeX);
            totalFeeY = this.addBigNumbers(totalFeeY, pos.feeY);
        });

        // 🔧 使用传入的代币精度或默认值
        const tokenXDecimals = tokenPrecision?.tokenXDecimals || 6;
        const tokenYDecimals = tokenPrecision?.tokenYDecimals || 9;

        // 使用正确的代币精度转换收益数据
        const feeXFormatted = parseFloat(TokenPrecisionConverter.rawToFormatted(totalFeeX, tokenXDecimals));
        const feeYFormatted = parseFloat(TokenPrecisionConverter.rawToFormatted(totalFeeY, tokenYDecimals));

        // 计算X代币收益的Y代币价值
        const feeXInY = feeXFormatted * currentPrice;

        // 计算总收益（Y代币价值）
        const totalYieldInY = feeXInY + feeYFormatted;

        return totalYieldInY.toString();
    }

    /**
     * 计算价格波动性
     */
    private calculatePriceVolatility(): number {
        if (this.priceHistory.length < 2) return 0;

        const prices = this.priceHistory.slice(-10).map(p => p.price);
        const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
        const stdDev = Math.sqrt(variance);

        return (stdDev / mean) * 100; // 百分比形式
    }

    /**
     * 计算价格变化百分比（短期变化，相邻两次调用）
     */
    private calculatePriceDropPercentage(): number {
        if (this.priceHistory.length < 2) return 0;

        const latest = this.priceHistory[this.priceHistory.length - 1];
        const previous = this.priceHistory[this.priceHistory.length - 2];

        return ((latest.price - previous.price) / previous.price) * 100;
    }

    /**
     * 更新价格历史
     */
    private updatePriceHistory(currentPrice: number): void {
        const now = Date.now();

        // 更新价格历史（用于波动率计算）
        this.priceHistory.push({
            timestamp: now,
            price: currentPrice
        });

        // 保留最近150个价格点（与收益历史保持一致）
        if (this.priceHistory.length > this.MAX_HISTORY_RECORDS) {
            this.priceHistory = this.priceHistory.slice(-this.MAX_HISTORY_RECORDS);
        }

        // 更新价格快照（用于时间段价格变化分析）
        this.updatePriceSnapshots(currentPrice);
    }

    /**
     * 更新收益历史 - 使用YieldCalculator中的计算方法
     */
    private updateYieldHistory(
        positions: PositionInfo[],
        currentPrice: number,
        tokenPrecision?: { tokenXDecimals: number; tokenYDecimals: number }
    ): void {
        let totalFeeX = '0';
        let totalFeeY = '0';

        // 累加所有头寸的收益
        positions.forEach(pos => {
            totalFeeX = this.addBigNumbers(totalFeeX, pos.feeX);
            totalFeeY = this.addBigNumbers(totalFeeY, pos.feeY);
        });

        // 🔧 使用传入的代币精度或默认值
        const tokenXDecimals = tokenPrecision?.tokenXDecimals || 6;
        const tokenYDecimals = tokenPrecision?.tokenYDecimals || 9;

        // 使用正确的代币精度转换收益数据
        const feeXFormatted = parseFloat(TokenPrecisionConverter.rawToFormatted(totalFeeX, tokenXDecimals));
        const feeYFormatted = parseFloat(TokenPrecisionConverter.rawToFormatted(totalFeeY, tokenYDecimals));

        // 计算X代币收益的Y代币价值
        const feeXInY = feeXFormatted * currentPrice;
        const totalYieldInY = feeXInY + feeYFormatted;

        this.yieldHistory.push({
            timestamp: Date.now(),
            tokenXAmount: totalFeeX,
            tokenYAmount: totalFeeY,
            totalYieldInY: totalYieldInY.toString(),
            yieldUsdValue: 0, // 简化处理
            currentPrice
        });

        // 保留最近150个收益记录（与价格历史保持一致）
        if (this.yieldHistory.length > this.MAX_HISTORY_RECORDS) {
            this.yieldHistory = this.yieldHistory.slice(-this.MAX_HISTORY_RECORDS);
        }
    }

    /**
     * 计算持有时长（小时）
     */
    private calculateHoldingDuration(): number {
        if (this.priceHistory.length === 0) return 0;

        const firstRecord = this.priceHistory[0];
        return (Date.now() - firstRecord.timestamp) / (1000 * 60 * 60);
    }

    /**
     * 计算收益增长率
     */
    private calculateYieldGrowthRate(yieldHistory: YieldRecord[]): number {
        if (yieldHistory.length < 2) return 0;

        const recent = yieldHistory.slice(-5); // 最近5个记录
        if (recent.length < 2) return 0;

        const oldestYield = parseFloat(recent[0].totalYieldInY);
        const newestYield = parseFloat(recent[recent.length - 1].totalYieldInY);

        if (oldestYield === 0) return 0;

        return ((newestYield - oldestYield) / oldestYield) * 100;
    }

    /**
     * 判断收益趋势
     */
    private determineYieldTrend(yieldHistory: YieldRecord[]): 'increasing' | 'decreasing' | 'stable' {
        const growthRate = this.calculateYieldGrowthRate(yieldHistory);

        if (growthRate > 1) return 'increasing';
        if (growthRate < -1) return 'decreasing';
        return 'stable';
    }

    /**
     * 更新缓存
     */
    private updateCache(data: UnifiedMarketData): void {
        this.dataCache = data;
        this.cachePollingCycle = this.currentPollingCycle;
        // 静默更新缓存（避免频繁打印）
    }

    /**
     * 检查缓存是否有效
     * 只有当前轮询周期的缓存才有效
     */
    private isCacheValid(): boolean {
        if (!this.dataCache) return false;
        return this.cachePollingCycle === this.currentPollingCycle;
    }

    /**
     * 设置累计提取收益（由外部调用）
     */
    setTotalExtractedYield(amount: string): void {
        this.totalExtractedYield = amount;
    }

    /**
     * 大数字加法 - 从YieldCalculator迁移
     */
    private addBigNumbers(a: string, b: string): string {
        return (parseFloat(a) + parseFloat(b)).toString();
    }

    /**
     * 更新收益快照（每次调用时记录）
     */
    private updateYieldSnapshots(currentTotalYield: string): void {
        const now = Date.now();

        // 添加新快照
        this.yieldSnapshots.push({
            timestamp: now,
            totalYield: currentTotalYield
        });

        // 清理超过1小时的快照
        this.yieldSnapshots = this.yieldSnapshots.filter(
            snapshot => now - snapshot.timestamp <= this.SNAPSHOT_RETENTION_MS
        );
    }

    /**
     * 更新价格快照（每次调用时记录）
     */
    private updatePriceSnapshots(currentPrice: number): void {
        const now = Date.now();

        // 添加新快照
        this.priceSnapshots.push({
            timestamp: now,
            price: currentPrice
        });

        // 清理超过1小时的快照
        this.priceSnapshots = this.priceSnapshots.filter(
            snapshot => now - snapshot.timestamp <= this.SNAPSHOT_RETENTION_MS
        );
    }

    /**
     * 双重收益率计算核心方法
     * 
     * 计算两种不同维度的收益率：
     * 1. 真实盈亏百分比：总体投资表现，包含头寸价值变化
     * 2. 手续费收益效率：纯手续费收益的时间效率，转换为日化收益率
     * 
     * 数据就近计算原则：
     * - 基础指标在数据获取层计算，避免跨层传递复杂计算逻辑
     * - 利用收益快照历史数据，提供多时间维度分析
     * 
     * @param marketData 统一市场数据
     * @returns 双重收益率计算结果
     */
    calculateDualYieldRates(marketData: UnifiedMarketData): DualYieldRates {
        // 更新收益快照
        const currentTotalYield = this.addBigNumbers(
            marketData.totalExtractedYield,
            marketData.currentPendingYield
        );
        this.updateYieldSnapshots(currentTotalYield);

        // 1. 计算真实盈亏百分比
        const currentPositionValue = parseFloat(marketData.totalPositionValue);
        const extractedYield = parseFloat(marketData.totalExtractedYield);
        const pendingYield = parseFloat(marketData.currentPendingYield);
        const initialInvestment = parseFloat(marketData.initialInvestment);

        // 真实盈亏 = 当前头寸价值 + 累计提取收益 + 待提取收益 - 初始投入
        const totalCurrentValue = currentPositionValue + extractedYield + pendingYield;
        const totalReturnRate = ((totalCurrentValue - initialInvestment) / initialInvestment) * 100;

        // 2. 计算手续费收益效率（日化）
        const feeYieldEfficiency = {
            last5Minutes: this.calculateFeeYieldRate(5, 12 * 24), // 5分钟 × 288 = 日化
            last15Minutes: this.calculateFeeYieldRate(15, 4 * 24), // 15分钟 × 96 = 日化
            lastHour: this.calculateFeeYieldRate(60, 24) // 1小时 × 24 = 日化
        };

        // 获取收益变化数据用于合并日志
        const yield5Min = this.getYieldInTimeframe(5);
        const yield15Min = this.getYieldInTimeframe(15);
        const yield1Hour = this.getYieldInTimeframe(60);

        // 合并打印收益变化和收益率信息
        this.loggerService.logSystem('DEBUG',
            `💰 收益变化: 5分钟=${yield5Min.toFixed(8)} (日化${feeYieldEfficiency.last5Minutes.toFixed(4)}%), 15分钟=${yield15Min.toFixed(8)} (日化${feeYieldEfficiency.last15Minutes.toFixed(4)}%), 1小时=${yield1Hour.toFixed(8)} (日化${feeYieldEfficiency.lastHour.toFixed(4)}%)`
        );

        // 3. 生成历史快照记录
        const now = Date.now();
        const recentYieldSnapshots: TimeframeYieldRecord[] = [
            {
                timestamp: now,
                timeframe: 5,
                yieldAmount: this.getYieldInTimeframe(5).toString(),
                yieldRate: feeYieldEfficiency.last5Minutes / (12 * 24), // 原始5分钟收益率
                annualizedRate: feeYieldEfficiency.last5Minutes
            },
            {
                timestamp: now,
                timeframe: 15,
                yieldAmount: this.getYieldInTimeframe(15).toString(),
                yieldRate: feeYieldEfficiency.last15Minutes / (4 * 24), // 原始15分钟收益率
                annualizedRate: feeYieldEfficiency.last15Minutes
            },
            {
                timestamp: now,
                timeframe: 60,
                yieldAmount: this.getYieldInTimeframe(60).toString(),
                yieldRate: feeYieldEfficiency.lastHour / 24, // 原始1小时收益率
                annualizedRate: feeYieldEfficiency.lastHour
            }
        ];

        return {
            totalReturnRate,
            feeYieldEfficiency,
            recentYieldSnapshots
        };
    }

    /**
     * 手续费收益率计算（日化转换）
     * 
     * 计算逻辑：
     * 1. 获取指定时间段内的收益增长
     * 2. 计算该时间段的收益率
     * 3. 通过倍数转换为日化收益率
     * 
     * @param timeframeMinutes 时间段长度（分钟）
     * @param dailyMultiplier 日化倍数（如5分钟=288倍，15分钟=96倍，1小时=24倍）
     * @returns 日化收益率（百分比）
     */
    private calculateFeeYieldRate(timeframeMinutes: number, dailyMultiplier: number): number {
        const yieldInTimeframe = this.getYieldInTimeframe(timeframeMinutes);
        const initialInvestment = parseFloat(this.dataCache?.initialInvestment || '0');

        if (initialInvestment === 0) return 0;

        // 时间段收益率
        const periodRate = (yieldInTimeframe / initialInvestment) * 100;

        // 日化收益率
        return periodRate * dailyMultiplier;
    }

    /**
     * 时间段收益增长计算
     * 
     * 通过收益快照历史数据，计算指定时间段内的收益增长量
     * 
     * 计算逻辑：
     * 1. 寻找时间段开始时最接近的快照（或更早的快照）
     * 2. 如果没有足够历史数据，返回0（避免错误计算）
     * 3. 计算从开始时间到现在的收益增长
     * 
     * @param timeframeMinutes 时间段长度（分钟）
     * @returns 该时间段内的收益增长量
     */
    private getYieldInTimeframe(timeframeMinutes: number): number {
        if (this.yieldSnapshots.length === 0) return 0;

        const now = Date.now();
        const timeframeMs = timeframeMinutes * 60 * 1000;
        const cutoffTime = now - timeframeMs;

        // 找到时间段开始时或更早的快照（按时间排序）
        const sortedSnapshots = this.yieldSnapshots.sort((a, b) => a.timestamp - b.timestamp);

        // 寻找最接近cutoffTime的快照（可以是更早的）
        let startSnapshot = null;
        for (const snapshot of sortedSnapshots) {
            if (snapshot.timestamp <= cutoffTime) {
                startSnapshot = snapshot; // 更新为更接近cutoffTime的快照
            } else {
                break; // 已经超过cutoffTime，停止搜索
            }
        }

        // 如果没有找到时间段开始前的快照，说明运行时间不够
        if (!startSnapshot) {
            return 0;
        }

        // 计算收益增长
        const currentYield = parseFloat(sortedSnapshots[sortedSnapshots.length - 1].totalYield);
        const startYield = parseFloat(startSnapshot.totalYield);
        const yieldGrowth = Math.max(0, currentYield - startYield);

        return yieldGrowth;
    }

    /**
     * 获取指定时间段内的价格变化百分比
     * 
     * 计算逻辑：
     * 1. 寻找时间段开始时最接近的价格快照
     * 2. 计算从开始时间到现在的价格变化百分比
     * 3. 如果没有足够历史数据，返回0
     * 
     * @param timeframeMinutes 时间段长度（分钟）
     * @returns 该时间段内的价格变化百分比
     */
    private getPriceChangeInTimeframe(timeframeMinutes: number): number {
        if (this.priceSnapshots.length === 0) return 0;

        const now = Date.now();
        const timeframeMs = timeframeMinutes * 60 * 1000;
        const cutoffTime = now - timeframeMs;

        // 找到时间段开始时或更早的快照（按时间排序）
        const sortedSnapshots = this.priceSnapshots.sort((a, b) => a.timestamp - b.timestamp);

        // 寻找最接近cutoffTime的快照（可以是更早的）
        let startSnapshot = null;
        for (const snapshot of sortedSnapshots) {
            if (snapshot.timestamp <= cutoffTime) {
                startSnapshot = snapshot; // 更新为更接近cutoffTime的快照
            } else {
                break; // 已经超过cutoffTime，停止搜索
            }
        }

        // 如果没有找到时间段开始前的快照，说明运行时间不够
        if (!startSnapshot) {
            return 0;
        }

        // 计算价格变化百分比
        const currentPrice = sortedSnapshots[sortedSnapshots.length - 1].price;
        const startPrice = startSnapshot.price;

        if (startPrice === 0) return 0;

        const priceChangePercent = ((currentPrice - startPrice) / startPrice) * 100;

        return priceChangePercent;
    }

    /**
     * 计算多时间段价格趋势分析
     * 
     * @returns 多时间段价格变化数据
     */
    calculatePriceTrendAnalysis(): {
        last5Minutes: number;
        last15Minutes: number;
        lastHour: number;
    } {
        const last5Minutes = this.getPriceChangeInTimeframe(5);
        const last15Minutes = this.getPriceChangeInTimeframe(15);
        const lastHour = this.getPriceChangeInTimeframe(60);

        // 合并打印价格变化信息
        this.loggerService.logSystem('DEBUG',
            `📊 价格变化: 5分钟=${last5Minutes.toFixed(4)}%, 15分钟=${last15Minutes.toFixed(4)}%, 1小时=${lastHour.toFixed(4)}%`
        );

        return {
            last5Minutes,
            last15Minutes,
            lastHour
        };
    }

    /**
     * 获取双重收益率数据（外部调用）
     */
    getDualYieldRates(): DualYieldRates | null {
        if (!this.dataCache) return null;
        return this.calculateDualYieldRates(this.dataCache);
    }

    /**
     * 从累积收益管理器获取总提取收益
     */
    private async getTotalExtractedFromAccumulated(poolAddress: string, positionAddresses: string[]): Promise<string> {
        try {
            const realYieldCalc = this.accumulatedYieldManager.calculateRealTotalYield(poolAddress, positionAddresses, '0');
            return realYieldCalc.totalExtractedYield;
        } catch (error) {
            await this.loggerService.logSystem('WARN',
                `获取累积提取收益失败，使用默认值0: ${error instanceof Error ? error.message : '未知错误'}`
            );
            return '0';
        }
    }

    /**
 * 🆕 计算基准收益率
 * @param currentActiveBin 当前活跃bin
 * @param positionLowerBin 连锁头寸下边界bin
 * @param positionUpperBin 连锁头寸上边界bin
 * @param fiveMinuteYieldRate 5分钟收益率
 * @returns 基准收益率数据
 */
    calculateBenchmarkYieldRates(
        currentActiveBin: number,
        positionLowerBin: number,
        positionUpperBin: number,
        fiveMinuteYieldRate: number
    ): BenchmarkYieldRates | null {
        const currentTime = Date.now();
        const isCurrentlyInRange = currentActiveBin >= positionLowerBin && currentActiveBin <= positionUpperBin;

        // 检查活跃bin是否在连锁头寸范围内
        if (!isCurrentlyInRange) {
            // 活跃bin超出范围 - 清除缓存并返回null
            if (this.isActiveBinInRange) {
                // 从范围内变为超出范围 - 清除所有缓存
                this.benchmarkSnapshots = [];
                this.loggerService.logSystem('WARN',
                    `🆕 基准收益率停止: 活跃bin ${currentActiveBin} 超出连锁头寸范围 (${positionLowerBin} - ${positionUpperBin})，已清除所有缓存`
                );
            }

            this.isActiveBinInRange = false;
            this.lastRangeCheckTime = currentTime;
            return null; // 活跃bin不在范围内，返回null
        }

        // 活跃bin在范围内
        if (!this.isActiveBinInRange) {
            // 从超出范围恢复到范围内 - 重置服务开始时间
            this.serviceStartTime = currentTime;
            this.isActiveBinInRange = true;
            this.lastRangeCheckTime = currentTime;

            this.loggerService.logSystem('INFO',
                `🆕 基准收益率恢复: 活跃bin ${currentActiveBin} 重新进入连锁头寸范围 (${positionLowerBin} - ${positionUpperBin})，重新开始记录`
            );
        }

        // 时间控制：启动后5分钟才开始计算
        const elapsed = currentTime - this.serviceStartTime;
        if (elapsed < 5 * 60 * 1000) {
            this.loggerService.logSystem('DEBUG',
                `🆕 基准收益率未就绪: 启动${Math.floor(elapsed / 1000)}秒，需要${5 * 60}秒`
            );
            return null; // 未达到5分钟，返回null
        }

        // 更新状态
        this.isActiveBinInRange = true;
        this.lastRangeCheckTime = currentTime;

        // 计算bin偏移数量
        const binOffset = Math.abs(positionUpperBin - currentActiveBin);

        // 特殊情况：bin偏移为0时，基准收益率为0
        if (binOffset === 0) {
            this.loggerService.logSystem('DEBUG',
                `🆕 基准收益率: bin偏移为0，返回零值`
            );
            return {
                current5MinuteBenchmark: 0,
                average5MinuteBenchmark: 0,
                average15MinuteBenchmark: 0,
                average30MinuteBenchmark: 0,
                binOffset: 0,
                lastCalculationTime: Date.now()
            };
        }

        // 计算当前5分钟基准收益率（将日化收益率转换为小数形式）
        const current5MinuteBenchmark = (fiveMinuteYieldRate / 100) / binOffset;

        // 缓存当前基准收益率
        this.benchmarkSnapshots.push({
            timestamp: currentTime,
            benchmarkRate: current5MinuteBenchmark,
            binOffset: binOffset,
            baseYieldRate: fiveMinuteYieldRate / 100  // 存储为小数形式
        });

        // 清理过期快照
        this.cleanupBenchmarkSnapshots();

        // 计算平均基准收益率 - 带时间控制（时间不满足时返回null）
        const average5MinuteBenchmark = elapsed >= 10 * 60 * 1000 ? this.calculateAverageBenchmark(5) : null;
        const average15MinuteBenchmark = elapsed >= 20 * 60 * 1000 ? this.calculateAverageBenchmark(15) : null;
        const average30MinuteBenchmark = elapsed >= 35 * 60 * 1000 ? this.calculateAverageBenchmark(30) : null;

        this.loggerService.logSystem('DEBUG',
            `🆕 基准收益率计算: 5分钟收益率=${(fiveMinuteYieldRate).toFixed(4)}%, bin偏移=${binOffset}, 基准收益率=${(current5MinuteBenchmark * 100).toFixed(4)}%, 平均(5分钟=${average5MinuteBenchmark ? (average5MinuteBenchmark * 100).toFixed(4) + '%' : '未就绪'}, 15分钟=${average15MinuteBenchmark ? (average15MinuteBenchmark * 100).toFixed(4) + '%' : '未就绪'}, 30分钟=${average30MinuteBenchmark ? (average30MinuteBenchmark * 100).toFixed(4) + '%' : '未就绪'})`
        );

        return {
            current5MinuteBenchmark,
            average5MinuteBenchmark,
            average15MinuteBenchmark,
            average30MinuteBenchmark,
            binOffset,
            lastCalculationTime: currentTime
        };
    }

    /**
     * 🆕 计算指定时间范围内的平均基准收益率
     * @param timeframeMinutes 时间范围（分钟）
     * @returns 平均基准收益率
     */
    private calculateAverageBenchmark(timeframeMinutes: number): number {
        const cutoffTime = Date.now() - (timeframeMinutes * 60 * 1000);
        const relevantSnapshots = this.benchmarkSnapshots.filter(
            snapshot => snapshot.timestamp >= cutoffTime
        );

        if (relevantSnapshots.length === 0) {
            return 0;
        }

        const sum = relevantSnapshots.reduce((acc, snapshot) => acc + snapshot.benchmarkRate, 0);
        return sum / relevantSnapshots.length;
    }

    /**
     * 🆕 清理过期的基准收益率快照
     */
    private cleanupBenchmarkSnapshots(): void {
        const cutoffTime = Date.now() - this.BENCHMARK_RETENTION_MS;
        this.benchmarkSnapshots = this.benchmarkSnapshots.filter(
            snapshot => snapshot.timestamp >= cutoffTime
        );
    }

    /**
     * 🆕 清除基准收益率数据（用于头寸重建后重新开始记录）
     */
    clearBenchmarkYieldRates(): void {
        this.benchmarkSnapshots = [];
        this.serviceStartTime = Date.now();
        this.isActiveBinInRange = true;
        this.lastRangeCheckTime = Date.now();

        this.loggerService.logSystem('INFO',
            `🆕 基准收益率数据已清除: 头寸重建完成，重新开始记录基准收益率数据`
        );
    }
} 