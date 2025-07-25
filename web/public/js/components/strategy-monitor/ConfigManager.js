/**
 * 配置管理器
 * 负责策略配置的查看和编辑功能
 */
class ConfigManager {
    constructor(dataService, uiManager) {
        this.dataService = dataService;
        this.uiManager = uiManager;

        // 初始化
        this.init();
    }

    /**
     * 初始化配置管理器
     */
    init() {
        console.log('⚙️ 初始化配置管理器');

        // 添加配置弹窗样式
        this.addConfigModalStyles();

        console.log('✅ 配置管理器初始化完成');
    }

    /**
     * 添加配置弹窗样式
     */
    addConfigModalStyles() {
        // 检查是否已经添加过样式
        if (document.getElementById('config-modal-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'config-modal-styles';
        style.textContent = `
            .config-modal-overlay {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); z-index: 1000;
                display: flex; align-items: center; justify-content: center;
            }
            .config-modal {
                background: var(--card-bg); border-radius: 8px;
                width: 90%; max-width: 500px; max-height: 80vh; overflow: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            }
            .config-modal-header {
                padding: 16px; border-bottom: 1px solid var(--border-color);
                display: flex; justify-content: space-between; align-items: center;
            }
            .config-modal-header h3 { margin: 0; color: var(--text-primary); }
            .config-modal-close {
                background: none; border: none; font-size: 24px;
                cursor: pointer; color: var(--text-secondary);
            }
            .config-modal-content { padding: 16px; }
            .config-item { margin-bottom: 12px; }
            .config-label { font-weight: bold; color: var(--text-primary); }
            .config-value { color: var(--text-secondary); margin-left: 8px; }
            .config-section-title {
                font-size: 16px; font-weight: 600; color: var(--primary-color);
                margin: 24px 0 16px 0; padding-bottom: 8px;
                border-bottom: 1px solid var(--border-color);
            }
            
            .edit-config-modal-overlay {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.6); z-index: 1000;
                display: flex; align-items: center; justify-content: center;
            }
            .edit-config-modal {
                background: var(--card-bg); border-radius: 12px;
                width: 90%; max-width: 600px; max-height: 85vh; overflow: auto;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                border: 1px solid var(--border-color);
            }
            .edit-config-modal-header {
                padding: 20px; border-bottom: 1px solid var(--border-color);
                display: flex; justify-content: space-between; align-items: center;
                background: var(--primary-color); color: white; border-radius: 12px 12px 0 0;
            }
            .edit-config-modal-header h3 { margin: 0; font-size: 18px; }
            .edit-config-modal-close {
                background: none; border: none; font-size: 24px;
                cursor: pointer; color: white; opacity: 0.8;
                padding: 0; width: 30px; height: 30px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
            }
            .edit-config-modal-close:hover { opacity: 1; background: rgba(255,255,255,0.1); }
            .edit-config-modal-content { padding: 24px; }
            
            .form-group {
                margin-bottom: 16px;
            }
            .form-group label {
                display: block; margin-bottom: 6px;
                font-weight: 500; color: var(--text-primary);
                font-size: 14px;
            }
            .form-group input {
                width: 100%; padding: 10px 12px; border: 1px solid var(--border-color);
                border-radius: 6px; background: var(--input-bg); color: var(--text-primary);
                font-size: 14px; box-sizing: border-box;
            }
            .form-group input:focus {
                outline: none; border-color: var(--primary-color);
                box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
            }
            
            .checkbox-group label {
                display: flex; align-items: center; cursor: pointer;
            }
            .checkbox-group input[type="checkbox"] {
                width: auto; margin-right: 8px;
            }
            
            .smart-stop-loss-config, .market-opportunity-config, .loss-recovery-config, .dynamic-profit-config {
                background: var(--secondary-bg); padding: 16px; border-radius: 8px;
                border-left: 3px solid var(--primary-color); margin-top: 12px;
            }
            
            .form-section-title {
                font-size: 16px; font-weight: 600; color: var(--text-primary);
                margin: 24px 0 16px 0; padding-bottom: 8px;
                border-bottom: 1px solid var(--border-color);
            }
            
            .form-help {
                font-size: 12px; color: var(--text-muted);
                display: block; margin-top: 4px; line-height: 1.4;
            }
            
            .form-actions {
                display: flex; gap: 12px; justify-content: flex-end;
                margin-top: 24px; padding-top: 20px;
                border-top: 1px solid var(--border-color);
            }
            .btn-cancel, .btn-save {
                padding: 10px 20px; border: none; border-radius: 6px;
                cursor: pointer; font-size: 14px; font-weight: 500;
                transition: all 0.2s ease;
            }
            .btn-cancel {
                background: var(--secondary-bg); color: var(--text-secondary);
                border: 1px solid var(--border-color);
            }
            .btn-cancel:hover { background: var(--hover-bg); }
            .btn-save {
                background: var(--primary-color); color: white;
            }
            .btn-save:hover { background: var(--primary-hover); }
            .btn-save:disabled {
                background: var(--disabled-bg); cursor: not-allowed; opacity: 0.6;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * 显示策略配置弹窗
     */
    showStrategyConfigModal(strategy) {
        // 创建弹窗
        const modal = document.createElement('div');
        modal.className = 'config-modal-overlay';
        modal.innerHTML = `
            <div class="config-modal">
                <div class="config-modal-header">
                    <h3>策略配置详情</h3>
                    <button class="config-modal-close">&times;</button>
                </div>
                <div class="config-modal-content">
                    ${this.renderStrategyConfig(strategy)}
                </div>
            </div>
        `;

        // 事件处理
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('config-modal-close')) {
                document.body.removeChild(modal);
            }
        });

        document.body.appendChild(modal);
    }

    /**
     * 渲染策略配置内容
     */
    renderStrategyConfig(strategy) {
        const config = strategy.config || {};
        return `
            <div class="config-item">
                <span class="config-label">策略名称:</span>
                <span class="config-value">${strategy.name || '未命名策略'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">策略类型:</span>
                <span class="config-value">${strategy.type || '--'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">池地址:</span>
                <span class="config-value">${config.poolAddress || '--'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">投入金额:</span>
                <span class="config-value">${config.positionAmount || '--'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">监控间隔:</span>
                <span class="config-value">${config.monitoringInterval || '--'}秒</span>
            </div>
            <div class="config-item">
                <span class="config-label">超时阈值:</span>
                <span class="config-value">${config.outOfRangeTimeout || '--'}秒</span>
            </div>
            <div class="config-item">
                <span class="config-label">收益提取阈值:</span>
                <span class="config-value">${config.yieldExtractionThreshold || '--'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">收益提取时间锁:</span>
                <span class="config-value">${config.yieldExtractionTimeLock || 1}分钟</span>
            </div>
            <div class="config-item">
                <span class="config-label">X代币交换滑点:</span>
                <span class="config-value">${config.slippageBps || 1000}基点 (${((config.slippageBps || 1000) / 100).toFixed(1)}%)</span>
            </div>
            <div class="config-item">
                <span class="config-label">重新创建价格上限:</span>
                <span class="config-value">${config.maxPriceForRecreation ? config.maxPriceForRecreation : '未设置'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">重新创建价格下限:</span>
                <span class="config-value">${config.minPriceForRecreation ? config.minPriceForRecreation : '未设置'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">15分钟平均基准收益率阈值:</span>
                <span class="config-value">${config.benchmarkYieldThreshold5Min ? config.benchmarkYieldThreshold5Min + '%' : '未设置'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">最低活跃bin位置阈值:</span>
                <span class="config-value">${config.minActiveBinPositionThreshold !== undefined && config.minActiveBinPositionThreshold > 0 ? config.minActiveBinPositionThreshold + '%' : '无限制'}</span>
            </div>
            <div class="config-item">
                <span class="config-label">智能止损:</span>
                <span class="config-value">${config.enableSmartStopLoss ? '启用' : '禁用'}</span>
            </div>
            ${config.enableSmartStopLoss && config.stopLoss ? `
                <div class="config-item">
                    <span class="config-label">├─ 活跃Bin位置安全阈值:</span>
                    <span class="config-value">${config.stopLoss.activeBinSafetyThreshold || '--'}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">├─ 观察期时长:</span>
                    <span class="config-value">${config.stopLoss.observationPeriodMinutes || '--'}分钟</span>
                </div>
                <div class="config-item">
                    <span class="config-label">└─ 亏损止损阈值:</span>
                    <span class="config-value">${config.stopLoss.lossThresholdPercentage || '--'}%</span>
                </div>
            ` : ''}
            
            <!-- 🏗️ 头寸重建配置显示 -->
            <div class="config-section-title">🏗️ 头寸重建配置</div>
            <div class="config-item">
                <span class="config-label">智能头寸重建（方法2）:</span>
                <span class="config-value">${config.positionRecreation?.enableMarketOpportunityRecreation ? '启用' : '禁用'}</span>
            </div>
            ${config.positionRecreation?.enableMarketOpportunityRecreation ? `
                <div class="config-item">
                    <span class="config-label">├─ 活跃bin位置阈值:</span>
                    <span class="config-value">${config.positionRecreation.marketOpportunity?.positionThreshold || 70}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">└─ 盈利阈值:</span>
                    <span class="config-value">${config.positionRecreation.marketOpportunity?.profitThreshold || 1}%</span>
                </div>
            ` : ''}
            
            <div class="config-item">
                <span class="config-label">止损后反弹重建（方法3）:</span>
                <span class="config-value">${config.positionRecreation?.enableLossRecoveryRecreation ? '启用' : '禁用'}</span>
            </div>
            ${config.positionRecreation?.enableLossRecoveryRecreation ? `
                <div class="config-item">
                    <span class="config-label">├─ 标记时位置阈值:</span>
                    <span class="config-value">${config.positionRecreation.lossRecovery?.markPositionThreshold || 65}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">├─ 标记时亏损阈值:</span>
                    <span class="config-value">${config.positionRecreation.lossRecovery?.markLossThreshold || 0.5}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">├─ 触发时位置阈值:</span>
                    <span class="config-value">${config.positionRecreation.lossRecovery?.triggerPositionThreshold || 70}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">└─ 触发时盈利阈值:</span>
                    <span class="config-value">${config.positionRecreation.lossRecovery?.triggerProfitThreshold || 0.5}%</span>
                </div>
            ` : ''}
            
            <div class="config-item">
                <span class="config-label">动态盈利阈值重建（方法4）:</span>
                <span class="config-value">${config.positionRecreation?.enableDynamicProfitRecreation ? '启用' : '禁用'}</span>
            </div>
            ${config.positionRecreation?.enableDynamicProfitRecreation ? `
                <div class="config-item">
                    <span class="config-label">├─ 活跃bin位置阈值:</span>
                    <span class="config-value">${config.positionRecreation.dynamicProfitRecreation?.positionThreshold || 70}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">├─ 第一档边界:</span>
                    <span class="config-value">0% - ${config.positionRecreation.dynamicProfitRecreation?.benchmarkTier1Max || 0.5}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">├─ 第二档边界:</span>
                    <span class="config-value">${config.positionRecreation.dynamicProfitRecreation?.benchmarkTier1Max || 0.5}% - ${config.positionRecreation.dynamicProfitRecreation?.benchmarkTier2Max || 1.5}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">├─ 第三档边界:</span>
                    <span class="config-value">${config.positionRecreation.dynamicProfitRecreation?.benchmarkTier2Max || 1.5}% - ${config.positionRecreation.dynamicProfitRecreation?.benchmarkTier3Max || 3.0}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">├─ 第四档边界:</span>
                    <span class="config-value">${config.positionRecreation.dynamicProfitRecreation?.benchmarkTier3Max || 3.0}%以上</span>
                </div>
                <div class="config-item">
                    <span class="config-label">├─ 第一档盈利阈值:</span>
                    <span class="config-value">${config.positionRecreation.dynamicProfitRecreation?.profitThresholdTier1 || 0.5}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">├─ 第二档盈利阈值:</span>
                    <span class="config-value">${config.positionRecreation.dynamicProfitRecreation?.profitThresholdTier2 || 1.5}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">├─ 第三档盈利阈值:</span>
                    <span class="config-value">${config.positionRecreation.dynamicProfitRecreation?.profitThresholdTier3 || 3.0}%</span>
                </div>
                <div class="config-item">
                    <span class="config-label">└─ 第四档盈利阈值:</span>
                    <span class="config-value">${config.positionRecreation.dynamicProfitRecreation?.profitThresholdTier4 || 5.0}%</span>
                </div>
            ` : ''}
            
            <div class="config-item">
                <span class="config-label">策略ID:</span>
                <span class="config-value">${strategy.instanceId}</span>
            </div>
            <div class="config-item">
                <span class="config-label">创建时间:</span>
                <span class="config-value">${strategy.createdAt ? new Date(strategy.createdAt).toLocaleString() : '--'}</span>
            </div>
        `;
    }

    /**
     * 显示编辑配置弹窗
     */
    showEditConfigModal(strategy) {
        const config = strategy.config || {};

        // 创建弹窗
        const modal = document.createElement('div');
        modal.className = 'edit-config-modal-overlay';
        modal.innerHTML = `
            <div class="edit-config-modal">
                <div class="edit-config-modal-header">
                    <h3>编辑策略配置</h3>
                    <button class="edit-config-modal-close">&times;</button>
                </div>
                <div class="edit-config-modal-content">
                    <form id="edit-config-form">
                        ${this.renderEditConfigForm(config)}
                    </form>
                </div>
            </div>
        `;

        // 设置事件处理
        this.setupEditConfigEvents(modal, strategy);

        document.body.appendChild(modal);
    }

    /**
     * 渲染编辑配置表单
     */
    renderEditConfigForm(config) {
        return `
            <div class="form-group">
                <label>池地址:</label>
                <input type="text" name="poolAddress" value="${config.poolAddress || ''}" required>
            </div>
            <div class="form-group">
                <label>投入金额:</label>
                <input type="number" name="positionAmount" value="${config.positionAmount || ''}" min="0.1" step="0.1" required>
            </div>
            <div class="form-group">
                <label>监控间隔 (秒):</label>
                <input type="number" name="monitoringInterval" value="${config.monitoringInterval || 30}" min="10" max="300" required>
            </div>
            <div class="form-group">
                <label>超时阈值 (秒):</label>
                <input type="number" name="outOfRangeTimeout" value="${config.outOfRangeTimeout || 600}" min="60" max="3600" required>
            </div>
            <div class="form-group">
                <label>收益提取阈值:</label>
                <input type="number" name="yieldExtractionThreshold" value="${config.yieldExtractionThreshold || 0.1}" min="0.01" step="0.01">
            </div>
            <div class="form-group">
                <label>收益提取时间锁 (分钟):</label>
                <input type="number" name="yieldExtractionTimeLock" value="${config.yieldExtractionTimeLock || 1}" min="1" max="120" step="1">
            </div>
            <div class="form-group">
                <label>X代币交换滑点 (基点):</label>
                <input type="number" name="slippageBps" value="${config.slippageBps || 1000}" min="100" max="3000" step="50">
                <small class="form-help">代币交换滑点设置（基点，1000=10%）</small>
            </div>
            <div class="form-group">
                <label>重新创建价格上限:</label>
                <input type="number" name="maxPriceForRecreation" value="${config.maxPriceForRecreation || ''}" step="any" placeholder="输入价格上限 (设置为0表示无限制)">
            </div>
            <div class="form-group">
                <label>重新创建价格下限:</label>
                <input type="number" name="minPriceForRecreation" value="${config.minPriceForRecreation || ''}" step="any" placeholder="输入价格下限 (设置为0表示无限制)">
            </div>
            <div class="form-group">
                <label>15分钟平均基准收益率阈值 (%):</label>
                <input type="number" name="benchmarkYieldThreshold5Min" value="${config.benchmarkYieldThreshold5Min || ''}" min="0" max="10" step="0.1" placeholder="输入阈值 (设置为0表示禁用)">
                <small class="form-help">当15分钟平均基准收益率低于此阈值时，关闭头寸但不重建（等同止损）</small>
            </div>
            <div class="form-group">
                <label>最低活跃bin位置阈值 (%):</label>
                <input type="number" name="minActiveBinPositionThreshold" value="${config.minActiveBinPositionThreshold || ''}" min="0" max="100" step="1" placeholder="输入最低位置阈值 (设置为0表示无限制)">
                <small class="form-help">当活跃bin位置低于此阈值时，禁止所有头寸重建方法</small>
            </div>
            <div class="form-group checkbox-group">
                <label>
                    <input type="checkbox" name="enableSmartStopLoss" ${config.enableSmartStopLoss ? 'checked' : ''}>
                    启用智能止损
                </label>
            </div>
            <div class="smart-stop-loss-config" style="display: ${config.enableSmartStopLoss ? 'block' : 'none'}">
                <div class="form-group">
                    <label>活跃Bin位置安全阈值 (%):</label>
                    <input type="number" name="activeBinSafetyThreshold" value="${config.stopLoss?.activeBinSafetyThreshold || 50}" min="-100" max="100">
                </div>
                <div class="form-group">
                    <label>观察期时长 (分钟):</label>
                    <input type="number" name="observationPeriodMinutes" value="${config.stopLoss?.observationPeriodMinutes || 15}" min="5" max="180">
                </div>
                <div class="form-group">
                    <label>亏损止损阈值 (%):</label>
                    <input type="number" name="lossThresholdPercentage" value="${config.stopLoss?.lossThresholdPercentage || 5}" min="1" step="0.1">
                </div>
            </div>
            
            <!-- 头寸重建配置 -->
            <div class="form-section-title">🏗️ 头寸重建配置</div>
            
            <!-- 方法2: 智能头寸重建 -->
            <div class="form-group checkbox-group">
                <label>
                    <input type="checkbox" name="enableMarketOpportunityRecreation" 
                           ${config.positionRecreation?.enableMarketOpportunityRecreation ? 'checked' : ''}>
                    启用智能头寸重建（方法2）
                </label>
            </div>
            <div class="market-opportunity-config" style="display: ${config.positionRecreation?.enableMarketOpportunityRecreation ? 'block' : 'none'}">
                <div class="form-group">
                    <label>活跃bin位置阈值 (%):</label>
                    <input type="number" name="marketOpportunityPositionThreshold" 
                           value="${config.positionRecreation?.marketOpportunity?.positionThreshold || 70}" 
                           min="1" max="99" step="1">
                    <small class="form-help">当活跃bin位置低于此阈值时考虑重建</small>
                </div>
                <div class="form-group">
                    <label>盈利阈值 (%):</label>
                    <input type="number" name="marketOpportunityProfitThreshold" 
                           value="${config.positionRecreation?.marketOpportunity?.profitThreshold || 1}" 
                           min="0.1" max="10" step="0.1">
                    <small class="form-help">当盈利超过此阈值时触发重建</small>
                </div>
            </div>
            
            <!-- 方法3: 止损后反弹重建 -->
            <div class="form-group checkbox-group">
                <label>
                    <input type="checkbox" name="enableLossRecoveryRecreation" 
                           ${config.positionRecreation?.enableLossRecoveryRecreation ? 'checked' : ''}>
                    启用止损后反弹重建（方法3）
                </label>
            </div>
            <div class="loss-recovery-config" style="display: ${config.positionRecreation?.enableLossRecoveryRecreation ? 'block' : 'none'}">
                <div class="form-group">
                    <label>标记时位置阈值 (%):</label>
                    <input type="number" name="lossRecoveryMarkPositionThreshold" 
                           value="${config.positionRecreation?.lossRecovery?.markPositionThreshold || 65}" 
                           min="1" max="99" step="1">
                    <small class="form-help">标记亏损状态时的位置阈值</small>
                </div>
                <div class="form-group">
                    <label>标记时亏损阈值 (%):</label>
                    <input type="number" name="lossRecoveryMarkLossThreshold" 
                           value="${config.positionRecreation?.lossRecovery?.markLossThreshold || 0.5}" 
                           min="0.1" max="5" step="0.1">
                    <small class="form-help">标记亏损状态时的亏损阈值</small>
                </div>
                <div class="form-group">
                    <label>触发时位置阈值 (%):</label>
                    <input type="number" name="lossRecoveryTriggerPositionThreshold" 
                           value="${config.positionRecreation?.lossRecovery?.triggerPositionThreshold || 70}" 
                           min="1" max="99" step="1">
                    <small class="form-help">触发重建时的位置阈值</small>
                </div>
                <div class="form-group">
                    <label>触发时盈利阈值 (%):</label>
                    <input type="number" name="lossRecoveryTriggerProfitThreshold" 
                           value="${config.positionRecreation?.lossRecovery?.triggerProfitThreshold || 0.5}" 
                           min="0.1" max="5" step="0.1">
                    <small class="form-help">触发重建时的盈利阈值</small>
                </div>
            </div>
            
            <!-- 方法4: 动态盈利阈值重建 -->
            <div class="form-group checkbox-group">
                <label>
                    <input type="checkbox" name="enableDynamicProfitRecreation" 
                           ${config.positionRecreation?.enableDynamicProfitRecreation ? 'checked' : ''}>
                    启用动态盈利阈值重建（方法4）
                </label>
            </div>
            <div class="dynamic-profit-config" style="display: ${config.positionRecreation?.enableDynamicProfitRecreation ? 'block' : 'none'}">
                <div class="form-group">
                    <label>活跃bin位置阈值 (%):</label>
                    <input type="number" name="dynamicProfitPositionThreshold" 
                           value="${config.positionRecreation?.dynamicProfitRecreation?.positionThreshold || 70}"
                           min="1" max="99" step="1">
                    <small class="form-help">当活跃bin位置高于此阈值时考虑重建</small>
                </div>
                <div class="form-group">
                    <label>第一档边界 (%):</label>
                    <input type="number" name="dynamicProfitBenchmarkTier1Max" 
                           value="${config.positionRecreation?.dynamicProfitRecreation?.benchmarkTier1Max || 0.5}" 
                           min="0.1" max="5" step="0.1">
                    <small class="form-help">第一档：0% - 此值(%)，对应最低盈利阈值</small>
                </div>
                <div class="form-group">
                    <label>第二档边界 (%):</label>
                    <input type="number" name="dynamicProfitBenchmarkTier2Max" 
                           value="${config.positionRecreation?.dynamicProfitRecreation?.benchmarkTier2Max || 1.5}" 
                           min="0.5" max="10" step="0.1">
                    <small class="form-help">第二档：第一档 - 此值(%)，对应中等盈利阈值</small>
                </div>
                <div class="form-group">
                    <label>第三档边界 (%):</label>
                    <input type="number" name="dynamicProfitBenchmarkTier3Max" 
                           value="${config.positionRecreation?.dynamicProfitRecreation?.benchmarkTier3Max || 3.0}" 
                           min="1" max="20" step="0.1">
                    <small class="form-help">第三档：第二档 - 此值(%)，对应较高盈利阈值</small>
                </div>
                <div class="form-group">
                    <label>第四档边界 (%):</label>
                    <input type="number" name="dynamicProfitBenchmarkTier4Max" 
                           value="${config.positionRecreation?.dynamicProfitRecreation?.benchmarkTier4Max || 999}" 
                           min="2" max="50" step="0.1">
                    <small class="form-help">第四档：第三档 - 此值(%)，超过此值使用最高盈利阈值（通常设置为999表示无上限）</small>
                </div>
                <div class="form-group">
                    <label>第一档盈利阈值 (%):</label>
                    <input type="number" name="dynamicProfitThresholdTier1" 
                           value="${config.positionRecreation?.dynamicProfitRecreation?.profitThresholdTier1 || 0.5}" 
                           min="0.1" max="5" step="0.1">
                    <small class="form-help">当基准收益率在第一档时使用的盈利阈值</small>
                </div>
                <div class="form-group">
                    <label>第二档盈利阈值 (%):</label>
                    <input type="number" name="dynamicProfitThresholdTier2" 
                           value="${config.positionRecreation?.dynamicProfitRecreation?.profitThresholdTier2 || 1.5}" 
                           min="0.5" max="10" step="0.1">
                    <small class="form-help">当基准收益率在第二档时使用的盈利阈值</small>
                </div>
                <div class="form-group">
                    <label>第三档盈利阈值 (%):</label>
                    <input type="number" name="dynamicProfitThresholdTier3" 
                           value="${config.positionRecreation?.dynamicProfitRecreation?.profitThresholdTier3 || 3.0}" 
                           min="1" max="10" step="0.1">
                    <small class="form-help">当基准收益率在第三档时使用的盈利阈值</small>
                </div>
                <div class="form-group">
                    <label>第四档盈利阈值 (%):</label>
                    <input type="number" name="dynamicProfitThresholdTier4" 
                           value="${config.positionRecreation?.dynamicProfitRecreation?.profitThresholdTier4 || 5.0}" 
                           min="2" max="15" step="0.1">
                    <small class="form-help">当基准收益率在第四档时使用的盈利阈值</small>
                </div>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn-cancel">取消</button>
                <button type="submit" class="btn-save">保存配置</button>
            </div>
        `;
    }

    /**
     * 设置编辑配置事件
     */
    setupEditConfigEvents(modal, strategy) {
        const form = modal.querySelector('#edit-config-form');
        const smartStopLossCheckbox = modal.querySelector('input[name="enableSmartStopLoss"]');
        const smartStopLossConfig = modal.querySelector('.smart-stop-loss-config');
        const marketOpportunityCheckbox = modal.querySelector('input[name="enableMarketOpportunityRecreation"]');
        const marketOpportunityConfig = modal.querySelector('.market-opportunity-config');
        const lossRecoveryCheckbox = modal.querySelector('input[name="enableLossRecoveryRecreation"]');
        const lossRecoveryConfig = modal.querySelector('.loss-recovery-config');
        const dynamicProfitCheckbox = modal.querySelector('input[name="enableDynamicProfitRecreation"]');
        const dynamicProfitConfig = modal.querySelector('.dynamic-profit-config');
        const cancelBtn = modal.querySelector('.btn-cancel');
        const closeBtn = modal.querySelector('.edit-config-modal-close');

        // 智能止损开关切换
        if (smartStopLossCheckbox && smartStopLossConfig) {
            smartStopLossCheckbox.addEventListener('change', () => {
                smartStopLossConfig.style.display = smartStopLossCheckbox.checked ? 'block' : 'none';
            });
        }

        // 智能头寸重建开关切换
        if (marketOpportunityCheckbox && marketOpportunityConfig) {
            marketOpportunityCheckbox.addEventListener('change', () => {
                marketOpportunityConfig.style.display = marketOpportunityCheckbox.checked ? 'block' : 'none';
            });
        }

        // 止损后反弹重建开关切换
        if (lossRecoveryCheckbox && lossRecoveryConfig) {
            lossRecoveryCheckbox.addEventListener('change', () => {
                lossRecoveryConfig.style.display = lossRecoveryCheckbox.checked ? 'block' : 'none';
            });
        }

        // 动态盈利阈值重建开关切换
        if (dynamicProfitCheckbox && dynamicProfitConfig) {
            dynamicProfitCheckbox.addEventListener('change', () => {
                dynamicProfitConfig.style.display = dynamicProfitCheckbox.checked ? 'block' : 'none';
            });
        }

        // 关闭弹窗
        const closeModal = () => {
            if (modal.parentElement) {
                document.body.removeChild(modal);
            }
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        // 表单提交
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleConfigSave(strategy.instanceId, form, modal);
        });
    }

    /**
     * 处理配置保存
     */
    async handleConfigSave(strategyId, form, modal) {
        const submitBtn = form.querySelector('.btn-save');
        const originalText = submitBtn.textContent;

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = '保存中...';

            const formData = new FormData(form);
            const config = this.buildConfigFromForm(formData);

            console.log('📝 保存策略配置:', config);

            const result = await this.dataService.saveStrategyConfig(strategyId, config);

            if (result.success) {
                this.uiManager.showNotification('配置保存成功', 'success');
                document.body.removeChild(modal);

                // 触发策略列表刷新
                setTimeout(() => {
                    if (this.onConfigSaved) {
                        this.onConfigSaved(strategyId);
                    }
                }, 1000);
            } else {
                throw new Error(result.error || '保存失败');
            }
        } catch (error) {
            console.error('❌ 保存配置失败:', error);
            this.uiManager.showNotification(`保存失败: ${error.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    /**
     * 从表单构建配置对象
     */
    buildConfigFromForm(formData) {
        const config = {
            poolAddress: formData.get('poolAddress'),
            positionAmount: parseFloat(formData.get('positionAmount')),
            monitoringInterval: parseInt(formData.get('monitoringInterval')),
            outOfRangeTimeout: parseInt(formData.get('outOfRangeTimeout')),
            yieldExtractionThreshold: parseFloat(formData.get('yieldExtractionThreshold')) || 0.1,
            yieldExtractionTimeLock: formData.get('yieldExtractionTimeLock') !== null && formData.get('yieldExtractionTimeLock') !== '' ? parseInt(formData.get('yieldExtractionTimeLock')) : 1,
            slippageBps: parseInt(formData.get('slippageBps')) || 1000,
            maxPriceForRecreation: formData.get('maxPriceForRecreation') ? parseFloat(formData.get('maxPriceForRecreation')) : 0,
            minPriceForRecreation: formData.get('minPriceForRecreation') ? parseFloat(formData.get('minPriceForRecreation')) : 0,
            benchmarkYieldThreshold5Min: formData.get('benchmarkYieldThreshold5Min') ? parseFloat(formData.get('benchmarkYieldThreshold5Min')) : 0,
            minActiveBinPositionThreshold: formData.get('minActiveBinPositionThreshold') ? parseFloat(formData.get('minActiveBinPositionThreshold')) : 0,
            enableSmartStopLoss: formData.get('enableSmartStopLoss') === 'on'
        };

        // 添加智能止损配置
        if (config.enableSmartStopLoss) {
            config.stopLoss = {
                activeBinSafetyThreshold: parseInt(formData.get('activeBinSafetyThreshold')) || 50,
                observationPeriodMinutes: parseInt(formData.get('observationPeriodMinutes')) || 15,
                lossThresholdPercentage: parseFloat(formData.get('lossThresholdPercentage')) || 5
            };
        }

        // 添加头寸重建配置
        const enableMarketOpportunity = formData.get('enableMarketOpportunityRecreation') === 'on';
        const enableLossRecovery = formData.get('enableLossRecoveryRecreation') === 'on';
        const enableDynamicProfit = formData.get('enableDynamicProfitRecreation') === 'on';

        if (enableMarketOpportunity || enableLossRecovery || enableDynamicProfit) {
            config.positionRecreation = {};

            if (enableMarketOpportunity) {
                config.positionRecreation.enableMarketOpportunityRecreation = enableMarketOpportunity;
                if (enableMarketOpportunity) {
                    config.positionRecreation.marketOpportunity = {
                        positionThreshold: parseInt(formData.get('marketOpportunityPositionThreshold')) || 70,
                        profitThreshold: parseFloat(formData.get('marketOpportunityProfitThreshold')) || 1
                    };
                }
            }

            if (enableLossRecovery) {
                config.positionRecreation.enableLossRecoveryRecreation = enableLossRecovery;
                if (enableLossRecovery) {
                    config.positionRecreation.lossRecovery = {
                        markPositionThreshold: parseInt(formData.get('lossRecoveryMarkPositionThreshold')) || 65,
                        markLossThreshold: parseFloat(formData.get('lossRecoveryMarkLossThreshold')) || 0.5,
                        triggerPositionThreshold: parseInt(formData.get('lossRecoveryTriggerPositionThreshold')) || 70,
                        triggerProfitThreshold: parseFloat(formData.get('lossRecoveryTriggerProfitThreshold')) || 0.5
                    };
                }
            }

            if (enableDynamicProfit) {
                config.positionRecreation.enableDynamicProfitRecreation = enableDynamicProfit;
                if (enableDynamicProfit) {
                    config.positionRecreation.dynamicProfitRecreation = {
                        positionThreshold: parseInt(formData.get('dynamicProfitPositionThreshold')) || 70,
                        benchmarkTier1Max: parseFloat(formData.get('dynamicProfitBenchmarkTier1Max')) || 0.5,
                        benchmarkTier2Max: parseFloat(formData.get('dynamicProfitBenchmarkTier2Max')) || 1.5,
                        benchmarkTier3Max: parseFloat(formData.get('dynamicProfitBenchmarkTier3Max')) || 3.0,
                        benchmarkTier4Max: parseFloat(formData.get('dynamicProfitBenchmarkTier4Max')) || 999,
                        profitThresholdTier1: parseFloat(formData.get('dynamicProfitThresholdTier1')) || 0.5,
                        profitThresholdTier2: parseFloat(formData.get('dynamicProfitThresholdTier2')) || 1.5,
                        profitThresholdTier3: parseFloat(formData.get('dynamicProfitThresholdTier3')) || 3.0,
                        profitThresholdTier4: parseFloat(formData.get('dynamicProfitThresholdTier4')) || 5.0
                    };
                }
            }
        }

        return config;
    }

    /**
     * 设置配置保存回调
     */
    setOnConfigSaved(callback) {
        this.onConfigSaved = callback;
    }

    /**
     * 获取调试信息
     */
    getDebugInfo() {
        return {
            initialized: true,
            stylesAdded: !!document.getElementById('config-modal-styles')
        };
    }

    /**
     * 销毁配置管理器
     */
    destroy() {
        console.log('🧹 销毁配置管理器');

        // 移除样式
        const styles = document.getElementById('config-modal-styles');
        if (styles) {
            styles.remove();
        }

        // 移除打开的弹窗
        const modals = document.querySelectorAll('.config-modal-overlay, .edit-config-modal-overlay');
        modals.forEach(modal => {
            if (modal.parentElement) {
                modal.parentElement.removeChild(modal);
            }
        });
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConfigManager;
} else if (typeof window !== 'undefined') {
    window.ConfigManager = ConfigManager;
} 