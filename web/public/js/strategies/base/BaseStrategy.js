/**
 * 🎯 基础策略类
 * 定义所有策略的通用接口和行为
 * 
 * 功能：
 * - 策略生命周期管理
 * - 通用方法定义
 * - 事件处理
 * - 状态管理
 */

class BaseStrategy {
    constructor(options = {}) {
        this.type = options.type || 'unknown';
        this.config = options.config || {};
        this.template = options.template || null;
        this.containerId = options.containerId || null;
        this.factory = options.factory || null;

        // 状态管理
        this.initialized = false;
        this.destroyed = false;
        this.strategies = [];

        // 事件处理
        this.eventHandlers = new Map();

        // 绑定方法上下文
        this.bindMethods();
    }

    /**
     * 绑定方法上下文
     */
    bindMethods() {
        const methods = [
            'initialize', 'destroy', 'render', 'bindEvents',
            'handleEvent', 'emit', 'on', 'off'
        ];

        methods.forEach(method => {
            if (typeof this[method] === 'function') {
                this[method] = this[method].bind(this);
            }
        });
    }

    /**
     * 初始化策略
     * 子类应该重写此方法
     */
    async initialize() {
        if (this.initialized) return;

        try {
            console.log(`🎯 初始化策略: ${this.type}`);

            // 子类初始化逻辑
            await this.onInitialize();

            this.initialized = true;
            this.emit('initialized', { type: this.type });

        } catch (error) {
            console.error(`❌ 策略初始化失败 (${this.type}):`, error);
            throw error;
        }
    }

    /**
     * 销毁策略
     */
    async destroy() {
        if (this.destroyed) return;

        try {
            console.log(`🗑️ 销毁策略: ${this.type}`);

            // 子类清理逻辑
            await this.onDestroy();

            // 清理事件监听器
            this.eventHandlers.clear();

            this.destroyed = true;
            this.initialized = false;

        } catch (error) {
            console.error(`❌ 策略销毁失败 (${this.type}):`, error);
        }
    }

    /**
     * 渲染策略UI
     * 子类必须实现此方法
     */
    render() {
        throw new Error(`策略 ${this.type} 必须实现 render 方法`);
    }

    /**
     * 绑定事件
     * 子类必须实现此方法
     */
    bindEvents() {
        throw new Error(`策略 ${this.type} 必须实现 bindEvents 方法`);
    }

    /**
     * 获取策略列表
     * 子类必须实现此方法
     */
    async loadStrategies() {
        throw new Error(`策略 ${this.type} 必须实现 loadStrategies 方法`);
    }

    /**
     * 创建策略
     * 子类必须实现此方法
     */
    async createStrategy(config) {
        throw new Error(`策略 ${this.type} 必须实现 createStrategy 方法`);
    }

    /**
     * 启动策略
     * 子类必须实现此方法
     */
    async startStrategy(instanceId) {
        throw new Error(`策略 ${this.type} 必须实现 startStrategy 方法`);
    }

    /**
     * 停止策略
     * 子类必须实现此方法
     */
    async stopStrategy(instanceId) {
        throw new Error(`策略 ${this.type} 必须实现 stopStrategy 方法`);
    }

    /**
     * 删除策略
     * 子类必须实现此方法
     */
    async deleteStrategy(instanceId) {
        throw new Error(`策略 ${this.type} 必须实现 deleteStrategy 方法`);
    }

    /**
     * 子类初始化钩子
     * 子类可以重写此方法
     */
    async onInitialize() {
        // 默认空实现
    }

    /**
     * 子类销毁钩子
     * 子类可以重写此方法
     */
    async onDestroy() {
        // 默认空实现
    }

    /**
     * 事件发射
     * @param {string} eventName - 事件名称
     * @param {*} data - 事件数据
     */
    emit(eventName, data = null) {
        const handlers = this.eventHandlers.get(eventName);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`❌ 事件处理器错误 (${eventName}):`, error);
                }
            });
        }
    }

    /**
     * 监听事件
     * @param {string} eventName - 事件名称
     * @param {Function} handler - 事件处理器
     */
    on(eventName, handler) {
        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, []);
        }
        this.eventHandlers.get(eventName).push(handler);
    }

    /**
     * 移除事件监听
     * @param {string} eventName - 事件名称
     * @param {Function} handler - 事件处理器
     */
    off(eventName, handler) {
        const handlers = this.eventHandlers.get(eventName);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * 显示提示消息
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型
     */
    showToast(message, type = 'info') {
        // 使用全局提示系统
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * 显示确认对话框
     * @param {string} message - 确认消息
     * @param {string} title - 对话框标题
     * @returns {Promise<boolean>} 用户确认结果
     */
    async showConfirmDialog(message, title = '确认操作') {
        return new Promise((resolve) => {
            if (window.showConfirmDialog) {
                window.showConfirmDialog(message, title, resolve);
            } else {
                resolve(confirm(`${title}\n\n${message}`));
            }
        });
    }

    /**
     * 获取容器元素
     * @returns {HTMLElement|null} 容器元素
     */
    getContainer() {
        if (!this.containerId) return null;
        return document.getElementById(this.containerId);
    }

    /**
     * 验证配置
     * @param {Object} config - 配置对象
     * @returns {Object} 验证结果
     */
    validateConfig(config) {
        if (this.factory) {
            return this.factory.validateConfig(this.type, config);
        }
        return { valid: true, errors: [] };
    }

    /**
     * 获取策略信息
     * @returns {Object} 策略信息
     */
    getInfo() {
        return {
            type: this.type,
            initialized: this.initialized,
            destroyed: this.destroyed,
            config: this.config,
            template: this.template,
            containerId: this.containerId
        };
    }

    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.emit('configUpdated', this.config);
    }

    /**
     * 获取默认配置
     * 子类可以重写此方法
     * @returns {Object} 默认配置
     */
    getDefaultConfig() {
        return {};
    }
}

// 导出基础策略类
window.BaseStrategy = BaseStrategy; 