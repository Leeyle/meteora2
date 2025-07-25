/**
 * 🏗️ 策略注册表
 * 负责管理所有策略类型的注册、获取和元数据管理
 * 
 * 功能：
 * - 策略类型注册
 * - 策略组件获取
 * - 策略模板管理
 * - 类型验证
 */

class StrategyRegistry {
    constructor() {
        this.strategies = new Map();
        this.templates = new Map();
        this.initialized = false;
    }

    /**
     * 初始化注册表
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // 从后端获取策略模板
            await this.loadTemplatesFromAPI();
            this.initialized = true;
            console.log('✅ 策略注册表初始化完成');
        } catch (error) {
            console.error('❌ 策略注册表初始化失败:', error);
            throw error;
        }
    }

    /**
     * 注册策略类型
     * @param {string} type - 策略类型
     * @param {Object} strategyClass - 策略类
     * @param {Object} config - 策略配置
     */
    register(type, strategyClass, config = {}) {
        if (this.strategies.has(type)) {
            console.warn(`⚠️ 策略类型 ${type} 已存在，将被覆盖`);
        }

        this.strategies.set(type, {
            type,
            class: strategyClass,
            config: {
                name: config.name || type,
                description: config.description || '',
                version: config.version || '1.0.0',
                ...config
            },
            registeredAt: Date.now()
        });

        console.log(`📝 注册策略类型: ${type}`);
    }

    /**
     * 获取策略类
     * @param {string} type - 策略类型
     * @returns {Object|null} 策略类
     */
    getStrategy(type) {
        const strategy = this.strategies.get(type);
        return strategy ? strategy.class : null;
    }

    /**
     * 获取策略配置
     * @param {string} type - 策略类型
     * @returns {Object|null} 策略配置
     */
    getStrategyConfig(type) {
        const strategy = this.strategies.get(type);
        return strategy ? strategy.config : null;
    }

    /**
     * 获取策略模板
     * @param {string} type - 策略类型
     * @returns {Object|null} 策略模板
     */
    getTemplate(type) {
        return this.templates.get(type) || null;
    }

    /**
     * 获取所有已注册的策略类型
     * @returns {Array} 策略类型列表
     */
    getRegisteredTypes() {
        return Array.from(this.strategies.keys());
    }

    /**
     * 获取所有可用的策略模板
     * @returns {Array} 策略模板列表
     */
    getAvailableTemplates() {
        return Array.from(this.templates.values());
    }

    /**
     * 检查策略类型是否已注册
     * @param {string} type - 策略类型
     * @returns {boolean} 是否已注册
     */
    isRegistered(type) {
        return this.strategies.has(type);
    }

    /**
     * 检查策略类型是否有模板
     * @param {string} type - 策略类型
     * @returns {boolean} 是否有模板
     */
    hasTemplate(type) {
        return this.templates.has(type);
    }

    /**
     * 从API加载策略模板
     */
    async loadTemplatesFromAPI() {
        try {
            const response = await window.apiService.request('/strategy/templates');
            if (response.success && response.data) {
                response.data.forEach(template => {
                    this.templates.set(template.id, template);
                });
                console.log(`📋 加载了 ${response.data.length} 个策略模板`);
            }
        } catch (error) {
            console.error('❌ 加载策略模板失败:', error);
            // 使用默认模板作为后备
            this.loadDefaultTemplates();
        }
    }

    /**
     * 加载默认策略模板（后备方案）
     */
    loadDefaultTemplates() {
        const defaultTemplates = [
            {
                id: 'simple_y',
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

        defaultTemplates.forEach(template => {
            this.templates.set(template.id, template);
        });

        console.log('📋 加载默认策略模板');
    }

    /**
     * 获取策略统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            registeredStrategies: this.strategies.size,
            availableTemplates: this.templates.size,
            types: this.getRegisteredTypes(),
            initialized: this.initialized
        };
    }

    /**
     * 清理注册表
     */
    clear() {
        this.strategies.clear();
        this.templates.clear();
        this.initialized = false;
        console.log('🧹 策略注册表已清理');
    }
}

// 创建全局单例
window.StrategyRegistry = window.StrategyRegistry || new StrategyRegistry(); 