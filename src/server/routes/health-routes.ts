/**
 * 🏥 健康检查API路由
 */

import { Router } from 'express';
import { StrategyHealthChecker } from '../../services/strategy/StrategyHealthChecker';

export function createHealthRoutes(services: { healthChecker: StrategyHealthChecker }) {
    const router = Router();

    // 🔍 获取健康检查统计
    router.get('/statistics', async (req, res) => {
        try {
            const statistics = services.healthChecker.getStatistics();

            res.json({
                success: true,
                data: statistics
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_HEALTH_STATISTICS_ERROR'
            });
        }
    });

    // 🔍 手动执行完整健康检查
    router.post('/check', async (req, res) => {
        try {
            const results = await services.healthChecker.performHealthCheck();

            res.json({
                success: true,
                data: {
                    checkTime: Date.now(),
                    results: results,
                    summary: {
                        totalInstances: results.length,
                        healthyCount: results.filter(r => r.status === 'healthy').length,
                        warningCount: results.filter(r => r.status === 'warning').length,
                        criticalCount: results.filter(r => r.status === 'critical').length,
                        errorCount: results.filter(r => r.status === 'error').length,
                        totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
                        autoFixedIssues: results.reduce((sum, r) => sum + r.issues.filter(i => i.autoFixed).length, 0)
                    }
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'PERFORM_HEALTH_CHECK_ERROR'
            });
        }
    });

    // 🔍 检查单个实例
    router.get('/instance/:instanceId', async (req, res) => {
        try {
            const { instanceId } = req.params;
            const result = await services.healthChecker.checkSingleInstance(instanceId);

            res.json({
                success: true,
                data: result
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CHECK_SINGLE_INSTANCE_ERROR'
            });
        }
    });

    // 📊 获取实例健康历史
    router.get('/instance/:instanceId/history', async (req, res) => {
        try {
            const { instanceId } = req.params;
            const history = services.healthChecker.getInstanceHistory(instanceId);

            res.json({
                success: true,
                data: {
                    instanceId,
                    history: history,
                    count: history.length
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_INSTANCE_HISTORY_ERROR'
            });
        }
    });

    // 🔧 强制清理实例
    router.post('/instance/:instanceId/force-cleanup', async (req, res) => {
        try {
            const { instanceId } = req.params;
            const success = await services.healthChecker.forceCleanupInstance(instanceId);

            res.json({
                success: true,
                data: {
                    instanceId,
                    cleaned: success,
                    timestamp: Date.now()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'FORCE_CLEANUP_ERROR'
            });
        }
    });

    // ⚙️ 获取健康检查配置
    router.get('/config', async (req, res) => {
        try {
            const config = services.healthChecker.getConfig();

            res.json({
                success: true,
                data: config
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_HEALTH_CONFIG_ERROR'
            });
        }
    });

    // ⚙️ 更新健康检查配置
    router.put('/config', async (req, res) => {
        try {
            const config = req.body;
            services.healthChecker.updateConfig(config);

            res.json({
                success: true,
                data: {
                    message: '健康检查配置已更新',
                    config: services.healthChecker.getConfig()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'UPDATE_HEALTH_CONFIG_ERROR'
            });
        }
    });

    // 🏥 健康检查状态概览
    router.get('/overview', async (req, res) => {
        try {
            const statistics = services.healthChecker.getStatistics();
            const config = services.healthChecker.getConfig();

            // 计算健康评分
            const totalInstances = statistics.totalInstances;
            const healthScore = totalInstances > 0
                ? Math.round((statistics.healthyInstances / totalInstances) * 100)
                : 100;

            // 确定整体状态
            let overallStatus = 'healthy';
            if (statistics.criticalInstances > 0) {
                overallStatus = 'critical';
            } else if (statistics.errorInstances > 0) {
                overallStatus = 'error';
            } else if (statistics.warningInstances > 0) {
                overallStatus = 'warning';
            }

            res.json({
                success: true,
                data: {
                    overview: {
                        overallStatus,
                        healthScore,
                        lastCheckTime: statistics.lastCheckTime,
                        checkCount: statistics.checkCount,
                        isEnabled: config.enabled,
                        autoFixEnabled: config.autoFix
                    },
                    statistics,
                    config: {
                        enabled: config.enabled,
                        checkInterval: config.checkInterval,
                        autoFix: config.autoFix,
                        stoppingTimeout: config.stoppingTimeout
                    }
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_HEALTH_OVERVIEW_ERROR'
            });
        }
    });

    return router;
} 