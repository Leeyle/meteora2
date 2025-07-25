/**
 * 📈 头寸管理API路由
 * 提供头寸创建、管理、信息查询等功能
 */

import { Router } from 'express';

export function createPositionRoutes(services: any) {
    const router = Router();

    // 获取用户所有头寸
    router.get('/user/:userAddress', async (req, res) => {
        try {
            const { userAddress } = req.params;
            const positions = await services.positionManager.getUserPositions(userAddress);
            res.json({
                success: true,
                data: positions
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_POSITIONS_ERROR'
            });
        }
    });

    // 🚀 获取用户在特定池中的头寸 (使用Meteora服务)
    router.get('/user/:userAddress/pool/:poolAddress', async (req, res) => {
        try {
            const { userAddress, poolAddress } = req.params;

            // 验证参数
            if (!userAddress || !poolAddress) {
                res.status(400).json({
                    success: false,
                    error: '用户地址和池地址不能为空',
                    code: 'INVALID_PARAMETERS'
                });
                return;
            }

            // 验证地址格式 (简单验证)
            if (userAddress.length < 32 || poolAddress.length < 32) {
                res.status(400).json({
                    success: false,
                    error: '无效的地址格式',
                    code: 'INVALID_ADDRESS_FORMAT'
                });
                return;
            }

            if (!services.meteora) {
                res.status(503).json({
                    success: false,
                    error: 'Meteora服务不可用',
                    code: 'METEORA_SERVICE_UNAVAILABLE'
                });
                return;
            }

            // 🎯 使用Meteora服务获取用户在指定池中的头寸
            const positions = await services.meteora.getUserPositions(userAddress, poolAddress);

            // 记录业务操作日志
            if (services.logger) {
                await services.logger.logBusinessOperation('user-pool-positions-query', {
                    userAddress: userAddress.substring(0, 8) + '...',
                    poolAddress: poolAddress.substring(0, 8) + '...',
                    positionCount: positions.length,
                    timestamp: Date.now()
                });
            }

            res.json({
                success: true,
                data: {
                    userAddress,
                    poolAddress,
                    positionCount: positions.length,
                    positions,
                    timestamp: Date.now()
                }
            });

        } catch (error: any) {
            // 记录错误日志
            if (services.logger) {
                await services.logger.logError('Position', '获取用户池头寸失败', error);
            }

            res.status(500).json({
                success: false,
                error: error.message || '获取用户池头寸失败',
                code: 'GET_USER_POOL_POSITIONS_ERROR'
            });
        }
    });

    // 获取特定头寸信息
    router.get('/:address/info', async (req, res) => {
        try {
            const { address } = req.params;
            const positionInfo = await services.positionInfo.getPositionInfo(address);

            res.json({
                success: true,
                data: positionInfo
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_POSITION_INFO_ERROR'
            });
        }
    });

    // 🆕 获取单个头寸的收益信息（显示用，不过滤阈值）
    router.get('/:address/fees', async (req, res) => {
        try {
            const { address } = req.params;
            const fees = await services.positionFeeHarvester.getPositionFeesFromChain(address);

            if (!fees) {
                res.status(404).json({
                    success: false,
                    error: '头寸收益信息不存在',
                    code: 'POSITION_FEES_NOT_FOUND'
                });
                return;
            }

            res.json({
                success: true,
                data: fees
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_POSITION_FEES_ERROR'
            });
        }
    });

    // 🆕 计算收益的Y代币等价值
    router.post('/:address/calculate-value', async (req, res) => {
        try {
            const { address } = req.params;
            const { tokenXAmount, tokenYAmount, poolAddress, tokenXDecimals, tokenYDecimals } = req.body;

            if (!tokenXAmount || !tokenYAmount || !poolAddress) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: tokenXAmount, tokenYAmount, poolAddress',
                    code: 'INVALID_PARAMETERS'
                });
                return;
            }

            const totalValue = await services.positionFeeHarvester.calculateTotalYTokenValue(
                tokenXAmount,
                tokenYAmount,
                poolAddress,
                tokenXDecimals || 9,
                tokenYDecimals || 9
            );

            res.json({
                success: true,
                data: {
                    totalYTokenValue: totalValue,
                    tokenXAmount,
                    tokenYAmount,
                    poolAddress
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CALCULATE_VALUE_ERROR'
            });
        }
    });

    // ⚠️ 以下批量收益查看和收益筛选接口已被移除，只保留核心的3个功能：
    // - getPositionFeesFromChain (查看收益)
    // - calculateTotalYTokenValue (计算价值)  
    // - harvestPositionFees (提取收益)
    // 已移除的接口：GET /fees/all, GET /fees/harvestable, GET /user/:userAddress/fees, 
    // GET /user/:userAddress/fees/harvestable, POST /batch/collect-fees

    // 获取头寸信息 (简化版本，测试脚本需要)
    router.get('/:address', async (req, res) => {
        try {
            const { address } = req.params;
            const positionInfo = await services.positionManager.getPosition(address);

            res.json({
                success: true,
                data: positionInfo
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_POSITION_ERROR'
            });
        }
    });

    // 创建Y代币头寸
    router.post('/y/create', async (req, res) => {
        try {
            const {
                poolAddress,
                amount,
                binRange,
                strategy = 'moderate',
                slippageBps = 800,
                password
            } = req.body;

            // 注意：获取activeBin的逻辑已经移动到YPositionManager内部
            const result = await services.yPositionManager.createYPosition({
                poolAddress,
                amount,
                binRange,
                strategy,
                slippageBps,
                tokenMint: 'SOL',  // 默认使用SOL
                password
            });

            // 直接返回YPositionManager的结果，避免双重嵌套
            if (result.success) {
                res.json({
                    success: true,
                    data: {
                        positionAddress: result.positionAddress,
                        signature: result.signature,
                        gasUsed: result.gasUsed || 0
                    }
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error,
                    code: 'CREATE_Y_POSITION_ERROR'
                });
            }
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CREATE_Y_POSITION_ERROR'
            });
        }
    });

    // 创建X代币头寸
    router.post('/x/create', async (req, res) => {
        try {
            const {
                poolAddress,
                amount,
                binRange,
                strategy = 'balanced',
                slippageBps = 800,
                password
            } = req.body;

            // 注意：获取activeBin的逻辑已经移动到XPositionManager内部
            const result = await services.xPositionManager.createXPosition({
                poolAddress,
                amount,
                binRange,
                strategy,
                slippageBps,
                tokenMint: 'SOL',  // 默认使用SOL
                password
            });

            // 直接返回XPositionManager的结果，避免双重嵌套
            if (result.success) {
                res.json({
                    success: true,
                    data: {
                        positionAddress: result.positionAddress,
                        signature: result.signature,
                        gasUsed: result.gasUsed || 0
                    }
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error,
                    code: 'CREATE_X_POSITION_ERROR'
                });
            }
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CREATE_X_POSITION_ERROR'
            });
        }
    });

    // 关闭头寸 (统一方法，使用PositionManager)
    router.post('/:address/close', async (req, res) => {
        try {
            const { address } = req.params;
            const { password } = req.body;

            // 使用统一的PositionManager关闭头寸
            const result = await services.positionManager.closePosition(address, password);

            res.json({
                success: true,
                data: result
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CLOSE_POSITION_ERROR'
            });
        }
    });

    // 关闭头寸 (DELETE方法，委托给统一方法)
    router.delete('/:address', async (req, res) => {
        try {
            const { address } = req.params;

            // 委托给统一的PositionManager方法
            const result = await services.positionManager.closePosition(address);

            res.json({
                success: true,
                data: result
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CLOSE_POSITION_ERROR'
            });
        }
    });

    // 关闭X代币头寸 (委托给统一方法)
    router.post('/x/:address/close', async (req, res) => {
        try {
            const { address } = req.params;
            const { password } = req.body;

            // 委托给统一的PositionManager方法
            const result = await services.positionManager.closePosition(address, password);

            res.json({
                success: true,
                data: result
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CLOSE_X_POSITION_ERROR'
            });
        }
    });

    // 收集头寸手续费（核心功能3）
    router.post('/:address/collect-fees', async (req, res) => {
        try {
            const { address } = req.params;
            const result = await services.positionFeeHarvester.harvestPositionFees(address);

            res.json({
                success: true,
                data: result
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'COLLECT_FEES_ERROR'
            });
        }
    });

    // 获取头寸收益统计
    router.get('/:address/stats', async (req, res) => {
        try {
            const { address } = req.params;
            const stats = await services.positionInfo.getPositionStats(address);

            res.json({
                success: true,
                data: stats
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_POSITION_STATS_ERROR'
            });
        }
    });

    // 🆕 获取头寸链上信息
    router.get('/:address/onchain', async (req, res) => {
        try {
            const { address } = req.params;

            // 验证地址格式
            if (!address || address.length < 32) {
                res.status(400).json({
                    success: false,
                    error: '无效的头寸地址格式',
                    code: 'INVALID_ADDRESS_FORMAT'
                });
                return;
            }

            const result = await services.positionManager.getPositionOnChainInfo(address);

            res.json(result);
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_ONCHAIN_POSITION_ERROR'
            });
        }
    });

    // 🆕 获取头寸信息（支持链上刷新）
    router.get('/:address/refresh', async (req, res) => {
        try {
            const { address } = req.params;
            const { fromChain } = req.query;

            // 验证地址格式
            if (!address || address.length < 32) {
                res.status(400).json({
                    success: false,
                    error: '无效的头寸地址格式',
                    code: 'INVALID_ADDRESS_FORMAT'
                });
                return;
            }

            const refreshFromChain = fromChain === 'true' || fromChain === '1';
            const result = await services.positionManager.getPositionWithRefresh(address, refreshFromChain);

            res.json(result);
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_POSITION_REFRESH_ERROR'
            });
        }
    });

    // 🆕 批量获取头寸链上信息
    router.post('/batch/onchain', async (req, res) => {
        try {
            const { addresses } = req.body;

            // 验证请求参数
            if (!addresses || !Array.isArray(addresses)) {
                res.status(400).json({
                    success: false,
                    error: '地址数组(addresses)是必需的',
                    code: 'INVALID_PARAMETERS'
                });
                return;
            }

            if (addresses.length === 0) {
                res.status(400).json({
                    success: false,
                    error: '地址数组不能为空',
                    code: 'EMPTY_ADDRESSES'
                });
                return;
            }

            if (addresses.length > 20) {
                res.status(400).json({
                    success: false,
                    error: '最多支持20个地址',
                    code: 'TOO_MANY_ADDRESSES'
                });
                return;
            }

            // 验证地址格式
            for (const address of addresses) {
                if (!address || typeof address !== 'string' || address.length < 32) {
                    res.status(400).json({
                        success: false,
                        error: `无效的地址格式: ${address}`,
                        code: 'INVALID_ADDRESS_FORMAT'
                    });
                    return;
                }
            }

            const result = await services.positionManager.getBatchPositionsOnChainInfo(addresses);

            res.json(result);
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'BATCH_ONCHAIN_POSITIONS_ERROR'
            });
        }
    });

    return router;
} 