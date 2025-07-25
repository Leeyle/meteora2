import { injectable, inject } from 'tsyringe';
import { ILoggerService, IConfigService, IStateService, IStrategyLogger, TYPES } from '../../types/interfaces';
import {
    IPositionAnalyticsService,
    AnalyticsConfig,
    PositionSetupParams,
    PriceTrendAnalysis,
    YieldStatistics,
    PositionLoss,
    RealPnL,
    AnalyticsReport,
    AnalyticsAlert,
    ConfigurationError,
    AnalyticsServiceError
} from '../../types/analytics-types';
import { MarketData } from '../modules/SmartStopLossModule';
import { UnifiedDataProvider, IUnifiedDataProvider, DataFetchParams, UnifiedMarketData } from './analytics/UnifiedDataProvider';
import { YieldAnalyzer, IPureCalculator } from './analytics/YieldAnalyzer';
import { YieldOperator, YieldExtractionContext } from './analytics/YieldOperator';
import { AccumulatedYieldManager } from './analytics/AccumulatedYieldManager';
import { IMeteoraService } from '../../types/interfaces';
import { IPositionManager } from '../../types/interfaces';

/**
 * 头寸分析服务 - 业务协调层
 * 
 * 架构设计：
 * - 数据层：UnifiedDataProvider（统一市场数据服务）
 * - 分析层：YieldAnalyzer（收益分析）、YieldOperator（收益操作）
 * - 协调层：PositionAnalyticsService（业务协调和对外接口）
 * 
 * 核心职责：
 * - 头寸监控生命周期管理
 * - 分析报告统一生成和输出
 * - 智能止损数据提供
 * - 服务健康检查和性能监控
 * 
 * 设计优势：
 * - 分层架构：数据、分析、协调职责清晰分离
 * - 统一数据流：减少API调用，提升性能
 * - 可扩展性：各层独立演进，便于功能扩展
 * - 可测试性：各组件可独立测试
 */
@injectable()
export class PositionAnalyticsService implements IPositionAnalyticsService {
    public readonly name = 'PositionAnalyticsService';
    public readonly version = '3.0.0';

    // 当前监控状态
    private isMonitoring: boolean = false;
    private monitoringStartTime: number = 0;
    private currentSetupParams: PositionSetupParams | null = null;
    private config: AnalyticsConfig;
    private alerts: AnalyticsAlert[] = [];

    // 策略日志器（可选，如果设置则使用策略级日志）
    private strategyLogger: IStrategyLogger | null = null;

    // 🆕 实例ID（用于实例级日志记录）
    private instanceId: string | null = null;

    // 🔒 收益提取状态管理（防止重复提取）
    private extractionStatus: 'IDLE' | 'EXTRACTING' = 'IDLE';
    private lastExtractionTime: number = 0;

    // 性能监控
    private requestCount: number = 0;
    private errorCount: number = 0;
    private totalResponseTime: number = 0;

    // 默认配置
    private readonly defaultConfig: AnalyticsConfig = {
        priceMonitorInterval: 30000,
        trendAnalysisTimeframes: [5, 15, 30, 60],
        priceDropThresholds: [
            { timeframe: 5, threshold: 5, enabled: true },
            { timeframe: 15, threshold: 10, enabled: true },
            { timeframe: 60, threshold: 20, enabled: true }
        ],
        yieldCalculationInterval: 60000,
        yieldExtractionThreshold: '10',
        yieldExtractionTimeLock: 1, // 🔒 修改默认收益提取时间锁为1分钟
        projectionTimeframe: 5,
        maxHistoryDays: 7,
        cleanupInterval: 3600000,
        maxRetries: 3,
        retryDelay: 1000,
        logLevel: 'INFO',
        logPerformance: true
    };

    constructor(
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.StateService) private stateService: IStateService,
        @inject(TYPES.UnifiedDataProvider) private dataProvider: UnifiedDataProvider,
        @inject(TYPES.YieldAnalyzer) private yieldAnalyzer: YieldAnalyzer,
        @inject(TYPES.YieldOperator) private yieldOperator: YieldOperator,
        @inject(TYPES.MeteoraService) private meteoraService: IMeteoraService,
        private accumulatedYieldManager: AccumulatedYieldManager,
        @inject(TYPES.PositionManager) private positionManager: IPositionManager
    ) {
        this.config = { ...this.defaultConfig };
    }

    /**
     * 🔧 设置策略日志器（用于多实例环境）
     */
    setStrategyLogger(strategyLogger: IStrategyLogger): void {
        this.strategyLogger = strategyLogger;
    }

    /**
     * 🆕 设置实例ID（用于实例级日志记录）
     */
    setInstanceId(instanceId: string): void {
        this.instanceId = instanceId;
    }

    /**
     * 🔒 设置收益提取状态（防止重复提取）
     */
    setExtractionStatus(status: 'IDLE' | 'EXTRACTING'): void {
        const oldStatus = this.extractionStatus;
        this.extractionStatus = status;

        if (status === 'EXTRACTING') {
            this.lastExtractionTime = Date.now();
        }

        if (oldStatus !== status) {
            this.logMessage('DEBUG',
                `🔒 收益提取状态变更: ${oldStatus} → ${status}`,
                { instanceId: this.instanceId, timestamp: Date.now() }
            );
        }
    }

    /**
     * 🔍 获取当前提取状态
     */
    getExtractionStatus(): { status: 'IDLE' | 'EXTRACTING'; lastExtractionTime: number } {
        return {
            status: this.extractionStatus,
            lastExtractionTime: this.lastExtractionTime
        };
    }

    /**
     * 🚫 检查是否应该跳过收益计算
     */
    private shouldSkipYieldCalculation(): boolean {
        return this.extractionStatus === 'EXTRACTING';
    }

    /**
     * 🔒 在收益提取期间返回简化报告（不包含收益计算）
     */
    private async getSimplifiedReportDuringExtraction(): Promise<AnalyticsReport> {
        if (!this.currentSetupParams) {
            throw new Error('未设置头寸监控参数');
        }

        const fetchParams: DataFetchParams = {
            poolAddress: this.currentSetupParams.poolAddress,
            positionAddresses: this.currentSetupParams.positionAddresses,
            initialInvestment: this.currentSetupParams.initialInvestmentAmount,
            ...(this.currentSetupParams.tokenPrecision && { tokenPrecision: this.currentSetupParams.tokenPrecision })
        };

        // 使用正常的数据获取方法
        const marketData = await this.dataProvider.fetchAllMarketData(fetchParams);

        // 使用正确的接口字段构建收益统计
        const yieldStatistics: YieldStatistics = {
            totalExtractedYield: marketData.totalExtractedYield || '0',
            currentPendingYield: '0', // 提取期间设为0，避免重复触发
            totalYieldCount: 0,
            avgYieldPerPeriod: 0,
            lastExtractionTime: this.lastExtractionTime,
            nextProjectedExtraction: 0,
            yieldProjection: {
                hourlyRate: 0,
                dailyRate: 0,
                timeframe: 60,
                confidence: 0,
                basedOnSamples: 0
            },
            recentYields: [],
            dualYieldRates: {
                totalReturnRate: 0,
                feeYieldEfficiency: {
                    last5Minutes: 0,
                    last15Minutes: 0,
                    lastHour: 0
                },
                recentYieldSnapshots: []
            }
        };

        // 构建简化报告
        const report: AnalyticsReport = {
            reportTimestamp: Date.now(),
            poolAddress: this.currentSetupParams.poolAddress,
            positionAddresses: this.currentSetupParams.positionAddresses,
            monitoringDuration: Date.now() - this.monitoringStartTime,

            // 价格数据（正常获取）
            currentPrice: marketData.currentPrice,
            priceHistory: marketData.priceHistory.map((p: any) => ({
                timestamp: p.timestamp,
                price: p.price,
                activeBinId: 0
            })),
            priceTrendAnalysis: this.buildPriceTrendAnalysis(marketData),

            // 收益数据（使用简化数据）
            yieldStatistics,

            // 头寸分析（正常获取）
            positionLossAnalysis: this.buildPositionLossAnalysis(marketData),

            // 盈亏报告（使用简化数据）
            realPnLReport: this.buildRealPnLReport(marketData, yieldStatistics),

            // 性能指标
            performanceMetrics: {
                totalApiCalls: this.requestCount,
                avgResponseTime: this.totalResponseTime / this.requestCount,
                errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
                cacheHitRate: 0,
                lastUpdate: Date.now()
            },

            // 警报状态（使用正确的类型）
            alerts: this.alerts.concat([{
                id: `extraction_${Date.now()}`,
                type: 'YIELD_READY',
                severity: 'LOW',
                message: '收益提取进行中，暂停收益计算',
                timestamp: Date.now(),
                acknowledged: false,
                data: {
                    extractionStatus: this.extractionStatus,
                    lastExtractionTime: this.lastExtractionTime
                }
            }])
        };

        await this.logMessage('DEBUG',
            `🔒 简化报告生成完成 - 价格: ${marketData.currentPrice}, 状态: ${this.extractionStatus}`
        );

        return report;
    }

    /**
     * 🔄 更新头寸地址列表（用于头寸重新创建后的同步）
     */
    async updatePositionAddresses(newPositionAddresses: string[]): Promise<void> {
        await this.logMessage('INFO',
            `开始更新头寸地址列表 - 新头寸数量: ${newPositionAddresses.length}`,
            {
                oldPositionCount: this.currentSetupParams?.positionAddresses.length || 0,
                newPositionCount: newPositionAddresses.length,
                newPositions: newPositionAddresses
            }
        );

        try {
            if (!this.currentSetupParams) {
                throw new Error('未找到当前监控配置，无法更新头寸地址');
            }

            // 保存旧的头寸地址用于日志
            const oldPositionAddresses = [...this.currentSetupParams.positionAddresses];

            // 更新头寸地址列表
            this.currentSetupParams.positionAddresses = newPositionAddresses;

            // 清除数据提供者的缓存，确保使用新头寸数据
            if (this.dataProvider && typeof this.dataProvider.invalidateCache === 'function') {
                this.dataProvider.invalidateCache();
                await this.logMessage('DEBUG', '已清除UnifiedDataProvider缓存');
            }

            // 重置累积收益管理器的头寸跟踪
            if (this.accumulatedYieldManager) {
                await this.accumulatedYieldManager.updatePositionAddresses(newPositionAddresses);
                await this.logMessage('DEBUG', '已更新AccumulatedYieldManager的头寸列表');
            }

            await this.logMessage('INFO',
                `头寸地址列表更新完成`,
                {
                    oldPositions: oldPositionAddresses,
                    newPositions: newPositionAddresses,
                    updateTime: new Date().toISOString()
                }
            );

        } catch (error) {
            await this.logMessage('ERROR',
                `更新头寸地址列表失败: ${error instanceof Error ? error.message : String(error)}`,
                {
                    newPositions: newPositionAddresses,
                    error: error instanceof Error ? error.stack : String(error)
                }
            );
            throw new AnalyticsServiceError('更新头寸地址', error instanceof Error ? error.message : '未知错误');
        }
    }

    /**
     * 🔧 统一日志记录方法
     */
    private async logMessage(level: 'INFO' | 'DEBUG' | 'ERROR', message: string, details?: any): Promise<void> {
        if (this.strategyLogger) {
            // 使用策略级日志
            if (level === 'ERROR') {
                await this.strategyLogger.logError(message, details);
            } else {
                await this.strategyLogger.logOperation(message, details);
            }
        } else {
            // 使用系统级日志
            await this.loggerService.logSystem(level, message);
        }
    }

    /**
     * 初始化服务
     */
    async initialize(config: AnalyticsConfig): Promise<void> {
        await this.logMessage('INFO', 'PositionAnalyticsService开始初始化...');

        try {
            this.config = { ...this.defaultConfig, ...config };
            this.validateConfig(this.config);

            // 🔥 初始化累积收益管理器
            await this.accumulatedYieldManager.initialize();

            // 🔒 注册状态回调到YieldOperator，防止重复提取
            this.yieldOperator.setStatusCallback((status: 'IDLE' | 'EXTRACTING') => {
                this.setExtractionStatus(status);
            });

            // 🆕 注册缓存清理回调到YieldOperator，收益提取完成后清除缓存
            this.yieldOperator.setCacheInvalidationCallback(() => {
                // 清除UnifiedDataProvider缓存，确保下次获取最新数据
                this.dataProvider.invalidateCache();
            });

            // 🔒 设置时间锁配置
            if (this.config.yieldExtractionTimeLock !== undefined && this.config.yieldExtractionTimeLock !== null) {
                this.yieldOperator.setExtractionTimeLock(this.config.yieldExtractionTimeLock);
                await this.logMessage('INFO', `🔒 收益提取时间锁已设置为 ${this.config.yieldExtractionTimeLock} 分钟`);
            }

            await this.logMessage('INFO',
                `PositionAnalyticsService初始化完成 v${this.version} - 新架构：统一数据层 + 纯计算层 + 业务操作层 + 累积收益追踪 + 防重复提取`
            );

        } catch (error) {
            throw new ConfigurationError('服务初始化', error instanceof Error ? error.message : '未知错误');
        }
    }

    /**
     * 启动服务
     */
    async start(): Promise<void> {
        await this.logMessage('INFO', 'PositionAnalyticsService已启动');
    }

    /**
     * 停止服务
     */
    async stop(): Promise<void> {
        if (this.isMonitoring) {
            await this.stopMonitoring();
        }
        await this.logMessage('INFO', 'PositionAnalyticsService已停止');
    }

    /**
     * 销毁服务
     */
    async destroy(): Promise<void> {
        await this.stop();
        this.alerts = [];
        this.requestCount = 0;
        this.errorCount = 0;
        this.totalResponseTime = 0;

        await this.logMessage('INFO', 'PositionAnalyticsService已销毁');
    }

    /**
     * 🎯 核心方法：设置头寸监控
     */
    async setupPositionMonitoring(params: PositionSetupParams): Promise<void> {
        await this.logMessage('INFO',
            `开始设置头寸监控 - 池子: ${params.poolAddress}, 头寸数量: ${params.positionAddresses.length}`,
            { poolAddress: params.poolAddress, positionCount: params.positionAddresses.length }
        );

        try {
            if (this.isMonitoring) {
                await this.stopMonitoring();
            }

            this.currentSetupParams = params;

            if (params.config) {
                this.config = { ...this.config, ...params.config };

                // 记录关键配置参数，确保阈值正确应用
                await this.logMessage('INFO', '📊 分析服务配置已更新', {
                    yieldExtractionThreshold: this.config.yieldExtractionThreshold,
                    yieldCalculationInterval: this.config.yieldCalculationInterval,
                    priceMonitorInterval: this.config.priceMonitorInterval
                });
            }

            this.validateSetupParams(params);

            this.isMonitoring = true;
            this.monitoringStartTime = Date.now();

            await this.logMessage('INFO',
                `头寸监控设置完成 - 使用统一数据提供者，减少API调用冗余`,
                { setupDuration: Date.now() - this.monitoringStartTime }
            );

        } catch (error) {
            throw new AnalyticsServiceError('设置头寸监控', error instanceof Error ? error.message : '未知错误');
        }
    }

    /**
     * 停止监控
     */
    async stopMonitoring(): Promise<void> {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        this.currentSetupParams = null;

        const monitoringDuration = Date.now() - this.monitoringStartTime;
        await this.logMessage('INFO',
            `头寸监控已停止 - 运行时长: ${Math.round(monitoringDuration / 1000)}秒`,
            { duration: monitoringDuration, durationSeconds: Math.round(monitoringDuration / 1000) }
        );
    }

    /**
     * 完整分析报告生成（核心业务方法）
     * 
     * 执行流程：
     * 1. 统一数据获取：单次API调用获取所有必需数据
     * 2. 并行分析计算：价格趋势、收益统计、头寸损失等
     * 3. 真实盈亏计算：整合所有收益和损失数据
     * 4. 报告聚合输出：生成完整的分析报告
     * 
     * 性能优化：
     * - 数据缓存：轮询周期内复用数据
     * - 并行计算：分析任务并发执行
     * - 智能缓存：基于轮询周期的缓存策略
     * 
     * @returns 完整的头寸分析报告
     */
    async getCompleteAnalyticsReport(): Promise<AnalyticsReport> {
        const startTime = Date.now();
        this.requestCount++;

        try {
            if (!this.currentSetupParams) {
                throw new Error('未设置头寸监控参数');
            }

            // 🔒 检查收益提取状态 - 如果正在提取中，返回简化报告
            if (this.shouldSkipYieldCalculation()) {
                await this.logMessage('DEBUG',
                    '🔒 收益提取进行中，跳过收益计算，返回简化监控报告',
                    {
                        extractionStatus: this.extractionStatus,
                        lastExtractionTime: this.lastExtractionTime,
                        instanceId: this.instanceId
                    }
                );

                return await this.getSimplifiedReportDuringExtraction();
            }

            // 使用监控日志记录分析报告获取
            if (this.strategyLogger) {
                await this.strategyLogger.logMonitoring('开始获取完整分析报告 - 使用统一数据流', {
                    poolAddress: this.currentSetupParams.poolAddress,
                    positionCount: this.currentSetupParams.positionAddresses.length
                });
            } else {
                await this.loggerService.logSystem('DEBUG', '开始获取完整分析报告 - 使用统一数据流');
            }

            // 🎯 第一步：统一数据获取（单次API调用）
            const fetchParams: DataFetchParams = {
                poolAddress: this.currentSetupParams.poolAddress,
                positionAddresses: this.currentSetupParams.positionAddresses,
                initialInvestment: this.currentSetupParams.initialInvestmentAmount,
                ...(this.currentSetupParams.tokenPrecision && { tokenPrecision: this.currentSetupParams.tokenPrecision })
            };

            const marketData = await this.dataProvider.fetchAllMarketData(fetchParams);

            // 🎯 第二步：纯计算分析（无API调用）
            const yieldStatistics = await this.yieldAnalyzer.calculate(marketData);

            // 🎯 第三步：智能止损数据转换 - 获取正确的bin数据
            const smartStopLossData = await this.getSmartStopLossData('内部分析报告生成');

            // 🎯 第四步：检查是否需要收益提取
            let yieldExtraction = null;

            // 使用监控日志记录收益提取条件检查
            if (this.strategyLogger) {
                await this.strategyLogger.logMonitoring('🔍 收益提取条件检查', {
                    currentPendingYield: yieldStatistics.currentPendingYield,
                    yieldExtractionThreshold: this.config.yieldExtractionThreshold,
                    canExtract: parseFloat(yieldStatistics.currentPendingYield) >= parseFloat(this.config.yieldExtractionThreshold),
                    activeBin: marketData.activeBin,
                    positionLowerBin: smartStopLossData.positionLowerBin,
                    positionUpperBin: smartStopLossData.positionUpperBin
                });
            } else {
                await this.loggerService.logSystem('DEBUG', '🔍 收益提取条件检查');
            }

            if (parseFloat(yieldStatistics.currentPendingYield) >= parseFloat(this.config.yieldExtractionThreshold)) {
                const extractionContext: YieldExtractionContext = {
                    positionAddresses: this.currentSetupParams.positionAddresses,
                    threshold: this.config.yieldExtractionThreshold,
                    currentYieldStats: yieldStatistics,
                    poolAddress: this.currentSetupParams.poolAddress,
                    // 🆕 传递实例ID（如果存在）
                    ...(this.instanceId && { instanceId: this.instanceId }),
                    // 🔧 传递缓存的代币精度信息到收益提取操作（如果可用）
                    ...(this.currentSetupParams.tokenPrecision && { tokenPrecision: this.currentSetupParams.tokenPrecision }),
                    // 🆕 传递活跃bin和头寸范围数据
                    activeBin: marketData.activeBin,
                    positionLowerBin: smartStopLossData.positionLowerBin,
                    positionUpperBin: smartStopLossData.positionUpperBin
                };

                const operationResult = await this.yieldOperator.executeOperation(extractionContext);
                if (operationResult.success) {
                    yieldExtraction = operationResult.data;
                    // 更新累计提取收益
                    this.dataProvider.setTotalExtractedYield(
                        this.addBigNumbers(marketData.totalExtractedYield, yieldExtraction.extractedAmount)
                    );
                }
            }

            // 🎯 第五步：构建完整报告
            const report: AnalyticsReport = {
                reportTimestamp: Date.now(),
                poolAddress: this.currentSetupParams.poolAddress,
                positionAddresses: this.currentSetupParams.positionAddresses,
                monitoringDuration: Date.now() - this.monitoringStartTime,

                // 价格数据（来自统一数据源）
                currentPrice: marketData.currentPrice,
                priceHistory: marketData.priceHistory.map(p => ({
                    timestamp: p.timestamp,
                    price: p.price,
                    activeBinId: 0 // 简化处理，设置默认值
                })),
                priceTrendAnalysis: this.buildPriceTrendAnalysis(marketData),

                // 收益数据（来自纯计算分析器）
                yieldStatistics,

                // 头寸分析（简化处理）
                positionLossAnalysis: this.buildPositionLossAnalysis(marketData),

                // 盈亏报告（简化处理）
                realPnLReport: this.buildRealPnLReport(marketData, yieldStatistics),

                // 性能指标
                performanceMetrics: {
                    totalApiCalls: this.requestCount,
                    avgResponseTime: this.totalResponseTime / this.requestCount,
                    errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
                    cacheHitRate: 0, // 由UnifiedDataProvider内部管理
                    lastUpdate: Date.now()
                },

                // 警报状态
                alerts: this.alerts
            };

            const duration = Date.now() - startTime;
            this.totalResponseTime += duration;

            await this.loggerService.logSystem('DEBUG',
                `完整分析报告生成完成 - 耗时: ${duration}ms, 当前价格: ${marketData.currentPrice}, 待提取收益: ${yieldStatistics.currentPendingYield}`
            );

            return report;

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logSystem('ERROR',
                `获取完整分析报告失败: ${error instanceof Error ? error.message : '未知错误'}`
            );
            throw new AnalyticsServiceError('获取分析报告', error instanceof Error ? error.message : '未知错误');
        }
    }

    /**
     * 🧠 获取智能止损数据 - 专为SmartStopLossModule设计的数据接口
     */
    async getSmartStopLossData(caller: string = '未知调用者'): Promise<MarketData> {
        try {
            if (!this.currentSetupParams) {
                throw new Error('未设置头寸监控参数');
            }

            const fetchParams: DataFetchParams = {
                poolAddress: this.currentSetupParams.poolAddress,
                positionAddresses: this.currentSetupParams.positionAddresses,
                initialInvestment: this.currentSetupParams.initialInvestmentAmount,
                ...(this.currentSetupParams.tokenPrecision && { tokenPrecision: this.currentSetupParams.tokenPrecision })
            };

            // 🔧 优化：使用UnifiedDataProvider的统一数据，包含已获取的activeBin
            const marketData = await this.dataProvider.fetchAllMarketData(fetchParams);

            // 🔧 优化：从marketData中直接提取已获取的activeBin，无需重复RPC调用
            const realActiveBin = marketData.activeBin;

            await this.loggerService.logSystem('DEBUG',
                `🎯 智能止损使用缓存的activeBin: ${realActiveBin} (来自UnifiedDataProvider)`
            );

            // 🔧 优化：从PositionManager的缓存数据中获取头寸范围，避免重复链上查询
            let realPositionLowerBin = realActiveBin;
            let realPositionUpperBin = realActiveBin;
            let validPositionsCount = 0;

            try {
                if (this.currentSetupParams.positionAddresses.length > 0) {
                    let minLowerBin = Number.MAX_SAFE_INTEGER;
                    let maxUpperBin = Number.MIN_SAFE_INTEGER;

                    // 🔧 优化：使用PositionManager的批量获取方法，减少RPC调用
                    const batchResult = await this.positionManager.getBatchPositionsOnChainInfo(
                        this.currentSetupParams.positionAddresses
                    );

                    if (batchResult.success && batchResult.data) {
                        for (const positionResult of batchResult.data) {
                            if (positionResult.success && positionResult.info) {
                                const info = positionResult.info;

                                // 从PositionManager的链上数据中提取bin范围
                                const lowerBin = info.lowerBinId;
                                const upperBin = info.upperBinId;

                                if (typeof lowerBin === 'number' && typeof upperBin === 'number') {
                                    minLowerBin = Math.min(minLowerBin, lowerBin);
                                    maxUpperBin = Math.max(maxUpperBin, upperBin);
                                    validPositionsCount++;

                                    await this.loggerService.logSystem('DEBUG',
                                        `📊 头寸 ${positionResult.address.substring(0, 8)}... bin范围: [${lowerBin}, ${upperBin}] (来自PositionManager缓存)`
                                    );
                                }
                            }
                        }
                    }

                    // 如果成功提取到有效的头寸范围
                    if (validPositionsCount > 0 && minLowerBin !== Number.MAX_SAFE_INTEGER) {
                        realPositionLowerBin = minLowerBin;
                        realPositionUpperBin = maxUpperBin;

                        await this.loggerService.logSystem('INFO',
                            `🎯 连锁头寸整体范围(${caller}): [${realPositionLowerBin}, ${realPositionUpperBin}], 包含${validPositionsCount}个头寸 (无额外RPC调用)`
                        );
                    } else {
                        await this.loggerService.logSystem('WARN',
                            `❌ 无法从${this.currentSetupParams.positionAddresses.length}个头寸中提取bin范围，使用activeBin作为默认范围`
                        );
                        // 使用activeBin作为默认范围（连锁头寸的典型范围）
                        realPositionLowerBin = realActiveBin - 69;
                        realPositionUpperBin = realActiveBin;
                    }
                }
            } catch (binError) {
                await this.loggerService.logSystem('ERROR',
                    `获取头寸范围失败: ${binError instanceof Error ? binError.message : '未知错误'}`
                );

                // 使用基于activeBin的合理默认范围
                realPositionLowerBin = realActiveBin - 69;
                realPositionUpperBin = realActiveBin;
            }

            // 🆕 计算基准收益率（使用日化收益率）
            const dualYieldRates = this.dataProvider.calculateDualYieldRates(marketData);
            const fiveMinuteDailyYieldRate = dualYieldRates.feeYieldEfficiency.last5Minutes; // 直接使用日化收益率
            const benchmarkYieldRates = this.dataProvider.calculateBenchmarkYieldRates(
                realActiveBin,
                realPositionLowerBin,
                realPositionUpperBin,
                fiveMinuteDailyYieldRate
            );

            const binData = {
                activeBin: realActiveBin,
                positionLowerBin: realPositionLowerBin,
                positionUpperBin: realPositionUpperBin,
                ...(benchmarkYieldRates && { benchmarkYieldRates })
            };

            await this.loggerService.logSystem('INFO',
                `🔧 智能止损bin数据(${caller}): activeBin=${realActiveBin}, range=[${realPositionLowerBin}, ${realPositionUpperBin}], 基准收益率=${benchmarkYieldRates ? '已计算' : '未就绪'} - 零额外RPC调用`
            );

            return this.dataProvider.transformToSmartStopLossData(marketData, binData);

        } catch (error) {
            await this.loggerService.logSystem('ERROR',
                `获取智能止损数据失败: ${error instanceof Error ? error.message : '未知错误'}`
            );
            throw error;
        }
    }

    /**
     * 构建价格趋势分析 - 简化版
     */
    private buildPriceTrendAnalysis(marketData: UnifiedMarketData): PriceTrendAnalysis[] {
        return this.config.trendAnalysisTimeframes.map(timeframe => {
            const cutoffTime = Date.now() - (timeframe * 60 * 1000);
            const recentPrices = marketData.priceHistory.filter(p => p.timestamp >= cutoffTime);

            if (recentPrices.length < 2) {
                return {
                    timeframe,
                    priceChange: 0,
                    priceChangePercent: 0,
                    isThresholdTriggered: false,
                    startPrice: marketData.currentPrice,
                    endPrice: marketData.currentPrice,
                    startTime: Date.now() - (timeframe * 60 * 1000),
                    endTime: Date.now()
                };
            }

            const startPrice = recentPrices[0].price;
            const endPrice = recentPrices[recentPrices.length - 1].price;
            const priceChange = endPrice - startPrice;
            const priceChangePercentage = (priceChange / startPrice) * 100;

            return {
                timeframe,
                priceChange,
                priceChangePercent: priceChangePercentage,
                isThresholdTriggered: Math.abs(priceChangePercentage) > 5, // 简化处理，5%阈值
                startPrice,
                endPrice,
                startTime: recentPrices[0].timestamp,
                endTime: recentPrices[recentPrices.length - 1].timestamp
            };
        });
    }

    /**
     * 构建头寸亏损分析 - 支持单个头寸和连锁头寸
     */
    private buildPositionLossAnalysis(marketData: UnifiedMarketData): PositionLoss[] {
        const totalPositionValue = parseFloat(marketData.totalPositionValue);
        const initialInvestment = parseFloat(marketData.initialInvestment);
        const isChainPosition = marketData.positions.length > 1;

        if (isChainPosition) {
            // 连锁头寸：整体计算盈亏
            const overallLoss = initialInvestment - totalPositionValue;
            const overallLossPercentage = (overallLoss / initialInvestment) * 100;

            this.loggerService.logSystem('DEBUG',
                `连锁头寸分析 - 总价值: ${totalPositionValue}Y, 初始投入: ${initialInvestment}Y, 盈亏: ${overallLossPercentage.toFixed(2)}%`
            );

            // 返回连锁头寸的整体分析结果
            return [{
                positionAddress: 'CHAIN_POSITION',
                currentTokenX: '合计',
                currentTokenY: '合计',
                currentValueInY: marketData.totalPositionValue,
                initialInvestment: marketData.initialInvestment,
                lossAmount: overallLoss.toString(),
                lossPercentage: overallLossPercentage,
                timestamp: Date.now(),
                priceAtCalculation: marketData.currentPrice
            }];
        } else {
            // 单个头寸：直接与总投入对比
            const position = marketData.positions[0];
            const currentValue = parseFloat(position.currentValueInY);
            const unrealizedLoss = initialInvestment - currentValue;
            const lossPercentage = (unrealizedLoss / initialInvestment) * 100;

            this.loggerService.logSystem('DEBUG',
                `单个头寸分析 - 当前价值: ${currentValue}Y, 初始投入: ${initialInvestment}Y, 盈亏: ${lossPercentage.toFixed(2)}%`
            );

            return [{
                positionAddress: position.address,
                currentTokenX: position.currentTokenX,
                currentTokenY: position.currentTokenY,
                currentValueInY: position.currentValueInY,
                initialInvestment: marketData.initialInvestment,
                lossAmount: unrealizedLoss.toString(),
                lossPercentage,
                timestamp: Date.now(),
                priceAtCalculation: marketData.currentPrice
            }];
        }
    }

    /**
     * 构建真实盈亏报告 - 简化版
     */
    private buildRealPnLReport(marketData: UnifiedMarketData, yieldStats: YieldStatistics): RealPnL {
        const totalExtracted = parseFloat(marketData.totalExtractedYield);
        const currentPending = parseFloat(yieldStats.currentPendingYield);
        const currentPositionValue = parseFloat(marketData.totalPositionValue);
        const initialInvestment = parseFloat(marketData.initialInvestment);

        const totalRealized = totalExtracted;
        const totalUnrealized = currentPending + currentPositionValue - initialInvestment;
        const netPnL = totalRealized + totalUnrealized;
        const pnlPercentage = (netPnL / initialInvestment) * 100;

        return {
            totalExtractedYield: totalExtracted.toString(),
            currentPositionValue: marketData.totalPositionValue,
            initialInvestment: marketData.initialInvestment,
            realPnLAmount: netPnL.toString(),
            realPnLPercentage: pnlPercentage,
            timestamp: Date.now(),
            breakdown: {
                extractedYieldValue: totalExtracted,
                positionValueChange: currentPositionValue - initialInvestment,
                totalReturn: netPnL
            }
        };
    }

    // 以下是简化的接口实现方法
    async getPriceTrendAnalysis(timeframes?: number[]): Promise<PriceTrendAnalysis[]> {
        const report = await this.getCompleteAnalyticsReport();
        return report.priceTrendAnalysis;
    }

    async getYieldStatistics(): Promise<YieldStatistics> {
        const report = await this.getCompleteAnalyticsReport();
        return report.yieldStatistics;
    }

    async getPositionLossAnalysis(): Promise<PositionLoss[]> {
        const report = await this.getCompleteAnalyticsReport();
        return report.positionLossAnalysis;
    }

    async getRealPnLReport(): Promise<RealPnL> {
        const report = await this.getCompleteAnalyticsReport();
        return report.realPnLReport;
    }

    async getCurrentPrice(): Promise<number> {
        const report = await this.getCompleteAnalyticsReport();
        return report.currentPrice;
    }

    async getPendingYield(): Promise<string> {
        const yieldStats = await this.getYieldStatistics();
        return yieldStats.currentPendingYield;
    }

    async isExtractionReady(): Promise<boolean> {
        const pendingYield = await this.getPendingYield();
        return parseFloat(pendingYield) >= parseFloat(this.config.yieldExtractionThreshold);
    }

    async healthCheck(): Promise<{
        status: 'healthy' | 'warning' | 'error';
        message: string;
        timestamp: number;
        details?: any;
    }> {
        try {
            const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;
            const avgResponseTime = this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0;

            let status: 'healthy' | 'warning' | 'error' = 'healthy';
            let message = '服务运行正常';

            if (errorRate > 10) {
                status = 'error';
                message = `错误率过高: ${errorRate.toFixed(2)}%`;
            } else if (errorRate > 5 || avgResponseTime > 5000) {
                status = 'warning';
                message = `性能警告 - 错误率: ${errorRate.toFixed(2)}%, 平均响应时间: ${avgResponseTime.toFixed(0)}ms`;
            }

            return {
                status,
                message,
                timestamp: Date.now(),
                details: {
                    isMonitoring: this.isMonitoring,
                    requestCount: this.requestCount,
                    errorCount: this.errorCount,
                    errorRate: errorRate.toFixed(2) + '%',
                    avgResponseTime: avgResponseTime.toFixed(0) + 'ms',
                    version: this.version
                }
            };

        } catch (error) {
            return {
                status: 'error',
                message: `健康检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: Date.now()
            };
        }
    }

    // 工具方法
    private addBigNumbers(a: string, b: string): string {
        return (parseFloat(a) + parseFloat(b)).toString();
    }

    private validateConfig(config: AnalyticsConfig): void {
        if (config.priceMonitorInterval < 1000) {
            throw new Error('价格监控间隔不能小于1秒');
        }
        if (config.yieldCalculationInterval < 1000) {
            throw new Error('收益计算间隔不能小于1秒');
        }
        if (parseFloat(config.yieldExtractionThreshold) <= 0) {
            throw new Error('收益提取阈值必须大于0');
        }
    }

    private validateSetupParams(params: PositionSetupParams): void {
        if (!params.poolAddress) {
            throw new Error('池子地址不能为空');
        }
        if (!params.positionAddresses || params.positionAddresses.length === 0) {
            throw new Error('头寸地址列表不能为空');
        }
        if (!params.initialInvestmentAmount || parseFloat(params.initialInvestmentAmount) <= 0) {
            throw new Error('初始投资金额必须大于0');
        }
    }
} 