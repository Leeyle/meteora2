import { injectable, inject } from 'tsyringe';
import { Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { IGasService, IConfigService, ILoggerService, ICacheService, ISolanaWeb3Service, TYPES } from '../../types/interfaces';
import { GasEstimate, ModuleConfig, ModuleHealth, ModuleMetrics } from '../../types/interfaces';

interface PriorityFeeData {
    baseFee: number;
    priorityFee: number;
    networkCongestion: 'low' | 'medium' | 'high';
    timestamp: number;
    sampleSize: number;
}

interface GasSettings {
    baseFee: number;
    priorityFee: number;
    computeUnitLimit: number;
    computeUnitPrice: number;
}

/**
 * Gas费用管理服务
 * 负责动态gas费用管理、优先费用计算、网络拥堵检测
 * 参考原项目的gas费用优化策略
 */
@injectable()
export class GasService implements IGasService {
    public readonly name = 'GasService';
    public readonly version = '2.0.0';
    public readonly dependencies = ['ConfigService', 'LoggerService', 'CacheService', 'SolanaWeb3Service'];

    private config: any;
    private updateInterval: NodeJS.Timeout | null = null;
    private readonly updateIntervalMs = 60000; // 60秒更新一次（原来是10秒）
    private cachedPriorityFeeData: PriorityFeeData | null = null;

    // 性能监控指标
    private requestCount: number = 0;
    private errorCount: number = 0;
    private operationCount: number = 0;
    private lastOperationTime: number = 0;
    private totalResponseTime: number = 0;

    // Gas费用配置
    private readonly defaultComputeUnitLimit = 200000;
    private readonly minPriorityFee = 100000; // 最小优先费用提升至100000 (micro-lamports)
    private readonly maxPriorityFee = 500000; // 最大优先费用 (micro-lamports)
    private readonly baseFeeMultiplier = 1.2; // 基础费用倍数
    private readonly networkCongestionThreshold = 0.8; // 网络拥堵阈值
    private readonly emergencyFeeMultiplier = 3.0; // 紧急情况费用倍数

    // 🚀 紧急操作优先费用配置 - 调整为合理的20倍提升
    private readonly emergencyPriorityFee = 100000; // 紧急操作优先费用
    private readonly stopLossPriorityFee = 100000; // 止损操作优先费用

    // 🚀 止损模式状态管理
    private stopLossMode: boolean = false;
    private stopLossModeTimeout: NodeJS.Timeout | null = null;
    private readonly stopLossModeTimeoutMs = 30000; // 30秒后自动退出止损模式

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.CacheService) private cacheService: ICacheService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service
    ) { }

    async initialize(config: ModuleConfig): Promise<void> {
        // 🔧 系统日志: 服务初始化
        await this.loggerService.logSystem('INFO', 'GasService开始初始化...');

        this.config = this.configService.get('gas', {});

        // 从缓存恢复优先费用数据
        await this.loadPriorityFeeDataFromCache();

        // 🔧 系统日志: 初始化完成
        await this.loggerService.logSystem('INFO', `GasService初始化完成 v${this.version}`);
    }

    async start(): Promise<void> {
        // 立即更新一次优先费用
        await this.updatePriorityFeeData();

        // 🚫 已禁用定期更新优先费用轮询，仅在交易前主动调用
        // this.startPriorityFeeUpdates();

        await this.loggerService.logSystem('INFO', 'GasService启动完成 (已禁用定期轮询)');
    }

    async stop(): Promise<void> {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // 保存优先费用数据到缓存
        await this.savePriorityFeeDataToCache();

        await this.loggerService.logSystem('INFO', 'GasService已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            const hasValidData = this.cachedPriorityFeeData !== null;
            const dataAge = hasValidData
                ? Date.now() - this.cachedPriorityFeeData!.timestamp
                : Infinity;

            const isDataFresh = dataAge < 60000; // 数据应该在1分钟内

            let status: 'healthy' | 'warning' | 'error';
            let message: string;

            if (hasValidData && isDataFresh) {
                status = 'healthy';
                message = 'Gas费用数据正常';
            } else if (hasValidData) {
                status = 'warning';
                message = `Gas费用数据过时 (${Math.round(dataAge / 1000)}s前)`;
            } else {
                status = 'error';
                message = '缺少Gas费用数据';
            }

            return {
                status,
                message,
                timestamp: Date.now(),
                details: {
                    hasValidData,
                    dataAge: Math.round(dataAge / 1000),
                    currentPriorityFee: this.cachedPriorityFeeData?.priorityFee,
                    networkCongestion: this.cachedPriorityFeeData?.networkCongestion
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `GasService健康检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: Date.now()
            };
        }
    }

    getMetrics(): ModuleMetrics {
        const avgResponseTime = this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0;

        return {
            uptime: Date.now(),
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            lastActivity: this.lastOperationTime || Date.now(),
            performance: {
                avgResponseTime,
                successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 100
            }
        };
    }

    /**
     * 估算交易的Gas费用
     */
    async estimateGas(transaction: Transaction): Promise<GasEstimate> {
        const operationStart = Date.now();
        this.requestCount++;
        try {
            const connection = this.solanaService.getConnection();

            // 模拟交易以获取计算单元消耗
            const simulationResult = await connection.simulateTransaction(transaction);

            if (simulationResult.value.err) {
                throw new Error(`交易模拟失败: ${JSON.stringify(simulationResult.value.err)}`);
            }

            const unitsConsumed = simulationResult.value.unitsConsumed || this.defaultComputeUnitLimit;
            const baseFee = await this.getCurrentBaseFee();
            const priorityFee = await this.getOptimalPriorityFee();

            // 计算总费用
            const totalUnits = Math.max(unitsConsumed, 10000); // 最小10000计算单元
            const computeUnitPrice = Math.max(priorityFee, this.minPriorityFee);
            const totalFee = baseFee + (totalUnits * computeUnitPrice / 1000000); // 转换为lamports

            const estimate: GasEstimate = {
                baseFee,
                priorityFee: computeUnitPrice,
                totalFee,
                units: totalUnits
            };

            await this.loggerService.logBusinessOperation('gas-estimate-success', {
                baseFee: estimate.baseFee,
                priorityFee: estimate.priorityFee,
                totalFee: estimate.totalFee,
                units: estimate.units,
                timestamp: Date.now()
            });

            return estimate;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('gas-estimate', 'Gas费用估算失败', error as Error);

            // 返回默认估算
            const baseFee = await this.getCurrentBaseFee();
            const priorityFee = await this.getOptimalPriorityFee();

            return {
                baseFee,
                priorityFee,
                totalFee: baseFee + (this.defaultComputeUnitLimit * priorityFee / 1000000),
                units: this.defaultComputeUnitLimit
            };
        }
    }

    /**
     * 获取最优优先费用
     */
    async getOptimalPriorityFee(): Promise<number> {
        const operationStart = Date.now();
        this.operationCount++;
        try {
            // 🚀 止损模式检查：如果处于止损模式，直接返回止损最高级优先费用
            if (this.stopLossMode) {
                const stopLossMaxFee = await this.getStopLossMaxPriorityFee();
                await this.loggerService.logSystem('INFO',
                    `🚀 止损模式激活：使用最高级优先费用 ${stopLossMaxFee} microlamports`
                );
                return stopLossMaxFee;
            }

            // 使用缓存数据，避免频繁RPC调用
            if (this.cachedPriorityFeeData) {
                const { priorityFee, networkCongestion, timestamp } = this.cachedPriorityFeeData;

                // 数据在5分钟内视为有效
                const dataAge = Date.now() - timestamp;
                if (dataAge < 300000) {
                    await this.loggerService.logSystem('DEBUG', `使用缓存优先费用: ${priorityFee} (${networkCongestion}, ${Math.round(dataAge / 1000)}s前)`);
                    return priorityFee;
                }
            }

            // 缓存过期，使用默认值并记录警告
            const defaultFee = this.getDefaultPriorityFee();
            await this.loggerService.logSystem('WARN', `优先费用缓存过期，使用默认值: ${defaultFee}`);
            return defaultFee;

        } catch (error) {
            await this.loggerService.logSystem('WARN', `获取最优优先费用失败，使用默认值: ${error}`);
            const defaultFee = this.getDefaultPriorityFee();
            return defaultFee;
        }
    }

    /**
     * 策略交易前主动更新优先费用 (供策略模块调用)
     */
    async updatePriorityFeeForTransaction(): Promise<void> {
        try {
            await this.loggerService.logSystem('INFO', '策略交易前主动更新优先费用数据');
            await this.updatePriorityFeeData();
        } catch (error) {
            await this.loggerService.logError('update-priority-fee-for-transaction', '策略交易前更新优先费用失败', error as Error);
        }
    }

    /**
     * 🚀 获取止损专用的最高级优先费用
     * 用于确保止损交易能够快速被网络处理
     */
    async getStopLossMaxPriorityFee(): Promise<number> {
        try {
            // 🚀 激活止损模式
            this.activateStopLossMode();

            // 获取当前网络拥堵状态
            const congestionLevel = this.getNetworkCongestion();

            let priorityFee: number;

            switch (congestionLevel) {
                case 'high':
                    // 高拥堵时使用紧急优先费用 (基于20,000的20倍 = 400,000，但我们限制为100,000)
                    priorityFee = this.emergencyPriorityFee;
                    break;
                case 'medium':
                    // 中等拥堵时使用止损优先费用 (基于10,000的20倍 = 200,000，但我们使用100,000)
                    priorityFee = this.stopLossPriorityFee;
                    break;
                case 'low':
                default:
                    // 低拥堵时使用基于10,000的10倍 = 100,000
                    priorityFee = this.stopLossPriorityFee;
                    break;
            }

            await this.loggerService.logSystem('INFO',
                `🚀 止损最高级优先费用: ${priorityFee} microlamports (网络拥堵: ${congestionLevel})`
            );

            return priorityFee;
        } catch (error) {
            await this.loggerService.logSystem('WARN',
                `获取止损最高级优先费用失败，使用默认值: ${error}`
            );
            // 失败时返回止损优先费用作为保底
            this.activateStopLossMode(); // 即使失败也要激活止损模式
            return this.stopLossPriorityFee;
        }
    }

    /**
     * 🚀 获取紧急操作的最高级优先费用
     * 用于最紧急的交易操作
     */
    async getEmergencyMaxPriorityFee(): Promise<number> {
        await this.loggerService.logSystem('INFO',
            `🚨 紧急操作最高级优先费用: ${this.emergencyPriorityFee} microlamports`
        );
        return this.emergencyPriorityFee;
    }

    /**
     * 🚀 手动激活止损模式
     * 在后续的所有交易中使用最高级优先费用
     */
    activateStopLossModeManually(): void {
        this.activateStopLossMode();
        this.loggerService.logSystem('INFO',
            `🚀 手动激活止损模式，${this.stopLossModeTimeoutMs / 1000}秒后自动退出`
        );
    }

    /**
     * 🚀 手动退出止损模式
     */
    deactivateStopLossMode(): void {
        if (this.stopLossModeTimeout) {
            clearTimeout(this.stopLossModeTimeout);
            this.stopLossModeTimeout = null;
        }
        this.stopLossMode = false;
        this.loggerService.logSystem('INFO', '🚀 已退出止损模式');
    }

    /**
     * 🎯 优化特定操作的Gas费用
     * @param operationType 操作类型
     */
    async optimizeGasForOperation(operationType: string): Promise<void> {
        try {
            switch (operationType) {
                case 'stop_loss_priority':
                    // 激活止损模式，使用最高级优先费用
                    this.activateStopLossMode();
                    await this.loggerService.logSystem('INFO',
                        `🚀 已为${operationType}操作优化Gas费用，激活止损模式`);
                    break;
                case 'emergency_priority':
                    // 激活紧急模式
                    this.activateStopLossMode(); // 复用止损模式的机制
                    await this.loggerService.logSystem('INFO',
                        `🚨 已为${operationType}操作优化Gas费用，激活紧急模式`);
                    break;
                default:
                    // 更新常规优先费用
                    await this.updatePriorityFeeForTransaction();
                    await this.loggerService.logSystem('INFO',
                        `🎯 已为${operationType}操作更新优先费用`);
                    break;
            }
        } catch (error) {
            await this.loggerService.logSystem('WARN',
                `Gas优化失败(${operationType}): ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取当前基础费用
     */
    async getCurrentBaseFee(): Promise<number> {
        const operationStart = Date.now();
        try {
            // Solana的基础费用通常是固定的10000 lamports
            const baseFee = 10000;

            // 可以根据网络状况调整
            if (this.cachedPriorityFeeData?.networkCongestion === 'high') {
                return Math.round(baseFee * this.baseFeeMultiplier);
            }

            return baseFee;
        } catch (error) {
            await this.loggerService.logSystem('WARN', `获取基础费用失败，使用默认值: ${error}`);
            return 10000;
        }
    }

    /**
     * 获取当前Gas设置 (供其他服务调用)
     */
    async getCurrentGasSettings(): Promise<{ baseFee: number; priorityFee: number; }> {
        const baseFee = await this.getCurrentBaseFee();
        const priorityFee = await this.getOptimalPriorityFee();

        return { baseFee, priorityFee };
    }

    /**
     * 为交易添加计算预算指令
     */
    async addComputeBudgetInstructions(transaction: Transaction, estimate?: GasEstimate): Promise<Transaction> {
        try {
            const computeUnitLimit = estimate?.units || this.defaultComputeUnitLimit;
            const computeUnitPrice = estimate?.priorityFee || await this.getOptimalPriorityFee();

            // 🔧 改进的重复指令检测：检查是否已有任何ComputeBudgetProgram指令
            const existingInstructions = transaction.instructions;
            const computeBudgetInstructions = existingInstructions.filter(ix =>
                ix.programId.equals(ComputeBudgetProgram.programId)
            );

            if (computeBudgetInstructions.length > 0) {
                // 分析现有的计算预算指令类型和值
                const instructionTypes = [];
                let existingComputeUnitLimit = this.defaultComputeUnitLimit;
                let existingComputeUnitPrice = 0;

                for (const ix of computeBudgetInstructions) {
                    if (ix.data.length >= 1) {
                        const instructionType = ix.data[0];
                        switch (instructionType) {
                            case 0:
                                instructionTypes.push('RequestHeapFrame');
                                break;
                            case 1:
                                instructionTypes.push('RequestUnits');
                                break;
                            case 2:
                                instructionTypes.push('SetComputeUnitLimit');
                                // 提取现有的计算单元限制
                                if (ix.data.length >= 5) {
                                    existingComputeUnitLimit = ix.data.readUInt32LE(1);
                                }
                                break;
                            case 3:
                                instructionTypes.push('SetComputeUnitPrice');
                                // 提取现有的计算单元价格
                                if (ix.data.length >= 9) {
                                    existingComputeUnitPrice = Number(ix.data.readBigUInt64LE(1));
                                }
                                break;
                            default:
                                instructionTypes.push(`Unknown(${instructionType})`);
                        }
                    }
                }

                // 🔄 智能替换策略：保留更高的计算单元限制，只替换优先费用
                const finalComputeUnitLimit = Math.max(existingComputeUnitLimit, computeUnitLimit);

                // 移除所有现有的计算预算指令
                const indicesToRemove: number[] = [];
                existingInstructions.forEach((instruction, index) => {
                    if (instruction.programId.equals(ComputeBudgetProgram.programId)) {
                        indicesToRemove.push(index);
                    }
                });

                // 从后往前移除，避免索引变化问题
                indicesToRemove.reverse().forEach(index => {
                    transaction.instructions.splice(index, 1);
                });

                // 使用更高的计算单元限制
                const computeUnitLimitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
                    units: finalComputeUnitLimit
                });

                const computeUnitPriceInstruction = ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: computeUnitPrice
                });

                // 将指令添加到交易开头
                transaction.instructions.unshift(computeUnitPriceInstruction, computeUnitLimitInstruction);

                await this.loggerService.logBusinessOperation('compute-budget-replaced', {
                    reason: 'sdk_instructions_replaced',
                    removedInstructionCount: indicesToRemove.length,
                    removedInstructionTypes: instructionTypes,
                    existingComputeUnitLimit,
                    existingComputeUnitPrice,
                    finalComputeUnitLimit,
                    newComputeUnitPrice: computeUnitPrice,
                    stopLossMode: this.stopLossMode,
                    timestamp: Date.now()
                });

                return transaction;
            }

            // 添加计算单元限制指令
            const computeUnitLimitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
                units: computeUnitLimit
            });

            // 添加计算单元价格指令 (优先费用)
            const computeUnitPriceInstruction = ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: computeUnitPrice
            });

            // 将指令添加到交易开头
            transaction.instructions.unshift(computeUnitPriceInstruction, computeUnitLimitInstruction);

            await this.loggerService.logBusinessOperation('compute-budget-added', {
                computeUnitLimit: computeUnitLimit,
                computeUnitPrice: computeUnitPrice,
                stopLossMode: this.stopLossMode,
                instructionCount: transaction.instructions.length,
                timestamp: Date.now()
            });

            return transaction;
        } catch (error) {
            await this.loggerService.logError('add-compute-budget-instructions', '添加计算预算指令失败', error as Error);
            return transaction;
        }
    }

    /**
     * 获取网络拥堵状态
     */
    getNetworkCongestion(): 'low' | 'medium' | 'high' {
        return this.cachedPriorityFeeData?.networkCongestion || 'medium';
    }

    /**
     * 开始优先费用数据更新
     */
    private async startPriorityFeeUpdates(): Promise<void> {
        this.updateInterval = setInterval(async () => {
            try {
                await this.updatePriorityFeeData();
            } catch (error) {
                this.loggerService.logError('periodic-priority-fee-update', '定期更新优先费用失败', error as Error).catch(console.error);
            }
        }, this.updateIntervalMs);

        await this.loggerService.logSystem('INFO', `优先费用定期更新已启动: 间隔${this.updateIntervalMs}ms`);
    }

    /**
     * 更新优先费用数据
     */
    private async updatePriorityFeeData(): Promise<void> {
        try {
            const connection = this.solanaService.getConnection();

            // 获取最近的优先费用数据
            const recentPriorityFees = await connection.getRecentPrioritizationFees();

            if (recentPriorityFees.length === 0) {
                await this.loggerService.logSystem('WARN', '未获取到优先费用数据');
                return;
            }

            // 分析优先费用数据
            const priorityFeeAnalysis = this.analyzePriorityFees(recentPriorityFees);

            // 更新缓存数据
            this.cachedPriorityFeeData = {
                baseFee: await this.getCurrentBaseFee(),
                priorityFee: priorityFeeAnalysis.recommendedFee,
                networkCongestion: priorityFeeAnalysis.congestionLevel,
                timestamp: Date.now(),
                sampleSize: recentPriorityFees.length
            };

            await this.loggerService.logBusinessMonitoring('priority-fee-cache-updated', {
                priorityFee: this.cachedPriorityFeeData!.priorityFee,
                baseFee: this.cachedPriorityFeeData!.baseFee,
                networkCongestion: this.cachedPriorityFeeData!.networkCongestion,
                sampleSize: this.cachedPriorityFeeData!.sampleSize,
                timestamp: Date.now()
            });
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('update-priority-fee-data', '更新优先费用数据失败', error as Error);
        }
    }

    /**
     * 分析优先费用数据
     */
    private analyzePriorityFees(fees: any[]): {
        recommendedFee: number;
        congestionLevel: 'low' | 'medium' | 'high';
    } {
        if (fees.length === 0) {
            return {
                recommendedFee: this.getDefaultPriorityFee(),
                congestionLevel: 'medium'
            };
        }

        // 提取优先费用值
        const priorityFees = fees
            .map(fee => fee.prioritizationFee || 0)
            .filter(fee => fee > 0)
            .sort((a, b) => a - b);

        if (priorityFees.length === 0) {
            return {
                recommendedFee: this.getDefaultPriorityFee(),
                congestionLevel: 'low'
            };
        }

        // 计算统计值
        const median = this.calculateMedian(priorityFees);
        const p75 = this.calculatePercentile(priorityFees, 75);
        const p90 = this.calculatePercentile(priorityFees, 90);
        const average = priorityFees.reduce((sum, fee) => sum + fee, 0) / priorityFees.length;

        // 🔧 优化：更积极的拥堵检测和费用调整（保持100000最低阈值）
        let recommendedFee: number;
        let congestionLevel: 'low' | 'medium' | 'high';

        // 🚨 新增：检测最近交易验证失败率来判断实际网络状况
        const highFeeTransactions = priorityFees.filter(fee => fee > 50000).length;
        const highFeeRatio = highFeeTransactions / priorityFees.length;

        if (median < 80000 && highFeeRatio < 0.15) {
            // 低拥堵：中位数低且高费用交易少，但保持100000最低标准
            recommendedFee = Math.max(median * 2.0, this.minPriorityFee);
            congestionLevel = 'low';
        } else if (median < 120000 && highFeeRatio < 0.25) {
            // 🔧 适应100000最低标准，中等拥堵时提高费用计算
            recommendedFee = Math.max(p75 * 1.2, 120000); // 调整为120000最低
            congestionLevel = 'medium';
        } else if (median < 150000 && highFeeRatio < 0.4) {
            // 🔧 中高拥堵级别，更精细的分级
            recommendedFee = Math.max(p90 * 1.1, 150000);
            congestionLevel = 'medium';
        } else {
            // 高拥堵：更积极的费用设置
            recommendedFee = Math.max(p90 * 1.2, 200000);
            congestionLevel = 'high';
        }

        // 🚨 新增：如果平均费用明显高于中位数，说明网络波动大，提高费用
        if (average > median * 2) {
            recommendedFee = Math.max(recommendedFee, average * 1.1);
            if (congestionLevel === 'low') {
                congestionLevel = 'medium';
            } else if (congestionLevel === 'medium') {
                congestionLevel = 'high';
            }
        }

        // 确保在合理范围内
        recommendedFee = Math.max(this.minPriorityFee,
            Math.min(recommendedFee, this.maxPriorityFee));

        return { recommendedFee: Math.round(recommendedFee), congestionLevel };
    }

    /**
     * 计算中位数
     */
    private calculateMedian(values: number[]): number {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);

        if (sorted.length % 2 === 0) {
            return (sorted[mid - 1] + sorted[mid]) / 2;
        } else {
            return sorted[mid];
        }
    }

    /**
     * 计算百分位数
     */
    private calculatePercentile(values: number[], percentile: number): number {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * 获取默认优先费用
     */
    private getDefaultPriorityFee(): number {
        const configuredFee = this.configService.get('solana.priorityFee', 100000);
        return Math.max(configuredFee, this.minPriorityFee);
    }

    /**
     * 从缓存加载优先费用数据
     */
    private async loadPriorityFeeDataFromCache(): Promise<void> {
        try {
            const cachedData = await this.cacheService.get<PriorityFeeData>('priority_fee_data');

            if (cachedData) {
                // 检查数据是否过时 (超过5分钟)
                const dataAge = Date.now() - cachedData.timestamp;
                if (dataAge < 300000) {
                    this.cachedPriorityFeeData = cachedData;
                    await this.loggerService.logSystem('INFO', `从缓存恢复优先费用数据: ${this.cachedPriorityFeeData!.priorityFee} (${this.cachedPriorityFeeData!.networkCongestion})`);
                }
            }
        } catch (error) {
            await this.loggerService.logSystem('WARN', `从缓存加载优先费用数据失败: ${error}`);
        }
    }

    /**
     * 保存优先费用数据到缓存
     */
    private async savePriorityFeeDataToCache(): Promise<void> {
        try {
            if (this.cachedPriorityFeeData) {
                await this.cacheService.set('priority_fee_data', this.cachedPriorityFeeData, 600000); // 10分钟TTL
                await this.loggerService.logSystem('INFO', '优先费用数据已保存到缓存');
            }
        } catch (error) {
            await this.loggerService.logSystem('WARN', `保存优先费用数据到缓存失败: ${error}`);
        }
    }

    /**
     * 销毁服务，清理资源
     */
    async destroy(): Promise<void> {
        await this.stop();
        await this.loggerService.logSystem('INFO', 'GasService资源清理完成');
    }

    private activateStopLossMode(): void {
        if (this.stopLossModeTimeout) {
            clearTimeout(this.stopLossModeTimeout);
            this.stopLossModeTimeout = null;
        }
        this.stopLossMode = true;
        this.stopLossModeTimeout = setTimeout(() => {
            this.stopLossMode = false;
            this.stopLossModeTimeout = null;
        }, this.stopLossModeTimeoutMs);
    }

    /**
     * 🚨 交易失败后的紧急费用提升
     * 当交易验证超时时，临时提升优先费用
     */
    async getEmergencyPriorityFeeAfterTimeout(): Promise<number> {
        const currentFee = await this.getOptimalPriorityFee();

        // 根据当前网络拥堵状况计算紧急费用
        const congestion = this.getNetworkCongestion();
        let multiplier: number;

        switch (congestion) {
            case 'high':
                multiplier = 3.0; // 高拥堵时3倍提升
                break;
            case 'medium':
                multiplier = 2.5; // 中等拥堵时2.5倍提升
                break;
            case 'low':
            default:
                multiplier = 3.0; // 低拥堵时3倍提升
                break;
        }

        const emergencyFee = Math.min(currentFee * multiplier, this.maxPriorityFee);

        await this.loggerService.logSystem('WARN',
            `🚨 交易超时紧急费用提升: ${currentFee} → ${emergencyFee} (${multiplier}x, ${congestion}拥堵)`
        );

        return Math.round(emergencyFee);
    }

    /**
     * 🔧 智能费用调整：根据最近的交易成功率动态调整
     */
    async getSmartPriorityFee(hasRecentFailures: boolean = false): Promise<number> {
        const baseFee = await this.getOptimalPriorityFee();

        if (!hasRecentFailures) {
            return baseFee;
        }

        // 如果最近有交易失败，主动提升费用
        const congestion = this.getNetworkCongestion();
        let adjustmentFactor: number;

        switch (congestion) {
            case 'high':
                adjustmentFactor = 1.8; // 高拥堵时提升80%
                break;
            case 'medium':
                adjustmentFactor = 1.5; // 中等拥堵时提升50%
                break;
            case 'low':
            default:
                adjustmentFactor = 1.3; // 低拥堵时提升30%
                break;
        }

        const smartFee = Math.min(baseFee * adjustmentFactor, this.maxPriorityFee);

        await this.loggerService.logSystem('INFO',
            `🧠 智能费用调整: ${baseFee} → ${smartFee} (有失败记录，${congestion}拥堵)`
        );

        return Math.round(smartFee);
    }
} 