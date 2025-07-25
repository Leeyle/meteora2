import { injectable, inject } from 'tsyringe';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
    IPositionFeeHarvester, IPositionManager, IConfigService, ILoggerService,
    IStateService, ISolanaWeb3Service, IMeteoraService, IJupiterService,
    IEventBus, TYPES, IWalletService
} from '../../types/interfaces';
import {
    ModuleConfig, ModuleHealth, ModuleMetrics, PositionInfo
} from '../../types/interfaces';

interface FeeHarvestConfig {
    autoHarvestEnabled: boolean;
    minFeeThreshold: number; // 最小收集阈值 (lamports)
    harvestInterval: number; // 收集间隔 (毫秒)
    maxGasLimit: number; // 最大gas限制
    batchSize: number; // 批量处理大小
    priorityFeeMultiplier: number; // 优先费用乘数
}

interface PositionFees {
    positionAddress: string;
    poolAddress: string;
    tokenX: {
        mint: string;
        amount: string;
        usdValue: number;
    };
    tokenY: {
        mint: string;
        amount: string;
        usdValue: number;
    };
    totalUsdValue: number;
    lastHarvested: number;
    harvestable: boolean;
}

interface HarvestResult {
    success: boolean;
    positionAddress: string;
    harvestedFees: {
        tokenX: string;
        tokenY: string;
    };
    totalUsdValue: number;
    gasUsed: number;
    signature?: string;
    error?: string;
}

/**
 * 头寸手续费收集服务 - 精简版
 * 只实现3个核心功能：
 * 1. 查看手续费信息
 * 2. 计算手续费价值（转换为Y代币等价值）
 * 3. 提取手续费
 */
@injectable()
export class PositionFeeHarvester implements IPositionFeeHarvester {
    public readonly name = 'PositionFeeHarvester';
    public readonly version = '3.0.0';
    public readonly dependencies = [
        'PositionManager', 'ConfigService', 'LoggerService', 'StateService',
        'SolanaWeb3Service', 'MeteoraService', 'JupiterService', 'EventBus', 'WalletService'
    ];

    private config!: FeeHarvestConfig; // 在initialize中初始化
    private requestCount: number = 0;
    private errorCount: number = 0;
    private totalHarvestedValue: number = 0;

    // 添加缓存机制，避免重复RPC调用
    private feeDataCache = new Map<string, {
        data: any;
        timestamp: number;
        expiryMs: number;
    }>();
    private readonly CACHE_EXPIRY_MS = 10000; // 10秒缓存，匹配监控间隔

    // 默认配置
    private readonly defaultConfig: FeeHarvestConfig = {
        autoHarvestEnabled: false, // 关闭自动收集
        minFeeThreshold: 100000, // 0.1 SOL worth
        harvestInterval: 3600000, // 1小时
        maxGasLimit: 100000,
        batchSize: 5,
        priorityFeeMultiplier: 1.5
    };

    constructor(
        @inject(TYPES.PositionManager) private positionManager: IPositionManager,
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.StateService) private stateService: IStateService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        @inject(TYPES.MeteoraService) private meteoraService: IMeteoraService,
        @inject(TYPES.JupiterService) private jupiterService: IJupiterService,
        @inject(TYPES.EventBus) private eventBus: IEventBus,
        @inject(TYPES.WalletService) private walletService: IWalletService
    ) { }

    async initialize(config: ModuleConfig): Promise<void> {
        await this.loggerService.logSystem('INFO', '🔧 PositionFeeHarvester 精简版初始化开始...');

        // 加载配置
        const userConfig = this.configService.get('feeHarvester', {});
        const directConfig = (config as any)?.feeHarvester || {};
        this.config = { ...this.defaultConfig, ...userConfig, ...directConfig };

        await this.loggerService.logSystem('INFO', `✅ PositionFeeHarvester v${this.version} 初始化完成`);
    }

    async start(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🚀 PositionFeeHarvester 启动完成');
    }

    async stop(): Promise<void> {
        await this.loggerService.logSystem('INFO', '⏹️  PositionFeeHarvester 已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        return {
            status: 'healthy',
            message: '手续费收集服务正常运行',
            timestamp: Date.now(),
            details: {
                requestCount: this.requestCount,
                errorCount: this.errorCount,
                totalHarvestedValue: this.totalHarvestedValue
            }
        };
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

    // ========================================
    // 🔍 核心功能1: 查看手续费信息
    // ========================================

    /**
     * 检查缓存是否有效
     */
    private isCacheValid(cacheKey: string): boolean {
        const cached = this.feeDataCache.get(cacheKey);
        if (!cached) return false;

        return Date.now() < cached.timestamp + cached.expiryMs;
    }

    /**
     * 获取缓存数据
     */
    private getCachedData(cacheKey: string): any | null {
        if (this.isCacheValid(cacheKey)) {
            return this.feeDataCache.get(cacheKey)?.data || null;
        }
        return null;
    }

    /**
     * 设置缓存数据
     */
    private setCacheData(cacheKey: string, data: any): void {
        this.feeDataCache.set(cacheKey, {
            data,
            timestamp: Date.now(),
            expiryMs: this.CACHE_EXPIRY_MS
        });
    }

    /**
     * 清理过期缓存
     */
    private cleanExpiredCache(): void {
        const now = Date.now();
        for (const [key, cached] of this.feeDataCache.entries()) {
            if (now >= cached.timestamp + cached.expiryMs) {
                this.feeDataCache.delete(key);
            }
        }
    }

    /**
     * 从链上获取头寸的原始手续费数据
     * @param positionAddress 头寸地址
     */
    public async getPositionFeesFromChain(positionAddress: string): Promise<{
        feeX: string;
        feeY: string;
        feeXRaw: string;
        feeYRaw: string;
        feeXExcludeTransferFee: string;
        feeYExcludeTransferFee: string;
        feeXExcludeTransferFeeRaw: string;
        feeYExcludeTransferFeeRaw: string;
        poolAddress: string;
        tokenXMint: string;
        tokenYMint: string;
        tokenXDecimals: number;
        tokenYDecimals: number;
    } | null> {
        // 🚀 优先检查缓存，避免重复RPC调用
        const cacheKey = `fee_${positionAddress}`;
        const cachedResult = this.getCachedData(cacheKey);
        if (cachedResult) {
            await this.loggerService.logSystem('DEBUG',
                `💾 收益数据缓存命中: ${positionAddress.substring(0, 8)}...`
            );
            return cachedResult;
        }

        // 清理过期缓存
        this.cleanExpiredCache();

        try {
            await this.loggerService.logSystem('INFO', `🔍 获取头寸收益: ${positionAddress.substring(0, 8)}...`);

            // 1. 获取Solana连接和头寸公钥
            const connection = this.solanaService.getConnection();
            const positionPubkey = new PublicKey(positionAddress);

            // 2. 验证头寸账户存在
            const positionAccount = await connection.getAccountInfo(positionPubkey);
            if (!positionAccount) {
                await this.loggerService.logSystem('WARN', `❌ 头寸账户不存在: ${positionAddress}`);
                return null;
            }

            // 3. 解析头寸数据获取池地址
            const positionData = positionAccount.data;
            const poolAddressBytes = positionData.slice(8, 40);
            const poolAddress = new PublicKey(poolAddressBytes);

            // 4. 动态导入Meteora DLMM SDK
            const DLMMSdk = await import('@meteora-ag/dlmm');
            let DLMMClass: any = null;

            if ((DLMMSdk as any).DLMM) {
                DLMMClass = (DLMMSdk as any).DLMM;
            } else if ((DLMMSdk as any).default) {
                DLMMClass = (DLMMSdk as any).default;
            } else {
                throw new Error('无法找到DLMM类');
            }

            const dlmmPool = await DLMMClass.create(connection, poolAddress);

            // 5. 获取头寸详细信息
            const fullPosition = await (dlmmPool as any).getPosition(positionPubkey);
            if (!fullPosition) {
                await this.loggerService.logSystem('WARN', '❌ 无法获取头寸详细信息');
                return null;
            }

            // 6. 提取收益数据
            const posData = fullPosition.positionData as any;

            const feeX = posData.feeX?.toString() || '0';
            const feeY = posData.feeY?.toString() || '0';
            const feeXRaw = posData.feeX?.toString() || '0';
            const feeYRaw = posData.feeY?.toString() || '0';
            const feeXExcludeTransferFee = posData.feeXExcludeTransferFee?.toString() || '0';
            const feeYExcludeTransferFee = posData.feeYExcludeTransferFee?.toString() || '0';
            const feeXExcludeTransferFeeRaw = posData.feeXExcludeTransferFee?.toString() || '0';
            const feeYExcludeTransferFeeRaw = posData.feeYExcludeTransferFee?.toString() || '0';

            // 获取代币信息
            const tokenXMint = (dlmmPool as any).tokenX?.mint?.toString() || '';
            const tokenYMint = (dlmmPool as any).tokenY?.mint?.toString() || '';
            const tokenXDecimals = (dlmmPool as any).tokenX?.decimals || 9;
            const tokenYDecimals = (dlmmPool as any).tokenY?.decimals || 9;

            await this.loggerService.logSystem('INFO',
                `💰 收益数据: X=${feeX}, Y=${feeY}, XExclude=${feeXExcludeTransferFee}, YExclude=${feeYExcludeTransferFee}`
            );

            const result = {
                feeX,
                feeY,
                feeXRaw,
                feeYRaw,
                feeXExcludeTransferFee,
                feeYExcludeTransferFee,
                feeXExcludeTransferFeeRaw,
                feeYExcludeTransferFeeRaw,
                poolAddress: poolAddress.toString(),
                tokenXMint,
                tokenYMint,
                tokenXDecimals,
                tokenYDecimals
            };

            // 🚀 缓存结果，避免重复RPC调用
            this.setCacheData(cacheKey, result);

            return result;

        } catch (error) {
            await this.loggerService.logError('get-position-fees-from-chain', '获取头寸收益失败', error as Error);
            return null;
        }
    }

    // ========================================
    // 💰 核心功能2: 计算Y代币等价值
    // ========================================

    /**
     * 计算总收益的Y代币等价值
     * @param tokenXAmount X代币数量（原始单位）
     * @param tokenYAmount Y代币数量（原始单位）
     * @param poolAddress 池地址
     * @param tokenXDecimals X代币精度
     * @param tokenYDecimals Y代币精度
     */
    public async calculateTotalYTokenValue(
        tokenXAmount: string,
        tokenYAmount: string,
        poolAddress: string,
        tokenXDecimals: number,
        tokenYDecimals: number
    ): Promise<number> {
        try {
            await this.loggerService.logSystem('INFO', `🧮 计算Y代币等价值: X=${tokenXAmount}, Y=${tokenYAmount}`);

            // 如果没有X代币费用，直接返回Y代币数量
            const xAmount = parseFloat(tokenXAmount);
            const yAmount = parseFloat(tokenYAmount);

            if (xAmount === 0) {
                const result = yAmount / Math.pow(10, tokenYDecimals);
                await this.loggerService.logSystem('INFO', `✅ Y代币等价值: ${result} (无X代币)`);
                return result;
            }

            // 获取池子的当前价格比率来转换X代币为Y代币
            const connection = this.solanaService.getConnection();
            const poolPubkey = new PublicKey(poolAddress);

            // 动态导入Meteora DLMM SDK
            const DLMMSdk = await import('@meteora-ag/dlmm');
            let DLMMClass: any = null;

            if ((DLMMSdk as any).DLMM) {
                DLMMClass = (DLMMSdk as any).DLMM;
            } else if ((DLMMSdk as any).default) {
                DLMMClass = (DLMMSdk as any).default;
            } else {
                throw new Error('无法找到DLMM类');
            }

            const dlmmPool = await DLMMClass.create(connection, poolPubkey);

            // 获取当前活跃bin的价格
            const activeBin = await (dlmmPool as any).getActiveBin();
            if (!activeBin) {
                await this.loggerService.logSystem('WARN', '⚠️  无法获取池价格，使用1:1比率');
                const result = (xAmount + yAmount) / Math.pow(10, tokenYDecimals);
                return result;
            }

            // 计算X代币转换为Y代币的数量
            const price = parseFloat(activeBin.price || '1');
            const xAmountInY = (xAmount / Math.pow(10, tokenXDecimals)) * price * Math.pow(10, tokenYDecimals);

            // 总Y代币等价值 = X代币转换的Y代币数量 + 原有Y代币数量
            const totalYTokenValue = (xAmountInY + yAmount) / Math.pow(10, tokenYDecimals);

            await this.loggerService.logSystem('INFO',
                `✅ Y代币等价值计算: X=${xAmount} (价格=${price}) -> Y=${xAmountInY / Math.pow(10, tokenYDecimals)}, 原Y=${yAmount / Math.pow(10, tokenYDecimals)}, 总计=${totalYTokenValue}`
            );

            return totalYTokenValue;

        } catch (error) {
            await this.loggerService.logError('calculate-total-y-token-value', '计算Y代币等价值失败', error as Error);
            // 发生错误时，简单相加（假设1:1比率）
            const xAmount = parseFloat(tokenXAmount);
            const yAmount = parseFloat(tokenYAmount);
            return (xAmount + yAmount) / Math.pow(10, tokenYDecimals);
        }
    }

    // ========================================
    // 🎯 核心功能3: 提取手续费
    // ========================================

    /**
     * 🆕 智能池子级别批量提取 - 一次性提取指定池子中所有头寸的收益
     * @param poolAddress 池子地址
     * @param positionAddresses 该池子中的头寸地址数组
     */
    async harvestPoolPositionFees(poolAddress: string, positionAddresses: string[]): Promise<HarvestResult> {
        try {
            await this.loggerService.logSystem('INFO',
                `🏊 开始池子级别批量提取: ${poolAddress.substring(0, 8)}... (${positionAddresses.length}个头寸)`
            );

            this.requestCount++;

            // 1. 验证池子和头寸
            if (!positionAddresses || positionAddresses.length === 0) {
                throw new Error('头寸地址数组不能为空');
            }

            // 2. 获取用户钱包密钥对
            const userKeypair = await this.getUserKeypair();
            if (!userKeypair) {
                throw new Error('无法获取用户钱包密钥对进行签名');
            }

            await this.loggerService.logSystem('INFO', `🔐 使用钱包签名交易: ${userKeypair.publicKey.toString().substring(0, 8)}...`);

            // 3. 获取池子中所有头寸的收益信息（用于计算总价值）
            let totalFeeX = '0';
            let totalFeeY = '0';
            let tokenXDecimals = 9;
            let tokenYDecimals = 9;

            for (const positionAddress of positionAddresses) {
                const feeInfo = await this.getPositionFeesFromChain(positionAddress);
                if (feeInfo) {
                    totalFeeX = this.addBigNumbers(totalFeeX, feeInfo.feeX);
                    totalFeeY = this.addBigNumbers(totalFeeY, feeInfo.feeY);
                    tokenXDecimals = feeInfo.tokenXDecimals;
                    tokenYDecimals = feeInfo.tokenYDecimals;
                }
            }

            // 4. 计算总收益价值
            const totalYTokenValue = await this.calculateTotalYTokenValue(
                totalFeeX,
                totalFeeY,
                poolAddress,
                tokenXDecimals,
                tokenYDecimals
            );

            if (totalYTokenValue <= 0) {
                await this.loggerService.logSystem('WARN', `池子 ${poolAddress.substring(0, 8)}... 无可提取的手续费`);
                return {
                    success: true,
                    positionAddress: `pool:${poolAddress}`,
                    harvestedFees: { tokenX: '0', tokenY: '0' },
                    totalUsdValue: 0,
                    gasUsed: 0
                };
            }

            // 5. 构建池子级别的批量提取交易
            const harvestTx = await this.buildPoolHarvestTransaction(poolAddress, positionAddresses, userKeypair);

            // 6. 设置交易签名者并发送交易
            harvestTx.feePayer = userKeypair.publicKey;
            const txResult = await this.solanaService.sendTransaction(harvestTx, { signers: [userKeypair] });

            if (!txResult.success) {
                throw new Error(`交易发送失败: ${txResult.error}`);
            }

            await this.loggerService.logSystem('INFO', `🎉 池子批量提取交易发送成功: ${txResult.signature}`);
            await this.loggerService.logSystem('INFO', `⛽ Gas费用: ${txResult.gasUsed || 0} lamports`);

            // 7. 记录提取结果
            const harvestResult: HarvestResult = {
                success: true,
                positionAddress: `pool:${poolAddress}`, // 标记为池子级别操作
                harvestedFees: {
                    tokenX: totalFeeX,
                    tokenY: totalFeeY
                },
                totalUsdValue: totalYTokenValue,
                gasUsed: txResult.gasUsed || 0,
                signature: txResult.signature
            };

            this.totalHarvestedValue += totalYTokenValue;

            await this.loggerService.logSystem('INFO',
                `✅ 池子批量提取成功: ${txResult.signature} - X:${totalFeeX}, Y:${totalFeeY}, 价值:${totalYTokenValue}`
            );

            // 发布事件
            await this.eventBus.publish('fees:pool-harvested', {
                poolAddress,
                positionAddresses,
                totalValue: totalYTokenValue,
                signature: txResult.signature
            }, 'PositionFeeHarvester');

            return harvestResult;

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('harvest-pool-position-fees', '池子批量手续费提取失败', error as Error);

            return {
                success: false,
                positionAddress: `pool:${poolAddress}`,
                harvestedFees: { tokenX: '0', tokenY: '0' },
                totalUsdValue: 0,
                gasUsed: 0,
                error: error instanceof Error ? error.message : '池子批量手续费提取失败'
            };
        }
    }

    /**
     * 手动收集指定头寸的手续费
     * @param positionAddress 头寸地址
     */
    async harvestPositionFees(positionAddress: string): Promise<HarvestResult> {
        try {
            await this.loggerService.logSystem('INFO', `🎯 开始提取手续费: ${positionAddress.substring(0, 8)}...`);

            this.requestCount++;

            // 1. 获取头寸信息
            const onChainInfo = await this.positionManager.getPositionOnChainInfo(positionAddress);
            if (!onChainInfo.success) {
                throw new Error(`头寸不存在或无法访问: ${onChainInfo.error}`);
            }

            // 2. 查询当前手续费信息
            const feeInfo = await this.getPositionFeesFromChain(positionAddress);
            if (!feeInfo) {
                throw new Error('无法获取头寸收益信息');
            }

            // 3. 计算收益价值
            const totalYTokenValue = await this.calculateTotalYTokenValue(
                feeInfo.feeX,
                feeInfo.feeY,
                feeInfo.poolAddress,
                feeInfo.tokenXDecimals,
                feeInfo.tokenYDecimals
            );

            if (totalYTokenValue <= 0) {
                throw new Error('当前头寸无可提取的手续费');
            }

            // 4. 获取用户钱包密钥对进行签名
            const userKeypair = await this.getUserKeypair();
            if (!userKeypair) {
                throw new Error('无法获取用户钱包密钥对进行签名');
            }

            await this.loggerService.logSystem('INFO', `🔐 使用钱包签名交易: ${userKeypair.publicKey.toString().substring(0, 8)}...`);

            // 5. 构建提取交易（传入用户密钥对）
            const harvestTx = await this.buildHarvestTransaction(positionAddress, feeInfo, userKeypair);

            // 6. 设置交易签名者并发送交易
            harvestTx.feePayer = userKeypair.publicKey;
            const txResult = await this.solanaService.sendTransaction(harvestTx, { signers: [userKeypair] });

            if (!txResult.success) {
                throw new Error(`交易发送失败: ${txResult.error}`);
            }

            // 🔥 使用便捷方法：同时记录业务操作和系统日志
            await this.loggerService.logBusinessOperationWithEcho(
                '💰 收益提取完成',
                {
                    positionAddress: positionAddress.substring(0, 8) + '...',
                    feeX: feeInfo.feeX,
                    feeY: feeInfo.feeY,
                    totalValue: totalYTokenValue,
                    signature: txResult.signature,
                    gasUsed: txResult.gasUsed || 0
                },
                `🎉 收益提取交易发送成功: ${txResult.signature} | Gas费用: ${txResult.gasUsed || 0} lamports`
            );

            // 7. 记录提取结果
            const harvestResult: HarvestResult = {
                success: true,
                positionAddress,
                harvestedFees: {
                    tokenX: feeInfo.feeX,
                    tokenY: feeInfo.feeY
                },
                totalUsdValue: totalYTokenValue,
                gasUsed: txResult.gasUsed || 0,
                signature: txResult.signature
            };

            this.totalHarvestedValue += totalYTokenValue;

            await this.loggerService.logSystem('INFO', `✅ 手续费提取成功: ${txResult.signature}`);

            // 发布事件
            await this.eventBus.publish('fees:harvested', {
                positionAddress,
                totalValue: totalYTokenValue,
                signature: txResult.signature
            }, 'PositionFeeHarvester');

            return harvestResult;

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('harvest-position-fees', '手续费提取失败', error as Error);

            return {
                success: false,
                positionAddress,
                harvestedFees: { tokenX: '0', tokenY: '0' },
                totalUsdValue: 0,
                gasUsed: 0,
                error: error instanceof Error ? error.message : '手续费提取失败'
            };
        }
    }

    // ========================================
    // 🔧 辅助方法
    // ========================================

    /**
     * 构建收集交易
     */
    private async buildHarvestTransaction(positionAddress: string, feeInfo: any, userKeypair: any): Promise<Transaction> {
        try {
            await this.loggerService.logSystem('INFO', `🔨 构建提取交易: ${positionAddress.substring(0, 8)}...`);

            const connection = this.solanaService.getConnection();
            const positionPubkey = new PublicKey(positionAddress);
            const poolPubkey = new PublicKey(feeInfo.poolAddress);

            await this.loggerService.logSystem('INFO', `👤 使用钱包地址: ${userKeypair.publicKey.toString().substring(0, 8)}...`);

            // 动态导入Meteora DLMM SDK
            const DLMMSdk = await import('@meteora-ag/dlmm');
            let DLMMClass: any = null;

            if ((DLMMSdk as any).DLMM) {
                DLMMClass = (DLMMSdk as any).DLMM;
            } else if ((DLMMSdk as any).default?.DLMM) {
                DLMMClass = (DLMMSdk as any).default.DLMM;
            } else if ((DLMMSdk as any).default) {
                DLMMClass = (DLMMSdk as any).default;
            } else {
                throw new Error('无法找到DLMM类');
            }

            await this.loggerService.logSystem('INFO', `📦 DLMM SDK加载成功`);

            const dlmmPool = await DLMMClass.create(connection, poolPubkey);
            await this.loggerService.logSystem('INFO', `🏊 DLMM池连接成功: ${poolPubkey.toString().substring(0, 8)}...`);

            // 获取完整的头寸信息（SDK需要完整的头寸对象）
            await this.loggerService.logSystem('INFO', `📋 获取头寸完整信息用于提取...`);
            const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(userKeypair.publicKey);
            const targetPosition = userPositions.find((pos: any) => pos.publicKey.equals(positionPubkey));

            if (!targetPosition) {
                throw new Error(`无法找到头寸 ${positionAddress} 在用户的头寸列表中`);
            }

            await this.loggerService.logSystem('INFO', `✅ 找到目标头寸，开始构建claimAllSwapFee交易...`);

            // 使用DLMM的claimAllSwapFee方法（传入头寸数组）
            const claimFeeTransaction = await dlmmPool.claimAllSwapFee({
                owner: userKeypair.publicKey,
                positions: [targetPosition] // 传递包含目标头寸的数组
            });

            if (!claimFeeTransaction) {
                throw new Error('DLMM claimAllSwapFee返回空交易');
            }

            // claimAllSwapFee可能返回单个交易或交易数组，我们需要处理这两种情况
            const transactions = Array.isArray(claimFeeTransaction) ? claimFeeTransaction : [claimFeeTransaction];
            if (transactions.length === 0) {
                throw new Error('没有生成任何收集交易');
            }

            await this.loggerService.logSystem('INFO', `✅ 收集交易构建成功，共 ${transactions.length} 个交易`);

            // 返回第一个交易（通常只有一个）
            const firstTransaction = transactions[0];
            await this.loggerService.logSystem('INFO', `🔧 交易指令数量: ${firstTransaction.instructions?.length || 0}`);

            return firstTransaction;

        } catch (error) {
            await this.loggerService.logError('build-harvest-transaction', '构建提取交易失败', error as Error);
            throw new Error(`构建收集交易失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取用户钱包密钥对
     */
    private async getUserKeypair(): Promise<any> {
        try {
            if (!this.walletService.isWalletUnlocked()) {
                throw new Error('钱包未解锁');
            }

            const keypair = this.walletService.getCurrentKeypair();
            if (!keypair) {
                throw new Error('无法获取钱包密钥对');
            }

            return keypair;

        } catch (error) {
            await this.loggerService.logError('get-user-keypair', '获取用户密钥对失败', error as Error);
            throw error;
        }
    }

    /**
     * 🆕 构建池子级别的批量收集交易
     */
    private async buildPoolHarvestTransaction(poolAddress: string, positionAddresses: string[], userKeypair: any): Promise<Transaction> {
        try {
            await this.loggerService.logSystem('INFO',
                `🔨 构建池子批量提取交易: ${poolAddress.substring(0, 8)}... (${positionAddresses.length}个头寸)`
            );

            const connection = this.solanaService.getConnection();
            const poolPubkey = new PublicKey(poolAddress);

            await this.loggerService.logSystem('INFO', `👤 使用钱包地址: ${userKeypair.publicKey.toString().substring(0, 8)}...`);

            // 动态导入Meteora DLMM SDK
            const DLMMSdk = await import('@meteora-ag/dlmm');
            let DLMMClass: any = null;

            if ((DLMMSdk as any).DLMM) {
                DLMMClass = (DLMMSdk as any).DLMM;
            } else if ((DLMMSdk as any).default?.DLMM) {
                DLMMClass = (DLMMSdk as any).default.DLMM;
            } else if ((DLMMSdk as any).default) {
                DLMMClass = (DLMMSdk as any).default;
            } else {
                throw new Error('无法找到DLMM类');
            }

            await this.loggerService.logSystem('INFO', `📦 DLMM SDK加载成功`);

            const dlmmPool = await DLMMClass.create(connection, poolPubkey);
            await this.loggerService.logSystem('INFO', `🏊 DLMM池连接成功: ${poolPubkey.toString().substring(0, 8)}...`);

            // 获取用户在该池子中的所有头寸
            await this.loggerService.logSystem('INFO', `📋 获取用户在池子中的所有头寸...`);
            const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(userKeypair.publicKey);

            // 筛选出我们要提取的头寸
            const targetPositions = userPositions.filter((pos: any) =>
                positionAddresses.includes(pos.publicKey.toString())
            );

            if (targetPositions.length === 0) {
                throw new Error(`在池子 ${poolAddress} 中未找到任何指定的头寸`);
            }

            await this.loggerService.logSystem('INFO',
                `✅ 找到 ${targetPositions.length}/${positionAddresses.length} 个目标头寸，开始构建claimAllSwapFee交易...`
            );

            // 使用DLMM的claimAllSwapFee方法（传入筛选后的头寸数组）
            const claimFeeTransaction = await dlmmPool.claimAllSwapFee({
                owner: userKeypair.publicKey,
                positions: targetPositions // 传递筛选后的头寸数组
            });

            if (!claimFeeTransaction) {
                throw new Error('DLMM claimAllSwapFee返回空交易');
            }

            // claimAllSwapFee可能返回单个交易或交易数组
            const transactions = Array.isArray(claimFeeTransaction) ? claimFeeTransaction : [claimFeeTransaction];
            if (transactions.length === 0) {
                throw new Error('没有生成任何收集交易');
            }

            await this.loggerService.logSystem('INFO', `✅ 池子批量收集交易构建成功，共 ${transactions.length} 个交易`);

            // 返回第一个交易（通常只有一个）
            const firstTransaction = transactions[0];
            await this.loggerService.logSystem('INFO', `🔧 交易指令数量: ${firstTransaction.instructions?.length || 0}`);

            return firstTransaction;

        } catch (error) {
            await this.loggerService.logError('build-pool-harvest-transaction', '构建池子批量提取交易失败', error as Error);
            throw new Error(`构建池子批量收集交易失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 大数字加法辅助方法
     */
    private addBigNumbers(a: string, b: string): string {
        return (parseFloat(a) + parseFloat(b)).toString();
    }

    // ========================================
    // 📊 接口兼容性方法（空实现）
    // ========================================

    async getAllPositionFees(): Promise<PositionFees[]> {
        await this.loggerService.logSystem('WARN', '⚠️  getAllPositionFees 方法已移除，请使用 getPositionFeesFromChain');
        return [];
    }

    async getAllHarvestablePositions(): Promise<PositionFees[]> {
        await this.loggerService.logSystem('WARN', '⚠️  getAllHarvestablePositions 方法已移除，请使用 getPositionFeesFromChain + calculateTotalYTokenValue');
        return [];
    }

    async batchHarvestFees(): Promise<HarvestResult[]> {
        await this.loggerService.logSystem('WARN', '⚠️  batchHarvestFees 方法已移除，请逐个调用 harvestPositionFees');
        return [];
    }

    async destroy(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🔄 PositionFeeHarvester 资源清理完成');
    }
} 