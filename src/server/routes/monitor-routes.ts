/**
 * 📊 监控API路由
 * 提供系统监控、性能统计、实时数据等功能
 */

import { Router } from 'express';

export function createMonitorRoutes(services: any) {
    const router = Router();

    // 获取系统监控数据
    router.get('/system', async (req, res) => {
        try {
            const systemStats = await services.strategyMonitor.getSystemStats();
            res.json({
                success: true,
                data: systemStats
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_SYSTEM_STATS_ERROR'
            });
        }
    });

    // 获取策略监控数据
    router.get('/strategies', async (req, res) => {
        try {
            const strategyStats = await services.strategyMonitor.getStrategyStats();
            res.json({
                success: true,
                data: strategyStats
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_STRATEGY_STATS_ERROR'
            });
        }
    });

    // 获取性能监控数据
    router.get('/performance', async (req, res) => {
        try {
            const performanceStats = await services.strategyMonitor.getPerformanceStats();
            res.json({
                success: true,
                data: performanceStats
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_PERFORMANCE_STATS_ERROR'
            });
        }
    });

    // 获取错误监控数据
    router.get('/errors', async (req, res) => {
        try {
            const errorStats = await services.strategyMonitor.getErrorStats();
            res.json({
                success: true,
                data: errorStats
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_ERROR_STATS_ERROR'
            });
        }
    });

    // 获取预警信息
    router.get('/alerts', async (req, res) => {
        try {
            const alerts = await services.strategyMonitor.getAlerts();
            res.json({
                success: true,
                data: alerts
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_ALERTS_ERROR'
            });
        }
    });

    // 🔧 Gas费用监控数据
    router.get('/gas', async (req, res) => {
        try {
            // 检查GasService是否可用
            if (!services.gas) {
                res.status(503).json({
                    success: false,
                    error: 'GasService不可用',
                    code: 'GAS_SERVICE_UNAVAILABLE'
                });
                return;
            }

            // 获取GasService的完整状态
            const gasHealth = await services.gas.healthCheck();
            const gasSettings = await services.gas.getCurrentGasSettings();
            const gasMetrics = services.gas.getMetrics();
            const networkCongestion = services.gas.getNetworkCongestion();

            res.json({
                success: true,
                data: {
                    health: gasHealth,
                    currentSettings: gasSettings,
                    networkCongestion,
                    metrics: gasMetrics,
                    timestamp: Date.now()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_GAS_STATS_ERROR'
            });
        }
    });

    return router;
} 