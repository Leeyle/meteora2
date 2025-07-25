/**
 * 🎯 策略管理API路由
 * 提供策略创建、启动、停止、监控等功能
 */

import { Router } from 'express';
import { IStrategyManager } from '../../services/strategy/StrategyManager';

export function createStrategyRoutes(services: { strategyManager: IStrategyManager }) {
    const router = Router();

    // 获取所有策略
    router.get('/list', async (req, res) => {
        try {
            const instances = services.strategyManager.listInstances();
            res.json({
                success: true,
                data: instances
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_STRATEGIES_ERROR'
            });
        }
    });

    // 创建新策略
    router.post('/create', async (req, res) => {
        try {
            const { type, name, config } = req.body;

            // 🔧 创建策略实例
            const instanceId = await services.strategyManager.createInstance(type, name, config);

            // 🚀 创建后自动启动策略
            try {
                await services.strategyManager.startInstance(instanceId);

                res.json({
                    success: true,
                    data: {
                        instanceId,
                        status: 'running',
                        message: '策略创建并启动成功'
                    }
                });
            } catch (startError: any) {
                // 如果启动失败，返回创建成功但启动失败的信息
                res.json({
                    success: true,
                    data: {
                        instanceId,
                        status: 'created',
                        message: '策略创建成功，但启动失败',
                        startError: startError.message
                    }
                });
            }

        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'CREATE_STRATEGY_ERROR'
            });
        }
    });

    // 启动策略
    router.post('/:instanceId/start', async (req, res) => {
        try {
            const { instanceId } = req.params;
            await services.strategyManager.startInstance(instanceId);

            res.json({
                success: true,
                data: { instanceId, status: 'started' }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'START_STRATEGY_ERROR'
            });
        }
    });

    // 停止策略
    router.post('/:instanceId/stop', async (req, res) => {
        try {
            const { instanceId } = req.params;
            await services.strategyManager.stopInstance(instanceId);

            res.json({
                success: true,
                data: { instanceId, status: 'stopped' }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'STOP_STRATEGY_ERROR'
            });
        }
    });

    // 暂停策略
    router.post('/:instanceId/pause', async (req, res) => {
        try {
            const { instanceId } = req.params;
            await services.strategyManager.pauseInstance(instanceId);

            res.json({
                success: true,
                data: { instanceId, status: 'paused' }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'PAUSE_STRATEGY_ERROR'
            });
        }
    });

    // 恢复策略
    router.post('/:instanceId/resume', async (req, res) => {
        try {
            const { instanceId } = req.params;
            await services.strategyManager.resumeInstance(instanceId);

            res.json({
                success: true,
                data: { instanceId, status: 'running' }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'RESUME_STRATEGY_ERROR'
            });
        }
    });

    // 🛑 手动止损
    router.post('/:instanceId/manual-stop-loss', async (req, res) => {
        try {
            const { instanceId } = req.params;
            await services.strategyManager.executeManualStopLoss(instanceId);

            res.json({
                success: true,
                data: { instanceId, action: 'manual_stop_loss_executed' }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'MANUAL_STOP_LOSS_ERROR'
            });
        }
    });

    // 获取策略状态
    router.get('/:instanceId/status', async (req, res) => {
        try {
            const { instanceId } = req.params;
            const status = services.strategyManager.getInstanceStatus(instanceId);

            res.json({
                success: true,
                data: { instanceId, status }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_STRATEGY_STATUS_ERROR'
            });
        }
    });

    // 删除策略
    router.delete('/:instanceId', async (req, res) => {
        try {
            const { instanceId } = req.params;
            await services.strategyManager.deleteInstance(instanceId);

            res.json({
                success: true,
                data: { instanceId, status: 'deleted' }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'DELETE_STRATEGY_ERROR'
            });
        }
    });

    // 更新策略配置
    router.put('/:instanceId/config', async (req, res) => {
        try {
            const { instanceId } = req.params;
            const config = req.body;

            // 检查策略是否存在且已停止
            const status = services.strategyManager.getInstanceStatus(instanceId);
            if (status !== 'stopped') {
                return res.status(400).json({
                    success: false,
                    error: '只能编辑已停止的策略配置',
                    code: 'STRATEGY_NOT_STOPPED'
                });
            }

            // 更新配置
            await services.strategyManager.updateInstanceConfig(instanceId, config);

            return res.json({
                success: true,
                data: { instanceId, status: 'config_updated' }
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
                code: 'UPDATE_CONFIG_ERROR'
            });
        }
    });

    // 获取策略模板
    router.get('/templates', async (req, res) => {
        try {
            // 返回支持的策略类型模板
            const templates = [
                {
                    id: 'simple-y',
                    name: '简单Y头寸策略',
                    description: '在指定价格范围内建立Y头寸的策略',
                    version: '1.0.0',
                    parameters: [
                        { name: 'poolAddress', type: 'string', required: true, description: '池子地址' },
                        { name: 'yAmount', type: 'number', required: true, description: 'Y代币投入金额' },
                        { name: 'binRange', type: 'number', required: false, default: 69, description: 'Bin范围(1-69)' },
                        { name: 'stopLossCount', type: 'number', required: false, default: 1, description: '止损触发次数' },
                        { name: 'stopLossBinOffset', type: 'number', required: false, default: 35, description: '止损Bin偏移' },
                        { name: 'upwardTimeout', type: 'number', required: false, default: 300, description: '向上超时时间(秒)' },
                        { name: 'downwardTimeout', type: 'number', required: false, default: 60, description: '向下超时时间(秒)' }
                    ]
                }
            ];

            res.json({
                success: true,
                data: templates
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'GET_TEMPLATES_ERROR'
            });
        }
    });

    return router;
} 