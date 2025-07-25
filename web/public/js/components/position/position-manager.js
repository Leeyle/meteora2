/**
 * 📈 头寸管理器主组件
 * 整合头寸核心逻辑和UI渲染的主管理器
 * 遵循模块化架构，单一职责原则
 */

class PositionManager {
    constructor() {
        this.core = null;
        this.ui = null;
        this.isInitialized = false;

        // 事件回调
        this.onPositionStateChange = null;
        this.onError = null;
    }

    /**
     * 初始化头寸管理器
     */
    async init(containerId = 'positionsContainer') {
        try {
            console.log('📈 初始化头寸管理器...');

            // 确保依赖已加载
            if (!window.PositionCore || !window.PositionUI) {
                throw new Error('头寸组件依赖未完全加载');
            }

            // 初始化核心逻辑
            this.core = new PositionCore();

            // 初始化UI组件
            this.ui = new PositionUI(this.core);

            // 绑定事件监听
            this.bindEvents();

            // 初始化子组件
            await this.core.init();
            this.ui.render(containerId);

            this.isInitialized = true;
            console.log('✅ 头寸管理器初始化完成');

            return true;
        } catch (error) {
            console.error('❌ 头寸管理器初始化失败:', error);
            this.handleError('INIT_ERROR', error);
            return false;
        }
    }

    /**
     * 绑定事件监听
     */
    bindEvents() {
        // 监听核心状态变化
        this.core.on('*', (eventName, data) => {
            this.handleCoreEvent(eventName, data);
        });

        // 监听窗口关闭事件，确保资源清理
        window.addEventListener('beforeunload', () => {
            this.destroy();
        });
    }

    /**
     * 处理核心事件
     */
    handleCoreEvent(eventName, data) {
        // 记录重要事件
        const importantEvents = [
            'positionCreated', 'positionClosed', 'positionDeleted',
            'feesCollected', 'batchFeesCollected', 'error'
        ];

        if (importantEvents.includes(eventName)) {
            console.log(`📈 头寸事件: ${eventName}`, data);
        }

        // 触发自定义回调
        if (this.onPositionStateChange && eventName !== 'error') {
            try {
                this.onPositionStateChange(eventName, data);
            } catch (error) {
                console.error('状态变化回调错误:', error);
            }
        }

        // 处理错误事件
        if (eventName === 'error' && this.onError) {
            try {
                this.onError(data);
            } catch (error) {
                console.error('错误回调处理失败:', error);
            }
        }
    }

    /**
     * 获取头寸状态
     */
    getPositionState() {
        if (!this.core) {
            return {
                positions: [],
                positionsCount: 0,
                totalValue: 0,
                totalPnL: 0,
                isAutoRefreshing: false,
                lastUpdate: 0
            };
        }
        return this.core.getState();
    }

    /**
     * 手动刷新头寸数据
     */
    async refresh() {
        if (this.core) {
            await this.core.refreshUserPositions();
            return true;
        }
        return false;
    }

    /**
     * 获取所有头寸
     */
    getAllPositions() {
        if (!this.core) return [];
        return this.core.getAllPositions();
    }

    /**
     * 获取指定头寸详情
     */
    getPositionById(positionAddress) {
        if (!this.core) return null;
        return this.core.getPositionById(positionAddress);
    }

    /**
     * 按池地址过滤头寸
     */
    getPositionsByPool(poolAddress) {
        if (!this.core) return [];
        return this.core.getPositionsByPool(poolAddress);
    }

    /**
     * 按状态过滤头寸
     */
    getPositionsByStatus(status) {
        if (!this.core) return [];
        return this.core.getPositionsByStatus(status);
    }

    /**
     * 创建Y头寸
     */
    async createYPosition(poolAddress, amount, binRange, config = {}) {
        if (!this.core) throw new Error('头寸管理器未初始化');
        return await this.core.createYPosition(poolAddress, amount, binRange, config);
    }

    /**
     * 创建X头寸
     */
    async createXPosition(poolAddress, amount, binRange, config = {}) {
        if (!this.core) throw new Error('头寸管理器未初始化');
        return await this.core.createXPosition(poolAddress, amount, binRange, config);
    }

    /**
     * 关闭头寸
     */
    async closePosition(positionAddress) {
        if (!this.core) throw new Error('头寸管理器未初始化');
        return await this.core.closePosition(positionAddress);
    }

    /**
     * 删除头寸
     */
    async deletePosition(positionAddress) {
        if (!this.core) throw new Error('头寸管理器未初始化');
        return await this.core.deletePosition(positionAddress);
    }

    /**
     * 收集单个头寸手续费
     */
    async collectFees(positionAddress) {
        if (!this.core) throw new Error('头寸管理器未初始化');
        return await this.core.collectFees(positionAddress);
    }

    /**
     * 批量收集手续费
     */
    async batchCollectFees(positionAddresses) {
        if (!this.core) throw new Error('头寸管理器未初始化');
        return await this.core.batchCollectFees(positionAddresses);
    }

    /**
     * 获取头寸统计
     */
    async getPositionStats(positionAddress) {
        if (!this.core) throw new Error('头寸管理器未初始化');
        return await this.core.getPositionStats(positionAddress);
    }

    /**
     * 批量操作头寸
     */
    async batchPositionOperation(operation, positionAddresses, params = {}) {
        if (!this.core) throw new Error('头寸管理器未初始化');
        return await this.core.batchPositionOperation(operation, positionAddresses, params);
    }

    /**
     * 启用/禁用自动刷新
     */
    setAutoRefresh(enabled, interval = 30000) {
        if (!this.core) return false;

        if (enabled) {
            this.core.startAutoRefresh(interval);
        } else {
            this.core.stopAutoRefresh();
        }
        return true;
    }

    /**
     * 计算总价值
     */
    calculateTotalValue() {
        if (!this.core) return 0;
        return this.core.calculateTotalValue();
    }

    /**
     * 计算总盈亏
     */
    calculateTotalPnL() {
        if (!this.core) return 0;
        return this.core.calculateTotalPnL();
    }

    /**
     * 设置状态变化回调
     */
    onStateChange(callback) {
        this.onPositionStateChange = callback;
    }

    /**
     * 设置错误处理回调
     */
    onErrorOccurred(callback) {
        this.onError = callback;
    }

    /**
     * 处理错误
     */
    handleError(type, error) {
        const errorInfo = {
            type,
            message: error.message || '未知错误',
            timestamp: new Date().toISOString(),
            error
        };

        console.error(`🚨 头寸管理器错误 [${type}]:`, error);

        // 根据错误类型进行特殊处理
        switch (type) {
            case 'INIT_ERROR':
                this.showNotification('头寸管理器初始化失败', 'error');
                break;
            case 'POSITION_CREATE_ERROR':
                this.showNotification('创建头寸失败', 'error');
                break;
            case 'POSITION_OPERATION_ERROR':
                this.showNotification('头寸操作失败', 'error');
                break;
            default:
                this.showNotification(`头寸操作失败: ${errorInfo.message}`, 'error');
        }

        // 触发错误回调
        if (this.onError) {
            this.onError(errorInfo);
        }
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * 获取管理器状态
     */
    getManagerState() {
        return {
            isInitialized: this.isInitialized,
            hasCore: !!this.core,
            hasUI: !!this.ui,
            position: this.getPositionState()
        };
    }

    /**
     * 重新初始化（用于错误恢复）
     */
    async reinitialize(containerId = 'positionsContainer') {
        console.log('🔄 重新初始化头寸管理器...');

        // 先销毁现有组件
        this.destroy();

        // 重新初始化
        return await this.init(containerId);
    }

    /**
     * 销毁头寸管理器
     */
    destroy() {
        console.log('🧹 销毁头寸管理器...');

        try {
            // 销毁子组件
            if (this.ui) {
                this.ui.destroy();
                this.ui = null;
            }

            if (this.core) {
                this.core.destroy();
                this.core = null;
            }

            // 重置状态
            this.isInitialized = false;
            this.onPositionStateChange = null;
            this.onError = null;

            console.log('✅ 头寸管理器已销毁');
        } catch (error) {
            console.error('销毁头寸管理器时出错:', error);
        }
    }

    /**
     * 显示创建头寸表单
     */
    async showCreatePositionForm() {
        if (this.ui && this.ui.showCreatePositionModal) {
            await this.ui.showCreatePositionModal();
        } else {
            console.warn('头寸UI未初始化或方法不可用');
        }
    }

    /**
     * 获取头寸管理器状态
     */
    getState() {
        if (!this.core) return null;
        return this.core.getState();
    }
}

// 导出头寸管理器类
window.PositionManager = PositionManager;

// 全局实例（可选）
window.positionManager = null;

/**
 * 创建全局头寸管理器实例
 */
window.createPositionManager = async function (containerId = 'positionsContainer') {
    if (window.positionManager) {
        console.warn('头寸管理器已存在，将重新初始化');
        window.positionManager.destroy();
    }

    window.positionManager = new PositionManager();
    const success = await window.positionManager.init(containerId);

    if (!success) {
        window.positionManager = null;
        return null;
    }

    return window.positionManager;
}; 