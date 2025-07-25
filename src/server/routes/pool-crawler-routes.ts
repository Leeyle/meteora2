/**
 * 🏊 池爬虫API路由
 * 提供爬虫控制、配置、状态查询、筛选管理等功能
 */

import { Router } from 'express';
import { z } from 'zod';

// 验证schemas
const updateConfigSchema = z.object({
    intervalMinutes: z.number().min(1).max(60).optional(),
    maxRetries: z.number().min(1).max(10).optional(),
    timeout: z.number().min(1000).max(60000).optional(),
    pages: z.number().min(1).max(10).optional()
});

const updateFiltersSchema = z.object({
    meteorScore: z.object({
        enabled: z.boolean(),
        min: z.number().optional(),
        max: z.number().optional()
    }).optional(),
    liquidity: z.object({
        enabled: z.boolean(),
        min: z.number().min(0).optional(),
        max: z.number().min(0).optional()
    }).optional(),
    ageInHours: z.object({
        enabled: z.boolean(),
        min: z.number().min(0).optional(),
        max: z.number().min(0).optional()
    }).optional(),
    fdv: z.object({
        enabled: z.boolean(),
        min: z.number().min(0).optional(),
        max: z.number().min(0).optional()
    }).optional(),
    apr: z.object({
        "24h": z.object({
            enabled: z.boolean(),
            min: z.number().optional(),
            max: z.number().optional()
        }).optional()
    }).optional(),
    volume: z.object({
        "24h": z.object({
            enabled: z.boolean(),
            min: z.number().min(0).optional(),
            max: z.number().min(0).optional()
        }).optional()
    }).optional(),
    tokenWhitelist: z.array(z.string()).optional(),
    tokenBlacklist: z.array(z.string()).optional()
    // 排名筛选已移除 - 不再作为筛选条件
});

const updateTokenFiltersSchema = z.object({
    type: z.enum(['whitelist', 'blacklist']),
    action: z.enum(['add', 'remove', 'clear', 'import']),
    tokens: z.array(z.string()).optional()
});

const updatePoolStatusSchema = z.object({
    poolId: z.string(),
    status: z.enum(['new', 'reviewed', 'favorited', 'ignored']),
    rating: z.number().min(0).max(5).optional(),
    notes: z.string().optional()
});

export function createPoolCrawlerRoutes(services: any) {
    const router = Router();

    // ================== 爬虫控制API ==================

    // 启动爬虫
    router.post('/start', async (req, res) => {
        try {
            await services.poolCrawler.start();

            res.json({
                success: true,
                message: '池爬虫已启动',
                data: {
                    status: services.poolCrawler.getStatus(),
                    timestamp: Date.now()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CRAWLER_START_ERROR'
            });
        }
    });

    // 停止爬虫
    router.post('/stop', async (req, res) => {
        try {
            await services.poolCrawler.stop();

            res.json({
                success: true,
                message: '池爬虫已停止',
                data: {
                    status: services.poolCrawler.getStatus(),
                    timestamp: Date.now()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CRAWLER_STOP_ERROR'
            });
        }
    });

    // 暂停爬虫
    router.post('/pause', async (req, res) => {
        try {
            await services.poolCrawler.pause();

            res.json({
                success: true,
                message: '池爬虫已暂停',
                data: {
                    status: services.poolCrawler.getStatus(),
                    timestamp: Date.now()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CRAWLER_PAUSE_ERROR'
            });
        }
    });

    // 恢复爬虫
    router.post('/resume', async (req, res) => {
        try {
            await services.poolCrawler.resume();

            res.json({
                success: true,
                message: '池爬虫已恢复',
                data: {
                    status: services.poolCrawler.getStatus(),
                    timestamp: Date.now()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CRAWLER_RESUME_ERROR'
            });
        }
    });

    // 立即爬取
    router.post('/crawl-now', async (req, res) => {
        try {
            // 异步执行爬取，立即返回响应
            services.poolCrawler.crawlNow().catch((error: any) => {
                console.error('立即爬取失败:', error);
            });

            res.json({
                success: true,
                message: '立即爬取请求已提交',
                data: {
                    status: services.poolCrawler.getStatus(),
                    timestamp: Date.now()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CRAWLER_CRAWL_NOW_ERROR'
            });
        }
    });

    // ================== 状态查询API ==================

    // 获取爬虫状态
    router.get('/status', async (req, res) => {
        try {
            const status = services.poolCrawler.getStatus();
            const config = services.poolCrawler.getConfig();
            const stats = services.poolCrawler.getStats();

            res.json({
                success: true,
                data: {
                    status,
                    config,
                    stats,
                    timestamp: Date.now()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_STATUS_ERROR'
            });
        }
    });

    // 获取健康检查
    router.get('/health', async (req, res) => {
        try {
            const health = await services.poolCrawler.healthCheck();

            res.json({
                success: true,
                data: health,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'HEALTH_CHECK_ERROR'
            });
        }
    });

    // 获取统计信息
    router.get('/stats', async (req, res) => {
        try {
            const stats = services.poolCrawler.getStats();
            const qualifiedPoolsStats = services.qualifiedPoolsManager.getStats();
            const tokenFilterStats = services.tokenFilterManager.getStats();

            res.json({
                success: true,
                data: {
                    crawler: stats,
                    qualifiedPools: qualifiedPoolsStats,
                    tokenFilters: tokenFilterStats,
                    timestamp: Date.now()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_STATS_ERROR'
            });
        }
    });

    // ================== 池数据查询API ==================

    // 获取已发现的池
    router.get('/pools/discovered', async (req, res) => {
        try {
            const { limit = 50, offset = 0 } = req.query;
            const pools = services.poolCrawler.getDiscoveredPools();

            const total = pools.length;
            const start = Number(offset);
            const end = start + Number(limit);
            const data = pools.slice(start, end);

            res.json({
                success: true,
                data: {
                    pools: data,
                    pagination: {
                        total,
                        limit: Number(limit),
                        offset: Number(offset),
                        hasMore: end < total
                    }
                },
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_DISCOVERED_POOLS_ERROR'
            });
        }
    });

    // 获取合格池
    router.get('/pools/qualified', async (req, res) => {
        try {
            const {
                limit = 50,
                offset = 0,
                status = 'all',
                sortBy = 'discoveredAt',
                sortOrder = 'desc'
            } = req.query;

            let pools = services.qualifiedPoolsManager.getAllPools();

            // 按状态筛选
            if (status !== 'all') {
                pools = pools.filter((pool: any) => pool.status === status);
            }

            // 排序
            pools.sort((a: any, b: any) => {
                const order = sortOrder === 'desc' ? -1 : 1;

                switch (sortBy) {
                    case 'score':
                        return (b.poolData.score - a.poolData.score) * order;
                    case 'discoveredAt':
                        return (b.discoveredAt - a.discoveredAt) * order;
                    case 'liquidity':
                        return (b.poolData.liquidity - a.poolData.liquidity) * order;
                    default:
                        return 0;
                }
            });

            const total = pools.length;
            const start = Number(offset);
            const end = start + Number(limit);
            const data = pools.slice(start, end);

            res.json({
                success: true,
                data: {
                    pools: data,
                    pagination: {
                        total,
                        limit: Number(limit),
                        offset: Number(offset),
                        hasMore: end < total
                    }
                },
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_QUALIFIED_POOLS_ERROR'
            });
        }
    });

    // 搜索池
    router.get('/pools/search', async (req, res) => {
        try {
            const { q } = req.query;

            if (!q || typeof q !== 'string') {
                res.status(400).json({
                    success: false,
                    error: '搜索关键词不能为空',
                    code: 'MISSING_SEARCH_QUERY'
                });
                return;
            }

            const pools = services.qualifiedPoolsManager.searchPools(q);

            res.json({
                success: true,
                data: {
                    pools,
                    query: q,
                    total: pools.length
                },
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'SEARCH_POOLS_ERROR'
            });
        }
    });

    // 获取单个池详情
    router.get('/pools/:poolId', async (req, res) => {
        try {
            const { poolId } = req.params;
            const pool = services.qualifiedPoolsManager.getPool(poolId);

            if (!pool) {
                res.status(404).json({
                    success: false,
                    error: '池不存在',
                    code: 'POOL_NOT_FOUND'
                });
                return;
            }

            res.json({
                success: true,
                data: pool,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_POOL_ERROR'
            });
        }
    });

    // 更新池状态
    router.put('/pools/:poolId', async (req, res) => {
        try {
            const { poolId } = req.params;
            const validatedData = updatePoolStatusSchema.parse(req.body);

            await services.qualifiedPoolsManager.update(poolId, {
                status: validatedData.status,
                rating: validatedData.rating,
                notes: validatedData.notes
            });

            const updatedPool = services.qualifiedPoolsManager.getPool(poolId);

            res.json({
                success: true,
                message: '池状态已更新',
                data: updatedPool,
                timestamp: Date.now()
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '参数验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'UPDATE_POOL_ERROR'
                });
            }
        }
    });

    // 删除池
    router.delete('/pools/:poolId', async (req, res) => {
        try {
            const { poolId } = req.params;
            await services.qualifiedPoolsManager.remove(poolId);

            res.json({
                success: true,
                message: '池已删除',
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'DELETE_POOL_ERROR'
            });
        }
    });

    // ================== 配置管理API ==================

    // 获取爬虫配置
    router.get('/config', async (req, res) => {
        try {
            const config = services.poolCrawler.getConfig();

            res.json({
                success: true,
                data: config,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_CONFIG_ERROR'
            });
        }
    });

    // 更新爬虫配置
    router.put('/config', async (req, res) => {
        try {
            const validatedData = updateConfigSchema.parse(req.body);
            await services.poolCrawler.updateConfig(validatedData);

            const newConfig = services.poolCrawler.getConfig();

            res.json({
                success: true,
                message: '配置已更新',
                data: newConfig,
                timestamp: Date.now()
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '参数验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'UPDATE_CONFIG_ERROR'
                });
            }
        }
    });

    // ================== 筛选器管理API ==================

    // 获取筛选器配置
    router.get('/filters', async (req, res) => {
        try {
            const filters = services.poolCrawler.getFilters();

            res.json({
                success: true,
                data: filters,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_FILTERS_ERROR'
            });
        }
    });

    // 更新筛选器配置
    router.put('/filters', async (req, res) => {
        try {
            const validatedData = updateFiltersSchema.parse(req.body);
            await services.poolCrawler.updateFilters(validatedData);

            const newFilters = services.poolCrawler.getFilters();

            res.json({
                success: true,
                message: '筛选器已更新',
                data: newFilters,
                timestamp: Date.now()
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '参数验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'UPDATE_FILTERS_ERROR'
                });
            }
        }
    });

    // 获取默认筛选器
    router.get('/filters/default', async (req, res) => {
        try {
            const defaultFilters = services.filterEngine.getDefaultFilters();

            res.json({
                success: true,
                data: defaultFilters,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_DEFAULT_FILTERS_ERROR'
            });
        }
    });

    // ================== 代币筛选管理API ==================

    // 获取代币筛选列表
    router.get('/tokens', async (req, res) => {
        try {
            const whitelist = services.tokenFilterManager.getWhitelist();
            const blacklist = services.tokenFilterManager.getBlacklist();
            const stats = services.tokenFilterManager.getStats();
            const suggested = services.tokenFilterManager.getSuggestedTokens();

            res.json({
                success: true,
                data: {
                    whitelist,
                    blacklist,
                    stats,
                    suggested
                },
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_TOKEN_FILTERS_ERROR'
            });
        }
    });

    // 更新代币筛选列表
    router.put('/tokens', async (req, res) => {
        try {
            const validatedData = updateTokenFiltersSchema.parse(req.body);
            const { type, action, tokens = [] } = validatedData;

            switch (action) {
                case 'add':
                    if (type === 'whitelist') {
                        await services.tokenFilterManager.addToWhitelist(tokens);
                    } else {
                        await services.tokenFilterManager.addToBlacklist(tokens);
                    }
                    break;

                case 'remove':
                    if (type === 'whitelist') {
                        await services.tokenFilterManager.removeFromWhitelist(tokens);
                    } else {
                        await services.tokenFilterManager.removeFromBlacklist(tokens);
                    }
                    break;

                case 'clear':
                    if (type === 'whitelist') {
                        await services.tokenFilterManager.clearWhitelist();
                    } else {
                        await services.tokenFilterManager.clearBlacklist();
                    }
                    break;

                case 'import':
                    await services.tokenFilterManager.importTokens(tokens, type);
                    break;
            }

            const whitelist = services.tokenFilterManager.getWhitelist();
            const blacklist = services.tokenFilterManager.getBlacklist();

            res.json({
                success: true,
                message: `代币${type === 'whitelist' ? '白名单' : '黑名单'}已${action === 'add' ? '添加' : action === 'remove' ? '移除' : action === 'clear' ? '清空' : '导入'}`,
                data: {
                    whitelist,
                    blacklist
                },
                timestamp: Date.now()
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '参数验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'UPDATE_TOKEN_FILTERS_ERROR'
                });
            }
        }
    });

    // 验证代币符号
    router.post('/tokens/validate', async (req, res) => {
        try {
            const { token } = req.body;

            if (!token || typeof token !== 'string') {
                res.status(400).json({
                    success: false,
                    error: '代币符号不能为空',
                    code: 'MISSING_TOKEN_SYMBOL'
                });
                return;
            }

            const validation = services.tokenFilterManager.validateTokenSymbol(token);

            res.json({
                success: true,
                data: validation,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'VALIDATE_TOKEN_ERROR'
            });
        }
    });

    // ================== 数据管理API ==================

    // 清空所有数据
    router.post('/data/clear', async (req, res) => {
        try {
            await services.poolCrawler.clearData();

            res.json({
                success: true,
                message: '所有池爬虫数据已清空',
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CLEAR_DATA_ERROR'
            });
        }
    });

    // 导出数据
    router.get('/data/export', async (req, res) => {
        try {
            const data = await services.qualifiedPoolsManager.exportData();

            res.json({
                success: true,
                data,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'EXPORT_DATA_ERROR'
            });
        }
    });

    // 导入数据
    router.post('/data/import', async (req, res) => {
        try {
            const { pools } = req.body;

            if (!Array.isArray(pools)) {
                res.status(400).json({
                    success: false,
                    error: '池数据必须是数组格式',
                    code: 'INVALID_IMPORT_DATA'
                });
                return;
            }

            await services.qualifiedPoolsManager.importData(pools);

            res.json({
                success: true,
                message: `已成功导入 ${pools.length} 个池记录`,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'IMPORT_DATA_ERROR'
            });
        }
    });

    return router;
} 