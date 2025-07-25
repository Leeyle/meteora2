import { injectable, inject } from 'tsyringe';
import { PublicKey } from '@solana/web3.js';
import {
    IConfigService, ILoggerService, IMeteoraService, ISolanaWeb3Service,
    IWalletService, IYPositionManager, TYPES, ModuleConfig, ModuleHealth,
    ModuleMetrics, PositionResult, IService
} from '../../types/interfaces';
import { LiquidityOperationService } from './LiquidityOperationService';
import { SynchronousRetryManager } from '../modules/SynchronousRetryManager';

// 连锁头寸创建参数接口
export interface ChainPositionParams {
    poolAddress: string;
    totalAmount: number;
    slippageBps?: number;
    password?: string;
}

// 连锁头寸范围计算结果
export interface ChainPositionRanges {
    activeBin: number;
    position1Lower: number;
    position1Upper: number;
    position2Lower: number;
    position2Upper: number;
    totalBinCount: number;
    validated: boolean;
}

// 连锁头寸创建结果
export interface ChainPositionResult {
    success: boolean;
    position1Address?: string;
    position2Address?: string;
    position1Signature?: string;
    position2BaseSignature?: string;
    position2CurveSignature?: string;
    totalBinRange?: [number, number];
    fundingAllocation?: {
        position1: number;
        position2Base: number;
        position2Curve: number;
    };
    error?: string;
    gasUsed?: number;
}

/**
 * 连锁头寸管理器
 * 实现连锁头寸创建方法：通过创建两个连续的69个bin头寸，
 * 形成完整的138个bin范围覆盖，采用差异化资金分配和流动性分布策略
 * 
 * 核心特性：
 * - 两个连续头寸：每个头寸覆盖69个bin
 * - 无缝连接：头寸间无重叠、无间隙
 * - 完整覆盖：总共138个bin的连续价格范围
 * - 差异化策略：不同头寸采用不同的资金分配和流动性模式
 * 
 * 资金分配策略：
 * - 头寸1 (高价格范围): 20%资金，BidAsk模式
 * - 头寸2 (低价格范围): 80%资金，BidAsk基础60% + Curve追加20%
 */
@injectable()
export class ChainPositionManager implements IService {
    public readonly name = 'ChainPositionManager';
    public readonly version = '2.0.0';
    public readonly dependencies = [
        'ConfigService', 'LoggerService', 'MeteoraService',
        'YPositionManager', 'LiquidityOperationService'
    ];

    private config: any;
    private requestCount: number = 0;
    private errorCount: number = 0;

    // 连锁头寸策略常量
    private readonly CHAIN_POSITION_CONFIG = {
        SINGLE_POSITION_BIN_COUNT: 69,
        TOTAL_BIN_COUNT: 138,
        POSITION_COUNT: 2,
        FUNDING_ALLOCATION: {
            POSITION1_PERCENTAGE: 0.2,      // 20%
            POSITION2_BASE_PERCENTAGE: 0.6,  // 60%
            POSITION2_CURVE_PERCENTAGE: 0.2  // 20%
        }
    };

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.MeteoraService) private meteoraService: IMeteoraService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service,
        @inject(TYPES.WalletService) private walletService: IWalletService,
        @inject(TYPES.YPositionManager) private yPositionManager: IYPositionManager,
        @inject(LiquidityOperationService) private liquidityOperationService: LiquidityOperationService,
        @inject(TYPES.SynchronousRetryManager) private synchronousRetryManager: SynchronousRetryManager
    ) { }

    async initialize(config: ModuleConfig): Promise<void> {
        this.config = this.configService.get('chainPositionManager', {});
        await this.loggerService.logSystem('INFO', '✅ ChainPositionManager初始化完成');
    }

    async start(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🚀 ChainPositionManager启动完成');
    }

    async stop(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🛑 ChainPositionManager已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            return {
                status: 'healthy',
                message: '连锁头寸管理正常',
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
                message: `连锁头寸管理检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
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
     * 创建连锁头寸 - 带重试机制的修复版本
     * 按照指南文档的精确算法创建两个连续的69个bin头寸
     * 
     * 修复逻辑：
     * 1. 部分成功场景：1个头寸成功 + 1个头寸失败 → 关闭成功的头寸 → 重试创建连锁头寸
     * 2. 全部失败场景：2个头寸都失败 → 无需关闭 → 直接使用标准重试模块重试
     */
    async createChainPosition(params: ChainPositionParams): Promise<ChainPositionResult> {
        // 设置连锁头寸创建的重试参数
        const retryConfig = {
            maxAttempts: 3,
            retryableErrors: [
                '头寸1创建失败', '头寸2基础创建失败', '连锁头寸创建失败',
                '交易验证超时', '交易失败', 'RPC_ERROR', 'NETWORK_ERROR',
                'SLIPPAGE_ERROR', 'failed to get info about account',
                '连锁头寸创建部分失败'
            ],
            delayMs: 15000 // 15秒间隔
        };

        return await this.synchronousRetryManager.executeAsyncWithRetry(
            {
                execute: async () => {
                    return await this.createChainPositionInternal(params);
                }
            },
            'chain.position.create',
            (params as any).instanceId || 'unknown',
            retryConfig
        );
    }

    /**
     * 内部连锁头寸创建逻辑 - 带部分成功恢复机制
     */
    private async createChainPositionInternal(params: ChainPositionParams): Promise<ChainPositionResult> {
        try {
            await this.loggerService.logBusinessOperation('🔗 开始创建连锁头寸', {
                poolAddress: params.poolAddress.substring(0, 8) + '...',
                totalAmount: params.totalAmount
            });

            this.requestCount++;

            // 1. 参数验证与范围计算
            const ranges = await this.calculateChainPositionRanges(params.poolAddress);
            if (!ranges.validated) {
                throw new Error('连锁头寸范围计算验证失败');
            }

            await this.loggerService.logBusinessOperation('📊 连锁头寸范围计算完成', {
                activeBin: ranges.activeBin,
                position1Range: `[${ranges.position1Lower}, ${ranges.position1Upper}]`,
                position2Range: `[${ranges.position2Lower}, ${ranges.position2Upper}]`,
                totalBins: ranges.totalBinCount
            });

            // 2. 资金分配计算
            const fundingAllocation = this.calculateFundingAllocation(params.totalAmount);

            await this.loggerService.logBusinessOperation('💰 资金分配策略', {
                position1Amount: fundingAllocation.position1,
                position2BaseAmount: fundingAllocation.position2Base,
                position2CurveAmount: fundingAllocation.position2Curve,
                totalAmount: params.totalAmount
            });

            // 3. 并行创建头寸1和头寸2基础部分（优化性能）
            const [position1Result, position2BaseResult] = await Promise.all([
                this.createPosition1(params, ranges, fundingAllocation.position1),
                this.createPosition2Base(params, ranges, fundingAllocation.position2Base)
            ]);

            // 🔧 修复：检查部分成功场景并进行恢复
            const position1Success = position1Result.success;
            const position2Success = position2BaseResult.success;

            if (position1Success && position2Success) {
                // 两个头寸都成功 - 继续正常流程
                await this.loggerService.logBusinessOperation('[CHAIN-POSITION-RETRY] ✅ 两个头寸都创建成功', {
                    position1Address: position1Result.positionAddress,
                    position2Address: position2BaseResult.positionAddress
                });
            } else if (!position1Success && !position2Success) {
                // 两个头寸都失败 - 抛出异常让重试机制处理
                await this.loggerService.logBusinessOperation('[CHAIN-POSITION-RETRY] ❌ 两个头寸都创建失败，触发重试', {
                    position1Error: position1Result.error,
                    position2Error: position2BaseResult.error
                });
                throw new Error(`连锁头寸创建失败: 头寸1=${position1Result.error}, 头寸2=${position2BaseResult.error}`);
            } else {
                // 部分成功场景 - 需要关闭成功的头寸并重试
                await this.loggerService.logBusinessOperation('[PARTIAL-SUCCESS-RECOVERY] ⚠️ 检测到部分成功场景', {
                    position1Success,
                    position2Success,
                    position1Address: position1Result.positionAddress,
                    position2Address: position2BaseResult.positionAddress
                });

                // 确定需要关闭的头寸
                const successPosition = position1Success ? position1Result.positionAddress : position2BaseResult.positionAddress;
                const successPositionName = position1Success ? '头寸1' : '头寸2';
                const failedPositionName = position1Success ? '头寸2' : '头寸1';
                const failedError = position1Success ? position2BaseResult.error : position1Result.error;

                await this.loggerService.logBusinessOperation('[PARTIAL-SUCCESS-RECOVERY] 🔄 开始关闭成功的头寸', {
                    successPosition,
                    successPositionName,
                    failedPositionName,
                    failedError
                });

                // 关闭成功的头寸
                const closeResult = await this.closeSuccessfulPosition(successPosition!);
                
                if (!closeResult.success) {
                    await this.loggerService.logBusinessOperation('[PARTIAL-SUCCESS-RECOVERY] ❌ 关闭成功头寸失败', {
                        positionAddress: successPosition,
                        closeError: closeResult.error
                    });
                    throw new Error(`关闭${successPositionName}失败: ${closeResult.error}`);
                }

                await this.loggerService.logBusinessOperation('[PARTIAL-SUCCESS-RECOVERY] ✅ 成功头寸已关闭', {
                    positionAddress: successPosition,
                    signature: closeResult.signature
                });

                // 清理成功头寸的状态
                await this.cleanupPositionState(successPosition!);

                // 抛出异常触发重试
                throw new Error(`连锁头寸创建部分失败，已关闭${successPositionName}，重试创建: ${failedPositionName}失败=${failedError}`);
            }

            await this.loggerService.logBusinessOperation('✅ 头寸基础创建完成', {
                position1Address: position1Result.positionAddress,
                position2Address: position2BaseResult.positionAddress
            });

            // 4. 向头寸2添加Curve流动性（20%资金）
            const position2CurveResult = await this.addCurveLiquidityToPosition2(
                position2BaseResult.positionAddress!,
                params,
                fundingAllocation.position2Curve
            );

            if (!position2CurveResult.success) {
                await this.loggerService.logSystem('WARN',
                    `头寸2 Curve流动性添加失败，但基础头寸已创建: ${position2CurveResult.error}`);
            }

            await this.loggerService.logBusinessOperation('🎯 连锁头寸创建成功', {
                position1Address: position1Result.positionAddress,
                position2Address: position2BaseResult.positionAddress,
                totalBinRange: [ranges.position2Lower, ranges.position1Upper],
                fundingStrategy: '20%-60%-20%分配'
            });

            return {
                success: true,
                position1Address: position1Result.positionAddress!,
                position2Address: position2BaseResult.positionAddress!,
                position1Signature: position1Result.signature!,
                position2BaseSignature: position2BaseResult.signature!,
                position2CurveSignature: position2CurveResult.signature || '',
                totalBinRange: [ranges.position2Lower, ranges.position1Upper],
                fundingAllocation: {
                    position1: fundingAllocation.position1,
                    position2Base: fundingAllocation.position2Base,
                    position2Curve: fundingAllocation.position2Curve
                },
                gasUsed: (position1Result.gasUsed || 0) + (position2BaseResult.gasUsed || 0)
            };

        } catch (error) {
            this.errorCount++;
            const errorMsg = `连锁头寸创建失败: ${error instanceof Error ? error.message : String(error)}`;
            await this.loggerService.logError('Module', errorMsg, error as Error);

            // 重新抛出异常让重试机制处理
            throw error;
        }
    }

    /**
     * 计算连锁头寸范围
     * 实现指南文档中的精确算法：
     * - 头寸1 (高价格): [activeBin-68, activeBin] (69个bin)
     * - 头寸2 (低价格): [activeBin-137, activeBin-69] (69个bin)
     */
    async calculateChainPositionRanges(poolAddress: string): Promise<ChainPositionRanges> {
        try {
            // 获取活跃bin
            const activeBin = await this.meteoraService.getActiveBin(poolAddress);

            // 按照指南文档的精确计算公式
            // 头寸1 (高价格范围) - 69个bin
            const position1Upper = activeBin;           // 上界包含活跃bin
            const position1Lower = activeBin - 68;      // 下界 (69个bin范围)

            // 头寸2 (低价格范围) - 69个bin
            const position2Upper = activeBin - 69;      // 上界紧邻头寸1下界
            const position2Lower = activeBin - 137;     // 下界 (69个bin范围)

            // 验证计算结果
            const position1BinCount = position1Upper - position1Lower + 1;
            const position2BinCount = position2Upper - position2Lower + 1;
            const totalBinCount = position1Upper - position2Lower + 1;
            const isConnected = position2Upper + 1 === position1Lower;

            const validated = (
                position1BinCount === this.CHAIN_POSITION_CONFIG.SINGLE_POSITION_BIN_COUNT &&
                position2BinCount === this.CHAIN_POSITION_CONFIG.SINGLE_POSITION_BIN_COUNT &&
                totalBinCount === this.CHAIN_POSITION_CONFIG.TOTAL_BIN_COUNT &&
                isConnected
            );

            await this.loggerService.logSystem('DEBUG', '🔍 连锁头寸范围验证结果',
                `position1BinCount: ${position1BinCount}, position2BinCount: ${position2BinCount}, totalBinCount: ${totalBinCount}, isConnected: ${isConnected}, validated: ${validated}`);

            return {
                activeBin,
                position1Lower,
                position1Upper,
                position2Lower,
                position2Upper,
                totalBinCount,
                validated
            };

        } catch (error) {
            await this.loggerService.logError('Module', '❌ 连锁头寸范围计算失败:', error as Error);
            throw new Error(`范围计算失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 计算资金分配
     * 按照20%-60%-20%的策略分配
     */
    private calculateFundingAllocation(totalAmount: number): {
        position1: number;
        position2Base: number;
        position2Curve: number;
    } {
        const { FUNDING_ALLOCATION } = this.CHAIN_POSITION_CONFIG;

        return {
            position1: totalAmount * FUNDING_ALLOCATION.POSITION1_PERCENTAGE,
            position2Base: totalAmount * FUNDING_ALLOCATION.POSITION2_BASE_PERCENTAGE,
            position2Curve: totalAmount * FUNDING_ALLOCATION.POSITION2_CURVE_PERCENTAGE
        };
    }

    /**
     * 创建头寸1 (高价格范围，20%资金，BidAsk模式)
     */
    private async createPosition1(
        params: ChainPositionParams,
        ranges: ChainPositionRanges,
        amount: number
    ): Promise<PositionResult> {
        try {
            // 获取实例ID（如果存在）
            const instanceId = (params as any).instanceId;

            await this.loggerService.logFilteredInstanceOperation('📈 创建头寸1 (高价格范围)', {
                range: `[${ranges.position1Lower}, ${ranges.position1Upper}]`,
                amount: amount,
                strategy: 'BidAsk',
                instanceId
            }, instanceId);

            const position1Params = {
                poolAddress: params.poolAddress,
                lowerBinId: ranges.position1Lower,
                upperBinId: ranges.position1Upper,
                amount: amount.toString(),
                tokenMint: '',  // Y头寸将使用池的tokenY
                binRange: this.CHAIN_POSITION_CONFIG.SINGLE_POSITION_BIN_COUNT,
                activeBin: ranges.activeBin,
                password: params.password,
                slippageBps: params.slippageBps || 800
            };

            const result = await this.yPositionManager.createYPosition(position1Params);

            if (result.success) {
                await this.loggerService.logFilteredInstanceOperation('✅ 头寸1创建成功', {
                    positionAddress: result.positionAddress,
                    signature: result.signature,
                    instanceId
                }, instanceId);
            }

            return result;

        } catch (error) {
            await this.loggerService.logError('Module', '❌ 头寸1创建失败:', error as Error);
            return {
                success: false,
                error: `头寸1创建失败: ${error instanceof Error ? error.message : '未知错误'}`,
                signature: '',
                gasUsed: 0
            };
        }
    }

    /**
     * 创建头寸2基础部分 (低价格范围，60%资金，BidAsk模式)
     */
    private async createPosition2Base(
        params: ChainPositionParams,
        ranges: ChainPositionRanges,
        amount: number
    ): Promise<PositionResult> {
        try {
            // 获取实例ID（如果存在）
            const instanceId = (params as any).instanceId;

            await this.loggerService.logFilteredInstanceOperation('📉 创建头寸2基础 (低价格范围)', {
                range: `[${ranges.position2Lower}, ${ranges.position2Upper}]`,
                amount: amount,
                strategy: 'BidAsk基础',
                instanceId
            }, instanceId);

            const position2BaseParams = {
                poolAddress: params.poolAddress,
                lowerBinId: ranges.position2Lower,
                upperBinId: ranges.position2Upper,
                amount: amount.toString(),
                tokenMint: '',  // Y头寸将使用池的tokenY
                binRange: this.CHAIN_POSITION_CONFIG.SINGLE_POSITION_BIN_COUNT,
                activeBin: ranges.activeBin,
                password: params.password,
                slippageBps: params.slippageBps || 800
            };

            const result = await this.yPositionManager.createYPosition(position2BaseParams);

            if (result.success) {
                await this.loggerService.logFilteredInstanceOperation('✅ 头寸2基础创建成功', {
                    positionAddress: result.positionAddress,
                    signature: result.signature,
                    instanceId
                }, instanceId);
            }

            return result;

        } catch (error) {
            await this.loggerService.logError('Module', '❌ 头寸2基础创建失败:', error as Error);
            return {
                success: false,
                error: `头寸2基础创建失败: ${error instanceof Error ? error.message : '未知错误'}`,
                signature: '',
                gasUsed: 0
            };
        }
    }

    /**
     * 向头寸2添加Curve流动性 (20%资金，Curve模式) - 带重试机制
     */
    private async addCurveLiquidityToPosition2(
        position2Address: string,
        params: ChainPositionParams,
        amount: number
    ): Promise<PositionResult> {
        try {
            await this.loggerService.logBusinessOperation('🔄 向头寸2添加Curve流动性', {
                positionAddress: position2Address.substring(0, 8) + '...',
                amount: amount,
                strategy: 'Curve'
            });

            // 🔥 使用重试机制执行流动性添加操作
            const result = await this.synchronousRetryManager.executeAsyncWithRetry(
                {
                    execute: async () => {
                        const curveParams = {
                            positionAddress: position2Address,
                            poolAddress: params.poolAddress,
                            amount: amount,
                            liquidityMode: 'curve' as const,
                            password: params.password || '',
                            slippageBps: params.slippageBps || 1500
                        };

                        return await this.liquidityOperationService.addCurveLiquidity(curveParams);
                    },
                    validate: (result: any) => {
                        // 验证操作是否成功
                        return result.success === true;
                    }
                },
                'liquidity.add',  // 使用新的流动性添加操作类型
                params.poolAddress.substring(0, 8) // 使用池地址作为实例ID
                // 不需要传递customConfig，使用默认的liquidity.add配置
            );

            if (result.success) {
                await this.loggerService.logBusinessOperation('✅ Curve流动性添加成功', {
                    positionAddress: position2Address,
                    signature: result.signature,
                    addedLiquidity: result.addedLiquidity
                });

                return {
                    success: true,
                    positionAddress: position2Address,
                    signature: result.signature || '',
                    gasUsed: result.gasUsed || 0
                };
            } else {
                return {
                    success: false,
                    error: result.error || 'Curve流动性添加失败',
                    positionAddress: position2Address,
                    signature: '',
                    gasUsed: 0
                };
            }

        } catch (error) {
            await this.loggerService.logError('Module', '❌ Curve流动性添加失败（重试耗尽）:', error as Error);
            return {
                success: false,
                error: `Curve流动性添加失败: ${error instanceof Error ? error.message : '未知错误'}`,
                positionAddress: position2Address,
                signature: '',
                gasUsed: 0
            };
        }
    }

    /**
     * 关闭成功的头寸 - 用于部分成功恢复场景
     */
    private async closeSuccessfulPosition(positionAddress: string): Promise<PositionResult> {
        try {
            await this.loggerService.logBusinessOperation('[POSITION-CLEANUP] 🔄 开始关闭头寸', {
                positionAddress: positionAddress.substring(0, 8) + '...'
            });

            // 获取钱包
            const wallet = this.walletService.getCurrentKeypair();
            if (!wallet) {
                throw new Error('钱包未解锁');
            }

            const connection = this.solanaService.getConnection();
            const positionPublicKey = new PublicKey(positionAddress);

            // 获取头寸信息
            const positionInfo = await connection.getAccountInfo(positionPublicKey);
            if (!positionInfo) {
                // 头寸不存在，视为已关闭
                await this.loggerService.logBusinessOperation('[POSITION-CLEANUP] ℹ️ 头寸不存在，视为已关闭', {
                    positionAddress: positionAddress.substring(0, 8) + '...'
                });
                return {
                    success: true,
                    positionAddress,
                    signature: '',
                    gasUsed: 0
                };
            }

            // 动态导入DLMM SDK
            const DLMMSdk = await import('@meteora-ag/dlmm');
            const { BN } = await import('@coral-xyz/anchor');
            
            // 需要获取池地址来创建DLMM实例
            // 这里简化处理，直接调用现有的关闭头寸逻辑
            const closeResult = await this.callPositionManagerClose(positionAddress);

            if (closeResult.success) {
                await this.loggerService.logBusinessOperation('[POSITION-CLEANUP] ✅ 头寸关闭成功', {
                    positionAddress: positionAddress.substring(0, 8) + '...',
                    signature: closeResult.signature
                });
            }

            return closeResult;

        } catch (error) {
            await this.loggerService.logError('Module', '❌ 关闭头寸失败:', error as Error);
            return {
                success: false,
                error: error instanceof Error ? error.message : '关闭头寸失败',
                positionAddress,
                signature: '',
                gasUsed: 0
            };
        }
    }

    /**
     * 调用PositionManager关闭头寸
     */
    private async callPositionManagerClose(positionAddress: string): Promise<PositionResult> {
        try {
            // 通过容器获取PositionManager实例
            const { container } = await import('tsyringe');
            const positionManager = container.resolve<any>('PositionManager');
            
            if (positionManager && positionManager.closePosition) {
                return await positionManager.closePosition(positionAddress);
            } else {
                throw new Error('PositionManager服务不可用');
            }
        } catch (error) {
            throw new Error(`调用PositionManager关闭头寸失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 清理头寸状态 - 用于部分成功恢复场景
     */
    private async cleanupPositionState(positionAddress: string): Promise<void> {
        try {
            await this.loggerService.logBusinessOperation('[POSITION-CLEANUP] 🧹 开始清理头寸状态', {
                positionAddress: positionAddress.substring(0, 8) + '...'
            });

            // 通过容器获取PositionManager实例来清理缓存
            const { container } = await import('tsyringe');
            const positionManager = container.resolve<any>('PositionManager');
            
            if (positionManager && positionManager.removePositionFromCache) {
                await positionManager.removePositionFromCache(positionAddress);
            }

            await this.loggerService.logBusinessOperation('[POSITION-CLEANUP] ✅ 头寸状态清理完成', {
                positionAddress: positionAddress.substring(0, 8) + '...'
            });

        } catch (error) {
            await this.loggerService.logSystem('WARN', `清理头寸状态失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 验证连锁头寸状态
     */
    async validateChainPosition(chainPositionId: string): Promise<boolean> {
        try {
            // TODO: 实现连锁头寸状态验证逻辑
            await this.loggerService.logSystem('DEBUG', `验证连锁头寸状态: ${chainPositionId}`);
            return true;
        } catch (error) {
            await this.loggerService.logError('Module', '❌ 连锁头寸验证失败:', error as Error);
            return false;
        }
    }

    /**
     * 销毁服务，清理资源
     */
    async destroy(): Promise<void> {
        await this.loggerService.logSystem('INFO', '🧹 ChainPositionManager资源清理完成');
    }
} 