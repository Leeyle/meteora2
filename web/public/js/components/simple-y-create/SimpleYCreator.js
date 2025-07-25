/**
 * 🎯 简单Y策略创建器
 * 完全复刻连锁头寸策略创建器的功能，适配简单Y策略
 * 提供直观的策略配置界面和实时预览功能
 */

// 立即执行的调试信息
console.log('🔥 SimpleYCreator.js 文件开始加载...');

class SimpleYCreator {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        this.options = {
            autoValidate: true,
            showPreview: true,
            enableLocalStorage: true,
            ...options
        };

        // 状态管理
        this.formData = {};
        this.validationErrors = {};
        this.isSubmitting = false;
        this.previewData = null;

        // 组件引用
        this.form = null;
        this.previewPanel = null;

        this.init();
    }

    /**
     * 初始化创建器
     */
    async init() {
        try {
            console.log('🚀 简单Y策略创建器开始初始化...');

            // 🔧 按照连锁头寸策略的顺序初始化
            // 1. 加载保存的表单配置
            this.loadSavedFormData();

            // 2. 确保默认值已设置到formData中
            this.initializeDefaultValues();

            // 3. 渲染界面
            this.render();

            // 4. 绑定事件
            this.bindEvents();

            // 5. 应用样式
            this.applyStyles();

            // 6. 渲染完成后立即同步表单值，确保默认值正确填充
            this.syncFormValues();

            // 初始化表单验证
            if (this.options.autoValidate) {
                this.initValidation();
            }

            console.log('✅ 简单Y策略创建器初始化完成');
        } catch (error) {
            console.error('❌ 简单Y策略创建器初始化失败:', error);
            this.showError('创建器初始化失败: ' + error.message);
        }
    }

    /**
     * 🔧 重命名：加载保存的表单数据（与连锁策略命名保持一致）
     */
    loadSavedFormData() {
        try {
            const saved = localStorage.getItem('simpleYStrategyForm');
            if (saved) {
                const parsedData = JSON.parse(saved);
                console.log('📥 从localStorage加载的数据:', parsedData);
                
                // 🔧 参考连锁头寸策略：排除策略名称（每次都生成新的）
                const { strategyName, ...restData } = parsedData;
                
                // 🔧 合并到当前formData中，而不是直接覆盖
                this.formData = {
                    ...this.formData,
                    ...restData
                };

                console.log('✅ 从本地存储加载表单数据成功，当前formData:', this.formData);
            } else {
                console.log('📭 没有找到保存的表单数据');
            }
        } catch (error) {
            console.warn('[SimpleYCreator] 加载保存的表单配置失败:', error);
        }
    }

    /**
     * 🔧 重命名：保存表单数据到localStorage（与连锁策略命名保持一致）
     */
    saveFormData() {
        try {
            // 🔧 参考连锁头寸策略：创建副本并排除空值
            const dataToSave = {};
            this.copyNonEmptyValues(this.formData, dataToSave);

            localStorage.setItem('simpleYStrategyForm', JSON.stringify(dataToSave));
            console.log('✅ 表单数据已自动保存到本地存储:', dataToSave);
        } catch (error) {
            console.warn('[SimpleYCreator] 保存表单配置失败:', error);
        }
    }

    /**
     * 🔧 重命名：初始化默认值（与连锁策略命名保持一致）
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
            binRange: 69,
            slippageBps: 1000,
            // 🔧 修复：设置用户要求的默认值
            benchmarkYieldThreshold5Min: 0.4,        // 基准收益率阈值(%) - 默认0.4
            maxPriceForRecreation: 0.000001,         // 重建最高价格限制 - 默认0.000001
            minPriceForRecreation: 0.0000035,        // 重建最低价格限制 - 默认0.0000035
            minActiveBinPositionThreshold: 10,       // 最低活跃bin位置阈值(%) - 默认10
            'stopLoss.activeBinSafetyThreshold': 50,
            'stopLoss.observationPeriodMinutes': 15,
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

        console.log('🔧 默认值已初始化:', this.formData);
    }

    // 🔧 移除resetCriticalDefaults方法，完全参考连锁头寸策略的做法
    // 不需要额外的重置逻辑，initializeDefaultValues已经足够

    /**
     * 渲染界面
     */
    render() {
        this.container.innerHTML = `
            <div class="simple-y-creator">
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
                        创建简单Y头寸策略
                    </h3>
                    <p class="creator-description">
                        配置您的简单Y头寸策略参数，系统将自动管理您的流动性头寸
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
                                placeholder: '简单Y策略 ' + new Date().toLocaleString(),
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
                            ${this.renderField({
                                name: 'binRange',
                                label: 'Bin范围',
                                type: 'number',
                                required: true,
                                min: 1,
                                max: 69,
                                step: 1,
                                value: this.formData.binRange || 69,
                                help: 'Y头寸覆盖的bin数量范围，默认69个bin'
                            })}
                        </div>

                        <div class="section-group">
                            <h4>📊 监控参数</h4>
                            ${this.renderField({
                                name: 'monitoringInterval',
                                label: '监控间隔(秒)',
                                type: 'number',
                                min: 10,
                                max: 300,
                                step: 5,
                                value: this.formData.monitoringInterval || 45,
                                help: '监控活跃bin和收益的间隔时间'
                            })}
                            ${this.renderField({
                                name: 'outOfRangeTimeout',
                                label: '脱离范围超时(秒)',
                                type: 'number',
                                min: 60,
                                max: 3600,
                                step: 60,
                                value: this.formData.outOfRangeTimeout || 600,
                                help: '头寸脱离范围多长时间后触发重建'
                            })}
                            ${this.renderField({
                                name: 'maxPriceForRecreation',
                                label: '重建最高价格限制',
                                type: 'number',
                                min: 0,
                                step: 0.000001,
                                value: this.formData.maxPriceForRecreation !== undefined ? this.formData.maxPriceForRecreation : 0.000001,
                                placeholder: '默认0.000001',
                                help: '当价格高于此值时禁止头寸重建'
                            })}
                            ${this.renderField({
                                name: 'minPriceForRecreation',
                                label: '重建最低价格限制',
                                type: 'number',
                                min: 0,
                                step: 0.000001,
                                value: this.formData.minPriceForRecreation !== undefined ? this.formData.minPriceForRecreation : 0.0000035,
                                placeholder: '默认0.0000035',
                                help: '当价格低于此值时禁止头寸重建'
                            })}
                            ${this.renderField({
                                name: 'benchmarkYieldThreshold5Min',
                                label: '基准收益率阈值(%)',
                                type: 'number',
                                min: 0,
                                step: 0.01,
                                value: this.formData.benchmarkYieldThreshold5Min !== undefined ? this.formData.benchmarkYieldThreshold5Min : 0.4,
                                help: '动态重建开关的基准收益率阈值，默认0.4%'
                            })}
                            ${this.renderField({
                                name: 'minActiveBinPositionThreshold',
                                label: '最低活跃bin位置阈值(%)',
                                type: 'number',
                                min: 0,
                                max: 100,
                                step: 1,
                                value: this.formData.minActiveBinPositionThreshold !== undefined ? this.formData.minActiveBinPositionThreshold : 10,
                                help: '活跃bin位置低于此值时禁止所有重建方法，默认10%'
                            })}
                        </div>

                        <div class="section-group">
                            <h4>💰 收益提取设置</h4>
                            ${this.renderField({
                                name: 'yieldExtractionThreshold',
                                label: '收益提取阈值(%)',
                                type: 'number',
                                min: 0.01,
                                max: 100,
                                step: 0.01,
                                value: this.formData.yieldExtractionThreshold || 0.1,
                                help: '达到此收益百分比时自动提取收益'
                            })}
                            ${this.renderField({
                                name: 'yieldExtractionTimeLock',
                                label: '收益提取时间锁(分钟)',
                                type: 'number',
                                min: 1,
                                max: 60,
                                step: 1,
                                value: this.formData.yieldExtractionTimeLock || 1,
                                help: '提取收益后的冷却时间'
                            })}
                        </div>

                        <div class="section-group">
                            <h4>🔧 交易设置</h4>
                            ${this.renderField({
                                name: 'slippageBps',
                                label: '滑点容忍度(基点)',
                                type: 'number',
                                min: 50,
                                max: 2000,
                                step: 50,
                                value: this.formData.slippageBps || 1000,
                                help: '代币交换滑点设置（基点，1000=10%）'
                            })}
                        </div>

                        <div class="section-group">
                            <h4>🛡️ 智能止损配置</h4>
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
                                    value: this.formData['stopLoss.activeBinSafetyThreshold'] || 50,
                                    help: '活跃bin位置安全阈值(%) - 设置为负数可实现永不触发智能止损'
                                })}
                                
                                ${this.renderField({
                                    name: 'stopLoss.observationPeriodMinutes',
                                    label: '观察期时长',
                                    type: 'number',
                                    min: 0,
                                    max: 60,
                                    step: 1,
                                    value: this.formData['stopLoss.observationPeriodMinutes'] || 15,
                                    help: '观察期时长(分钟)'
                                })}
                                
                                ${this.renderField({
                                    name: 'stopLoss.lossThresholdPercentage',
                                    label: '亏损止损阈值',
                                    type: 'number',
                                    min: 1,
                                    step: 0.1,
                                    value: this.formData['stopLoss.lossThresholdPercentage'] || 3, // 🔧 与默认值一致：3
                                    help: '亏损超过此百分比才触发止损(%)'
                                })}
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
                                            value: this.formData['positionRecreation.marketOpportunity.positionThreshold'] || 70,
                                            help: '当活跃bin位置低于此百分比时触发重建条件(%)'
                                        })}
                                        
                                        ${this.renderField({
                                            name: 'positionRecreation.marketOpportunity.profitThreshold',
                                            label: '盈利阈值',
                                            type: 'number',
                                            min: 0.1,
                                            max: 10,
                                            step: 0.1,
                                            value: this.formData['positionRecreation.marketOpportunity.profitThreshold'] || 1,
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
                                            value: this.formData['positionRecreation.lossRecovery.markPositionThreshold'] || 65,
                                            help: '活跃bin位置低于此百分比时开始监控亏损状态(%)'
                                        })}
                                        
                                        ${this.renderField({
                                            name: 'positionRecreation.lossRecovery.markLossThreshold',
                                            label: '标记时亏损阈值',
                                            type: 'number',
                                            min: 0.1,
                                            max: 5,
                                            step: 0.1,
                                            value: this.formData['positionRecreation.lossRecovery.markLossThreshold'] || 0.5,
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
                                            value: this.formData['positionRecreation.lossRecovery.triggerPositionThreshold'] || 70,
                                            help: '已标记状态下，位置仍低于此百分比时检查盈利条件(%)'
                                        })}
                                        
                                        ${this.renderField({
                                            name: 'positionRecreation.lossRecovery.triggerProfitThreshold',
                                            label: '触发时盈利阈值',
                                            type: 'number',
                                            min: 0.1,
                                            max: 5,
                                            step: 0.1,
                                            value: this.formData['positionRecreation.lossRecovery.triggerProfitThreshold'] || 0.5,
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
                                            value: this.formData['positionRecreation.dynamicProfitRecreation.positionThreshold'] || 70,
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
                                            value: this.formData['positionRecreation.dynamicProfitRecreation.benchmarkTier1Max'] || 0.5,
                                            help: '第一档：0% - 此值(%)，对应最低盈利阈值'
                                        })}
                                        
                                        ${this.renderField({
                                            name: 'positionRecreation.dynamicProfitRecreation.benchmarkTier2Max',
                                            label: '第二档最大值',
                                            type: 'number',
                                            min: 0.5,
                                            max: 10,
                                            step: 0.1,
                                            value: this.formData['positionRecreation.dynamicProfitRecreation.benchmarkTier2Max'] || 1.5,
                                            help: '第二档：第一档 - 此值(%)，对应中等盈利阈值'
                                        })}
                                        
                                        ${this.renderField({
                                            name: 'positionRecreation.dynamicProfitRecreation.benchmarkTier3Max',
                                            label: '第三档最大值',
                                            type: 'number',
                                            min: 1,
                                            max: 20,
                                            step: 0.1,
                                            value: this.formData['positionRecreation.dynamicProfitRecreation.benchmarkTier3Max'] || 3.0,
                                            help: '第三档：第二档 - 此值(%)，对应较高盈利阈值'
                                        })}
                                        
                                        ${this.renderField({
                                            name: 'positionRecreation.dynamicProfitRecreation.benchmarkTier4Max',
                                            label: '第四档最大值',
                                            type: 'number',
                                            min: 2,
                                            max: 50,
                                            step: 0.1,
                                            value: this.formData['positionRecreation.dynamicProfitRecreation.benchmarkTier4Max'] || 999,
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
                                            value: this.formData['positionRecreation.dynamicProfitRecreation.profitThresholdTier1'] || 0.5,
                                            help: '当基准收益率在第一档时使用的盈利阈值(%)'
                                        })}
                                        
                                        ${this.renderField({
                                            name: 'positionRecreation.dynamicProfitRecreation.profitThresholdTier2',
                                            label: '第二档盈利阈值',
                                            type: 'number',
                                            min: 0.5,
                                            max: 10,
                                            step: 0.1,
                                            value: this.formData['positionRecreation.dynamicProfitRecreation.profitThresholdTier2'] || 1.5,
                                            help: '当基准收益率在第二档时使用的盈利阈值(%)'
                                        })}
                                        
                                        ${this.renderField({
                                            name: 'positionRecreation.dynamicProfitRecreation.profitThresholdTier3',
                                            label: '第三档盈利阈值',
                                            type: 'number',
                                            min: 1,
                                            max: 10,
                                            step: 0.1,
                                            value: this.formData['positionRecreation.dynamicProfitRecreation.profitThresholdTier3'] || 3.0,
                                            help: '当基准收益率在第三档时使用的盈利阈值(%)'
                                        })}
                                        
                                        ${this.renderField({
                                            name: 'positionRecreation.dynamicProfitRecreation.profitThresholdTier4',
                                            label: '第四档盈利阈值',
                                            type: 'number',
                                            min: 2,
                                            max: 15,
                                            step: 0.1,
                                            value: this.formData['positionRecreation.dynamicProfitRecreation.profitThresholdTier4'] || 5.0,
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
            name,
            label,
            type = 'text',
            required = false,
            placeholder = '',
            help = '',
            min,
            max,
            step,
            value,
            checked = false,
            options = []
        } = config;

        const fieldId = `field_${name.replace(/\./g, '_')}`;
        const requiredMark = required ? '<span class="required">*</span>' : '';
        
        // 🔧 关键修复：优先使用formData中的值，如果没有则使用config中的默认值（参考连锁策略）
        const currentValue = this.getNestedValue(this.formData, name) !== undefined
            ? this.getNestedValue(this.formData, name)
            : (value !== undefined ? value : '');

        const currentChecked = type === 'checkbox'
            ? (this.getNestedValue(this.formData, name) !== undefined
                ? Boolean(this.getNestedValue(this.formData, name))
                : (checked !== undefined ? checked : false))
            : false;
        
        let inputHtml = '';
        
        switch (type) {
            case 'text':
            case 'number':
                const inputAttrs = [
                    `type="${type}"`,
                    `id="${fieldId}"`,
                    `name="${name}"`,
                    `data-field="${name}"`,  // 🔧 添加data-field属性
                    `class="form-control"`,
                    placeholder ? `placeholder="${placeholder}"` : '',
                    required ? 'required' : '',
                    min !== undefined ? `min="${min}"` : '',
                    max !== undefined ? `max="${max}"` : '',
                    step !== undefined ? `step="${step}"` : '',
                    `value="${currentValue}"`  // 🔧 使用currentValue而不是原始value
                ].filter(Boolean).join(' ');
                
                inputHtml = `<input ${inputAttrs}>`;
                break;
                
            case 'checkbox':
                inputHtml = `
                    <label class="checkbox-label">
                        <input type="checkbox" id="${fieldId}" name="${name}" data-field="${name}" ${currentChecked ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        ${label}
                    </label>
                `;
                return `
                    <div class="field-group">
                        ${inputHtml}
                        ${help ? `<div class="field-help">${help}</div>` : ''}
                    </div>
                `;
                
            case 'select':
                const selectOptions = options.map(opt => 
                    `<option value="${opt.value}"${opt.value === currentValue ? ' selected' : ''}>${opt.text}</option>`  // 🔧 使用currentValue比较
                ).join('');
                
                inputHtml = `
                    <select id="${fieldId}" name="${name}" data-field="${name}" class="form-control" ${required ? 'required' : ''}>
                        ${selectOptions}
                    </select>
                `;
                break;
                
            default:
                inputHtml = `<input type="text" id="${fieldId}" name="${name}" data-field="${name}" class="form-control" value="${currentValue}">`;
        }

        return `
            <div class="field-group">
                <label class="field-label" for="${fieldId}">
                    ${label} ${requiredMark}
                </label>
                ${inputHtml}
                ${help ? `<div class="field-help">${help}</div>` : ''}
                <div class="field-error" id="error_${fieldId}"></div>
            </div>
        `;
    }

    /**
     * 🔧 新增：同步表单值到formData（参考连锁头寸策略）
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
                    // 检查是否有预设的默认值
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

        console.log('✅ 表单值已同步:', this.formData);
    }

    /**
     * 渲染预览
     */
    renderPreview() {
        return `
            <div class="creator-preview" id="creatorPreview" style="display: none;">
                <h4 class="preview-title">
                    <span class="preview-icon">👁️</span>
                    策略预览
                </h4>
                <div class="preview-content" id="previewContent">
                    <!-- 预览内容将在这里显示 -->
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
                    <button type="button" class="btn btn-secondary" id="resetForm">
                        <span class="btn-icon">🔄</span>
                        重置表单
                    </button>
                    <button type="button" class="btn btn-secondary" id="clearSavedData" title="清除保存的表单配置">
                        <span class="btn-icon">💾</span>
                        清除保存
                    </button>
                </div>
                <div class="actions-right">
                    <button type="button" class="btn btn-primary" id="previewStrategy">
                        <span class="btn-icon">👁️</span>
                        预览策略
                    </button>
                    <button type="button" class="btn btn-success" id="createStrategy">
                        <span class="btn-icon">🚀</span>
                        创建策略
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 表单提交事件
        const createBtn = this.container.querySelector('#createStrategy');
        if (createBtn) {
            createBtn.addEventListener('click', (e) => this.handleSubmit(e));
        }

        // 预览按钮事件
        const previewBtn = this.container.querySelector('#previewStrategy');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => this.showPreview());
        }

        // 重置按钮事件
        const resetBtn = this.container.querySelector('#resetForm');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetForm());
        }

        // 清除保存数据按钮事件
        const clearSavedBtn = this.container.querySelector('#clearSavedData');
        if (clearSavedBtn) {
            clearSavedBtn.addEventListener('click', () => this.clearSavedFormData());
        }

        // 🔧 修复：表单字段变化事件 - 使用data-field属性（参考连锁头寸策略）
        this.container.addEventListener('input', (e) => {
            if (e.target.matches('[data-field]')) {
                const fieldName = e.target.dataset.field;
                const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                this.handleFieldChange(fieldName, value);
            }
        });

        // 🔧 修复：表单字段失焦验证事件
        this.container.addEventListener('blur', (e) => {
            if (e.target.matches('[data-field]')) {
                this.validateField(e.target);
            }
        }, true);

        // 智能止损开关事件
        const stopLossToggle = this.container.querySelector('[data-field="enableSmartStopLoss"]');
        if (stopLossToggle) {
            stopLossToggle.addEventListener('change', () => this.toggleStopLossDetails());
        }

        // 头寸重建开关事件 - 市场机会重建
        const recreationToggle = this.container.querySelector('[data-field="positionRecreation.enableMarketOpportunityRecreation"]');
        if (recreationToggle) {
            recreationToggle.addEventListener('change', () => this.toggleRecreationDetails());
        }

        // 头寸重建开关事件 - 亏损恢复重建
        const lossRecoveryToggle = this.container.querySelector('[data-field="positionRecreation.enableLossRecoveryRecreation"]');
        if (lossRecoveryToggle) {
            lossRecoveryToggle.addEventListener('change', () => this.toggleLossRecoveryDetails());
        }

        // 头寸重建开关事件 - 动态盈利重建
        const dynamicToggle = this.container.querySelector('[data-field="positionRecreation.enableDynamicProfitRecreation"]');
        if (dynamicToggle) {
            dynamicToggle.addEventListener('change', () => this.toggleDynamicProfitDetails());
        }
    }

    /**
     * 切换智能止损详情显示
     */
    toggleStopLossDetails() {
        const toggle = this.container.querySelector('[data-field="enableSmartStopLoss"]');
        const details = this.container.querySelector('#stopLossDetails');
        if (toggle && details) {
            details.style.display = toggle.checked ? 'block' : 'none';
        }
    }

    /**
     * 切换重建详情显示
     */
    toggleRecreationDetails() {
        const toggle = this.container.querySelector('[data-field="positionRecreation.enableMarketOpportunityRecreation"]');
        const details = this.container.querySelector('#marketOpportunityDetails');
        if (toggle && details) {
            details.style.display = toggle.checked ? 'block' : 'none';
        }
    }

    /**
     * 切换止损后反弹重建详情显示
     */
    toggleLossRecoveryDetails() {
        const toggle = this.container.querySelector('[data-field="positionRecreation.enableLossRecoveryRecreation"]');
        const details = this.container.querySelector('#lossRecoveryDetails');
        if (toggle && details) {
            details.style.display = toggle.checked ? 'block' : 'none';
        }
    }

    /**
     * 切换动态盈利阈值重建详情显示
     */
    toggleDynamicProfitDetails() {
        const toggle = this.container.querySelector('[data-field="positionRecreation.enableDynamicProfitRecreation"]');
        const details = this.container.querySelector('#dynamicProfitDetails');
        if (toggle && details) {
            details.style.display = toggle.checked ? 'block' : 'none';
        }
    }

    /**
     * 🔧 修复：处理字段变化（参考连锁头寸策略）
     */
    handleFieldChange(fieldName, value) {
        // 更新表单数据
        this.setNestedValue(this.formData, fieldName, value);

        // 自动保存表单配置
        this.saveFormData();

        // 实时验证
        if (this.options.autoValidate) {
            const field = this.container.querySelector(`[data-field="${fieldName}"]`);
            if (field) {
                this.validateField(field);
            }
        }

        console.log(`🔧 字段变化: ${fieldName} = ${value}`);
    }

    /**
     * 验证字段
     */
    validateField(field) {
        const { name, value, required } = field;
        const errors = [];

        // 必填验证
        if (required && !value.trim()) {
            errors.push('此字段为必填项');
        }

        // 特定字段验证
        switch (name) {
            case 'positionAmount':
                if (value && parseFloat(value) <= 0) {
                    errors.push('头寸金额必须大于0');
                }
                break;
            case 'poolAddress':
                if (value && !this.isValidSolanaAddress(value)) {
                    errors.push('请输入有效的Solana地址');
                }
                break;
        }

        // 更新验证状态
        if (errors.length > 0) {
            this.setFieldError(name, errors[0]);
        } else {
            this.clearFieldError(name);
        }

        return errors.length === 0;
    }

    /**
     * 验证池子地址
     */
    async validatePoolAddress() {
        const poolAddressInput = this.container.querySelector('[data-field="poolAddress"]');
        const address = poolAddressInput.value.trim();

        if (!address) return;

        if (!this.isValidSolanaAddress(address)) {
            this.setFieldError('poolAddress', '请输入有效的Solana地址');
            return;
        }

        try {
            // 显示加载状态
            this.setFieldLoading('poolAddress', true);

            // 验证池子是否存在
            if (window.apiService) {
                const response = await window.apiService.request('/api/pool/validate', {
                    method: 'POST',
                    body: { address }
                });

                if (response.success) {
                    this.clearFieldError('poolAddress');
                    this.showFieldSuccess('poolAddress', '池子验证成功');
                } else {
                    this.setFieldError('poolAddress', response.error || '池子验证失败');
                }
            }
        } catch (error) {
            console.error('池子验证失败:', error);
            this.setFieldError('poolAddress', '池子验证失败');
        } finally {
            this.setFieldLoading('poolAddress', false);
        }
    }

    /**
     * 显示预览
     */
    showPreview() {
        try {
            // 收集表单数据
            this.collectFormData();

            // 验证表单
            if (!this.validateForm()) {
                this.showNotification('请先修正表单中的错误', 'error');
                return;
            }

            // 生成预览数据
            this.generatePreview();

            // 显示预览面板
            const previewSection = this.container.querySelector('#creatorPreview');
            if (previewSection) {
                previewSection.style.display = 'block';
                previewSection.scrollIntoView({ behavior: 'smooth' });
            }

        } catch (error) {
            console.error('生成预览失败:', error);
            this.showNotification('生成预览失败', 'error');
        }
    }

    /**
     * 生成预览
     */
    generatePreview() {
        const previewContainer = this.container.querySelector('#previewContent');
        if (!previewContainer) return;

        const { strategyName, poolAddress, positionAmount, monitoringInterval, yieldExtractionThreshold } = this.formData;

        previewContainer.innerHTML = `
            <div class="preview-summary">
                <h5>策略摘要</h5>
                <div class="summary-grid">
                    <div class="summary-item">
                        <span class="label">策略名称:</span>
                        <span class="value">${strategyName || '未设置'}</span>
                    </div>
                    <div class="summary-item">
                        <span class="label">池地址:</span>
                        <span class="value mono">${poolAddress || '未设置'}</span>
                    </div>
                    <div class="summary-item">
                        <span class="label">头寸金额:</span>
                        <span class="value">${positionAmount || '0'} Y代币</span>
                    </div>
                    <div class="summary-item">
                        <span class="label">监控间隔:</span>
                        <span class="value">${monitoringInterval || '35'} 秒</span>
                    </div>
                </div>
            </div>

            <div class="preview-config">
                <h5>配置详情</h5>
                <div class="config-grid">
                    <div class="config-item">
                        <span class="label">收益提取阈值:</span>
                        <span class="value">${yieldExtractionThreshold || '0.022'}</span>
                    </div>
                    <div class="config-item">
                        <span class="label">智能止损:</span>
                        <span class="value">${this.getNestedValue(this.formData, 'enableSmartStopLoss') ? '启用' : '禁用'}</span>
                    </div>
                    <div class="config-item">
                        <span class="label">方法2智能重建:</span>
                        <span class="value">${this.getNestedValue(this.formData, 'positionRecreation.enableMarketOpportunityRecreation') ? '启用' : '禁用'}</span>
                    </div>
                    <div class="config-item">
                        <span class="label">方法3反弹重建:</span>
                        <span class="value">${this.getNestedValue(this.formData, 'positionRecreation.enableLossRecoveryRecreation') ? '启用' : '禁用'}</span>
                    </div>
                    <div class="config-item">
                        <span class="label">方法4动态重建:</span>
                        <span class="value">${this.getNestedValue(this.formData, 'positionRecreation.enableDynamicProfitRecreation') ? '启用' : '禁用'}</span>
                    </div>
                </div>
            </div>

            <div class="preview-risk">
                <h5>风险提示</h5>
                <div class="risk-items">
                    <div class="risk-item">
                        <span class="risk-icon">⚠️</span>
                        <span class="risk-text">流动性挖矿存在无常损失风险</span>
                    </div>
                    <div class="risk-item">
                        <span class="risk-icon">📉</span>
                        <span class="risk-text">价格波动可能影响收益表现</span>
                    </div>
                    <div class="risk-item">
                        <span class="risk-icon">⛽</span>
                        <span class="risk-text">交易将产生Gas费用</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 处理表单提交
     */
    async handleSubmit(e) {
        e.preventDefault();

        if (this.isSubmitting) return;

        try {
            this.isSubmitting = true;
            this.setSubmitLoading(true);

            // 收集表单数据
            this.collectFormData();

            // 验证表单
            if (!this.validateForm()) {
                this.showNotification('请修正表单中的错误', 'error');
                return;
            }

            // 准备提交数据
            const submitData = {
                type: 'simple-y',
                name: this.formData.strategyName,
                config: this.prepareConfigData()
            };

            console.log('📊 提交简单Y策略数据:', submitData);
            console.log('📊 提交数据JSON字符串:', JSON.stringify(submitData, null, 2));

            // 发送创建请求
            if (window.apiService) {
                const response = await window.apiService.request('/strategy/create', {
                    method: 'POST',
                    body: submitData
                });

                if (response.success) {
                    this.showNotification('策略创建成功！', 'success');
                    
                    // 触发策略创建事件
                    if (window.EventBus) {
                        window.EventBus.emit('strategy:created', {
                            type: 'simple-y',
                            data: response.data
                        });
                    }

                    // 清空表单
                    this.resetForm();
                } else {
                    throw new Error(response.error || '策略创建失败');
                }
            } else {
                throw new Error('API服务未初始化');
            }

        } catch (error) {
            console.error('❌ 创建策略失败:', error);
            console.error('❌ 错误详情:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            this.showNotification('创建策略失败: ' + error.message, 'error');
        } finally {
            this.isSubmitting = false;
            this.setSubmitLoading(false);
        }
    }

    /**
     * 准备配置数据
     */
    prepareConfigData() {
        return {
            poolAddress: this.formData.poolAddress,
            positionAmount: parseFloat(this.formData.positionAmount || 5),
            binRange: parseInt(this.formData.binRange || 69),
            monitoringInterval: parseInt(this.formData.monitoringInterval || 35),
            outOfRangeTimeout: parseInt(this.formData.outOfRangeTimeout || 600),
            yieldExtractionThreshold: (parseFloat(this.formData.yieldExtractionThreshold || 0.022)).toString(),
            yieldExtractionTimeLock: (this.formData.yieldExtractionTimeLock !== undefined && this.formData.yieldExtractionTimeLock !== null && this.formData.yieldExtractionTimeLock !== '') ? parseInt(this.formData.yieldExtractionTimeLock) : 1,
            // 🔧 修复：使用用户要求的默认值作为备用值
            maxPriceForRecreation: parseFloat(this.formData.maxPriceForRecreation || 0.000001),
            minPriceForRecreation: parseFloat(this.formData.minPriceForRecreation || 0.0000035),
            slippageBps: parseInt(this.formData.slippageBps || 1000),
            benchmarkYieldThreshold5Min: parseFloat(this.formData.benchmarkYieldThreshold5Min || 0.4),
            minActiveBinPositionThreshold: parseInt(this.formData.minActiveBinPositionThreshold || 10),
            enableSmartStopLoss: this.getNestedValue(this.formData, 'enableSmartStopLoss') || false,
            stopLoss: {
                activeBinSafetyThreshold: parseInt(this.getNestedValue(this.formData, 'stopLoss.activeBinSafetyThreshold') || 50), // 🔧 与默认值一致：50
                observationPeriodMinutes: parseInt(this.getNestedValue(this.formData, 'stopLoss.observationPeriodMinutes') || 15),
                lossThresholdPercentage: parseFloat(this.getNestedValue(this.formData, 'stopLoss.lossThresholdPercentage') || 3) // 🔧 与默认值一致：3
            },
            positionRecreation: {
                enableMarketOpportunityRecreation: this.getNestedValue(this.formData, 'positionRecreation.enableMarketOpportunityRecreation') || false,
                marketOpportunity: {
                    positionThreshold: parseInt(this.getNestedValue(this.formData, 'positionRecreation.marketOpportunity.positionThreshold') || 70),
                    profitThreshold: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.marketOpportunity.profitThreshold') || 1)
                },
                enableLossRecoveryRecreation: this.getNestedValue(this.formData, 'positionRecreation.enableLossRecoveryRecreation') || false,
                lossRecovery: {
                    markPositionThreshold: parseInt(this.getNestedValue(this.formData, 'positionRecreation.lossRecovery.markPositionThreshold') || 65),
                    markLossThreshold: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.lossRecovery.markLossThreshold') || 0.5),
                    triggerPositionThreshold: parseInt(this.getNestedValue(this.formData, 'positionRecreation.lossRecovery.triggerPositionThreshold') || 70),
                    triggerProfitThreshold: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.lossRecovery.triggerProfitThreshold') || 0.5)
                },
                enableDynamicProfitRecreation: this.getNestedValue(this.formData, 'positionRecreation.enableDynamicProfitRecreation') || false,
                dynamicProfitRecreation: {
                    positionThreshold: parseInt(this.getNestedValue(this.formData, 'positionRecreation.dynamicProfitRecreation.positionThreshold') || 70),
                    benchmarkTier1Max: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.dynamicProfitRecreation.benchmarkTier1Max') || 0.5),
                    benchmarkTier2Max: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.dynamicProfitRecreation.benchmarkTier2Max') || 1.5),
                    benchmarkTier3Max: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.dynamicProfitRecreation.benchmarkTier3Max') || 3.0),
                    benchmarkTier4Max: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.dynamicProfitRecreation.benchmarkTier4Max') || 999),
                    profitThresholdTier1: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.dynamicProfitRecreation.profitThresholdTier1') || 0.5),
                    profitThresholdTier2: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.dynamicProfitRecreation.profitThresholdTier2') || 1.5),
                    profitThresholdTier3: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.dynamicProfitRecreation.profitThresholdTier3') || 3.0),
                    profitThresholdTier4: parseFloat(this.getNestedValue(this.formData, 'positionRecreation.dynamicProfitRecreation.profitThresholdTier4') || 5.0)
                }
            }
        };
    }

    /**
     * 收集表单数据
     */
    collectFormData() {
        const form = this.container.querySelector('.strategy-form');
        if (!form) return;

        const formData = new FormData(form);
        this.formData = {};

        for (let [key, value] of formData.entries()) {
            this.setNestedValue(this.formData, key, value);
        }

        // 处理checkbox
        const checkboxes = form.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            this.setNestedValue(this.formData, checkbox.name, checkbox.checked);
        });
    }

    /**
     * 验证整个表单
     */
    validateForm() {
        const form = this.container.querySelector('.strategy-form');
        if (!form) return false;

        let isValid = true;
        const inputs = form.querySelectorAll('input[required], select[required]');

        inputs.forEach(input => {
            if (!this.validateField(input)) {
                isValid = false;
            }
        });

        return isValid;
    }

    /**
     * 🔧 修复：真正的表单重置，强制重置所有字段为用户要求的默认值
     */
    forceResetCriticalDefaults() {
        // 🔧 修复：重置为用户要求的默认值
        this.formData.maxPriceForRecreation = 0.000001;         // 重建最高价格限制 - 默认0.000001
        this.formData.minPriceForRecreation = 0.0000035;        // 重建最低价格限制 - 默认0.0000035
        this.formData.benchmarkYieldThreshold5Min = 0.4;        // 基准收益率阈值(%) - 默认0.4
        this.formData.minActiveBinPositionThreshold = 10;       // 最低活跃bin位置阈值(%) - 默认10
        
        console.log('🔄 表单重置：关键字段已强制重置为默认值', {
            maxPriceForRecreation: this.formData.maxPriceForRecreation,
            minPriceForRecreation: this.formData.minPriceForRecreation,
            benchmarkYieldThreshold5Min: this.formData.benchmarkYieldThreshold5Min,
            minActiveBinPositionThreshold: this.formData.minActiveBinPositionThreshold
        });
    }

    /**
     * 重置表单
     */
    resetForm() {
        // 重置formData到默认值
        this.initializeDefaultValues();
        
        // 🔧 修复：表单重置时使用强制重置
        this.forceResetCriticalDefaults();
        
        // 清空所有输入框
        this.container.querySelectorAll('input, select, textarea').forEach(input => {
            if (input.type === 'checkbox') {
                const defaultValue = this.getNestedValue(this.formData, input.name);
                input.checked = Boolean(defaultValue);
            } else {
                const defaultValue = this.getNestedValue(this.formData, input.name);
                input.value = defaultValue !== undefined ? defaultValue : '';
            }
        });

        // 清除验证错误
        this.container.querySelectorAll('.field-error').forEach(error => {
            error.textContent = '';
            error.style.display = 'none';
        });

        // 移除错误样式
        this.container.querySelectorAll('.has-error').forEach(field => {
            field.classList.remove('has-error');
        });

        // 保存重置后的数据
        this.saveFormData();
        
        this.showNotification('✅ 表单已重置为默认值', 'success');
        console.log('✅ 表单已重置为默认值');
    }

    /**
     * 工具方法
     */
    isValidSolanaAddress(address) {
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key]) current[key] = {};
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    setFieldError(fieldName, message) {
        this.validationErrors[fieldName] = message;
        const field = this.container.querySelector(`[name="${fieldName}"]`);
        if (field) {
            field.classList.add('is-invalid');
            const errorElement = field.parentNode.querySelector('.field-error') || document.createElement('div');
            errorElement.className = 'field-error';
            errorElement.textContent = message;
            if (!field.parentNode.querySelector('.field-error')) {
                field.parentNode.appendChild(errorElement);
            }
        }
    }

    clearAllErrors() {
        this.validationErrors = {};
        this.container.querySelectorAll('.is-invalid').forEach(field => {
            field.classList.remove('is-invalid');
        });
        this.container.querySelectorAll('.field-error').forEach(error => {
            error.remove();
        });
    }

    setSubmitLoading(loading) {
        const submitBtn = this.container.querySelector('#createStrategy');
        if (submitBtn) {
            if (loading) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner"></span> 创建中...';
            } else {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span class="btn-icon">🚀</span> 创建策略';
            }
        }
    }

    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        // 这里可以集成更复杂的通知系统
        if (window.showToast) {
            window.showToast(message, type);
        }
    }

    showError(message) {
        this.container.innerHTML = `
            <div class="error-container">
                <div class="error-icon">❌</div>
                <h3>创建器加载失败</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="location.reload()">
                    重新加载
                </button>
            </div>
        `;
    }

    /**
     * 🔧 新增：清除保存的表单数据（参考连锁头寸策略）
     */
    clearSavedFormData() {
        try {
            localStorage.removeItem('simpleYStrategyForm');
            this.showNotification('✅ 保存的表单配置已清除', 'success');
        } catch (error) {
            console.warn('[SimpleYCreator] 清除保存的表单配置失败:', error);
            this.showNotification('❌ 清除保存配置失败', 'error');
        }
    }

    /**
     * 🔧 修复：复制非空值，特殊处理数字0（完全参考连锁头寸策略）
     */
    copyNonEmptyValues(source, target) {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                const value = source[key];

                // 🔧 关键修复：数字0是有效值，字符串''才是空值
                if (value !== null && value !== undefined && (value !== '' || typeof value === 'number')) {
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

    initValidation() {
        // 初始化表单验证规则
        console.log('初始化表单验证规则');
    }

    /**
     * 销毁创建器
     */
    destroy() {
        try {
            console.log('🗑️ 销毁简单Y策略创建器...');
            
            // 清空容器
            if (this.container) {
                this.container.innerHTML = '';
            }

            // 清理数据
            this.formData = {};
            this.validationErrors = {};
            
            console.log('✅ 简单Y策略创建器销毁完成');
        } catch (error) {
            console.error('❌ 销毁创建器时出错:', error);
        }
    }

    applyStyles() {
        const styles = `
            <style>
                /* 🔧 修复：使用更具体的选择器，避免影响其他页面 */
                #simpleYContent .simple-y-creator,
                .simple-y-manager .simple-y-creator {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #0f1419;
                    color: #e5e7eb;
                    min-height: 100vh;
                }

                #simpleYContent .creator-header,
                .simple-y-manager .creator-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 30px;
                    padding: 25px;
                    background: linear-gradient(135deg, #1a1d29 0%, #2d1b3d 100%);
                    color: #f8fafc;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    border: 1px solid #374151;
                }

                .header-content h3 {
                    margin: 0 0 10px 0;
                    font-size: 24px;
                    font-weight: 600;
                    color: #fbbf24;
                }

                .title-icon {
                    margin-right: 10px;
                    font-size: 28px;
                }

                .creator-description {
                    margin: 0 0 15px 0;
                    opacity: 0.9;
                    line-height: 1.5;
                    color: #d1d5db;
                }

                .auto-save-notice {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    background: rgba(251, 191, 36, 0.15);
                    border-radius: 6px;
                    font-size: 13px;
                    color: #fbbf24;
                    border: 1px solid rgba(251, 191, 36, 0.3);
                }

                .notice-icon {
                    font-size: 16px;
                }

                .header-status .status-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #d1d5db;
                }

                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #10b981;
                    box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
                }

                #simpleYContent .form-section,
                .simple-y-manager .form-section {
                    margin-bottom: 30px;
                    padding: 25px;
                    background: #1f2937;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    border: 1px solid #374151;
                }

                .section-group {
                    margin-bottom: 25px;
                    padding: 20px;
                    background: #111827;
                    border-radius: 8px;
                    border-left: 4px solid #fbbf24;
                }

                .section-group h4 {
                    margin: 0 0 15px 0;
                    color: #fbbf24;
                    font-size: 16px;
                    font-weight: 600;
                }

                #simpleYContent .form-grid,
                .simple-y-manager .form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                }

                .field-group {
                    margin-bottom: 20px;
                }

                .field-label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: 500;
                    color: #f3f4f6;
                }

                .form-control {
                    width: 100%;
                    padding: 10px 12px;
                    border: 2px solid #4b5563;
                    border-radius: 6px;
                    font-size: 14px;
                    transition: all 0.2s;
                    box-sizing: border-box;
                    background: #1f2937;
                    color: #f3f4f6;
                }

                .form-control:focus {
                    border-color: #fbbf24;
                    outline: none;
                    box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.1);
                    background: #111827;
                }

                .form-control::placeholder {
                    color: #9ca3af;
                }

                .field-help {
                    margin-top: 5px;
                    font-size: 12px;
                    color: #9ca3af;
                }

                .field-error {
                    margin-top: 5px;
                    font-size: 12px;
                    color: #f87171;
                    display: none;
                }

                .has-error .form-control {
                    border-color: #f87171;
                }

                .has-error .field-error {
                    display: block;
                }

                .creator-actions {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 30px;
                    padding: 20px;
                    background: #1f2937;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    border: 1px solid #374151;
                }

                .actions-left,
                .actions-right {
                    display: flex;
                    gap: 10px;
                }

                .btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 16px;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-decoration: none;
                }

                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .btn-primary {
                    background: #3b82f6;
                    color: white;
                    border: 1px solid #2563eb;
                }

                .btn-primary:hover:not(:disabled) {
                    background: #2563eb;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                }

                .btn-success {
                    background: #fbbf24;
                    color: #1f2937;
                    border: 1px solid #f59e0b;
                    font-weight: 600;
                }

                .btn-success:hover:not(:disabled) {
                    background: #f59e0b;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3);
                }

                .btn-secondary {
                    background: #4b5563;
                    color: #f3f4f6;
                    border: 1px solid #6b7280;
                }

                .btn-secondary:hover:not(:disabled) {
                    background: #6b7280;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(75, 85, 99, 0.3);
                }

                .btn-icon {
                    font-size: 16px;
                }

                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    color: #f3f4f6;
                }

                .checkbox-label input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    accent-color: #fbbf24;
                }

                /* 深色主题的滚动条 */
                ::-webkit-scrollbar {
                    width: 8px;
                }

                ::-webkit-scrollbar-track {
                    background: #1f2937;
                    border-radius: 4px;
                }

                ::-webkit-scrollbar-thumb {
                    background: #4b5563;
                    border-radius: 4px;
                }

                ::-webkit-scrollbar-thumb:hover {
                    background: #6b7280;
                }

                /* 选择框样式 */
                select.form-control {
                    background: #1f2937 url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23f3f4f6' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3e%3c/svg%3e") no-repeat right 0.75rem center/16px 12px;
                    -webkit-appearance: none;
                    -moz-appearance: none;
                    appearance: none;
                    padding-right: 2.5rem;
                }

                /* 焦点状态增强 */
                .form-control:focus,
                .checkbox-label input[type="checkbox"]:focus {
                    outline: 2px solid rgba(251, 191, 36, 0.5);
                    outline-offset: 2px;
                }

                @media (max-width: 768px) {
                    .creator-actions {
                        flex-direction: column;
                        gap: 15px;
                    }

                    .actions-left,
                    .actions-right {
                        width: 100%;
                        justify-content: center;
                    }

                    #simpleYContent .form-grid,
                    .simple-y-manager .form-grid {
                        grid-template-columns: 1fr;
                    }

                    .simple-y-creator {
                        padding: 15px;
                    }
                }

                /* 新增：暗色主题下的表单验证反馈 */
                .form-control.is-valid {
                    border-color: #10b981;
                }

                .form-control.is-invalid {
                    border-color: #f87171;
                }

                /* 暗色主题下的工具提示 */
                [title] {
                    position: relative;
                }

                /* 深色主题下的预览区域 */
                .preview-section {
                    background: #1f2937;
                    border: 1px solid #374151;
                    color: #f3f4f6;
                }

                .preview-section h4 {
                    color: #fbbf24;
                }
            </style>
        `;

        // 添加样式到头部
        if (!document.querySelector('#simple-y-creator-styles')) {
            const styleElement = document.createElement('div');
            styleElement.id = 'simple-y-creator-styles';
            styleElement.innerHTML = styles;
            document.head.appendChild(styleElement);
        }
    }

    showFieldError(fieldName, message) {
        const field = this.container.querySelector(`[data-field="${fieldName}"]`);
        if (field) {
            field.classList.add('has-error');
            const errorElement = field.parentNode.querySelector('.field-error') || document.createElement('div');
            errorElement.className = 'field-error';
            errorElement.textContent = message;
            if (!field.parentNode.querySelector('.field-error')) {
                field.parentNode.appendChild(errorElement);
            }
        }
    }

    clearFieldError(fieldName) {
        delete this.validationErrors[fieldName];
        const field = this.container.querySelector(`[data-field="${fieldName}"]`);
        if (field) {
            field.classList.remove('has-error');
            const errorElement = field.parentNode.querySelector('.field-error');
            if (errorElement) {
                errorElement.textContent = '';
                errorElement.style.display = 'none';
            }
        }
    }

    setFieldLoading(fieldName, loading) {
        const field = this.container.querySelector(`[data-field="${fieldName}"]`);
        if (field) {
            if (loading) {
                field.classList.add('loading');
            } else {
                field.classList.remove('loading');
            }
        }
    }

    showFieldSuccess(fieldName, message) {
        const field = this.container.querySelector(`[data-field="${fieldName}"]`);
        if (field) {
            field.classList.add('is-valid');
            setTimeout(() => {
                field.classList.remove('is-valid');
            }, 3000);
        }
    }
}

// 导出到全局
window.SimpleYCreator = SimpleYCreator;

// 添加调试信息
console.log('✅ SimpleYCreator 类已加载到全局对象'); 