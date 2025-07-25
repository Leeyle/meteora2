/**
 * 📊 监控UI模块
 * 负责监控界面的渲染和实时数据显示，不包含业务逻辑
 * 专注于数据可视化和用户交互界面
 */

class MonitorUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`监控UI容器未找到: ${containerId}`);
        }
        this.charts = new Map();
        this.refreshInterval = null;
        this.animationFrameId = null;
    }

    /**
     * 初始化UI
     */
    init() {
        this.render();
        this.bindEvents();
        this.startAnimation();
        this.startTimeUpdateTimer();
        console.log('📊 监控UI初始化完成');
    }

    /**
     * 渲染主界面
     */
    render() {
        this.container.innerHTML = `
            <div class="monitor-container">
                ${this.renderHeader()}
                ${this.renderMetricsGrid()}
                ${this.renderChartsSection()}
                ${this.renderAlertsSection()}
                ${this.renderLogsSection()}
            </div>
        `;

        this.initializeCharts();
    }

    /**
     * 渲染头部
     */
    renderHeader() {
        return `
            <div class="monitor-header">
                <div class="header-left">
                    <h2>👁️ 实时监控</h2>
                    <div class="monitor-status">
                        <span class="status-indicator" id="monitor-status">
                            <span class="status-dot connecting"></span>
                            <span class="status-text">连接中...</span>
                        </span>
                        <span class="last-update">
                            最后更新: <span id="last-update-time">--</span>
                        </span>
                    </div>
                </div>
                <div class="header-right">
                    <div class="monitor-controls">
                        <button class="btn btn-outline-secondary" id="refresh-monitor-btn" title="手动刷新">
                            <i class="fas fa-sync-alt"></i> 刷新
                        </button>
                        <button class="btn btn-outline-secondary" id="toggle-auto-refresh" title="切换自动刷新">
                            <i class="fas fa-play"></i> 自动刷新
                        </button>
                        <button class="btn btn-outline-secondary" id="export-data-btn" title="导出数据">
                            <i class="fas fa-download"></i> 导出
                        </button>
                        <button class="btn btn-outline-secondary" id="settings-monitor-btn" title="监控设置">
                            <i class="fas fa-cog"></i> 设置
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染指标网格
     */
    renderMetricsGrid() {
        return `
            <div class="metrics-grid">
                <div class="metric-card system-metrics">
                    <div class="metric-header">
                        <h3><i class="fas fa-server"></i> 系统指标</h3>
                        <span class="metric-badge" id="system-status-badge">正常</span>
                    </div>
                    <div class="metric-content">
                        <div class="metric-item">
                            <label>API延迟</label>
                            <div class="metric-value">
                                <span id="api-latency">--</span><span class="unit">ms</span>
                                <div class="metric-bar">
                                    <div class="bar-fill" id="api-latency-bar"></div>
                                </div>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>内存使用</label>
                            <div class="metric-value">
                                <span id="memory-usage">--</span><span class="unit">%</span>
                                <div class="metric-bar">
                                    <div class="bar-fill" id="memory-usage-bar"></div>
                                </div>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>CPU使用</label>
                            <div class="metric-value">
                                <span id="cpu-usage">--</span><span class="unit">%</span>
                                <div class="metric-bar">
                                    <div class="bar-fill" id="cpu-usage-bar"></div>
                                </div>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>运行时间</label>
                            <div class="metric-value">
                                <span id="system-uptime">--</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="metric-card wallet-metrics">
                    <div class="metric-header">
                        <h3><i class="fas fa-wallet"></i> 钱包状态</h3>
                        <span class="metric-badge" id="wallet-status-badge">未连接</span>
                    </div>
                    <div class="metric-content">
                        <div class="metric-item">
                            <label>连接状态</label>
                            <div class="metric-value">
                                <span id="wallet-connection">未连接</span>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>钱包余额</label>
                            <div class="metric-value">
                                <span id="wallet-balance">0.00</span><span class="unit">SOL</span>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>钱包地址</label>
                            <div class="metric-value">
                                <span id="wallet-address" class="address-text">--</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="metric-card position-metrics">
                    <div class="metric-header">
                        <h3><i class="fas fa-chart-line"></i> 头寸指标</h3>
                        <span class="metric-badge" id="position-status-badge">--</span>
                    </div>
                    <div class="metric-content">
                        <div class="metric-item">
                            <label>总头寸数</label>
                            <div class="metric-value">
                                <span id="total-positions">0</span>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>活跃头寸</label>
                            <div class="metric-value">
                                <span id="active-positions">0</span>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>总价值</label>
                            <div class="metric-value">
                                <span id="total-position-value">$0.00</span>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>总盈亏</label>
                            <div class="metric-value">
                                <span id="total-position-pnl" class="pnl-value">$0.00</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="metric-card strategy-metrics">
                    <div class="metric-header">
                        <h3><i class="fas fa-robot"></i> 策略指标</h3>
                        <span class="metric-badge" id="strategy-status-badge">--</span>
                    </div>
                    <div class="metric-content">
                        <div class="metric-item">
                            <label>总策略数</label>
                            <div class="metric-value">
                                <span id="total-strategies">0</span>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>运行中</label>
                            <div class="metric-value">
                                <span id="running-strategies">0</span>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>已暂停</label>
                            <div class="metric-value">
                                <span id="paused-strategies">0</span>
                            </div>
                        </div>
                        <div class="metric-item">
                            <label>策略盈亏</label>
                            <div class="metric-value">
                                <span id="total-strategy-pnl" class="pnl-value">$0.00</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染图表区域
     */
    renderChartsSection() {
        return `
            <div class="charts-section">
                <div class="chart-container">
                    <div class="chart-header">
                        <h3>📈 性能趋势</h3>
                        <div class="chart-controls">
                            <button class="btn btn-sm" data-period="1h">1小时</button>
                            <button class="btn btn-sm active" data-period="6h">6小时</button>
                            <button class="btn btn-sm" data-period="24h">24小时</button>
                        </div>
                    </div>
                    <div class="chart-content">
                        <canvas id="performance-chart" width="400" height="200"></canvas>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染预警区域
     */
    renderAlertsSection() {
        return `
            <div class="alerts-section">
                <div class="section-header">
                    <h3>🚨 预警信息</h3>
                    <div class="section-controls">
                        <button class="btn btn-sm btn-outline-secondary" id="clear-alerts-btn">
                            <i class="fas fa-trash"></i> 清空
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" id="filter-alerts-btn">
                            <i class="fas fa-filter"></i> 筛选
                        </button>
                    </div>
                </div>
                <div class="alerts-content">
                    <div id="alerts-list" class="alerts-list">
                        ${this.renderEmptyState('预警', '暂无预警信息')}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染日志区域
     */
    renderLogsSection() {
        return `
            <div class="logs-section">
                <div class="section-header">
                    <h3>📋 系统日志</h3>
                    <div class="section-controls">
                        <select class="form-select form-select-sm" id="log-level-filter">
                            <option value="all">所有级别</option>
                            <option value="error">错误</option>
                            <option value="warning">警告</option>
                            <option value="info">信息</option>
                            <option value="debug">调试</option>
                        </select>
                        <button class="btn btn-sm btn-outline-secondary" id="clear-logs-btn">
                            <i class="fas fa-trash"></i> 清空
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" id="download-logs-btn">
                            <i class="fas fa-download"></i> 下载
                        </button>
                    </div>
                </div>
                <div class="logs-content">
                    <div id="logs-list" class="logs-list">
                        ${this.renderEmptyState('日志', '暂无日志记录')}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染空状态
     */
    renderEmptyState(type, message) {
        return `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-inbox fa-2x"></i>
                </div>
                <p class="empty-message">${message}</p>
            </div>
        `;
    }

    /**
     * 更新连接状态
     */
    updateConnectionStatus(isConnected) {
        const statusIndicator = document.getElementById('monitor-status');
        const statusDot = statusIndicator.querySelector('.status-dot');
        const statusText = statusIndicator.querySelector('.status-text');

        if (isConnected) {
            statusDot.className = 'status-dot connected';
            statusText.textContent = '已连接';
        } else {
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = '连接断开';
        }
    }

    /**
     * 更新系统指标
     */
    updateSystemMetrics(metrics) {
        // 更新API延迟
        const apiLatency = document.getElementById('api-latency');
        const apiLatencyBar = document.getElementById('api-latency-bar');
        if (apiLatency && apiLatencyBar) {
            apiLatency.textContent = metrics.apiLatency || '--';
            const latencyPercent = Math.min(100, (metrics.apiLatency || 0) / 2);
            apiLatencyBar.style.width = `${latencyPercent}%`;
            apiLatencyBar.className = `bar-fill ${this.getLatencyClass(metrics.apiLatency)}`;
        }

        // 更新内存使用
        const memoryUsage = document.getElementById('memory-usage');
        const memoryBar = document.getElementById('memory-usage-bar');
        if (memoryUsage && memoryBar) {
            memoryUsage.textContent = metrics.memoryUsage || '--';
            memoryBar.style.width = `${metrics.memoryUsage || 0}%`;
            memoryBar.className = `bar-fill ${this.getUsageClass(metrics.memoryUsage)}`;
        }

        // 更新CPU使用
        const cpuUsage = document.getElementById('cpu-usage');
        const cpuBar = document.getElementById('cpu-usage-bar');
        if (cpuUsage && cpuBar) {
            cpuUsage.textContent = metrics.cpuUsage || '--';
            cpuBar.style.width = `${metrics.cpuUsage || 0}%`;
            cpuBar.className = `bar-fill ${this.getUsageClass(metrics.cpuUsage)}`;
        }

        // 更新运行时间
        const uptime = document.getElementById('system-uptime');
        if (uptime) {
            uptime.textContent = this.formatUptime(metrics.uptime);
        }

        // 更新系统状态徽章
        this.updateSystemStatusBadge(metrics);
    }

    /**
     * 更新钱包状态
     */
    updateWalletStatus(status) {
        // 连接状态
        const connection = document.getElementById('wallet-connection');
        if (connection) {
            connection.textContent = status.connected ? '已连接' : '未连接';
            connection.className = status.connected ? 'status-connected' : 'status-disconnected';
        }

        // 钱包余额
        const balance = document.getElementById('wallet-balance');
        if (balance) {
            balance.textContent = (status.balance || 0).toFixed(4);
        }

        // 钱包地址
        const address = document.getElementById('wallet-address');
        if (address) {
            address.textContent = status.address ? this.truncateAddress(status.address) : '--';
            address.title = status.address || '';
        }

        // 更新钱包状态徽章
        const badge = document.getElementById('wallet-status-badge');
        if (badge) {
            badge.textContent = status.connected ? '已连接' : '未连接';
            badge.className = `metric-badge ${status.connected ? 'badge-success' : 'badge-secondary'}`;
        }
    }

    /**
     * 更新头寸指标
     */
    updatePositionMetrics(metrics) {
        // 总头寸数
        const totalPositions = document.getElementById('total-positions');
        if (totalPositions) {
            totalPositions.textContent = metrics.totalPositions || 0;
        }

        // 活跃头寸
        const activePositions = document.getElementById('active-positions');
        if (activePositions) {
            activePositions.textContent = metrics.activePositions || 0;
        }

        // 总价值
        const totalValue = document.getElementById('total-position-value');
        if (totalValue) {
            totalValue.textContent = this.formatCurrency(metrics.totalValue || 0);
        }

        // 总盈亏
        const totalPnL = document.getElementById('total-position-pnl');
        if (totalPnL) {
            const pnl = metrics.totalPnL || 0;
            totalPnL.textContent = this.formatCurrency(pnl);
            totalPnL.className = `pnl-value ${pnl >= 0 ? 'positive' : 'negative'}`;
        }

        // 更新头寸状态徽章
        const badge = document.getElementById('position-status-badge');
        if (badge) {
            const activeCount = metrics.activePositions || 0;
            badge.textContent = activeCount > 0 ? `${activeCount}个活跃` : '无活跃';
            badge.className = `metric-badge ${activeCount > 0 ? 'badge-success' : 'badge-secondary'}`;
        }
    }

    /**
     * 更新策略指标
     */
    updateStrategyMetrics(metrics) {
        // 总策略数
        const totalStrategies = document.getElementById('total-strategies');
        if (totalStrategies) {
            totalStrategies.textContent = metrics.totalStrategies || 0;
        }

        // 运行中策略
        const runningStrategies = document.getElementById('running-strategies');
        if (runningStrategies) {
            runningStrategies.textContent = metrics.runningStrategies || 0;
        }

        // 暂停策略
        const pausedStrategies = document.getElementById('paused-strategies');
        if (pausedStrategies) {
            pausedStrategies.textContent = metrics.pausedStrategies || 0;
        }

        // 策略盈亏
        const totalPnL = document.getElementById('total-strategy-pnl');
        if (totalPnL) {
            const pnl = metrics.totalPnL || 0;
            totalPnL.textContent = this.formatCurrency(pnl);
            totalPnL.className = `pnl-value ${pnl >= 0 ? 'positive' : 'negative'}`;
        }

        // 更新策略状态徽章
        const badge = document.getElementById('strategy-status-badge');
        if (badge) {
            const runningCount = metrics.runningStrategies || 0;
            badge.textContent = runningCount > 0 ? `${runningCount}个运行` : '无运行';
            badge.className = `metric-badge ${runningCount > 0 ? 'badge-success' : 'badge-secondary'}`;
        }
    }

    /**
     * 更新预警列表
     */
    updateAlerts(alerts) {
        const alertsList = document.getElementById('alerts-list');
        if (!alertsList) return;

        if (!alerts || alerts.length === 0) {
            alertsList.innerHTML = this.renderEmptyState('预警', '暂无预警信息');
            return;
        }

        alertsList.innerHTML = alerts.map(alert => this.renderAlertItem(alert)).join('');
    }

    /**
     * 渲染预警项
     */
    renderAlertItem(alert) {
        const iconClass = this.getAlertIcon(alert.type);
        const typeClass = this.getAlertClass(alert.type);

        return `
            <div class="alert-item ${typeClass}" data-alert-id="${alert.id}">
                <div class="alert-icon">
                    <i class="${iconClass}"></i>
                </div>
                <div class="alert-content">
                    <div class="alert-title">${alert.title}</div>
                    <div class="alert-message">${alert.message}</div>
                    <div class="alert-time">${this.formatTime(alert.timestamp)}</div>
                </div>
                <div class="alert-actions">
                    <button class="btn btn-sm btn-outline-secondary dismiss-alert-btn" data-alert-id="${alert.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * 更新日志列表
     */
    updateLogs(logs) {
        const logsList = document.getElementById('logs-list');
        if (!logsList) return;

        if (!logs || logs.length === 0) {
            logsList.innerHTML = this.renderEmptyState('日志', '暂无日志记录');
            return;
        }

        logsList.innerHTML = logs.map(log => this.renderLogItem(log)).join('');
    }

    /**
     * 渲染日志项
     */
    renderLogItem(log) {
        const levelClass = this.getLogLevelClass(log.level);

        return `
            <div class="log-item ${levelClass}" data-log-id="${log.id}">
                <div class="log-level">
                    <span class="level-badge">${log.level.toUpperCase()}</span>
                </div>
                <div class="log-content">
                    <div class="log-message">${log.message}</div>
                    <div class="log-time">${this.formatTime(log.timestamp)}</div>
                </div>
            </div>
        `;
    }

    /**
     * 更新最后更新时间
     */
    updateLastUpdateTime() {
        const lastUpdate = document.getElementById('last-update-time');
        if (lastUpdate) {
            lastUpdate.textContent = this.formatTime(Date.now());
        }
    }

    /**
     * 初始化图表
     */
    initializeCharts() {
        // TODO: 实现图表初始化
        // 这里可以使用Chart.js或其他图表库
        console.log('📈 图表初始化 (占位符)');
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 工具栏按钮事件
        this.bindToolbarEvents();

        // 预警和日志事件
        this.bindAlertsEvents();
        this.bindLogsEvents();
    }

    /**
     * 绑定工具栏事件
     */
    bindToolbarEvents() {
        const refreshBtn = document.getElementById('refresh-monitor-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.emit('refresh');
            });
        }

        const autoRefreshBtn = document.getElementById('toggle-auto-refresh');
        if (autoRefreshBtn) {
            autoRefreshBtn.addEventListener('click', () => {
                this.emit('toggleAutoRefresh');
            });
        }
    }

    /**
     * 绑定预警事件
     */
    bindAlertsEvents() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.dismiss-alert-btn')) {
                const alertId = e.target.closest('.dismiss-alert-btn').dataset.alertId;
                this.emit('dismissAlert', alertId);
            }
        });

        const clearAlertsBtn = document.getElementById('clear-alerts-btn');
        if (clearAlertsBtn) {
            clearAlertsBtn.addEventListener('click', () => {
                this.emit('clearAlerts');
            });
        }
    }

    /**
     * 绑定日志事件
     */
    bindLogsEvents() {
        const logLevelFilter = document.getElementById('log-level-filter');
        if (logLevelFilter) {
            logLevelFilter.addEventListener('change', (e) => {
                this.emit('filterLogs', e.target.value);
            });
        }

        const clearLogsBtn = document.getElementById('clear-logs-btn');
        if (clearLogsBtn) {
            clearLogsBtn.addEventListener('click', () => {
                this.emit('clearLogs');
            });
        }
    }

    /**
     * 启动动画
     */
    startAnimation() {
        const animate = () => {
            this.updateProgressBars();
            this.animationFrameId = requestAnimationFrame(animate);
        };
        animate();
    }

    /**
     * 启动时间更新定时器
     */
    startTimeUpdateTimer() {
        // 每秒更新一次时间显示
        this.timeUpdateInterval = setInterval(() => {
            this.updateLastUpdateTime();
        }, 1000);
    }

    /**
     * 更新进度条动画
     */
    updateProgressBars() {
        // 为指标条添加动画效果
        document.querySelectorAll('.bar-fill').forEach(bar => {
            if (!bar.style.width) return;

            const currentWidth = parseFloat(bar.style.width);
            if (currentWidth > 0 && !bar.classList.contains('animated')) {
                bar.classList.add('animated');
            }
        });
    }

    /**
     * 工具方法
     */
    getLatencyClass(latency) {
        if (latency < 100) return 'success';
        if (latency < 200) return 'warning';
        return 'danger';
    }

    getUsageClass(usage) {
        if (usage < 50) return 'success';
        if (usage < 80) return 'warning';
        return 'danger';
    }

    getAlertIcon(type) {
        const icons = {
            error: 'fas fa-exclamation-triangle',
            warning: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle',
            success: 'fas fa-check-circle'
        };
        return icons[type] || icons.info;
    }

    getAlertClass(type) {
        return `alert-${type}`;
    }

    getLogLevelClass(level) {
        return `log-${level}`;
    }

    updateSystemStatusBadge(metrics) {
        const badge = document.getElementById('system-status-badge');
        if (!badge) return;

        const issues = [];
        if (metrics.apiLatency > 200) issues.push('高延迟');
        if (metrics.memoryUsage > 80) issues.push('高内存');
        if (metrics.cpuUsage > 80) issues.push('高CPU');

        if (issues.length === 0) {
            badge.textContent = '正常';
            badge.className = 'metric-badge badge-success';
        } else {
            badge.textContent = `${issues.length}个问题`;
            badge.className = 'metric-badge badge-warning';
        }
    }

    truncateAddress(address) {
        if (!address || address.length <= 12) return address;
        return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
    }

    formatUptime(uptime) {
        if (!uptime) return '--';

        const now = Date.now();
        const uptimeMs = typeof uptime === 'number' ? now - uptime : 0;
        const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            const remainingHours = hours % 24;
            return `${days}天${remainingHours}小时`;
        } else if (hours > 0) {
            return `${hours}小时${minutes}分钟`;
        } else {
            return `${minutes}分钟`;
        }
    }

    formatCurrency(amount) {
        if (typeof amount !== 'number') return '$0.00000000';

        const prefix = amount >= 0 ? '+' : '';
        return `${prefix}$${Math.abs(amount).toLocaleString('en-US', {
            minimumFractionDigits: 8,
            maximumFractionDigits: 8
        })}`;
    }

    formatTime(timestamp) {
        if (!timestamp) return '--';

        const date = new Date(timestamp);

        // 格式化为 YYYY-MM-DD HH:mm:ss
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * 事件发射器
     */
    emit(eventName, data = null) {
        const event = new CustomEvent(`monitor-ui-${eventName}`, {
            detail: data,
            bubbles: true
        });
        this.container.dispatchEvent(event);
    }

    /**
     * 销毁UI
     */
    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        // 清理时间更新定时器
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }

        this.charts.clear();

        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// 导出监控UI类
window.MonitorUI = MonitorUI; 