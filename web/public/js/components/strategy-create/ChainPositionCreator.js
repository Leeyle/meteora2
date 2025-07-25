/**
 * 🎯 连锁头寸策略创建器
 * 专门用于创建连锁头寸策略的组件
 * 从原有的混合组件中提取出纯粹的创建功能
 */
class ChainPositionCreator {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        this.options = {
            autoValidate: true,
            showPreview: true,
            ...options
        };

        // 🔧 初始化表单数据，包含所有默认值
        this.formData = {
            strategyName: '',
            poolAddress: '',
            positionAmount: '',
            monitoringInterval: 30,
            outOfRangeTimeout: 600,
            yieldExtractionThreshold: 0.05,
            enableSmartStopLoss: true,
            stopLoss: {
                activeBinSafetyThreshold: 50,      // 活跃bin位置安全阈值(%)
                observationPeriodMinutes: 15       // 观察期时长(分钟)
            },
            // 🏗️ 头寸重建配置
            positionRecreation: {
                enableMarketOpportunityRecreation: true,  // 方法2：智能头寸重建
                marketOpportunity: {
                    positionThreshold: 70,    // 活跃bin位置阈值(%)
                    profitThreshold: 1        // 盈利阈值(%)
                },
                enableLossRecoveryRecreation: true,       // 方法3：止损后反弹重建
                lossRecovery: {
                    markPositionThreshold: 65,    // 标记时位置阈值(%)
                    markLossThreshold: 0.5,       // 标记时亏损阈值(%)
                    triggerPositionThreshold: 70, // 触发时位置阈值(%)
                    triggerProfitThreshold: 0.5   // 触发时盈利阈值(%)
                },
                enableDynamicProfitRecreation: true,      // 方法4：动态盈利阈值重建
                dynamicProfitRecreation: {
                    positionThreshold: 70,        // 活跃bin位置阈值(%)
                    benchmarkTier1Max: 0.5,       // 第一档最大值(%)
                    benchmarkTier2Max: 1.5,       // 第二档最大值(%)
                    benchmarkTier3Max: 3.0,       // 第三档最大值(%)
                    benchmarkTier4Max: 999,       // 第四档最大值(%)
                    profitThresholdTier1: 0.5,    // 第一档盈利阈值(%)
                    profitThresholdTier2: 1.5,    // 第二档盈利阈值(%)
                    profitThresholdTier3: 3.0,    // 第三档盈利阈值(%)
                    profitThresholdTier4: 5.0     // 第四档盈利阈值(%)
                }
            }
        };

        this.errors = {};
        this.isSubmitting = false;

        // API服务
        this.apiService = window.apiService;
        this.eventBus = window.EventBus;

        // 表单配置保存键
        this.formSaveKey = 'chain-position-form-config';

        this.init();
    }

    /**
     * 初始化创建器
     */
    init() {
        if (!this.container) {
            throw new Error('创建器容器不存在');
        }

        // 加载保存的表单配置
        this.loadSavedFormData();

        // 🔧 确保默认值已设置到formData中
        this.initializeDefaultValues();

        this.render();
        this.bindEvents();
        this.applyStyles();

        // 🔧 渲染完成后立即同步表单值，确保默认值正确填充
        this.syncFormValues();
    }

    /**
     * 初始化默认值
     */
    initializeDefaultValues() {
        const defaults = {
            enableSmartStopLoss: true,
            'positionRecreation.enableMarketOpportunityRecreation': true,
            'positionRecreation.enableLossRecoveryRecreation': true,
            'positionRecreation.enableDynamicProfitRecreation': true,
            monitoringInterval: 45,
            outOfRangeTimeout: 600,
            yieldExtractionThreshold: 0.1,
            yieldExtractionTimeLock: 1,
            slippageBps: 1000,
            benchmarkYieldThreshold5Min: 0,
            minActiveBinPositionThreshold: 0,
            'stopLoss.activeBinSafetyThreshold': 50,
            'stopLoss.observationPeriodMinutes': 15,
            'stopLoss.lossThresholdPercentage': 3,
            'positionRecreation.marketOpportunity.positionThreshold': 70,
            'positionRecreation.marketOpportunity.profitThreshold': 1,
            'positionRecreation.lossRecovery.markPositionThreshold': 65,
            'positionRecreation.lossRecovery.markLossThreshold': 0.5,
            'positionRecreation.lossRecovery.triggerPositionThreshold': 70,
            'positionRecreation.lossRecovery.triggerProfitThreshold': 0.5,
            'positionRecreation.dynamicProfitRecreation.positionThreshold': 70,
            'positionRecreation.dynamicProfitRecreation.benchmarkTier1Max': 0.5,
            'positionRecreation.dynamicProfitRecreation.benchmarkTier2Max': 1.5,
            'positionRecreation.dynamicProfitRecreation.benchmarkTier3Max': 3.0,
            'positionRecreation.dynamicProfitRecreation.benchmarkTier4Max': 999,
            'positionRecreation.dynamicProfitRecreation.profitThresholdTier1': 0.5,
            'positionRecreation.dynamicProfitRecreation.profitThresholdTier2': 1.5,
            'positionRecreation.dynamicProfitRecreation.profitThresholdTier3': 3.0,
            'positionRecreation.dynamicProfitRecreation.profitThresholdTier4': 5.0
        };

        // 只设置formData中不存在的默认值
        for (const [path, value] of Object.entries(defaults)) {
            if (this.getNestedValue(this.formData, path) === undefined) {
                this.setNestedValue(this.formData, path, value);
            }
        }
    }

    /**
     * 渲染创建器界面
     */
    render() {
        this.container.innerHTML = `
            <div class="chain-position-creator">
                ${this.renderHeader()}
                ${this.renderForm()}
                ${this.renderPreview()}
                ${this.renderActions()}
            </div>
        `;
    }

    /**
     * 渲染头部
     */
    renderHeader() {
        return `
            <div class="creator-header">
                <div class="header-content">
                    <h3 class="creator-title">
                        <span class="title-icon">🎯</span>
                        创建连锁头寸策略
                    </h3>
                    <p class="creator-description">
                        只需输入池地址和投入数量，系统将自动创建双链头寸配置，实现最优的双侧流动性管理
                    </p>
                    <div class="auto-save-notice">
                        <span class="notice-icon">💾</span>
                        <span class="notice-text">表单配置自动保存，刷新页面后仍然保留</span>
                    </div>
                </div>
                <div class="header-status">
                    <div class="status-item">
                        <span class="status-dot success"></span>
                        <span class="status-text">系统就绪</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染表单
     */
    renderForm() {
        return `
            <div class="creator-form">
                <h4 class="form-title">
                    <span class="form-icon">⚙️</span>
                    策略配置
                </h4>
                <form class="strategy-form" novalidate>
                    <!-- 基础配置 -->
                    <div class="form-section">
                        <h5 class="section-title">基础配置</h5>
                        <div class="form-grid">
                            ${this.renderField({
            name: 'strategyName',
            label: '策略名称',
            type: 'text',
            placeholder: '连锁头寸策略 ' + new Date().toLocaleString(),
            help: '策略的显示名称'
        })}
                            ${this.renderField({
            name: 'poolAddress',
            label: '池地址',
            type: 'text',
            required: true,
            placeholder: '请输入DLMM池地址',
            help: '要创建流动性的DLMM池地址'
        })}
                            ${this.renderField({
            name: 'positionAmount',
            label: '头寸金额',
            type: 'number',
            required: true,
            min: 0.01,
            step: 0.01,
            placeholder: '5.0',
            help: '创建头寸的总金额(Y代币)'
        })}
                        </div>
                    </div>

                    <!-- 监控配置 -->
                    <div class="form-section">
                        <h5 class="section-title">监控配置</h5>
                        <div class="form-grid">
                            ${this.renderField({
            name: 'monitoringInterval',
            label: '监控间隔',
            type: 'number',
            required: true,
            min: 30,
            max: 300,
            step: 15,
            value: 45,
            help: '监控活跃bin位置的间隔时间(秒)'
        })}
                            ${this.renderField({
            name: 'outOfRangeTimeout',
            label: '脱离范围超时',
            type: 'number',
            required: true,
            min: 60,
            max: 3600,
            step: 60,
            value: 600,
            help: '活跃bin脱离头寸范围后的超时时间(秒)'
        })}
                            ${this.renderField({
            name: 'maxPriceForRecreation',
            label: '重新创建价格上限',
            type: 'number',
            step: 'any',
            placeholder: '输入价格上限',
            help: '当X代币价格超过此值时，不重新创建头寸(设置为0表示无限制)'
        })}
                            ${this.renderField({
            name: 'minPriceForRecreation',
            label: '重新创建价格下限',
            type: 'number',
            step: 'any',
            placeholder: '输入价格下限',
            help: '当X代币价格低于此值时，停止策略执行(相当于止损，设置为0表示无限制)'
        })}
                            ${this.renderField({
            name: 'benchmarkYieldThreshold5Min',
            label: '15分钟平均基准收益率阈值',
            type: 'number',
            min: 0,
            max: 10,
            step: 0.1,
            placeholder: '输入收益率阈值(%)',
            help: '15分钟平均基准收益率低于此阈值时，关闭头寸但不重建（等同止损）。设置为0表示禁用此功能'
        })}
                            ${this.renderField({
            name: 'minActiveBinPositionThreshold',
            label: '最低活跃bin位置阈值',
            type: 'number',
            min: 0,
            max: 100,
            step: 1,
            placeholder: '输入最低位置阈值(%)',
            help: '当活跃bin位置低于此阈值时，禁止所有头寸重建方法。设置为0表示无限制'
        })}
                        </div>
                    </div>

                    <!-- 收益配置 -->
                    <div class="form-section">
                        <h5 class="section-title">收益配置</h5>
                        <div class="form-grid">
                            ${this.renderField({
            name: 'yieldExtractionThreshold',
            label: '收益提取阈值',
            type: 'number',
            min: 0.01,
            step: 0.01,
            value: 0.1,
            help: '自动提取收益的阈值金额'
        })}
                            ${this.renderField({
            name: 'yieldExtractionTimeLock',
            label: '收益提取时间锁',
            type: 'number',
            min: 1,
            max: 60,
            step: 1,
            value: 1,
            help: '两次收益提取之间的最小间隔时间(分钟)'
        })}
                            ${this.renderField({
            name: 'slippageBps',
            label: 'X代币交换滑点',
            type: 'number',
            min: 100,
            max: 3000,
            step: 50,
            value: 1000,
            help: '代币交换滑点设置（基点，1000=10%）'
        })}
                        </div>
                    </div>

                    <!-- 智能止损配置 -->
                    <div class="form-section">
                        <h4 class="section-title">
                            <span class="section-icon">🛡️</span>
                            智能止损配置
                        </h4>
                        <div class="stop-loss-config">
                            ${this.renderField({
            name: 'enableSmartStopLoss',
            label: '启用智能止损',
            type: 'checkbox',
            checked: true,
            help: '启用智能止损保护机制'
        })}
                            
                            <div class="stop-loss-details" id="stopLossDetails" style="display: block;">
                                ${this.renderField({
            name: 'stopLoss.activeBinSafetyThreshold',
            label: '活跃bin位置安全阈值',
            type: 'number',
            min: -100,
            max: 100,
            step: 1,
            value: 50,
            help: '活跃bin位置安全阈值(%) - 设置为负数可实现永不触发智能止损'
        })}
                                
                                ${this.renderField({
            name: 'stopLoss.observationPeriodMinutes',
            label: '观察期时长',
            type: 'number',
            min: 0,
            max: 60,
            step: 1,
            value: 15,
            help: '观察期时长(分钟)'
        })}
                                
                                ${this.renderField({
            name: 'stopLoss.lossThresholdPercentage',
            label: '亏损止损阈值',
            type: 'number',
            min: 1,
            step: 0.1,
            value: 5,
            help: '亏损超过此百分比才触发止损(%)'
        })}
                            </div>
                        </div>
                    </div>

                    <!-- 🏗️ 头寸重建配置 -->
                    <div class="form-section">
                        <h4 class="section-title">
                            <span class="section-icon">🏗️</span>
                            头寸重建配置
                        </h4>
                        
                        <!-- 方法2：智能头寸重建 -->
                        <div class="position-recreation-config">
                            <div class="recreation-method">
                                <h5 class="method-title">
                                    <span class="method-icon">🧠</span>
                                    方法2：智能头寸重建
                                </h5>
                                
                                ${this.renderField({
            name: 'positionRecreation.enableMarketOpportunityRecreation',
            label: '启用智能头寸重建',
            type: 'checkbox',
            checked: true,
            help: '当活跃bin位置低于阈值且达到盈利目标时，自动重建头寸优化收益位置'
        })}
                                
                                <div class="method-details" id="marketOpportunityDetails" style="display: block;">
                                    ${this.renderField({
            name: 'positionRecreation.marketOpportunity.positionThreshold',
            label: '活跃bin位置阈值',
            type: 'number',
            min: 1,
            max: 99,
            step: 1,
            value: 70,
            help: '当活跃bin位置低于此百分比时触发重建条件(%)'
        })}
                                    
                                    ${this.renderField({
            name: 'positionRecreation.marketOpportunity.profitThreshold',
            label: '盈利阈值',
            type: 'number',
            min: 0.1,
            max: 10,
            step: 0.1,
            value: 1,
            help: '盈利超过此百分比时触发重建条件(%)'
        })}
                                </div>
                            </div>
                            
                            <!-- 方法3：止损后反弹重建 -->
                            <div class="recreation-method">
                                <h5 class="method-title">
                                    <span class="method-icon">🚀</span>
                                    方法3：止损后反弹重建
                                </h5>
                                
                                ${this.renderField({
            name: 'positionRecreation.enableLossRecoveryRecreation',
            label: '启用止损后反弹重建',
            type: 'checkbox',
            checked: true,
            help: '监控亏损状态，在反弹时机自动重建头寸锁定盈利'
        })}
                                
                                <div class="method-details" id="lossRecoveryDetails" style="display: block;">
                                    <h6 class="sub-title">📊 标记条件（触发监控）</h6>
                                    ${this.renderField({
            name: 'positionRecreation.lossRecovery.markPositionThreshold',
            label: '标记时位置阈值',
            type: 'number',
            min: 1,
            max: 99,
            step: 1,
            value: 65,
            help: '活跃bin位置低于此百分比时开始监控亏损状态(%)'
        })}
                                    
                                    ${this.renderField({
            name: 'positionRecreation.lossRecovery.markLossThreshold',
            label: '标记时亏损阈值',
            type: 'number',
            min: 0.1,
            max: 5,
            step: 0.1,
            value: 0.5,
            help: '亏损超过此百分比时标记为止损状态(%)'
        })}
                                    
                                    <h6 class="sub-title">🎯 触发条件（执行重建）</h6>
                                    ${this.renderField({
            name: 'positionRecreation.lossRecovery.triggerPositionThreshold',
            label: '触发时位置阈值',
            type: 'number',
            min: 1,
            max: 99,
            step: 1,
            value: 70,
            help: '已标记状态下，位置仍低于此百分比时检查盈利条件(%)'
        })}
                                    
                                    ${this.renderField({
            name: 'positionRecreation.lossRecovery.triggerProfitThreshold',
            label: '触发时盈利阈值',
            type: 'number',
            min: 0.1,
            max: 5,
            step: 0.1,
            value: 0.5,
            help: '已标记状态下，盈利超过此百分比时执行重建(%)'
        })}
                                </div>
                            </div>
                            
                            <!-- 方法4：动态盈利阈值重建 -->
                            <div class="recreation-method">
                                <h5 class="method-title">
                                    <span class="method-icon">🌟</span>
                                    方法4：动态盈利阈值重建
                                </h5>
                                
                                ${this.renderField({
            name: 'positionRecreation.enableDynamicProfitRecreation',
            label: '启用动态盈利阈值重建',
            type: 'checkbox',
            checked: true,
            help: '基于30分钟平均基准收益率动态调节盈利阈值，实现智能重建'
        })}
                                
                                <div class="method-details" id="dynamicProfitDetails" style="display: block;">
                                    ${this.renderField({
            name: 'positionRecreation.dynamicProfitRecreation.positionThreshold',
            label: '活跃bin位置阈值',
            type: 'number',
            min: 1,
            max: 99,
            step: 1,
            value: 70,
            help: '当活跃bin位置高于此百分比时考虑重建(%)'
        })}
                                    
                                    <h6 class="sub-title">📊 基准收益率档位边界</h6>
                                    ${this.renderField({
            name: 'positionRecreation.dynamicProfitRecreation.benchmarkTier1Max',
            label: '第一档最大值',
            type: 'number',
            min: 0.1,
            max: 5,
            step: 0.1,
            value: 0.5,
            help: '第一档：0% - 此值(%)，对应最低盈利阈值'
        })}
                                    
                                    ${this.renderField({
            name: 'positionRecreation.dynamicProfitRecreation.benchmarkTier2Max',
            label: '第二档最大值',
            type: 'number',
            min: 0.5,
            max: 10,
            step: 0.1,
            value: 1.5,
            help: '第二档：第一档 - 此值(%)，对应中等盈利阈值'
        })}
                                    
                                    ${this.renderField({
            name: 'positionRecreation.dynamicProfitRecreation.benchmarkTier3Max',
            label: '第三档最大值',
            type: 'number',
            min: 1,
            max: 20,
            step: 0.1,
            value: 3.0,
            help: '第三档：第二档 - 此值(%)，对应较高盈利阈值'
        })}
                                    
                                    ${this.renderField({
            name: 'positionRecreation.dynamicProfitRecreation.benchmarkTier4Max',
            label: '第四档最大值',
            type: 'number',
            min: 2,
            max: 50,
            step: 0.1,
            value: 999,
            help: '第四档：第三档 - 此值(%)，超过此值使用最高盈利阈值（通常设置为一个较大值如999表示无上限）'
        })}
                                    
                                    <h6 class="sub-title">🎯 对应盈利阈值</h6>
                                    ${this.renderField({
            name: 'positionRecreation.dynamicProfitRecreation.profitThresholdTier1',
            label: '第一档盈利阈值',
            type: 'number',
            min: 0.1,
            max: 5,
            step: 0.1,
            value: 0.5,
            help: '当基准收益率在第一档时使用的盈利阈值(%)'
        })}
                                    
                                    ${this.renderField({
            name: 'positionRecreation.dynamicProfitRecreation.profitThresholdTier2',
            label: '第二档盈利阈值',
            type: 'number',
            min: 0.5,
            max: 10,
            step: 0.1,
            value: 1.5,
            help: '当基准收益率在第二档时使用的盈利阈值(%)'
        })}
                                    
                                    ${this.renderField({
            name: 'positionRecreation.dynamicProfitRecreation.profitThresholdTier3',
            label: '第三档盈利阈值',
            type: 'number',
            min: 1,
            max: 10,
            step: 0.1,
            value: 3.0,
            help: '当基准收益率在第三档时使用的盈利阈值(%)'
        })}
                                    
                                    ${this.renderField({
            name: 'positionRecreation.dynamicProfitRecreation.profitThresholdTier4',
            label: '第四档盈利阈值',
            type: 'number',
            min: 2,
            max: 15,
            step: 0.1,
            value: 5.0,
            help: '当基准收益率在第四档时使用的盈利阈值(%)'
        })}
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        `;
    }

    /**
     * 渲染字段
     */
    renderField(config) {
        const {
            name, label, type, required, placeholder, help, value, min, max, step, checked, options
        } = config;

        const fieldId = `field-${name.replace(/\./g, '-')}`;
        const errorId = `error-${name.replace(/\./g, '-')}`;
        const helpId = `help-${name.replace(/\./g, '-')}`;

        // 🔧 优先使用formData中的值，如果没有则使用config中的默认值
        const currentValue = this.getNestedValue(this.formData, name) !== undefined
            ? this.getNestedValue(this.formData, name)
            : (value !== undefined ? value : '');

        const currentChecked = type === 'checkbox'
            ? (this.getNestedValue(this.formData, name) !== undefined
                ? Boolean(this.getNestedValue(this.formData, name))
                : (checked !== undefined ? checked : false))
            : false;



        let inputHtml = '';
        const commonAttrs = {
            id: fieldId,
            name: name,
            'data-field': name,
            'aria-describedby': help ? helpId : null,
            'aria-invalid': 'false'
        };

        if (required) commonAttrs.required = 'required';
        if (placeholder) commonAttrs.placeholder = placeholder;

        switch (type) {
            case 'text':
            case 'email':
            case 'url':
                inputHtml = `<input type="${type}" ${this.attrsToString(commonAttrs)} value="${currentValue}" class="form-input">`;
                break;
            case 'number':
                const numberAttrs = { ...commonAttrs };
                if (min !== undefined) numberAttrs.min = min;
                if (max !== undefined) numberAttrs.max = max;
                if (step !== undefined) numberAttrs.step = step;
                inputHtml = `<input type="number" ${this.attrsToString(numberAttrs)} value="${currentValue}" class="form-input">`;
                break;
            case 'checkbox':
                inputHtml = `
                    <label class="checkbox-label">
                        <input type="checkbox" ${this.attrsToString(commonAttrs)} ${currentChecked ? 'checked' : ''} class="form-checkbox">
                        <span class="checkbox-custom"></span>
                        <span class="checkbox-text">${label}</span>
                    </label>
                `;
                break;
            case 'select':
                const optionsHtml = options.map(opt =>
                    `<option value="${opt.value}" ${opt.value === currentValue ? 'selected' : ''}>${opt.label}</option>`
                ).join('');
                inputHtml = `<select ${this.attrsToString(commonAttrs)} class="form-select">${optionsHtml}</select>`;
                break;
        }

        if (type === 'checkbox') {
            return `
                <div class="form-field checkbox-field" data-field="${name}">
                    ${inputHtml}
                    ${help ? `<div class="field-help" id="${helpId}">${help}</div>` : ''}
                    <div class="field-error" id="${errorId}"></div>
                </div>
            `;
        }

        return `
            <div class="form-field" data-field="${name}">
                <label class="field-label" for="${fieldId}">
                    ${label}
                    ${required ? '<span class="required">*</span>' : ''}
                </label>
                ${inputHtml}
                ${help ? `<div class="field-help" id="${helpId}">${help}</div>` : ''}
                <div class="field-error" id="${errorId}"></div>
            </div>
        `;
    }

    /**
     * 渲染预览
     */
    renderPreview() {
        return `
            <div class="creator-preview">
                <h4 class="preview-title">
                    <span class="preview-icon">👁️</span>
                    策略预览
                </h4>
                <div class="preview-content" id="strategyPreview">
                    <div class="preview-placeholder">
                        <div class="placeholder-icon">📋</div>
                        <p>填写表单后将显示策略配置预览</p>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染操作按钮
     */
    renderActions() {
        return `
            <div class="creator-actions">
                <div class="actions-left">
                    <button type="button" class="btn btn-secondary" id="clearForm">
                        <span class="btn-icon">🗑️</span>
                        清空表单
                    </button>
                    <button type="button" class="btn btn-secondary" id="clearSavedData" title="清除保存的表单配置">
                        <span class="btn-icon">💾</span>
                        清除保存
                    </button>
                    <button type="button" class="btn btn-secondary" id="validateForm">
                        <span class="btn-icon">✅</span>
                        验证配置
                    </button>
                </div>
                <div class="actions-right">
                    <button type="button" class="btn btn-primary" id="createStrategy" disabled>
                        <span class="btn-icon">🚀</span>
                        <span class="btn-text">创建策略</span>
                        <span class="btn-loading" style="display: none;">
                            <span class="spinner"></span>
                            创建中...
                        </span>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * 同步表单值到formData（确保默认值正确填充）
     */
    syncFormValues() {
        // 获取所有表单字段
        const fields = this.container.querySelectorAll('[data-field]');

        fields.forEach(field => {
            const fieldName = field.dataset.field;
            const savedValue = this.getNestedValue(this.formData, fieldName);

            // 如果formData中有保存的值，则填充到表单元素
            if (savedValue !== undefined && savedValue !== '') {
                if (field.type === 'checkbox') {
                    field.checked = Boolean(savedValue);
                } else {
                    field.value = savedValue;
                }
            } else {
                // 🔧 对于checkbox，不要从DOM读取值，而是检查是否有默认值
                if (field.type === 'checkbox') {
                    // 检查是否有预设的默认值（如enableSmartStopLoss等）
                    const hasDefaultValue = this.getNestedValue(this.formData, fieldName) !== undefined;
                    if (hasDefaultValue) {
                        // 如果formData中已有默认值，使用它来设置checkbox
                        const defaultValue = this.getNestedValue(this.formData, fieldName);
                        field.checked = Boolean(defaultValue);
                    } else {
                        // 否则从DOM元素读取当前状态
                        const value = field.checked;
                        this.setNestedValue(this.formData, fieldName, value);
                    }
                } else {
                    // 非checkbox字段，从表单元素读取值到formData
                    let value;
                    if (field.type === 'number') {
                        value = field.value ? parseFloat(field.value) : '';
                    } else {
                        value = field.value;
                    }

                    if (value !== '' && value !== undefined) {
                        this.setNestedValue(this.formData, fieldName, value);
                    }
                }
            }
        });

        // 🔧 立即同步开关状态，不使用延迟
        this.syncToggleStates();

        // 确保预览也正确更新
        if (this.options.showPreview) {
            this.updatePreview();
        }

    }

    /**
     * 同步开关状态的显示
     */
    syncToggleStates() {
        // 智能止损开关
        const enableStopLoss = this.container.querySelector('[data-field="enableSmartStopLoss"]');
        const stopLossDetails = this.container.querySelector('#stopLossDetails');

        if (enableStopLoss && stopLossDetails) {
            // 🔧 从formData读取正确的状态，而不是依赖DOM
            const formDataValue = this.getNestedValue(this.formData, 'enableSmartStopLoss');
            const shouldShow = formDataValue !== undefined ? formDataValue : true;

            // 🔧 确保DOM状态与formData一致
            enableStopLoss.checked = shouldShow;
            stopLossDetails.style.display = shouldShow ? 'block' : 'none';

        }

        // 头寸重建开关 - 智能头寸重建
        const enableMarketOpportunity = this.container.querySelector('[data-field="positionRecreation.enableMarketOpportunityRecreation"]');
        const marketOpportunityDetails = this.container.querySelector('#marketOpportunityDetails');

        if (enableMarketOpportunity && marketOpportunityDetails) {
            // 🔧 从formData读取正确的状态，而不是依赖DOM
            const formDataValue = this.getNestedValue(this.formData, 'positionRecreation.enableMarketOpportunityRecreation');
            const shouldShow = formDataValue !== undefined ? formDataValue : true;

            // 🔧 确保DOM状态与formData一致
            enableMarketOpportunity.checked = shouldShow;
            marketOpportunityDetails.style.display = shouldShow ? 'block' : 'none';

        }

        // 头寸重建开关 - 止损后反弹重建
        const enableLossRecovery = this.container.querySelector('[data-field="positionRecreation.enableLossRecoveryRecreation"]');
        const lossRecoveryDetails = this.container.querySelector('#lossRecoveryDetails');

        if (enableLossRecovery && lossRecoveryDetails) {
            // 🔧 从formData读取正确的状态，而不是依赖DOM
            const formDataValue = this.getNestedValue(this.formData, 'positionRecreation.enableLossRecoveryRecreation');
            const shouldShow = formDataValue !== undefined ? formDataValue : true;

            // 🔧 确保DOM状态与formData一致
            enableLossRecovery.checked = shouldShow;
            lossRecoveryDetails.style.display = shouldShow ? 'block' : 'none';

        }


    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 表单字段变化事件
        this.container.addEventListener('input', (e) => {
            if (e.target.matches('[data-field]')) {
                const fieldName = e.target.dataset.field;
                const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                this.handleFieldChange(fieldName, value);
            }
        });

        // 智能止损开关
        const enableStopLoss = this.container.querySelector('[data-field="enableSmartStopLoss"]');
        if (enableStopLoss) {
            enableStopLoss.addEventListener('change', (e) => {
                const details = this.container.querySelector('#stopLossDetails');
                if (details) {
                    details.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        }

        // 🏗️ 头寸重建配置开关
        const enableMarketOpportunity = this.container.querySelector('[data-field="positionRecreation.enableMarketOpportunityRecreation"]');
        if (enableMarketOpportunity) {
            enableMarketOpportunity.addEventListener('change', (e) => {
                const details = this.container.querySelector('#marketOpportunityDetails');
                if (details) {
                    details.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        }

        const enableLossRecovery = this.container.querySelector('[data-field="positionRecreation.enableLossRecoveryRecreation"]');
        if (enableLossRecovery) {
            enableLossRecovery.addEventListener('change', (e) => {
                const details = this.container.querySelector('#lossRecoveryDetails');
                if (details) {
                    details.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        }

        const enableDynamicProfit = this.container.querySelector('[data-field="positionRecreation.enableDynamicProfitRecreation"]');
        if (enableDynamicProfit) {
            enableDynamicProfit.addEventListener('change', (e) => {
                const details = this.container.querySelector('#dynamicProfitDetails');
                if (details) {
                    details.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        }

        // 操作按钮
        const clearBtn = document.getElementById('clearForm');
        const clearSavedBtn = document.getElementById('clearSavedData');
        const validateBtn = document.getElementById('validateForm');
        const createBtn = document.getElementById('createStrategy');

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearForm());
        }

        if (clearSavedBtn) {
            clearSavedBtn.addEventListener('click', () => this.clearSavedFormData());
        }

        if (validateBtn) {
            validateBtn.addEventListener('click', () => this.validateForm());
        }

        if (createBtn) {
            createBtn.addEventListener('click', () => this.createStrategy());
        }
    }

    /**
     * 处理字段变化
     */
    handleFieldChange(fieldName, value) {
        // 更新表单数据
        this.setNestedValue(this.formData, fieldName, value);

        // 自动保存表单配置
        this.saveFormData();

        // 实时验证
        if (this.options.autoValidate) {
            this.validateField(fieldName);
        }

        // 更新预览
        if (this.options.showPreview) {
            this.updatePreview();
        }

        // 更新创建按钮状态
        this.updateCreateButtonState();
    }

    /**
     * 设置嵌套值
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;
    }

    /**
     * 验证字段
     */
    validateField(fieldName) {
        const value = this.getNestedValue(this.formData, fieldName);
        const rules = this.getFieldRules(fieldName);

        let error = null;

        // 必填验证
        if (rules.required && (!value || value === '')) {
            error = '此字段为必填项';
        }
        // 数值验证
        else if (rules.type === 'number' && value !== '' && value !== undefined) {
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
                error = '请输入有效的数字';
            } else if (rules.min !== undefined && numValue < rules.min) {
                error = `值不能小于 ${rules.min}`;
            } else if (rules.max !== undefined && numValue > rules.max) {
                error = `值不能大于 ${rules.max}`;
            }
        }
        // 地址验证
        else if (fieldName === 'poolAddress' && value) {
            if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
                error = '请输入有效的Solana地址';
            }
        }

        // 更新错误状态
        this.updateFieldError(fieldName, error);

        if (error) {
            this.errors[fieldName] = error;
        } else {
            delete this.errors[fieldName];
        }

        return !error;
    }

    /**
     * 获取字段规则
     */
    getFieldRules(fieldName) {
        const rules = {
            strategyName: { required: true, type: 'text' },
            poolAddress: { required: true, type: 'text' },
            positionAmount: { required: true, type: 'number', min: 0.001 },
            monitoringInterval: { required: true, type: 'number', min: 5 },
            outOfRangeTimeout: { required: true, type: 'number', min: 60 },
            yieldExtractionThreshold: { required: true, type: 'number', min: 0.001 },
            yieldExtractionTimeLock: { required: true, type: 'number', min: 1, max: 60 },
            slippageBps: { required: true, type: 'number', min: 100, max: 3000 },
            maxPriceForRecreation: { required: false, type: 'number', min: 0 },
            minPriceForRecreation: { required: false, type: 'number', min: 0 },
            benchmarkYieldThreshold5Min: { required: false, type: 'number', min: 0, max: 10 },
            minActiveBinPositionThreshold: { required: false, type: 'number', min: 0, max: 100 },
            'stopLoss.activeBinSafetyThreshold': { required: false, type: 'number', min: -100, max: 100 },
            'stopLoss.lossThresholdPercentage': { required: false, type: 'number', min: 1 },
            'stopLoss.observationPeriodMinutes': { required: false, type: 'number', min: 0, max: 60 },
            // 🏗️ 头寸重建配置验证规则
            'positionRecreation.marketOpportunity.positionThreshold': { required: false, type: 'number', min: 1, max: 99 },
            'positionRecreation.marketOpportunity.profitThreshold': { required: false, type: 'number', min: 0.1, max: 10 },
            'positionRecreation.lossRecovery.markPositionThreshold': { required: false, type: 'number', min: 1, max: 99 },
            'positionRecreation.lossRecovery.markLossThreshold': { required: false, type: 'number', min: 0.1, max: 5 },
            'positionRecreation.lossRecovery.triggerPositionThreshold': { required: false, type: 'number', min: 1, max: 99 },
            'positionRecreation.lossRecovery.triggerProfitThreshold': { required: false, type: 'number', min: 0.1, max: 5 },
            'positionRecreation.dynamicProfitRecreation.positionThreshold': { required: false, type: 'number', min: 1, max: 99 },
            'positionRecreation.dynamicProfitRecreation.benchmarkTier1Max': { required: false, type: 'number', min: 0.1, max: 5 },
            'positionRecreation.dynamicProfitRecreation.benchmarkTier2Max': { required: false, type: 'number', min: 0.5, max: 10 },
            'positionRecreation.dynamicProfitRecreation.benchmarkTier3Max': { required: false, type: 'number', min: 1, max: 20 },
            'positionRecreation.dynamicProfitRecreation.benchmarkTier4Max': { required: false, type: 'number', min: 2, max: 50 },
            'positionRecreation.dynamicProfitRecreation.profitThresholdTier1': { required: false, type: 'number', min: 0.1, max: 5 },
            'positionRecreation.dynamicProfitRecreation.profitThresholdTier2': { required: false, type: 'number', min: 0.5, max: 10 },
            'positionRecreation.dynamicProfitRecreation.profitThresholdTier3': { required: false, type: 'number', min: 1, max: 10 },
            'positionRecreation.dynamicProfitRecreation.profitThresholdTier4': { required: false, type: 'number', min: 2, max: 15 }
        };

        return rules[fieldName] || {};
    }

    /**
     * 获取嵌套值
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    /**
     * 更新字段错误
     */
    updateFieldError(fieldName, error) {
        const errorElement = document.getElementById(`error-${fieldName.replace(/\./g, '-')}`);
        const fieldElement = document.querySelector(`[data-field="${fieldName}"]`);

        if (errorElement) {
            errorElement.textContent = error || '';
            errorElement.style.display = error ? 'block' : 'none';
        }

        if (fieldElement) {
            fieldElement.classList.toggle('has-error', !!error);
        }
    }

    /**
     * 更新预览
     */
    updatePreview() {
        const preview = document.getElementById('strategyPreview');
        if (!preview) return;

        const hasData = Object.keys(this.formData).length > 0;

        if (!hasData) {
            preview.innerHTML = `
                <div class="preview-placeholder">
                    <div class="placeholder-icon">📋</div>
                    <p>填写表单后将显示策略配置预览</p>
                </div>
            `;
            return;
        }

        const stopLossEnabled = this.formData.enableSmartStopLoss;

        preview.innerHTML = `
            <div class="preview-config">
                <div class="config-section">
                    <h5>🎯 基础配置</h5>
                    <div class="config-items">
                        ${this.formData.poolAddress ? `<div class="config-item">
                            <span class="config-label">池地址:</span>
                            <span class="config-value">${this.formatAddress(this.formData.poolAddress)}</span>
                        </div>` : ''}
                        ${this.formData.positionAmount ? `<div class="config-item">
                            <span class="config-label">投入金额:</span>
                            <span class="config-value">${this.formData.positionAmount}</span>
                        </div>` : ''}
                        ${this.formData.monitoringInterval ? `<div class="config-item">
                            <span class="config-label">监控间隔:</span>
                            <span class="config-value">${this.formData.monitoringInterval}秒</span>
                        </div>` : ''}
                        ${this.formData.maxPriceForRecreation !== undefined && this.formData.maxPriceForRecreation !== '' ? `<div class="config-item">
                            <span class="config-label">重新创建价格上限:</span>
                            <span class="config-value">${this.formData.maxPriceForRecreation || '无限制'}</span>
                        </div>` : ''}
                        ${this.formData.minPriceForRecreation !== undefined && this.formData.minPriceForRecreation !== '' ? `<div class="config-item">
                            <span class="config-label">重新创建价格下限:</span>
                            <span class="config-value">${this.formData.minPriceForRecreation || '无限制'}</span>
                        </div>` : ''}
                        ${this.formData.benchmarkYieldThreshold5Min !== undefined && this.formData.benchmarkYieldThreshold5Min !== '' ? `<div class="config-item">
                            <span class="config-label">15分钟平均基准收益率阈值:</span>
                            <span class="config-value">${this.formData.benchmarkYieldThreshold5Min || '禁用'}%</span>
                        </div>` : ''}
                    </div>
                </div>
                
                <div class="config-section">
                    <h5>🛡️ 智能止损</h5>
                    <div class="config-items">
                        <div class="config-item">
                            <span class="config-label">启用状态:</span>
                            <span class="config-value ${stopLossEnabled ? 'enabled' : 'disabled'}">
                                ${stopLossEnabled ? '✅ 已启用' : '❌ 已禁用'}
                            </span>
                        </div>
                        ${stopLossEnabled && this.formData.stopLoss ? `
                                                         ${this.formData.stopLoss.activeBinSafetyThreshold ? `<div class="config-item">
                                 <span class="config-label">活跃bin位置安全阈值:</span>
                                 <span class="config-value">${this.formData.stopLoss.activeBinSafetyThreshold}%</span>
                             </div>` : ''}
                             ${this.formData.stopLoss.observationPeriodMinutes ? `<div class="config-item">
                                 <span class="config-label">观察期时长:</span>
                                 <span class="config-value">${this.formData.stopLoss.observationPeriodMinutes}分钟</span>
                             </div>` : ''}
                         ` : ''}
                    </div>
                </div>
                
                <div class="config-section">
                    <h5>⚙️ 策略类型</h5>
                    <div class="config-items">
                        <div class="config-item">
                            <span class="config-label">策略类型:</span>
                            <span class="config-value strategy-type">🔗 双链头寸 (DUAL_CHAIN)</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">自动管理:</span>
                            <span class="config-value enabled">✅ 启用</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 更新创建按钮状态
     */
    updateCreateButtonState() {
        const createBtn = document.getElementById('createStrategy');
        if (!createBtn) return;

        const isValid = this.isFormValid();
        createBtn.disabled = !isValid || this.isSubmitting;

        if (isValid && !this.isSubmitting) {
            createBtn.classList.add('ready');
        } else {
            createBtn.classList.remove('ready');
        }
    }

    /**
     * 检查表单是否有效
     */
    isFormValid() {
        const requiredFields = ['strategyName', 'poolAddress', 'positionAmount', 'monitoringInterval', 'outOfRangeTimeout', 'yieldExtractionThreshold', 'slippageBps'];

        for (const field of requiredFields) {
            const value = this.getNestedValue(this.formData, field);
            if (!value || value === '') {
                return false;
            }
        }

        return Object.keys(this.errors).length === 0;
    }

    /**
     * 清空表单
     */
    clearForm() {
        this.formData = {
            strategyName: '',
            poolAddress: '',
            positionAmount: '',
            monitoringInterval: '',
            outOfRangeTimeout: '',
            yieldExtractionThreshold: '',
            yieldExtractionTimeLock: '',
            maxPriceForRecreation: '',
            minPriceForRecreation: '',
            benchmarkYieldThreshold5Min: '',
            enableSmartStopLoss: false,
            stopLoss: {
                activeBinSafetyThreshold: '',
                observationPeriodMinutes: '',
                lossThresholdPercentage: ''
            },
            positionRecreation: {
                enableMarketOpportunityRecreation: false,
                marketOpportunity: {
                    positionThreshold: '',
                    profitThreshold: ''
                },
                enableLossRecoveryRecreation: false,
                lossRecovery: {
                    markPositionThreshold: '',
                    markLossThreshold: '',
                    triggerPositionThreshold: '',
                    triggerProfitThreshold: ''
                }
            }
        };
        this.errors = {};

        // 清空所有输入框
        this.container.querySelectorAll('input, select').forEach(input => {
            if (input.type === 'checkbox') {
                input.checked = false;
            } else {
                input.value = '';
            }
        });

        // 清空错误信息
        this.container.querySelectorAll('.field-error').forEach(error => {
            error.textContent = '';
            error.style.display = 'none';
        });

        // 移除错误样式
        this.container.querySelectorAll('.has-error').forEach(field => {
            field.classList.remove('has-error');
        });

        // 同步开关状态（所有开关都关闭）
        this.syncToggleStates();

        // 清除保存的表单数据
        this.clearSavedFormData();

        this.updatePreview();
        this.updateCreateButtonState();

        this.showToast('表单已清空', 'info');
    }

    /**
     * 验证表单
     */
    validateForm() {
        const requiredFields = ['strategyName', 'poolAddress', 'positionAmount', 'monitoringInterval', 'outOfRangeTimeout', 'yieldExtractionThreshold'];

        let isValid = true;

        for (const field of requiredFields) {
            if (!this.validateField(field)) {
                isValid = false;
            }
        }

        // 验证智能止损字段（如果启用）
        if (this.formData.enableSmartStopLoss) {
            const stopLossFields = ['stopLoss.activeBinSafetyThreshold', 'stopLoss.observationPeriodMinutes'];
            for (const field of stopLossFields) {
                if (!this.validateField(field)) {
                    isValid = false;
                }
            }
        }

        if (isValid) {
            this.showToast('配置验证通过', 'success');
        } else {
            this.showToast('请修正表单中的错误', 'error');
        }

        return isValid;
    }

    /**
     * 创建策略
     */
    async createStrategy() {
        if (!this.validateForm()) {
            return;
        }

        this.isSubmitting = true;
        this.updateCreateButtonState();

        const createBtn = document.getElementById('createStrategy');
        const btnText = createBtn.querySelector('.btn-text');
        const btnLoading = createBtn.querySelector('.btn-loading');

        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-flex';

        try {
            // 准备策略配置
            const strategyConfig = {
                type: 'chain_position',
                name: this.formData.strategyName || `连锁头寸策略 ${new Date().toLocaleString()}`,
                config: {
                    poolAddress: this.formData.poolAddress,
                    positionAmount: parseFloat(this.formData.positionAmount),
                    monitoringInterval: parseInt(this.formData.monitoringInterval),
                    outOfRangeTimeout: parseInt(this.formData.outOfRangeTimeout),
                    yieldExtractionThreshold: parseFloat(this.formData.yieldExtractionThreshold),
                    yieldExtractionTimeLock: (this.formData.yieldExtractionTimeLock !== undefined && this.formData.yieldExtractionTimeLock !== null && this.formData.yieldExtractionTimeLock !== '') ? parseInt(this.formData.yieldExtractionTimeLock) : 1,
                    maxPriceForRecreation: this.formData.maxPriceForRecreation ? parseFloat(this.formData.maxPriceForRecreation) : 0,
                    minPriceForRecreation: this.formData.minPriceForRecreation ? parseFloat(this.formData.minPriceForRecreation) : 0,
                    benchmarkYieldThreshold5Min: this.formData.benchmarkYieldThreshold5Min ? parseFloat(this.formData.benchmarkYieldThreshold5Min) : 0,
                    minActiveBinPositionThreshold: this.formData.minActiveBinPositionThreshold ? parseFloat(this.formData.minActiveBinPositionThreshold) : 0,
                    chainPositionType: 'DUAL_CHAIN', // 固定为双链头寸
                    enableSmartStopLoss: this.formData.enableSmartStopLoss || false,
                    stopLoss: this.formData.enableSmartStopLoss ? {
                        activeBinSafetyThreshold: parseFloat(this.formData.stopLoss?.activeBinSafetyThreshold) || 50,
                        observationPeriodMinutes: parseInt(this.formData.stopLoss?.observationPeriodMinutes) || 15,
                        lossThresholdPercentage: parseFloat(this.formData.stopLoss?.lossThresholdPercentage) || 5
                    } : null,
                    // 🏗️ 头寸重建配置
                    positionRecreation: {
                        enableMarketOpportunityRecreation: this.formData.positionRecreation?.enableMarketOpportunityRecreation || false,
                        enableLossRecoveryRecreation: this.formData.positionRecreation?.enableLossRecoveryRecreation || false,
                        enableDynamicProfitRecreation: this.formData.positionRecreation?.enableDynamicProfitRecreation || false,
                        marketOpportunity: {
                            positionThreshold: parseFloat(this.formData.positionRecreation?.marketOpportunity?.positionThreshold) || 70,
                            profitThreshold: parseFloat(this.formData.positionRecreation?.marketOpportunity?.profitThreshold) || 1
                        },
                        lossRecovery: {
                            markPositionThreshold: parseFloat(this.formData.positionRecreation?.lossRecovery?.markPositionThreshold) || 65,
                            markLossThreshold: parseFloat(this.formData.positionRecreation?.lossRecovery?.markLossThreshold) || 0.5,
                            triggerPositionThreshold: parseFloat(this.formData.positionRecreation?.lossRecovery?.triggerPositionThreshold) || 70,
                            triggerProfitThreshold: parseFloat(this.formData.positionRecreation?.lossRecovery?.triggerProfitThreshold) || 0.5
                        },
                        dynamicProfitRecreation: {
                            positionThreshold: parseFloat(this.formData.positionRecreation?.dynamicProfitRecreation?.positionThreshold) || 70,
                            benchmarkTier1Max: parseFloat(this.formData.positionRecreation?.dynamicProfitRecreation?.benchmarkTier1Max) || 0.5,
                            benchmarkTier2Max: parseFloat(this.formData.positionRecreation?.dynamicProfitRecreation?.benchmarkTier2Max) || 1.5,
                            benchmarkTier3Max: parseFloat(this.formData.positionRecreation?.dynamicProfitRecreation?.benchmarkTier3Max) || 3.0,
                            benchmarkTier4Max: parseFloat(this.formData.positionRecreation?.dynamicProfitRecreation?.benchmarkTier4Max) || 999,
                            profitThresholdTier1: parseFloat(this.formData.positionRecreation?.dynamicProfitRecreation?.profitThresholdTier1) || 0.5,
                            profitThresholdTier2: parseFloat(this.formData.positionRecreation?.dynamicProfitRecreation?.profitThresholdTier2) || 1.5,
                            profitThresholdTier3: parseFloat(this.formData.positionRecreation?.dynamicProfitRecreation?.profitThresholdTier3) || 3.0,
                            profitThresholdTier4: parseFloat(this.formData.positionRecreation?.dynamicProfitRecreation?.profitThresholdTier4) || 5.0
                        }
                    }
                }
            };

            console.log('🚀 创建策略配置:', strategyConfig);

            // 调用API创建策略
            const response = await fetch('/api/strategy/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(strategyConfig)
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('策略创建成功！', 'success');

                // 触发策略创建事件
                if (this.eventBus) {
                    this.eventBus.emit('strategy:created', result.data);
                }

                // 🎯 新增：自动跳转到监控界面
                this.redirectToMonitorTab();

                // 清空表单数据
                this.clearSavedFormData();

            } else {
                throw new Error(result.message || '策略创建失败');
            }

        } catch (error) {
            console.error('❌ 策略创建失败:', error);
            this.showToast(error.message || '策略创建失败', 'error');
        } finally {
            this.isSubmitting = false;
            this.updateCreateButtonState();

            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    }

    /**
     * 显示提示消息
     */
    showToast(message, type = 'info') {
        // 创建简单的toast通知
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;

        const colors = {
            success: '#10B981',
            error: '#EF4444',
            warning: '#F59E0B',
            info: '#3B82F6'
        };

        toast.style.background = colors[type] || colors.info;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }, 3000);
    }

    /**
     * 格式化地址
     */
    formatAddress(address) {
        if (!address) return '';
        if (address.length <= 10) return address;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    /**
     * 属性转字符串
     */
    attrsToString(attrs) {
        return Object.entries(attrs)
            .filter(([key, value]) => value !== null && value !== undefined)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
    }

    /**
     * 应用样式
     */
    applyStyles() {
        if (document.getElementById('chain-position-creator-styles')) return;

        const styles = `
            <style id="chain-position-creator-styles">
                .chain-position-creator {
                    max-width: 800px;
                    margin: 0 auto;
                    background: var(--bg-secondary, #1a1a1a);
                    border-radius: 12px;
                    padding: 24px;
                }

                .creator-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 32px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid var(--border-color, #333);
                }

                .creator-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0 0 8px 0;
                    color: var(--text-primary, #ffffff) !important;
                    font-size: 24px;
                    font-weight: 600;
                    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
                }

                .creator-description {
                    margin: 0;
                    color: var(--text-secondary, #ccc);
                    font-size: 14px;
                    line-height: 1.5;
                }

                .auto-save-notice {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 12px;
                    padding: 8px 12px;
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    border-radius: 6px;
                    font-size: 12px;
                }

                .notice-icon {
                    font-size: 14px;
                }

                .notice-text {
                    color: #10b981;
                    font-weight: 500;
                }

                .header-status {
                    display: flex;
                    align-items: center;
                }

                .status-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 12px;
                    border-radius: 20px;
                    background: var(--bg-tertiary, #2a2a2a);
                    font-size: 12px;
                }

                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #666;
                }

                .status-dot.success {
                    background: #10B981;
                }

                .form-section {
                    margin-bottom: 32px;
                }

                .section-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0 0 16px 0;
                    color: var(--text-primary, #ffffff) !important;
                    font-size: 18px;
                    font-weight: 600;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                }

                .fields-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                }

                .form-field {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .field-label {
                    color: var(--text-primary, #ffffff) !important;
                    font-size: 14px;
                    font-weight: 500;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                }

                .required {
                    color: #EF4444;
                }

                .form-input, .form-select {
                    padding: 12px;
                    border: 1px solid var(--border-color, #333);
                    border-radius: 8px;
                    background: var(--bg-tertiary, #2a2a2a);
                    color: var(--text-primary, #fff);
                    font-size: 14px;
                    transition: border-color 0.2s ease;
                }

                .form-input:focus, .form-select:focus {
                    outline: none;
                    border-color: var(--primary-color, #00d4aa);
                }

                .checkbox-field {
                    flex-direction: row;
                    align-items: center;
                }

                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                }

                .form-checkbox {
                    display: none;
                }

                .checkbox-custom {
                    width: 20px;
                    height: 20px;
                    border: 2px solid var(--border-color, #333);
                    border-radius: 4px;
                    background: var(--bg-tertiary, #2a2a2a);
                    transition: all 0.2s ease;
                }

                .form-checkbox:checked + .checkbox-custom {
                    background: var(--primary-color, #00d4aa);
                    border-color: var(--primary-color, #00d4aa);
                }

                .form-checkbox:checked + .checkbox-custom::after {
                    content: '✓';
                    display: block;
                    color: white;
                    font-size: 12px;
                    text-align: center;
                    line-height: 16px;
                }

                .field-help {
                    font-size: 12px;
                    color: var(--text-secondary, #999);
                    line-height: 1.4;
                }

                .field-error {
                    display: none;
                    font-size: 12px;
                    color: #EF4444;
                }

                .has-error .form-input,
                .has-error .form-select {
                    border-color: #EF4444;
                }

                .stop-loss-details {
                    margin-top: 16px;
                    padding: 16px;
                    border: 1px solid var(--border-color, #333);
                    border-radius: 8px;
                    background: var(--bg-tertiary, #2a2a2a);
                }

                .creator-preview {
                    margin: 32px 0;
                    padding: 20px;
                    border: 1px solid var(--border-color, #333);
                    border-radius: 8px;
                    background: var(--bg-tertiary, #2a2a2a);
                }

                .preview-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0 0 16px 0;
                    color: var(--text-primary, #ffffff) !important;
                    font-size: 16px;
                    font-weight: 600;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
                }

                .preview-placeholder {
                    text-align: center;
                    padding: 40px 20px;
                    color: var(--text-secondary, #999);
                }

                .placeholder-icon {
                    font-size: 32px;
                    margin-bottom: 12px;
                }

                .config-section {
                    margin-bottom: 20px;
                }

                .config-section h5 {
                    margin: 0 0 12px 0;
                    color: var(--text-primary, #ffffff) !important;
                    font-size: 14px;
                    font-weight: 600;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
                }

                .config-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid var(--border-color, #333);
                }

                .config-item:last-child {
                    border-bottom: none;
                }

                .config-label {
                    color: var(--text-secondary, #ccc);
                    font-size: 12px;
                }

                .config-value {
                    color: var(--text-primary, #fff);
                    font-size: 12px;
                    font-weight: 500;
                }

                .config-value.enabled {
                    color: #10B981;
                }

                .config-value.disabled {
                    color: #EF4444;
                }

                .config-value.strategy-type {
                    color: var(--primary-color, #00d4aa);
                }

                .creator-actions {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 32px;
                    padding-top: 20px;
                    border-top: 1px solid var(--border-color, #333);
                }

                .actions-left, .actions-right {
                    display: flex;
                    gap: 12px;
                }

                .btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 20px;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-decoration: none;
                }

                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .btn-primary {
                    background: var(--primary-color, #00d4aa);
                    color: white;
                }

                .btn-primary:hover:not(:disabled) {
                    background: var(--primary-color-hover, #00b894);
                }

                .btn-primary.ready {
                    animation: pulse 2s infinite;
                }

                .btn-secondary {
                    background: var(--bg-tertiary, #2a2a2a);
                    color: var(--text-secondary, #ccc);
                    border: 1px solid var(--border-color, #333);
                }

                .btn-secondary:hover {
                    background: var(--bg-quaternary, #333);
                    border-color: var(--primary-color, #00d4aa);
                }

                .btn-loading {
                    display: none;
                    align-items: center;
                    gap: 8px;
                }

                .spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid transparent;
                    border-top: 2px solid currentColor;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                }

                @media (max-width: 768px) {
                    .creator-header {
                        flex-direction: column;
                        gap: 16px;
                    }

                    .fields-grid {
                        grid-template-columns: 1fr;
                    }

                    .creator-actions {
                        flex-direction: column;
                        gap: 16px;
                    }

                    .actions-left, .actions-right {
                        width: 100%;
                        justify-content: center;
                    }
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }

    /**
     * 加载保存的表单数据
     */
    loadSavedFormData() {
        try {
            const savedData = localStorage.getItem(this.formSaveKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);

                // 排除策略名称（每次都生成新的）
                const { strategyName, ...restData } = parsedData;

                // 合并到当前formData中
                this.formData = {
                    ...this.formData,
                    ...restData
                };


            }
        } catch (error) {
            console.warn('[ChainPositionCreator] 加载保存的表单配置失败:', error);
        }
    }

    /**
     * 保存表单数据到localStorage
     */
    saveFormData() {
        try {
            // 创建副本并排除空值
            const dataToSave = {};
            this.copyNonEmptyValues(this.formData, dataToSave);

            localStorage.setItem(this.formSaveKey, JSON.stringify(dataToSave));
        } catch (error) {
            console.warn('[ChainPositionCreator] 保存表单配置失败:', error);
        }
    }

    /**
     * 复制非空值
     */
    copyNonEmptyValues(source, target) {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                const value = source[key];

                if (value !== null && value !== undefined && value !== '') {
                    if (typeof value === 'object' && !Array.isArray(value)) {
                        target[key] = {};
                        this.copyNonEmptyValues(value, target[key]);

                        // 如果子对象为空，不保存
                        if (Object.keys(target[key]).length === 0) {
                            delete target[key];
                        }
                    } else {
                        target[key] = value;
                    }
                }
            }
        }
    }

    /**
     * 清除保存的表单数据
     */
    clearSavedFormData() {
        try {
            localStorage.removeItem(this.formSaveKey);
            this.showToast('✅ 保存的表单配置已清除', 'success');
        } catch (error) {
            console.warn('[ChainPositionCreator] 清除保存的表单配置失败:', error);
            this.showToast('❌ 清除保存配置失败', 'error');
        }
    }

    /**
     * 销毁创建器
     */
    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }

        // 移除样式
        const styles = document.getElementById('chain-position-creator-styles');
        if (styles) {
            styles.remove();
        }
    }

    /**
     * 🎯 自动跳转到监控界面
     * 模拟简单Y策略的跳转功能
     */
    redirectToMonitorTab() {
        try {
            console.log('🎯 策略创建成功，准备跳转到监控界面...');
            
            // 延迟跳转，确保创建流程完全完成
            setTimeout(() => {
                // 方法1：通过全局应用管理器切换选项卡
                if (window.appManager && typeof window.appManager.switchChainPositionTab === 'function') {
                    console.log('🎯 通过应用管理器切换到监控选项卡');
                    window.appManager.switchChainPositionTab('monitor');
                } 
                // 方法2：直接操作DOM元素切换选项卡
                else {
                    console.log('🎯 直接切换选项卡DOM');
                    this.switchTabDirectly('monitor');
                }
                
                // 🔧 修复：确保策略监控器正确连接和刷新
                setTimeout(() => {
                    this.ensureStrategyMonitorWorking();
                }, 1000);
                
                console.log('✅ 成功跳转到监控界面');
            }, 500);
            
        } catch (error) {
            console.error('❌ 跳转到监控界面失败:', error);
            // 跳转失败不应该影响策略创建的成功状态
        }
    }

    /**
     * 🔧 确保策略监控器正常工作
     */
    async ensureStrategyMonitorWorking() {
        try {
            console.log('🔧 检查策略监控器状态...');
            
            if (!window.strategyMonitor) {
                console.warn('⚠️ 策略监控器不存在，尝试重新初始化...');
                if (window.appManager && typeof window.appManager.initializeStrategyMonitor === 'function') {
                    await window.appManager.initializeStrategyMonitor();
                }
                return;
            }

            // 检查连接状态
            const isConnected = window.strategyMonitor.connectionManager?.isConnected;
            console.log('🔧 当前连接状态:', isConnected);

            if (!isConnected) {
                console.log('🔌 Socket.IO未连接，尝试重新连接...');
                
                // 尝试重新连接
                if (window.strategyMonitor.connect && typeof window.strategyMonitor.connect === 'function') {
                    await window.strategyMonitor.connect();
                    console.log('✅ Socket.IO重新连接完成');
                }
            }

            // 刷新监控器数据
            if (window.strategyMonitor.strategyController && typeof window.strategyMonitor.strategyController.requestStrategyList === 'function') {
                console.log('🔄 刷新策略监控器数据');
                await window.strategyMonitor.strategyController.requestStrategyList();
            } else if (window.strategyMonitor.refresh && typeof window.strategyMonitor.refresh === 'function') {
                console.log('🔄 使用备用刷新方法');
                window.strategyMonitor.refresh();
            }

            console.log('✅ 策略监控器状态检查完成');

        } catch (error) {
            console.error('❌ 策略监控器状态检查失败:', error);
            
            // 如果所有方法都失败，显示提示
            this.showToast('监控器连接可能异常，请手动刷新页面或重新连接', 'warning');
        }
    }

    /**
     * 🎯 直接切换选项卡DOM
     */
    switchTabDirectly(targetTab) {
        try {
            // 更新按钮状态
            document.querySelectorAll('#page-chain-position .tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === targetTab);
            });

            // 更新内容显示
            document.querySelectorAll('#page-chain-position .tab-content').forEach(content => {
                content.classList.toggle('active', content.id === `chain-position-${targetTab}`);
            });

            console.log(`🎯 直接切换到${targetTab === 'create' ? '创建策略' : '实时监控'}选项卡`);
        } catch (error) {
            console.error('❌ 直接切换选项卡失败:', error);
        }
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChainPositionCreator;
} else if (typeof window !== 'undefined') {
    window.ChainPositionCreator = ChainPositionCreator;
} 