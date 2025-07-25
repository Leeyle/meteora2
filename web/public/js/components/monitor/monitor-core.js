/**
 * 👁️ 监控核心模块
 * 负责实时监控数据管理、WebSocket连接和性能指标收集
 * 不包含UI逻辑，专注于数据处理和状态管理
 */

class MonitorCore {
    constructor() {
        this.api = window.dlmmAPI;
        // WebSocket功能已移除，使用轮询更新数据
        this.isConnected = false;
        this.autoRefresh = true;
        this.refreshInterval = null;
        this.eventListeners = new Set();

        // 监控数据
        this.monitorData = {
            systemMetrics: {
                apiLatency: 0,
                memoryUsage: 0,
                cpuUsage: 0,
                uptime: 0,
                activeConnections: 0
            },
            walletStatus: {
                connected: false,
                balance: 0,
                address: null,
                lastUpdate: null
            },
            positionMetrics: {
                totalPositions: 0,
                activePositions: 0,
                totalValue: 0,
                totalPnL: 0,
                lastUpdate: null
            },
            strategyMetrics: {
                totalStrategies: 0,
                runningStrategies: 0,
                pausedStrategies: 0,
                totalPnL: 0,
                lastUpdate: null
            },
            alerts: [],
            logs: []
        };

        // 性能监控
        this.performanceMetrics = {
            apiCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            averageLatency: 0,
            lastCallTime: null
        };

        // 缓存配置
        this.cache = {
            data: new Map(),
            ttl: 30000, // 30秒缓存
            cleanup: null
        };
    }

    /**
     * 初始化监控核心
     */
    async init() {
        try {
            console.log('👁️ 监控核心初始化开始...');

            // WebSocket功能已移除，使用轮询更新数据
            this.isConnected = true; // 标记为已连接，使用API轮询

            // 加载初始数据
            await this.loadInitialData();

            // 启动定时刷新
            this.startAutoRefresh();

            // 启动缓存清理
            this.startCacheCleanup();

            // 启动性能监控
            this.startPerformanceMonitoring();

            this.emit('initialized', this.getState());
            console.log('👁️ 监控核心初始化完成');

        } catch (error) {
            console.error('监控核心初始化失败:', error);
            this.emit('error', { type: 'init_error', error });
            throw error;
        }
    }

    /**
     * WebSocket功能已移除，改用定时轮询
     */

    /**
     * 加载初始监控数据
     */
    async loadInitialData() {
        try {
            // 并行加载所有初始数据
            await Promise.allSettled([
                this.loadSystemMetrics(),
                this.loadWalletStatus(),
                this.loadPositionMetrics(),
                this.loadStrategyMetrics(),
                this.loadRecentAlerts(),
                this.loadRecentLogs()
            ]);

            this.emit('dataLoaded', this.monitorData);
            console.log('📊 监控初始数据加载完成');

        } catch (error) {
            console.error('加载监控数据失败:', error);
            this.emit('error', { type: 'data_load_error', error });
        }
    }

    /**
     * 加载系统指标
     */
    async loadSystemMetrics() {
        try {
            if (this.api && this.api.getSystemMetrics) {
                const response = await this.trackApiCall(() =>
                    this.api.getSystemMetrics()
                );

                if (response.success) {
                    this.updateSystemMetrics(response.data);
                    return response.data;
                }
            }

            // 使用模拟数据
            const mockMetrics = this.generateMockSystemMetrics();
            this.updateSystemMetrics(mockMetrics);
            return mockMetrics;

        } catch (error) {
            console.error('加载系统指标失败:', error);
            return null;
        }
    }

    /**
     * 加载钱包状态
     */
    async loadWalletStatus() {
        try {
            if (this.api && this.api.getWalletInfo) {
                const response = await this.trackApiCall(() =>
                    this.api.getWalletInfo()
                );

                if (response.success) {
                    this.updateWalletStatus(response.data);
                    return response.data;
                }
            }

            // 使用模拟数据
            const mockStatus = this.generateMockWalletStatus();
            this.updateWalletStatus(mockStatus);
            return mockStatus;

        } catch (error) {
            console.error('加载钱包状态失败:', error);
            return null;
        }
    }

    /**
     * 加载头寸指标
     */
    async loadPositionMetrics() {
        try {
            if (this.api && this.api.getUserPositions) {
                const response = await this.trackApiCall(() =>
                    this.api.getUserPositions()
                );

                if (response.success) {
                    const metrics = this.calculatePositionMetrics(response.data.positions);
                    this.updatePositionMetrics(metrics);
                    return metrics;
                }
            }

            // 使用模拟数据
            const mockMetrics = this.generateMockPositionMetrics();
            this.updatePositionMetrics(mockMetrics);
            return mockMetrics;

        } catch (error) {
            console.error('加载头寸指标失败:', error);
            return null;
        }
    }

    /**
     * 加载策略指标
     */
    async loadStrategyMetrics() {
        try {
            if (this.api && this.api.getUserStrategies) {
                const response = await this.trackApiCall(() =>
                    this.api.getUserStrategies()
                );

                if (response.success) {
                    const metrics = this.calculateStrategyMetrics(response.data.strategies);
                    this.updateStrategyMetrics(metrics);
                    return metrics;
                }
            }

            // 使用模拟数据
            const mockMetrics = this.generateMockStrategyMetrics();
            this.updateStrategyMetrics(mockMetrics);
            return mockMetrics;

        } catch (error) {
            console.error('加载策略指标失败:', error);
            return null;
        }
    }

    /**
     * 加载最近预警
     */
    async loadRecentAlerts() {
        try {
            if (this.api && this.api.getRecentAlerts) {
                const response = await this.trackApiCall(() =>
                    this.api.getRecentAlerts()
                );

                if (response.success) {
                    this.monitorData.alerts = response.data.alerts || [];
                    return response.data.alerts;
                }
            }

            // 使用模拟数据
            this.monitorData.alerts = this.generateMockAlerts();
            return this.monitorData.alerts;

        } catch (error) {
            console.error('加载预警数据失败:', error);
            return [];
        }
    }

    /**
     * 加载最近日志
     */
    async loadRecentLogs() {
        try {
            if (this.api && this.api.getRecentLogs) {
                const response = await this.trackApiCall(() =>
                    this.api.getRecentLogs()
                );

                if (response.success) {
                    this.monitorData.logs = response.data.logs || [];
                    return response.data.logs;
                }
            }

            // 使用模拟数据
            this.monitorData.logs = this.generateMockLogs();
            return this.monitorData.logs;

        } catch (error) {
            console.error('加载日志数据失败:', error);
            return [];
        }
    }

    /**
     * 更新系统指标
     */
    updateSystemMetrics(metrics) {
        this.monitorData.systemMetrics = {
            ...this.monitorData.systemMetrics,
            ...metrics,
            lastUpdate: new Date().toISOString()
        };
        this.emit('systemMetricsUpdated', this.monitorData.systemMetrics);
    }

    /**
     * 更新钱包状态
     */
    updateWalletStatus(status) {
        this.monitorData.walletStatus = {
            ...this.monitorData.walletStatus,
            ...status,
            lastUpdate: new Date().toISOString()
        };
        this.emit('walletStatusUpdated', this.monitorData.walletStatus);
    }

    /**
     * 更新头寸指标
     */
    updatePositionMetrics(metrics) {
        this.monitorData.positionMetrics = {
            ...this.monitorData.positionMetrics,
            ...metrics,
            lastUpdate: new Date().toISOString()
        };
        this.emit('positionMetricsUpdated', this.monitorData.positionMetrics);
    }

    /**
     * 更新策略指标
     */
    updateStrategyMetrics(metrics) {
        this.monitorData.strategyMetrics = {
            ...this.monitorData.strategyMetrics,
            ...metrics,
            lastUpdate: new Date().toISOString()
        };
        this.emit('strategyMetricsUpdated', this.monitorData.strategyMetrics);
    }

    /**
     * 添加预警
     */
    addAlert(alert) {
        const alertWithId = {
            id: `alert_${Date.now()}`,
            timestamp: new Date().toISOString(),
            ...alert
        };

        this.monitorData.alerts.unshift(alertWithId);

        // 只保留最近100条预警
        if (this.monitorData.alerts.length > 100) {
            this.monitorData.alerts = this.monitorData.alerts.slice(0, 100);
        }

        this.emit('alertAdded', alertWithId);
        this.emit('alertsUpdated', this.monitorData.alerts);
    }

    /**
     * 添加日志
     */
    addLog(log) {
        const logWithId = {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString(),
            ...log
        };

        this.monitorData.logs.unshift(logWithId);

        // 只保留最近200条日志
        if (this.monitorData.logs.length > 200) {
            this.monitorData.logs = this.monitorData.logs.slice(0, 200);
        }

        this.emit('logAdded', logWithId);
        this.emit('logsUpdated', this.monitorData.logs);
    }

    /**
     * 计算头寸指标
     */
    calculatePositionMetrics(positions) {
        if (!Array.isArray(positions)) return this.generateMockPositionMetrics();

        const totalPositions = positions.length;
        const activePositions = positions.filter(p => p.status === 'active').length;
        const totalValue = positions.reduce((sum, p) => sum + (parseFloat(p.value) || 0), 0);
        const totalPnL = positions.reduce((sum, p) => sum + (parseFloat(p.pnl) || 0), 0);

        return {
            totalPositions,
            activePositions,
            totalValue,
            totalPnL
        };
    }

    /**
     * 计算策略指标
     */
    calculateStrategyMetrics(strategies) {
        if (!Array.isArray(strategies)) return this.generateMockStrategyMetrics();

        const totalStrategies = strategies.length;
        const runningStrategies = strategies.filter(s => s.status === 'running').length;
        const pausedStrategies = strategies.filter(s => s.status === 'paused').length;
        const totalPnL = strategies.reduce((sum, s) => sum + (parseFloat(s.pnl) || 0), 0);

        return {
            totalStrategies,
            runningStrategies,
            pausedStrategies,
            totalPnL
        };
    }

    /**
     * API调用跟踪
     */
    async trackApiCall(apiCall) {
        const startTime = performance.now();
        this.performanceMetrics.apiCalls++;

        try {
            const result = await apiCall();
            const endTime = performance.now();
            const latency = endTime - startTime;

            this.performanceMetrics.successfulCalls++;
            this.updateLatency(latency);

            return result;
        } catch (error) {
            this.performanceMetrics.failedCalls++;
            throw error;
        }
    }

    /**
     * 更新延迟统计
     */
    updateLatency(latency) {
        const totalCalls = this.performanceMetrics.successfulCalls;
        const currentAverage = this.performanceMetrics.averageLatency;

        this.performanceMetrics.averageLatency =
            (currentAverage * (totalCalls - 1) + latency) / totalCalls;
        this.performanceMetrics.lastCallTime = Date.now();

        // 更新系统指标中的API延迟
        this.monitorData.systemMetrics.apiLatency = Math.round(this.performanceMetrics.averageLatency);
    }

    /**
     * 启动自动刷新
     */
    startAutoRefresh(interval = 30000) {
        this.stopAutoRefresh();

        if (this.autoRefresh) {
            this.refreshInterval = setInterval(() => {
                this.refreshData();
            }, interval);

            console.log('🔄 监控自动刷新已启动');
        }
    }

    /**
     * 停止自动刷新
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * 启动缓存清理
     */
    startCacheCleanup() {
        this.cache.cleanup = setInterval(() => {
            const now = Date.now();
            for (const [key, item] of this.cache.data.entries()) {
                if (now - item.timestamp > this.cache.ttl) {
                    this.cache.data.delete(key);
                }
            }
        }, 60000); // 每分钟清理一次
    }

    /**
     * 启动性能监控
     */
    startPerformanceMonitoring() {
        setInterval(() => {
            this.emit('performanceUpdated', this.performanceMetrics);
        }, 10000); // 每10秒更新一次性能指标
    }

    /**
     * 刷新监控数据
     */
    async refreshData() {
        try {
            await this.loadInitialData();
        } catch (error) {
            console.error('刷新监控数据失败:', error);
        }
    }

    /**
     * 获取当前状态
     */
    getState() {
        return {
            isConnected: this.isConnected,
            autoRefresh: this.autoRefresh,
            monitorData: this.monitorData,
            performanceMetrics: this.performanceMetrics,
            lastUpdate: new Date().toISOString()
        };
    }

    /**
     * 生成模拟数据方法
     */
    generateMockSystemMetrics() {
        return {
            apiLatency: Math.floor(Math.random() * 100) + 50,
            memoryUsage: Math.floor(Math.random() * 30) + 40,
            cpuUsage: Math.floor(Math.random() * 20) + 10,
            uptime: Date.now() - (Math.random() * 86400000),
            activeConnections: Math.floor(Math.random() * 10) + 5
        };
    }

    generateMockWalletStatus() {
        return {
            connected: Math.random() > 0.2,
            balance: Math.random() * 1000,
            address: 'mock_wallet_address_' + Math.random().toString(36).substr(2, 9)
        };
    }

    generateMockPositionMetrics() {
        return {
            totalPositions: Math.floor(Math.random() * 10) + 1,
            activePositions: Math.floor(Math.random() * 5) + 1,
            totalValue: Math.random() * 50000 + 10000,
            totalPnL: (Math.random() - 0.5) * 5000
        };
    }

    generateMockStrategyMetrics() {
        return {
            totalStrategies: Math.floor(Math.random() * 5) + 1,
            runningStrategies: Math.floor(Math.random() * 3) + 1,
            pausedStrategies: Math.floor(Math.random() * 2),
            totalPnL: (Math.random() - 0.5) * 3000
        };
    }

    generateMockAlerts() {
        return [
            {
                id: 'alert_1',
                type: 'warning',
                title: '策略收益下降',
                message: '策略A的收益率下降超过5%',
                timestamp: new Date(Date.now() - 3600000).toISOString()
            },
            {
                id: 'alert_2',
                type: 'info',
                title: '新头寸创建',
                message: '成功创建USDC-SOL流动性头寸',
                timestamp: new Date(Date.now() - 7200000).toISOString()
            }
        ];
    }

    generateMockLogs() {
        return [
            {
                id: 'log_1',
                level: 'info',
                message: '系统启动完成',
                timestamp: new Date(Date.now() - 1800000).toISOString()
            },
            {
                id: 'log_2',
                level: 'debug',
                message: 'WebSocket连接已建立',
                timestamp: new Date(Date.now() - 3600000).toISOString()
            }
        ];
    }

    /**
     * 事件发射器
     */
    emit(eventName, data = null) {
        this.eventListeners.forEach(listener => {
            if (listener.event === eventName || listener.event === '*') {
                try {
                    listener.callback(eventName, data);
                } catch (error) {
                    console.error('监控事件监听器错误:', error);
                }
            }
        });
    }

    /**
     * 添加事件监听器
     */
    on(eventName, callback) {
        const listener = { event: eventName, callback };
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
    }

    /**
     * 移除所有事件监听器
     */
    removeAllListeners() {
        this.eventListeners.clear();
    }

    /**
     * 销毁监控核心
     */
    destroy() {
        this.stopAutoRefresh();

        if (this.cache.cleanup) {
            clearInterval(this.cache.cleanup);
            this.cache.cleanup = null;
        }

        this.cache.data.clear();
        this.removeAllListeners();

        this.monitorData = {
            systemMetrics: {},
            walletStatus: {},
            positionMetrics: {},
            strategyMetrics: {},
            alerts: [],
            logs: []
        };

        console.log('👁️ 监控核心已销毁');
    }
}

// 导出监控核心类
window.MonitorCore = MonitorCore; 