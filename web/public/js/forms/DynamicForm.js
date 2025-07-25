/**
 * 📝 动态表单组件
 * 根据策略模板动态生成表单
 * 
 * 功能：
 * - 动态字段生成
 * - 实时验证
 * - 条件显示
 * - 数据绑定
 */

class DynamicForm {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        this.options = {
            autoValidate: true,
            showErrors: true,
            submitOnEnter: true,
            ...options
        };

        this.fields = new Map();
        this.validators = new Map();
        this.data = {};
        this.errors = {};
        this.template = null;
        this.eventBus = window.EventBus;

        this.init();
    }

    /**
     * 初始化表单
     */
    init() {
        if (!this.container) {
            throw new Error('表单容器不存在');
        }

        this.container.className = 'dynamic-form';
        this.bindEvents();
    }

    /**
     * 根据模板渲染表单
     * @param {Object} template - 策略模板
     */
    render(template) {
        this.template = template;
        this.clear();

        if (!template || !template.parameters) {
            this.renderEmptyState();
            return;
        }

        this.renderHeader();
        this.renderFields(template.parameters);
        this.renderActions();

        this.eventBus.emit('form:rendered', { template, formId: this.getId() });
    }

    /**
     * 渲染表单头部
     */
    renderHeader() {
        if (!this.template.name && !this.template.description) return;

        const header = document.createElement('div');
        header.className = 'form-header';

        if (this.template.name) {
            const title = document.createElement('h3');
            title.className = 'form-title';
            title.textContent = this.template.name;
            header.appendChild(title);
        }

        if (this.template.description) {
            const desc = document.createElement('p');
            desc.className = 'form-description';
            desc.textContent = this.template.description;
            header.appendChild(desc);
        }

        this.container.appendChild(header);
    }

    /**
     * 渲染表单字段
     * @param {Array} parameters - 参数配置
     */
    renderFields(parameters) {
        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'form-fields';

        parameters.forEach(param => {
            const fieldElement = this.createField(param);
            if (fieldElement) {
                fieldsContainer.appendChild(fieldElement);
                this.fields.set(param.name, {
                    element: fieldElement,
                    config: param,
                    value: param.default || ''
                });
            }
        });

        this.container.appendChild(fieldsContainer);
    }

    /**
     * 创建单个字段
     * @param {Object} param - 参数配置
     * @returns {HTMLElement} 字段元素
     */
    createField(param) {
        const fieldWrapper = document.createElement('div');
        fieldWrapper.className = `form-field ${param.required ? 'required' : ''}`;
        fieldWrapper.dataset.fieldName = param.name;

        // 标签
        const label = document.createElement('label');
        label.className = 'field-label';
        label.textContent = param.description || param.name;
        if (param.required) {
            label.innerHTML += ' <span class="required-mark">*</span>';
        }
        fieldWrapper.appendChild(label);

        // 输入控件
        const input = this.createInput(param);
        fieldWrapper.appendChild(input);

        // 帮助文本
        if (param.help) {
            const help = document.createElement('div');
            help.className = 'field-help';
            help.textContent = param.help;
            fieldWrapper.appendChild(help);
        }

        // 错误提示
        const error = document.createElement('div');
        error.className = 'field-error';
        fieldWrapper.appendChild(error);

        return fieldWrapper;
    }

    /**
     * 创建输入控件
     * @param {Object} param - 参数配置
     * @returns {HTMLElement} 输入控件
     */
    createInput(param) {
        let input;

        switch (param.type) {
            case 'string':
                input = this.createTextInput(param);
                break;
            case 'number':
                input = this.createNumberInput(param);
                break;
            case 'boolean':
                input = this.createCheckboxInput(param);
                break;
            case 'select':
                input = this.createSelectInput(param);
                break;
            case 'textarea':
                input = this.createTextareaInput(param);
                break;
            default:
                input = this.createTextInput(param);
        }

        input.className = 'field-input';
        input.name = param.name;
        input.dataset.fieldType = param.type;

        // 设置默认值
        if (param.default !== undefined) {
            if (param.type === 'boolean') {
                input.checked = param.default;
            } else {
                input.value = param.default;
            }
            this.data[param.name] = param.default;
        }

        // 绑定事件
        this.bindFieldEvents(input, param);

        return input;
    }

    /**
     * 创建文本输入框
     */
    createTextInput(param) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = param.placeholder || '';

        if (param.maxLength) input.maxLength = param.maxLength;
        if (param.pattern) input.pattern = param.pattern;

        return input;
    }

    /**
     * 创建数字输入框
     */
    createNumberInput(param) {
        const input = document.createElement('input');
        input.type = 'number';
        input.placeholder = param.placeholder || '';

        if (param.min !== undefined) input.min = param.min;
        if (param.max !== undefined) input.max = param.max;
        if (param.step !== undefined) input.step = param.step;

        return input;
    }

    /**
     * 创建复选框
     */
    createCheckboxInput(param) {
        const wrapper = document.createElement('div');
        wrapper.className = 'checkbox-wrapper';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `checkbox_${param.name}`;

        const label = document.createElement('label');
        label.htmlFor = input.id;
        label.textContent = param.checkboxLabel || '启用';

        wrapper.appendChild(input);
        wrapper.appendChild(label);

        return wrapper;
    }

    /**
     * 创建下拉选择框
     */
    createSelectInput(param) {
        const select = document.createElement('select');

        if (param.options) {
            param.options.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                select.appendChild(optionElement);
            });
        }

        return select;
    }

    /**
     * 创建文本域
     */
    createTextareaInput(param) {
        const textarea = document.createElement('textarea');
        textarea.placeholder = param.placeholder || '';
        textarea.rows = param.rows || 3;

        if (param.maxLength) textarea.maxLength = param.maxLength;

        return textarea;
    }

    /**
     * 渲染操作按钮
     */
    renderActions() {
        const actions = document.createElement('div');
        actions.className = 'form-actions';

        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.className = 'btn btn-primary';
        submitBtn.textContent = '创建策略';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = '取消';

        actions.appendChild(submitBtn);
        actions.appendChild(cancelBtn);

        this.container.appendChild(actions);
    }

    /**
     * 渲染空状态
     */
    renderEmptyState() {
        const empty = document.createElement('div');
        empty.className = 'form-empty';
        empty.innerHTML = `
            <div class="empty-icon">📝</div>
            <h3>无可用模板</h3>
            <p>请选择一个策略类型来显示配置表单</p>
        `;
        this.container.appendChild(empty);
    }

    /**
     * 绑定字段事件
     */
    bindFieldEvents(input, param) {
        const actualInput = input.querySelector('input') || input;

        // 值变化事件
        actualInput.addEventListener('input', (e) => {
            this.handleFieldChange(param.name, e.target.value, param);
        });

        actualInput.addEventListener('change', (e) => {
            this.handleFieldChange(param.name, e.target.value, param);
        });

        // 失焦验证
        if (this.options.autoValidate) {
            actualInput.addEventListener('blur', () => {
                this.validateField(param.name);
            });
        }
    }

    /**
     * 绑定表单事件
     */
    bindEvents() {
        this.container.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        this.container.addEventListener('click', (e) => {
            if (e.target.textContent === '取消') {
                this.handleCancel();
            }
        });

        if (this.options.submitOnEnter) {
            this.container.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    this.handleSubmit();
                }
            });
        }
    }

    /**
     * 处理字段值变化
     */
    handleFieldChange(fieldName, value, param) {
        // 类型转换
        let convertedValue = value;
        if (param.type === 'number') {
            convertedValue = parseFloat(value) || 0;
        } else if (param.type === 'boolean') {
            convertedValue = Boolean(value);
        }

        this.data[fieldName] = convertedValue;

        // 清除错误
        this.clearFieldError(fieldName);

        // 触发事件
        this.eventBus.emit('form:fieldChanged', {
            fieldName,
            value: convertedValue,
            formId: this.getId()
        });
    }

    /**
     * 验证单个字段
     */
    validateField(fieldName) {
        const field = this.fields.get(fieldName);
        if (!field) return true;

        const { config } = field;
        const value = this.data[fieldName];
        const errors = [];

        // 必填验证
        if (config.required && (value === undefined || value === null || value === '')) {
            errors.push(`${config.description || fieldName} 是必填字段`);
        }

        // 类型验证
        if (value !== undefined && value !== null && value !== '') {
            if (config.type === 'number' && isNaN(value)) {
                errors.push(`${config.description || fieldName} 必须是数字`);
            }

            // 范围验证
            if (config.type === 'number' && !isNaN(value)) {
                if (config.min !== undefined && value < config.min) {
                    errors.push(`${config.description || fieldName} 不能小于 ${config.min}`);
                }
                if (config.max !== undefined && value > config.max) {
                    errors.push(`${config.description || fieldName} 不能大于 ${config.max}`);
                }
            }

            // 长度验证
            if (config.type === 'string' && config.maxLength && value.length > config.maxLength) {
                errors.push(`${config.description || fieldName} 长度不能超过 ${config.maxLength} 个字符`);
            }
        }

        // 显示错误
        if (errors.length > 0) {
            this.showFieldError(fieldName, errors[0]);
            this.errors[fieldName] = errors;
            return false;
        } else {
            this.clearFieldError(fieldName);
            delete this.errors[fieldName];
            return true;
        }
    }

    /**
     * 验证整个表单
     */
    validate() {
        let isValid = true;

        this.fields.forEach((field, fieldName) => {
            if (!this.validateField(fieldName)) {
                isValid = false;
            }
        });

        return isValid;
    }

    /**
     * 显示字段错误
     */
    showFieldError(fieldName, message) {
        const field = this.fields.get(fieldName);
        if (!field) return;

        const errorElement = field.element.querySelector('.field-error');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }

        field.element.classList.add('has-error');
    }

    /**
     * 清除字段错误
     */
    clearFieldError(fieldName) {
        const field = this.fields.get(fieldName);
        if (!field) return;

        const errorElement = field.element.querySelector('.field-error');
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }

        field.element.classList.remove('has-error');
    }

    /**
     * 处理表单提交
     */
    handleSubmit() {
        if (!this.validate()) {
            this.eventBus.emit('form:validationFailed', {
                errors: this.errors,
                formId: this.getId()
            });
            return;
        }

        this.eventBus.emit('form:submit', {
            data: this.getData(),
            template: this.template,
            formId: this.getId()
        });
    }

    /**
     * 处理取消
     */
    handleCancel() {
        this.eventBus.emit('form:cancel', {
            formId: this.getId()
        });
    }

    /**
     * 获取表单数据
     */
    getData() {
        return { ...this.data };
    }

    /**
     * 设置表单数据
     */
    setData(data) {
        Object.keys(data).forEach(key => {
            if (this.fields.has(key)) {
                this.data[key] = data[key];
                const field = this.fields.get(key);
                const input = field.element.querySelector('.field-input input') ||
                    field.element.querySelector('.field-input');

                if (input) {
                    if (input.type === 'checkbox') {
                        input.checked = data[key];
                    } else {
                        input.value = data[key];
                    }
                }
            }
        });
    }

    /**
     * 清空表单
     */
    clear() {
        this.container.innerHTML = '';
        this.fields.clear();
        this.data = {};
        this.errors = {};
    }

    /**
     * 获取表单ID
     */
    getId() {
        return this.container.id || 'dynamic-form';
    }

    /**
     * 销毁表单
     */
    destroy() {
        this.clear();
        this.eventBus.emit('form:destroyed', { formId: this.getId() });
    }
}

// 导出动态表单类
window.DynamicForm = DynamicForm; 