/**
 * ⚙️ 策略配置基类
 * 定义策略配置的通用结构和方法
 * 
 * 功能：
 * - 配置验证
 * - 默认值管理
 * - 配置序列化
 * - 配置合并
 */

class StrategyConfig {
    constructor(type, config = {}) {
        this.type = type;
        this.config = {};
        this.defaults = {};
        this.schema = {};
        this.validators = new Map();

        this.initDefaults();
        this.initSchema();
        this.initValidators();
        this.setConfig(config);
    }

    /**
     * 初始化默认配置
     * 子类应重写此方法
     */
    initDefaults() {
        this.defaults = {
            enabled: true,
            name: '',
            description: '',
            priority: 0,
            maxRetries: 3,
            retryDelay: 1000,
            timeout: 30000,
            notifications: {
                onStart: false,
                onStop: false,
                onError: true,
                onSuccess: false
            },
            logging: {
                level: 'info',
                enabled: true
            }
        };
    }

    /**
     * 初始化配置模式
     * 子类应重写此方法
     */
    initSchema() {
        this.schema = {
            enabled: { type: 'boolean', required: false },
            name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
            description: { type: 'string', required: false, maxLength: 500 },
            priority: { type: 'number', required: false, min: 0, max: 10 },
            maxRetries: { type: 'number', required: false, min: 0, max: 10 },
            retryDelay: { type: 'number', required: false, min: 100, max: 60000 },
            timeout: { type: 'number', required: false, min: 1000, max: 300000 },
            notifications: {
                type: 'object',
                required: false,
                properties: {
                    onStart: { type: 'boolean' },
                    onStop: { type: 'boolean' },
                    onError: { type: 'boolean' },
                    onSuccess: { type: 'boolean' }
                }
            },
            logging: {
                type: 'object',
                required: false,
                properties: {
                    level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
                    enabled: { type: 'boolean' }
                }
            }
        };
    }

    /**
     * 初始化验证器
     */
    initValidators() {
        // 基础类型验证器
        this.validators.set('string', (value, rules) => {
            if (typeof value !== 'string') {
                return { valid: false, message: '必须是字符串' };
            }

            if (rules.minLength && value.length < rules.minLength) {
                return { valid: false, message: `最少需要 ${rules.minLength} 个字符` };
            }

            if (rules.maxLength && value.length > rules.maxLength) {
                return { valid: false, message: `最多允许 ${rules.maxLength} 个字符` };
            }

            if (rules.pattern && !rules.pattern.test(value)) {
                return { valid: false, message: '格式不正确' };
            }

            return { valid: true };
        });

        this.validators.set('number', (value, rules) => {
            const num = parseFloat(value);
            if (isNaN(num)) {
                return { valid: false, message: '必须是有效的数字' };
            }

            if (rules.min !== undefined && num < rules.min) {
                return { valid: false, message: `不能小于 ${rules.min}` };
            }

            if (rules.max !== undefined && num > rules.max) {
                return { valid: false, message: `不能大于 ${rules.max}` };
            }

            if (rules.integer && !Number.isInteger(num)) {
                return { valid: false, message: '必须是整数' };
            }

            return { valid: true };
        });

        this.validators.set('boolean', (value, rules) => {
            if (typeof value !== 'boolean') {
                return { valid: false, message: '必须是布尔值' };
            }
            return { valid: true };
        });

        this.validators.set('object', (value, rules) => {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                return { valid: false, message: '必须是对象' };
            }

            if (rules.properties) {
                for (const [key, propRules] of Object.entries(rules.properties)) {
                    if (value.hasOwnProperty(key)) {
                        const result = this.validateValue(value[key], propRules);
                        if (!result.valid) {
                            return { valid: false, message: `${key}: ${result.message}` };
                        }
                    } else if (propRules.required) {
                        return { valid: false, message: `缺少必需属性: ${key}` };
                    }
                }
            }

            return { valid: true };
        });

        this.validators.set('array', (value, rules) => {
            if (!Array.isArray(value)) {
                return { valid: false, message: '必须是数组' };
            }

            if (rules.minItems && value.length < rules.minItems) {
                return { valid: false, message: `至少需要 ${rules.minItems} 个项目` };
            }

            if (rules.maxItems && value.length > rules.maxItems) {
                return { valid: false, message: `最多允许 ${rules.maxItems} 个项目` };
            }

            if (rules.items) {
                for (let i = 0; i < value.length; i++) {
                    const result = this.validateValue(value[i], rules.items);
                    if (!result.valid) {
                        return { valid: false, message: `项目 ${i}: ${result.message}` };
                    }
                }
            }

            return { valid: true };
        });
    }

    /**
     * 设置配置
     * @param {Object} config - 配置对象
     */
    setConfig(config) {
        // 合并默认配置
        this.config = this.mergeConfig(this.defaults, config);

        // 验证配置
        const validation = this.validate();
        if (!validation.valid) {
            throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
        }
    }

    /**
     * 获取配置
     * @param {string} key - 配置键，支持点号分隔的嵌套键
     * @returns {*} 配置值
     */
    get(key) {
        if (!key) return this.config;

        const keys = key.split('.');
        let value = this.config;

        for (const k of keys) {
            if (value && typeof value === 'object' && value.hasOwnProperty(k)) {
                value = value[k];
            } else {
                return undefined;
            }
        }

        return value;
    }

    /**
     * 设置配置值
     * @param {string} key - 配置键
     * @param {*} value - 配置值
     */
    set(key, value) {
        const keys = key.split('.');
        let target = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!target[k] || typeof target[k] !== 'object') {
                target[k] = {};
            }
            target = target[k];
        }

        target[keys[keys.length - 1]] = value;

        // 重新验证配置
        const validation = this.validate();
        if (!validation.valid) {
            throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
        }
    }

    /**
     * 验证配置
     * @returns {Object} 验证结果
     */
    validate() {
        const errors = [];

        for (const [key, rules] of Object.entries(this.schema)) {
            const value = this.get(key);

            // 检查必填字段
            if (rules.required && (value === undefined || value === null)) {
                errors.push(`${key} 是必填字段`);
                continue;
            }

            // 跳过空值验证
            if (value === undefined || value === null) {
                continue;
            }

            // 验证值
            const result = this.validateValue(value, rules);
            if (!result.valid) {
                errors.push(`${key}: ${result.message}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * 验证单个值
     * @param {*} value - 要验证的值
     * @param {Object} rules - 验证规则
     * @returns {Object} 验证结果
     */
    validateValue(value, rules) {
        const { type, enum: enumValues, ...otherRules } = rules;

        // 枚举值验证
        if (enumValues && !enumValues.includes(value)) {
            return {
                valid: false,
                message: `必须是以下值之一: ${enumValues.join(', ')}`
            };
        }

        // 类型验证
        if (type) {
            const validator = this.validators.get(type);
            if (validator) {
                return validator(value, otherRules);
            }
        }

        return { valid: true };
    }

    /**
     * 合并配置
     * @param {Object} defaults - 默认配置
     * @param {Object} config - 用户配置
     * @returns {Object} 合并后的配置
     */
    mergeConfig(defaults, config) {
        const result = {};

        // 复制默认配置
        for (const [key, value] of Object.entries(defaults)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                result[key] = this.mergeConfig(value, config[key] || {});
            } else {
                result[key] = value;
            }
        }

        // 覆盖用户配置
        for (const [key, value] of Object.entries(config)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value) &&
                typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
                result[key] = this.mergeConfig(defaults[key], value);
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * 序列化配置
     * @returns {string} JSON字符串
     */
    serialize() {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * 反序列化配置
     * @param {string} json - JSON字符串
     */
    deserialize(json) {
        try {
            const config = JSON.parse(json);
            this.setConfig(config);
        } catch (error) {
            throw new Error(`配置反序列化失败: ${error.message}`);
        }
    }

    /**
     * 克隆配置
     * @returns {StrategyConfig} 新的配置实例
     */
    clone() {
        const ConfigClass = this.constructor;
        return new ConfigClass(this.type, JSON.parse(JSON.stringify(this.config)));
    }

    /**
     * 重置为默认配置
     */
    reset() {
        this.config = JSON.parse(JSON.stringify(this.defaults));
    }

    /**
     * 获取配置差异
     * @param {StrategyConfig} other - 另一个配置实例
     * @returns {Object} 差异对象
     */
    diff(other) {
        const differences = {};

        const compareObjects = (obj1, obj2, path = '') => {
            const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

            for (const key of allKeys) {
                const fullPath = path ? `${path}.${key}` : key;
                const val1 = obj1[key];
                const val2 = obj2[key];

                if (val1 !== val2) {
                    if (typeof val1 === 'object' && typeof val2 === 'object' &&
                        val1 !== null && val2 !== null && !Array.isArray(val1) && !Array.isArray(val2)) {
                        compareObjects(val1, val2, fullPath);
                    } else {
                        differences[fullPath] = { from: val1, to: val2 };
                    }
                }
            }
        };

        compareObjects(this.config, other.config);
        return differences;
    }

    /**
     * 获取配置摘要
     * @returns {Object} 配置摘要
     */
    getSummary() {
        return {
            type: this.type,
            name: this.get('name'),
            description: this.get('description'),
            enabled: this.get('enabled'),
            priority: this.get('priority'),
            configKeys: Object.keys(this.config).length,
            lastModified: new Date().toISOString()
        };
    }

    /**
     * 导出配置为对象
     * @returns {Object} 配置对象
     */
    toObject() {
        return JSON.parse(JSON.stringify(this.config));
    }

    /**
     * 从对象导入配置
     * @param {Object} obj - 配置对象
     */
    fromObject(obj) {
        this.setConfig(obj);
    }

    /**
     * 获取配置类型
     * @returns {string} 配置类型
     */
    getType() {
        return this.type;
    }

    /**
     * 检查配置是否有效
     * @returns {boolean} 是否有效
     */
    isValid() {
        return this.validate().valid;
    }

    /**
     * 获取验证错误
     * @returns {Array} 错误列表
     */
    getValidationErrors() {
        return this.validate().errors;
    }
}

// 导出策略配置基类
window.StrategyConfig = StrategyConfig; 