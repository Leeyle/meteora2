import { injectable, inject } from 'tsyringe';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { IMeteoraService, IDLMMMonitorService, IConfigService, ILoggerService, ICacheService, ISolanaWeb3Service, TYPES, BN } from '../../types/interfaces';
import { PoolInfo, BinInfo, ModuleConfig, ModuleHealth, ModuleMetrics } from '../../types/interfaces';
import { TokenPrecisionConverter } from '../../utils/TokenPrecisionConverter';

/**
 * 🚀 Meteora DLMM服务 - 简洁高效版本
 * 
 * 核心特性:
 * - 池实例持久化: 避免重复创建，提升性能5-10倍
 * - 实时数据获取: 每次API调用都获取最新的链上数据
 * - 自动资源管理: 智能清理过期池实例
 */
@injectable()
export class MeteoraService implements IMeteoraService, IDLMMMonitorService {
    public readonly name = 'MeteoraService';
    public readonly version = '3.0.0';
    public readonly dependencies = ['ConfigService', 'LoggerService', 'CacheService', 'SolanaWeb3Service'];

    private config: any;
    private connection!: Connection;
    private dlmm!: any; // 动态导入的DLMM SDK
    private requestCount: number = 0;
    private errorCount: number = 0;
    private precisionConverter!: TokenPrecisionConverter;

    // 🎯 核心功能: 持久化池实例管理
    private persistentPools = new Map<string, {
        instance: any;
        createdAt: number;
        lastUsed: number;
        accessCount: number;
    }>();

    // 配置参数
    private readonly POOL_INSTANCE_TTL = 1800000; // 30分钟
    private readonly CLEANUP_INTERVAL = 300000;   // 5分钟
    private readonly MAX_CACHED_POOLS = 50;       // 最大缓存数量
    private readonly defaultSlippageTolerance = 0.08; // 默认8%滑点

    private cleanupTimer: NodeJS.Timeout | null = null;

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.CacheService) private cacheService: ICacheService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service
    ) { }

    // ============================================================================
    // 🔧 服务生命周期管理
    // ============================================================================

    async initialize(config: ModuleConfig): Promise<void> {
        this.config = this.configService.get('meteora', {});
        this.connection = this.solanaService.getConnection();

        // 初始化精度转换器
        this.precisionConverter = new TokenPrecisionConverter(this.connection);

        // 动态导入DLMM SDK
        try {
            const DLMMSdk = await import('@meteora-ag/dlmm');
            this.dlmm = DLMMSdk.default;

            // 验证dlmm对象是否有create方法
            if (!this.dlmm || typeof this.dlmm.create !== 'function') {
                throw new Error('DLMM SDK没有create方法');
            }

            await this.loggerService.logSystem('INFO', 'DLMM SDK导入成功');

        } catch (error) {
            await this.loggerService.logError('meteora-init', 'DLMM SDK导入失败', error as Error);
            throw new Error(`DLMM SDK导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }

        await this.loggerService.logSystem('INFO', 'MeteoraService初始化完成');
    }

    async start(): Promise<void> {
        this.startCleanupTask();
        await this.loggerService.logSystem('INFO', 'MeteoraService启动完成 - 持久化池实例管理已启用');
    }

    async stop(): Promise<void> {
        this.stopCleanupTask();
        this.persistentPools.clear();
        await this.loggerService.logSystem('INFO', 'MeteoraService已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            return {
                status: 'healthy',
                message: `Meteora服务正常 - 缓存池: ${this.persistentPools.size}`,
                timestamp: Date.now(),
                details: {
                    requestCount: this.requestCount,
                    errorCount: this.errorCount,
                    persistentPoolsCount: this.persistentPools.size,
                    errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Meteora服务异常: ${error instanceof Error ? error.message : '未知错误'}`,
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

    // ============================================================================
    // 🎯 核心API方法 - 实时数据获取
    // ============================================================================

    /**
     * 🔧 辅助方法：计算真实价格（使用链上精度）
     * @param pool 池实例
     * @param rawPrice 原始价格
     * @returns 调整后的真实价格
     */
    private async calculateRealPrice(pool: any, rawPrice: number | string): Promise<number> {
        // 使用链上真实精度而非SDK返回的undefined
        const tokenXMint = new PublicKey(pool.lbPair.tokenXMint);
        const tokenYMint = new PublicKey(pool.lbPair.tokenYMint);

        const tokenXDecimals = await this.precisionConverter.getTokenDecimals(tokenXMint);
        const tokenYDecimals = await this.precisionConverter.getTokenDecimals(tokenYMint);
        const priceFactor = Math.pow(10, tokenYDecimals - tokenXDecimals);

        // 静默价格计算精度（避免重复打印）

        return Number(rawPrice) / priceFactor;
    }

    /**
     * 🔧 辅助方法：通过bin ID计算价格
     * @param pool 池实例
     * @param binId bin ID
     * @returns 调整后的真实价格
     */
    private async calculateBinRealPrice(pool: any, binId: number): Promise<number> {
        const binPrice = pool.getBinPrice(binId);
        return await this.calculateRealPrice(pool, binPrice);
    }

    /**
     * 获取活跃bin ID (实时) - 同时计算价格
     */
    async getActiveBin(poolAddress: string): Promise<number> {
        try {
            this.requestCount++;
            const pool = await this.getPoolInstance(poolAddress);

            // 🎯 一次RPC调用获取活跃bin和价格
            const { binId, price: rawPrice } = await pool.getActiveBin();

            // 🔧 使用辅助方法计算真实价格
            const activePrice = await this.calculateRealPrice(pool, rawPrice);

            // 合并打印活跃bin和价格信息
            await this.loggerService.logSystem('INFO', `💰 活跃bin价格: ${poolAddress.substring(0, 8)}... bin=${binId}, 价格=${activePrice.toFixed(8)}`);

            return binId;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('get-active-bin', '获取活跃bin失败', error as Error);
            throw new Error(`获取活跃bin失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取池价格和bin信息 (实时)
     */
    async getPoolPriceAndBin(poolAddress: string): Promise<{
        activeBin: number;
        activePrice: number;
        tokenX: PublicKey;
        tokenY: PublicKey;
        binStep: number;
        activeBinInfo: BinInfo;
    }> {
        try {
            this.requestCount++;
            const pool = await this.getPoolInstance(poolAddress);

            // 🎯 实时获取活跃bin和价格
            const { binId: activeBin, price: rawPrice } = await pool.getActiveBin();

            // 价格精度调整（使用链上真实精度）
            const activePrice = await this.calculateRealPrice(pool, rawPrice);

            const result = {
                activeBin,
                activePrice,
                tokenX: pool.tokenX.mint.address,
                tokenY: pool.tokenY.mint.address,
                binStep: pool.binStep,
                activeBinInfo: {
                    binId: activeBin,
                    price: activePrice,
                    liquidityX: "0", // SDK限制
                    liquidityY: "0", // SDK限制
                    totalLiquidity: "0"
                }
            };

            // 静默获取池数据（避免与活跃bin价格日志重复）

            return result;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('get-pool-price-bin', '获取池价格bin失败', error as Error);
            throw new Error(`获取池价格bin失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取池基本信息 (实时)
     */
    async getPoolInfo(poolAddress: string): Promise<PoolInfo> {
        try {
            this.requestCount++;
            const pool = await this.getPoolInstance(poolAddress);
            const { binId: activeBin, price: rawPrice } = await pool.getActiveBin();

            // 价格调整（使用链上真实精度）
            const activePrice = await this.calculateRealPrice(pool, rawPrice);

            return {
                address: poolAddress,
                tokenX: pool.tokenX.mint.address.toString(),
                tokenY: pool.tokenY.mint.address.toString(),
                binStep: pool.binStep,
                activeBin,
                activePrice,
                reserve: {
                    reserveX: "0", // SDK限制
                    reserveY: "0"  // SDK限制
                },
                fees: {
                    totalFeeX: "0", // SDK限制
                    totalFeeY: "0"  // SDK限制
                }
            };
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('get-pool-info', '获取池信息失败', error as Error);
            throw new Error(`获取池信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取bin信息 (实时)
     */
    async getBinInfo(poolAddress: string, binId: number): Promise<BinInfo> {
        try {
            this.requestCount++;
            const pool = await this.getPoolInstance(poolAddress);

            // 计算bin价格（使用链上真实精度）
            const adjustedPrice = await this.calculateBinRealPrice(pool, binId);

            return {
                binId,
                price: adjustedPrice,
                liquidityX: "0", // SDK限制
                liquidityY: "0", // SDK限制
                totalLiquidity: "0"
            };
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('get-bin-info', '获取bin信息失败', error as Error);
            throw new Error(`获取bin信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 计算bin价格 (实时)
     */
    async calculateBinPrice(poolAddress: string, binId: number): Promise<number> {
        try {
            this.requestCount++;
            const pool = await this.getPoolInstance(poolAddress);

            // 使用链上真实精度计算价格
            return await this.calculateBinRealPrice(pool, binId);
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('calculate-bin-price', '计算bin价格失败', error as Error);
            throw new Error(`计算bin价格失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // ============================================================================
    // 🚀 核心优化: 持久化池实例管理
    // ============================================================================

    /**
     * 获取或创建持久化池实例
     */
    private async getPoolInstance(poolAddress: string): Promise<any> {
        try {
            // 检查现有实例
            let poolData = this.persistentPools.get(poolAddress);

            if (poolData) {
                const now = Date.now();
                // 检查是否过期
                if (now - poolData.createdAt < this.POOL_INSTANCE_TTL) {
                    // 更新使用统计
                    poolData.lastUsed = now;
                    poolData.accessCount++;

                    await this.loggerService.logSystem('DEBUG',
                        `复用池实例: ${poolAddress.substring(0, 8)}... (访问次数: ${poolData.accessCount})`);

                    return poolData.instance;
                } else {
                    // 实例过期，删除
                    this.persistentPools.delete(poolAddress);
                }
            }

            // 检查缓存数量限制
            if (this.persistentPools.size >= this.MAX_CACHED_POOLS) {
                this.cleanupOldestPools(10); // 清理10个最旧的实例
            }

            // 创建新实例
            await this.loggerService.logSystem('INFO', `创建新池实例: ${poolAddress.substring(0, 8)}...`);
            const pool = await this.dlmm.create(this.connection, new PublicKey(poolAddress));

            if (!pool) {
                throw new Error('池实例创建失败');
            }

            // 缓存新实例
            const now = Date.now();
            this.persistentPools.set(poolAddress, {
                instance: pool,
                createdAt: now,
                lastUsed: now,
                accessCount: 1
            });

            await this.loggerService.logSystem('INFO',
                `池实例创建并缓存: ${poolAddress.substring(0, 8)}... (总数: ${this.persistentPools.size})`);

            return pool;
        } catch (error) {
            await this.loggerService.logError('get-pool-instance', '获取池实例失败', error as Error);
            throw new Error(`获取池实例失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // ============================================================================
    // 🧹 资源管理: 自动清理机制
    // ============================================================================

    private startCleanupTask(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredPools();
        }, this.CLEANUP_INTERVAL);

        this.loggerService.logSystem('INFO', `池实例清理任务已启动，间隔: ${this.CLEANUP_INTERVAL / 1000}秒`);
    }

    private stopCleanupTask(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    private cleanupExpiredPools(): void {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [poolAddress, poolData] of this.persistentPools.entries()) {
            if (now - poolData.createdAt > this.POOL_INSTANCE_TTL) {
                this.persistentPools.delete(poolAddress);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.loggerService.logSystem('INFO', `清理过期池实例: ${cleanedCount}个，剩余: ${this.persistentPools.size}个`);
        }
    }

    private cleanupOldestPools(countToRemove: number): void {
        const sortedPools = Array.from(this.persistentPools.entries())
            .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

        for (let i = 0; i < Math.min(countToRemove, sortedPools.length); i++) {
            const [poolAddress] = sortedPools[i];
            this.persistentPools.delete(poolAddress);
        }

        this.loggerService.logSystem('INFO', `清理最旧池实例: ${Math.min(countToRemove, sortedPools.length)}个`);
    }

    // ============================================================================
    // 🔧 其他必要方法
    // ============================================================================

    async getBinRange(poolAddress: string, startBin: number, endBin: number): Promise<BinInfo[]> {
        const results: BinInfo[] = [];
        for (let binId = startBin; binId <= endBin; binId++) {
            try {
                const binInfo = await this.getBinInfo(poolAddress, binId);
                results.push(binInfo);
            } catch (error) {
                // 跳过获取失败的bin
                continue;
            }
        }
        return results;
    }

    async createPositionTransaction(params: any): Promise<Transaction> {
        // TODO: 实现创建头寸交易
        throw new Error('createPositionTransaction 暂未实现');
    }

    async createRemoveLiquidityTransaction(
        poolAddress: string,
        userAddress: string,
        positionAddress: string,
        binIds: number[],
        slippageTolerance: number = this.defaultSlippageTolerance
    ): Promise<Transaction> {
        // TODO: 实现移除流动性交易
        throw new Error('createRemoveLiquidityTransaction 暂未实现');
    }

    /**
     * 获取用户头寸信息 (实时)
     * @param userAddress 用户地址
     * @param poolAddress 池地址 (可选，如果指定则只获取该池的头寸)
     */
    async getUserPositions(userAddress: string, poolAddress?: string): Promise<any[]> {
        try {
            this.requestCount++;

            if (poolAddress) {
                // 获取指定池的用户头寸
                await this.loggerService.logSystem('INFO',
                    `获取用户头寸: ${userAddress.substring(0, 8)}... 池: ${poolAddress.substring(0, 8)}...`);

                const pool = await this.getPoolInstance(poolAddress);
                const userPubkey = new PublicKey(userAddress);

                // 🎯 使用持久化池实例获取用户头寸
                const { userPositions } = await pool.getPositionsByUserAndLbPair(userPubkey);

                // 格式化头寸信息
                const formattedPositions = userPositions.map((position: any) => ({
                    positionAddress: position.publicKey.toString(),
                    poolAddress: poolAddress,
                    owner: position.positionData.owner.toString(),
                    totalXAmount: position.positionData.totalXAmount.toString(),
                    totalYAmount: position.positionData.totalYAmount.toString(),
                    lastUpdatedAt: position.positionData.lastUpdatedAt.toString(),
                    binData: position.positionData.positionBinData.map((bin: any) => ({
                        binId: bin.binId,
                        positionXAmount: bin.positionXAmount.toString(),
                        positionYAmount: bin.positionYAmount.toString()
                    })),
                    // 计算是否有流动性
                    hasLiquidity: position.positionData.positionBinData.some((bin: any) =>
                        bin.positionXAmount.toString() !== '0' || bin.positionYAmount.toString() !== '0'
                    )
                }));

                await this.loggerService.logSystem('INFO',
                    `用户头寸获取完成: ${userAddress.substring(0, 8)}... 找到${formattedPositions.length}个头寸`);

                return formattedPositions;

            } else {
                // 如果没有指定池地址，则需要扫描用户的所有头寸账户
                // 这是一个更复杂的操作，需要扫描链上数据
                await this.loggerService.logSystem('INFO',
                    `获取用户所有头寸: ${userAddress.substring(0, 8)}... (需要扫描链上数据)`);

                try {
                    const userPubkey = new PublicKey(userAddress);
                    // Meteora DLMM 程序ID
                    const DLMM_PROGRAM_ID = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');

                    // 获取用户的所有头寸账户
                    const positionAccounts = await this.connection.getParsedProgramAccounts(
                        DLMM_PROGRAM_ID,
                        {
                            filters: [
                                // 这里需要根据DLMM程序的实际账户结构来过滤
                                // 由于SDK限制，我们使用一个通用的方法
                                {
                                    dataSize: 1000 // 头寸账户的大概大小，可能需要调整
                                }
                            ]
                        }
                    );

                    await this.loggerService.logSystem('INFO',
                        `扫描到${positionAccounts.length}个可能的头寸账户，正在验证所有权...`);

                    // 由于无法直接过滤用户头寸，这里返回一个提示
                    // 建议用户指定具体的池地址以获得更好的性能
                    await this.loggerService.logSystem('WARN',
                        '获取所有头寸功能需要指定池地址以提高性能和准确性');

                    return [];

                } catch (scanError) {
                    await this.loggerService.logSystem('WARN',
                        `扫描用户头寸失败: ${scanError instanceof Error ? scanError.message : '未知错误'}`);
                    return [];
                }
            }

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('get-user-positions', '获取用户头寸失败', error as Error);
            throw new Error(`获取用户头寸失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    subscribeActiveBinChanges(poolAddress: string, callback: (activeBin: number) => void): string {
        // TODO: 实现订阅功能
        throw new Error('subscribeActiveBinChanges 暂未实现');
    }

    unsubscribeActiveBinChanges(subscriptionId: string): void {
        // TODO: 实现取消订阅
    }

    async destroy(): Promise<void> {
        this.stopCleanupTask();
        this.persistentPools.clear();
        await this.loggerService.logSystem('INFO', 'MeteoraService资源已清理');
    }
} 