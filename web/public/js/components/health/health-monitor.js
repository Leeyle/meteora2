/**
 * 🏥 策略健康监控组件
 * 实时监控策略实例的健康状态，显示异常和自动修复信息
 */

class HealthMonitor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.apiClient = new APIClient();
        this.refreshInterval = null;
        this.autoRefresh = true;
        this.refreshRate = 30000; // 30秒刷新一次

        this.statistics = null;
        this.lastCheckResults = [];
        this.config = null;

        this.init();
    }

    /**
     * 🚀 初始化健康监控器
     */
    init() {
        this.render();
        this.bindEvents();
        this.loadData();
        this.startAutoRefresh();
        console.log('🏥 健康监控器初始化完成');
    }

    /**
     * 🎨 渲染界面
     */
    render() {
        this.container.innerHTML = `
            <div class="health-monitor">
                <!-- 标题栏 -->
                <div class="health-header">
                    <h2>🏥 策略健康监控</h2>
                    <div class="health-controls">
                        <button id="health-refresh-btn" class="btn btn-primary">
                            <span class="icon">🔄</span> 立即检查
                        </button>
                        <button id="health-auto-toggle" class="btn btn-secondary">
                            <span class="icon">⏸️</span> 停止自动刷新
                        </button>
                        <button id="health-config-btn" class="btn btn-outline">
                            <span class="icon">⚙️</span> 配置
                        </button>
                    </div>
                </div>

                <!-- 健康概览 -->
                <div class="health-overview">
                    <div id="health-overview-content">
                        <div class="loading">🔄 加载健康状态中...</div>
                    </div>
                </div>

                <!-- 健康统计 -->
                <div class="health-statistics">
                    <h3>📊 健康统计</h3>
                    <div id="health-statistics-content">
                        <div class="loading">🔄 加载统计数据中...</div>
                    </div>
                </div>

                <!-- 实例健康详情 -->
                <div class="health-instances">
                    <h3>🔍 实例健康详情</h3>
                    <div class="health-filter">
                        <select id="health-status-filter">
                            <option value="">所有状态</option>
                            <option value="healthy">健康</option>
                            <option value="warning">警告</option>
                            <option value="critical">严重</option>
                            <option value="error">错误</option>
                        </select>
                        <input type="text" id="health-instance-filter" placeholder="搜索实例ID...">
                    </div>
                    <div id="health-instances-content">
                        <div class="loading">🔄 加载实例数据中...</div>
                    </div>
                </div>

                <!-- 健康历史 -->
                <div class="health-history">
                    <h3>📈 检查历史</h3>
                    <div id="health-history-content">
                        <div class="empty">暂无历史数据</div>
                    </div>
                </div>
            </div>

            <!-- 配置弹窗 -->
            <div id="health-config-modal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>⚙️ 健康检查配置</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="health-config-form">
                            <div class="form-group">
                                <label>启用健康检查</label>
                                <input type="checkbox" id="config-enabled" name="enabled">
                            </div>
                            <div class="form-group">
                                <label>检查间隔 (秒)</label>
                                <input type="number" id="config-interval" name="checkInterval" min="10" max="3600">
                            </div>
                            <div class="form-group">
                                <label>自动修复</label>
                                <input type="checkbox" id="config-autofix" name="autoFix">
                            </div>
                            <div class="form-group">
                                <label>STOPPING超时 (毫秒)</label>
                                <input type="number" id="config-stopping-timeout" name="stoppingTimeout" min="60000" max="1800000">
                            </div>
                            <div class="form-group">
                                <label>内存阈值 (MB)</label>
                                <input type="number" id="config-memory-threshold" name="memoryThreshold" min="100" max="2048">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="config-cancel">取消</button>
                        <button type="button" class="btn btn-primary" id="config-save">保存</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 🔗 绑定事件
     */
    bindEvents() {
        // 立即检查按钮
        document.getElementById('health-refresh-btn').addEventListener('click', () => {
            this.performHealthCheck();
        });

        // 自动刷新开关
        document.getElementById('health-auto-toggle').addEventListener('click', () => {
            this.toggleAutoRefresh();
        });

        // 配置按钮
        document.getElementById('health-config-btn').addEventListener('click', () => {
            this.showConfigModal();
        });

        // 状态筛选
        document.getElementById('health-status-filter').addEventListener('change', () => {
            this.filterInstances();
        });

        // 实例搜索
        document.getElementById('health-instance-filter').addEventListener('input', () => {
            this.filterInstances();
        });

        // 配置弹窗
        document.querySelector('.modal-close').addEventListener('click', () => {
            this.hideConfigModal();
        });

        document.getElementById('config-cancel').addEventListener('click', () => {
            this.hideConfigModal();
        });

        document.getElementById('config-save').addEventListener('click', () => {
            this.saveConfig();
        });

        // 点击模态框外部关闭
        document.getElementById('health-config-modal').addEventListener('click', (e) => {
            if (e.target.id === 'health-config-modal') {
                this.hideConfigModal();
            }
        });
    }

    /**
     * 📊 加载数据
     */
    async loadData() {
        try {
            // 并行加载所有数据
            const [overviewData, statisticsData, configData, healthCheckData] = await Promise.all([
                this.apiClient.getHealthOverview(),
                this.apiClient.getHealthStatistics(),
                this.apiClient.getHealthConfig(),
                this.apiClient.performHealthCheck()
            ]);

            this.renderOverview(overviewData.data);
            this.renderStatistics(statisticsData.data);
            this.config = configData.data;

            // 渲染实例健康数据
            this.lastCheckResults = healthCheckData.data.results;
            this.renderInstanceHealth(this.lastCheckResults);

        } catch (error) {
            console.error('❌ 加载健康数据失败:', error);
            this.showError('加载健康数据失败: ' + error.message);
        }
    }

    /**
     * 🔍 执行健康检查
     */
    async performHealthCheck() {
        const refreshBtn = document.getElementById('health-refresh-btn');
        const originalText = refreshBtn.innerHTML;

        try {
            refreshBtn.innerHTML = '<span class="icon">⏳</span> 检查中...';
            refreshBtn.disabled = true;

            const response = await this.apiClient.performHealthCheck();
            this.lastCheckResults = response.data.results;

            // 更新显示
            this.renderInstanceHealth(this.lastCheckResults);
            await this.loadData(); // 重新加载统计数据

            this.showSuccess(`健康检查完成 - 发现 ${response.data.summary.totalIssues} 个问题`);

        } catch (error) {
            console.error('❌ 执行健康检查失败:', error);
            this.showError('健康检查失败: ' + error.message);
        } finally {
            refreshBtn.innerHTML = originalText;
            refreshBtn.disabled = false;
        }
    }

    /**
     * 🎨 渲染健康概览
     */
    renderOverview(data) {
        const content = document.getElementById('health-overview-content');
        const overview = data.overview;

        const statusColor = {
            'healthy': '#10b981',
            'warning': '#f59e0b',
            'error': '#ef4444',
            'critical': '#dc2626'
        };

        content.innerHTML = `
            <div class="overview-cards">
                <div class="overview-card status-card" style="border-left: 4px solid ${statusColor[overview.overallStatus]}">
                    <div class="card-title">整体状态</div>
                    <div class="card-value ${overview.overallStatus}">${this.getStatusText(overview.overallStatus)}</div>
                    <div class="card-subtitle">健康评分: ${overview.healthScore}%</div>
                </div>
                
                <div class="overview-card">
                    <div class="card-title">检查次数</div>
                    <div class="card-value">${overview.checkCount}</div>
                    <div class="card-subtitle">最后检查: ${this.formatTime(overview.lastCheckTime)}</div>
                </div>
                
                <div class="overview-card">
                    <div class="card-title">自动修复</div>
                    <div class="card-value">${overview.autoFixEnabled ? '✅ 启用' : '❌ 禁用'}</div>
                    <div class="card-subtitle">检查状态: ${overview.isEnabled ? '运行中' : '已停止'}</div>
                </div>
            </div>
        `;
    }

    /**
     * 🎨 渲染健康统计
     */
    renderStatistics(data) {
        const content = document.getElementById('health-statistics-content');
        const stats = data;

        content.innerHTML = `
            <div class="statistics-grid">
                <div class="stat-card healthy">
                    <div class="stat-number">${stats.healthyInstances}</div>
                    <div class="stat-label">健康实例</div>
                </div>
                
                <div class="stat-card warning">
                    <div class="stat-number">${stats.warningInstances}</div>
                    <div class="stat-label">警告实例</div>
                </div>
                
                <div class="stat-card critical">
                    <div class="stat-number">${stats.criticalInstances}</div>
                    <div class="stat-label">严重实例</div>
                </div>
                
                <div class="stat-card error">
                    <div class="stat-number">${stats.errorInstances}</div>
                    <div class="stat-label">错误实例</div>
                </div>
                
                <div class="stat-card total">
                    <div class="stat-number">${stats.totalInstances}</div>
                    <div class="stat-label">总实例数</div>
                </div>
                
                <div class="stat-card issues">
                    <div class="stat-number">${stats.totalIssues}</div>
                    <div class="stat-label">总问题数</div>
                </div>
                
                <div class="stat-card fixed">
                    <div class="stat-number">${stats.autoFixedIssues}</div>
                    <div class="stat-label">自动修复</div>
                </div>
            </div>
        `;
    }

    /**
     * 🎨 渲染实例健康状态
     */
    renderInstanceHealth(results) {
        const content = document.getElementById('health-instances-content');

        if (!results || results.length === 0) {
            content.innerHTML = '<div class="empty">暂无实例数据</div>';
            return;
        }

        const filteredResults = this.filterResults(results);

        const instancesHtml = filteredResults.map(result => {
            const statusIcon = {
                'healthy': '✅',
                'warning': '⚠️',
                'critical': '🔴',
                'error': '❌'
            };

            const issuesHtml = result.issues.map(issue => `
                <div class="issue-item ${issue.severity}">
                    <div class="issue-type">${this.getIssueTypeText(issue.type)}</div>
                    <div class="issue-description">${issue.description}</div>
                    ${issue.autoFixed ? '<div class="issue-fixed">🔧 已自动修复</div>' : ''}
                    ${issue.fixable && !issue.autoFixed ? '<button class="btn btn-sm fix-issue" data-instance="' + result.instanceId + '" data-type="' + issue.type + '">修复</button>' : ''}
                </div>
            `).join('');

            return `
                <div class="instance-health-card ${result.status}">
                    <div class="instance-header">
                        <div class="instance-id">${statusIcon[result.status]} ${this.formatInstanceId(result.instanceId)}</div>
                        <div class="instance-status">${this.getStatusText(result.status)}</div>
                        <div class="instance-uptime">运行时间: ${this.formatDuration(result.uptime)}</div>
                    </div>
                    
                    ${result.issues.length > 0 ? `
                        <div class="instance-issues">
                            <div class="issues-header">发现 ${result.issues.length} 个问题:</div>
                            ${issuesHtml}
                        </div>
                    ` : '<div class="no-issues">✅ 无问题</div>'}
                    
                    <div class="instance-actions">
                        <button class="btn btn-sm" onclick="healthMonitor.checkSingleInstance('${result.instanceId}')">
                            🔍 重新检查
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="healthMonitor.showInstanceHistory('${result.instanceId}')">
                            📈 查看历史
                        </button>
                        ${result.status === 'critical' || result.status === 'error' ? `
                            <button class="btn btn-sm btn-danger" onclick="healthMonitor.forceCleanup('${result.instanceId}')">
                                🧹 强制清理
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        content.innerHTML = instancesHtml;

        // 绑定修复按钮事件
        content.querySelectorAll('.fix-issue').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const instanceId = e.target.dataset.instance;
                const issueType = e.target.dataset.type;
                this.fixIssue(instanceId, issueType);
            });
        });
    }

    /**
     * 🔍 筛选实例结果
     */
    filterResults(results) {
        const statusFilter = document.getElementById('health-status-filter').value;
        const instanceFilter = document.getElementById('health-instance-filter').value.toLowerCase();

        return results.filter(result => {
            const matchesStatus = !statusFilter || result.status === statusFilter;
            const matchesInstance = !instanceFilter || result.instanceId.toLowerCase().includes(instanceFilter);
            return matchesStatus && matchesInstance;
        });
    }

    /**
     * 🔍 应用筛选
     */
    filterInstances() {
        if (this.lastCheckResults && this.lastCheckResults.length > 0) {
            this.renderInstanceHealth(this.lastCheckResults);
        }
    }

    /**
     * 🔍 检查单个实例
     */
    async checkSingleInstance(instanceId) {
        try {
            const response = await this.apiClient.getInstanceHealth(instanceId);

            // 更新该实例的显示
            const index = this.lastCheckResults.findIndex(r => r.instanceId === instanceId);
            if (index !== -1) {
                this.lastCheckResults[index] = response.data;
                this.renderInstanceHealth(this.lastCheckResults);
            }

            this.showSuccess(`实例 ${this.formatInstanceId(instanceId)} 检查完成`);

        } catch (error) {
            console.error('❌ 检查单个实例失败:', error);
            this.showError('检查实例失败: ' + error.message);
        }
    }

    /**
     * 📈 显示实例历史
     */
    async showInstanceHistory(instanceId) {
        try {
            const response = await this.apiClient.getInstanceHistory(instanceId);
            const history = response.data.history;

            const historyContent = document.getElementById('health-history-content');

            if (history.length === 0) {
                historyContent.innerHTML = '<div class="empty">该实例暂无检查历史</div>';
                return;
            }

            const historyHtml = history.map(record => `
                <div class="history-item ${record.status}">
                    <div class="history-time">${this.formatTime(record.lastCheck)}</div>
                    <div class="history-status">${this.getStatusText(record.status)}</div>
                    <div class="history-issues">${record.issues.length} 个问题</div>
                    <div class="history-fixed">${record.issues.filter(i => i.autoFixed).length} 个已修复</div>
                </div>
            `).join('');

            historyContent.innerHTML = `
                <div class="history-header">
                    <h4>实例 ${this.formatInstanceId(instanceId)} 的健康历史</h4>
                </div>
                <div class="history-list">
                    ${historyHtml}
                </div>
            `;

        } catch (error) {
            console.error('❌ 获取实例历史失败:', error);
            this.showError('获取历史失败: ' + error.message);
        }
    }

    /**
     * 🧹 强制清理实例
     */
    async forceCleanup(instanceId) {
        if (!confirm(`确定要强制清理实例 ${this.formatInstanceId(instanceId)} 吗？这将彻底删除该实例及其所有资源。`)) {
            return;
        }

        try {
            const response = await this.apiClient.forceCleanupInstance(instanceId);

            if (response.data.cleaned) {
                // 从结果中移除该实例
                this.lastCheckResults = this.lastCheckResults.filter(r => r.instanceId !== instanceId);
                this.renderInstanceHealth(this.lastCheckResults);

                this.showSuccess(`实例 ${this.formatInstanceId(instanceId)} 已强制清理`);

                // 重新加载统计数据
                await this.loadData();
            } else {
                this.showError('强制清理失败');
            }

        } catch (error) {
            console.error('❌ 强制清理实例失败:', error);
            this.showError('强制清理失败: ' + error.message);
        }
    }

    /**
     * 🔧 修复问题
     */
    async fixIssue(instanceId, issueType) {
        try {
            // 重新检查实例（包含自动修复）
            await this.checkSingleInstance(instanceId);

        } catch (error) {
            console.error('❌ 修复问题失败:', error);
            this.showError('修复问题失败: ' + error.message);
        }
    }

    /**
     * ⚙️ 显示配置弹窗
     */
    async showConfigModal() {
        if (!this.config) {
            try {
                const response = await this.apiClient.getHealthConfig();
                this.config = response.data;
            } catch (error) {
                this.showError('获取配置失败: ' + error.message);
                return;
            }
        }

        // 填充表单
        document.getElementById('config-enabled').checked = this.config.enabled;
        document.getElementById('config-interval').value = this.config.checkInterval / 1000;
        document.getElementById('config-autofix').checked = this.config.autoFix;
        document.getElementById('config-stopping-timeout').value = this.config.stoppingTimeout;
        document.getElementById('config-memory-threshold').value = this.config.memoryThreshold;

        document.getElementById('health-config-modal').style.display = 'block';
    }

    /**
     * ⚙️ 隐藏配置弹窗
     */
    hideConfigModal() {
        document.getElementById('health-config-modal').style.display = 'none';
    }

    /**
     * ⚙️ 保存配置
     */
    async saveConfig() {
        try {
            const form = document.getElementById('health-config-form');
            const formData = new FormData(form);

            const config = {
                enabled: formData.get('enabled') === 'on',
                checkInterval: parseInt(formData.get('checkInterval')) * 1000,
                autoFix: formData.get('autoFix') === 'on',
                stoppingTimeout: parseInt(formData.get('stoppingTimeout')),
                memoryThreshold: parseInt(formData.get('memoryThreshold'))
            };

            await this.apiClient.updateHealthConfig(config);
            this.config = config;

            this.hideConfigModal();
            this.showSuccess('配置已保存');

            // 重新加载数据
            await this.loadData();

        } catch (error) {
            console.error('❌ 保存配置失败:', error);
            this.showError('保存配置失败: ' + error.message);
        }
    }

    /**
     * ⏰ 开始自动刷新
     */
    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        if (this.autoRefresh) {
            this.refreshInterval = setInterval(() => {
                this.loadData();
            }, this.refreshRate);
        }
    }

    /**
     * ⏰ 切换自动刷新
     */
    toggleAutoRefresh() {
        this.autoRefresh = !this.autoRefresh;
        const btn = document.getElementById('health-auto-toggle');

        if (this.autoRefresh) {
            btn.innerHTML = '<span class="icon">⏸️</span> 停止自动刷新';
            this.startAutoRefresh();
        } else {
            btn.innerHTML = '<span class="icon">▶️</span> 开始自动刷新';
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
        }
    }

    /**
     * 🎨 工具方法 - 格式化时间
     */
    formatTime(timestamp) {
        if (!timestamp) return '--';
        return new Date(timestamp).toLocaleString('zh-CN');
    }

    /**
     * 🎨 工具方法 - 格式化持续时间
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}天${hours % 24}时`;
        if (hours > 0) return `${hours}时${minutes % 60}分`;
        if (minutes > 0) return `${minutes}分${seconds % 60}秒`;
        return `${seconds}秒`;
    }

    /**
     * 🎨 工具方法 - 格式化实例ID
     */
    formatInstanceId(instanceId) {
        if (!instanceId) return '--';
        const parts = instanceId.split('_');
        return parts.length >= 3 ? parts[parts.length - 1] : instanceId;
    }

    /**
     * 🎨 工具方法 - 获取状态文本
     */
    getStatusText(status) {
        const statusTexts = {
            'healthy': '健康',
            'warning': '警告',
            'critical': '严重',
            'error': '错误'
        };
        return statusTexts[status] || status;
    }

    /**
     * 🎨 工具方法 - 获取问题类型文本
     */
    getIssueTypeText(type) {
        const typeTexts = {
            'stuck_stopping': '停止状态卡住',
            'timer_leak': '定时器泄漏',
            'memory_leak': '内存泄漏',
            'observation_buildup': '观察期累积',
            'phase_error': '阶段错误',
            'log_growth': '日志增长过快',
            'resource_leak': '资源泄漏'
        };
        return typeTexts[type] || type;
    }

    /**
     * 🎨 显示成功消息
     */
    showSuccess(message) {
        // 可以集成现有的通知系统
        console.log('✅', message);
    }

    /**
     * 🎨 显示错误消息
     */
    showError(message) {
        // 可以集成现有的通知系统
        console.error('❌', message);
    }

    /**
     * 🧹 销毁组件
     */
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// 创建全局实例
window.HealthMonitor = HealthMonitor; 