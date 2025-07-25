/**
 * 🎯 统一策略管理器
 * 新架构的入口点，管理所有策略类型
 * 
 * 功能：
 * - 统一策略管理接口
 * - 策略类型路由
 * - 向下兼容现有功能
 * - 支持多策略类型扩展
 */

class UnifiedStrategyManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.registry = null;
        this.factory = null;
        this.currentStrategy = null;
        this.currentStrategyType = 'simple_y'; // 默认使用SimpleY策略
        this.initialized = false;
        this.isInitialized = false; // 添加状态标记

        // 绑定方法上下文
        this.bindMethods();
    }

    /**
     * 绑定方法上下文
     */
    bindMethods() {
        const methods = [
            'initialize', 'switchStrategy', 'render', 'bindEvents',
            'loadStrategies', 'createStrategy', 'startStrategy',
            'stopStrategy', 'deleteStrategy', 'refreshStrategies'
        ];

        methods.forEach(method => {
            if (typeof this[method] === 'function') {
                this[method] = this[method].bind(this);
            }
        });
    }

    /**
     * 初始化管理器
     */
    async initialize() {
        if (this.initialized) return;

        try {
            console.log('🎯 初始化统一策略管理器');

            // 初始化核心组件
            await this.initializeCore();

            // 注册策略类型
            await this.registerStrategies();

            // 创建默认策略实例
            await this.createDefaultStrategy();

            this.initialized = true;
            this.isInitialized = true;
            console.log('✅ 统一策略管理器初始化完成');

        } catch (error) {
            console.error('❌ 统一策略管理器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 初始化核心组件
     */
    async initializeCore() {
        // 获取全局单例实例
        this.registry = window.StrategyRegistry;
        this.factory = window.StrategyFactory;

        if (!this.registry || !this.factory) {
            throw new Error('策略注册表或工厂未初始化');
        }

        // 初始化注册表和工厂
        await this.registry.initialize();
        await this.factory.initialize();
    }

    /**
     * 注册策略类型
     */
    async registerStrategies() {
        // 注册SimpleY策略（保持完全兼容）
        this.registry.register('simple_y', SimpleYStrategy, {
            name: '简单Y头寸策略',
            description: '在指定价格范围内建立Y头寸的策略',
            version: '1.0.0',
            compatible: true
        });

        console.log('📝 策略类型注册完成');
    }

    /**
     * 创建默认策略实例
     */
    async createDefaultStrategy() {
        try {
            // 默认创建SimpleY策略实例，确保向下兼容
            this.currentStrategy = await this.factory.createStrategy(
                this.currentStrategyType,
                {},
                this.containerId
            );

            console.log(`✅ 创建默认策略: ${this.currentStrategyType}`);

        } catch (error) {
            console.error('❌ 创建默认策略失败:', error);
            throw error;
        }
    }

    /**
     * 切换策略类型
     * @param {string} strategyType - 策略类型
     */
    async switchStrategy(strategyType) {
        if (strategyType === this.currentStrategyType && this.currentStrategy) {
            console.log(`策略类型 ${strategyType} 已经是当前策略`);
            return;
        }

        try {
            console.log(`🔄 切换策略类型: ${this.currentStrategyType} → ${strategyType}`);

            // 销毁当前策略实例
            if (this.currentStrategy) {
                await this.currentStrategy.destroy();
                this.currentStrategy = null;
            }

            // 创建新策略实例
            this.currentStrategy = await this.factory.createStrategy(
                strategyType,
                {},
                this.containerId
            );

            this.currentStrategyType = strategyType;

            // 重新渲染和绑定事件
            this.render();
            this.bindEvents();

            console.log(`✅ 策略切换完成: ${strategyType}`);

        } catch (error) {
            console.error(`❌ 策略切换失败 (${strategyType}):`, error);
            throw error;
        }
    }

    /**
     * 渲染当前策略UI
     */
    render() {
        if (!this.currentStrategy) {
            console.error('❌ 当前策略未初始化');
            return;
        }

        try {
            // 直接调用当前策略的render方法
            // 对于SimpleY策略，这会调用原始的render逻辑
            return this.currentStrategy.render();

        } catch (error) {
            console.error('❌ 策略渲染失败:', error);
        }
    }

    /**
     * 绑定当前策略事件
     */
    bindEvents() {
        if (!this.currentStrategy) {
            console.error('❌ 当前策略未初始化');
            return;
        }

        try {
            // 直接调用当前策略的bindEvents方法
            // 对于SimpleY策略，这会调用原始的事件绑定逻辑
            return this.currentStrategy.bindEvents();

        } catch (error) {
            console.error('❌ 策略事件绑定失败:', error);
        }
    }

    /**
     * 获取策略列表
     */
    async loadStrategies() {
        if (!this.currentStrategy) {
            throw new Error('当前策略未初始化');
        }

        return await this.currentStrategy.loadStrategies();
    }

    /**
     * 创建策略
     */
    async createStrategy(config) {
        if (!this.currentStrategy) {
            throw new Error('当前策略未初始化');
        }

        return await this.currentStrategy.createStrategy(config);
    }

    /**
     * 启动策略
     */
    async startStrategy(instanceId) {
        if (!this.currentStrategy) {
            throw new Error('当前策略未初始化');
        }

        return await this.currentStrategy.startStrategy(instanceId);
    }

    /**
     * 停止策略
     */
    async stopStrategy(instanceId) {
        if (!this.currentStrategy) {
            throw new Error('当前策略未初始化');
        }

        return await this.currentStrategy.stopStrategy(instanceId);
    }

    /**
     * 暂停策略
     */
    async pauseStrategy(instanceId) {
        if (!this.currentStrategy) {
            throw new Error('当前策略未初始化');
        }

        return await this.currentStrategy.pauseStrategy(instanceId);
    }

    /**
     * 删除策略
     */
    async deleteStrategy(instanceId) {
        if (!this.currentStrategy) {
            throw new Error('当前策略未初始化');
        }

        return await this.currentStrategy.deleteStrategy(instanceId);
    }

    /**
     * 刷新策略列表
     */
    async refreshStrategies() {
        if (!this.currentStrategy) {
            throw new Error('当前策略未初始化');
        }

        return await this.currentStrategy.refreshStrategies();
    }

    /**
     * 显示创建策略表单
     */
    showCreateStrategyForm() {
        if (!this.currentStrategy) {
            console.error('❌ 当前策略未初始化');
            return;
        }

        return this.currentStrategy.showCreateStrategyForm();
    }

    /**
     * 获取可用策略类型
     */
    getAvailableStrategyTypes() {
        return this.registry.getRegisteredTypes();
    }

    /**
     * 获取当前策略类型
     */
    getCurrentStrategyType() {
        return this.currentStrategyType;
    }

    /**
     * 获取当前策略实例
     */
    getCurrentStrategy() {
        return this.currentStrategy;
    }

    /**
     * 获取策略模板
     */
    getStrategyTemplates() {
        return this.registry.getAvailableTemplates();
    }

    /**
     * 检查策略类型是否支持
     */
    isStrategyTypeSupported(strategyType) {
        return this.registry.isRegistered(strategyType);
    }

    /**
     * 获取管理器统计信息
     */
    getStats() {
        return {
            currentStrategyType: this.currentStrategyType,
            initialized: this.initialized,
            availableTypes: this.getAvailableStrategyTypes(),
            registryStats: this.registry.getStats(),
            factoryStats: this.factory.getStats()
        };
    }

    /**
     * 清理管理器
     */
    async cleanup() {
        try {
            // 销毁当前策略实例
            if (this.currentStrategy) {
                await this.currentStrategy.destroy();
                this.currentStrategy = null;
            }

            // 清理工厂
            await this.factory.cleanup();

            this.initialized = false;
            console.log('🧹 统一策略管理器已清理');

        } catch (error) {
            console.error('❌ 统一策略管理器清理失败:', error);
        }
    }

    /**
     * 向下兼容方法：获取SimpleY策略的原始管理器
     * 提供对现有功能的完全访问
     */
    getSimpleYManager() {
        if (this.currentStrategyType === 'simple_y' && this.currentStrategy) {
            return this.currentStrategy.getOriginalManager();
        }
        return null;
    }

    /**
     * 向下兼容方法：直接调用SimpleY策略的方法
     */
    callSimpleYMethod(methodName, ...args) {
        const simpleYManager = this.getSimpleYManager();
        if (!simpleYManager) {
            throw new Error('SimpleY策略管理器不可用');
        }

        if (typeof simpleYManager[methodName] !== 'function') {
            throw new Error(`方法 ${methodName} 不存在`);
        }

        return simpleYManager[methodName](...args);
    }
}

// 导出统一策略管理器
window.UnifiedStrategyManager = UnifiedStrategyManager; 