/**
 * 🎛️ 监控管理器模块
 * 负责协调监控核心和UI模块，提供统一的监控管理接口
 * 处理模块间通信和生命周期管理
 */

class MonitorManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.monitorCore = null;
        this.monitorUI = null;
        this.isInitialized = false;
        this.eventListeners = new Set();

        // 事件绑定映射
        this.eventBindings = new Map();
    }

    /**
     * 初始化监控管理器
     */
    async init() {
        try {
            console.log('🎛️ 监控管理器初始化开始...');

            // 检查依赖
            if (!window.MonitorCore) {
                throw new Error('MonitorCore未加载');
            }
            if (!window.MonitorUI) {
                throw new Error('MonitorUI未加载');
            }

            // 初始化监控核心
            this.monitorCore = new MonitorCore();
            await this.monitorCore.init();

            // 初始化监控UI
            this.monitorUI = new MonitorUI(this.containerId);
            this.monitorUI.init();

            // 绑定事件
            this.bindEvents();

            // 初始化状态同步
            this.syncInitialState();

            this.isInitialized = true;
            this.emit('initialized');

            console.log('🎛️ 监控管理器初始化完成');

        } catch (error) {
            console.error('监控管理器初始化失败:', error);
            this.emit('error', { type: 'init_error', error });
            throw error;
        }
    }

    /**
     * 绑定所有事件
     */
    bindEvents() {
        // 绑定监控核心事件
        this.bindCoreEvents();

        // 绑定UI事件
        this.bindUIEvents();

        console.log('🔗 监控事件绑定完成');
    }

    /**
     * 绑定监控核心事件
     */
    bindCoreEvents() {
        if (!this.monitorCore) return;

        // 连接状态变化
        this.addEventBinding(
            this.monitorCore.on('connected', () => {
                this.monitorUI?.updateConnectionStatus(true);
                this.emit('connected');
            })
        );

        this.addEventBinding(
            this.monitorCore.on('disconnected', () => {
                this.monitorUI?.updateConnectionStatus(false);
                this.emit('disconnected');
            })
        );

        // 数据更新事件
        this.addEventBinding(
            this.monitorCore.on('systemMetricsUpdated', (metrics) => {
                this.monitorUI?.updateSystemMetrics(metrics);
                this.monitorUI?.updateLastUpdateTime();
            })
        );

        this.addEventBinding(
            this.monitorCore.on('walletStatusUpdated', (status) => {
                this.monitorUI?.updateWalletStatus(status);
            })
        );

        this.addEventBinding(
            this.monitorCore.on('positionMetricsUpdated', (metrics) => {
                this.monitorUI?.updatePositionMetrics(metrics);
            })
        );

        this.addEventBinding(
            this.monitorCore.on('strategyMetricsUpdated', (metrics) => {
                this.monitorUI?.updateStrategyMetrics(metrics);
            })
        );

        this.addEventBinding(
            this.monitorCore.on('alertsUpdated', (alerts) => {
                this.monitorUI?.updateAlerts(alerts);
            })
        );

        this.addEventBinding(
            this.monitorCore.on('logsUpdated', (logs) => {
                this.monitorUI?.updateLogs(logs);
            })
        );

        // 错误处理
        this.addEventBinding(
            this.monitorCore.on('error', (error) => {
                this.handleError('core', error);
            })
        );
    }

    /**
     * 绑定UI事件
     */
    bindUIEvents() {
        if (!this.monitorUI || !this.monitorUI.container) return;

        // 刷新事件
        this.addEventBinding(
            this.monitorUI.container.addEventListener('monitor-ui-refresh', () => {
                this.handleRefresh();
            })
        );

        // 自动刷新切换
        this.addEventBinding(
            this.monitorUI.container.addEventListener('monitor-ui-toggleAutoRefresh', () => {
                this.handleToggleAutoRefresh();
            })
        );

        // 预警操作
        this.addEventBinding(
            this.monitorUI.container.addEventListener('monitor-ui-dismissAlert', (e) => {
                this.handleDismissAlert(e.detail);
            })
        );

        this.addEventBinding(
            this.monitorUI.container.addEventListener('monitor-ui-clearAlerts', () => {
                this.handleClearAlerts();
            })
        );

        // 日志操作
        this.addEventBinding(
            this.monitorUI.container.addEventListener('monitor-ui-filterLogs', (e) => {
                this.handleFilterLogs(e.detail);
            })
        );

        this.addEventBinding(
            this.monitorUI.container.addEventListener('monitor-ui-clearLogs', () => {
                this.handleClearLogs();
            })
        );
    }

    /**
     * 添加事件绑定记录
     */
    addEventBinding(unsubscribe) {
        if (typeof unsubscribe === 'function') {
            this.eventBindings.set(Date.now() + Math.random(), unsubscribe);
        }
    }

    /**
     * 同步初始状态
     */
    syncInitialState() {
        if (!this.monitorCore || !this.monitorUI) return;

        const state = this.monitorCore.getState();

        // 同步连接状态
        this.monitorUI.updateConnectionStatus(state.isConnected);

        // 同步监控数据
        if (state.monitorData) {
            if (state.monitorData.systemMetrics) {
                this.monitorUI.updateSystemMetrics(state.monitorData.systemMetrics);
            }
            if (state.monitorData.walletStatus) {
                this.monitorUI.updateWalletStatus(state.monitorData.walletStatus);
            }
            if (state.monitorData.positionMetrics) {
                this.monitorUI.updatePositionMetrics(state.monitorData.positionMetrics);
            }
            if (state.monitorData.strategyMetrics) {
                this.monitorUI.updateStrategyMetrics(state.monitorData.strategyMetrics);
            }
            if (state.monitorData.alerts) {
                this.monitorUI.updateAlerts(state.monitorData.alerts);
            }
            if (state.monitorData.logs) {
                this.monitorUI.updateLogs(state.monitorData.logs);
            }
        }

        // 更新最后更新时间
        this.monitorUI.updateLastUpdateTime();

        console.log('🔄 监控初始状态同步完成');
    }

    /**
     * 处理刷新操作
     */
    async handleRefresh() {
        try {
            this.emit('refreshStarted');

            if (this.monitorCore) {
                await this.monitorCore.refreshData();
            }

            this.emit('refreshCompleted');
            console.log('🔄 监控数据刷新完成');

        } catch (error) {
            console.error('监控数据刷新失败:', error);
            this.emit('refreshFailed', error);
        }
    }

    /**
     * 处理自动刷新切换
     */
    handleToggleAutoRefresh() {
        if (!this.monitorCore) return;

        this.monitorCore.autoRefresh = !this.monitorCore.autoRefresh;

        if (this.monitorCore.autoRefresh) {
            this.monitorCore.startAutoRefresh();
            console.log('▶️ 自动刷新已启用');
        } else {
            this.monitorCore.stopAutoRefresh();
            console.log('⏸️ 自动刷新已暂停');
        }

        // 更新UI按钮状态
        const toggleBtn = document.getElementById('toggle-auto-refresh');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            const text = toggleBtn.querySelector('span') || toggleBtn;

            if (this.monitorCore.autoRefresh) {
                icon.className = 'fas fa-pause';
                text.textContent = text.textContent.includes('自动刷新') ? '暂停刷新' : ' 暂停刷新';
            } else {
                icon.className = 'fas fa-play';
                text.textContent = text.textContent.includes('暂停') ? '自动刷新' : ' 自动刷新';
            }
        }

        this.emit('autoRefreshToggled', this.monitorCore.autoRefresh);
    }

    /**
     * 处理预警dismiss
     */
    handleDismissAlert(alertId) {
        if (!this.monitorCore || !alertId) return;

        // 从核心数据中移除预警
        const alerts = this.monitorCore.monitorData.alerts;
        const index = alerts.findIndex(alert => alert.id === alertId);

        if (index !== -1) {
            alerts.splice(index, 1);
            this.monitorUI?.updateAlerts(alerts);
            this.emit('alertDismissed', alertId);
            console.log('✖️ 预警已消除:', alertId);
        }
    }

    /**
     * 处理清空预警
     */
    handleClearAlerts() {
        if (!this.monitorCore) return;

        this.monitorCore.monitorData.alerts = [];
        this.monitorUI?.updateAlerts([]);
        this.emit('alertsCleared');
        console.log('🗑️ 所有预警已清空');
    }

    /**
     * 处理日志筛选
     */
    handleFilterLogs(level) {
        if (!this.monitorCore) return;

        const allLogs = this.monitorCore.monitorData.logs;
        let filteredLogs = allLogs;

        if (level && level !== 'all') {
            filteredLogs = allLogs.filter(log => log.level === level);
        }

        this.monitorUI?.updateLogs(filteredLogs);
        this.emit('logsFiltered', { level, count: filteredLogs.length });
        console.log(`🔍 日志筛选: ${level}, 显示 ${filteredLogs.length} 条`);
    }

    /**
     * 处理清空日志
     */
    handleClearLogs() {
        if (!this.monitorCore) return;

        this.monitorCore.monitorData.logs = [];
        this.monitorUI?.updateLogs([]);
        this.emit('logsCleared');
        console.log('🗑️ 所有日志已清空');
    }

    /**
     * 处理错误
     */
    handleError(source, error) {
        console.error(`监控${source}错误:`, error);
        this.emit('error', { source, error });
    }

    /**
     * 获取监控状态
     */
    getStatus() {
        if (!this.isInitialized) {
            return {
                initialized: false,
                connected: false,
                autoRefresh: false
            };
        }

        const coreState = this.monitorCore?.getState();

        return {
            initialized: this.isInitialized,
            connected: coreState?.isConnected || false,
            autoRefresh: coreState?.autoRefresh || false,
            lastUpdate: coreState?.lastUpdate || null,
            monitorData: coreState?.monitorData || {},
            performanceMetrics: coreState?.performanceMetrics || {}
        };
    }

    /**
     * 手动添加预警
     */
    addAlert(alert) {
        if (this.monitorCore) {
            this.monitorCore.addAlert(alert);
        }
    }

    /**
     * 手动添加日志
     */
    addLog(log) {
        if (this.monitorCore) {
            this.monitorCore.addLog(log);
        }
    }

    /**
     * 导出监控数据
     */
    exportData() {
        if (!this.monitorCore) return null;

        const state = this.monitorCore.getState();
        const exportData = {
            timestamp: new Date().toISOString(),
            system: state.monitorData.systemMetrics,
            wallet: state.monitorData.walletStatus,
            positions: state.monitorData.positionMetrics,
            strategies: state.monitorData.strategyMetrics,
            alerts: state.monitorData.alerts,
            logs: state.monitorData.logs,
            performance: state.performanceMetrics
        };

        return exportData;
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
                    console.error('监控管理器事件监听器错误:', error);
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
     * 销毁监控管理器
     */
    destroy() {
        // 清理事件绑定
        this.eventBindings.forEach(unsubscribe => {
            try {
                unsubscribe();
            } catch (error) {
                console.error('清理事件绑定失败:', error);
            }
        });
        this.eventBindings.clear();

        // 销毁子模块
        if (this.monitorCore) {
            this.monitorCore.destroy();
            this.monitorCore = null;
        }

        if (this.monitorUI) {
            this.monitorUI.destroy();
            this.monitorUI = null;
        }

        // 清理事件监听器
        this.removeAllListeners();

        this.isInitialized = false;

        console.log('🎛️ 监控管理器已销毁');
    }
}

/**
 * 创建监控管理器实例的工厂函数
 */
function createMonitorManager(containerId) {
    return new MonitorManager(containerId);
}

// 导出监控管理器类和工厂函数
window.MonitorManager = MonitorManager;
window.createMonitorManager = createMonitorManager; 