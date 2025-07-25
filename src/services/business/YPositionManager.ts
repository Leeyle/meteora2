import { injectable, inject } from 'tsyringe';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import * as DLMMSdk from '@meteora-ag/dlmm';
import {
    IYPositionManager, IPositionManager, IConfigService, ILoggerService,
    IMeteoraService, IJupiterService, ISolanaWeb3Service, IWalletService, TYPES, PositionResult, ModuleConfig, ModuleHealth, ModuleMetrics, CreatePositionParams, PositionInfo
} from '../../types/interfaces';

// 定义Y代币头寸创建参数
interface YPositionCreateParams extends CreatePositionParams {
    strategy?: string;
    tags?: string[];
    notes?: string;
    binRange: number;
    password?: string;
}

interface YPositionStrategy {
    name: string;
    description: string;
    binSpread: number; // bin分布策略
    concentrationFactor: number; // 集中度因子
    rebalanceThreshold: number; // 重平衡阈值
    stopLossPercentage: number; // 止损百分比
}

interface YPositionAnalytics {
    totalValue: number;
    averagePrice: number;
    priceImpact: number;
    utilizationRate: number;
    yieldEstimate: number;
    riskScore: number;
}

/**
 * Y代币头寸专用管理器
 * 专门处理单币种流动性提供策略
 * 优化Y代币在DLMM中的资金效率
 * 参考原项目: DLMM_meme_zuowan/src/y_position_strategy.py
 */
@injectable()
export class YPositionManager implements IYPositionManager {
    public readonly name = 'YPositionManager';
    public readonly version = '2.0.0';
    public readonly dependencies = [
        'PositionManager', 'ConfigService', 'LoggerService',
        'MeteoraService', 'JupiterService'
    ];

    private config: any;
    private requestCount: number = 0;
    private errorCount: number = 0;

    // Y代币策略配置
    private readonly defaultStrategies: YPositionStrategy[] = [
        {
            name: 'conservative',
            description: '保守型：广范围分布，低风险',
            binSpread: 20,
            concentrationFactor: 0.3,
            rebalanceThreshold: 0.15,
            stopLossPercentage: 0.20
        },
        {
            name: 'moderate',
            description: '平衡型：中等范围，平衡收益风险',
            binSpread: 15,
            concentrationFactor: 0.5,
            rebalanceThreshold: 0.10,
            stopLossPercentage: 0.15
        },
        {
            name: 'aggressive',
            description: '激进型：集中分布，高收益高风险',
            binSpread: 10,
            concentrationFactor: 0.7,
            rebalanceThreshold: 0.05,
            stopLossPercentage: 0.10
        }
    ];

    // Y代币专用配置
    private readonly yTokenDefaults = {
        minBinRange: 5,
        maxBinRange: 30,
        defaultBinRange: 15,
        optimalUtilizationRate: 0.8,
        rebalanceFrequency: 3600000, // 1小时
        minPositionValue: 1000000, // 1M lamports
    };

    constructor(
        @inject(TYPES.PositionManager) private positionManager: IPositionManager,
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.MeteoraService) private meteoraService: IMeteoraService,
        @inject(TYPES.JupiterService) private jupiterService: IJupiterService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        @inject(TYPES.WalletService) private walletService: IWalletService
    ) {
        if (!this.meteoraService) {
            this.loggerService.logSystem('ERROR', 'MeteoraService aT YPositionManager construction is undefined!');
        } else {
            this.loggerService.logSystem('INFO', 'MeteoraService is successfully injected into YPositionManager.');
        }
    }

    async initialize(config: ModuleConfig): Promise<void> {
        // 使用新的三层分离日志架构
        this.config = this.configService.get('yPositionManager', {});

        await this.loggerService.logSystem('INFO', '✅ YPositionManager初始化完成');
    }

    async start(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🚀 YPositionManager启动完成');
    }

    async stop(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🛑 YPositionManager已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            return {
                status: 'healthy',
                message: 'Y代币头寸管理正常',
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
                message: `Y代币头寸管理检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
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
     * 创建Y代币头寸
     * @param params Y代币头寸创建参数
     */
    async createYPosition(params: YPositionCreateParams): Promise<PositionResult> {
        try {
            await this.loggerService.logBusinessOperation('🟡 开始创建Y代币头寸', {
                poolAddress: params.poolAddress.substring(0, 8) + '...',
                amount: params.amount,
                strategy: params.strategy || 'moderate',
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
                await this.loggerService.logBusinessOperation('🔑 使用已解锁钱包', {
                    message: '使用已解锁的钱包，无需重新输入密码'
                });
            } else {
                // 钱包未解锁，需要密码
                if (!params.password) {
                    throw new Error('钱包未解锁，请提供密码');
                }
                const unlockSuccess = await this.walletService.unlock(params.password);
                if (!unlockSuccess) {
                    throw new Error('钱包解锁失败，请检查密码');
                }
                wallet = this.walletService.getCurrentKeypair()!;
                await this.loggerService.logBusinessOperation('🔓 钱包解锁成功', {
                    message: '钱包解锁成功，后续操作无需重新输入密码'
                });
            }

            // 新增：检查钱包余额
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

            // 3. 获取池信息和活跃bin - 这是正确的实现位置
            const activeBin = await this.meteoraService.getActiveBin(params.poolAddress);

            // 4. 计算Y代币头寸范围 (修正版 - 支持连锁头寸)
            let lowerBinId: number;
            let upperBinId: number;

            // 优先使用传入的精确范围参数（用于连锁头寸）
            if (params.lowerBinId !== undefined && params.upperBinId !== undefined) {
                lowerBinId = params.lowerBinId;
                upperBinId = params.upperBinId;
                await this.loggerService.logSystem('DEBUG',
                    `使用传入的精确范围: [${lowerBinId}, ${upperBinId}] (连锁头寸模式)`);
            } else {
                // 使用传统的binRange计算方式
                const effectiveBinRange = (params.binRange && params.binRange > 0)
                    ? params.binRange
                    : this.yTokenDefaults.defaultBinRange;

                [lowerBinId, upperBinId] = await this.getYPositionRange(
                    activeBin,
                    effectiveBinRange
                );
                await this.loggerService.logSystem('DEBUG',
                    `使用binRange计算范围: [${lowerBinId}, ${upperBinId}] (传统模式)`);
            }

            await this.loggerService.logBusinessOperation('📊 Y代币头寸范围计算', {
                activeBin,
                lowerBinId,
                upperBinId,
                binCount: upperBinId - lowerBinId + 1
            });

            // 5. 准备头寸参数
            const positionKeypair = Keypair.generate();
            const amountNumber = typeof params.amount === 'string' ? parseFloat(params.amount) : params.amount;

            // 修正：获取Y代币的精度，并正确转换为最小单位
            const yTokenDecimals = dlmmPool.tokenY.mint.decimals;
            const yTokenAmount = Math.floor(amountNumber * Math.pow(10, yTokenDecimals));
            const yAmount = new BN(yTokenAmount);

            await this.loggerService.logSystem('DEBUG', `Y头寸金额转换: ${amountNumber} 代币单位 = ${yTokenAmount} 最小单位 (精度: ${yTokenDecimals})`);
            const xAmount = new BN(0); // Y头寸只使用Y代币

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
                    singleSidedX: false // Y代币头寸
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

            await this.loggerService.logBusinessOperation('✅ Y代币头寸创建成功', {
                positionAddress: positionKeypair.publicKey.toString(),
                signature,
                yAmount: params.amount,
                binRange: `${lowerBinId}-${upperBinId}`
            });

            // 8. 手动更新PositionManager缓存 - 避免重复创建链上头寸
            try {
                // 创建头寸状态对象
                const positionState = {
                    address: positionKeypair.publicKey.toString(),
                    owner: wallet.publicKey.toString(),
                    poolAddress: params.poolAddress,
                    lowerBinId,
                    upperBinId,
                    binIds: Array.from({ length: upperBinId - lowerBinId + 1 }, (_, i) => lowerBinId + i),
                    totalXAmount: '0', // Y头寸只有Y代币
                    totalYAmount: yAmount.toString(),
                    fees: { feeX: '0', feeY: '0' },
                    lastUpdated: Date.now(),
                    inRange: activeBin >= lowerBinId && activeBin <= upperBinId,
                    status: 'active' as const,
                    createdAt: Date.now(),
                    metadata: {
                        strategy: params.strategy || 'moderate',
                        tags: [],
                        notes: 'Y代币单边流动性头寸'
                    }
                };

                // 调用PositionManager的公共方法来添加头寸到缓存
                const cacheSuccess = await this.positionManager.addPositionToCache(positionState);
                if (cacheSuccess) {
                    await this.loggerService.logSystem('INFO', `成功添加头寸到缓存: ${positionKeypair.publicKey.toString()}`);
                } else {
                    await this.loggerService.logSystem('WARN', `添加头寸到缓存失败: ${positionKeypair.publicKey.toString()}`);
                }

            } catch (cacheError) {
                await this.loggerService.logSystem('WARN', `更新头寸缓存失败: ${cacheError instanceof Error ? cacheError.message : '未知错误'}`);
            }

            // 9. 记录Y代币专用元数据
            const strategy = this.getStrategy(params.strategy || 'moderate');
            await this.recordYPositionMetadata(positionKeypair.publicKey.toString(), {
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
            await this.loggerService.logError('Module', '❌ Y代币头寸创建失败:', error as Error);

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Y代币头寸创建失败',
                signature: '',
                gasUsed: 0
            };
        }
    }

    /**
     * 关闭Y代币头寸 - 委托给统一的PositionManager处理
     * @param positionAddress 头寸地址
     * @param password 钱包密码（可选）
     */
    async closeYPosition(positionAddress: string, password?: string): Promise<PositionResult> {
        return this.positionManager.closePosition(positionAddress, password);
    }

    /**
     * 计算Y代币头寸的价格范围 (实现单边流动性)
     * @param activeBin 当前活跃的bin
     * @param binRange 用户期望的bin范围
     * @returns [最小bin ID, 最大bin ID] - 一个完全位于activeBin下方的范围
     */
    async getYPositionRange(activeBin: number, binRange: number): Promise<[number, number]> {
        await this.loggerService.logBusinessOperation('🔧 计算Y代币(单边)头寸范围', { activeBin, binRange });

        // 修正：为实现单边Y代币流动性，整个范围必须在当前活跃bin之下。
        // 但是上边界应该包含当前活跃bin，避免立即触发脱离条件
        const upperBinId = activeBin;  // 上边界包含当前活跃bin
        // 从活跃bin向下延伸整个binRange的宽度。
        const lowerBinId = upperBinId - binRange + 1;

        await this.loggerService.logSystem('DEBUG', `Y代币单边范围计算结果: activeBin=${activeBin}, binRange=${binRange}, lowerBinId=${lowerBinId}, upperBinId=${upperBinId}`);

        // 返回计算出的单边范围
        return [lowerBinId, upperBinId];
    }

    /**
     * 优化Y代币头寸分布
     * @param poolAddress 池地址
     * @param activeBin 活跃bin
     * @param lowerBinId 下界bin
     * @param upperBinId 上界bin
     * @param strategy 策略配置
     */
    private async optimizeYPositionRange(
        poolAddress: string,
        activeBin: number,
        lowerBinId: number,
        upperBinId: number,
        strategy: YPositionStrategy
    ): Promise<{ lowerBinId: number; upperBinId: number; distribution: number[] }> {
        try {
            await this.loggerService.logBusinessOperation('🎯 开始Y代币分布优化', {
                optimizedCount: 0,
                timestamp: Date.now()
            });

            // 1. 获取bin范围的流动性数据
            const binInfos = await this.meteoraService.getBinRange(poolAddress, lowerBinId, upperBinId);

            // 2. 分析当前流动性分布
            const liquidityAnalysis = this.analyzeLiquidityDistribution(binInfos, activeBin);

            // 3. 根据策略调整范围
            let optimizedLower = lowerBinId;
            let optimizedUpper = upperBinId;

            // 基于集中度因子调整范围
            if (strategy.concentrationFactor > 0.6) {
                // 高集中度：缩小范围，更集中在活跃价格附近
                const reduction = Math.floor((upperBinId - lowerBinId) * 0.2);
                optimizedLower = Math.max(lowerBinId + reduction, activeBin - 5);
                optimizedUpper = Math.min(upperBinId - reduction, activeBin + 15);
            } else if (strategy.concentrationFactor < 0.4) {
                // 低集中度：扩大范围，更分散的分布
                const expansion = Math.floor((upperBinId - lowerBinId) * 0.1);
                optimizedLower = lowerBinId - expansion;
                optimizedUpper = upperBinId + expansion;
            }

            // 4. 计算Y代币专用的分布权重
            const distribution = this.calculateYTokenDistribution(
                optimizedLower,
                optimizedUpper,
                activeBin,
                strategy
            );

            await this.loggerService.logBusinessOperation('✅ Y代币分布优化完成', {
                totalOptimized: 0,
                timestamp: Date.now()
            });

            return {
                lowerBinId: optimizedLower,
                upperBinId: optimizedUpper,
                distribution
            };

        } catch (error) {
            await this.loggerService.logError('Module', '❌ Y代币分布优化失败:', error as Error);

            // 返回原始范围作为备选
            return {
                lowerBinId,
                upperBinId,
                distribution: []
            };
        }
    }

    /**
     * 计算Y代币分布权重
     * @param lowerBinId 下界
     * @param upperBinId 上界
     * @param activeBin 活跃bin
     * @param strategy 策略
     */
    private calculateYTokenDistribution(
        lowerBinId: number,
        upperBinId: number,
        activeBin: number,
        strategy: YPositionStrategy
    ): number[] {
        const distribution: number[] = [];
        const totalBins = upperBinId - lowerBinId + 1;

        for (let binId = lowerBinId; binId <= upperBinId; binId++) {
            const distanceFromActive = binId - activeBin;
            let weight: number;

            if (distanceFromActive >= 0) {
                // 在活跃价格上方：Y代币的主要分布区域
                // 使用指数衰减，距离越远权重越小
                weight = Math.exp(-distanceFromActive * 0.1) * strategy.concentrationFactor;
            } else {
                // 在活跃价格下方：较少的Y代币分布
                weight = Math.exp(distanceFromActive * 0.2) * (1 - strategy.concentrationFactor) * 0.3;
            }

            distribution.push(weight);
        }

        // 归一化权重
        const totalWeight = distribution.reduce((sum, w) => sum + w, 0);
        return distribution.map(w => w / totalWeight);
    }

    /**
     * 分析流动性分布
     * @param binInfos bin信息数组
     * @param activeBin 活跃bin
     */
    private analyzeLiquidityDistribution(binInfos: any[], activeBin: number): any {
        const totalLiquidity = binInfos.reduce((sum, bin) => {
            return sum + parseFloat(bin.totalLiquidity || '0');
        }, 0);

        const activeBinInfo = binInfos.find(bin => bin.binId === activeBin);
        const activeBinLiquidity = parseFloat(activeBinInfo?.totalLiquidity || '0');

        const liquidityConcentration = activeBinLiquidity / totalLiquidity;

        return {
            totalLiquidity,
            activeBinLiquidity,
            liquidityConcentration,
            distributionSpread: binInfos.length,
            avgLiquidityPerBin: totalLiquidity / binInfos.length
        };
    }

    /**
     * 分析Y代币头寸表现
     * @param positionAddress 头寸地址
     */
    private async analyzeYPositionPerformance(positionAddress: string): Promise<YPositionAnalytics> {
        try {
            const position = await this.positionManager.getPosition(positionAddress);
            if (!position) {
                throw new Error('头寸不存在');
            }

            // 实现Y代币头寸收益分析
            const analytics: YPositionAnalytics = {
                totalValue: parseFloat(position.totalYAmount),
                averagePrice: 0,
                priceImpact: 0,
                utilizationRate: 0.75, // 模拟数据
                yieldEstimate: 0.05, // 模拟5%收益
                riskScore: 0.3 // 模拟风险分数
            };

            return analytics;
        } catch (error) {
            await this.loggerService.logError('Module', '❌ Y代币头寸分析失败:', error as Error);
            return {
                totalValue: 0,
                averagePrice: 0,
                priceImpact: 0,
                utilizationRate: 0,
                yieldEstimate: 0,
                riskScore: 1
            };
        }
    }

    /**
     * 获取策略配置
     * @param strategyName 策略名称
     */
    private getStrategy(strategyName: string): YPositionStrategy {
        const strategy = this.defaultStrategies.find(s => s.name === strategyName);
        return strategy || this.defaultStrategies[1]; // 默认使用moderate策略
    }

    /**
     * 记录Y代币头寸元数据
     * @param positionAddress 头寸地址
     * @param metadata 元数据
     */
    private async recordYPositionMetadata(positionAddress: string, metadata: any): Promise<void> {
        try {
            // 保存Y代币专用的元数据
            await this.loggerService.logSystem('DEBUG', '📝 记录Y代币头寸元数据');
        } catch (error) {
            await this.loggerService.logError('Module', '❌ 记录Y代币头寸元数据失败:', error as Error);
        }
    }

    // 实现基础接口方法
    async createPosition(params: any): Promise<PositionResult> {
        return this.positionManager.createPosition(params);
    }

    async closePosition(positionAddress: string, password?: string): Promise<PositionResult> {
        return this.positionManager.closePosition(positionAddress, password);
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

    async addPositionToCache(positionState: any): Promise<boolean> {
        return this.positionManager.addPositionToCache(positionState);
    }

    async refreshPosition(positionAddress: string): Promise<boolean> {
        return this.positionManager.refreshPosition(positionAddress);
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
        await this.loggerService.logSystem('INFO', '🧹 YPositionManager资源清理完成');
    }
} 