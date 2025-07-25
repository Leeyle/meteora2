/**
 * 简单Y策略UI管理器
 * 负责所有UI渲染、事件处理和用户交互功能
 */
class SimpleYUIManager {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        this.options = {
            showNotifications: true,
            autoRefreshInterval: 30000,
            ...options
        };

        // UI状态
        this.isRendered = false;
        this.timeUpdateInterval = null;
        this.lastUpdateTime = null;

        // 事件监听器
        this.eventListeners = new Map();

        // 策略数据引用
        this.strategies = new Map();

        // 初始化
        this.init();
    }

    /**
     * 初始化UI管理器
     */
    init() {
        try {
            console.log('🎨 初始化UI管理器');

            if (!this.container) {
                throw new Error('UI容器不存在');
            }

            // 渲染主UI
            this.render();

            // 启动时间更新定时器
            this.startTimeUpdateTimer();

            console.log('✅ UI管理器初始化完成');
        } catch (error) {
            console.error('❌ UI管理器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 渲染主UI
     */
    render() {
        if (!this.container) {
            console.error('❌ UI容器不存在');
            return;
        }

        this.container.innerHTML = `
            <div class="strategy-monitor">
                <!-- 监控头部 -->
                <div class="monitor-header">
                    <div class="header-left">
                        <h3>
                            <span class="icon">📊</span>
                            简单Y策略监控
                        </h3>
                        <div class="connection-status" id="connectionStatus">
                            <span class="status-dot"></span>
                            <span class="status-text">未连接</span>
                        </div>
                    </div>
                    <div class="header-right">
                        <div class="monitor-stats">
                            <div class="stat-item">
                                <span class="stat-value" id="activeCount">0</span>
                                <span class="stat-label">活跃策略</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value" id="lastUpdate">--</span>
                                <span class="stat-label">最后更新</span>
                            </div>
                        </div>
                        <div class="monitor-actions">
                            <button class="btn btn-sm btn-secondary" id="refreshBtn">
                                <span class="icon">🔄</span>
                                刷新
                            </button>
                            <button class="btn btn-sm btn-primary" id="reconnectBtn">
                                <span class="icon">🔌</span>
                                重连
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 策略列表 -->
                <div class="strategies-container">
                    <div class="strategies-grid" id="strategiesGrid">
                        <div class="empty-state" id="emptyState">
                            <div class="empty-icon">📊</div>
                            <h4>暂无运行中的策略</h4>
                            <p>创建策略后将在此显示实时监控数据</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 绑定事件
        this.bindEvents();
        this.isRendered = true;

        console.log('✅ 主UI渲染完成');
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 刷新按钮
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                console.log('🔄 刷新按钮被点击');
                e.preventDefault();
                this.handleRefreshClick(refreshBtn);
            });
        }

        // 重连按钮
        const reconnectBtn = document.getElementById('reconnectBtn');
        if (reconnectBtn) {
            reconnectBtn.addEventListener('click', (e) => {
                console.log('🔌 重连按钮被点击');
                e.preventDefault();
                this.handleReconnectClick();
            });
        }

        // 策略操作按钮事件委托
        this.container.addEventListener('click', (e) => {
            // 策略操作按钮
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                e.preventDefault();
                e.stopPropagation();
                this.handleStrategyActionClick(actionBtn);
                return;
            }

            // 池地址复制事件
            const poolAddressElement = e.target.closest('.pool-address-copy');
            if (poolAddressElement) {
                this.copyPoolAddress(e);
                return;
            }
        });

        console.log('✅ 事件绑定完成');
    }

    /**
     * 处理刷新按钮点击
     */
    handleRefreshClick(button) {
        // 添加视觉反馈
        button.disabled = true;
        const originalText = button.innerHTML;
        button.innerHTML = '<span class="icon">⏳</span>刷新中...';

        // 触发刷新事件
        this.emit('ui:refresh-requested', {
            timestamp: Date.now()
        });

        // 恢复按钮状态
        setTimeout(() => {
            button.disabled = false;
            button.innerHTML = originalText;
        }, 2000);
    }

    /**
     * 处理重连按钮点击
     */
    handleReconnectClick() {
        this.emit('ui:reconnect-requested', {
            timestamp: Date.now()
        });
    }

    /**
     * 处理策略操作按钮点击
     */
    handleStrategyActionClick(button) {
        const action = button.dataset.action;
        const strategyId = button.dataset.strategyId;

        console.log(`🔍 策略操作按钮点击:`, {
            action,
            strategyId,
            buttonElement: button
        });

        if (action && strategyId) {
            // 防止重复点击
            if (button.disabled) return;

            // 触发策略操作事件
            this.emit('ui:strategy-action', {
                action,
                strategyId,
                button,
                timestamp: Date.now()
            });
        } else {
            console.error('❌ 缺少必要的按钮参数:', { action, strategyId });
            this.showNotification('操作失败: 缺少策略ID或操作类型', 'error');
        }
    }

    /**
     * 更新策略数据
     */
    updateStrategies(strategies) {
        this.strategies.clear();
        strategies.forEach(strategy => {
            this.strategies.set(strategy.instanceId, strategy);
        });

        this.renderStrategies();
        this.updateActiveCount();
    }

    /**
     * 更新单个策略
     */
    updateStrategy(strategyId, updates) {
        const strategy = this.strategies.get(strategyId);
        if (strategy) {
            const oldStatus = strategy.status;
            Object.assign(strategy, updates);
            this.strategies.set(strategyId, strategy);

            // 如果状态在运行/停止之间切换，重新排序整个列表
            const newStatus = updates.status;
            const isStatusChangeSignificant = newStatus && (
                (oldStatus === 'running' && newStatus !== 'running') ||
                (oldStatus !== 'running' && newStatus === 'running')
            );

            if (isStatusChangeSignificant) {
                console.log(`🔄 状态变化需要重新排序: ${oldStatus} → ${newStatus}`);
                this.renderStrategies();
            } else {
                this.renderSingleStrategyCard(strategyId);
            }
        }
    }

    /**
     * 移除策略
     */
    removeStrategy(strategyId) {
        this.strategies.delete(strategyId);

        // 移除对应的DOM元素
        const card = document.querySelector(`[data-strategy-id="${strategyId}"]`);
        if (card) {
            card.remove();
        }

        this.updateActiveCount();

        // 如果没有策略了，显示空状态
        if (this.strategies.size === 0) {
            const emptyState = document.getElementById('emptyState');
            if (emptyState) emptyState.style.display = 'block';
        }
    }

    /**
     * 渲染策略列表
     */
    renderStrategies() {
        const grid = document.getElementById('strategiesGrid');
        const emptyState = document.getElementById('emptyState');

        if (!grid) return;

        const strategies = Array.from(this.strategies.values());

        if (strategies.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        // 智能排序：运行中的策略优先，然后按创建时间排序
        const sortedStrategies = this.sortStrategiesWithRunningPriority(strategies);

        grid.innerHTML = sortedStrategies.map(strategy => this.renderStrategyCard(strategy)).join('');
        this.updateActiveCount();

        console.log(`✅ 策略列表渲染完成，共 ${sortedStrategies.length} 个策略`);
    }

    /**
     * 策略智能排序：运行中的策略优先，然后按创建时间排序
     */
    sortStrategiesWithRunningPriority(strategies) {
        return strategies.sort((a, b) => {
            // 获取策略状态
            const aIsRunning = a.status === 'running';
            const bIsRunning = b.status === 'running';

            // 如果运行状态不同，运行中的排在前面
            if (aIsRunning !== bIsRunning) {
                return bIsRunning ? 1 : -1;
            }

            // 如果运行状态相同，按创建时间排序（新的在前）
            const aCreatedAt = new Date(a.createdAt || 0).getTime();
            const bCreatedAt = new Date(b.createdAt || 0).getTime();

            return bCreatedAt - aCreatedAt;
        });
    }

    /**
     * 渲染策略卡片
     */
    renderStrategyCard(strategy) {
        const marketData = strategy.marketData || {};
        const stopLossDecision = strategy.stopLossDecision || {};

        const totalValue = marketData.positionValue || 0;
        const pnl = marketData.netPnL || 0;
        const pnlPercentage = marketData.netPnLPercentage || 0;
        const currentPrice = marketData.currentPrice || 0;
        const activeBin = marketData.activeBin || '--';

        // 计算活跃BIN百分比
        let activeBinPercentage = '--';
        if (marketData.activeBin !== undefined &&
            marketData.positionLowerBin !== undefined &&
            marketData.positionUpperBin !== undefined) {
            activeBinPercentage = this.calculateActiveBinPercentage(
                marketData.activeBin,
                marketData.positionLowerBin,
                marketData.positionUpperBin,
                strategy.instanceId
            );
        }

        const pnlClass = pnl >= 0 ? 'positive' : 'negative';
        const statusClass = this.getStatusClass(strategy.status);

        // 根据策略状态决定操作按钮显示
        const isRunning = strategy.status === 'running';
        const isPaused = strategy.status === 'paused';
        const isStopped = strategy.status === 'stopped';

        return `
            <div class="strategy-card monitor-card" data-strategy-id="${strategy.instanceId}">
                <div class="card-header">
                    <div class="card-title">
                        <h4>${strategy.name || '未命名策略'}</h4>
                        <div class="status-badge ${statusClass}">
                            ${this.getStatusText(strategy.status)}
                        </div>
                    </div>
                    <div class="card-actions">
                        <div class="action-buttons">
                            ${isRunning ? `
                                <button class="btn-action pause" data-action="pause" data-strategy-id="${strategy.instanceId}" title="暂停策略">
                                    <span class="icon">⏸️</span>
                                </button>
                            ` : ''}
                            ${isPaused || isStopped ? `
                                <button class="btn-action start" data-action="start" data-strategy-id="${strategy.instanceId}" title="启动策略">
                                    <span class="icon">▶️</span>
                                </button>
                            ` : ''}
                            ${isRunning ? `
                                <button class="btn-action manual-stop-loss" data-action="manual-stop-loss" data-strategy-id="${strategy.instanceId}" title="手动止损">
                                    <span class="icon">🛑</span>
                                </button>
                            ` : ''}
                            <button class="btn-action stop" data-action="stop" data-strategy-id="${strategy.instanceId}" title="停止策略">
                                <span class="icon">⏹️</span>
                            </button>
                            <button class="btn-action view-config" data-action="view-config" data-strategy-id="${strategy.instanceId}" title="查看配置">
                                <span class="icon">👁️</span>
                            </button>
                            ${isStopped ? `
                                <button class="btn-action edit-config" data-action="edit-config" data-strategy-id="${strategy.instanceId}" title="编辑配置">
                                    <span class="icon">⚙️</span>
                                </button>
                            ` : ''}
                            <button class="btn-action delete" data-action="delete" data-strategy-id="${strategy.instanceId}" title="删除策略">
                                <span class="icon">🗑️</span>
                            </button>
                        </div>
                        <div class="last-update-time" data-timestamp="${strategy.lastUpdate || Date.now()}">
                            ${this.formatTime(strategy.lastUpdate || Date.now())}
                        </div>
                    </div>
                </div>

                <div class="card-content">
                    <div class="metrics-grid">
                        <div class="metric-item primary">
                            <span class="label">总价值</span>
                            <span class="value" data-field="positionValue">
                                ${this.formatCurrency(totalValue)}
                            </span>
                        </div>
                        <div class="metric-item primary">
                            <span class="label">盈亏</span>
                            <span class="value ${pnlClass}" data-field="netPnL">
                                ${pnl >= 0 ? '+' : ''}${this.formatCurrency(pnl)}
                            </span>
                            <span class="percentage ${pnlClass}">
                                (${pnlPercentage >= 0 ? '+' : ''}${this.formatPercent(pnlPercentage)})
                            </span>
                        </div>
                        <div class="metric-item">
                            <span class="label">当前价格</span>
                            <span class="value" data-field="currentPrice">
                                ${currentPrice ? '$' + currentPrice.toFixed(8) : '--'}
                            </span>
                        </div>
                        <div class="metric-item">
                            <span class="label">活跃Bin <span class="bin-percentage" data-field="activeBinPercentage">${activeBinPercentage}</span></span>
                            <span class="value" data-field="activeBin">${activeBin}</span>
                        </div>
                    </div>

                    <div class="stop-loss-info">
                        <div class="stop-loss-status">
                            <span class="label">智能止损:</span>
                            <span class="action ${(stopLossDecision.action || 'HOLD').toLowerCase()}" data-field="stopLossAction">
                                ${stopLossDecision.actionLabel || stopLossDecision.action || 'HOLD'}
                            </span>
                        </div>
                        ${stopLossDecision.confidence ? `
                            <div class="confidence-info">
                                <span class="label">置信度:</span>
                                <span class="value" data-field="confidence">
                                    ${(stopLossDecision.confidence * 100).toFixed(1)}%
                                </span>
                            </div>
                        ` : ''}
                        
                        <!-- 手续费信息 -->
                        <div class="fee-info-vertical">
                            <div class="fee-row">
                                <span class="fee-label">未提取:</span>
                                <span class="fee-value" data-field="currentPendingYield">--</span>
                            </div>
                            <div class="fee-row">
                                <span class="fee-label">已提取:</span>
                                <span class="fee-value" data-field="totalExtractedYield">--</span>
                            </div>
                        </div>
                    </div>

                    <!-- 历史价格变化数据 -->
                    <div class="historical-data-section">
                        <div class="historical-price-changes">
                            <div class="section-title small-title">📈 历史价格变化</div>
                            <div class="price-changes-grid">
                                <div class="price-change-item">
                                    <span class="timeframe">5分钟</span>
                                    <span class="change-value">--</span>
                                </div>
                                <div class="price-change-item">
                                    <span class="timeframe">15分钟</span>
                                    <span class="change-value">--</span>
                                </div>
                                <div class="price-change-item">
                                    <span class="timeframe">1小时</span>
                                    <span class="change-value">--</span>
                                </div>
                            </div>
                        </div>

                        <!-- 基准收益率数据 -->
                        <div class="benchmark-yield-rates">
                            <div class="section-title small-title">
                                📊 基准收益率 
                                <span class="dynamic-switch-status" data-field="dynamicRecreationSwitchEnabled">
                                    <span class="switch-label">动态重建:</span>
                                    <span class="switch-value">--</span>
                                </span>
                            </div>
                            <div class="benchmark-grid">
                                <div class="benchmark-item">
                                    <span class="label">当前5分钟</span>
                                    <span class="value" data-field="current5MinuteBenchmark">--</span>
                                </div>
                                <div class="benchmark-item">
                                    <span class="label">5分钟平均</span>
                                    <span class="value" data-field="average5MinuteBenchmark">--</span>
                                </div>
                                <div class="benchmark-item">
                                    <span class="label">15分钟平均</span>
                                    <span class="value" data-field="average15MinuteBenchmark">--</span>
                                </div>
                                <div class="benchmark-item">
                                    <span class="label">30分钟平均</span>
                                    <span class="value" data-field="average30MinuteBenchmark">--</span>
                                </div>
                            </div>
                        </div>

                        <div class="historical-yield-rates">
                            <div class="section-title small-title">💰 历史收益率</div>
                            <div class="fee-yield-efficiency">
                                <div class="efficiency-title">手续费收益效率（日化）</div>
                                <div class="efficiency-grid">
                                    <div class="efficiency-item">
                                        <span class="timeframe">5分钟</span>
                                        <span class="rate">--</span>
                                    </div>
                                    <div class="efficiency-item">
                                        <span class="timeframe">15分钟</span>
                                        <span class="rate">--</span>
                                    </div>
                                    <div class="efficiency-item">
                                        <span class="timeframe">1小时</span>
                                        <span class="rate">--</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 策略详细信息 -->
                    <div class="strategy-details">
                        <div class="detail-item">
                            <span class="label">池地址:</span>
                            <span class="value mono pool-address-copy" 
                                  title="点击复制完整地址: ${strategy.config?.poolAddress || ''}"
                                  data-full-address="${strategy.config?.poolAddress || ''}"
                                  style="cursor: pointer;">
                                ${strategy.config?.poolAddress ? this.formatAddress(strategy.config.poolAddress) : '--'}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="label">投入金额:</span>
                            <span class="value">${strategy.config?.positionAmount || '--'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">监控间隔:</span>
                            <span class="value">${strategy.config?.monitoringInterval || '--'}秒</span>
                        </div>
                        <div class="detail-item strategy-id-item">
                            <span class="label">策略ID:</span>
                            <span class="value mono strategy-id-value" title="${strategy.instanceId}">
                                ${this.formatStrategyId(strategy.instanceId)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 重新渲染单个策略卡片
     */
    renderSingleStrategyCard(strategyId) {
        const strategy = this.strategies.get(strategyId);
        if (!strategy) return;

        const card = document.querySelector(`[data-strategy-id="${strategyId}"]`);
        if (card) {
            card.outerHTML = this.renderStrategyCard(strategy);
        }
    }

    /**
     * 更新策略卡片数据
     */
    updateStrategyCard(instanceId, data) {
        const card = document.querySelector(`[data-strategy-id="${instanceId}"]`);
        if (!card) {
            console.warn(`⚠️ 未找到策略卡片: ${instanceId}`);
            return;
        }

        const { marketData, stopLossDecision } = data;

        // 更新数值字段
        this.updateCardField(card, 'positionValue', marketData.positionValue, this.formatCurrency);
        this.updateCardField(card, 'currentPrice', marketData.currentPrice, (p) => '$' + p.toFixed(8));
        this.updateCardField(card, 'activeBin', marketData.activeBin);
        this.updateCardField(card, 'stopLossAction', stopLossDecision.actionLabel || stopLossDecision.action);

        // 计算并更新活跃BIN百分比
        if (marketData.activeBin !== undefined &&
            marketData.positionLowerBin !== undefined &&
            marketData.positionUpperBin !== undefined) {
            const percentage = this.calculateActiveBinPercentage(
                marketData.activeBin,
                marketData.positionLowerBin,
                marketData.positionUpperBin,
                instanceId
            );
            this.updateCardField(card, 'activeBinPercentage', percentage);
        }

        if (stopLossDecision.confidence) {
            this.updateCardField(card, 'confidence', stopLossDecision.confidence, (c) => (c * 100).toFixed(1) + '%');
        }

        // 更新盈亏（需要特殊处理样式）
        const pnlElement = card.querySelector('[data-field="netPnL"]');
        if (pnlElement && marketData.netPnL !== undefined) {
            const pnl = marketData.netPnL;
            pnlElement.textContent = `${pnl >= 0 ? '+' : ''}${this.formatCurrency(pnl)}`;
            pnlElement.className = `value ${pnl >= 0 ? 'positive' : 'negative'}`;

            // 更新百分比
            const percentageElement = pnlElement.nextElementSibling;
            if (percentageElement && marketData.netPnLPercentage !== undefined) {
                const pnlPercent = marketData.netPnLPercentage;
                percentageElement.textContent = `(${pnlPercent >= 0 ? '+' : ''}${this.formatPercent(pnlPercent)})`;
                percentageElement.className = `percentage ${pnlPercent >= 0 ? 'positive' : 'negative'}`;
            }
        }

        // 更新历史价格变化数据
        if (marketData.historicalPriceChanges) {
            this.updateHistoricalPriceChanges(card, marketData.historicalPriceChanges);
        }

        // 更新历史收益率数据
        if (marketData.historicalYieldRates) {
            this.updateHistoricalYieldRates(card, marketData.historicalYieldRates);
        }

        // 更新基准收益率数据
        if (marketData.benchmarkYieldRates) {
            this.updateBenchmarkYieldRates(card, marketData.benchmarkYieldRates);
        }

        // 🔥 新增：更新动态重建开关状态
        if (marketData.dynamicRecreationSwitchEnabled !== undefined) {
            this.updateDynamicRecreationSwitchStatus(card, marketData.dynamicRecreationSwitchEnabled);
        }

        // 更新手续费数据
        if (marketData.currentPendingYield !== undefined) {
            this.updateCardField(card, 'currentPendingYield', parseFloat(marketData.currentPendingYield), this.formatCurrency);
        }
        if (marketData.totalExtractedYield !== undefined) {
            this.updateCardField(card, 'totalExtractedYield', parseFloat(marketData.totalExtractedYield), this.formatCurrency);
        }

        // 闪烁效果表示数据更新
        card.classList.add('data-updated');
        setTimeout(() => {
            card.classList.remove('data-updated');
        }, 1000);

        console.log(`✅ 策略卡片 ${instanceId} 更新完成`);
    }

    /**
     * 更新卡片字段
     */
    updateCardField(card, fieldName, value, formatter = null) {
        const element = card.querySelector(`[data-field="${fieldName}"]`);
        if (element && value !== undefined) {
            const newValue = formatter ? formatter(value) : value;
            element.textContent = newValue;
        }
    }

    /**
     * 计算活跃BIN在头寸范围内的百分比位置
     */
    calculateActiveBinPercentage(activeBin, positionLowerBin, positionUpperBin, instanceId) {
        try {
            const strategy = this.strategies.get(instanceId);
            if (!strategy) {
                console.warn(`⚠️ 未找到策略实例: ${instanceId}`);
                return '--';
            }

            // 根据策略类型确定总BIN数量
            let totalBins;
            if (strategy.type === 'chain_position') {
                totalBins = 138; // 连锁头寸：138个BIN
            } else if (strategy.type === 'simple_y' || strategy.type === 'simple-y' || strategy.type === 'simple-y-v2') {
                totalBins = 69;  // 单个Y头寸：69个BIN
            } else {
                console.warn(`⚠️ 未知策略类型: ${strategy.type}`);
                return '--';
            }

            // 计算实际头寸范围
            const actualRange = positionUpperBin - positionLowerBin + 1;

            // 如果活跃BIN在头寸范围内
            if (activeBin >= positionLowerBin && activeBin <= positionUpperBin) {
                // 计算活跃BIN在头寸范围内的位置（从下边界开始）
                const binPositionInRange = activeBin - positionLowerBin;
                // 将头寸范围映射到100%
                const percentage = (binPositionInRange / (actualRange - 1)) * 100;
                return `(${percentage.toFixed(1)}%)`;
            } else {
                // 活跃BIN在头寸范围外
                if (activeBin < positionLowerBin) {
                    const distance = positionLowerBin - activeBin;
                    return `(下方 ${distance} bins)`;
                } else {
                    const distance = activeBin - positionUpperBin;
                    return `(上方 ${distance} bins)`;
                }
            }
        } catch (error) {
            console.error('计算活跃BIN百分比失败:', error);
            return '--';
        }
    }

    /**
     * 更新历史价格变化显示
     */
    updateHistoricalPriceChanges(card, priceChanges) {
        const priceChangeItems = card.querySelectorAll('.price-change-item');

        if (priceChangeItems.length >= 3) {
            // 更新5分钟数据
            const change5m = priceChangeItems[0].querySelector('.change-value');
            if (change5m) {
                const value = priceChanges.last5Minutes;
                change5m.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                change5m.className = `change-value ${value >= 0 ? 'positive' : 'negative'}`;
            }

            // 更新15分钟数据
            const change15m = priceChangeItems[1].querySelector('.change-value');
            if (change15m) {
                const value = priceChanges.last15Minutes;
                change15m.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                change15m.className = `change-value ${value >= 0 ? 'positive' : 'negative'}`;
            }

            // 更新1小时数据
            const change1h = priceChangeItems[2].querySelector('.change-value');
            if (change1h) {
                const value = priceChanges.lastHour;
                change1h.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                change1h.className = `change-value ${value >= 0 ? 'positive' : 'negative'}`;
            }
        }
    }

    /**
     * 更新历史收益率显示
     */
    updateHistoricalYieldRates(card, yieldRates) {
        // 更新手续费收益效率
        const efficiencyItems = card.querySelectorAll('.efficiency-item');
        if (efficiencyItems.length >= 3) {
            // 更新5分钟日化收益率
            const rate5m = efficiencyItems[0].querySelector('.rate');
            if (rate5m) {
                rate5m.textContent = `${yieldRates.feeYieldEfficiency.last5Minutes.toFixed(4)}%`;
            }

            // 更新15分钟日化收益率
            const rate15m = efficiencyItems[1].querySelector('.rate');
            if (rate15m) {
                rate15m.textContent = `${yieldRates.feeYieldEfficiency.last15Minutes.toFixed(4)}%`;
            }

            // 更新1小时日化收益率
            const rate1h = efficiencyItems[2].querySelector('.rate');
            if (rate1h) {
                rate1h.textContent = `${yieldRates.feeYieldEfficiency.lastHour.toFixed(4)}%`;
            }
        }
    }

    /**
     * 更新基准收益率显示
     */
    updateBenchmarkYieldRates(card, benchmarkRates) {
        // 更新当前5分钟基准收益率
        this.updateCardField(card, 'current5MinuteBenchmark', benchmarkRates.current5MinuteBenchmark,
            (value) => value === null ? '--' : `${(value * 100).toFixed(4)}%`);

        // 更新5分钟平均基准收益率
        this.updateCardField(card, 'average5MinuteBenchmark', benchmarkRates.average5MinuteBenchmark,
            (value) => value === null || value === 0 ? '--' : `${(value * 100).toFixed(4)}%`);

        // 更新15分钟平均基准收益率
        this.updateCardField(card, 'average15MinuteBenchmark', benchmarkRates.average15MinuteBenchmark,
            (value) => value === null || value === 0 ? '--' : `${(value * 100).toFixed(4)}%`);

        // 更新30分钟平均基准收益率
        this.updateCardField(card, 'average30MinuteBenchmark', benchmarkRates.average30MinuteBenchmark,
            (value) => value === null || value === 0 ? '--' : `${(value * 100).toFixed(4)}%`);
    }

    /**
     * 🔥 新增：更新动态重建开关状态显示
     */
    updateDynamicRecreationSwitchStatus(card, switchEnabled) {
        const switchStatusElement = card.querySelector('.dynamic-switch-status .switch-value');
        if (switchStatusElement) {
            const statusText = switchEnabled ? '开启' : '关闭';
            const statusClass = switchEnabled ? 'switch-enabled' : 'switch-disabled';
            
            switchStatusElement.textContent = statusText;
            switchStatusElement.className = `switch-value ${statusClass}`;
        }
    }

    /**
     * 更新连接状态
     */
    updateConnectionStatus(status, text) {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;

        const dot = statusElement.querySelector('.status-dot');
        const textElement = statusElement.querySelector('.status-text');

        if (dot) {
            dot.className = `status-dot ${status}`;
        }
        if (textElement) {
            textElement.textContent = text;
        }
    }

    /**
     * 更新活跃策略数量
     */
    updateActiveCount() {
        const countElement = document.getElementById('activeCount');
        if (countElement) {
            const activeCount = Array.from(this.strategies.values())
                .filter(s => s.status === 'running').length;
            countElement.textContent = activeCount;
        }
    }

    /**
     * 更新最后更新时间
     */
    updateLastUpdateTime() {
        const updateElement = document.getElementById('lastUpdate');
        if (updateElement && this.lastUpdateTime) {
            updateElement.textContent = this.formatTime(this.lastUpdateTime);
        }
    }

    /**
     * 设置最后更新时间
     */
    setLastUpdateTime(timestamp) {
        this.lastUpdateTime = timestamp;
        this.updateLastUpdateTime();
    }

    /**
     * 启动时间更新定时器
     */
    startTimeUpdateTimer() {
        // 每秒更新一次时间显示
        this.timeUpdateInterval = setInterval(() => {
            this.updateAllTimeDisplays();
        }, 1000);
    }

    /**
     * 更新所有时间显示
     */
    updateAllTimeDisplays() {
        // 更新最后更新时间
        this.updateLastUpdateTime();

        // 更新策略卡片中的时间显示
        const strategyCards = document.querySelectorAll('.strategy-card');
        strategyCards.forEach(card => {
            const timeElement = card.querySelector('.last-update-time');
            if (timeElement) {
                const timestamp = timeElement.getAttribute('data-timestamp');
                if (timestamp) {
                    timeElement.textContent = this.formatTime(parseInt(timestamp));
                }
            }
        });
    }

    /**
     * 复制池地址到剪贴板
     */
    copyPoolAddress(event) {
        event.preventDefault();
        event.stopPropagation();

        const element = event.target;
        const fullAddress = element.getAttribute('data-full-address');

        if (!fullAddress || fullAddress === '') {
            this.showTemporaryNotification('没有可复制的池地址', 'warning');
            return;
        }

        // 使用现代剪贴板API
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(fullAddress).then(() => {
                this.showTemporaryNotification(`池地址已复制: ${this.formatAddress(fullAddress)}`, 'success');
                this.showFullAddressTemporarily(element, fullAddress);
            }).catch(err => {
                console.error('复制失败:', err);
                this.fallbackCopyToClipboard(fullAddress, element);
            });
        } else {
            // 降级方案
            this.fallbackCopyToClipboard(fullAddress, element);
        }
    }

    /**
     * 降级复制方案
     */
    fallbackCopyToClipboard(text, element) {
        try {
            // 创建临时文本区域
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);

            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (successful) {
                this.showTemporaryNotification(`池地址已复制: ${this.formatAddress(text)}`, 'success');
                this.showFullAddressTemporarily(element, text);
            } else {
                throw new Error('execCommand copy failed');
            }
        } catch (err) {
            console.error('降级复制失败:', err);
            this.showTemporaryNotification('复制失败，请手动复制', 'error');
            this.showFullAddressForManualCopy(element, text);
        }
    }

    /**
     * 临时显示完整地址
     */
    showFullAddressTemporarily(element, fullAddress) {
        const originalText = element.textContent;
        element.textContent = fullAddress;
        element.style.fontSize = '10px';

        setTimeout(() => {
            element.textContent = originalText;
            element.style.fontSize = '';
        }, 2000);
    }

    /**
     * 显示完整地址供手动复制
     */
    showFullAddressForManualCopy(element, fullAddress) {
        const originalText = element.textContent;
        element.textContent = fullAddress;
        element.style.fontSize = '10px';
        element.style.userSelect = 'all';

        setTimeout(() => {
            element.textContent = originalText;
            element.style.fontSize = '';
            element.style.userSelect = '';
        }, 5000);
    }

    /**
     * 显示通知消息
     */
    showNotification(message, type = 'info') {
        // 优先使用全局通知系统
        if (window.dlmmApp && window.dlmmApp.notification) {
            const notificationMethods = {
                'success': 'showSuccess',
                'error': 'showError',
                'warning': 'showWarning',
                'info': 'showInfo'
            };

            const method = notificationMethods[type] || 'showInfo';
            window.dlmmApp.notification[method]('策略监控', message);
        } else {
            // 备用通知机制
            this.showTemporaryNotification(message, type);
        }

        // 同时在控制台记录
        const logMethod = type === 'error' ? 'error' : 'log';
        console[logMethod](`[策略监控] ${message}`);
    }

    /**
     * 显示临时通知（备用机制）
     */
    showTemporaryNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${this.getNotificationIcon(type)}</span>
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        // 添加样式
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            min-width: 300px;
            padding: 16px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            background: ${this.getNotificationColor(type)};
        `;

        // 添加到页面
        document.body.appendChild(notification);

        // 显示动画
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // 自动移除
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 300);
        }, type === 'error' ? 5000 : 3000);
    }

    /**
     * 获取通知图标
     */
    getNotificationIcon(type) {
        const icons = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': 'ℹ️'
        };
        return icons[type] || 'ℹ️';
    }

    /**
     * 获取通知颜色
     */
    getNotificationColor(type) {
        const colors = {
            'success': '#28a745',
            'error': '#dc3545',
            'warning': '#ffc107',
            'info': '#17a2b8'
        };
        return colors[type] || '#17a2b8';
    }

    /**
     * 格式化货币
     */
    formatCurrency(amount) {
        if (typeof amount !== 'number') return '$0.00000000';
        return '$' + amount.toFixed(8);
    }

    /**
     * 格式化百分比
     */
    formatPercent(value) {
        if (typeof value !== 'number') return '0.00%';
        return value.toFixed(2) + '%';
    }

    /**
     * 格式化时间
     */
    formatTime(timestamp) {
        if (!timestamp) return '--';

        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * 格式化地址显示
     */
    formatAddress(address) {
        if (!address || address.length < 8) return address;
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }

    /**
     * 格式化策略实例ID为简短形式
     */
    formatStrategyId(instanceId) {
        if (!instanceId) return '--';

        // 如果是类似 chain_position_1750597447747_mifo4u 的格式
        if (instanceId.includes('_')) {
            const parts = instanceId.split('_');
            if (parts.length >= 4) {
                // 取最后两部分：时间戳的后6位 + 随机字符串
                const timestamp = parts[2];
                const randomPart = parts[3];
                return `${timestamp.slice(-6)}_${randomPart}`;
            }
        }

        // 如果是其他格式，取前4位和后4位
        if (instanceId.length > 12) {
            return `${instanceId.slice(0, 6)}...${instanceId.slice(-6)}`;
        }

        return instanceId;
    }

    /**
     * 获取状态样式类
     */
    getStatusClass(status) {
        switch (status) {
            case 'running': return 'success';
            case 'paused': return 'warning';
            case 'stopped': return 'danger';
            case 'error': return 'error';
            default: return 'secondary';
        }
    }

    /**
     * 获取状态文本
     */
    getStatusText(status) {
        switch (status) {
            case 'running': return '运行中';
            case 'paused': return '已暂停';
            case 'stopped': return '已停止';
            case 'error': return '错误';
            default: return '未知';
        }
    }

    /**
     * 注册事件监听器
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * 移除事件监听器
     */
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * 触发事件
     */
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`❌ UI事件处理器执行失败 (${event}):`, error);
                }
            });
        }
    }

    /**
     * 获取调试信息
     */
    getDebugInfo() {
        return {
            isRendered: this.isRendered,
            strategiesCount: this.strategies.size,
            lastUpdateTime: this.lastUpdateTime,
            options: this.options,
            eventListeners: Array.from(this.eventListeners.keys())
        };
    }

    /**
     * 销毁UI管理器
     */
    destroy() {
        console.log('🧹 销毁UI管理器');

        // 清理时间更新定时器
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }

        // 清理事件监听器
        this.eventListeners.clear();

        // 清理容器
        if (this.container) {
            this.container.innerHTML = '';
        }

        // 重置状态
        this.isRendered = false;
        this.strategies.clear();
        this.lastUpdateTime = null;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleYUIManager;
} else if (typeof window !== 'undefined') {
    window.SimpleYUIManager = SimpleYUIManager;
} 