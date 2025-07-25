/**
 * 🏊 DLMM池子管理API路由
 * 提供池子基本信息、实时价格、活跃bin、流动性分布等功能
 */

import { Router } from 'express';

export function createPoolRoutes(services: any) {
    const router = Router();

    // 缓存配置
    const POOL_INFO_CACHE_TTL = 10000; // 10秒 - 池子基本信息缓存
    const PRICE_CACHE_TTL = 10000; // 10秒 - 价格数据缓存  
    const LIQUIDITY_CACHE_TTL = 15000; // 15秒 - 流动性数据缓存

    /**
     * 获取池子基本信息
     * GET /api/pools/{poolAddress}/info
     */
    router.get('/:poolAddress/info', async (req, res) => {
        try {
            const { poolAddress } = req.params;

            // 验证池子地址格式
            if (!poolAddress || typeof poolAddress !== 'string' || poolAddress.length < 32) {
                res.status(400).json({
                    success: false,
                    error: '无效的池子地址格式',
                    code: 'INVALID_POOL_ADDRESS'
                });
                return;
            }

            // 检查缓存
            const cacheKey = `pool_info:${poolAddress}`;
            let poolInfo = await services.cache?.get(cacheKey);

            if (!poolInfo && services.meteora) {
                // 从MeteoraService获取池子信息
                poolInfo = await services.meteora.getPoolInfo(poolAddress);

                // 缓存池子信息
                if (services.cache && poolInfo) {
                    await services.cache.set(cacheKey, poolInfo, POOL_INFO_CACHE_TTL);
                }
            }

            if (!poolInfo) {
                res.status(404).json({
                    success: false,
                    error: '未找到指定池子信息',
                    code: 'POOL_NOT_FOUND'
                });
                return;
            }

            // 记录业务操作日志
            if (services.logger) {
                await services.logger.logBusinessOperation('📊 查询池子信息', {
                    poolAddress: poolAddress.substring(0, 8) + '...',
                    timestamp: Date.now(),
                    cached: !!await services.cache?.get(cacheKey)
                });
            }

            res.json({
                success: true,
                data: {
                    poolAddress,
                    tokenX: poolInfo.tokenX,
                    tokenY: poolInfo.tokenY,
                    binStep: poolInfo.binStep,
                    activeBin: poolInfo.activeBin,
                    reserve: poolInfo.reserve,
                    fees: poolInfo.fees,
                    protocolFees: poolInfo.protocolFees,
                    timestamp: Date.now()
                }
            });

        } catch (error: any) {
            // 记录错误日志
            if (services.logger) {
                await services.logger.logError('Pool', '获取池子信息失败', error);
            }

            res.status(500).json({
                success: false,
                error: error.message || '获取池子信息失败',
                code: 'GET_POOL_INFO_ERROR'
            });
        }
    });

    /**
     * 获取实时价格与活跃bin信息（合并API）
     * GET /api/pools/{poolAddress}/price-and-bin
     */
    router.get('/:poolAddress/price-and-bin', async (req, res) => {
        try {
            const { poolAddress } = req.params;
            const { refresh } = req.query; // 添加强制刷新参数

            // 验证池子地址格式
            if (!poolAddress || typeof poolAddress !== 'string' || poolAddress.length < 32) {
                res.status(400).json({
                    success: false,
                    error: '无效的池子地址格式',
                    code: 'INVALID_POOL_ADDRESS'
                });
                return;
            }

            // 检查缓存 (支持强制刷新)
            const cacheKey = `price_and_bin:${poolAddress}`;
            let cachedData = null;

            // 如果没有refresh参数，才检查缓存
            if (!refresh) {
                cachedData = await services.cache?.get(cacheKey);
            }

            if (!cachedData && services.meteora) {
                // 使用优化的一次性获取方法
                const poolData = await (services.meteora as any).getPoolPriceAndBin?.(poolAddress) ||
                    await services.meteora.getPoolInfo(poolAddress);

                if (poolData.activeBin !== undefined) {
                    // 使用新的优化方法
                    cachedData = {
                        activeBin: poolData.activeBin,
                        activePrice: poolData.activePrice,
                        activeBinInfo: poolData.activeBinInfo,
                        tokenX: poolData.tokenX,
                        tokenY: poolData.tokenY,
                        binStep: poolData.binStep,
                        timestamp: Date.now()
                    };
                } else {
                    // 兼容原有方法 (备用方案)
                    const [activeBin, poolInfo] = await Promise.all([
                        services.meteora.getActiveBin(poolAddress),
                        services.meteora.getPoolInfo(poolAddress)
                    ]);

                    const activePrice = await services.meteora.calculateBinPrice(poolAddress, activeBin);
                    const activeBinInfo = await services.meteora.getBinInfo(poolAddress, activeBin);

                    cachedData = {
                        activeBin,
                        activePrice,
                        activeBinInfo,
                        tokenX: poolInfo?.tokenX,
                        tokenY: poolInfo?.tokenY,
                        binStep: poolInfo?.binStep,
                        timestamp: Date.now()
                    };
                }

                // 缓存价格数据
                if (services.cache) {
                    await services.cache.set(cacheKey, cachedData, PRICE_CACHE_TTL);
                }
            }

            if (!cachedData) {
                res.status(404).json({
                    success: false,
                    error: '未找到池子价格信息',
                    code: 'PRICE_DATA_NOT_FOUND'
                });
                return;
            }

            // 记录业务操作日志
            if (services.logger) {
                await services.logger.logBusinessOperation('pool-price-query', {
                    poolAddress: poolAddress.substring(0, 8) + '...',
                    activeBin: cachedData.activeBin,
                    activePrice: cachedData.activePrice,
                    timestamp: Date.now(),
                    cached: !!await services.cache?.get(cacheKey)
                });
            }

            res.json({
                success: true,
                data: {
                    poolAddress,
                    activeBin: cachedData.activeBin,
                    activePrice: cachedData.activePrice,
                    activeBinInfo: cachedData.activeBinInfo,
                    tokenInfo: {
                        tokenX: cachedData.tokenX,
                        tokenY: cachedData.tokenY,
                        binStep: cachedData.binStep
                    },
                    timestamp: cachedData.timestamp
                }
            });

        } catch (error: any) {
            // 记录错误日志
            if (services.logger) {
                await services.logger.logError('Pool', '获取池子价格信息失败', error);
            }

            res.status(500).json({
                success: false,
                error: error.message || '获取池子价格信息失败',
                code: 'GET_PRICE_AND_BIN_ERROR'
            });
        }
    });

    /**
     * 获取实时价格与活跃bin信息（强制刷新，不使用缓存）
     * GET /api/pools/{poolAddress}/price-and-bin/realtime
     */
    router.get('/:poolAddress/price-and-bin/realtime', async (req, res) => {
        try {
            const { poolAddress } = req.params;

            // 验证池子地址格式
            if (!poolAddress || typeof poolAddress !== 'string' || poolAddress.length < 32) {
                res.status(400).json({
                    success: false,
                    error: '无效的池子地址格式',
                    code: 'INVALID_POOL_ADDRESS'
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

            // 强制获取实时数据，绕过所有缓存
            const startTime = Date.now();

            // 使用优化的一次性获取方法，但清除缓存确保实时性
            const realtimeData = await (services.meteora as any).getPoolPriceAndBin?.(poolAddress) ||
                await services.meteora.getPoolInfo(poolAddress);

            const responseTime = Date.now() - startTime;

            let responseData;
            if (realtimeData.activeBin !== undefined) {
                responseData = {
                    activeBin: realtimeData.activeBin,
                    activePrice: realtimeData.activePrice,
                    activeBinInfo: realtimeData.activeBinInfo,
                    tokenX: realtimeData.tokenX,
                    tokenY: realtimeData.tokenY,
                    binStep: realtimeData.binStep,
                    timestamp: Date.now(),
                    isRealtime: true,
                    responseTime
                };
            } else {
                // 备用方案：强制刷新各个组件
                const [activeBin, poolInfo] = await Promise.all([
                    services.meteora.getActiveBin(poolAddress),
                    services.meteora.getPoolInfo(poolAddress)
                ]);

                const activePrice = await services.meteora.calculateBinPrice(poolAddress, activeBin);
                const activeBinInfo = await services.meteora.getBinInfo(poolAddress, activeBin);

                responseData = {
                    activeBin,
                    activePrice,
                    activeBinInfo,
                    tokenX: poolInfo?.tokenX,
                    tokenY: poolInfo?.tokenY,
                    binStep: poolInfo?.binStep,
                    timestamp: Date.now(),
                    isRealtime: true,
                    responseTime
                };
            }

            // 记录实时数据请求日志
            if (services.logger) {
                await services.logger.logBusinessOperation('pool-realtime-query', {
                    poolAddress: poolAddress.substring(0, 8) + '...',
                    activeBin: responseData.activeBin,
                    activePrice: responseData.activePrice,
                    responseTime,
                    timestamp: Date.now(),
                    cached: false
                });
            }

            res.json({
                success: true,
                data: {
                    poolAddress,
                    activeBin: responseData.activeBin,
                    activePrice: responseData.activePrice,
                    activeBinInfo: responseData.activeBinInfo,
                    tokenInfo: {
                        tokenX: responseData.tokenX,
                        tokenY: responseData.tokenY,
                        binStep: responseData.binStep
                    },
                    timestamp: responseData.timestamp,
                    isRealtime: responseData.isRealtime,
                    responseTime: responseData.responseTime
                }
            });

        } catch (error: any) {
            // 记录错误日志
            if (services.logger) {
                await services.logger.logError('Pool', '获取实时池子价格信息失败', error);
            }

            res.status(500).json({
                success: false,
                error: error.message || '获取实时池子价格信息失败',
                code: 'GET_REALTIME_PRICE_ERROR'
            });
        }
    });

    /**
     * 获取流动性分布信息
     * GET /api/pools/{poolAddress}/liquidity
     */
    router.get('/:poolAddress/liquidity', async (req, res) => {
        try {
            const { poolAddress } = req.params;
            const { range = 20 } = req.query; // 默认获取活跃bin前后各20个bin的流动性

            // 验证池子地址格式
            if (!poolAddress || typeof poolAddress !== 'string' || poolAddress.length < 32) {
                res.status(400).json({
                    success: false,
                    error: '无效的池子地址格式',
                    code: 'INVALID_POOL_ADDRESS'
                });
                return;
            }

            // 验证范围参数
            const binRange = Math.min(Math.max(parseInt(range as string) || 20, 5), 100); // 限制在5-100之间

            // 检查缓存
            const cacheKey = `liquidity:${poolAddress}:${binRange}`;
            let liquidityData = await services.cache?.get(cacheKey);

            if (!liquidityData && services.meteora) {
                // 获取活跃bin
                const activeBin = await services.meteora.getActiveBin(poolAddress);

                // 计算bin范围
                const startBin = activeBin - binRange;
                const endBin = activeBin + binRange;

                // 获取bin范围内的流动性信息
                const binInfos = await services.meteora.getBinRange(poolAddress, startBin, endBin);

                // 计算总流动性和分布统计
                let totalLiquidityX = 0;
                let totalLiquidityY = 0;
                const liquidityDistribution = [];

                for (const binInfo of binInfos) {
                    // 计算该bin的价格
                    const binPrice = await services.meteora.calculateBinPrice(poolAddress, binInfo.binId);

                    const liquidityX = Number(binInfo.reserveX || 0);
                    const liquidityY = Number(binInfo.reserveY || 0);

                    totalLiquidityX += liquidityX;
                    totalLiquidityY += liquidityY;

                    liquidityDistribution.push({
                        binId: binInfo.binId,
                        price: binPrice,
                        liquidityX,
                        liquidityY,
                        totalLiquidity: liquidityX + liquidityY,
                        isActiveBin: binInfo.binId === activeBin,
                        utilization: binInfo.reserveX || binInfo.reserveY ?
                            (liquidityX + liquidityY) / (Number(binInfo.reserveX || 0) + Number(binInfo.reserveY || 0)) : 0
                    });
                }

                liquidityData = {
                    poolAddress,
                    activeBin,
                    binRange,
                    totalBins: liquidityDistribution.length,
                    totalLiquidityX,
                    totalLiquidityY,
                    totalLiquidity: totalLiquidityX + totalLiquidityY,
                    liquidityDistribution,
                    statistics: {
                        activeBinLiquidity: liquidityDistribution.find(item => item.isActiveBin)?.totalLiquidity || 0,
                        avgLiquidityPerBin: liquidityDistribution.length > 0 ?
                            (totalLiquidityX + totalLiquidityY) / liquidityDistribution.length : 0,
                        nonEmptyBins: liquidityDistribution.filter(item => item.totalLiquidity > 0).length
                    },
                    timestamp: Date.now()
                };

                // 缓存流动性数据
                if (services.cache) {
                    await services.cache.set(cacheKey, liquidityData, LIQUIDITY_CACHE_TTL);
                }
            }

            if (!liquidityData) {
                res.status(404).json({
                    success: false,
                    error: '未找到池子流动性信息',
                    code: 'LIQUIDITY_DATA_NOT_FOUND'
                });
                return;
            }

            // 记录业务操作日志
            if (services.logger) {
                await services.logger.logBusinessOperation('pool-liquidity-query', {
                    poolAddress: poolAddress.substring(0, 8) + '...',
                    binRange: liquidityData.binRange,
                    totalBins: liquidityData.totalBins,
                    totalLiquidity: liquidityData.totalLiquidity,
                    timestamp: Date.now(),
                    cached: !!await services.cache?.get(cacheKey)
                });
            }

            res.json({
                success: true,
                data: liquidityData
            });

        } catch (error: any) {
            // 记录错误日志
            if (services.logger) {
                await services.logger.logError('Pool', '获取池子流动性信息失败', error);
            }

            res.status(500).json({
                success: false,
                error: error.message || '获取池子流动性信息失败',
                code: 'GET_LIQUIDITY_ERROR'
            });
        }
    });

    return router;
} 