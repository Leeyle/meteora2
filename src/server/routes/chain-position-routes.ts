import { Router, Request, Response } from 'express';
import { container } from 'tsyringe';
import { ChainPositionManager, ChainPositionParams } from '../../services/business/ChainPositionManager';
import { ILoggerService, TYPES } from '../../types/interfaces';

/**
 * 连锁头寸API路由
 * 提供连锁头寸创建和管理功能
 * 
 * 功能包括：
 * - 创建连锁头寸
 * - 计算连锁头寸范围
 * - 验证连锁头寸状态
 */

const router = Router();

/**
 * 创建连锁头寸
 * POST /api/chain-position/create
 * 
 * 请求体：
 * {
 *   "poolAddress": "string",     // 池地址
 *   "totalAmount": number,       // 总金额
 *   "slippageBps": number,       // 滑点 (可选, 默认800 = 8%)
 *   "password": "string"         // 钱包密码 (可选)
 * }
 */
router.post('/create', async (req: Request, res: Response) => {
    const logger = container.resolve<ILoggerService>(TYPES.LoggerService);
    const chainPositionManager = container.resolve(ChainPositionManager);

    try {
        await logger.logBusinessOperation('🔗 API请求：创建连锁头寸', {
            endpoint: '/api/chain-position/create',
            poolAddress: req.body.poolAddress?.substring(0, 8) + '...',
            totalAmount: req.body.totalAmount
        });

        // 参数验证
        const { poolAddress, totalAmount, slippageBps, password } = req.body;

        if (!poolAddress || typeof poolAddress !== 'string') {
            return res.status(400).json({
                success: false,
                error: '池地址(poolAddress)是必需的，且必须是字符串',
                data: null,
                meta: {
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown',
                    version: '2.0.0'
                }
            });
        }

        if (!totalAmount || typeof totalAmount !== 'number' || totalAmount <= 0) {
            return res.status(400).json({
                success: false,
                error: '总金额(totalAmount)是必需的，且必须是正数',
                data: null,
                meta: {
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown',
                    version: '2.0.0'
                }
            });
        }

        // 构建连锁头寸参数
        const chainPositionParams: ChainPositionParams = {
            poolAddress,
            totalAmount,
            slippageBps: slippageBps || 800,
            password
        };

        // 创建连锁头寸
        const result = await chainPositionManager.createChainPosition(chainPositionParams);

        if (result.success) {
            await logger.logBusinessOperation('✅ 连锁头寸创建成功', {
                position1Address: result.position1Address,
                position2Address: result.position2Address,
                totalBinRange: result.totalBinRange,
                fundingAllocation: result.fundingAllocation
            });

            return res.json({
                success: true,
                data: {
                    position1Address: result.position1Address,
                    position2Address: result.position2Address,
                    position1Signature: result.position1Signature,
                    position2BaseSignature: result.position2BaseSignature,
                    position2CurveSignature: result.position2CurveSignature,
                    totalBinRange: result.totalBinRange,
                    fundingAllocation: result.fundingAllocation,
                    gasUsed: result.gasUsed
                },
                meta: {
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown',
                    version: '2.0.0'
                }
            });
        } else {
            await logger.logError('API', '❌ 连锁头寸创建失败', new Error(result.error || '未知错误'));

            return res.status(500).json({
                success: false,
                error: result.error || '连锁头寸创建失败',
                data: null,
                meta: {
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown',
                    version: '2.0.0'
                }
            });
        }

    } catch (error) {
        await logger.logError('API', '❌ 连锁头寸创建API错误', error as Error);

        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : '服务器内部错误',
            data: null,
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown',
                version: '2.0.0'
            }
        });
    }
});

/**
 * 计算连锁头寸范围
 * GET /api/chain-position/calculate-ranges/:poolAddress
 * 
 * 路径参数：
 * - poolAddress: 池地址
 */
router.get('/calculate-ranges/:poolAddress', async (req: Request, res: Response) => {
    const logger = container.resolve<ILoggerService>(TYPES.LoggerService);
    const chainPositionManager = container.resolve(ChainPositionManager);

    try {
        const { poolAddress } = req.params;

        await logger.logBusinessOperation('📊 API请求：计算连锁头寸范围', {
            endpoint: '/api/chain-position/calculate-ranges',
            poolAddress: poolAddress.substring(0, 8) + '...'
        });

        if (!poolAddress) {
            return res.status(400).json({
                success: false,
                error: '池地址是必需的',
                data: null,
                meta: {
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown',
                    version: '2.0.0'
                }
            });
        }

        const ranges = await chainPositionManager.calculateChainPositionRanges(poolAddress);

        await logger.logBusinessOperation('✅ 连锁头寸范围计算成功', {
            activeBin: ranges.activeBin,
            position1Range: `[${ranges.position1Lower}, ${ranges.position1Upper}]`,
            position2Range: `[${ranges.position2Lower}, ${ranges.position2Upper}]`,
            totalBins: ranges.totalBinCount
        });

        return res.json({
            success: true,
            data: {
                activeBin: ranges.activeBin,
                position1: {
                    lowerBinId: ranges.position1Lower,
                    upperBinId: ranges.position1Upper,
                    binCount: ranges.position1Upper - ranges.position1Lower + 1
                },
                position2: {
                    lowerBinId: ranges.position2Lower,
                    upperBinId: ranges.position2Upper,
                    binCount: ranges.position2Upper - ranges.position2Lower + 1
                },
                total: {
                    lowerBinId: ranges.position2Lower,
                    upperBinId: ranges.position1Upper,
                    binCount: ranges.totalBinCount
                },
                validated: ranges.validated
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown',
                version: '2.0.0'
            }
        });

    } catch (error) {
        await logger.logError('API', '❌ 计算连锁头寸范围API错误', error as Error);

        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : '服务器内部错误',
            data: null,
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown',
                version: '2.0.0'
            }
        });
    }
});

/**
 * 验证连锁头寸状态
 * GET /api/chain-position/validate/:chainPositionId
 * 
 * 路径参数：
 * - chainPositionId: 连锁头寸ID
 */
router.get('/validate/:chainPositionId', async (req: Request, res: Response) => {
    const logger = container.resolve<ILoggerService>(TYPES.LoggerService);
    const chainPositionManager = container.resolve(ChainPositionManager);

    try {
        const { chainPositionId } = req.params;

        await logger.logBusinessOperation('🔍 API请求：验证连锁头寸状态', {
            endpoint: '/api/chain-position/validate',
            chainPositionId: chainPositionId.substring(0, 8) + '...'
        });

        if (!chainPositionId) {
            return res.status(400).json({
                success: false,
                error: '连锁头寸ID是必需的',
                data: null,
                meta: {
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown',
                    version: '2.0.0'
                }
            });
        }

        const isValid = await chainPositionManager.validateChainPosition(chainPositionId);

        await logger.logBusinessOperation('✅ 连锁头寸验证完成', {
            chainPositionId,
            isValid
        });

        return res.json({
            success: true,
            data: {
                chainPositionId,
                isValid,
                validatedAt: new Date().toISOString()
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown',
                version: '2.0.0'
            }
        });

    } catch (error) {
        await logger.logError('API', '❌ 验证连锁头寸状态API错误', error as Error);

        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : '服务器内部错误',
            data: null,
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown',
                version: '2.0.0'
            }
        });
    }
});

/**
 * 获取连锁头寸健康状态
 * GET /api/chain-position/health
 */
router.get('/health', async (req: Request, res: Response) => {
    const logger = container.resolve<ILoggerService>(TYPES.LoggerService);

    try {
        const chainPositionManager = container.resolve(ChainPositionManager);
        const health = await chainPositionManager.healthCheck();
        const metrics = chainPositionManager.getMetrics();

        return res.json({
            success: true,
            data: {
                status: health.status,
                message: health.message,
                details: health.details,
                metrics: {
                    uptime: metrics.uptime,
                    requestCount: metrics.requestCount,
                    errorCount: metrics.errorCount,
                    successRate: metrics.performance?.successRate
                }
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown',
                version: '2.0.0'
            }
        });

    } catch (error) {
        await logger.logError('API', '❌ 连锁头寸健康检查API错误', error as Error);

        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : '服务器内部错误',
            data: null,
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown',
                version: '2.0.0'
            }
        });
    }
});

export default router; 