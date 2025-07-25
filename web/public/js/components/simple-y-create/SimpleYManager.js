/**
 * 📊 简单Y策略管理器
 * 完全复刻连锁头寸策略管理器的功能，适配简单Y策略
 * 整合策略创建器和监控器，提供统一的管理界面
 */

// 立即执行的调试信息
console.log('🔥 SimpleYManager.js 文件开始加载...');
class SimpleYManager {
    constructor(container) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        this.currentTab = 'create';
        
        // 子组件
        this.creator = null;
        this.monitor = null;
        
        // 状态
        this.isInitialized = false;
        this.strategies = [];
        
        this.init();
    }

    /**
     * 初始化管理器
     */
    async init() {
        try {
            console.log('📊 初始化简单Y策略管理器...');
            console.log('📊 容器ID或元素:', this.container);
            
            if (!this.container) {
                console.error('❌ 管理器容器不存在!');
                throw new Error('管理器容器不存在');
            }
            
            console.log('📊 容器存在，继续初始化...');

            // 渲染主界面
            this.render();
            
            // 绑定事件
            this.bindEvents();
            
            // 初始化创建器
            await this.initializeCreator();
            
            // 初始化监控器
            await this.initializeMonitor();
            
            // 加载策略列表
            await this.loadStrategies();
            
            this.isInitialized = true;
            console.log('✅ 简单Y策略管理器初始化完成');
            
            return true;
        } catch (error) {
            console.error('❌ 简单Y策略管理器初始化失败:', error);
            this.showError('管理器初始化失败: ' + error.message);
            return false;
        }
    }

    /**
     * 渲染主界面
     */
    render() {
        console.log('🎨 SimpleYManager 开始渲染界面...');
        console.log('🎨 容器元素:', this.container);
        
        this.container.innerHTML = `
            <div class="simple-y-manager">
                <!-- 管理器头部 -->
                <div class="manager-header">
                    <div class="header-left">
                        <h2 class="manager-title">
                            <span class="title-icon">📊</span>
                            简单Y头寸策略
                        </h2>
                        <p class="manager-description">
                            创建和管理简单Y头寸策略，实现高效的单侧流动性管理
                        </p>
                    </div>
                    <div class="header-right">
                        <div class="strategy-stats">
                            <div class="stat-item">
                                <span class="stat-value" id="totalStrategies">0</span>
                                <span class="stat-label">总策略数</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value" id="activeStrategies">0</span>
                                <span class="stat-label">运行中</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value" id="totalProfit">+0.00%</span>
                                <span class="stat-label">总收益</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 功能标签页 -->
                <div class="manager-tabs">
                    <div class="tab-list">
                        <button class="tab-button active" data-tab="create">
                            <span class="tab-icon">➕</span>
                            <span class="tab-text">创建策略</span>
                        </button>
                        <button class="tab-button" data-tab="monitor">
                            <span class="tab-icon">📊</span>
                            <span class="tab-text">实时监控</span>
                        </button>
                    </div>
                </div>

                <!-- 标签页内容 -->
                <div class="tab-contents">
                    <!-- 创建策略标签页 -->
                    <div class="tab-content active" data-tab="create">
                        <div id="simpleYCreatorContainer">
                            <!-- 策略创建器将在这里加载 -->
                        </div>
                    </div>

                    <!-- 实时监控标签页 -->
                    <div class="tab-content" data-tab="monitor">
                        <div id="simpleYMonitorContainer">
                            <!-- 策略监控器将在这里加载 -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 标签页切换事件
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-button') || e.target.closest('.tab-button')) {
                const button = e.target.classList.contains('tab-button') ? e.target : e.target.closest('.tab-button');
                const tab = button.dataset.tab;
                this.switchTab(tab);
            }
        });

        // 监听策略创建事件
        if (window.EventBus) {
            window.EventBus.on('strategy:created', (data) => {
                if (data.type === 'simple-y') {
                    this.handleStrategyCreated(data);
                }
            });
        }
    }

    /**
     * 切换标签页
     */
    switchTab(tab) {
        if (this.currentTab === tab) return;

        // 更新按钮状态
        this.container.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // 更新内容显示
        this.container.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.dataset.tab === tab);
        });

        this.currentTab = tab;

        // 如果切换到监控页面，刷新监控数据
        if (tab === 'monitor' && this.monitor) {
            this.monitor.refreshStrategies();
        }
    }

    /**
     * 初始化创建器
     */
    async initializeCreator() {
        try {
            console.log('🎯 初始化简单Y策略创建器...');
            
            // 等待SimpleYCreator类加载
            if (!window.SimpleYCreator) {
                console.warn('⚠️ SimpleYCreator类未加载，等待加载...');
                await this.waitForClass('SimpleYCreator', 5000);
            }

            const creatorContainer = this.container.querySelector('#simpleYCreatorContainer');
            if (!creatorContainer) {
                throw new Error('创建器容器不存在');
            }

            this.creator = new SimpleYCreator(creatorContainer, {
                autoValidate: true,
                showPreview: true
            });

            console.log('✅ 简单Y策略创建器初始化完成');
        } catch (error) {
            console.error('❌ 创建器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 初始化监控器
     */
    async initializeMonitor() {
        try {
            console.log('📊 初始化简单Y策略监控器...');
            
            // 等待SimpleYStrategyMonitor类加载
            if (!window.SimpleYStrategyMonitor) {
                console.warn('⚠️ SimpleYStrategyMonitor类未加载，等待加载...');
                await this.waitForClass('SimpleYStrategyMonitor', 5000);
            }

            const monitorContainer = this.container.querySelector('#simpleYMonitorContainer');
            if (!monitorContainer) {
                throw new Error('监控器容器不存在');
            }

            this.monitor = new SimpleYStrategyMonitor(monitorContainer, {
                autoConnect: true,
                showNotifications: true,
                reconnectInterval: 3000,
                maxReconnectAttempts: 5
            });

            console.log('✅ 简单Y策略监控器初始化完成');
        } catch (error) {
            console.error('❌ 监控器初始化失败:', error);
            // 监控器初始化失败不应该阻止整个管理器的初始化
            console.warn('⚠️ 监控器初始化失败，但管理器将继续运行');
        }
    }

    /**
     * 加载策略列表
     */
    async loadStrategies() {
        try {
            console.log('🔄 加载简单Y策略列表...');
            
            if (!window.apiService) {
                console.warn('⚠️ API服务未初始化');
                return;
            }

            const response = await window.apiService.request('/api/strategy/list');
            
            if (response.success && response.data) {
                // 过滤简单Y策略 (支持多个版本的简单Y策略类型)
                this.strategies = response.data.filter(s => 
                    s.type === 'simple-y' || s.type === 'simple-y-v2' || s.type === 'simple_y'
                );
                console.log('📊 加载到的简单Y策略:', this.strategies.length, '个');
                
                this.updateStats();
            } else {
                console.warn('⚠️ 策略列表加载失败:', response.error);
            }
        } catch (error) {
            console.error('❌ 加载策略列表失败:', error);
        }
    }

    /**
     * 更新统计信息
     */
    updateStats() {
        const totalStrategies = this.strategies.length;
        const activeStrategies = this.strategies.filter(s => s.status === 'running').length;
        
        // 计算总收益（这里是示例，实际需要从策略数据中计算）
        let totalProfitPercentage = 0;
        if (this.strategies.length > 0) {
            const profits = this.strategies.map(s => s.profit || 0);
            totalProfitPercentage = profits.reduce((sum, profit) => sum + profit, 0) / profits.length;
        }

        // 更新UI
        this.updateStatElement('totalStrategies', totalStrategies);
        this.updateStatElement('activeStrategies', activeStrategies);
        this.updateStatElement('totalProfit', 
            totalProfitPercentage >= 0 ? `+${totalProfitPercentage.toFixed(2)}%` : `${totalProfitPercentage.toFixed(2)}%`,
            totalProfitPercentage >= 0 ? 'positive' : 'negative'
        );
    }

    /**
     * 更新统计元素
     */
    updateStatElement(id, value, className = '') {
        const element = this.container.querySelector(`#${id}`);
        if (element) {
            element.textContent = value;
            if (className) {
                element.className = `stat-value ${className}`;
            }
        }
    }

    /**
     * 处理策略创建事件
     */
    handleStrategyCreated(data) {
        console.log('🎉 策略创建成功:', data);
        
        // 添加到策略列表
        this.strategies.push(data.data);
        
        // 更新统计
        this.updateStats();
        
        // 切换到监控页面
        this.switchTab('monitor');
        
        // 刷新监控器
        if (this.monitor) {
            setTimeout(() => {
                this.monitor.refresh();
            }, 1000);
        }
    }

    /**
     * 等待类加载
     */
    waitForClass(className, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkClass = () => {
                if (window[className]) {
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error(`等待类 ${className} 加载超时`));
                } else {
                    setTimeout(checkClass, 100);
                }
            };
            
            checkClass();
        });
    }

    /**
     * 显示错误信息
     */
    showError(message) {
        console.error('❌', message);
        
        // 如果容器存在，显示错误界面
        if (this.container) {
            this.container.innerHTML = `
                <div class="error-container">
                    <div class="error-icon">❌</div>
                    <h3>初始化失败</h3>
                    <p>${message}</p>
                    <button class="btn btn-primary" onclick="location.reload()">
                        重新加载
                    </button>
                </div>
            `;
        }
    }

    /**
     * 销毁管理器
     */
    destroy() {
        try {
            console.log('🗑️ 销毁简单Y策略管理器...');
            
            // 销毁子组件
            if (this.creator && this.creator.destroy) {
                this.creator.destroy();
            }
            
            if (this.monitor && this.monitor.destroy) {
                this.monitor.destroy();
            }
            
            // 清理事件监听
            if (window.EventBus) {
                window.EventBus.off('strategy:created');
            }
            
            // 清空容器
            if (this.container) {
                this.container.innerHTML = '';
            }
            
            this.isInitialized = false;
            console.log('✅ 简单Y策略管理器销毁完成');
        } catch (error) {
            console.error('❌ 销毁管理器时出错:', error);
        }
    }

    /**
     * 刷新管理器
     */
    async refresh() {
        try {
            console.log('🔄 刷新简单Y策略管理器...');
            
            // 重新加载策略列表
            await this.loadStrategies();
            
            // 刷新当前激活的组件
            if (this.currentTab === 'monitor' && this.monitor) {
                this.monitor.refresh();
            }
            
            console.log('✅ 管理器刷新完成');
        } catch (error) {
            console.error('❌ 刷新管理器失败:', error);
        }
    }

    /**
     * 获取管理器状态
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            currentTab: this.currentTab,
            strategiesCount: this.strategies.length,
            hasCreator: !!this.creator,
            hasMonitor: !!this.monitor
        };
    }
}

// 导出到全局
window.SimpleYManager = SimpleYManager;

// 添加调试信息
console.log('✅ SimpleYManager 类已加载到全局对象'); 