/**
 * ✅ 表单验证器
 * 提供各种验证规则和方法
 * 
 * 功能：
 * - 内置验证规则
 * - 自定义验证器
 * - 异步验证
 * - 验证链
 */

class FormValidator {
    constructor() {
        this.rules = new Map();
        this.customValidators = new Map();
        this.initBuiltInRules();
    }

    /**
     * 初始化内置验证规则
     */
    initBuiltInRules() {
        // 必填验证
        this.addRule('required', (value, options = {}) => {
            const { message = '此字段是必填的' } = options;
            if (value === undefined || value === null || value === '') {
                return { valid: false, message };
            }
            return { valid: true };
        });

        // 字符串长度验证
        this.addRule('minLength', (value, options = {}) => {
            const { min, message } = options;
            if (typeof value === 'string' && value.length < min) {
                return {
                    valid: false,
                    message: message || `最少需要 ${min} 个字符`
                };
            }
            return { valid: true };
        });

        this.addRule('maxLength', (value, options = {}) => {
            const { max, message } = options;
            if (typeof value === 'string' && value.length > max) {
                return {
                    valid: false,
                    message: message || `最多允许 ${max} 个字符`
                };
            }
            return { valid: true };
        });

        // 数值范围验证
        this.addRule('min', (value, options = {}) => {
            const { min, message } = options;
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && numValue < min) {
                return {
                    valid: false,
                    message: message || `值不能小于 ${min}`
                };
            }
            return { valid: true };
        });

        this.addRule('max', (value, options = {}) => {
            const { max, message } = options;
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && numValue > max) {
                return {
                    valid: false,
                    message: message || `值不能大于 ${max}`
                };
            }
            return { valid: true };
        });

        // 数字验证
        this.addRule('number', (value, options = {}) => {
            const { message = '必须是有效的数字' } = options;
            if (value !== '' && isNaN(parseFloat(value))) {
                return { valid: false, message };
            }
            return { valid: true };
        });

        // 整数验证
        this.addRule('integer', (value, options = {}) => {
            const { message = '必须是整数' } = options;
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && !Number.isInteger(numValue)) {
                return { valid: false, message };
            }
            return { valid: true };
        });

        // 正数验证
        this.addRule('positive', (value, options = {}) => {
            const { message = '必须是正数' } = options;
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && numValue <= 0) {
                return { valid: false, message };
            }
            return { valid: true };
        });

        // 邮箱验证
        this.addRule('email', (value, options = {}) => {
            const { message = '请输入有效的邮箱地址' } = options;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (value && !emailRegex.test(value)) {
                return { valid: false, message };
            }
            return { valid: true };
        });

        // URL验证
        this.addRule('url', (value, options = {}) => {
            const { message = '请输入有效的URL' } = options;
            try {
                if (value) new URL(value);
                return { valid: true };
            } catch {
                return { valid: false, message };
            }
        });

        // 正则表达式验证
        this.addRule('pattern', (value, options = {}) => {
            const { pattern, message = '格式不正确' } = options;
            if (value && !pattern.test(value)) {
                return { valid: false, message };
            }
            return { valid: true };
        });

        // Solana地址验证
        this.addRule('solanaAddress', (value, options = {}) => {
            const { message = '请输入有效的Solana地址' } = options;
            const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
            if (value && !solanaAddressRegex.test(value)) {
                return { valid: false, message };
            }
            return { valid: true };
        });

        // 代币金额验证
        this.addRule('tokenAmount', (value, options = {}) => {
            const { decimals = 9, message } = options;
            const numValue = parseFloat(value);

            if (isNaN(numValue)) {
                return { valid: false, message: message || '请输入有效的代币数量' };
            }

            if (numValue <= 0) {
                return { valid: false, message: message || '代币数量必须大于0' };
            }

            // 检查小数位数
            const decimalPlaces = (value.toString().split('.')[1] || '').length;
            if (decimalPlaces > decimals) {
                return {
                    valid: false,
                    message: message || `小数位数不能超过 ${decimals} 位`
                };
            }

            return { valid: true };
        });
    }

    /**
     * 添加验证规则
     * @param {string} name - 规则名称
     * @param {Function} validator - 验证函数
     */
    addRule(name, validator) {
        this.rules.set(name, validator);
    }

    /**
     * 移除验证规则
     * @param {string} name - 规则名称
     */
    removeRule(name) {
        this.rules.delete(name);
    }

    /**
     * 验证单个值
     * @param {*} value - 要验证的值
     * @param {Array|Object} rules - 验证规则
     * @returns {Object} 验证结果
     */
    validate(value, rules) {
        if (!Array.isArray(rules)) {
            rules = [rules];
        }

        const errors = [];

        for (const rule of rules) {
            const result = this.applyRule(value, rule);
            if (!result.valid) {
                errors.push(result.message);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * 应用单个验证规则
     * @param {*} value - 要验证的值
     * @param {Object} rule - 验证规则
     * @returns {Object} 验证结果
     */
    applyRule(value, rule) {
        const { type, ...options } = rule;

        // 跳过空值验证（除非是required规则）
        if ((value === undefined || value === null || value === '') && type !== 'required') {
            return { valid: true };
        }

        const validator = this.rules.get(type);
        if (!validator) {
            console.warn(`未知的验证规则: ${type}`);
            return { valid: true };
        }

        try {
            return validator(value, options);
        } catch (error) {
            console.error(`验证规则 ${type} 执行错误:`, error);
            return { valid: false, message: '验证过程中发生错误' };
        }
    }

    /**
     * 验证对象
     * @param {Object} data - 要验证的数据对象
     * @param {Object} schema - 验证模式
     * @returns {Object} 验证结果
     */
    validateObject(data, schema) {
        const errors = {};
        let isValid = true;

        Object.keys(schema).forEach(field => {
            const fieldRules = schema[field];
            const fieldValue = data[field];

            const result = this.validate(fieldValue, fieldRules);
            if (!result.valid) {
                errors[field] = result.errors;
                isValid = false;
            }
        });

        return {
            valid: isValid,
            errors
        };
    }

    /**
     * 异步验证
     * @param {*} value - 要验证的值
     * @param {Array|Object} rules - 验证规则
     * @returns {Promise<Object>} 验证结果
     */
    async validateAsync(value, rules) {
        if (!Array.isArray(rules)) {
            rules = [rules];
        }

        const errors = [];

        for (const rule of rules) {
            const result = await this.applyRuleAsync(value, rule);
            if (!result.valid) {
                errors.push(result.message);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * 应用异步验证规则
     * @param {*} value - 要验证的值
     * @param {Object} rule - 验证规则
     * @returns {Promise<Object>} 验证结果
     */
    async applyRuleAsync(value, rule) {
        const { type, ...options } = rule;

        // 先尝试同步验证
        const syncValidator = this.rules.get(type);
        if (syncValidator) {
            return this.applyRule(value, rule);
        }

        // 尝试异步验证
        const asyncValidator = this.customValidators.get(type);
        if (asyncValidator) {
            try {
                return await asyncValidator(value, options);
            } catch (error) {
                console.error(`异步验证规则 ${type} 执行错误:`, error);
                return { valid: false, message: '验证过程中发生错误' };
            }
        }

        console.warn(`未知的验证规则: ${type}`);
        return { valid: true };
    }

    /**
     * 添加自定义异步验证器
     * @param {string} name - 验证器名称
     * @param {Function} validator - 异步验证函数
     */
    addAsyncValidator(name, validator) {
        this.customValidators.set(name, validator);
    }

    /**
     * 创建验证规则构建器
     * @returns {Object} 规则构建器
     */
    createRuleBuilder() {
        const rules = [];

        const builder = {
            required: (message) => {
                rules.push({ type: 'required', message });
                return builder;
            },
            minLength: (min, message) => {
                rules.push({ type: 'minLength', min, message });
                return builder;
            },
            maxLength: (max, message) => {
                rules.push({ type: 'maxLength', max, message });
                return builder;
            },
            min: (min, message) => {
                rules.push({ type: 'min', min, message });
                return builder;
            },
            max: (max, message) => {
                rules.push({ type: 'max', max, message });
                return builder;
            },
            number: (message) => {
                rules.push({ type: 'number', message });
                return builder;
            },
            integer: (message) => {
                rules.push({ type: 'integer', message });
                return builder;
            },
            positive: (message) => {
                rules.push({ type: 'positive', message });
                return builder;
            },
            email: (message) => {
                rules.push({ type: 'email', message });
                return builder;
            },
            url: (message) => {
                rules.push({ type: 'url', message });
                return builder;
            },
            pattern: (pattern, message) => {
                rules.push({ type: 'pattern', pattern, message });
                return builder;
            },
            solanaAddress: (message) => {
                rules.push({ type: 'solanaAddress', message });
                return builder;
            },
            tokenAmount: (decimals, message) => {
                rules.push({ type: 'tokenAmount', decimals, message });
                return builder;
            },
            custom: (validator, message) => {
                rules.push({ type: 'custom', validator, message });
                return builder;
            },
            build: () => rules
        };

        return builder;
    }

    /**
     * 获取所有可用的验证规则
     * @returns {Array} 规则名称列表
     */
    getAvailableRules() {
        return Array.from(this.rules.keys());
    }

    /**
     * 清除所有自定义规则
     */
    clearCustomRules() {
        // 保留内置规则
        const builtInRules = [
            'required', 'minLength', 'maxLength', 'min', 'max',
            'number', 'integer', 'positive', 'email', 'url',
            'pattern', 'solanaAddress', 'tokenAmount'
        ];

        this.rules.forEach((validator, name) => {
            if (!builtInRules.includes(name)) {
                this.rules.delete(name);
            }
        });

        this.customValidators.clear();
    }
}

// 创建全局单例
window.FormValidator = window.FormValidator || new FormValidator(); 