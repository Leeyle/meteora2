import { injectable, inject } from 'tsyringe';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import * as DLMMSdk from '@meteora-ag/dlmm';
import {
    IConfigService, ILoggerService, IMeteoraService, ISolanaWeb3Service,
    IWalletService, TYPES, ModuleConfig, ModuleHealth, ModuleMetrics
} from '../../types/interfaces';

// 流动性操作参数接口
interface LiquidityOperationParams {
    positionAddress: string;
    poolAddress: string;
    amount: number;
    liquidityMode: 'spot' | 'bidask' | 'curve'; // 支持SDK的3种策略模式
    password?: string;
    slippageBps?: number;
}

// 流动性操作结果接口
interface LiquidityOperationResult {
    success: boolean;
    signature?: string;
    error?: string;
    addedLiquidity?: string;
    gasUsed?: number;
}

/**
 * 流动性操作服务
 * 专门处理向现有头寸添加不同策略模式的流动性
 * 支持Meteora SDK的3种策略：Spot、BidAsk、Curve
 * 策略选择由调用者决定，服务本身不固定任何特定策略
 */
@injectable()
export class LiquidityOperationService {
    public readonly name = 'LiquidityOperationService';
    public readonly version = '2.0.0';
    public readonly dependencies = [
        'ConfigService', 'LoggerService', 'MeteoraService',
        'SolanaWeb3Service', 'WalletService'
    ];

    private config: any;
    private requestCount: number = 0;
    private errorCount: number = 0;

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.MeteoraService) private meteoraService: IMeteoraService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        @inject(TYPES.WalletService) private walletService: IWalletService
    ) { }

    async initialize(config: ModuleConfig): Promise<void> {
        this.config = this.configService.get('liquidityOperationService', {});
        await this.loggerService.logSystem('INFO', '✅ LiquidityOperationService初始化完成');
    }

    async start(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🚀 LiquidityOperationService启动完成');
    }

    async stop(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🛑 LiquidityOperationService已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            return {
                status: 'healthy',
                message: '流动性操作服务正常',
                timestamp: Date.now(),
                details: {
                    requestCount: this.requestCount,
                    errorCount: this.errorCount,
                    errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `流动性操作服务检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
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
     * 通用流动性添加方法
     * 支持Meteora SDK的3种策略模式：
     * - spot: 均匀分布，适合任何市场条件
     * - bidask: 直角三角形分布，资金集中在活跃价格附近
     * - curve: 反向直角三角形分布，资金集中在价格边界
     */
    async addLiquidity(params: LiquidityOperationParams): Promise<LiquidityOperationResult> {
        try {
            await this.loggerService.logBusinessOperation('🔄 开始添加流动性', {
                positionAddress: params.positionAddress.substring(0, 8) + '...',
                amount: params.amount,
                mode: params.liquidityMode.toUpperCase()
            });

            this.requestCount++;

            // 1. 验证策略模式
            if (!['spot', 'bidask', 'curve'].includes(params.liquidityMode)) {
                throw new Error(`不支持的流动性策略模式: ${params.liquidityMode}。支持的模式: spot, bidask, curve`);
            }

            // 2. 获取钱包
            const wallet = await this.getWallet(params.password);

            // 3. 获取头寸信息以获得实际的bin范围
            const positionInfo = await this.getPositionInfo(params.positionAddress, params.poolAddress);

            await this.loggerService.logSystem('DEBUG',
                `头寸bin范围: [${positionInfo.lowerBinId}, ${positionInfo.upperBinId}], 包含${positionInfo.binCount}个bin`);

            // 4. 转换金额为最小单位（lamports）
            const amountInLamports = Math.floor(params.amount * Math.pow(10, 9)); // SOL精度为9
            const totalAmount = new BN(amountInLamports);

            // 5. 执行流动性添加，让SDK根据策略类型处理分布
            const result = await this.executeLiquidityAddition(
                params.positionAddress,
                params.poolAddress,
                positionInfo,
                totalAmount,
                wallet,
                params.slippageBps || 500,
                params.liquidityMode
            );

            if (result.success) {
                await this.loggerService.logBusinessOperation('✅ 流动性添加成功', {
                    positionAddress: params.positionAddress,
                    strategy: params.liquidityMode.toUpperCase(),
                    addedLiquidity: params.amount
                });
            }

            return result;

        } catch (error) {
            this.errorCount++;
            const errorMsg = `流动性添加失败: ${error instanceof Error ? error.message : String(error)}`;
            await this.loggerService.logError('Module', errorMsg, error as Error);

            return {
                success: false,
                error: errorMsg,
                addedLiquidity: '0',
                gasUsed: 0
            };
        }
    }

    /**
     * 添加Spot模式流动性
     * Spot策略：均匀分布，适合任何市场条件，最直接的策略
     */
    async addSpotLiquidity(params: LiquidityOperationParams): Promise<LiquidityOperationResult> {
        return this.addLiquidity({ ...params, liquidityMode: 'spot' });
    }

    /**
     * 添加BidAsk模式流动性
     * BidAsk策略：直角三角形分布，资金集中在活跃价格附近
     */
    async addBidAskLiquidity(params: LiquidityOperationParams): Promise<LiquidityOperationResult> {
        return this.addLiquidity({ ...params, liquidityMode: 'bidask' });
    }

    /**
     * 添加Curve模式流动性
     * Curve策略：反向直角三角形分布，资金集中在价格边界，适合连锁头寸策略
     */
    async addCurveLiquidity(params: LiquidityOperationParams): Promise<LiquidityOperationResult> {
        return this.addLiquidity({ ...params, liquidityMode: 'curve' });
    }

    /**
     * 执行流动性添加操作
     * 根据策略模式调用对应的SDK策略类型
     */
    private async executeLiquidityAddition(
        positionAddress: string,
        poolAddress: string,
        positionInfo: any,
        totalAmount: BN,
        wallet: Keypair,
        slippageBps: number,
        mode: 'spot' | 'bidask' | 'curve'
    ): Promise<LiquidityOperationResult> {
        try {
            const connection = this.solanaService.getConnection();
            const positionPublicKey = new PublicKey(positionAddress);

            await this.loggerService.logSystem('DEBUG', `准备添加流动性，总金额: ${totalAmount.toString()}`);

            // 1. 创建DLMM池实例
            const DLMMSdk = await import('@meteora-ag/dlmm');
            const poolPublicKey = new PublicKey(positionInfo.poolAddress);
            const dlmmPool = await DLMMSdk.default.create(connection, poolPublicKey);

            await this.loggerService.logSystem('DEBUG', `总流动性金额: ${totalAmount.toString()}`);
            await this.loggerService.logSystem('DEBUG', `总流动性金额(SOL): ${totalAmount.toNumber() / 1000000000}`);

            // 2. 根据策略模式映射到SDK策略类型
            let strategyType: any;
            let strategyDescription: string;

            switch (mode) {
                case 'spot':
                    strategyType = DLMMSdk.StrategyType.Spot;
                    strategyDescription = 'Spot策略（均匀分布）';
                    break;
                case 'bidask':
                    strategyType = DLMMSdk.StrategyType.BidAsk;
                    strategyDescription = 'BidAsk策略（直角三角形分布）';
                    break;
                case 'curve':
                    strategyType = DLMMSdk.StrategyType.Curve;
                    strategyDescription = 'Curve策略（反向直角三角形分布）';
                    break;
                default:
                    throw new Error(`未知的策略模式: ${mode}`);
            }

            await this.loggerService.logSystem('DEBUG', `✅ 使用${strategyDescription}`);

            // 调试：显示传递给SDK的所有参数（合并为单行）
            await this.loggerService.logSystem('DEBUG',
                `🔍 SDK参数: 头寸:${positionPublicKey.toString().substring(0, 8)}... 金额:${(totalAmount.toNumber() / 1000000000).toFixed(1)}SOL 范围:[${positionInfo.lowerBinId},${positionInfo.upperBinId}] 滑点:${(slippageBps / 100).toFixed(1)}%`
            );

            // 3. 执行添加流动性操作 - SDK会根据策略类型自动处理分布
            const addLiquidityTx = await dlmmPool.addLiquidityByStrategy({
                positionPubKey: positionPublicKey,
                user: wallet.publicKey,
                totalXAmount: new BN(0), // 我们只添加Y代币
                totalYAmount: totalAmount,
                strategy: {
                    maxBinId: positionInfo.upperBinId,
                    minBinId: positionInfo.lowerBinId,
                    strategyType: strategyType,
                },
                slippage: slippageBps / 10000, // 转换为小数
            });

            // 4. 发送交易
            const result = await this.solanaService.sendTransaction(addLiquidityTx, {
                signers: [wallet]
            });

            if (!result.success) {
                throw new Error(`交易发送失败: ${result.error}`);
            }

            // 🔥 使用便捷方法：同时记录业务操作和系统日志
            await this.loggerService.logBusinessOperationWithEcho(
                '💧 流动性添加完成',
                {
                    positionAddress: positionAddress.substring(0, 8) + '...',
                    strategy: strategyDescription,
                    signature: result.signature
                },
                `✅ ${strategyDescription}流动性添加成功! 交易签名: ${result.signature}`
            );

            return {
                success: true,
                signature: result.signature,
                addedLiquidity: totalAmount.toString(),
                gasUsed: 0 // TODO: 可以从交易结果中获取实际gas使用量
            };

        } catch (error) {
            const errorMsg = `流动性添加失败: ${error instanceof Error ? error.message : String(error)}`;
            await this.loggerService.logSystem('ERROR', errorMsg);

            return {
                success: false,
                error: errorMsg,
                addedLiquidity: '0',
                gasUsed: 0
            };
        }
    }

    /**
     * 获取钱包实例
     */
    private async getWallet(password?: string): Promise<Keypair> {
        if (this.walletService.isWalletUnlocked()) {
            const wallet = this.walletService.getCurrentKeypair();
            if (!wallet) {
                throw new Error('钱包未正确解锁');
            }
            return wallet;
        } else {
            if (!password) {
                throw new Error('钱包未解锁，请提供密码');
            }
            const unlockSuccess = await this.walletService.unlock(password);
            if (!unlockSuccess) {
                throw new Error('钱包解锁失败，请检查密码');
            }
            const wallet = this.walletService.getCurrentKeypair();
            if (!wallet) {
                throw new Error('钱包解锁后获取失败');
            }
            return wallet;
        }
    }

    /**
     * 获取头寸详细信息
     * 获取头寸的实际bin范围，用于策略计算
     */
    private async getPositionInfo(positionAddress: string, poolAddress: string): Promise<any> {
        try {
            await this.loggerService.logSystem('DEBUG', `获取头寸信息: ${positionAddress}, 池: ${poolAddress}`);

            // 1. 动态导入DLMM SDK
            const DLMMSdk = await import('@meteora-ag/dlmm');
            const connection = this.solanaService.getConnection();
            const poolPublicKey = new PublicKey(poolAddress);
            const dlmmPool = await DLMMSdk.default.create(connection, poolPublicKey);

            // 2. 获取头寸详细信息
            const positionPublicKey = new PublicKey(positionAddress);
            const position = await dlmmPool.getPosition(positionPublicKey);
            if (!position) {
                throw new Error('无法获取头寸详细信息');
            }

            // 3. 解析头寸数据，获取头寸的bin范围
            const positionData = position.positionData;
            const binData = positionData.positionBinData || [];

            if (binData.length === 0) {
                throw new Error('头寸没有bin数据，可能已经关闭或为空');
            }

            const binIds = binData.map((bin: any) => bin.binId);

            // 计算头寸的实际bin范围
            const lowerBinId = Math.min(...binIds);
            const upperBinId = Math.max(...binIds);

            // 获取代币精度信息
            const tokenYDecimals = dlmmPool.tokenY.mint.decimals;

            const positionInfo = {
                address: positionAddress,
                poolAddress: poolAddress,
                lowerBinId: lowerBinId,
                upperBinId: upperBinId,
                tokenDecimals: tokenYDecimals,
                owner: positionData.owner.toString(),
                totalXAmount: positionData.totalXAmount?.toString() || '0',
                totalYAmount: positionData.totalYAmount?.toString() || '0',
                binIds: binIds,
                binCount: binIds.length
            };

            await this.loggerService.logSystem('DEBUG',
                `✅ 头寸bin范围获取成功: [${lowerBinId}, ${upperBinId}], 包含${binIds.length}个bin`);

            return positionInfo;

        } catch (error) {
            await this.loggerService.logError('Module', '❌ 获取头寸信息失败:', error as Error);
            throw new Error(`无法获取头寸信息: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 销毁服务，清理资源
     */
    async destroy(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🧹 LiquidityOperationService资源清理完成');
    }
} 