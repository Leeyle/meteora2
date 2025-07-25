import { injectable, inject } from 'tsyringe';
import { PublicKey, Keypair } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import * as DLMMSdk from '@meteora-ag/dlmm';
import {
    IXPositionManager, IPositionManager, IConfigService, ILoggerService,
    IMeteoraService, IJupiterService, ISolanaWeb3Service, IWalletService, TYPES
} from '../../types/interfaces';
import {
    CreateXPositionParams, PositionResult, PositionInfo,
    ModuleConfig, ModuleHealth, ModuleMetrics, CreatePositionParams
} from '../../types/interfaces';

interface XPositionStrategy {
    name: string;
    description: string;
    binSpread: number; // bin分布策略
    concentrationFactor: number; // 集中度因子
    hedgeRatio: number; // 对冲比例
    dynamicRebalancing: boolean; // 动态重平衡
}

interface XPositionAnalytics {
    totalValue: number;
    averagePrice: number;
    hedgeEffectiveness: number;
    utilization: number;
    impermanentLoss: number;
    riskMetrics: {
        volatility: number;
        sharpeRatio: number;
        maxDrawdown: number;
    };
}

/**
 * X代币头寸专用管理器
 * 专门处理基础代币(如USDC/SOL)流动性提供策略
 * 优化X代币在DLMM中的资金效率和风险控制
 * 参考原项目: DLMM_meme_zuowan/src/x_position_strategy.py
 */
@injectable()
export class XPositionManager implements IXPositionManager {
    // 性能监控指标
    private performanceMetrics = {
        operationCount: 0,
        totalResponseTime: 0,
        lastOperationTime: 0
    };

    public readonly name = 'XPositionManager';
    public readonly version = '2.0.0';
    public readonly dependencies = [
        'PositionManager', 'ConfigService', 'LoggerService',
        'MeteoraService', 'JupiterService', 'SolanaWeb3Service', 'WalletService'
    ];


    private config: any;
    private requestCount: number = 0;
    private errorCount: number = 0;

    // X代币策略配置
    private readonly defaultStrategies: XPositionStrategy[] = [
        {
            name: 'stable',
            description: '稳定型：重点防守，减少无常损失',
            binSpread: 25,
            concentrationFactor: 0.4,
            hedgeRatio: 0.8,
            dynamicRebalancing: true
        },
        {
            name: 'balanced',
            description: '平衡型：攻守兼备，中等风险收益',
            binSpread: 20,
            concentrationFactor: 0.6,
            hedgeRatio: 0.6,
            dynamicRebalancing: true
        },
        {
            name: 'aggressive',
            description: '进攻型：重点获利，承担更高风险',
            binSpread: 15,
            concentrationFactor: 0.8,
            hedgeRatio: 0.4,
            dynamicRebalancing: false
        }
    ];

    // X代币专用配置
    private readonly xTokenDefaults = {
        minBinRange: 10,
        maxBinRange: 40,
        defaultBinRange: 20,
        hedgeThreshold: 0.05, // 5%价格变动触发对冲
        rebalanceInterval: 1800000, // 30分钟重平衡间隔
        minPositionValue: 5000000, // 5M lamports最小头寸
        maxLeverageRatio: 3, // 最大3倍杠杆
    };

    constructor(
        @inject(TYPES.PositionManager) private positionManager: IPositionManager,
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.MeteoraService) private meteoraService: IMeteoraService,
        @inject(TYPES.JupiterService) private jupiterService: IJupiterService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        @inject(TYPES.WalletService) private walletService: IWalletService
    ) { }

    async initialize(config: ModuleConfig): Promise<void> {
        // 使用新的三层分离日志架构
        this.config = this.configService.get('xPositionManager', {});

        await this.loggerService.logSystem('INFO', '✅ XPositionManager初始化完成');
    }

    async start(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🚀 XPositionManager启动完成');
    }

    async stop(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🛑 XPositionManager已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            return {
                status: 'healthy',
                message: 'X代币头寸管理正常',
                timestamp: Date.now(),
                details: {
                    requestCount: this.requestCount,
                    errorCount: this.errorCount,
                    errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
                    strategiesCount: this.defaultStrategies.length
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `X代币头寸管理检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: Date.now()
            };
        }
    }

    getMetrics(): ModuleMetrics {
        return {
            uptime: Date.now(),
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            lastActivity: Date.now(),
            performance: {
                avgResponseTime: 0,
                successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 100
            }
        };
    }

    /**
     * 创建X代币头寸
     * @param params X代币头寸创建参数
     */
    async createXPosition(params: CreateXPositionParams): Promise<PositionResult> {
        try {
            await this.loggerService.logBusinessOperation('🔵 开始创建X代币头寸', {
                poolAddress: params.poolAddress.substring(0, 8) + '...',
                amount: params.amount,
                strategy: (params as any).strategy || 'balanced',
                binRange: params.binRange
            });

            this.requestCount++;

            // 1. 获取连接和钱包
            const connection = this.solanaService.getConnection();

            // 智能钱包管理：只在需要时才要求密码
            let wallet: Keypair;
            if (this.walletService.isWalletUnlocked()) {
                // 钱包已解锁，直接使用
                wallet = this.walletService.getCurrentKeypair()!;
                await this.loggerService.logBusinessOperation('🔑 使用已解锁钱包(X头寸)', {
                    message: '使用已解锁的钱包创建X代币头寸'
                });
            } else {
                // 钱包未解锁，需要密码
                const password = (params as any).password;
                if (!password) {
                    throw new Error('钱包未解锁，请提供密码');
                }
                const unlockSuccess = await this.walletService.unlock(password);
                if (!unlockSuccess) {
                    throw new Error('钱包解锁失败，请检查密码');
                }
                wallet = this.walletService.getCurrentKeypair()!;
                await this.loggerService.logBusinessOperation('🔓 钱包解锁成功(X头寸)', {
                    message: 'X代币头寸创建前钱包解锁成功'
                });
            }

            // 检查钱包余额
            const balanceResult = await this.solanaService.getBalance(wallet.publicKey);
            if (!balanceResult.success || balanceResult.balance < 0.01) { // 至少需要0.01 SOL
                throw new Error(`钱包 SOL 余额不足 (当前: ${balanceResult.balance} SOL)，请先充值至少0.01 SOL。`);
            }

            // 2. 创建DLMM池实例
            const poolPublicKey = new PublicKey(params.poolAddress);
            const dlmmPool = await DLMMSdk.default.create(connection, poolPublicKey);

            await this.loggerService.logBusinessOperation('📊 DLMM池创建成功', {
                poolAddress: params.poolAddress,
                tokenX: dlmmPool.tokenX.mint.toString(),
                tokenY: dlmmPool.tokenY.mint.toString()
            });

            // 3. 获取池信息和活跃bin
            const activeBin = await this.meteoraService.getActiveBin(params.poolAddress);

            // 4. 计算X代币头寸范围 - 与Y头寸类似，但计算方法不同
            const effectiveBinRange = (params.binRange && params.binRange > 0)
                ? params.binRange
                : this.xTokenDefaults.defaultBinRange;

            const [lowerBinId, upperBinId] = await this.getXPositionRange(
                activeBin,
                effectiveBinRange
            );

            await this.loggerService.logBusinessOperation('📊 X代币头寸范围计算', {
                activeBin,
                lowerBinId,
                upperBinId,
                binCount: upperBinId - lowerBinId + 1
            });

            // 5. 准备头寸参数
            const positionKeypair = Keypair.generate();
            const amountNumber = typeof params.amount === 'string' ? parseFloat(params.amount) : params.amount;
            // params.amount 已经是 lamports 单位，不需要再乘以 decimals
            const xAmount = new BN(Math.floor(amountNumber));
            const yAmount = new BN(0); // X头寸只使用X代币

            // 6. 创建头寸交易
            const txResult = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
                positionPubKey: positionKeypair.publicKey,
                user: wallet.publicKey,
                totalXAmount: xAmount,
                totalYAmount: yAmount,
                strategy: {
                    minBinId: lowerBinId,
                    maxBinId: upperBinId,
                    strategyType: DLMMSdk.StrategyType.BidAsk,
                    singleSidedX: true // X代币头寸
                },
                slippage: params.slippageBps || 800 // 默认8%滑点
            });

            // 7. 发送交易
            let signature = '';
            if (Array.isArray(txResult)) {
                // 多个交易
                for (const tx of txResult) {
                    const result = await this.solanaService.sendTransaction(tx, {
                        signers: [wallet, positionKeypair]
                    });
                    if (result.success) {
                        signature = result.signature;
                    } else {
                        throw new Error(`交易失败: ${result.error}`);
                    }
                }
            } else {
                // 单个交易
                const result = await this.solanaService.sendTransaction(txResult, {
                    signers: [wallet, positionKeypair]
                });
                if (result.success) {
                    signature = result.signature;
                } else {
                    throw new Error(`交易失败: ${result.error}`);
                }
            }

            await this.loggerService.logBusinessOperation('✅ X代币头寸创建成功', {
                positionAddress: positionKeypair.publicKey.toString(),
                signature,
                xAmount: params.amount,
                binRange: `${lowerBinId}-${upperBinId}`
            });

            // 8. 手动更新PositionManager缓存
            try {
                const positionState = {
                    address: positionKeypair.publicKey.toString(),
                    owner: wallet.publicKey.toString(),
                    poolAddress: params.poolAddress,
                    lowerBinId,
                    upperBinId,
                    binIds: Array.from({ length: upperBinId - lowerBinId + 1 }, (_, i) => lowerBinId + i),
                    totalXAmount: xAmount.toString(), // X头寸有X代币
                    totalYAmount: '0', // X头寸只有X代币
                    fees: { feeX: '0', feeY: '0' },
                    lastUpdated: Date.now(),
                    inRange: activeBin >= lowerBinId && activeBin <= upperBinId,
                    status: 'active' as const,
                    createdAt: Date.now(),
                    metadata: {
                        strategy: (params as any).strategy || 'balanced',
                        tags: [],
                        notes: 'X代币单边流动性头寸'
                    }
                };

                const cacheSuccess = await this.positionManager.addPositionToCache(positionState);
                if (cacheSuccess) {
                    await this.loggerService.logSystem('INFO', `成功添加X头寸到缓存: ${positionKeypair.publicKey.toString()}`);
                } else {
                    await this.loggerService.logSystem('WARN', `添加X头寸到缓存失败: ${positionKeypair.publicKey.toString()}`);
                }

            } catch (cacheError) {
                await this.loggerService.logSystem('WARN', `更新X头寸缓存失败: ${cacheError instanceof Error ? cacheError.message : '未知错误'}`);
            }

            // 9. 记录X代币专用元数据
            const strategy = this.getStrategy((params as any).strategy || 'balanced');
            await this.recordXPositionMetadata(positionKeypair.publicKey.toString(), {
                strategy: strategy.name,
                originalBinRange: params.binRange,
                lowerBinId,
                upperBinId,
                createdAt: Date.now()
            });

            return {
                success: true,
                positionAddress: positionKeypair.publicKey.toString(),
                signature,
                gasUsed: 0
            };

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('Module', '❌ X代币头寸创建失败:', error as Error);

            return {
                success: false,
                error: error instanceof Error ? error.message : 'X代币头寸创建失败'
            };
        }
    }

    /**
     * 关闭X代币头寸 - 委托给统一的PositionManager处理
     * @param positionAddress 头寸地址
     * @param password 可选密码（如果钱包未解锁）
     */
    async closeXPosition(positionAddress: string, password?: string): Promise<PositionResult> {
        return this.positionManager.closePosition(positionAddress, password);
    }

    /**
     * 获取X代币头寸范围
     * @param activeBin 当前活跃bin
     * @param binRange 期望的bin范围
     */
    async getXPositionRange(activeBin: number, binRange: number): Promise<[number, number]> {
        await this.loggerService.logBusinessOperation('🔧 计算X代币(单边)头寸范围', { activeBin, binRange });

        // 修正：为实现单边X代币流动性，整个范围必须在当前活跃bin之上。
        // 最低点设置在活跃bin的紧上方。
        const lowerBinId = activeBin + 1;
        // 从最低点向上延伸整个binRange的宽度。
        const upperBinId = lowerBinId + binRange - 1;

        await this.loggerService.logSystem('DEBUG', `X代币单边范围计算结果: activeBin=${activeBin}, binRange=${binRange}, lowerBinId=${lowerBinId}, upperBinId=${upperBinId}`);

        // 返回计算出的单边范围
        return [lowerBinId, upperBinId];
    }

    /**
     * 优化X代币头寸分布
     * @param poolAddress 池地址
     * @param activeBin 活跃bin
     * @param lowerBinId 下界bin
     * @param upperBinId 上界bin
     * @param strategy 策略配置
     */
    private async optimizeXPositionRange(
        poolAddress: string,
        activeBin: number,
        lowerBinId: number,
        upperBinId: number,
        strategy: XPositionStrategy
    ): Promise<{ lowerBinId: number; upperBinId: number; distribution: number[] }> {
        try {
            await this.loggerService.logBusinessOperation('🎯 开始X代币分布优化', {
                optimizedCount: 0,
                timestamp: Date.now()
            });

            // 1. 获取bin范围的流动性数据
            const binInfos = await this.meteoraService.getBinRange(poolAddress, lowerBinId, upperBinId);

            // 2. 分析市场波动性
            const volatilityAnalysis = await this.analyzeMarketVolatility(poolAddress);

            // 3. 根据策略和波动性调整范围
            let optimizedLower = lowerBinId;
            let optimizedUpper = upperBinId;

            // 基于波动性调整
            if (volatilityAnalysis.high) {
                // 高波动：扩大下方范围，增强防守
                const expansion = Math.floor((upperBinId - lowerBinId) * 0.2);
                optimizedLower = lowerBinId - expansion;
                optimizedUpper = Math.max(upperBinId - Math.floor(expansion * 0.5), activeBin + 5);
            } else if (volatilityAnalysis.low) {
                // 低波动：集中范围，提高效率
                const reduction = Math.floor((upperBinId - lowerBinId) * 0.1);
                optimizedLower = lowerBinId + reduction;
                optimizedUpper = upperBinId - reduction;
            }

            // 基于对冲比例调整
            if (strategy.hedgeRatio > 0.7) {
                // 高对冲：更保守的分布
                const conservativeAdjust = Math.floor((upperBinId - lowerBinId) * 0.1);
                optimizedLower = lowerBinId - conservativeAdjust;
            }

            // 4. 计算X代币专用的分布权重
            const distribution = this.calculateXTokenDistribution(
                optimizedLower,
                optimizedUpper,
                activeBin,
                strategy,
                volatilityAnalysis
            );

            await this.loggerService.logBusinessOperation('✅ X代币分布优化完成', {
                totalOptimized: 0,
                timestamp: Date.now()
            });

            return {
                lowerBinId: optimizedLower,
                upperBinId: optimizedUpper,
                distribution
            };

        } catch (error) {
            await this.loggerService.logError('Module', '❌ X代币分布优化失败:', error as Error);

            // 返回原始范围作为备选
            return {
                lowerBinId,
                upperBinId,
                distribution: []
            };
        }
    }

    /**
     * 计算X代币分布权重
     * @param lowerBinId 下界
     * @param upperBinId 上界
     * @param activeBin 活跃bin
     * @param strategy 策略
     * @param volatilityInfo 波动性信息
     */
    private calculateXTokenDistribution(
        lowerBinId: number,
        upperBinId: number,
        activeBin: number,
        strategy: XPositionStrategy,
        volatilityInfo: any
    ): number[] {
        const distribution: number[] = [];

        for (let binId = lowerBinId; binId <= upperBinId; binId++) {
            const distanceFromActive = binId - activeBin;
            let weight: number;

            if (distanceFromActive <= 0) {
                // 在活跃价格下方：X代币的主要分布区域
                // 距离越远，权重递减更慢（提供更强支撑）
                weight = Math.exp(distanceFromActive * 0.05) * strategy.concentrationFactor;

                // 在高波动环境下增加下方权重
                if (volatilityInfo.high) {
                    weight *= 1.2;
                }
            } else {
                // 在活跃价格上方：较少的X代币分布
                weight = Math.exp(-distanceFromActive * 0.15) * (1 - strategy.concentrationFactor) * 0.4;
            }

            // 对冲比例影响分布
            if (strategy.hedgeRatio > 0.6) {
                weight *= (distanceFromActive <= 0) ? 1.1 : 0.9;
            }

            distribution.push(weight);
        }

        // 归一化权重
        const totalWeight = distribution.reduce((sum, w) => sum + w, 0);
        return distribution.map(w => w / totalWeight);
    }

    /**
     * 分析市场波动性
     * @param poolAddress 池地址
     */
    private async analyzeMarketVolatility(poolAddress: string): Promise<any> {
        try {
            // TODO: 实现实际的波动性分析
            // 这里应该分析历史价格数据，计算波动率

            // 模拟波动性分析
            const volatilityLevel = Math.random(); // 0-1之间的随机值

            return {
                level: volatilityLevel,
                high: volatilityLevel > 0.7,
                low: volatilityLevel < 0.3,
                trend: volatilityLevel > 0.5 ? 'increasing' : 'decreasing',
                confidence: 0.8
            };
        } catch (error) {
            await this.loggerService.logError('Module', '❌ 波动性分析失败:', error as Error);
            return {
                level: 0.5,
                high: false,
                low: false,
                trend: 'stable',
                confidence: 0.5
            };
        }
    }

    /**
     * 评估对冲需求
     * @param poolAddress 池地址
     * @param amount 头寸金额
     * @param strategy 策略配置
     */
    private async evaluateHedgeRequirement(
        poolAddress: string,
        amount: string,
        strategy: XPositionStrategy
    ): Promise<any> {
        try {
            const amountValue = parseFloat(amount);
            const poolInfo = await this.meteoraService.getPoolInfo(poolAddress);

            // 基于策略的对冲比例
            const hedgeRatio = strategy.hedgeRatio;
            const hedgeAmount = amountValue * hedgeRatio;

            // 评估风险等级
            let riskLevel = 'low';
            if (amountValue > 10000000) { // 10M+ lamports
                riskLevel = 'high';
            } else if (amountValue > 5000000) { // 5M+ lamports
                riskLevel = 'medium';
            }

            return {
                required: hedgeRatio > 0.3,
                amount: hedgeAmount.toString(),
                ratio: hedgeRatio,
                riskLevel,
                recommendation: hedgeRatio > 0.5 ? 'immediate' : 'optional',
                strategy: strategy.dynamicRebalancing ? 'dynamic' : 'static'
            };
        } catch (error) {
            await this.loggerService.logError('Module', '❌ 对冲需求评估失败:', error as Error);
            return {
                required: false,
                amount: '0',
                ratio: 0,
                riskLevel: 'unknown',
                recommendation: 'skip',
                strategy: 'none'
            };
        }
    }

    /**
     * 执行对冲策略
     * @param positionAddress 头寸地址
     * @param hedgeInfo 对冲信息
     */
    private async executeHedgeStrategy(positionAddress: string, hedgeInfo: any): Promise<void> {
        try {
            await this.loggerService.logBusinessOperation('🛡️ 执行X代币对冲策略', {
                positionAddress: positionAddress.substring(0, 8) + '...',
                hedgeAmount: hedgeInfo.amount,
                strategy: hedgeInfo.strategy
            });

            // TODO: 实现实际的对冲逻辑
            // 可能包括：
            // 1. 在其他池创建反向头寸
            // 2. 使用衍生品对冲
            // 3. 动态调整权重分布

            await this.loggerService.logSystem('WARN', '⚠️  对冲策略执行功能待实现');

        } catch (error) {
            await this.loggerService.logError('Module', '❌ 对冲策略执行失败:', error as Error);
        }
    }

    /**
     * 分析X代币头寸表现
     * @param positionAddress 头寸地址
     */
    private async analyzeXPositionPerformance(positionAddress: string): Promise<XPositionAnalytics> {
        try {
            const position = await this.positionManager.getPosition(positionAddress);
            if (!position) {
                throw new Error('头寸不存在');
            }

            // TODO: 实现实际的表现分析
            const analytics: XPositionAnalytics = {
                totalValue: parseFloat(position.totalXAmount),
                averagePrice: 0,
                hedgeEffectiveness: 0.85, // 模拟85%对冲有效性
                utilization: 0.65, // 模拟65%资金利用率
                impermanentLoss: -0.02, // 模拟-2%无常损失
                riskMetrics: {
                    volatility: 0.15, // 模拟15%波动率
                    sharpeRatio: 1.2, // 模拟1.2夏普比率
                    maxDrawdown: 0.08 // 模拟8%最大回撤
                }
            };

            return analytics;
        } catch (error) {
            await this.loggerService.logError('Module', '❌ X代币头寸分析失败:', error as Error);
            return {
                totalValue: 0,
                averagePrice: 0,
                hedgeEffectiveness: 0,
                utilization: 0,
                impermanentLoss: 0,
                riskMetrics: {
                    volatility: 0,
                    sharpeRatio: 0,
                    maxDrawdown: 0
                }
            };
        }
    }

    /**
     * 分析关闭时机
     * @param positionAddress 头寸地址
     */
    private async analyzeClosingTiming(positionAddress: string): Promise<any> {
        try {
            // TODO: 实现实际的关闭时机分析
            // 考虑因素：
            // 1. 市场趋势
            // 2. 收益状况
            // 3. 风险指标
            // 4. 流动性状况

            return {
                optimal: true,
                score: 0.8,
                reason: '市场条件良好',
                recommendation: '建议立即关闭'
            };
        } catch (error) {
            await this.loggerService.logError('Module', '❌ 关闭时机分析失败:', error as Error);
            return {
                optimal: true,
                score: 0.5,
                reason: '无法分析',
                recommendation: '可以关闭'
            };
        }
    }

    /**
     * 获取策略配置
     * @param strategyName 策略名称
     */
    private getStrategy(strategyName: string): XPositionStrategy {
        const strategy = this.defaultStrategies.find(s => s.name === strategyName);
        return strategy || this.defaultStrategies[1]; // 默认使用balanced策略
    }

    /**
     * 记录X代币头寸元数据
     */
    private async recordXPositionMetadata(positionAddress: string, metadata: any): Promise<void> {
        try {
            await this.loggerService.logSystem('DEBUG', '📝 记录X代币头寸元数据');
        } catch (error) {
            await this.loggerService.logError('Module', '❌ 记录X代币头寸元数据失败:', error as Error);
        }
    }

    // 实现基础接口方法
    async createPosition(params: any): Promise<PositionResult> {
        return this.positionManager.createPosition(params);
    }

    async closePosition(positionAddress: string): Promise<PositionResult> {
        return this.positionManager.closePosition(positionAddress);
    }

    async getPosition(positionAddress: string): Promise<PositionInfo | null> {
        return this.positionManager.getPosition(positionAddress);
    }

    async getUserPositions(userAddress: string): Promise<PositionInfo[]> {
        return this.positionManager.getUserPositions(userAddress);
    }

    async validatePosition(positionAddress: string): Promise<boolean> {
        return this.positionManager.validatePosition(positionAddress);
    }

    async refreshPosition(positionAddress: string): Promise<boolean> {
        return this.positionManager.refreshPosition(positionAddress);
    }

    async addPositionToCache(positionState: any): Promise<boolean> {
        return this.positionManager.addPositionToCache(positionState);
    }

    async removePositionState(positionAddress: string): Promise<void> {
        return this.positionManager.removePositionState(positionAddress);
    }

    // 🆕 新增的链上头寸信息获取方法
    async getPositionOnChainInfo(positionAddress: string): Promise<any> {
        return this.positionManager.getPositionOnChainInfo(positionAddress);
    }

    async getPositionWithRefresh?(positionAddress: string, fromChain?: boolean): Promise<any> {
        if (this.positionManager.getPositionWithRefresh) {
            return this.positionManager.getPositionWithRefresh(positionAddress, fromChain);
        }
        // 回退到基础方法
        return this.positionManager.getPositionOnChainInfo(positionAddress);
    }

    async getBatchPositionsOnChainInfo(positionAddresses: string[]): Promise<any> {
        return this.positionManager.getBatchPositionsOnChainInfo(positionAddresses);
    }

    /**
     * 销毁服务，清理资源
     */
    async destroy(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🧹 XPositionManager资源清理完成');
    }
} 