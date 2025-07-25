/**
 * 🎯 本地私钥钱包管理器
 * 协调钱包核心逻辑和UI组件，管理整个钱包系统
 */

// 简化的事件发射器
class SimpleEventEmitter {
    constructor() {
        this.listeners = {};
    }

    on(eventName, listener) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(listener);
    }

    off(eventName, listener) {
        if (!this.listeners[eventName]) return;
        const index = this.listeners[eventName].indexOf(listener);
        if (index > -1) {
            this.listeners[eventName].splice(index, 1);
        }
    }

    emit(eventName, ...args) {
        if (this.listeners[eventName]) {
            this.listeners[eventName].forEach(listener => {
                try {
                    listener(...args);
                } catch (error) {
                    console.error(`事件监听器错误 [${eventName}]:`, error);
                }
            });
        }
    }

    removeAllListeners() {
        this.listeners = {};
    }
}

// 简化的日志器
class SimpleLogger {
    constructor(context) {
        this.context = context;
    }

    info(message, ...args) {
        console.log(`[${this.context}] ${message}`, ...args);
    }

    error(message, ...args) {
        console.error(`[${this.context}] ${message}`, ...args);
    }

    warn(message, ...args) {
        console.warn(`[${this.context}] ${message}`, ...args);
    }
}

// 简化的通知函数
function showSuccess(title, message) {
    if (window.dlmmApp && window.dlmmApp.notification) {
        window.dlmmApp.notification.showSuccess(title, message);
    } else {
        console.log(`[SUCCESS] ${title}: ${message}`);
    }
}

function showError(title, message) {
    if (window.dlmmApp && window.dlmmApp.notification) {
        window.dlmmApp.notification.showError(title, message);
    } else {
        console.error(`[ERROR] ${title}: ${message}`);
    }
}

function showWarning(title, message) {
    if (window.dlmmApp && window.dlmmApp.notification) {
        window.dlmmApp.notification.showWarning(title, message);
    } else {
        console.warn(`[WARNING] ${title}: ${message}`);
    }
}

function showInfo(title, message) {
    if (window.dlmmApp && window.dlmmApp.notification) {
        window.dlmmApp.notification.showInfo(title, message);
    } else {
        console.info(`[INFO] ${title}: ${message}`);
    }
}

class WalletManager extends SimpleEventEmitter {
    constructor() {
        super();
        this.core = null;
        this.ui = null;
        this.forms = null;
        this.logger = new SimpleLogger('WalletManager');

        this.state = {
            isInitialized: false,
            currentContainer: null,
            autoRefreshEnabled: true,
            lastActivity: Date.now()
        };

        this.metrics = {
            initTime: 0,
            operationCount: 0,
            errorCount: 0
        };

        // 绑定方法上下文
        this.bindMethods();
    }

    /**
     * 绑定方法上下文
     */
    bindMethods() {
        this.handleCoreEvent = this.handleCoreEvent.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    }

    /**
     * 初始化钱包管理器
     */
    async init(containerId = 'walletContainer') {
        const startTime = Date.now();

        try {
            this.logger.info('开始初始化本地私钥钱包管理器');

            // 确保依赖已加载
            await this.ensureDependencies();

            // 初始化核心和UI组件
            this.core = new WalletCore();
            this.ui = new WalletUI(this.core);

            // 关键顺序调整：
            // 1. 先渲染UI，确保所有DOM元素都已准备就绪
            this.ui.render(containerId);

            // 2. 再绑定事件，让渲染好的UI可以监听后续事件
            this.bindEvents();

            // 3. 最后初始化核心，核心现在可以安全地触发事件
            await this.core.init();

            // 更新状态
            this.state.isInitialized = true;
            this.state.currentContainer = containerId;
            this.metrics.initTime = Date.now() - startTime;

            this.logger.info(`钱包管理器初始化完成，耗时: ${this.metrics.initTime}ms`);
            this.emit('initialized', {
                containerId,
                initTime: this.metrics.initTime
            });

            return true;
        } catch (error) {
            this.metrics.errorCount++;
            this.logger.error('钱包管理器初始化失败:', error);
            this.handleError('INIT_ERROR', error);
            this.emit('init-failed', error);
            return false;
        }
    }

    /**
     * 确保依赖已加载
     */
    async ensureDependencies() {
        const requiredClasses = ['WalletCore', 'WalletUI'];
        const missing = [];

        for (const className of requiredClasses) {
            if (!window[className]) {
                missing.push(className);
            }
        }

        if (missing.length > 0) {
            throw new Error(`钱包组件依赖未完全加载: ${missing.join(', ')}`);
        }

        // 等待一帧确保所有脚本完全加载
        await new Promise(resolve => requestAnimationFrame(resolve));
    }

    /**
     * 绑定事件监听
     */
    bindEvents() {
        if (!this.core) return;

        // 监听核心状态变化
        this.core.on('statusUpdated', (data) => {
            this.handleCoreEvent('statusUpdated', data);
        });

        // 监听关键钱包事件
        this.core.on('walletCreated', (data) => {
            this.handleCoreEvent('walletCreated', data);
            this.updateActivity();
        });

        this.core.on('walletImported', (data) => {
            this.handleCoreEvent('walletImported', data);
            this.updateActivity();
        });

        this.core.on('walletUnlocked', (data) => {
            this.handleCoreEvent('walletUnlocked', data);
            this.updateActivity();
        });

        this.core.on('walletLocked', () => {
            this.handleCoreEvent('walletLocked');
        });

        this.core.on('walletDeleted', () => {
            this.handleCoreEvent('walletDeleted');
        });

        this.core.on('balancesUpdated', (data) => {
            this.handleCoreEvent('balancesUpdated', data);
            this.updateActivity();
        });

        this.core.on('error', (error) => {
            this.metrics.errorCount++;
            this.handleError('CORE_ERROR', error);
        });

        // 监听页面可见性变化
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        this.logger.info('事件监听器绑定完成');
    }

    /**
     * 处理核心事件
     */
    handleCoreEvent(eventName, data) {
        this.metrics.operationCount++;

        // 记录重要事件
        const importantEvents = [
            'walletCreated', 'walletImported', 'walletUnlocked',
            'walletLocked', 'walletDeleted', 'error'
        ];

        if (importantEvents.includes(eventName)) {
            this.logger.info(`钱包事件: ${eventName}`, data);
        }

        // 转发事件
        this.emit(eventName, data);
    }

    /**
     * 获取钱包状态
     */
    getWalletState() {
        if (!this.core) {
            return {
                hasWallet: false,
                isUnlocked: false,
                walletInfo: null,
                balances: { sol: 0, tokens: [] },
                transactions: []
            };
        }

        return this.core.getWalletState();
    }

    /**
     * 刷新钱包数据
     */
    async refresh() {
        if (!this.core) return false;

        try {
            this.logger.info('刷新钱包数据');
            const success = await this.core.refresh();
            if (success) {
                this.updateActivity();
                this.emit('refreshed');
            }
            return success;
        } catch (error) {
            this.metrics.errorCount++;
            this.logger.error('刷新钱包数据失败:', error);
            this.handleError('REFRESH_ERROR', error);
            return false;
        }
    }

    /**
     * 检查钱包是否可用
     */
    isWalletAvailable() {
        return this.core && this.core.hasWallet() && this.core.isWalletUnlocked();
    }

    /**
     * 获取钱包地址
     */
    getWalletAddress() {
        return this.core ? this.core.getWalletAddress() : null;
    }

    /**
     * 创建钱包
     */
    async createWallet(password, mnemonic = null) {
        if (!this.core) {
            throw new Error('钱包管理器未初始化');
        }

        try {
            const result = await this.core.createWallet(password, mnemonic);
            this.updateActivity();
            return result;
        } catch (error) {
            this.metrics.errorCount++;
            this.handleError('CREATE_ERROR', error);
            throw error;
        }
    }

    /**
     * 导入钱包（助记词）
     */
    async importWalletByMnemonic(mnemonic, password) {
        if (!this.core) {
            throw new Error('钱包管理器未初始化');
        }

        try {
            const result = await this.core.importWalletByMnemonic(mnemonic, password);
            this.updateActivity();
            return result;
        } catch (error) {
            this.metrics.errorCount++;
            this.handleError('IMPORT_ERROR', error);
            throw error;
        }
    }

    /**
     * 导入钱包（私钥）
     */
    async importWalletByPrivateKey(privateKey, password) {
        if (!this.core) {
            throw new Error('钱包管理器未初始化');
        }

        try {
            const result = await this.core.importWalletByPrivateKey(privateKey, password);
            this.updateActivity();
            return result;
        } catch (error) {
            this.metrics.errorCount++;
            this.handleError('IMPORT_ERROR', error);
            throw error;
        }
    }

    /**
     * 解锁钱包
     */
    async unlockWallet(password) {
        if (!this.core) {
            throw new Error('钱包管理器未初始化');
        }

        try {
            const success = await this.core.unlockWallet(password);
            if (success) {
                this.updateActivity();
            }
            return success;
        } catch (error) {
            this.metrics.errorCount++;
            this.handleError('UNLOCK_ERROR', error);
            throw error;
        }
    }

    /**
     * 锁定钱包
     */
    async lockWallet() {
        if (!this.core) {
            throw new Error('钱包管理器未初始化');
        }

        try {
            const success = await this.core.lockWallet();
            return success;
        } catch (error) {
            this.metrics.errorCount++;
            this.handleError('LOCK_ERROR', error);
            throw error;
        }
    }

    /**
     * 删除钱包
     */
    async deleteWallet(password) {
        if (!this.core) {
            throw new Error('钱包管理器未初始化');
        }

        try {
            const success = await this.core.deleteWallet(password);
            return success;
        } catch (error) {
            this.metrics.errorCount++;
            this.handleError('DELETE_ERROR', error);
            throw error;
        }
    }

    /**
     * 获取代币余额
     */
    async getTokenBalance(tokenMint = null) {
        if (!this.isWalletAvailable()) {
            throw new Error('钱包不可用');
        }

        try {
            const balances = this.getWalletState().balances;
            if (tokenMint) {
                // 查找特定代币余额
                const token = balances.tokens?.find(t => t.mint === tokenMint);
                return token ? token.balance : '0';
            } else {
                // 返回SOL余额
                return balances.sol || '0';
            }
        } catch (error) {
            this.logger.error('获取代币余额失败:', error);
            return '0';
        }
    }

    /**
     * 获取SOL余额
     */
    async getSolBalance() {
        return this.getTokenBalance();
    }

    /**
     * 获取所有余额
     */
    getAllBalances() {
        const state = this.getWalletState();
        return state.balances;
    }

    /**
     * 获取交易历史
     */
    async getTransactionHistory(limit = 20) {
        try {
            const state = this.getWalletState();
            return {
                transactions: state.transactions || [],
                total: state.transactions?.length || 0
            };
        } catch (error) {
            this.logger.error('获取交易历史失败:', error);
            return { transactions: [], total: 0 };
        }
    }

    /**
     * 设置自动刷新
     */
    setAutoRefresh(enabled) {
        this.state.autoRefreshEnabled = enabled;
        this.logger.info(`自动刷新${enabled ? '已启用' : '已禁用'}`);
    }

    /**
     * 设置状态变化回调（向后兼容）
     */
    onStateChange(callback) {
        if (typeof callback === 'function') {
            this.on('*', callback);
        }
    }

    /**
     * 设置错误回调（向后兼容）
     */
    onErrorOccurred(callback) {
        if (typeof callback === 'function') {
            this.on('error', callback);
        }
    }

    /**
     * 显示创建钱包表单（向后兼容）
     */
    showCreateWalletForm() {
        if (this.ui) {
            this.ui.showModal('createWalletModal');
        }
    }

    /**
     * 显示导入钱包表单（向后兼容）
     */
    showImportWalletForm() {
        if (this.ui) {
            this.ui.showModal('importWalletModal');
        }
    }

    /**
     * 显示解锁钱包表单（向后兼容）
     */
    showUnlockWalletForm() {
        if (this.ui) {
            this.ui.showModal('unlockWalletModal');
        }
    }

    /**
     * 锁定钱包（向后兼容）
     */
    async lockWallet() {
        return this.lockWallet();
    }

    /**
     * 处理错误
     */
    handleError(type, error) {
        const errorMessage = error.message || error.error || '未知错误';

        this.logger.error(`错误类型: ${type}`, errorMessage);

        // 根据错误类型显示不同的通知
        switch (type) {
            case 'INIT_ERROR':
                showError('初始化失败', '钱包管理器启动失败');
                break;
            case 'CORE_ERROR':
                showError('钱包错误', errorMessage);
                break;
            case 'REFRESH_ERROR':
                showWarning('刷新失败', '无法更新钱包数据');
                break;
            default:
                showError('操作失败', errorMessage);
        }

        this.emit('error', { type, error: errorMessage });
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        const notifications = {
            success: () => showSuccess('操作成功', message),
            error: () => showError('操作失败', message),
            warning: () => showWarning('注意', message),
            info: () => showInfo('提示', message)
        };

        const notification = notifications[type] || notifications.info;
        notification();
    }

    /**
     * 获取管理器状态
     */
    getManagerState() {
        return {
            isInitialized: this.state.isInitialized,
            currentContainer: this.state.currentContainer,
            autoRefreshEnabled: this.state.autoRefreshEnabled,
            lastActivity: this.state.lastActivity
        };
    }

    /**
     * 获取性能指标
     */
    getMetrics() {
        return {
            initTime: this.metrics.initTime,
            operationCount: this.metrics.operationCount,
            errorCount: this.metrics.errorCount,
            uptime: Date.now() - (this.state.lastActivity || Date.now())
        };
    }

    /**
     * 更新活动时间
     */
    updateActivity() {
        this.state.lastActivity = Date.now();
    }

    /**
     * 处理页面可见性变化
     */
    handleVisibilityChange() {
        if (document.hidden) {
            this.logger.info('页面已隐藏，暂停活动');
        } else {
            this.logger.info('页面已显示，恢复活动');
            if (this.state.autoRefreshEnabled && this.isWalletAvailable()) {
                // 页面重新显示时刷新一次数据
                setTimeout(() => {
                    this.refresh();
                }, 1000);
            }
        }
    }

    /**
     * 处理页面卸载前事件
     */
    handleBeforeUnload() {
        // 这个方法暂时保留，但不再主动调用
        this.logger.info('页面即将卸载，执行清理...');
        this.destroy(true); // 传入参数，表示是自动卸载
    }

    /**
     * 重新初始化
     */
    async reinitialize(containerId = 'walletContainer') {
        this.logger.info('重新初始化钱包管理器');
        this.cleanup();
        await this.init(containerId);
    }

    /**
     * 导出钱包数据（向后兼容）
     */
    exportWalletData() {
        const state = this.getWalletState();
        return {
            walletInfo: state.walletInfo,
            balances: state.balances,
            // 不导出敏感数据如私钥
        };
    }

    /**
     * 清理资源
     */
    cleanup() {
        if (this.core) {
            this.core.destroy();
            this.core = null;
        }

        if (this.ui) {
            this.ui.destroy();
            this.ui = null;
        }

        // 清理事件监听器
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);

        this.removeAllListeners();

        this.state.isInitialized = false;
        this.logger.info('钱包管理器资源已清理');
    }

    /**
     * 销毁管理器
     */
    destroy(isUnloading = false) {
        if (!isUnloading) {
            // 如果不是页面卸载，移除所有监听器
            window.removeEventListener('beforeunload', this.handleBeforeUnload);
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        }

        // ... (原有的销毁逻辑)
        if (this.core) {
            this.core.destroy();
            this.core = null;
        }
        if (this.ui) {
            this.ui.destroy();
            this.ui = null;
        }
        this.removeAllListeners();
        this.state.isInitialized = false;

        // 清理全局实例
        if (window.walletManager === this) {
            window.walletManager = null;
        }

        this.logger.info('✅ 钱包管理器已销毁');
    }
}

// 导出到全局
window.WalletManager = WalletManager;
console.log('[WalletManager] 本地私钥钱包管理器已加载'); 