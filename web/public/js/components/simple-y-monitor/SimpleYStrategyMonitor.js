/**
 * 📊 简单Y策略监控器 - 模块化重构版本
 * 专门用于监控简单Y策略的运行状态
 * 完全复刻连锁头寸监控器的功能，适配简单Y策略
 * 使用模块化架构提高可维护性和扩展性
 */
class SimpleYStrategyMonitor {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        this.options = {
            autoConnect: true,
            reconnectInterval: 3000,
            maxReconnectAttempts: 5,
            showNotifications: true,
            ...options
        };

        // 模块化组件
        this.environmentAdapter = null;
        this.connectionManager = null;
        this.dataService = null;
        this.uiManager = null;
        this.strategyController = null;
        this.configManager = null;

        // 初始化状态
        this.isInitialized = false;
        this.isDestroyed = false;

        // 初始化
        this.init();
    }

    /**
     * 初始化监控器
     */
    async init() {
        try {
            console.log('🔥 初始化策略监控器 - 模块化版本');

            if (this.isDestroyed) {
                console.warn('⚠️ 监控器已销毁，无法初始化');
                return;
            }

            // 1. 初始化环境适配器
            this.environmentAdapter = new SimpleYEnvironmentAdapter();

            // 2. 初始化连接管理器（等待异步初始化完成）
            this.connectionManager = new SimpleYConnectionManager(this.environmentAdapter, {
                autoConnect: false, // 手动控制连接
                reconnectInterval: this.options.reconnectInterval,
                maxReconnectAttempts: this.options.maxReconnectAttempts
            });

            // 🔧 等待连接管理器完成初始化（包括Socket.IO库加载）
            console.log('⏳ 等待连接管理器初始化完成...');
            // ConnectionManager的init()是在构造函数中异步调用的，我们需要等待它完成
            await this.waitForConnectionManagerReady();

            // 3. 初始化数据服务
            this.dataService = new SimpleYDataService(this.environmentAdapter);

            // 4. 初始化UI管理器
            this.uiManager = new SimpleYUIManager(this.container, {
                showNotifications: this.options.showNotifications
            });

            // 5. 初始化策略控制器
            this.strategyController = new SimpleYStrategyController(
                this.dataService,
                this.uiManager,
                this.options
            );

            // 6. 设置模块间通信
            this.setupModuleCommunication();

            // 7. 连接Socket.IO（如果启用自动连接）
            if (this.options.autoConnect) {
                await this.connect();
            }

            this.isInitialized = true;
            console.log('✅ 策略监控器初始化完成');

        } catch (error) {
            console.error('❌ 策略监控器初始化失败:', error);
            this.handleInitializationError(error);
        }
    }

    /**
     * 等待连接管理器就绪
     */
    async waitForConnectionManagerReady() {
        try {
            console.log('⏳ 等待连接管理器初始化完成...');

            // 使用ConnectionManager的初始化Promise
            const isReady = await this.connectionManager.waitForInitialization();

            if (isReady) {
                console.log('✅ 连接管理器就绪，Socket.IO库已加载');
            } else {
                throw new Error('连接管理器初始化失败');
            }
        } catch (error) {
            console.error('❌ 等待连接管理器就绪失败:', error);
            throw error;
        }
    }

    /**
     * 设置模块间通信
     */
    setupModuleCommunication() {
        console.log('🔗 设置模块间通信');

        // 连接管理器 → 策略控制器
        this.connectionManager.on('connection:connected', (data) => {
            console.log('📡 连接已建立:', data);
            this.uiManager.updateConnectionStatus('connected', '已连接');
        });

        this.connectionManager.on('connection:disconnected', (data) => {
            console.log('📡 连接已断开:', data);
            this.uiManager.updateConnectionStatus('disconnected', '连接断开');
        });

        this.connectionManager.on('connection:error', (data) => {
            console.log('📡 连接错误:', data);
            this.uiManager.updateConnectionStatus('error',
                `连接错误 (${data.attempts}/${data.maxAttempts})`);
        });

        this.connectionManager.on('connection:reconnected', (data) => {
            console.log('📡 重连成功:', data);
            this.uiManager.updateConnectionStatus('reconnected', '重连成功');
        });

        this.connectionManager.on('connection:failed', (data) => {
            console.log('📡 连接失败:', data);
            this.uiManager.updateConnectionStatus('failed', '连接失败');
        });

        this.connectionManager.on('subscription:confirmed', (data) => {
            console.log('📡 订阅确认:', data);
            this.uiManager.updateConnectionStatus('subscribed', '监控中');

            // 订阅成功后请求策略列表
            this.strategyController.requestStrategyList();
        });

        // 实时数据更新
        this.connectionManager.on('data:smart-stop-loss', (data) => {
            this.strategyController.handleSmartStopLossUpdate(data);
        });

        this.connectionManager.on('data:status-update', (data) => {
            this.strategyController.handleStrategyStatusUpdate(data);
        });

        // 策略控制器 → 连接管理器
        this.strategyController.on('controller:reconnect-requested', () => {
            this.reconnect();
        });

        console.log('✅ 模块间通信设置完成');
    }

    /**
     * 连接Socket.IO服务器
     */
    async connect() {
        try {
            console.log('🔌 开始连接Socket.IO服务器...');

            if (!this.connectionManager) {
                throw new Error('连接管理器未初始化');
            }

            // 确保连接管理器已完全初始化
            if (!this.connectionManager.isInitialized) {
                console.log('⏳ 连接管理器尚未就绪，等待初始化完成...');
                await this.connectionManager.waitForInitialization();
            }

            await this.connectionManager.connect();
            console.log('✅ Socket.IO连接请求已发送');

        } catch (error) {
            console.error('❌ Socket.IO连接失败:', error);
            this.uiManager.showNotification('连接失败: ' + error.message, 'error');
        }
    }

    /**
     * 重连
     */
    reconnect() {
        console.log('🔄 重连Socket.IO...');

        if (this.connectionManager) {
            this.connectionManager.reconnect();
        } else {
            console.warn('⚠️ 连接管理器未初始化，无法重连');
        }
    }

    /**
     * 断开连接
     */
    disconnect() {
        console.log('🔌 断开Socket.IO连接');

        if (this.connectionManager) {
            this.connectionManager.disconnect();
        }
    }

    /**
     * 处理初始化错误
     */
    handleInitializationError(error) {
        console.error('❌ 处理初始化错误:', error);

        // 显示错误通知
        if (this.uiManager) {
            this.uiManager.showNotification('监控器初始化失败: ' + error.message, 'error');
        }

        // 清理已初始化的组件
        this.cleanup();
    }

    /**
     * 清理组件
     */
    cleanup() {
        console.log('🧹 清理组件');

        try {
            if (this.strategyController) {
                this.strategyController.destroy();
                this.strategyController = null;
            }

            if (this.uiManager) {
                this.uiManager.destroy();
                this.uiManager = null;
            }

            if (this.dataService) {
                this.dataService.destroy();
                this.dataService = null;
            }

            if (this.connectionManager) {
                this.connectionManager.destroy();
                this.connectionManager = null;
            }

            this.environmentAdapter = null;
            this.configManager = null;

        } catch (error) {
            console.error('❌ 清理组件失败:', error);
        }
    }

    /**
     * 获取连接状态
     */
    getConnectionStatus() {
        if (!this.connectionManager) {
            return {
                isConnected: false,
                status: 'not_initialized'
            };
        }

        return this.connectionManager.getConnectionStatus();
    }

    /**
     * 获取策略统计信息
     */
    getStatistics() {
        if (!this.strategyController) {
            return {
                totalStrategies: 0,
                runningStrategies: 0,
                error: '控制器未初始化'
            };
        }

        return this.strategyController.getStatistics();
    }

    /**
     * 手动刷新策略列表
     */
    refreshStrategies() {
        console.log('🔄 手动刷新策略列表');

        if (this.strategyController) {
            this.strategyController.requestStrategyList();
        } else {
            console.warn('⚠️ 策略控制器未初始化，无法刷新');
        }
    }

    /**
     * 批量操作策略
     */
    async batchStrategyOperation(operations) {
        if (!this.strategyController) {
            throw new Error('策略控制器未初始化');
        }

        return await this.strategyController.batchStrategyOperation(operations);
    }

    /**
     * 获取策略详情
     */
    getStrategy(strategyId) {
        if (!this.strategyController) {
            return null;
        }

        return this.strategyController.getStrategy(strategyId);
    }

    /**
     * 获取所有策略
     */
    getAllStrategies() {
        if (!this.strategyController) {
            return [];
        }

        return this.strategyController.getAllStrategies();
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        if (this.uiManager) {
            this.uiManager.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * 设置配置选项
     */
    setOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };

        // 更新各模块配置
        if (this.connectionManager) {
            this.connectionManager.options = {
                ...this.connectionManager.options,
                reconnectInterval: this.options.reconnectInterval,
                maxReconnectAttempts: this.options.maxReconnectAttempts
            };
        }

        if (this.uiManager) {
            this.uiManager.options = {
                ...this.uiManager.options,
                showNotifications: this.options.showNotifications
            };
        }

        console.log('⚙️ 配置选项已更新:', this.options);
    }

    /**
     * 获取完整的调试信息
     */
    getDebugInfo() {
        return {
            isInitialized: this.isInitialized,
            isDestroyed: this.isDestroyed,
            options: this.options,
            connectionStatus: this.getConnectionStatus(),
            statistics: this.getStatistics(),
            modules: {
                environmentAdapter: this.environmentAdapter?.getDebugInfo() || null,
                connectionManager: this.connectionManager?.getDebugInfo() || null,
                dataService: this.dataService?.getDebugInfo() || null,
                uiManager: this.uiManager?.getDebugInfo() || null,
                strategyController: this.strategyController?.getDebugInfo() || null
            }
        };
    }

    /**
     * 检查组件健康状态
     */
    async checkHealth() {
        const health = {
            overall: 'healthy',
            components: {},
            timestamp: Date.now()
        };

        try {
            // 检查环境适配器
            health.components.environmentAdapter = this.environmentAdapter ? 'healthy' : 'missing';

            // 检查连接管理器
            if (this.connectionManager) {
                const connectionStatus = this.connectionManager.getConnectionStatus();
                health.components.connectionManager = connectionStatus.isConnected ? 'healthy' : 'disconnected';
            } else {
                health.components.connectionManager = 'missing';
            }

            // 检查数据服务
            if (this.dataService) {
                const apiHealth = await this.dataService.getAPIHealthStatus();
                health.components.dataService = apiHealth.success ? 'healthy' : 'unhealthy';
            } else {
                health.components.dataService = 'missing';
            }

            // 检查UI管理器
            health.components.uiManager = this.uiManager?.isRendered ? 'healthy' : 'not_rendered';

            // 检查策略控制器
            health.components.strategyController = this.strategyController ? 'healthy' : 'missing';

            // 判断整体健康状态
            const unhealthyComponents = Object.values(health.components)
                .filter(status => status !== 'healthy').length;

            if (unhealthyComponents > 0) {
                health.overall = unhealthyComponents > 2 ? 'critical' : 'warning';
            }

        } catch (error) {
            console.error('❌ 健康检查失败:', error);
            health.overall = 'error';
            health.error = error.message;
        }

        return health;
    }

    /**
     * 重启监控器
     */
    async restart() {
        console.log('🔄 重启策略监控器...');

        try {
            // 销毁现有实例
            this.destroy();

            // 重新初始化
            await this.init();

            this.showNotification('监控器重启成功', 'success');

        } catch (error) {
            console.error('❌ 重启失败:', error);
            this.showNotification('重启失败: ' + error.message, 'error');
        }
    }

    /**
     * 销毁监控器
     */
    destroy() {
        console.log('🧹 销毁策略监控器');

        if (this.isDestroyed) {
            console.warn('⚠️ 监控器已销毁');
            return;
        }

        this.isDestroyed = true;
        this.isInitialized = false;

        // 清理所有组件
        this.cleanup();

        // 清理容器
        if (this.container) {
            this.container.innerHTML = '';
        }

        console.log('✅ 策略监控器已销毁');
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleYStrategyMonitor;
} else if (typeof window !== 'undefined') {
    window.SimpleYStrategyMonitor = SimpleYStrategyMonitor;
} 