/**
 * 🔥 策略监控器 - 全新重写
 * 专门用于监控已创建策略的运行状态
 * 使用Socket.IO进行实时通信
 */
class StrategyMonitor {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        this.options = {
            autoConnect: true,
            reconnectInterval: 3000,
            maxReconnectAttempts: 5,
            ...options
        };

        // Socket.IO连接
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;

        // 策略数据
        this.strategies = new Map();
        this.lastUpdateTime = null;

        // UI状态
        this.isRendered = false;

        // EventBus监听
        this.eventBus = window.EventBus;

        // 🔥 新增：数据存储服务
        this.dataStorage = null;

        this.init();
    }

    /**
     * 初始化监控器
     */
    async init() {
        try {
            console.log('🔥 初始化策略监控器');

            // 🔥 新增：初始化数据存储服务
            await this.initDataStorage();

            // 加载Socket.IO库
            await this.loadSocketIO();

            // 渲染UI
            this.render();

            // 🔧 测试API连接
            await this.testAPIConnection();

            // 设置EventBus监听
            this.setupEventListeners();

            // 连接Socket.IO
            if (this.options.autoConnect) {
                await this.connect();
            }

            // 启动时间更新定时器
            this.startTimeUpdateTimer();

            console.log('✅ 策略监控器初始化完成');
        } catch (error) {
            console.error('❌ 策略监控器初始化失败:', error);
        }
    }

    /**
     * 🔥 新增：初始化数据存储服务
     */
    async initDataStorage() {
        try {
            if (window.StrategyDataStorage) {
                this.dataStorage = new window.StrategyDataStorage();
                console.log('✅ 数据存储服务初始化完成');
            } else {
                console.warn('⚠️ 数据存储服务不可用，可能需要先加载 strategy-data-storage.js');
            }
        } catch (error) {
            console.error('❌ 数据存储服务初始化失败:', error);
        }
    }

    /**
     * 设置EventBus事件监听
     */
    setupEventListeners() {
        if (this.eventBus) {
            // 监听策略创建事件
            this.eventBus.on('strategy:created', (data) => {
                console.log('📊 收到策略创建事件:', data);
                this.showTemporaryNotification('新策略已创建，正在刷新列表...', 'success');

                // 延迟刷新，确保后端已完全处理
                setTimeout(() => {
                    this.requestStrategyList();
                }, 1000);
            });

            // 监听策略删除事件
            this.eventBus.on('strategy:deleted', (data) => {
                console.log('🗑️ 收到策略删除事件:', data);
                this.showTemporaryNotification('策略已删除', 'info');
                this.requestStrategyList();
            });

            console.log('✅ EventBus事件监听已设置');
        } else {
            console.warn('⚠️ EventBus不可用，无法监听策略事件');
        }
    }

    /**
     * 动态加载Socket.IO库
     */
    async loadSocketIO() {
        return new Promise((resolve, reject) => {
            // 检查是否已经加载
            if (window.io) {
                resolve();
                return;
            }

            // 动态加载Socket.IO脚本
            const script = document.createElement('script');
            script.src = '/socket.io/socket.io.js';
            script.onload = () => {
                console.log('✅ Socket.IO库加载完成');
                resolve();
            };
            script.onerror = () => {
                console.error('❌ Socket.IO库加载失败');
                reject(new Error('Socket.IO库加载失败'));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * 连接Socket.IO服务器
     */
    async connect() {
        try {
            console.log('🔌 连接Socket.IO服务器...');

            // 🔧 通过API获取WebSocket配置
            const wsUrl = await this.getWebSocketUrl();
            console.log('🔗 WebSocket连接地址:', wsUrl);

            this.socket = io(wsUrl, {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: this.options.maxReconnectAttempts,
                reconnectionDelay: this.options.reconnectInterval
            });

            this.setupSocketEvents();
        } catch (error) {
            console.error('❌ Socket.IO连接失败:', error);
            this.updateConnectionStatus('error', '连接失败');
        }
    }

    /**
     * 🔧 通过API获取WebSocket URL配置
     */
    async getWebSocketUrl() {
        console.log('🔧 正在获取WebSocket配置...');

        // 🎯 使用爬虫模块的成功模式：优先使用dlmmConfig
        if (window.dlmmConfig && typeof window.dlmmConfig.getWebSocketUrl === 'function') {
            const wsUrl = window.dlmmConfig.getWebSocketUrl();
            console.log('✅ 从dlmmConfig获取WebSocket URL:', wsUrl);
            return wsUrl;
        }

        // 备用方案：手动检测环境
        console.warn('⚠️ dlmmConfig不可用，使用备用检测方案');

        const protocol = window.location.protocol;
        const hostname = window.location.hostname;

        let wsUrl;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            wsUrl = 'ws://localhost:7000';
        } else {
            // 生产环境
            if (protocol === 'https:') {
                wsUrl = `wss://${hostname}:7000`;
            } else {
                wsUrl = `ws://${hostname}:7000`;
            }
        }

        console.log('🔧 备用方案WebSocket URL:', wsUrl);
        return wsUrl;
    }

    /**
     * 设置Socket.IO事件监听
     */
    setupSocketEvents() {
        // 连接成功
        this.socket.on('connect', () => {
            console.log('✅ Socket.IO连接成功');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus('connected', '已连接');

            // 订阅策略监控
            this.socket.emit('subscribe:strategy-monitor', {
                clientId: this.generateClientId(),
                timestamp: Date.now()
            });
        });

        // 连接断开
        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Socket.IO连接断开:', reason);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', '连接断开');
        });

        // 订阅确认
        this.socket.on('subscribed:strategy-monitor', (data) => {
            console.log('✅ 策略监控订阅成功:', data);
            this.updateConnectionStatus('subscribed', '监控中');

            // 请求当前策略列表
            this.requestStrategyList();
        });

        // 智能止损数据更新
        this.socket.on('strategy:smart-stop-loss', (data) => {
            console.log('📊 收到智能止损数据:', data);
            this.handleSmartStopLossUpdate(data);
        });

        // 策略状态更新
        this.socket.on('strategy:status-update', (data) => {
            console.log('📈 收到策略状态更新:', data);
            this.handleStrategyStatusUpdate(data);
        });

        // 连接错误
        this.socket.on('connect_error', (error) => {
            console.error('❌ Socket.IO连接错误:', error);
            this.reconnectAttempts++;
            this.updateConnectionStatus('error', `连接错误 (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
        });

        // 重连
        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`🔄 Socket.IO重连成功 (第${attemptNumber}次尝试)`);
            this.isConnected = true;
            this.updateConnectionStatus('reconnected', '重连成功');
        });

        // 重连失败
        this.socket.on('reconnect_failed', () => {
            console.error('❌ Socket.IO重连失败');
            this.updateConnectionStatus('failed', '重连失败');
        });
    }

    /**
     * 请求策略列表
     */
    async requestStrategyList() {
        try {
            console.log('🔄 开始请求策略列表...');

            const response = await fetch('/api/strategy/list');
            console.log('📡 API响应状态:', response.status, response.statusText);

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            console.log('📊 API返回数据:', result);

            if (result.success && result.data) {
                // 过滤连锁头寸策略
                const chainPositionStrategies = result.data.filter(s => s.type === 'chain_position');
                console.log('🔍 过滤后的连锁头寸策略:', chainPositionStrategies);

                // 🔧 统一策略ID字段：后端返回的是id，前端统一使用instanceId
                chainPositionStrategies.forEach(strategy => {
                    if (strategy.id && !strategy.instanceId) {
                        strategy.instanceId = strategy.id;
                    }
                });

                // 更新策略数据
                const oldCount = this.strategies.size;
                this.strategies.clear();
                chainPositionStrategies.forEach(strategy => {
                    this.strategies.set(strategy.instanceId, strategy);
                });

                console.log(`📊 策略列表更新: ${oldCount} → ${chainPositionStrategies.length} 个连锁头寸策略`);
                this.renderStrategies();
                this.updateActiveCount();

                // 显示成功通知
                if (chainPositionStrategies.length > oldCount) {
                    this.showTemporaryNotification(`发现 ${chainPositionStrategies.length - oldCount} 个新策略`, 'success');
                } else if (chainPositionStrategies.length !== oldCount) {
                    this.showTemporaryNotification('策略列表已更新', 'info');
                }
            } else {
                console.warn('⚠️ API返回格式异常:', result);
                this.showTemporaryNotification('获取策略列表失败', 'error');
            }
        } catch (error) {
            console.error('❌ 获取策略列表失败:', error);
            this.showTemporaryNotification(`刷新失败: ${error.message}`, 'error');
        }
    }

    /**
     * 处理智能止损数据更新
     */
    handleSmartStopLossUpdate(socketData) {
        try {
            const { data } = socketData;
            if (!data || !data.instanceId) {
                console.warn('⚠️ 智能止损数据格式不正确:', socketData);
                return;
            }

            const { instanceId, marketData, stopLossDecision } = data;

            // 🔧 防重复更新：检查数据时间戳
            const strategy = this.strategies.get(instanceId);
            if (strategy) {
                // 如果数据时间戳相同或更旧，跳过更新
                const lastUpdateTime = marketData.lastUpdateTime || 0;
                if (strategy.lastDataUpdateTime && lastUpdateTime <= strategy.lastDataUpdateTime) {
                    console.log(`⏭️ 跳过重复数据更新: ${instanceId} (时间戳: ${lastUpdateTime})`);
                    return;
                }

                // 更新策略数据
                strategy.marketData = { ...strategy.marketData, ...marketData };
                strategy.stopLossDecision = stopLossDecision;
                strategy.lastUpdate = Date.now();
                strategy.lastDataUpdateTime = lastUpdateTime;

                console.log(`📊 更新策略 ${instanceId} 的实时数据`, {
                    positionValue: this.formatCurrency(marketData.positionValue),
                    activeBin: marketData.activeBin,
                    // 🔥 新增：检查头寸边界数据
                    positionLowerBin: marketData.positionLowerBin,
                    positionUpperBin: marketData.positionUpperBin
                });
                this.updateStrategyCard(instanceId, data);
            } else {
                console.warn(`⚠️ 未找到策略: ${instanceId}`);
            }

            this.lastUpdateTime = Date.now();
            this.updateLastUpdateTime();

        } catch (error) {
            console.error('❌ 处理智能止损数据失败:', error);
        }
    }

    /**
     * 处理策略状态更新
     */
    handleStrategyStatusUpdate(socketData) {
        try {
            const { data } = socketData;
            if (!data || !data.instanceId) {
                console.warn('⚠️ 策略状态数据格式不正确:', socketData);
                return;
            }

            const { instanceId, status } = data;

            // 更新策略状态
            const strategy = this.strategies.get(instanceId);
            if (strategy) {
                const oldStatus = strategy.status;
                strategy.status = status;
                strategy.lastUpdate = Date.now();

                console.log(`📈 更新策略 ${instanceId} 状态: ${oldStatus} → ${status}`);
                this.updateStrategyStatus(instanceId, status);

                // 🎯 如果状态在运行/停止之间切换，重新排序整个列表
                const isStatusChangeSignificant =
                    (oldStatus === 'running' && status !== 'running') ||
                    (oldStatus !== 'running' && status === 'running');

                if (isStatusChangeSignificant) {
                    console.log(`🔄 状态变化需要重新排序: ${oldStatus} → ${status}`);
                    this.renderStrategies(); // 重新渲染整个列表以应用新的排序
                }
            }

        } catch (error) {
            console.error('❌ 处理策略状态更新失败:', error);
        }
    }

    /**
     * 渲染UI
     */
    render() {
        if (!this.container) {
            console.error('❌ 策略监控器容器不存在');
            return;
        }

        this.container.innerHTML = `
            <div class="strategy-monitor">
                <!-- 监控头部 -->
                <div class="monitor-header">
                    <div class="header-left">
                        <h3>
                            <span class="icon">📊</span>
                            策略监控
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

        this.bindEvents();
        this.isRendered = true;
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

                // 添加视觉反馈
                refreshBtn.disabled = true;
                const originalText = refreshBtn.innerHTML;
                refreshBtn.innerHTML = '<span class="icon">⏳</span>刷新中...';

                this.requestStrategyList().finally(() => {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = originalText;
                });
            });
        } else {
            console.warn('⚠️ 未找到刷新按钮元素');
        }

        // 重连按钮
        const reconnectBtn = document.getElementById('reconnectBtn');
        if (reconnectBtn) {
            reconnectBtn.addEventListener('click', () => {
                this.reconnect();
            });
        }

        // 🔧 策略操作按钮事件委托
        this.container.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                e.preventDefault();
                e.stopPropagation();

                const action = actionBtn.dataset.action;
                const strategyId = actionBtn.dataset.strategyId;

                // 🔧 调试信息
                console.log(`🔍 按钮点击调试信息:`, {
                    action,
                    strategyId,
                    buttonElement: actionBtn,
                    allDatasets: actionBtn.dataset
                });

                if (action && strategyId) {
                    this.handleStrategyAction(action, strategyId, actionBtn);
                } else {
                    console.error('❌ 缺少必要的按钮参数:', { action, strategyId });
                    this.showNotification('操作失败: 缺少策略ID或操作类型', 'error');
                }
                return;
            }

            // 🔧 池地址复制事件
            const poolAddressElement = e.target.closest('.pool-address-copy');
            if (poolAddressElement) {
                this.copyPoolAddress(e);
                return;
            }
        });
    }

    /**
     * 处理策略操作
     */
    async handleStrategyAction(action, strategyId, buttonElement) {
        console.log(`🎯 执行策略操作: ${action} for ${strategyId}`);

        // 防止重复点击
        if (buttonElement.disabled) return;
        buttonElement.disabled = true;

        try {
            switch (action) {
                case 'pause':
                    await this.pauseStrategy(strategyId);
                    break;
                case 'start':
                    await this.startStrategy(strategyId);
                    break;
                case 'stop':
                    await this.stopStrategy(strategyId);
                    break;
                case 'delete':
                    await this.deleteStrategy(strategyId);
                    break;
                case 'manual-stop-loss':
                    await this.executeManualStopLoss(strategyId);
                    break;
                case 'view-config':
                    this.showStrategyConfigModal(strategyId);
                    break;
                case 'edit-config':
                    this.showEditConfigModal(strategyId);
                    break;
                default:
                    console.warn(`未知操作: ${action}`);
            }
        } catch (error) {
            console.error(`❌ 策略操作失败 (${action}):`, error);
            this.showNotification(`操作失败: ${error.message}`, 'error');
        } finally {
            buttonElement.disabled = false;
        }
    }

    /**
     * 暂停策略
     */
    async pauseStrategy(strategyId) {
        try {
            console.log(`🔄 正在暂停策略: ${strategyId}`);
            const response = await fetch(`/api/strategy/${strategyId}/pause`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            console.log(`📊 暂停API响应:`, result);

            if (result.success) {
                this.showNotification('策略已暂停', 'success');
                this.updateStrategyInList(strategyId, { status: 'paused' });
                // 刷新列表以获取最新状态
                setTimeout(() => this.requestStrategyList(), 1000);
            } else {
                throw new Error(result.error || '暂停失败');
            }
        } catch (error) {
            console.error(`❌ 暂停策略失败:`, error);
            throw error;
        }
    }

    /**
     * 启动策略
     */
    async startStrategy(strategyId) {
        try {
            console.log(`🔄 正在启动策略: ${strategyId}`);
            const response = await fetch(`/api/strategy/${strategyId}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            console.log(`📊 启动API响应:`, result);

            if (result.success) {
                this.showNotification('策略已启动', 'success');
                this.updateStrategyInList(strategyId, { status: 'running' });
                // 刷新列表以获取最新状态
                setTimeout(() => this.requestStrategyList(), 1000);
            } else {
                // 🔧 更详细的错误处理
                let errorMessage = result.error || '启动失败';
                if (errorMessage.includes('钱包未解锁')) {
                    errorMessage = '启动失败: 钱包未解锁，请先解锁钱包';
                } else if (errorMessage.includes('交易失败')) {
                    errorMessage = '启动失败: 交易执行失败，请检查网络和余额';
                } else if (errorMessage.includes('连锁头寸创建失败')) {
                    errorMessage = '启动失败: 连锁头寸创建失败，请检查配置';
                }
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error(`❌ 启动策略失败:`, error);
            throw error;
        }
    }

    /**
     * 停止策略
     */
    async stopStrategy(strategyId) {
        if (!confirm('确定要停止此策略吗？停止后策略将不再监控市场变化。')) {
            return;
        }

        try {
            console.log(`🔄 正在停止策略: ${strategyId}`);
            const response = await fetch(`/api/strategy/${strategyId}/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            console.log(`📊 停止API响应:`, result);

            if (result.success) {
                this.showNotification('策略已停止', 'warning');
                this.updateStrategyInList(strategyId, { status: 'stopped' });
                // 刷新列表以获取最新状态
                setTimeout(() => this.requestStrategyList(), 1000);
            } else {
                throw new Error(result.error || '停止失败');
            }
        } catch (error) {
            console.error(`❌ 停止策略失败:`, error);
            throw error;
        }
    }

    /**
     * 删除策略
     */
    async deleteStrategy(strategyId) {
        if (!confirm('确定要删除此策略吗？此操作不可撤销，相关头寸需要手动处理。')) {
            return;
        }

        try {
            console.log(`🔄 正在删除策略: ${strategyId}`);
            const response = await fetch(`/api/strategy/${strategyId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            console.log(`📊 删除API响应:`, result);

            if (result.success) {
                this.showNotification('策略已删除', 'info');
                this.removeStrategyFromList(strategyId);
                // 刷新列表以确保同步
                setTimeout(() => this.requestStrategyList(), 1000);
            } else {
                throw new Error(result.error || '删除失败');
            }
        } catch (error) {
            console.error(`❌ 删除策略失败:`, error);
            throw error;
        }
    }

    /**
     * 🛑 执行手动止损
     */
    async executeManualStopLoss(strategyId) {
        if (!confirm('确定要执行手动止损吗？\n\n此操作将：\n1. 关闭所有头寸\n2. 卖出所有X代币为Y代币\n3. 停止策略监控\n\n此操作不可撤销！')) {
            return;
        }

        try {
            console.log(`🛑 正在执行手动止损: ${strategyId}`);
            const response = await fetch(`/api/strategy/${strategyId}/manual-stop-loss`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            console.log(`📊 手动止损API响应:`, result);

            if (result.success) {
                this.showNotification('手动止损执行成功', 'success');
                this.updateStrategyInList(strategyId, { status: 'stopped' });
                // 刷新列表以获取最新状态
                setTimeout(() => this.requestStrategyList(), 2000);
            } else {
                throw new Error(result.error || '手动止损执行失败');
            }
        } catch (error) {
            console.error(`❌ 手动止损执行失败:`, error);
            throw error;
        }
    }



    /**
     * 更新策略列表中的策略
     */
    updateStrategyInList(strategyId, updates) {
        const strategy = this.strategies.get(strategyId);
        if (strategy) {
            const oldStatus = strategy.status;
            Object.assign(strategy, updates);
            this.strategies.set(strategyId, strategy);

            // 🎯 如果状态在运行/停止之间切换，重新排序整个列表
            const newStatus = updates.status;
            const isStatusChangeSignificant = newStatus && (
                (oldStatus === 'running' && newStatus !== 'running') ||
                (oldStatus !== 'running' && newStatus === 'running')
            );

            if (isStatusChangeSignificant) {
                console.log(`🔄 手动操作状态变化需要重新排序: ${oldStatus} → ${newStatus}`);
                this.renderStrategies(); // 重新渲染整个列表以应用新的排序
            } else {
                // 只是数据更新，重新渲染单个卡片
                this.renderSingleStrategyCard(strategyId);
            }
        }
    }

    /**
     * 从列表中移除策略
     */
    removeStrategyFromList(strategyId) {
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
     * 显示通知消息
     */
    showNotification(message, type = 'info') {
        // 🔧 优先使用全局通知系统
        if (window.dlmmApp && window.dlmmApp.notification) {
            const notificationMethods = {
                'success': 'showSuccess',
                'error': 'showError',
                'warning': 'showWarning',
                'info': 'showInfo'
            };

            const method = notificationMethods[type] || 'showInfo';
            window.dlmmApp.notification[method]('策略操作', message);
        } else {
            // 🔧 备用通知机制 - 创建临时通知
            this.showTemporaryNotification(message, type);
        }

        // 🔧 同时在控制台记录
        const logMethod = type === 'error' ? 'error' : 'log';
        console[logMethod](`[策略操作] ${message}`);
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

        // 🎯 智能排序：运行中的策略优先，然后按创建时间排序
        const sortedStrategies = this.sortStrategiesWithRunningPriority(strategies);

        grid.innerHTML = sortedStrategies.map(strategy => this.renderStrategyCard(strategy)).join('');
        this.updateActiveCount();

        // 🔧 调试：检查渲染后的按钮是否正确
        setTimeout(() => {
            const cards = grid.querySelectorAll('.strategy-card');
            console.log(`🔍 渲染调试信息:`, {
                strategiesCount: strategies.length,
                cardsCount: cards.length,
                strategiesData: strategies.map(s => ({ id: s.id, instanceId: s.instanceId, name: s.name }))
            });

            cards.forEach((card, index) => {
                const strategyId = card.dataset.strategyId;
                const deleteBtn = card.querySelector('[data-action="delete"]');
                const deleteStrategyId = deleteBtn ? deleteBtn.dataset.strategyId : 'NOT_FOUND';

                console.log(`🔍 卡片 ${index + 1} 调试:`, {
                    cardStrategyId: strategyId,
                    deleteButtonStrategyId: deleteStrategyId,
                    deleteButtonExists: !!deleteBtn,
                    allButtons: Array.from(card.querySelectorAll('[data-action]')).map(btn => ({
                        action: btn.dataset.action,
                        strategyId: btn.dataset.strategyId
                    }))
                });
            });
        }, 100);
    }

    /**
     * 🎯 策略智能排序：运行中的策略优先，然后按创建时间排序
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

        // 🔥 新增：计算活跃BIN百分比（初始渲染）
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

        // 🔧 根据策略状态决定操作按钮显示
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
                        
                        <!-- 🔥 新增：手续费信息（上下两行显示） -->
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

                    <!-- 🔥 新增：历史价格变化数据 -->
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

                        <!-- 🆕 基准收益率数据 -->
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

                    <!-- 📊 策略详细信息 -->
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
     * 更新策略卡片
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

        // 🔥 新增：计算并更新活跃BIN百分比
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

        // 🔥 新增：更新历史价格变化数据
        if (marketData.historicalPriceChanges) {
            this.updateHistoricalPriceChanges(card, marketData.historicalPriceChanges);
        }

        // 🔥 新增：更新历史收益率数据
        if (marketData.historicalYieldRates) {
            this.updateHistoricalYieldRates(card, marketData.historicalYieldRates);
        }

        // 🆕 新增：更新基准收益率数据
        if (marketData.benchmarkYieldRates) {
            this.updateBenchmarkYieldRates(card, marketData.benchmarkYieldRates);
        }

        // 🔥 新增：更新动态重建开关状态
        if (marketData.dynamicRecreationSwitchEnabled !== undefined) {
            this.updateDynamicRecreationSwitchStatus(card, marketData.dynamicRecreationSwitchEnabled);
        }

        // 🔥 新增：更新手续费数据
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

        // 🔥 新增：保存数据到IndexedDB供数据分析模块使用
        this.saveDataToStorage(instanceId, marketData);

        console.log(`✅ 策略卡片 ${instanceId} 更新完成`, {
            // 🔥 新增：历史数据日志
            historicalPriceChanges: marketData.historicalPriceChanges,
            historicalYieldRates: marketData.historicalYieldRates ? {
                feeYieldEfficiency: marketData.historicalYieldRates.feeYieldEfficiency
            } : null,
            // 🆕 新增：基准收益率日志
            benchmarkYieldRates: marketData.benchmarkYieldRates ? {
                current5MinuteBenchmark: marketData.benchmarkYieldRates.current5MinuteBenchmark,
                average5MinuteBenchmark: marketData.benchmarkYieldRates.average5MinuteBenchmark,
                average15MinuteBenchmark: marketData.benchmarkYieldRates.average15MinuteBenchmark,
                average30MinuteBenchmark: marketData.benchmarkYieldRates.average30MinuteBenchmark
            } : null,
            // 🔥 新增：活跃BIN数据日志
            binData: {
                activeBin: marketData.activeBin,
                positionLowerBin: marketData.positionLowerBin,
                positionUpperBin: marketData.positionUpperBin,
                percentage: marketData.activeBin !== undefined &&
                    marketData.positionLowerBin !== undefined &&
                    marketData.positionUpperBin !== undefined ?
                    this.calculateActiveBinPercentage(
                        marketData.activeBin,
                        marketData.positionLowerBin,
                        marketData.positionUpperBin,
                        instanceId
                    ) : '--'
            }
        });
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
     * 🔥 新增：保存策略数据到IndexedDB
     * @param {string} instanceId 策略实例ID
     * @param {object} marketData 市场数据
     */
    async saveDataToStorage(instanceId, marketData) {
        if (!this.dataStorage) {
            console.warn('⚠️ 数据存储服务未初始化，跳过保存');
            return;
        }

        try {
            await this.dataStorage.saveDataPoint(instanceId, marketData);
        } catch (error) {
            console.error(`❌ 保存策略数据失败 (${instanceId}):`, error);
        }
    }

    /**
     * 🔥 新增：计算活跃BIN在头寸范围内的百分比位置
     */
    calculateActiveBinPercentage(activeBin, positionLowerBin, positionUpperBin, instanceId) {
        try {
            // 🔧 修复：strategies是Map，不是数组
            let strategy = null;
            if (this.strategies instanceof Map) {
                strategy = this.strategies.get(instanceId);
            } else if (Array.isArray(this.strategies)) {
                strategy = this.strategies.find(s => s.instanceId === instanceId);
            } else {
                console.warn(`⚠️ strategies数据结构异常:`, typeof this.strategies);
                return '--';
            }

            if (!strategy) {
                console.warn(`⚠️ 未找到策略实例: ${instanceId}`);
                return '--';
            }

            // 根据策略类型确定总BIN数量
            let totalBins;
            if (strategy.type === 'chain_position') {
                totalBins = 138; // 连锁头寸：138个BIN
            } else if (strategy.type === 'simple_y') {
                totalBins = 69;  // 单个Y头寸：69个BIN
            } else {
                console.warn(`⚠️ 未知策略类型: ${strategy.type}`);
                return '--';
            }

            // 计算实际头寸范围
            const actualRange = positionUpperBin - positionLowerBin + 1;

            // 🔥 添加调试信息
            console.log(`🔍 活跃BIN百分比计算:`, {
                instanceId,
                strategyType: strategy.type,
                activeBin,
                positionLowerBin,
                positionUpperBin,
                actualRange,
                totalBins
            });

            // 如果活跃BIN在头寸范围内
            if (activeBin >= positionLowerBin && activeBin <= positionUpperBin) {
                // 计算活跃BIN在头寸范围内的位置（从下边界开始）
                const binPositionInRange = activeBin - positionLowerBin;

                // 将头寸范围映射到100%
                const percentage = (binPositionInRange / (actualRange - 1)) * 100;

                console.log(`✅ 活跃BIN在范围内:`, {
                    binPositionInRange,
                    percentage: percentage.toFixed(1) + '%'
                });

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

    // 🔥 新增：更新历史价格变化显示
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

    // 🔥 新增：更新历史收益率显示
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

    // 🆕 新增：更新基准收益率显示
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
     * 更新策略状态
     */
    updateStrategyStatus(instanceId, status) {
        const card = document.querySelector(`[data-strategy-id="${instanceId}"]`);
        if (!card) return;

        const statusBadge = card.querySelector('.status-badge');
        if (statusBadge) {
            statusBadge.className = `status-badge ${this.getStatusClass(status)}`;
            statusBadge.textContent = this.getStatusText(status);
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
     * 重连
     */
    reconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this.reconnectAttempts = 0;
        this.connect();
    }

    /**
     * 生成客户端ID
     */
    generateClientId() {
        return 'monitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
                // 重新格式化时间（因为时间在变化）
                const timestamp = timeElement.getAttribute('data-timestamp');
                if (timestamp) {
                    timeElement.textContent = this.formatTime(parseInt(timestamp));
                }
            }
        });
    }

    /**
     * 工具方法
     */
    formatCurrency(amount) {
        if (typeof amount !== 'number') return '$0.00000000';

        // 🔧 修改：统一使用8位小数显示，提供更高精度
        return '$' + amount.toFixed(8);
    }

    formatPercent(value) {
        if (typeof value !== 'number') return '0.00%';
        return value.toFixed(2) + '%';
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

    getStatusClass(status) {
        switch (status) {
            case 'running': return 'success';
            case 'paused': return 'warning';
            case 'stopped': return 'danger';
            case 'error': return 'error';
            default: return 'secondary';
        }
    }

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
     * 销毁监控器
     */
    destroy() {
        if (this.socket) {
            this.socket.disconnect();
        }

        // 清理时间更新定时器
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }

        // 清理EventBus监听
        if (this.eventBus) {
            this.eventBus.off('strategy:created');
            this.eventBus.off('strategy:deleted');
        }

        if (this.container) {
            this.container.innerHTML = '';
        }
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

                // 临时显示完整地址
                const originalText = element.textContent;
                element.textContent = fullAddress;
                element.style.fontSize = '10px';

                setTimeout(() => {
                    element.textContent = originalText;
                    element.style.fontSize = '';
                }, 2000);

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

                // 临时显示完整地址
                const originalText = element.textContent;
                element.textContent = text;
                element.style.fontSize = '10px';

                setTimeout(() => {
                    element.textContent = originalText;
                    element.style.fontSize = '';
                }, 2000);
            } else {
                throw new Error('execCommand copy failed');
            }
        } catch (err) {
            console.error('降级复制失败:', err);
            this.showTemporaryNotification('复制失败，请手动复制', 'error');

            // 最后的降级方案：显示完整地址供用户手动复制
            const originalText = element.textContent;
            element.textContent = text;
            element.style.fontSize = '10px';
            element.style.userSelect = 'all';

            setTimeout(() => {
                element.textContent = originalText;
                element.style.fontSize = '';
                element.style.userSelect = '';
            }, 5000);
        }
    }

    /**
     * 🔧 测试API连接和按钮功能
     */
    async testAPIConnection() {
        try {
            console.log('🧪 开始测试API连接...');

            // 测试策略列表API
            const response = await fetch('/api/strategy/list');
            const result = await response.json();

            if (result.success) {
                console.log('✅ API连接正常，策略数量:', result.data.length);
                this.showNotification(`API测试成功，找到 ${result.data.length} 个策略`, 'success');
                return true;
            } else {
                console.error('❌ API返回错误:', result.error);
                this.showNotification('API测试失败: ' + result.error, 'error');
                return false;
            }
        } catch (error) {
            console.error('❌ API连接测试失败:', error);
            this.showNotification('API连接失败: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * 显示策略配置弹窗
     */
    showStrategyConfigModal(strategyId) {
        const strategy = this.strategies.get(strategyId);
        if (!strategy) {
            this.showNotification('策略不存在', 'error');
            return;
        }

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

        // 添加样式
        if (!document.getElementById('config-modal-styles')) {
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
            `;
            document.head.appendChild(style);
        }

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
                <span class="config-value">${config.yieldExtractionTimeLock || 3}分钟</span>
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
    showEditConfigModal(strategyId) {
        const strategy = this.strategies.get(strategyId);
        if (!strategy) {
            this.showNotification('策略不存在', 'error');
            return;
        }

        if (strategy.status !== 'stopped') {
            this.showNotification('只能编辑已停止的策略配置', 'warning');
            return;
        }

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
                            <input type="number" name="yieldExtractionTimeLock" value="${config.yieldExtractionTimeLock || 3}" min="1" max="120" step="1">
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
                        <div class="form-group checkbox-group">
                            <label>
                                <input type="checkbox" name="enableSmartStopLoss" ${config.enableSmartStopLoss ? 'checked' : ''}>
                                启用智能止损
                            </label>
                        </div>
                        <div class="smart-stop-loss-config" style="display: ${config.enableSmartStopLoss ? 'block' : 'none'}">
                            <div class="form-group">
                                <label>活跃Bin位置安全阈值 (%):</label>
                                <input type="number" name="activeBinSafetyThreshold" value="${config.stopLoss?.activeBinSafetyThreshold || 50}" min="1" max="100">
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
                        
                        <!-- 🏗️ 头寸重建配置表单 -->
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
                    </form>
                </div>
            </div>
        `;

        // 添加样式
        if (!document.getElementById('edit-config-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'edit-config-modal-styles';
            style.textContent = `
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
                
                .config-section-title {
                    font-size: 16px; font-weight: 600; color: var(--primary-color);
                    margin: 24px 0 16px 0; padding-bottom: 8px;
                    border-bottom: 1px solid var(--border-color);
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

        // 事件处理
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
        smartStopLossCheckbox.addEventListener('change', () => {
            smartStopLossConfig.style.display = smartStopLossCheckbox.checked ? 'block' : 'none';
        });

        // 智能头寸重建开关切换
        marketOpportunityCheckbox.addEventListener('change', () => {
            marketOpportunityConfig.style.display = marketOpportunityCheckbox.checked ? 'block' : 'none';
        });

        // 止损后反弹重建开关切换
        lossRecoveryCheckbox.addEventListener('change', () => {
            lossRecoveryConfig.style.display = lossRecoveryCheckbox.checked ? 'block' : 'none';
        });

        // 动态盈利阈值重建开关切换
        dynamicProfitCheckbox.addEventListener('change', () => {
            dynamicProfitConfig.style.display = dynamicProfitCheckbox.checked ? 'block' : 'none';
        });

        // 关闭弹窗
        const closeModal = () => document.body.removeChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        // 表单提交
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleConfigSave(strategyId, form, modal);
        });

        document.body.appendChild(modal);
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
            const config = {
                poolAddress: formData.get('poolAddress'),
                positionAmount: parseFloat(formData.get('positionAmount')),
                monitoringInterval: parseInt(formData.get('monitoringInterval')),
                outOfRangeTimeout: parseInt(formData.get('outOfRangeTimeout')),
                yieldExtractionThreshold: parseFloat(formData.get('yieldExtractionThreshold')) || 0.1,
                yieldExtractionTimeLock: parseInt(formData.get('yieldExtractionTimeLock')) || 3,
                slippageBps: parseInt(formData.get('slippageBps')) || 1000,
                maxPriceForRecreation: formData.get('maxPriceForRecreation') ? parseFloat(formData.get('maxPriceForRecreation')) : 0,
                minPriceForRecreation: formData.get('minPriceForRecreation') ? parseFloat(formData.get('minPriceForRecreation')) : 0,
                enableSmartStopLoss: formData.get('enableSmartStopLoss') === 'on'
            };

            // 添加智能止损配置
            if (config.enableSmartStopLoss) {
                config.stopLoss = {
                    activeBinSafetyThreshold: parseInt(formData.get('activeBinSafetyThreshold')) || 50,
                    observationPeriodMinutes: parseInt(formData.get('observationPeriodMinutes')) || 15,
                    lossThresholdPercentage: parseFloat(formData.get('lossThresholdPercentage')) || 5
                };
            } else {
                config.stopLoss = null;
            }

            // 🏗️ 添加头寸重建配置
            const enableMarketOpportunity = formData.get('enableMarketOpportunityRecreation') === 'on';
            const enableLossRecovery = formData.get('enableLossRecoveryRecreation') === 'on';
            const enableDynamicProfit = formData.get('enableDynamicProfitRecreation') === 'on';

            if (enableMarketOpportunity || enableLossRecovery || enableDynamicProfit) {
                config.positionRecreation = {
                    enableMarketOpportunityRecreation: enableMarketOpportunity,
                    enableLossRecoveryRecreation: enableLossRecovery,
                    enableDynamicProfitRecreation: enableDynamicProfit
                };

                // 方法2：智能头寸重建配置
                if (enableMarketOpportunity) {
                    config.positionRecreation.marketOpportunity = {
                        positionThreshold: parseInt(formData.get('marketOpportunityPositionThreshold')) || 70,
                        profitThreshold: parseFloat(formData.get('marketOpportunityProfitThreshold')) || 1
                    };
                }

                // 方法3：止损后反弹重建配置
                if (enableLossRecovery) {
                    config.positionRecreation.lossRecovery = {
                        markPositionThreshold: parseInt(formData.get('lossRecoveryMarkPositionThreshold')) || 65,
                        markLossThreshold: parseFloat(formData.get('lossRecoveryMarkLossThreshold')) || 0.5,
                        triggerPositionThreshold: parseInt(formData.get('lossRecoveryTriggerPositionThreshold')) || 70,
                        triggerProfitThreshold: parseFloat(formData.get('lossRecoveryTriggerProfitThreshold')) || 0.5
                    };
                }

                // 方法4：动态盈利阈值重建配置
                if (enableDynamicProfit) {
                    config.positionRecreation.dynamicProfitRecreation = {
                        positionThreshold: parseInt(formData.get('dynamicProfitPositionThreshold')) || 70,
                        benchmarkTier1Max: parseFloat(formData.get('dynamicProfitBenchmarkTier1Max')) || 0.5,
                        benchmarkTier2Max: parseFloat(formData.get('dynamicProfitBenchmarkTier2Max')) || 1.5,
                        benchmarkTier3Max: parseFloat(formData.get('dynamicProfitBenchmarkTier3Max')) || 3.0,
                        benchmarkTier4Max: parseFloat(formData.get('dynamicProfitBenchmarkTier4Max')) || 999,
                        profitThresholdTier1: parseFloat(formData.get('dynamicProfitProfitThresholdTier1')) || 0.5,
                        profitThresholdTier2: parseFloat(formData.get('dynamicProfitProfitThresholdTier2')) || 1.5,
                        profitThresholdTier3: parseFloat(formData.get('dynamicProfitProfitThresholdTier3')) || 3.0,
                        profitThresholdTier4: parseFloat(formData.get('dynamicProfitProfitThresholdTier4')) || 5.0
                    };
                }
            }

            console.log('📝 保存策略配置:', config);

            const response = await fetch(`/api/strategy/${strategyId}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('配置保存成功', 'success');
                document.body.removeChild(modal);

                // 更新本地策略数据
                const strategy = this.strategies.get(strategyId);
                if (strategy) {
                    strategy.config = { ...strategy.config, ...config };
                    this.strategies.set(strategyId, strategy);
                }

                // 刷新策略列表
                setTimeout(() => this.requestStrategyList(), 1000);
            } else {
                throw new Error(result.error || '保存失败');
            }
        } catch (error) {
            console.error('❌ 保存配置失败:', error);
            this.showNotification(`保存失败: ${error.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    /**
     * 🔧 调试信息
     */
    getDebugInfo() {
        return {
            isConnected: this.isConnected,
            strategiesCount: this.strategies.size,
            strategies: Array.from(this.strategies.values()),
            lastUpdateTime: this.lastUpdateTime,
            socketConnected: this.socket?.connected || false
        };
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StrategyMonitor;
} else if (typeof window !== 'undefined') {
    window.StrategyMonitor = StrategyMonitor;
} 