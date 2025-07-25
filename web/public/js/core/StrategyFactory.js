/**
 * 🏭 策略工厂
 * 负责根据策略类型创建对应的策略实例
 * 
 * 功能：
 * - 策略实例创建
 * - 策略组件管理
 * - 依赖注入
 * - 生命周期管理
 */

class StrategyFactory {
    constructor() {
        this.registry = window.StrategyRegistry;
        this.instances = new Map();
        this.initialized = false;
    }

    /**
     * 初始化工厂
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // 确保注册表已初始化
            await this.registry.initialize();
            this.initialized = true;
            console.log('✅ 策略工厂初始化完成');
        } catch (error) {
            console.error('❌ 策略工厂初始化失败:', error);
            throw error;
        }
    }

    /**
     * 创建策略实例
     * @param {string} type - 策略类型
     * @param {Object} config - 策略配置
     * @param {string} containerId - 容器ID
     * @returns {Object|null} 策略实例
     */
    async createStrategy(type, config = {}, containerId = null) {
        try {
            // 检查策略类型是否已注册
            if (!this.registry.isRegistered(type)) {
                throw new Error(`策略类型 ${type} 未注册`);
            }

            // 获取策略类
            const StrategyClass = this.registry.getStrategy(type);
            if (!StrategyClass) {
                throw new Error(`无法获取策略类: ${type}`);
            }

            // 获取策略模板
            const template = this.registry.getTemplate(type);

            // 合并配置
            const finalConfig = this.mergeConfig(template, config);

            // 创建策略实例
            const instance = new StrategyClass({
                type,
                config: finalConfig,
                template,
                containerId,
                factory: this
            });

            // 初始化实例
            if (typeof instance.initialize === 'function') {
                await instance.initialize();
            }

            // 缓存实例
            const instanceId = this.generateInstanceId(type);
            this.instances.set(instanceId, {
                id: instanceId,
                type,
                instance,
                config: finalConfig,
                createdAt: Date.now(),
                containerId
            });

            console.log(`🎯 创建策略实例: ${type} (${instanceId})`);
            return instance;

        } catch (error) {
            console.error(`❌ 创建策略实例失败 (${type}):`, error);
            throw error;
        }
    }

    /**
     * 获取策略实例
     * @param {string} instanceId - 实例ID
     * @returns {Object|null} 策略实例
     */
    getInstance(instanceId) {
        const instanceData = this.instances.get(instanceId);
        return instanceData ? instanceData.instance : null;
    }

    /**
     * 销毁策略实例
     * @param {string} instanceId - 实例ID
     */
    async destroyInstance(instanceId) {
        const instanceData = this.instances.get(instanceId);
        if (!instanceData) return;

        try {
            // 调用实例的清理方法
            if (typeof instanceData.instance.destroy === 'function') {
                await instanceData.instance.destroy();
            }

            // 从缓存中移除
            this.instances.delete(instanceId);
            console.log(`🗑️ 销毁策略实例: ${instanceId}`);

        } catch (error) {
            console.error(`❌ 销毁策略实例失败 (${instanceId}):`, error);
        }
    }

    /**
     * 获取所有实例
     * @returns {Array} 实例列表
     */
    getAllInstances() {
        return Array.from(this.instances.values());
    }

    /**
     * 根据类型获取实例
     * @param {string} type - 策略类型
     * @returns {Array} 实例列表
     */
    getInstancesByType(type) {
        return Array.from(this.instances.values())
            .filter(instanceData => instanceData.type === type);
    }

    /**
     * 合并配置
     * @param {Object} template - 策略模板
     * @param {Object} userConfig - 用户配置
     * @returns {Object} 合并后的配置
     */
    mergeConfig(template, userConfig) {
        const config = { ...userConfig };

        // 如果有模板，应用默认值
        if (template && template.parameters) {
            template.parameters.forEach(param => {
                if (param.default !== undefined && config[param.name] === undefined) {
                    config[param.name] = param.default;
                }
            });
        }

        return config;
    }

    /**
     * 验证配置
     * @param {string} type - 策略类型
     * @param {Object} config - 配置对象
     * @returns {Object} 验证结果
     */
    validateConfig(type, config) {
        const template = this.registry.getTemplate(type);
        if (!template || !template.parameters) {
            return { valid: true, errors: [] };
        }

        const errors = [];

        template.parameters.forEach(param => {
            const value = config[param.name];

            // 检查必填字段
            if (param.required && (value === undefined || value === null || value === '')) {
                errors.push(`${param.description || param.name} 是必填字段`);
                return;
            }

            // 类型验证
            if (value !== undefined && value !== null) {
                if (!this.validateFieldType(value, param.type)) {
                    errors.push(`${param.description || param.name} 类型不正确，期望: ${param.type}`);
                }
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * 验证字段类型
     * @param {*} value - 值
     * @param {string} expectedType - 期望类型
     * @returns {boolean} 是否有效
     */
    validateFieldType(value, expectedType) {
        switch (expectedType) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                return true; // 未知类型，默认通过
        }
    }

    /**
     * 生成实例ID
     * @param {string} type - 策略类型
     * @returns {string} 实例ID
     */
    generateInstanceId(type) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 5);
        return `${type}_${timestamp}_${random}`;
    }

    /**
     * 获取工厂统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const instancesByType = {};
        this.instances.forEach(instanceData => {
            instancesByType[instanceData.type] = (instancesByType[instanceData.type] || 0) + 1;
        });

        return {
            totalInstances: this.instances.size,
            instancesByType,
            initialized: this.initialized
        };
    }

    /**
     * 清理所有实例
     */
    async cleanup() {
        const instanceIds = Array.from(this.instances.keys());

        for (const instanceId of instanceIds) {
            await this.destroyInstance(instanceId);
        }

        console.log('🧹 策略工厂已清理');
    }
}

// 创建全局单例
window.StrategyFactory = window.StrategyFactory || new StrategyFactory(); 