/**
 * 📊 简化数据分析模块
 * 
 * 核心功能：
 * 1. 从IndexedDB读取策略数据
 * 2. 渲染分时图表
 * 3. 支持多策略对比
 * 4. 支持1小时、4小时、24小时切换
 * 5. 自适应布局，每个策略一行显示
 */
class SimpleAnalytics {
    constructor(container) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        this.dataStorage = null;
        this.charts = new Map(); // 策略ID -> Chart实例
        this.currentTimeRange = '1h'; // 默认1小时
        this.refreshInterval = 30000; // 30秒刷新
        this.refreshTimer = null;

        // 调试模式开关（可通过window.debugMode控制）
        this.debugMode = false;

        // 策略信息缓存
        this.strategyInfoCache = new Map();

        // 支持的数据类型（全部为百分比）
        this.dataTypes = {
            activeBinPercentage: { label: '活跃Bin百分比', color: '#10b981', suffix: '%', amplify: 1 },
            yieldRate5m: { label: '收益率(5分钟)', color: '#3b82f6', suffix: '%', amplify: 1 },
            yieldRate15m: { label: '收益率(15分钟)', color: '#6366f1', suffix: '%', amplify: 1 },
            yieldRate1h: { label: '收益率(1小时)', color: '#8b5cf6', suffix: '%', amplify: 1 },
            priceChange5m: { label: '价格变化(5分钟)', color: '#f59e0b', suffix: '%', amplify: 1 },
            priceChange15m: { label: '价格变化(15分钟)', color: '#f97316', suffix: '%', amplify: 1 },
            priceChange1h: { label: '价格变化(1小时)', color: '#ea580c', suffix: '%', amplify: 1 },
            pnlPercentage: { label: '盈亏百分比', color: '#ef4444', suffix: '%', amplify: 20 },
            combinedBin5m: { label: '活跃Bin+5分钟收益率', color: '#06b6d4', suffix: '%', amplify: 1, baseline: 100 },
            combinedBin15m: { label: '活跃Bin+15分钟收益率', color: '#ec4899', suffix: '%', amplify: 1, baseline: 100 },
            // 🆕 基准收益率数据类型
            benchmarkYieldRate5m: { label: '当前5分钟基准收益率', color: '#ff6b6b', suffix: '%', amplify: 10 },
            benchmarkYieldRate5mAvg: { label: '5分钟平均基准收益率', color: '#4ecdc4', suffix: '%', amplify: 1 },
            benchmarkYieldRate15mAvg: { label: '15分钟平均基准收益率', color: '#45b7d1', suffix: '%', amplify: 1 },
            benchmarkYieldRate30mAvg: { label: '30分钟平均基准收益率', color: '#96ceb4', suffix: '%', amplify: 1 }
        };

        // 放大小波动功能开关
        this.amplifySmallChanges = true;

        this.init();
    }

    /**
     * 调试日志（只在调试模式下输出）
     */
    debugLog(...args) {
        // 总是显示排序调试信息，其他信息只在调试模式下显示
        const message = args[0];
        const isImportantInfo = message && (
            message.includes('策略排序调试信息') ||
            message.includes('排序前:') ||
            message.includes('排序后:')
        );

        if (this.debugMode || (typeof window !== 'undefined' && window.debugMode) || isImportantInfo) {
            console.log('[SimpleAnalytics]', ...args);
        }
    }

    /**
     * 初始化
     */
    async init() {
        try {
            // 初始化数据存储服务
            if (window.StrategyDataStorage) {
                this.dataStorage = new window.StrategyDataStorage();
            } else {
                throw new Error('数据存储服务不可用');
            }

            // 等待数据库初始化
            await this.waitForDatabase();

            // 加载保存的时间范围
            this.loadSavedTimeRange();

            // 加载保存的放大开关状态
            this.loadSavedAmplifyState();

            // 渲染界面
            this.render();

            // 加载保存的数据类型选择
            this.loadSavedDataTypes();

            // 同步放大开关状态到UI
            this.syncAmplifyToggleUI();

            // 绑定事件
            this.bindEvents();

            // 首次加载数据
            await this.loadAndRenderCharts();

            // 启动自动刷新
            this.startAutoRefresh();

            // 暴露到window对象供tooltip使用
            window.simpleAnalytics = this;

        } catch (error) {
            console.error('❌ 简化数据分析模块初始化失败:', error);
            this.renderError(error.message);
        }
    }

    /**
     * 等待数据库初始化完成
     */
    async waitForDatabase() {
        let attempts = 0;
        const maxAttempts = 50; // 最多等待5秒

        while (attempts < maxAttempts) {
            if (this.dataStorage && this.dataStorage.db) {
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        throw new Error('数据库初始化超时');
    }

    /**
     * 渲染界面
     */
    render() {
        this.container.innerHTML = `
            <div class="analytics-container">
                <!-- 标题栏 -->
                <div class="analytics-header">
                    <h3>📊 实时数据分析</h3>
                    <div class="analytics-controls">
                        <div class="time-range-selector">
                            <button class="btn-time-range ${this.currentTimeRange === '1h' ? 'active' : ''}" 
                                    data-range="1h">1小时</button>
                            <button class="btn-time-range ${this.currentTimeRange === '4h' ? 'active' : ''}" 
                                    data-range="4h">4小时</button>
                            <button class="btn-time-range ${this.currentTimeRange === '24h' ? 'active' : ''}" 
                                    data-range="24h">24小时</button>
                        </div>
                        <div class="analytics-actions">
                            <button class="btn-refresh" title="刷新数据">🔄 刷新</button>
                        </div>
                    </div>
                </div>

                <!-- 数据类型选择器 -->
                <div class="data-type-selector">
                    <div class="data-type-label">选择数据类型:</div>
                    <div class="data-type-options">
                        ${Object.entries(this.dataTypes).map(([key, config]) => `
                            <div class="data-type-option">
                                <input type="checkbox" id="datatype-${key}" value="${key}">
                                <label for="datatype-${key}">${config.label}${config.amplify > 1 ? ` (${config.amplify}x)` : ''}</label>
                            </div>
                        `).join('')}
                    </div>
                    <div class="amplify-option" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #374151;">
                        <input type="checkbox" id="amplify-toggle" ${this.amplifySmallChanges ? 'checked' : ''} style="margin-right: 8px;">
                        <label for="amplify-toggle" style="color: #10b981; font-weight: 500;">🔍 放大小波动数据</label>
                    </div>
                </div>

                <!-- 图表区域 -->
                <div class="charts-container">
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <p>正在加载数据...</p>
                    </div>
                </div>

                <!-- 状态信息 -->
                <div class="analytics-status">
                    <div class="status-item">
                        <span class="status-label">数据更新:</span>
                        <span class="status-value" id="last-update">--</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">策略数量:</span>
                        <span class="status-value" id="strategy-count">--</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">数据点数:</span>
                        <span class="status-value" id="data-points">--</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 时间范围切换
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-time-range')) {
                const range = e.target.dataset.range;
                this.switchTimeRange(range);
            }
        });

        // 刷新按钮
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-refresh')) {
                this.loadAndRenderCharts();
            }
        });

        // 数据类型选择
        this.container.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                // 处理放大开关
                if (e.target.id === 'amplify-toggle') {
                    this.amplifySmallChanges = e.target.checked;
                    localStorage.setItem('analytics-amplify-changes', this.amplifySmallChanges);
                }
                this.loadAndRenderCharts();
            }
        });
    }

    /**
     * 切换时间范围
     */
    async switchTimeRange(range) {
        this.currentTimeRange = range;

        // 保存时间范围到localStorage
        localStorage.setItem('analytics-time-range', range);

        // 更新按钮状态
        const buttons = this.container.querySelectorAll('.btn-time-range');
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.range === range);
        });

        // 重新加载数据
        await this.loadAndRenderCharts();
    }

    /**
     * 加载保存的时间范围
     */
    loadSavedTimeRange() {
        try {
            const saved = localStorage.getItem('analytics-time-range');
            if (saved && ['1h', '4h', '24h'].includes(saved)) {
                this.currentTimeRange = saved;

            }
        } catch (error) {
            this.debugLog('⚠️ 加载保存的时间范围失败:', error);
        }
    }

    /**
     * 加载保存的放大开关状态
     */
    loadSavedAmplifyState() {
        try {
            const saved = localStorage.getItem('analytics-amplify-changes');
            if (saved !== null) {
                this.amplifySmallChanges = saved === 'true';

            }
        } catch (error) {
            this.debugLog('⚠️ 加载保存的放大开关状态失败:', error);
        }
    }

    /**
     * 同步放大开关状态到UI
     */
    syncAmplifyToggleUI() {
        const toggle = this.container.querySelector('#amplify-toggle');
        if (toggle) {
            toggle.checked = this.amplifySmallChanges;
        }
    }

    /**
     * 获取选中的数据类型
     */
    getSelectedDataTypes() {
        const checkboxes = this.container.querySelectorAll('.data-type-option input[type="checkbox"]:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);

        // 保存到localStorage
        localStorage.setItem('analytics-selected-types', JSON.stringify(selected));

        return selected;
    }

    /**
     * 加载保存的数据类型选择
     */
    loadSavedDataTypes() {
        try {
            const saved = localStorage.getItem('analytics-selected-types');
            if (saved) {
                const selectedTypes = JSON.parse(saved);
                selectedTypes.forEach(type => {
                    const checkbox = this.container.querySelector(`input[value="${type}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                });

            } else {
                // 如果没有保存的选择，默认选择活跃Bin百分比、盈亏百分比和新的组合数据
                const defaultTypes = ['activeBinPercentage', 'pnlPercentage', 'combinedBin5m', 'combinedBin15m'];
                defaultTypes.forEach(type => {
                    const checkbox = this.container.querySelector(`input[value="${type}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                });
            }
        } catch (error) {
            this.debugLog('⚠️ 加载保存的数据类型失败:', error);
        }
    }

    /**
     * 获取时间范围
     */
    getTimeRange() {
        const now = Date.now();
        const ranges = {
            '1h': 60 * 60 * 1000,        // 1小时
            '4h': 4 * 60 * 60 * 1000,    // 4小时
            '24h': 24 * 60 * 60 * 1000   // 24小时
        };

        const duration = ranges[this.currentTimeRange] || ranges['1h'];
        const startTime = now - duration;

        return {
            start: startTime,
            end: now
        };
    }

    /**
     * 加载并渲染图表
     */
    async loadAndRenderCharts() {
        try {
            // 显示加载状态
            this.showLoading();

            // 获取有数据的策略列表
            const strategies = await this.dataStorage.getAvailableStrategies();

            if (strategies.length === 0) {
                this.showEmptyState();
                return;
            }

            // 批量获取策略信息
            await this.loadStrategiesInfo(strategies);

            // 🔄 对策略列表进行排序：最新的策略排在最前面
            const sortedStrategies = this.sortStrategiesByCreationTime(strategies);

            // 调试信息：显示排序前后的策略顺序
            this.debugLog('📋 策略排序调试信息:');
            this.debugLog('  排序前:', strategies.map(id => {
                const info = this.strategyInfoCache.get(id);
                const status = info?.status || 'unknown';
                const isRunning = this.isStrategyRunning(status);
                return `${info?.name || id} (${status}${isRunning ? ' 🟢' : ' ⚪'}, ${info?.createdAt || '无时间'})`;
            }));
            this.debugLog('  排序后:', sortedStrategies.map(id => {
                const info = this.strategyInfoCache.get(id);
                const status = info?.status || 'unknown';
                const isRunning = this.isStrategyRunning(status);
                return `${info?.name || id} (${status}${isRunning ? ' 🟢' : ' ⚪'}, ${info?.createdAt || '无时间'})`;
            }));

            // 获取时间范围
            const timeRange = this.getTimeRange();
            const selectedDataTypes = this.getSelectedDataTypes();

            // 创建图表容器（使用排序后的策略列表）
            this.createChartsContainer(sortedStrategies);

            // 为每个策略加载数据并创建图表
            for (const strategyId of sortedStrategies) {
                await this.loadStrategyChart(strategyId, timeRange, selectedDataTypes);
            }

            // 更新状态信息
            await this.updateStatusInfo();

        } catch (error) {
            console.error('❌ 加载图表数据失败:', error);
            this.showError('加载数据失败: ' + error.message);
        }
    }

    /**
     * 批量获取策略信息
     */
    async loadStrategiesInfo(strategyIds) {
        try {
            // 使用APIService获取策略列表
            if (window.apiService) {
                // 添加5秒超时保护
                const timeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('API请求超时')), 5000)
                );

                const response = await Promise.race([
                    window.apiService.getStrategies(),
                    timeout
                ]);

                // 处理不同的API响应格式
                let strategies = [];
                if (Array.isArray(response)) {
                    strategies = response;
                } else if (response && response.data && Array.isArray(response.data)) {
                    strategies = response.data;
                } else if (response && response.success && Array.isArray(response.data)) {
                    strategies = response.data;
                } else {
                    this.debugLog('⚠️ 策略API返回格式异常:', response);
                    strategies = [];
                }

                // 更新策略信息缓存（保存完整信息用于排序）
                if (strategies.length > 0) {
                    strategies.forEach(strategy => {
                        if (strategy && strategy.id) {
                            this.strategyInfoCache.set(strategy.id, {
                                name: strategy.name || '未命名策略',
                                type: strategy.type || 'unknown',
                                status: strategy.status || 'unknown',
                                createdAt: strategy.createdAt || null,
                                instanceId: strategy.instanceId || strategy.id
                            });
                        }
                    });

                    this.debugLog(`✅ 成功加载 ${strategies.length} 个策略信息`);
                } else {
                    this.debugLog('⚠️ API返回的策略列表为空');
                }
            }
        } catch (error) {
            this.debugLog('⚠️ 获取策略信息失败:', error.message);
        }

        // 确保所有策略ID都有基本信息（后备方案）
        strategyIds.forEach(id => {
            if (!this.strategyInfoCache.has(id)) {
                this.strategyInfoCache.set(id, {
                    name: '未命名策略',
                    type: 'unknown',
                    status: 'unknown',
                    createdAt: null,
                    instanceId: id
                });
            }
        });
    }

    /**
     * 🔄 按运行状态和创建时间对策略列表排序（运行中的在前，最新的排在最前面）
     */
    sortStrategiesByCreationTime(strategyIds) {
        return strategyIds.sort((a, b) => {
            const strategyA = this.strategyInfoCache.get(a);
            const strategyB = this.strategyInfoCache.get(b);

            // 🔥 第一优先级：按运行状态排序（运行中的在前）
            const statusA = strategyA?.status || 'unknown';
            const statusB = strategyB?.status || 'unknown';

            const isRunningA = this.isStrategyRunning(statusA);
            const isRunningB = this.isStrategyRunning(statusB);

            // 运行中的策略优先显示
            if (isRunningA && !isRunningB) return -1;
            if (!isRunningA && isRunningB) return 1;

            // 🕐 第二优先级：在相同状态内按创建时间排序（新的在前）
            // 获取创建时间
            const timeA = strategyA?.createdAt ? new Date(strategyA.createdAt).getTime() : 0;
            const timeB = strategyB?.createdAt ? new Date(strategyB.createdAt).getTime() : 0;

            // 如果都有创建时间，按时间排序（新的在前）
            if (timeA && timeB) {
                return timeB - timeA;
            }

            // 如果只有一个有创建时间，有时间的在前
            if (timeA && !timeB) return -1;
            if (!timeA && timeB) return 1;

            // 如果都没有创建时间，尝试从策略ID中提取时间戳
            const timestampA = this.extractTimestampFromId(a);
            const timestampB = this.extractTimestampFromId(b);

            if (timestampA && timestampB) {
                return timestampB - timestampA; // 新的在前
            }

            // 最后按字符串排序（保证排序稳定）
            return b.localeCompare(a);
        });
    }

    /**
     * 判断策略是否正在运行
     */
    isStrategyRunning(status) {
        if (!status || typeof status !== 'string') return false;

        // 定义运行中的状态
        const runningStatuses = [
            'running',
            'active',
            'executing',
            'monitoring',
            'operational'
        ];

        return runningStatuses.includes(status.toLowerCase());
    }

    /**
     * 从策略ID中提取时间戳
     * 支持格式：chain_position_1750597447747_mifo4u
     */
    extractTimestampFromId(strategyId) {
        if (!strategyId || typeof strategyId !== 'string') return null;

        // 匹配时间戳模式
        const timestampMatch = strategyId.match(/(\d{13})/); // 13位时间戳
        if (timestampMatch) {
            const timestamp = parseInt(timestampMatch[1]);
            // 验证时间戳是否合理（2020年后的时间）
            if (timestamp > 1577836800000) { // 2020-01-01
                return timestamp;
            }
        }

        return null;
    }

    /**
     * 创建图表容器
     */
    createChartsContainer(strategies) {
        const chartsContainer = this.container.querySelector('.charts-container');
        chartsContainer.innerHTML = '';

        strategies.forEach(strategyId => {
            const strategyInfo = this.strategyInfoCache.get(strategyId) || { name: '未命名策略' };
            const displayName = strategyInfo.name.length > 30 ?
                strategyInfo.name.substring(0, 30) + '...' :
                strategyInfo.name;

            const chartRow = document.createElement('div');
            chartRow.className = 'chart-row';
            chartRow.innerHTML = `
                <div class="chart-header">
                    <h4 class="strategy-title">${displayName}</h4>
                    <div class="strategy-id">ID: ${this.formatStrategyId(strategyId)}</div>
                    <div class="chart-legend" id="legend-${strategyId}"></div>
                </div>
                <div class="chart-wrapper">
                    <canvas id="chart-${strategyId}" class="strategy-chart"></canvas>
                </div>
            `;
            chartsContainer.appendChild(chartRow);
        });
    }

    /**
     * 加载单个策略的图表
     */
    async loadStrategyChart(strategyId, timeRange, selectedDataTypes) {
        try {
            // 获取数据
            const data = await this.dataStorage.getDataRange(
                strategyId,
                timeRange.start,
                timeRange.end
            );



            if (data.length === 0) {
                this.debugLog(`⚠️ 策略 ${strategyId} 在时间范围 ${this.currentTimeRange} 内暂无数据`);
                this.showChartEmpty(strategyId);
                return;
            }

            // 按时间排序
            data.sort((a, b) => a.timestamp - b.timestamp);

            // 创建图表
            this.createChart(strategyId, data, selectedDataTypes);

        } catch (error) {
            console.error(`❌ 加载策略 ${strategyId} 图表失败:`, error);
            this.showChartError(strategyId, error.message);
        }
    }

    /**
     * 创建Chart.js图表
     */
    createChart(strategyId, data, selectedDataTypes) {
        const canvas = document.getElementById(`chart-${strategyId}`);
        if (!canvas) return;

        // 销毁旧图表
        if (this.charts.has(strategyId)) {
            this.charts.get(strategyId).destroy();
        }

        // 使用新的基准点对比方案处理数据
        const processedData = this.calculateBaselineComparison(data, selectedDataTypes);

        // 准备数据集
        const datasets = selectedDataTypes.map(dataType => {
            const config = this.dataTypes[dataType];
            return {
                label: config.label,
                dataType: dataType, // 保存数据类型用于tooltip
                data: processedData.map(point => ({
                    x: point.timestamp,
                    y: point.adjustedValues[dataType] || 0,
                    originalData: point.originalData // 保存原始数据用于tooltip
                })),
                borderColor: config.color,
                backgroundColor: config.color + '20',
                fill: false,
                tension: 0.1,
                pointRadius: 2,
                pointHoverRadius: 4
            };
        });

        // 添加基准线（0%线，代表起点基准）
        if (processedData.length > 0) {
            const baselineData = [
                { x: processedData[0].timestamp, y: 0 },
                { x: processedData[processedData.length - 1].timestamp, y: 0 }
            ];

            datasets.push({
                label: '基准线 (起点)',
                data: baselineData,
                borderColor: 'rgba(128, 128, 128, 0.3)', // 淡灰色
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderDash: [5, 5], // 虚线样式
                fill: false,
                tension: 0,
                pointRadius: 0,
                pointHoverRadius: 0,
                order: 999, // 确保基准线在最底层
                dataType: 'baseline' // 标记为基准线
            });
        }

        // 创建图表
        const chart = new Chart(canvas, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: '时间'
                        },
                        ticks: {
                            callback: function (value) {
                                return new Date(value).toLocaleTimeString('zh-CN', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '变化百分比 (%)'
                        },
                        ticks: {
                            callback: function (value) {
                                const prefix = value > 0 ? '+' : '';
                                return prefix + value.toFixed(1) + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false // 使用自定义图例
                    },
                    tooltip: {
                        callbacks: {
                            title: function (context) {
                                return new Date(context[0].parsed.x).toLocaleString('zh-CN');
                            },
                            label: function (context) {
                                const dataType = context.dataset.dataType;

                                // 基准线不显示tooltip
                                if (dataType === 'baseline') {
                                    return null;
                                }

                                const displayValue = context.parsed.y;
                                const prefix = displayValue >= 0 ? '+' : '';

                                // 获取原始数据
                                const originalData = context.raw.originalData;
                                const config = window.simpleAnalytics?.dataTypes[dataType];

                                if (originalData && config && window.simpleAnalytics?.amplifySmallChanges && config.amplify > 1) {
                                    // 计算原始值（相对基准点的变化）
                                    const currentValue = window.simpleAnalytics.extractDataValue(originalData, dataType);
                                    const baseline = dataType === 'activeBinPercentage' ? 100 : 0;
                                    const originalChange = currentValue - baseline;
                                    const originalPrefix = originalChange >= 0 ? '+' : '';

                                    return `${context.dataset.label}: ${originalPrefix}${originalChange.toFixed(2)}% (显示:${prefix}${displayValue.toFixed(2)}%)`;
                                } else {
                                    return `${context.dataset.label}: ${prefix}${displayValue.toFixed(2)}%`;
                                }
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        this.charts.set(strategyId, chart);

        // 更新图例
        this.updateChartLegend(strategyId, datasets);
    }



    /**
     * 计算基准点对比（新方案）
     * 活跃bin百分比以100%为基准点（当作0%），其他数据以0%为基准点
     */
    calculateBaselineComparison(data, selectedDataTypes) {
        if (data.length === 0) return [];

        // 获取第一个数据点作为基准
        const baselineData = data[0].data;
        const baselines = {};

        // 设置每个数据类型的基准点
        selectedDataTypes.forEach(dataType => {
            const config = this.dataTypes[dataType];
            if (config && config.baseline !== undefined) {
                // 使用配置中定义的基准点
                baselines[dataType] = config.baseline;
            } else if (dataType === 'activeBinPercentage') {
                // 活跃bin百分比：以100%为基准点
                baselines[dataType] = 100;
            } else {
                // 其他数据：以0%为基准点
                baselines[dataType] = 0;
            }
        });

        // 处理每个数据点
        const processedData = data.map(point => {
            const adjustedValues = {};

            selectedDataTypes.forEach(dataType => {
                const currentValue = this.extractDataValue(point.data, dataType);
                const baseline = baselines[dataType];
                const config = this.dataTypes[dataType];

                // 计算相对于基准点的差值
                let adjustedValue = currentValue - baseline;

                // 应用智能缩放（如果开启）
                if (this.amplifySmallChanges && config.amplify > 1) {
                    adjustedValue = adjustedValue * config.amplify;
                }

                adjustedValues[dataType] = adjustedValue;
            });

            return {
                timestamp: point.timestamp,
                adjustedValues: adjustedValues,
                originalData: point.data
            };
        });


        return processedData;
    }

    /**
 * 提取数据值（全部为百分比）
 */
    extractDataValue(data, dataType) {
        let value = 0;

        switch (dataType) {
            case 'activeBinPercentage':
                value = data.activeBinPercentage || 0;
                break;
            case 'yieldRate5m':
                value = data.yieldRate5m || 0;
                break;
            case 'yieldRate15m':
                value = data.yieldRate15m || 0;
                break;
            case 'yieldRate1h':
                value = data.yieldRate1h || 0;
                break;
            case 'priceChange5m':
                value = data.priceChange5m || 0;
                break;
            case 'priceChange15m':
                value = data.priceChange15m || 0;
                break;
            case 'priceChange1h':
                value = data.priceChange1h || 0;
                break;
            case 'pnlPercentage':
                value = data.pnlPercentage || 0;
                break;
            case 'combinedBin5m':
                // 活跃Bin百分比 + 5分钟收益率百分比
                value = (data.activeBinPercentage || 0) + (data.yieldRate5m || 0);
                break;
            case 'combinedBin15m':
                // 活跃Bin百分比 + 15分钟收益率百分比
                value = (data.activeBinPercentage || 0) + (data.yieldRate15m || 0);
                break;
            // 🆕 基准收益率数据处理（null值保持null，不转换为0）
            case 'benchmarkYieldRate5m':
                value = data.benchmarkYieldRate5m !== null && data.benchmarkYieldRate5m !== undefined ? data.benchmarkYieldRate5m : null;
                break;
            case 'benchmarkYieldRate5mAvg':
                value = data.benchmarkYieldRate5mAvg !== null && data.benchmarkYieldRate5mAvg !== undefined ? data.benchmarkYieldRate5mAvg : null;
                break;
            case 'benchmarkYieldRate15mAvg':
                value = data.benchmarkYieldRate15mAvg !== null && data.benchmarkYieldRate15mAvg !== undefined ? data.benchmarkYieldRate15mAvg : null;
                break;
            case 'benchmarkYieldRate45mAvg':
                value = data.benchmarkYieldRate45mAvg !== null && data.benchmarkYieldRate45mAvg !== undefined ? data.benchmarkYieldRate45mAvg : null;
                break;
            default:
                value = 0;
        }

        return value;
    }

    /**
     * 显示图表为空状态
     */
    showChartEmpty(strategyId) {
        const canvas = document.getElementById(`chart-${strategyId}`);
        if (canvas) {
            const wrapper = canvas.parentElement;
            wrapper.innerHTML = `
                <div class="chart-empty">
                    <div class="empty-icon">📊</div>
                    <p>该时间范围内暂无数据</p>
                    <small>请尝试选择更长的时间范围</small>
                </div>
            `;
        }
    }

    /**
     * 显示图表错误状态
     */
    showChartError(strategyId, message) {
        const canvas = document.getElementById(`chart-${strategyId}`);
        if (canvas) {
            const wrapper = canvas.parentElement;
            wrapper.innerHTML = `
                <div class="chart-error">
                    <div class="error-icon">❌</div>
                    <p>图表加载失败</p>
                    <small>${message}</small>
                </div>
            `;
        }
    }

    /**
     * 更新图表图例
     */
    updateChartLegend(strategyId, datasets) {
        const legendContainer = document.getElementById(`legend-${strategyId}`);
        if (!legendContainer) return;

        legendContainer.innerHTML = datasets.map(dataset => {
            // 基准线使用特殊样式
            if (dataset.dataType === 'baseline') {
                return `
                    <div class="legend-item baseline-legend">
                        <span class="legend-color baseline-color" style="background-color: ${dataset.borderColor}; border: 1px dashed ${dataset.borderColor}; background: none;"></span>
                        <span class="legend-label baseline-label">${dataset.label}</span>
                    </div>
                `;
            } else {
                return `
                    <div class="legend-item">
                        <span class="legend-color" style="background-color: ${dataset.borderColor}"></span>
                        <span class="legend-label">${dataset.label}</span>
                    </div>
                `;
            }
        }).join('');
    }

    /**
     * 更新状态信息
     */
    async updateStatusInfo() {
        try {
            const stats = await this.dataStorage.getStorageStats();
            if (stats) {
                document.getElementById('last-update').textContent = stats.newestData ?
                    stats.newestData.toLocaleTimeString() : '--';
                document.getElementById('strategy-count').textContent = stats.strategiesCount;
                document.getElementById('data-points').textContent = stats.totalDataPoints;
            }
        } catch (error) {
            console.error('❌ 更新状态信息失败:', error);
        }
    }

    /**
     * 显示加载状态
     */
    showLoading() {
        const chartsContainer = this.container.querySelector('.charts-container');
        chartsContainer.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>正在加载数据...</p>
            </div>
        `;
    }

    /**
     * 显示空状态
     */
    showEmptyState() {
        const chartsContainer = this.container.querySelector('.charts-container');
        chartsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📈</div>
                <h4>暂无数据</h4>
                <p>请先创建并运行策略实例，数据将自动采集并在此处显示</p>
                <button class="btn-refresh" onclick="this.closest('.analytics-container').querySelector('.btn-refresh').click()">
                    🔄 刷新数据
                </button>
            </div>
        `;
    }

    /**
     * 显示错误状态
     */
    showError(message) {
        const chartsContainer = this.container.querySelector('.charts-container');
        chartsContainer.innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h4>加载失败</h4>
                <p>${message}</p>
                <button class="btn-refresh" onclick="this.closest('.analytics-container').querySelector('.btn-refresh').click()">
                    🔄 重试
                </button>
            </div>
        `;
    }

    /**
     * 渲染错误
     */
    renderError(message) {
        this.container.innerHTML = `
            <div class="analytics-error">
                <div class="error-icon">❌</div>
                <h3>数据分析模块加载失败</h3>
                <p>${message}</p>
                <button onclick="location.reload()">刷新页面</button>
            </div>
        `;
    }

    /**
     * 格式化策略ID显示
     */
    formatStrategyId(strategyId) {
        if (strategyId.length > 15) {
            return strategyId.substring(0, 8) + '...' + strategyId.substring(strategyId.length - 4);
        }
        return strategyId;
    }

    /**
     * 格式化策略名称
     */
    formatStrategyName(strategyId) {
        const strategyInfo = this.strategyInfoCache.get(strategyId);
        if (strategyInfo && strategyInfo.name) {
            return strategyInfo.name;
        }

        // 后备方案：格式化ID
        if (strategyId.length > 20) {
            return strategyId.substring(0, 20) + '...';
        }
        return strategyId;
    }

    /**
     * 启动自动刷新
     */
    startAutoRefresh() {
        this.refreshTimer = setInterval(() => {
            this.loadAndRenderCharts();
        }, this.refreshInterval);

        // 🔧 调试功能：绑定到window对象以便在控制台调用
        if (typeof window !== 'undefined') {
            window.debugAnalytics = {
                inspect: () => this.inspectStoredData(),
                addTestData: () => this.addTestData(),
                refresh: () => this.loadAndRenderCharts(),
                testAPI: () => this.testAPIResponse(),
                enableDebug: () => {
                    this.debugMode = true;
                    window.debugMode = true;
                    console.log('🔧 数据分析调试模式已开启');
                },
                disableDebug: () => {
                    this.debugMode = false;
                    window.debugMode = false;
                    console.log('🔧 数据分析调试模式已关闭');
                }
            };
            this.debugLog('🔧 调试功能已绑定到 window.debugAnalytics');
            this.debugLog('📖 使用方法:');
            this.debugLog('   window.debugAnalytics.enableDebug()  - 开启调试模式');
            this.debugLog('   window.debugAnalytics.inspect()      - 检查数据');
            this.debugLog('   window.debugAnalytics.testAPI()      - 测试API响应');
            this.debugLog('   window.debugAnalytics.addTestData()  - 添加测试数据');
            this.debugLog('   window.debugAnalytics.disableDebug() - 关闭调试模式');
        }
    }

    /**
     * 停止自动刷新
     */
    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * 销毁
     */
    destroy() {
        this.stopAutoRefresh();

        // 销毁所有图表
        this.charts.forEach(chart => chart.destroy());
        this.charts.clear();

        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    /**
     * 🔧 调试功能：检查IndexedDB中的数据
     */
    async inspectStoredData() {
        if (!this.dataStorage || !this.dataStorage.db) {
            console.log('❌ 数据库未初始化');
            return;
        }

        try {
            const strategies = await this.dataStorage.getAvailableStrategies();
            console.log('🔍 数据库检查结果:');
            console.log('策略列表:', strategies);

            if (strategies.length === 0) {
                console.log('📝 数据库中暂无策略数据');
                return;
            }

            // 检查第一个策略的数据
            const firstStrategy = strategies[0];
            const now = Date.now();
            const oneHourAgo = now - (60 * 60 * 1000);

            const data = await this.dataStorage.getDataRange(firstStrategy, oneHourAgo, now);
            console.log(`📊 策略 ${firstStrategy} 近1小时数据:`, data.length, '条');

            if (data.length > 0) {
                const sampleData = data[data.length - 1]; // 最新的一条数据
                console.log('🔬 最新数据样本:', sampleData);
                console.log('💰 净盈亏数据检查:');
                console.log('  - netPnL:', sampleData.data.netPnL);
                console.log('  - netPnLPercentage:', sampleData.data.netPnLPercentage);
                console.log('  - positionValue:', sampleData.data.positionValue);
                console.log('  - totalReturnRate:', sampleData.data.totalReturnRate);
                console.log('  - activeBinPercentage:', sampleData.data.activeBinPercentage);
                console.log('  - currentPrice:', sampleData.data.currentPrice);

                // 测试数据提取
                Object.keys(this.dataTypes).forEach(dataType => {
                    const value = this.extractDataValue(sampleData.data, dataType);
                    console.log(`  - ${dataType}: ${value}`);
                });
            }

        } catch (error) {
            console.error('❌ 检查数据库失败:', error);
        }
    }

    /**
     * 🔧 调试功能：手动添加测试数据
     */
    async addTestData() {
        if (!this.dataStorage) {
            console.log('❌ 数据存储服务未初始化');
            return;
        }

        const testStrategyId = 'test_strategy_' + Date.now();
        const testData = {
            netPnL: -15.50,
            netPnLPercentage: -3.2,
            positionValue: 485.20,
            currentPrice: 0.000123,
            activeBin: 12,
            positionLowerBin: 8,
            positionUpperBin: 16,
            historicalYieldRates: {
                totalReturnRate: -2.8
            }
        };

        try {
            const success = await this.dataStorage.saveDataPoint(testStrategyId, testData);
            if (success) {
                console.log('✅ 测试数据已添加:', testStrategyId, testData);
                console.log('🔄 请刷新页面查看效果');
            } else {
                console.log('❌ 添加测试数据失败');
            }
        } catch (error) {
            console.error('❌ 添加测试数据失败:', error);
        }
    }

    /**
     * 🔧 调试功能：测试API响应格式
     */
    async testAPIResponse() {
        console.log('🔍 开始测试策略API响应...');

        if (!window.apiService) {
            console.log('❌ APIService未找到');
            return;
        }

        try {
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('API测试超时')), 5000)
            );

            const response = await Promise.race([
                window.apiService.getStrategies(),
                timeout
            ]);
            console.log('📡 API原始响应:', response);
            console.log('📋 响应类型:', typeof response);
            console.log('📋 是否为数组:', Array.isArray(response));

            if (response && typeof response === 'object') {
                console.log('🔑 响应对象键:', Object.keys(response));

                if (response.data) {
                    console.log('📄 response.data:', response.data);
                    console.log('📋 data类型:', typeof response.data);
                    console.log('📋 data是否为数组:', Array.isArray(response.data));
                }

                if (response.success !== undefined) {
                    console.log('✅ response.success:', response.success);
                }
            }

        } catch (error) {
            console.error('❌ API测试失败:', error.message);
            console.error('详细错误:', error);
        }
    }
}

// 导出到全局
window.SimpleAnalytics = SimpleAnalytics; 