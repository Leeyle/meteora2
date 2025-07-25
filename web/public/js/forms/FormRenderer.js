/**
 * 🎨 表单渲染器
 * 负责表单的样式和布局渲染
 * 
 * 功能：
 * - 主题切换
 * - 布局管理
 * - 样式定制
 * - 响应式设计
 */

class FormRenderer {
    constructor(options = {}) {
        this.options = {
            theme: 'default',
            layout: 'vertical',
            showLabels: true,
            showHelp: true,
            showErrors: true,
            animations: true,
            ...options
        };

        this.themes = new Map();
        this.layouts = new Map();
        this.initDefaultThemes();
        this.initDefaultLayouts();
        this.injectStyles();
    }

    /**
     * 初始化默认主题
     */
    initDefaultThemes() {
        // 默认主题
        this.addTheme('default', {
            colors: {
                primary: '#007bff',
                secondary: '#6c757d',
                success: '#28a745',
                danger: '#dc3545',
                warning: '#ffc107',
                info: '#17a2b8',
                light: '#f8f9fa',
                dark: '#343a40',
                background: '#ffffff',
                text: '#212529',
                border: '#dee2e6'
            },
            spacing: {
                xs: '0.25rem',
                sm: '0.5rem',
                md: '1rem',
                lg: '1.5rem',
                xl: '3rem'
            },
            borderRadius: '0.375rem',
            fontSize: {
                sm: '0.875rem',
                base: '1rem',
                lg: '1.125rem',
                xl: '1.25rem'
            }
        });

        // 暗色主题
        this.addTheme('dark', {
            colors: {
                primary: '#0d6efd',
                secondary: '#6c757d',
                success: '#198754',
                danger: '#dc3545',
                warning: '#fd7e14',
                info: '#0dcaf0',
                light: '#495057',
                dark: '#212529',
                background: '#1a1a1a',
                text: '#ffffff',
                border: '#495057'
            },
            spacing: {
                xs: '0.25rem',
                sm: '0.5rem',
                md: '1rem',
                lg: '1.5rem',
                xl: '3rem'
            },
            borderRadius: '0.375rem',
            fontSize: {
                sm: '0.875rem',
                base: '1rem',
                lg: '1.125rem',
                xl: '1.25rem'
            }
        });

        // 简约主题
        this.addTheme('minimal', {
            colors: {
                primary: '#000000',
                secondary: '#666666',
                success: '#00aa00',
                danger: '#cc0000',
                warning: '#ff8800',
                info: '#0088cc',
                light: '#f5f5f5',
                dark: '#333333',
                background: '#ffffff',
                text: '#333333',
                border: '#e0e0e0'
            },
            spacing: {
                xs: '0.125rem',
                sm: '0.25rem',
                md: '0.5rem',
                lg: '1rem',
                xl: '2rem'
            },
            borderRadius: '0.125rem',
            fontSize: {
                sm: '0.75rem',
                base: '0.875rem',
                lg: '1rem',
                xl: '1.125rem'
            }
        });
    }

    /**
     * 初始化默认布局
     */
    initDefaultLayouts() {
        // 垂直布局
        this.addLayout('vertical', {
            formClass: 'form-vertical',
            fieldClass: 'field-vertical',
            labelClass: 'label-vertical',
            inputClass: 'input-vertical',
            helpClass: 'help-vertical',
            errorClass: 'error-vertical'
        });

        // 水平布局
        this.addLayout('horizontal', {
            formClass: 'form-horizontal',
            fieldClass: 'field-horizontal',
            labelClass: 'label-horizontal',
            inputClass: 'input-horizontal',
            helpClass: 'help-horizontal',
            errorClass: 'error-horizontal'
        });

        // 内联布局
        this.addLayout('inline', {
            formClass: 'form-inline',
            fieldClass: 'field-inline',
            labelClass: 'label-inline',
            inputClass: 'input-inline',
            helpClass: 'help-inline',
            errorClass: 'error-inline'
        });

        // 网格布局
        this.addLayout('grid', {
            formClass: 'form-grid',
            fieldClass: 'field-grid',
            labelClass: 'label-grid',
            inputClass: 'input-grid',
            helpClass: 'help-grid',
            errorClass: 'error-grid'
        });
    }

    /**
     * 注入样式
     */
    injectStyles() {
        if (document.getElementById('form-renderer-styles')) return;

        const style = document.createElement('style');
        style.id = 'form-renderer-styles';
        style.textContent = this.generateCSS();
        document.head.appendChild(style);
    }

    /**
     * 生成CSS样式
     */
    generateCSS() {
        const theme = this.getTheme(this.options.theme);

        return `
            /* 基础表单样式 */
            .dynamic-form {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: ${theme.fontSize.base};
                color: ${theme.colors.text};
                background-color: ${theme.colors.background};
                border-radius: ${theme.borderRadius};
                padding: ${theme.spacing.lg};
                border: 1px solid ${theme.colors.border};
            }

            /* 表单头部 */
            .form-header {
                margin-bottom: ${theme.spacing.lg};
                padding-bottom: ${theme.spacing.md};
                border-bottom: 1px solid ${theme.colors.border};
            }

            .form-title {
                margin: 0 0 ${theme.spacing.sm} 0;
                font-size: ${theme.fontSize.xl};
                font-weight: 600;
                color: ${theme.colors.text};
            }

            .form-description {
                margin: 0;
                font-size: ${theme.fontSize.sm};
                color: ${theme.colors.secondary};
                line-height: 1.5;
            }

            /* 垂直布局 */
            .form-vertical .form-fields {
                display: flex;
                flex-direction: column;
                gap: ${theme.spacing.md};
            }

            .form-vertical .form-field {
                display: flex;
                flex-direction: column;
            }

            .form-vertical .field-label {
                margin-bottom: ${theme.spacing.sm};
                font-weight: 500;
                color: ${theme.colors.text};
            }

            .form-vertical .field-input {
                width: 100%;
            }

            /* 水平布局 */
            .form-horizontal .form-fields {
                display: flex;
                flex-direction: column;
                gap: ${theme.spacing.md};
            }

            .form-horizontal .form-field {
                display: grid;
                grid-template-columns: 1fr 2fr;
                gap: ${theme.spacing.md};
                align-items: start;
            }

            .form-horizontal .field-label {
                padding-top: ${theme.spacing.sm};
                font-weight: 500;
                color: ${theme.colors.text};
            }

            .form-horizontal .field-input {
                width: 100%;
            }

            /* 内联布局 */
            .form-inline .form-fields {
                display: flex;
                flex-wrap: wrap;
                gap: ${theme.spacing.md};
                align-items: end;
            }

            .form-inline .form-field {
                display: flex;
                flex-direction: column;
                min-width: 200px;
            }

            .form-inline .field-label {
                margin-bottom: ${theme.spacing.xs};
                font-size: ${theme.fontSize.sm};
                font-weight: 500;
                color: ${theme.colors.text};
            }

            /* 网格布局 */
            .form-grid .form-fields {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: ${theme.spacing.md};
            }

            .form-grid .form-field {
                display: flex;
                flex-direction: column;
            }

            .form-grid .field-label {
                margin-bottom: ${theme.spacing.sm};
                font-weight: 500;
                color: ${theme.colors.text};
            }

            /* 输入控件样式 */
            .field-input input,
            .field-input select,
            .field-input textarea {
                padding: ${theme.spacing.sm} ${theme.spacing.md};
                border: 1px solid ${theme.colors.border};
                border-radius: ${theme.borderRadius};
                font-size: ${theme.fontSize.base};
                color: ${theme.colors.text};
                background-color: ${theme.colors.background};
                transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
            }

            .field-input input:focus,
            .field-input select:focus,
            .field-input textarea:focus {
                outline: none;
                border-color: ${theme.colors.primary};
                box-shadow: 0 0 0 0.2rem ${theme.colors.primary}25;
            }

            .field-input input:disabled,
            .field-input select:disabled,
            .field-input textarea:disabled {
                background-color: ${theme.colors.light};
                opacity: 0.6;
                cursor: not-allowed;
            }

            /* 复选框样式 */
            .checkbox-wrapper {
                display: flex;
                align-items: center;
                gap: ${theme.spacing.sm};
            }

            .checkbox-wrapper input[type="checkbox"] {
                width: auto;
                margin: 0;
            }

            .checkbox-wrapper label {
                margin: 0;
                cursor: pointer;
                user-select: none;
            }

            /* 必填标记 */
            .required-mark {
                color: ${theme.colors.danger};
                margin-left: ${theme.spacing.xs};
            }

            .form-field.required .field-label {
                position: relative;
            }

            /* 帮助文本 */
            .field-help {
                margin-top: ${theme.spacing.xs};
                font-size: ${theme.fontSize.sm};
                color: ${theme.colors.secondary};
                line-height: 1.4;
            }

            /* 错误提示 */
            .field-error {
                margin-top: ${theme.spacing.xs};
                font-size: ${theme.fontSize.sm};
                color: ${theme.colors.danger};
                display: none;
            }

            .form-field.has-error .field-input input,
            .form-field.has-error .field-input select,
            .form-field.has-error .field-input textarea {
                border-color: ${theme.colors.danger};
            }

            .form-field.has-error .field-error {
                display: block;
            }

            /* 操作按钮 */
            .form-actions {
                margin-top: ${theme.spacing.lg};
                padding-top: ${theme.spacing.md};
                border-top: 1px solid ${theme.colors.border};
                display: flex;
                gap: ${theme.spacing.md};
                justify-content: flex-end;
            }

            .btn {
                padding: ${theme.spacing.sm} ${theme.spacing.lg};
                border: 1px solid transparent;
                border-radius: ${theme.borderRadius};
                font-size: ${theme.fontSize.base};
                font-weight: 500;
                text-align: center;
                cursor: pointer;
                transition: all 0.15s ease-in-out;
                text-decoration: none;
                display: inline-block;
            }

            .btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .btn-primary {
                color: white;
                background-color: ${theme.colors.primary};
                border-color: ${theme.colors.primary};
            }

            .btn-primary:hover:not(:disabled) {
                background-color: ${this.darkenColor(theme.colors.primary, 10)};
                border-color: ${this.darkenColor(theme.colors.primary, 10)};
            }

            .btn-secondary {
                color: ${theme.colors.text};
                background-color: transparent;
                border-color: ${theme.colors.border};
            }

            .btn-secondary:hover:not(:disabled) {
                background-color: ${theme.colors.light};
            }

            /* 空状态 */
            .form-empty {
                text-align: center;
                padding: ${theme.spacing.xl};
                color: ${theme.colors.secondary};
            }

            .empty-icon {
                font-size: 3rem;
                margin-bottom: ${theme.spacing.md};
            }

            .form-empty h3 {
                margin: 0 0 ${theme.spacing.sm} 0;
                color: ${theme.colors.text};
            }

            .form-empty p {
                margin: 0;
                font-size: ${theme.fontSize.sm};
            }

            /* 动画效果 */
            ${this.options.animations ? `
            .dynamic-form * {
                transition: all 0.15s ease-in-out;
            }

            .form-field {
                animation: fadeInUp 0.3s ease-out;
            }

            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            ` : ''}

            /* 响应式设计 */
            @media (max-width: 768px) {
                .form-horizontal .form-field {
                    grid-template-columns: 1fr;
                    gap: ${theme.spacing.sm};
                }

                .form-inline .form-fields {
                    flex-direction: column;
                }

                .form-grid .form-fields {
                    grid-template-columns: 1fr;
                }

                .form-actions {
                    flex-direction: column-reverse;
                }

                .btn {
                    width: 100%;
                }
            }
        `;
    }

    /**
     * 添加主题
     * @param {string} name - 主题名称
     * @param {Object} theme - 主题配置
     */
    addTheme(name, theme) {
        this.themes.set(name, theme);
    }

    /**
     * 获取主题
     * @param {string} name - 主题名称
     * @returns {Object} 主题配置
     */
    getTheme(name) {
        return this.themes.get(name) || this.themes.get('default');
    }

    /**
     * 添加布局
     * @param {string} name - 布局名称
     * @param {Object} layout - 布局配置
     */
    addLayout(name, layout) {
        this.layouts.set(name, layout);
    }

    /**
     * 获取布局
     * @param {string} name - 布局名称
     * @returns {Object} 布局配置
     */
    getLayout(name) {
        return this.layouts.get(name) || this.layouts.get('vertical');
    }

    /**
     * 设置主题
     * @param {string} theme - 主题名称
     */
    setTheme(theme) {
        this.options.theme = theme;
        this.updateStyles();
    }

    /**
     * 设置布局
     * @param {string} layout - 布局名称
     */
    setLayout(layout) {
        this.options.layout = layout;
        this.updateStyles();
    }

    /**
     * 更新样式
     */
    updateStyles() {
        const styleElement = document.getElementById('form-renderer-styles');
        if (styleElement) {
            styleElement.textContent = this.generateCSS();
        }
    }

    /**
     * 渲染表单容器
     * @param {HTMLElement} container - 容器元素
     */
    renderContainer(container) {
        const layout = this.getLayout(this.options.layout);
        container.className = `dynamic-form ${layout.formClass}`;
    }

    /**
     * 渲染字段
     * @param {HTMLElement} field - 字段元素
     * @param {Object} config - 字段配置
     */
    renderField(field, config) {
        const layout = this.getLayout(this.options.layout);
        field.className = `form-field ${layout.fieldClass} ${config.required ? 'required' : ''}`;

        // 应用字段特定样式
        const label = field.querySelector('.field-label');
        const input = field.querySelector('.field-input');
        const help = field.querySelector('.field-help');
        const error = field.querySelector('.field-error');

        if (label) label.className = `field-label ${layout.labelClass}`;
        if (input) input.className = `field-input ${layout.inputClass}`;
        if (help) help.className = `field-help ${layout.helpClass}`;
        if (error) error.className = `field-error ${layout.errorClass}`;
    }

    /**
     * 颜色加深函数
     * @param {string} color - 颜色值
     * @param {number} percent - 加深百分比
     * @returns {string} 加深后的颜色
     */
    darkenColor(color, percent) {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    }

    /**
     * 获取可用主题列表
     * @returns {Array} 主题名称列表
     */
    getAvailableThemes() {
        return Array.from(this.themes.keys());
    }

    /**
     * 获取可用布局列表
     * @returns {Array} 布局名称列表
     */
    getAvailableLayouts() {
        return Array.from(this.layouts.keys());
    }
}

// 创建全局单例
window.FormRenderer = window.FormRenderer || new FormRenderer(); 