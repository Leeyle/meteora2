/**
 * 🏊 池爬虫监控组件
 * 专门用于监控池爬虫的运行状态和发现的池数据
 * 集成到现有的监控系统中
 */
class PoolCrawlerMonitor {
    constructor(containerId) {
        this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        this.socket = null;
        this.isConnected = false;
        this.autoReconnect = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 3000;
        this.reconnectTimer = null;
        this.lastUpdateTime = null;
        this.isPageVisible = true;
        this.visibilityChangeHandler = null;
        this.statusUpdateTimer = null;
        this.statusPollingTimer = null; // 🔥 新增：API轮询定时器
        this.cleanupTimer = null; // 🔥 新增：数据清理定时器

        // 🔒 防重复操作保护标志
        this.isStarting = false;
        this.isPausing = false;
        this.isResuming = false;
        this.isStopping = false;
        this.isRefreshing = false;

        // 🌐 使用动态配置获取Socket URL
        this.socketUrl = window.dlmmConfig ? window.dlmmConfig.getWebSocketUrl() : `${window.location.protocol}//${window.location.host}`;

        // 🔧 既然后端已配置SSL证书，保持WSS协议不变
        console.log('🔗 PoolCrawler Socket URL:', this.socketUrl);

        // 组件状态
        this.isInitialized = false;
        this.crawlerStatus = {
            isRunning: false,
            poolsDiscovered: 0,
            qualifiedPools: 0,
            nextCrawlTime: null,
            lastCrawlTime: null,
            status: 'stopped'
        };

        // 数据存储
        this.discoveredPools = [];
        this.qualifiedPools = [];
        this.filters = {};
        this.errorHistory = [];

        // 🗃️ localStorage配置
        this.STORAGE_KEY_QUALIFIED = 'poolCrawler_qualifiedPools';
        this.STORAGE_KEY_SETTINGS = 'poolCrawler_settings'; // 🔔 新增：设置存储key
        this.DATA_RETENTION_HOURS = 24; // 保留24小时数据

        // 🔔 声音提醒配置
        this.soundEnabled = false; // 默认关闭声音
        this.audioContext = null; // Web Audio API上下文
        this.loadSoundSettings(); // 加载声音设置

        // 🔄 加载localStorage中的历史数据将在init()中DOM渲染完成后进行

        this.init();
    }

    /**
     * 初始化监控器
     */
    async init() {
        try {
            console.log('🏊 初始化池爬虫监控器');

            // 渲染UI
            this.render();

            // 🔄 加载localStorage中的历史数据（DOM渲染完成后）
            this.loadStoredData();

            // 🔥 加载保存的筛选器设置
            this.loadFiltersFromStorage();

            // 🔔 初始化声音设置UI
            this.initSoundUI();

            // 设置事件监听
            this.setupEventListeners();

            // 设置页面可见性监听
            this.setupVisibilityListener();

            // 🔥 启动Socket.IO连接用于数据推送
            await this.connect();

            // 🔥 启动API轮询用于状态更新
            this.startStatusPolling();

            // 🗃️ 启动定时清理过期数据（每小时清理一次）
            this.startPeriodicCleanup();

            this.isInitialized = true;
            console.log('✅ 池爬虫监控器初始化完成');

        } catch (error) {
            console.error('❌ 池爬虫监控器初始化失败:', error);
            this.showError('监控器初始化失败: ' + error.message);

            // Socket.IO连接失败时，仍然启动API轮询
            this.startStatusPolling();
            this.updateConnectionStatus('error', 'Socket.IO连接失败，仅API模式');
        }
    }

    /**
     * 加载Socket.IO库
     */
    async loadSocketIO() {
        return new Promise((resolve, reject) => {
            if (typeof io !== 'undefined') {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = '/socket.io/socket.io.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Socket.IO库加载失败'));
            document.head.appendChild(script);
        });
    }

    /**
     * 渲染UI
     */
    render() {
        if (!this.container) {
            console.error('❌ 池爬虫监控器容器不存在');
            return;
        }

        this.container.innerHTML = `
            <div class="pool-crawler-monitor">
                <!-- 监控头部 -->
                <div class="monitor-header">
                    <div class="header-left">
                        <h3>
                            <span class="icon">🏊</span>
                            池爬虫监控
                        </h3>
                        <div class="connection-status" id="crawlerConnectionStatus">
                            <span class="status-dot"></span>
                            <span class="status-text">未连接</span>
                        </div>
                    </div>
                    <div class="header-right">
                        <div class="crawler-stats">
                            <div class="stat-item">
                                <span class="stat-value" id="poolsDiscovered">0</span>
                                <span class="stat-label">已发现池</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value" id="qualifiedPools">0</span>
                                <span class="stat-label">合格池</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value" id="crawlerLastUpdate">--</span>
                                <span class="stat-label">最后更新</span>
                            </div>
                        </div>
                        <div class="monitor-actions">
                            <button class="btn btn-sm btn-primary" id="startCrawlerBtn">
                                <span class="icon">▶️</span>
                                启动爬虫
                            </button>
                            <button class="btn btn-sm btn-warning" id="pauseCrawlerBtn">
                                <span class="icon">⏸️</span>
                                暂停爬虫
                            </button>
                            <button class="btn btn-sm btn-success" id="resumeCrawlerBtn">
                                <span class="icon">▶️</span>
                                恢复爬虫
                            </button>
                            <button class="btn btn-sm btn-secondary" id="stopCrawlerBtn">
                                <span class="icon">⏹️</span>
                                停止爬虫
                            </button>
                            <button class="btn btn-sm btn-secondary" id="refreshCrawlerBtn">
                                <span class="icon">🔄</span>
                                刷新
                            </button>
                            <button class="btn btn-sm btn-secondary" id="configCrawlerBtn">
                                <span class="icon">⚙️</span>
                                配置
                            </button>
                            
                            <!-- 🔔 声音提醒开关 -->
                            <div class="sound-control">
                                <label class="sound-toggle">
                                    <input type="checkbox" id="soundToggle">
                                    <span class="sound-icon" id="soundIcon">🔇</span>
                                    <span class="sound-label">声音提醒</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 爬虫状态 -->
                <div class="crawler-status-section">
                    <div class="status-card">
                        <div class="status-header">
                            <h4>🔍 爬虫状态</h4>
                        </div>
                        <div class="status-content">
                            <div class="status-item">
                                <label>运行状态</label>
                                <span class="status-value" id="crawlerRunningStatus">已停止</span>
                            </div>
                            <div class="status-item">
                                <label>下次爬取</label>
                                <span class="status-value" id="nextCrawlTime">--</span>
                            </div>
                            <div class="status-item">
                                <label>上次爬取</label>
                                <span class="status-value" id="lastCrawlTime">--</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 池数据显示 -->
                <div class="pools-section">
                    <div class="section-tabs">
                        <button class="tab-btn active" data-tab="discovered">
                            <span class="icon">🔍</span>
                            发现的池
                        </button>
                        <button class="tab-btn" data-tab="qualified">
                            <span class="icon">✅</span>
                            合格池
                        </button>
                        <button class="tab-btn" data-tab="filters">
                            <span class="icon">⚙️</span>
                            过滤器
                        </button>
                    </div>

                    <!-- 发现的池 -->
                    <div class="tab-content active" id="discovered-tab">
                        <div class="pools-table-container">
                            <table class="pools-table">
                                <thead>
                                    <tr>
                                        <th>排名</th>
                                        <th>池地址</th>
                                        <th>代币对</th>
                                        <th>Bin Step</th>
                                        <th>Meteor Score</th>
                                        <th>TVL</th>
                                        <th>年龄</th>
                                        <th>FDV</th>
                                        <th>24h APR</th>
                                        <th>24h交易量</th>
                                        <th>发现时间</th>
                                    </tr>
                                </thead>
                                <tbody id="discoveredPoolsTable">
                                    <tr>
                                        <td colspan="11" class="empty-state">暂无发现的池</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 合格池 -->
                    <div class="tab-content" id="qualified-tab">
                        <div class="pools-table-container">
                            <table class="pools-table">
                                <thead>
                                    <tr>
                                        <th>排名</th>
                                        <th>池地址</th>
                                        <th>代币对</th>
                                        <th>Bin Step</th>
                                        <th>Meteor Score</th>
                                        <th>TVL</th>
                                        <th>年龄</th>
                                        <th>FDV</th>
                                        <th>24h APR</th>
                                        <th>24h交易量</th>
                                        <th>匹配条件</th>
                                        <th>接收时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody id="qualifiedPoolsTable">
                                    <tr>
                                        <td colspan="13" class="empty-state">暂无合格池</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 过滤器 -->
                    <div class="tab-content" id="filters-tab">
                        <div class="filters-container">
                            <!-- 基础过滤器 -->
                            <div class="filter-section filter-enabled">
                                <h5>🏆 Meteor Score过滤 <span class="filter-status">✅ 启用</span></h5>
                                <div class="filter-row">
                                    <div class="filter-item">
                                        <label>最小Score</label>
                                        <input type="number" id="minMeteorScore" placeholder="留空或输入整数" step="1">
                                    </div>
                                    <div class="filter-item">
                                        <label>最大Score</label>
                                        <input type="number" id="maxMeteorScore" placeholder="留空或输入整数" step="1">
                                    </div>
                                </div>
                            </div>

                            <div class="filter-section filter-enabled">
                                <h5>💧 TVL/流动性过滤 <span class="filter-status">✅ 启用</span></h5>
                                <div class="filter-row">
                                    <div class="filter-item">
                                        <label>最小TVL</label>
                                        <input type="number" id="minLiquidity" placeholder="留空使用默认值 1000">
                                    </div>
                                    <div class="filter-item">
                                        <label>最大TVL</label>
                                        <input type="number" id="maxLiquidity" placeholder="留空使用默认值 1000000">
                                    </div>
                                </div>
                            </div>

                            <div class="filter-section filter-enabled">
                                <h5>⏰ 池年龄过滤 <span class="filter-status">✅ 启用</span></h5>
                                <div class="filter-row">
                                    <div class="filter-item">
                                        <label>最小年龄(小时)</label>
                                        <input type="number" id="minAge" placeholder="1-24小时精确匹配，>24小时支持所有" min="1" step="1">
                                    </div>
                                    <div class="filter-item">
                                        <label>最大年龄(小时)</label>
                                        <input type="number" id="maxAge" placeholder="1-24小时精确匹配，>24小时支持所有" min="1" step="1">
                                    </div>
                                </div>
                            </div>

                            <div class="filter-section filter-enabled">
                                <h5>📈 FDV过滤 <span class="filter-status">✅ 启用</span></h5>
                                <div class="filter-row">
                                    <div class="filter-item">
                                        <label>最小FDV</label>
                                        <input type="number" id="minFdv" placeholder="输入数值(如：1000000表示1M)" min="0">
                                    </div>
                                    <div class="filter-item">
                                        <label>最大FDV</label>
                                        <input type="number" id="maxFdv" placeholder="输入数值(如：1000000000表示1B)" min="0">
                                    </div>
                                </div>
                            </div>

                            <!-- APR过滤器 -->
                            <div class="filter-section filter-partial">
                                <h5>💰 APR过滤 <span class="filter-status">⚠️ 部分支持</span></h5>
                                <div class="timeframe-filters">
                                    <div class="timeframe-group filter-enabled">
                                        <label>24小时APR (%) <span class="filter-status">✅ 启用</span></label>
                                        <div class="filter-row">
                                            <input type="number" id="minApr24h" placeholder="留空使用默认值 5">
                                            <span>-</span>
                                            <input type="number" id="maxApr24h" placeholder="留空使用默认值 1000">
                                        </div>
                                    </div>
                                    <div class="timeframe-group filter-disabled">
                                        <label>1小时APR (%) <span class="filter-status">🚫 暂不支持</span></label>
                                        <div class="filter-row">
                                            <input type="number" id="minApr1h" placeholder="此功能暂未开放" disabled>
                                            <span>-</span>
                                            <input type="number" id="maxApr1h" placeholder="此功能暂未开放" disabled>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 交易量过滤器 -->
                            <div class="filter-section filter-partial">
                                <h5>📊 交易量过滤 <span class="filter-status">⚠️ 部分支持</span></h5>
                                <div class="timeframe-filters">
                                    <div class="timeframe-group filter-enabled">
                                        <label>24小时交易量 <span class="filter-status">✅ 启用</span></label>
                                        <div class="filter-row">
                                            <input type="number" id="minVolume24h" placeholder="留空使用默认值 10000">
                                            <span>-</span>
                                            <input type="number" id="maxVolume24h" placeholder="留空使用默认值 100000000">
                                        </div>
                                    </div>
                                    <div class="timeframe-group filter-disabled">
                                        <label>1小时交易量 <span class="filter-status">🚫 暂不支持</span></label>
                                        <div class="filter-row">
                                            <input type="number" id="minVolume1h" placeholder="此功能暂未开放" disabled>
                                            <span>-</span>
                                            <input type="number" id="maxVolume1h" placeholder="此功能暂未开放" disabled>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 价格变化过滤器 -->
                            <div class="filter-section filter-disabled">
                                <h5>📈 价格变化过滤 <span class="filter-status">🚫 暂不支持</span></h5>
                                <div class="timeframe-filters">
                                    <div class="timeframe-group">
                                        <label>24小时价格变化 (%)</label>
                                        <div class="filter-row">
                                            <input type="number" id="minPriceChange24h" placeholder="此功能暂未开放" disabled>
                                            <span>-</span>
                                            <input type="number" id="maxPriceChange24h" placeholder="此功能暂未开放" disabled>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 代币过滤器 - 已禁用 -->
                            <div class="filter-section filter-disabled" style="display: none;">
                                <h5>🪙 代币过滤 <span class="filter-status">🚫 已禁用</span></h5>
                                <div class="filter-item">
                                    <label>代币白名单 (逗号分隔)</label>
                                    <input type="text" id="tokenWhitelist" placeholder="功能已禁用" disabled>
                                </div>
                                <div class="filter-item">
                                    <label>代币黑名单 (逗号分隔)</label>
                                    <input type="text" id="tokenBlacklist" placeholder="功能已禁用" disabled>
                                </div>
                            </div>

                            <div class="filter-actions">
                                <button class="btn btn-primary" id="applyFiltersBtn">应用过滤器</button>
                                <button class="btn btn-secondary" id="resetFiltersBtn">重置过滤器</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 通知区域 -->
                <div class="notification-area" id="notificationArea">
                    <!-- 通知将在这里显示 -->
                </div>
            </div>
        `;
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 爬虫控制按钮
        document.getElementById('startCrawlerBtn')?.addEventListener('click', () => this.startCrawler());
        document.getElementById('pauseCrawlerBtn')?.addEventListener('click', () => this.pauseCrawler());
        document.getElementById('resumeCrawlerBtn')?.addEventListener('click', () => this.resumeCrawler());
        document.getElementById('stopCrawlerBtn')?.addEventListener('click', () => this.stopCrawler());
        document.getElementById('refreshCrawlerBtn')?.addEventListener('click', () => this.refreshData());
        document.getElementById('configCrawlerBtn')?.addEventListener('click', () => this.showConfig());

        // 标签页切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // 过滤器操作
        document.getElementById('applyFiltersBtn')?.addEventListener('click', () => this.applyFilters());
        document.getElementById('resetFiltersBtn')?.addEventListener('click', () => this.resetFilters());

        // 🔔 声音开关事件
        document.getElementById('soundToggle')?.addEventListener('change', (e) => this.toggleSound(e.target.checked));

        // 池地址点击复制事件 - 使用事件委托
        if (this.container) {
            this.container.addEventListener('click', (e) => {
                console.log('🔍 点击事件:', e.target.className, e.target.dataset);

                if (e.target.classList.contains('pool-address-clickable')) {
                    e.preventDefault();
                    e.stopPropagation();

                    const address = e.target.getAttribute('data-address');
                    console.log('📋 尝试复制地址:', address);

                    if (address) {
                        this.copyAddress(address);
                    } else {
                        console.error('❌ 无法获取地址数据');
                        this.showNotification('error', '复制失败', '无法获取地址数据');
                    }
                }
            });
        }
    }

    /**
     * 设置页面可见性监听
     */
    setupVisibilityListener() {
        this.visibilityChangeHandler = () => {
            this.isPageVisible = !document.hidden;
            if (this.isPageVisible && this.socket?.connected) {
                this.refreshData();
            }
        };
        document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    }

    /**
     * 连接Socket.IO
     */
    async connect() {
        if (this.socket?.connected) return;

        try {
            // 加载Socket.IO库
            await this.loadSocketIO();

            return new Promise((resolve, reject) => {
                this.socket = io(this.socketUrl, {
                    transports: ['websocket', 'polling'],
                    timeout: 10000,
                    reconnection: true,
                    reconnectionAttempts: this.maxReconnectAttempts,
                    reconnectionDelay: this.reconnectInterval
                });

                // 设置连接成功回调
                this.socket.on('connect', () => {
                    console.log('✅ Socket.IO连接成功');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.updateConnectionStatus('connected', '已连接');

                    // 订阅池爬虫监控
                    this.socket.emit('subscribe:pool-crawler', {
                        clientId: this.generateClientId(),
                        timestamp: Date.now()
                    });

                    resolve();
                });

                // 设置连接失败回调
                this.socket.on('connect_error', (error) => {
                    console.error('❌ Socket.IO连接错误:', error);
                    this.reconnectAttempts++;
                    this.updateConnectionStatus('error', `连接错误 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    reject(error);
                });

                this.setupSocketEvents();
                console.log('🔌 正在连接Socket.IO...');

                // 设置连接超时
                setTimeout(() => {
                    if (!this.isConnected) {
                        reject(new Error('Socket.IO连接超时'));
                    }
                }, 10000);
            });

        } catch (error) {
            console.error('❌ Socket.IO连接失败:', error);
            this.showError('Socket.IO连接失败: ' + error.message);
            throw error;
        }
    }

    /**
     * 设置Socket.IO事件
     */
    setupSocketEvents() {
        // 连接断开
        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Socket.IO连接断开:', reason);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', '连接断开');

            if (this.autoReconnect && reason !== 'io client disconnect') {
                this.scheduleReconnect();
            }
        });

        // 订阅确认
        this.socket.on('subscribed:pool-crawler', (data) => {
            this.updateConnectionStatus('subscribed', '监控中');
        });

        // 池爬虫状态更新
        this.socket.on('pool-crawler:status-update', (data) => {
            this.handleStatusUpdate(data);
        });

        // 池发现通知
        this.socket.on('pool-crawler:pools-discovered', (data) => {
            this.handlePoolsDiscovered(data);
        });

        // 合格池通知
        this.socket.on('pool-crawler:pools-qualified', (data) => {
            this.handlePoolsQualified(data);
        });

        // 过滤器更新
        this.socket.on('pool-crawler:filters-updated', (data) => {
            this.handleFiltersUpdated(data);
        });

        // 错误通知
        this.socket.on('pool-crawler:error', (data) => {
            console.error('❌ 收到池爬虫错误:', data);
            this.handleCrawlerError(data);
        });

        // 命令响应
        this.socket.on('pool-crawler:command-response', (data) => {
            this.handleCommandResponse(data);
        });
    }

    /**
     * 生成客户端ID
     */
    generateClientId() {
        return `pool-crawler-monitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 更新连接状态
     */
    updateConnectionStatus(status, text) {
        const statusElement = document.getElementById('crawlerConnectionStatus');
        if (!statusElement) return;

        const statusDot = statusElement.querySelector('.status-dot');
        const statusText = statusElement.querySelector('.status-text');

        if (statusDot) {
            statusDot.className = `status-dot ${status}`;
        }
        if (statusText) {
            statusText.textContent = text;
        }
    }

    /**
     * 处理状态更新
     */
    handleStatusUpdate(eventData) {
        // 从Socket.IO事件中提取实际数据
        const data = eventData.data || eventData;

        this.crawlerStatus = { ...this.crawlerStatus, ...data };
        this.updateStatusDisplay();
        this.updateStatsDisplay();
        this.lastUpdateTime = Date.now();
    }

    /**
     * 处理池发现通知
     */
    handlePoolsDiscovered(eventData) {
        // 从Socket.IO事件中提取实际数据
        const data = eventData.data || eventData;

        if (data.pools && Array.isArray(data.pools)) {
            // 记录之前的发现池数量
            const previousCount = this.discoveredPools.length;

            // 为新发现的池数据添加时间戳
            const newPools = data.pools.map(pool => ({
                ...pool,
                scrapedAt: pool.scrapedAt || Date.now()
            }));

            // 检测新增的池（避免重复）
            let addedCount = 0;
            newPools.forEach(newPool => {
                const exists = this.discoveredPools.some(existingPool =>
                    existingPool.poolAddress === newPool.poolAddress
                );
                if (!exists) {
                    addedCount++;
                }
            });

            // 更新发现的池数据
            this.discoveredPools = newPools;

            // 🔔 声音提醒：只在有新数据且爬虫运行时提醒
            if (addedCount > 0 && this.crawlerStatus.isRunning && this.soundEnabled) {
                this.playNotificationSound();
                console.log(`🔔 发现池声音提醒: 新增 ${addedCount} 个池`);
            }

            // 更新界面
            this.updateDiscoveredPoolsTable();
        }
        this.showNotification('success', '发现新池', `发现了 ${data.pools?.length || 0} 个新池`);
    }

    /**
     * 处理合格池通知
     */
    handlePoolsQualified(eventData) {
        // 从Socket.IO事件中提取实际数据
        const data = eventData.data || eventData;

        if (data.pools && Array.isArray(data.pools)) {
            // 为新合格池数据添加时间戳
            const newPools = data.pools.map(pool => ({
                ...pool,
                discoveredAt: pool.discoveredAt || Date.now(),
                poolData: {
                    ...pool.poolData,
                    scrapedAt: pool.poolData?.scrapedAt || Date.now()
                }
            }));

            // 清理过期数据
            this.clearExpiredData();

            // 添加新数据（避免重复）
            let addedCount = 0;
            newPools.forEach(newPool => {
                const exists = this.qualifiedPools.some(existingPool =>
                    existingPool.id === newPool.id ||
                    existingPool.poolData?.poolAddress === newPool.poolData?.poolAddress
                );
                if (!exists) {
                    this.qualifiedPools.push(newPool);
                    addedCount++;
                }
            });

            // 🔔 声音提醒：只在有新数据且爬虫运行时提醒
            if (addedCount > 0 && this.crawlerStatus.isRunning && this.soundEnabled) {
                this.playNotificationSound();
            }

            // 保存到localStorage
            this.saveQualifiedPoolsToStorage();

            // 更新界面
            this.updateQualifiedPoolsTable();
        }
        this.showNotification('success', '合格池推荐', `发现了 ${data.pools?.length || 0} 个符合条件的池`);
    }

    /**
     * 处理过滤器更新
     */
    handleFiltersUpdated(eventData) {
        // 从Socket.IO事件中提取实际数据
        const data = eventData.data || eventData;

        this.filters = { ...this.filters, ...data.filters };
        this.updateFiltersDisplay();
        this.showNotification('info', '过滤器已更新', '过滤器配置已同步');
    }

    /**
     * 处理爬虫错误
     */
    handleCrawlerError(eventData) {
        // 从Socket.IO事件中提取实际数据
        const data = eventData.data || eventData;

        const error = {
            message: data.message || data.error || '未知错误',
            timestamp: Date.now(),
            type: data.type || 'unknown'
        };

        this.errorHistory.unshift(error);
        if (this.errorHistory.length > 100) {
            this.errorHistory = this.errorHistory.slice(0, 100);
        }

        this.showNotification('error', '爬虫错误', error.message);
    }

    /**
     * 处理命令响应
     */
    handleCommandResponse(data) {
        const { success, command, message } = data;

        if (success) {
            this.showNotification('success', `${command} 成功`, message);
        } else {
            this.showNotification('error', `${command} 失败`, message);
        }
    }

    /**
     * 更新状态显示
     */
    updateStatusDisplay() {
        const runningStatus = document.getElementById('crawlerRunningStatus');
        const nextCrawlTime = document.getElementById('nextCrawlTime');
        const lastCrawlTime = document.getElementById('lastCrawlTime');

        if (runningStatus) {
            runningStatus.textContent = this.crawlerStatus.isRunning ? '运行中' : '已停止';
            runningStatus.className = `status-value ${this.crawlerStatus.isRunning ? 'running' : 'stopped'}`;
        }

        if (nextCrawlTime) {
            nextCrawlTime.textContent = this.crawlerStatus.nextCrawlTime
                ? this.formatTime(this.crawlerStatus.nextCrawlTime)
                : '--';
        }

        if (lastCrawlTime) {
            lastCrawlTime.textContent = this.crawlerStatus.lastCrawlTime
                ? this.formatTime(this.crawlerStatus.lastCrawlTime)
                : '--';
        }
    }

    /**
     * 更新统计显示
     */
    updateStatsDisplay() {
        const poolsDiscovered = document.getElementById('poolsDiscovered');
        const qualifiedPools = document.getElementById('qualifiedPools');
        const lastUpdate = document.getElementById('crawlerLastUpdate');

        if (poolsDiscovered) {
            poolsDiscovered.textContent = this.crawlerStatus.poolsDiscovered || 0;
        }

        if (qualifiedPools) {
            qualifiedPools.textContent = this.crawlerStatus.qualifiedPools || 0;
        }

        if (lastUpdate) {
            lastUpdate.textContent = this.lastUpdateTime ? this.formatTime(this.lastUpdateTime) : '--';
        }
    }

    /**
     * 更新发现的池表格
     */
    updateDiscoveredPoolsTable() {
        const tableBody = document.getElementById('discoveredPoolsTable');
        if (!tableBody) return;

        if (this.discoveredPools.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="11" class="empty-state">暂无发现的池</td></tr>';
            return;
        }

        tableBody.innerHTML = this.discoveredPools.map(pool => `
            <tr>
                <td><span class="rank-badge">#${pool.rank || '--'}</span></td>
                <td class="pool-address">${this.formatAddress(pool.poolAddress)}</td>
                <td>${pool.tokenPair || '--'}</td>
                <td><span class="bin-step" data-value="${pool.binStep || 0}">${pool.binStep || '--'}</span></td>
                <td><span class="meteor-score">${pool.meteorScore || '--'}</span></td>
                <td>${this.formatCurrency(pool.liquidity)}</td>
                <td>${pool.age || '--'}</td>
                <td>${this.formatCurrency(pool.fdv || 0)}</td>
                <td>${this.formatPercentage(pool.apr?.["24h"] || 0)}</td>
                <td>${this.formatCurrency(pool.volume?.["24h"] || 0)}</td>
                <td>${this.formatTime(pool.scrapedAt)}</td>
            </tr>
        `).join('');
    }

    /**
     * 更新合格池表格
     */
    updateQualifiedPoolsTable() {
        const tableBody = document.getElementById('qualifiedPoolsTable');
        if (!tableBody) return;

        if (this.qualifiedPools.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="12" class="empty-state">暂无合格池</td></tr>';
            return;
        }

        // 按时间从新到旧排序
        const sortedPools = [...this.qualifiedPools].sort((a, b) => {
            const timeA = a.poolData?.scrapedAt || a.discoveredAt || 0;
            const timeB = b.poolData?.scrapedAt || b.discoveredAt || 0;
            return timeB - timeA; // 降序排列，最新的在顶部
        });

        tableBody.innerHTML = sortedPools.map(pool => `
            <tr>
                <td><span class="rank-badge">#${pool.poolData?.rank || '--'}</span></td>
                <td class="pool-address">${this.formatAddress(pool.poolData?.poolAddress || pool.id)}</td>
                <td>${pool.poolData?.tokenPair || '--'}</td>
                <td><span class="bin-step" data-value="${pool.poolData?.binStep || 0}">${pool.poolData?.binStep || '--'}</span></td>
                <td><span class="meteor-score">${pool.poolData?.meteorScore || '--'}</span></td>
                <td>${this.formatCurrency(pool.poolData?.liquidity || 0)}</td>
                <td>${pool.poolData?.age || '--'}</td>
                <td>${this.formatCurrency(pool.poolData?.fdv || 0)}</td>
                <td>${this.formatPercentage(pool.poolData?.apr?.["24h"] || 0)}</td>
                <td>${this.formatCurrency(pool.poolData?.volume?.["24h"] || 0)}</td>
                <td>${pool.poolData?.matchedFilters?.join(', ') || '--'}</td>
                <td>${this.formatTime(pool.poolData?.scrapedAt || pool.discoveredAt)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.poolCrawlerMonitor.createStrategy('${pool.poolData?.poolAddress || pool.id}')">
                        创建策略
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * 更新过滤器显示
     */
    updateFiltersDisplay() {
        if (!this.filters) return;

        // 基础过滤器
        if (this.filters.meteorScore) {
            document.getElementById('minMeteorScore').value = this.filters.meteorScore.min || '';
            document.getElementById('maxMeteorScore').value = this.filters.meteorScore.max || '';
        }

        if (this.filters.liquidity) {
            document.getElementById('minLiquidity').value = this.filters.liquidity.min || '';
            document.getElementById('maxLiquidity').value = this.filters.liquidity.max || '';
        }

        if (this.filters.ageInHours) {
            document.getElementById('minAge').value = this.filters.ageInHours.min || '';
            document.getElementById('maxAge').value = this.filters.ageInHours.max || '';
        }

        if (this.filters.fdv) {
            document.getElementById('minFdv').value = this.filters.fdv.min || '';
            document.getElementById('maxFdv').value = this.filters.fdv.max || '';
        }

        // APR过滤器
        if (this.filters.apr) {
            if (this.filters.apr["24h"]) {
                document.getElementById('minApr24h').value = this.filters.apr["24h"].min || '';
                document.getElementById('maxApr24h').value = this.filters.apr["24h"].max || '';
            }
            if (this.filters.apr["1h"]) {
                document.getElementById('minApr1h').value = this.filters.apr["1h"].min || '';
                document.getElementById('maxApr1h').value = this.filters.apr["1h"].max || '';
            }
        }

        // 交易量过滤器
        if (this.filters.volume) {
            if (this.filters.volume["24h"]) {
                document.getElementById('minVolume24h').value = this.filters.volume["24h"].min || '';
                document.getElementById('maxVolume24h').value = this.filters.volume["24h"].max || '';
            }
            if (this.filters.volume["1h"]) {
                document.getElementById('minVolume1h').value = this.filters.volume["1h"].min || '';
                document.getElementById('maxVolume1h').value = this.filters.volume["1h"].max || '';
            }
        }

        // 价格变化过滤器
        if (this.filters.priceChange && this.filters.priceChange["24h"]) {
            document.getElementById('minPriceChange24h').value = this.filters.priceChange["24h"].min || '';
            document.getElementById('maxPriceChange24h').value = this.filters.priceChange["24h"].max || '';
        }

        // 代币过滤器 - 已禁用
        // 🚫 代币筛选功能已禁用，跳过显示更新
        /*
        if (this.filters.tokenWhitelist && this.filters.tokenWhitelist.length > 0) {
            document.getElementById('tokenWhitelist').value = this.filters.tokenWhitelist.join(', ');
        }
        if (this.filters.tokenBlacklist && this.filters.tokenBlacklist.length > 0) {
            document.getElementById('tokenBlacklist').value = this.filters.tokenBlacklist.join(', ');
        }
        */
    }

    /**
     * 启动爬虫
     */
    async startCrawler() {
        // 🔒 防重复点击保护
        if (this.isStarting) {
            console.warn('⚠️ 爬虫启动中，忽略重复请求');
            return;
        }

        this.isStarting = true;
        const startBtn = document.getElementById('startCrawlerBtn');

        try {
            // 禁用按钮并显示加载状态
            if (startBtn) {
                startBtn.disabled = true;
                const originalText = startBtn.innerHTML;
                startBtn.innerHTML = '<span class="icon">⏳</span>启动中...';

                // 恢复按钮状态的延迟函数
                setTimeout(() => {
                    if (startBtn) {
                        startBtn.disabled = false;
                        startBtn.innerHTML = originalText;
                    }
                }, 3000);
            }

            const response = await fetch('/api/pool-crawler/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('success', '爬虫启动', result.message);
                console.log('✅ 池爬虫启动成功:', result.data);

                // 更新本地状态
                if (result.data && result.data.status) {
                    this.crawlerStatus = { ...this.crawlerStatus, ...result.data.status };
                    this.updateStatusDisplay();
                }

                // 刷新状态
                setTimeout(() => this.fetchStatus(), 1000);
            } else {
                throw new Error(result.error || '启动失败');
            }
        } catch (error) {
            console.error('❌ 启动爬虫失败:', error);
            this.showError(`启动爬虫失败: ${error.message}`);
        } finally {
            // 🔒 清除操作标志
            this.isStarting = false;
        }
    }

    /**
     * 暂停爬虫
     */
    async pauseCrawler() {
        // 🔒 防重复点击保护
        if (this.isPausing) {
            console.warn('⚠️ 爬虫暂停中，忽略重复请求');
            return;
        }

        this.isPausing = true;
        const pauseBtn = document.getElementById('pauseCrawlerBtn');

        try {
            // 禁用按钮并显示加载状态
            if (pauseBtn) {
                pauseBtn.disabled = true;
                const originalText = pauseBtn.innerHTML;
                pauseBtn.innerHTML = '<span class="icon">⏳</span>暂停中...';

                setTimeout(() => {
                    if (pauseBtn) {
                        pauseBtn.disabled = false;
                        pauseBtn.innerHTML = originalText;
                    }
                }, 2000);
            }

            const response = await fetch('/api/pool-crawler/pause', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('warning', '爬虫暂停', result.message);
                console.log('✅ 池爬虫暂停成功:', result.data);

                // 更新本地状态
                if (result.data && result.data.status) {
                    this.crawlerStatus = { ...this.crawlerStatus, ...result.data.status };
                    this.updateStatusDisplay();
                }
            } else {
                throw new Error(result.error || '暂停失败');
            }
        } catch (error) {
            console.error('❌ 暂停爬虫失败:', error);
            this.showError(`暂停爬虫失败: ${error.message}`);
        } finally {
            // 🔒 清除操作标志
            this.isPausing = false;
        }
    }

    /**
     * 恢复爬虫
     */
    async resumeCrawler() {
        // 🔒 防重复点击保护
        if (this.isResuming) {
            console.warn('⚠️ 爬虫恢复中，忽略重复请求');
            return;
        }

        this.isResuming = true;
        const resumeBtn = document.getElementById('resumeCrawlerBtn');

        try {
            // 禁用按钮并显示加载状态
            if (resumeBtn) {
                resumeBtn.disabled = true;
                const originalText = resumeBtn.innerHTML;
                resumeBtn.innerHTML = '<span class="icon">⏳</span>恢复中...';

                setTimeout(() => {
                    if (resumeBtn) {
                        resumeBtn.disabled = false;
                        resumeBtn.innerHTML = originalText;
                    }
                }, 2000);
            }

            const response = await fetch('/api/pool-crawler/resume', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('success', '爬虫恢复', result.message);
                console.log('✅ 池爬虫恢复成功:', result.data);

                // 更新本地状态
                if (result.data && result.data.status) {
                    this.crawlerStatus = { ...this.crawlerStatus, ...result.data.status };
                    this.updateStatusDisplay();
                }
            } else {
                throw new Error(result.error || '恢复失败');
            }
        } catch (error) {
            console.error('❌ 恢复爬虫失败:', error);
            this.showError(`恢复爬虫失败: ${error.message}`);
        } finally {
            // 🔒 清除操作标志
            this.isResuming = false;
        }
    }

    /**
     * 停止爬虫
     */
    async stopCrawler() {
        // 🔒 防重复点击保护
        if (this.isStopping) {
            console.warn('⚠️ 爬虫停止中，忽略重复请求');
            return;
        }

        this.isStopping = true;
        const stopBtn = document.getElementById('stopCrawlerBtn');

        try {
            // 禁用按钮并显示加载状态
            if (stopBtn) {
                stopBtn.disabled = true;
                const originalText = stopBtn.innerHTML;
                stopBtn.innerHTML = '<span class="icon">⏳</span>停止中...';

                setTimeout(() => {
                    if (stopBtn) {
                        stopBtn.disabled = false;
                        stopBtn.innerHTML = originalText;
                    }
                }, 2000);
            }

            const response = await fetch('/api/pool-crawler/stop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('info', '爬虫停止', result.message);
                console.log('✅ 池爬虫停止成功:', result.data);

                // 更新本地状态
                if (result.data && result.data.status) {
                    this.crawlerStatus = { ...this.crawlerStatus, ...result.data.status };
                    this.updateStatusDisplay();
                }
            } else {
                throw new Error(result.error || '停止失败');
            }
        } catch (error) {
            console.error('❌ 停止爬虫失败:', error);
            this.showError(`停止爬虫失败: ${error.message}`);
        } finally {
            // 🔒 清除操作标志
            this.isStopping = false;
        }
    }

    /**
     * 刷新数据
     */
    async refreshData() {
        // 🔒 防重复点击保护
        if (this.isRefreshing) {
            console.warn('⚠️ 数据刷新中，忽略重复请求');
            return;
        }

        this.isRefreshing = true;
        const refreshBtn = document.getElementById('refreshCrawlerBtn');

        try {
            // 禁用按钮并显示加载状态
            if (refreshBtn) {
                refreshBtn.disabled = true;
                const originalText = refreshBtn.innerHTML;
                refreshBtn.innerHTML = '<span class="icon">⏳</span>刷新中...';

                setTimeout(() => {
                    if (refreshBtn) {
                        refreshBtn.disabled = false;
                        refreshBtn.innerHTML = originalText;
                    }
                }, 3000);
            }

            const response = await fetch('/api/pool-crawler/crawl-now', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('info', '立即爬取', result.message);
                console.log('✅ 立即爬取请求成功:', result.data);

                // 刷新状态
                setTimeout(() => this.fetchStatus(), 2000);
            } else {
                throw new Error(result.error || '立即爬取失败');
            }
        } catch (error) {
            console.error('❌ 立即爬取失败:', error);
            this.showError(`立即爬取失败: ${error.message}`);
        } finally {
            // 🔒 清除操作标志
            this.isRefreshing = false;
        }
    }

    /**
     * 🔥 新增：获取爬虫状态
     */
    async fetchStatus() {
        try {
            const response = await fetch('/api/pool-crawler/status');
            const result = await response.json();

            if (result.success && result.data) {
                // 记录之前的运行状态
                const wasRunning = this.crawlerStatus.isRunning;
                const isFirstFetch = this.crawlerStatus.isRunning === undefined;

                // 更新爬虫状态
                if (result.data.status) {
                    this.crawlerStatus = { ...this.crawlerStatus, ...result.data.status };
                }

                // 更新显示
                this.updateStatusDisplay();
                this.updateStatsDisplay();

                // 更新连接状态
                this.updateConnectionStatus('connected', 'API已连接');

                // 只在状态变化时输出日志，避免重复日志
                if (wasRunning !== this.crawlerStatus.isRunning || isFirstFetch) {
                    console.log('📊 爬虫状态已更新:', {
                        isRunning: this.crawlerStatus.isRunning,
                        status: this.crawlerStatus.status,
                        poolsDiscovered: this.crawlerStatus.poolsDiscovered,
                        qualifiedPools: this.crawlerStatus.qualifiedPools
                    });

                    // 状态改变时或第一次获取时调整轮询频率
                    this.adjustPollingFrequency();
                }
            }
        } catch (error) {
            console.error('❌ 获取爬虫状态失败:', error);
            // 更新连接状态为错误状态
            this.updateConnectionStatus('error', 'API连接错误');
        }
    }

    /**
     * 🔥 新增：智能状态轮询
     */
    startStatusPolling() {
        // 立即获取一次状态
        this.fetchStatus();

        // 根据爬虫状态决定轮询间隔，默认30秒（适用于未初始化或停止状态）
        const pollingInterval = this.crawlerStatus.isRunning === true ? 5000 : 30000;

        // 每隔指定时间刷新状态
        this.statusPollingTimer = setInterval(() => {
            if (this.isPageVisible) {
                this.fetchStatus();
            }
        }, pollingInterval);

        const intervalText = this.crawlerStatus.isRunning === true ? '5秒' : '30秒';
        console.log(`✅ 智能状态轮询已启动 (间隔: ${intervalText})`);
    }

    /**
     * 🔥 新增：停止状态轮询
     */
    stopStatusPolling() {
        if (this.statusPollingTimer) {
            clearInterval(this.statusPollingTimer);
            this.statusPollingTimer = null;
            console.log('✅ 状态轮询已停止');
        }
    }

    /**
     * 应用过滤器
     */
    async applyFilters() {
        // 构建完整的过滤器对象，明确指定每个筛选器的启用状态
        const filters = {
            // 基础数值筛选 - 默认都不启用
            meteorScore: { enabled: false },
            liquidity: { enabled: false },
            fdv: { enabled: false },
            ageInHours: { enabled: false },

            // APR筛选 - 默认都不启用
            apr: {
                "5m": { enabled: false },
                "1h": { enabled: false },
                "6h": { enabled: false },
                "24h": { enabled: false },
                "7d": { enabled: false }
            },

            // 价格变化筛选 - 默认都不启用
            priceChange: {
                "5m": { enabled: false },
                "1h": { enabled: false },
                "6h": { enabled: false },
                "24h": { enabled: false },
                "7d": { enabled: false }
            },

            // 费用筛选 - 默认都不启用
            fees: {
                "5m": { enabled: false },
                "1h": { enabled: false },
                "6h": { enabled: false },
                "24h": { enabled: false },
                "7d": { enabled: false }
            },

            // 交易量筛选 - 默认都不启用
            volume: {
                "5m": { enabled: false },
                "1h": { enabled: false },
                "6h": { enabled: false },
                "24h": { enabled: false },
                "7d": { enabled: false }
            },

            // 代币筛选 - 默认空白
            tokenWhitelist: [],
            tokenBlacklist: []

            // 排名筛选已移除 - 不再作为筛选条件
        };

        // 只有用户填写了值的筛选器才启用

        // Meteor Score过滤
        const minMeteorScore = parseInt(document.getElementById('minMeteorScore')?.value);
        const maxMeteorScore = parseInt(document.getElementById('maxMeteorScore')?.value);
        if (!isNaN(minMeteorScore) || !isNaN(maxMeteorScore)) {
            // 验证Meteor Score逻辑关系
            if (!isNaN(minMeteorScore) && !isNaN(maxMeteorScore) && minMeteorScore > maxMeteorScore) {
                this.showError('Meteor Score最小值不能大于最大值');
                return;
            }

            filters.meteorScore = {
                enabled: true,
                min: !isNaN(minMeteorScore) ? minMeteorScore : undefined,
                max: !isNaN(maxMeteorScore) ? maxMeteorScore : undefined
            };
        }

        // TVL/流动性过滤
        const minLiquidity = parseFloat(document.getElementById('minLiquidity')?.value);
        const maxLiquidity = parseFloat(document.getElementById('maxLiquidity')?.value);
        if (!isNaN(minLiquidity) || !isNaN(maxLiquidity)) {
            // 验证流动性范围 (>= 0)
            if (!isNaN(minLiquidity) && minLiquidity < 0) {
                this.showError('TVL最小值不能为负数');
                return;
            }
            if (!isNaN(maxLiquidity) && maxLiquidity < 0) {
                this.showError('TVL最大值不能为负数');
                return;
            }
            if (!isNaN(minLiquidity) && !isNaN(maxLiquidity) && minLiquidity > maxLiquidity) {
                this.showError('TVL最小值不能大于最大值');
                return;
            }

            filters.liquidity = {
                enabled: true,
                min: !isNaN(minLiquidity) ? minLiquidity : undefined,
                max: !isNaN(maxLiquidity) ? maxLiquidity : undefined
            };
        }

        // 池年龄过滤
        const minAge = parseInt(document.getElementById('minAge')?.value);
        const maxAge = parseInt(document.getElementById('maxAge')?.value);
        if (!isNaN(minAge) || !isNaN(maxAge)) {
            // 验证年龄范围 - 修改为>=0以匹配后端schema
            if (!isNaN(minAge) && minAge < 0) {
                this.showError('池年龄最小值必须大于等于0小时');
                return;
            }
            if (!isNaN(maxAge) && maxAge < 0) {
                this.showError('池年龄最大值必须大于等于0小时');
                return;
            }
            if (!isNaN(minAge) && !isNaN(maxAge) && minAge > maxAge) {
                this.showError('池年龄最小值不能大于最大值');
                return;
            }

            filters.ageInHours = {
                enabled: true,
                min: !isNaN(minAge) ? minAge : undefined,
                max: !isNaN(maxAge) ? maxAge : undefined
            };
        }

        // FDV过滤
        const minFdv = parseFloat(document.getElementById('minFdv')?.value);
        const maxFdv = parseFloat(document.getElementById('maxFdv')?.value);
        if (!isNaN(minFdv) || !isNaN(maxFdv)) {
            // 验证FDV范围
            if (!isNaN(minFdv) && minFdv < 0) {
                this.showError('FDV最小值不能为负数');
                return;
            }
            if (!isNaN(maxFdv) && maxFdv < 0) {
                this.showError('FDV最大值不能为负数');
                return;
            }
            if (!isNaN(minFdv) && !isNaN(maxFdv) && minFdv > maxFdv) {
                this.showError('FDV最小值不能大于最大值');
                return;
            }

            filters.fdv = {
                enabled: true,
                min: !isNaN(minFdv) ? minFdv : undefined,
                max: !isNaN(maxFdv) ? maxFdv : undefined
            };
        }

        // APR过滤（只支持24h）
        const minApr24h = parseFloat(document.getElementById('minApr24h')?.value);
        const maxApr24h = parseFloat(document.getElementById('maxApr24h')?.value);
        if (!isNaN(minApr24h) || !isNaN(maxApr24h)) {
            // 验证APR范围
            if (!isNaN(minApr24h) && !isNaN(maxApr24h) && minApr24h > maxApr24h) {
                this.showError('APR最小值不能大于最大值');
                return;
            }

            filters.apr["24h"] = {
                enabled: true,
                min: !isNaN(minApr24h) ? minApr24h : undefined,
                max: !isNaN(maxApr24h) ? maxApr24h : undefined
            };
        }

        // 交易量过滤（只支持24h）
        const minVolume24h = parseFloat(document.getElementById('minVolume24h')?.value);
        const maxVolume24h = parseFloat(document.getElementById('maxVolume24h')?.value);
        if (!isNaN(minVolume24h) || !isNaN(maxVolume24h)) {
            // 验证交易量范围 (>= 0)
            if (!isNaN(minVolume24h) && minVolume24h < 0) {
                this.showError('交易量最小值不能为负数');
                return;
            }
            if (!isNaN(maxVolume24h) && maxVolume24h < 0) {
                this.showError('交易量最大值不能为负数');
                return;
            }
            if (!isNaN(minVolume24h) && !isNaN(maxVolume24h) && minVolume24h > maxVolume24h) {
                this.showError('交易量最小值不能大于最大值');
                return;
            }

            filters.volume["24h"] = {
                enabled: true,
                min: !isNaN(minVolume24h) ? minVolume24h : undefined,
                max: !isNaN(maxVolume24h) ? maxVolume24h : undefined
            };
        }

        // 代币过滤 - 已禁用
        // 🚫 代币筛选功能已禁用，不再发送代币筛选参数
        /*
        const tokenWhitelistValue = document.getElementById('tokenWhitelist')?.value?.trim();
        const tokenBlacklistValue = document.getElementById('tokenBlacklist')?.value?.trim();
        if (tokenWhitelistValue) {
            filters.tokenWhitelist = tokenWhitelistValue.split(',').map(t => t.trim()).filter(t => t);
        }
        if (tokenBlacklistValue) {
            filters.tokenBlacklist = tokenBlacklistValue.split(',').map(t => t.trim()).filter(t => t);
        }
        */

        try {
            // 🔍 调试信息：显示实际发送的过滤器数据
            console.log('🔍 准备发送的过滤器数据:', JSON.stringify(filters, null, 2));
            console.log('🔍 启用的过滤器:', Object.keys(filters).filter(key => {
                if (key === 'tokenWhitelist' || key === 'tokenBlacklist') {
                    return filters[key].length > 0;
                }
                if (key === 'minRank' || key === 'maxRank') {
                    return true; // 排名过滤器总是存在
                }
                if (typeof filters[key] === 'object' && filters[key].enabled) {
                    return true;
                }
                if (typeof filters[key] === 'object' && !filters[key].enabled) {
                    // 检查时间序列筛选器
                    for (const timeframe in filters[key]) {
                        if (filters[key][timeframe]?.enabled) {
                            return true;
                        }
                    }
                }
                return false;
            }));

            const response = await fetch('/api/pool-crawler/filters', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(filters)
            });

            const result = await response.json();

            // 🔍 调试信息：显示服务器响应
            console.log('�� 服务器响应:', result);
            console.log('🔍 响应状态:', response.status);

            if (result.success) {
                this.filters = filters;

                // 保存筛选器设置到localStorage
                this.saveFiltersToStorage();

                this.showNotification('success', '过滤器已应用', '过滤器配置已更新并保存');
                console.log('✅ 过滤器更新成功:', result.data);

                // 更新过滤器显示
                this.updateFiltersDisplay();
            } else {
                // 🔍 详细错误信息
                console.error('❌ 过滤器更新失败:', result);
                if (result.details) {
                    console.error('❌ 验证错误详情:', result.details);
                    // 🔍 逐个显示验证错误
                    result.details.forEach((detail, index) => {
                        console.error(`❌ 验证错误 ${index + 1}:`, detail);
                        console.error(`   - 路径: ${detail.path ? detail.path.join('.') : '未知'}`);
                        console.error(`   - 消息: ${detail.message}`);
                        console.error(`   - 代码: ${detail.code}`);
                        if (detail.expected) console.error(`   - 期望: ${detail.expected}`);
                        if (detail.received) console.error(`   - 实际: ${detail.received}`);
                    });
                }
                throw new Error(result.error || '过滤器更新失败');
            }
        } catch (error) {
            console.error('❌ 应用过滤器失败:', error);
            this.showError(`应用过滤器失败: ${error.message}`);
        }
    }

    /**
     * 重置过滤器
     */
    resetFilters() {
        // 重置所有过滤器输入框（移除排名相关，移除代币筛选）
        const filterInputs = [
            'minMeteorScore', 'maxMeteorScore',
            'minLiquidity', 'maxLiquidity',
            'minAge', 'maxAge',
            'minFdv', 'maxFdv',
            'minApr24h', 'maxApr24h',
            'minApr1h', 'maxApr1h',
            'minVolume24h', 'maxVolume24h',
            'minVolume1h', 'maxVolume1h',
            'minPriceChange24h', 'maxPriceChange24h'
            // 'tokenWhitelist', 'tokenBlacklist' - 代币筛选已禁用
        ];

        filterInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = '';
            }
        });

        this.filters = {};

        // 清除localStorage中保存的筛选器设置
        this.clearFiltersFromStorage();

        this.showNotification('info', '过滤器已重置', '所有过滤器已清空并恢复到默认状态');
    }

    /**
     * 显示配置对话框
     */
    async showConfig() {
        // 简单的配置对话框实现
        const config = {
            intervalMinutes: 5,
            maxRetries: 3,
            timeout: 30000,
            pages: 1
        };

        const newInterval = prompt('爬取间隔（分钟）:', config.intervalMinutes);
        if (newInterval && !isNaN(newInterval) && newInterval > 0) {
            config.intervalMinutes = parseInt(newInterval);
        }

        const newMaxRetries = prompt('最大重试次数:', config.maxRetries);
        if (newMaxRetries && !isNaN(newMaxRetries) && newMaxRetries > 0) {
            config.maxRetries = parseInt(newMaxRetries);
        }

        const newTimeout = prompt('超时时间（毫秒）:', config.timeout);
        if (newTimeout && !isNaN(newTimeout) && newTimeout > 0) {
            config.timeout = parseInt(newTimeout);
        }

        try {
            const response = await fetch('/api/pool-crawler/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('success', '配置更新', '爬虫配置已更新');
                console.log('✅ 爬虫配置更新成功:', result.data);
            } else {
                throw new Error(result.error || '配置更新失败');
            }
        } catch (error) {
            console.error('❌ 更新爬虫配置失败:', error);
            this.showError(`更新爬虫配置失败: ${error.message}`);
        }
    }

    /**
     * 创建策略
     */
    createStrategy(poolAddress) {
        // 这里可以集成到现有的策略创建系统
        this.showNotification('info', '创建策略', `正在为池 ${this.formatAddress(poolAddress)} 创建策略`);
        console.log('创建策略:', poolAddress);
    }

    /**
     * 切换标签页
     */
    switchTab(tabName) {
        // 更新按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // 更新内容显示
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // 🔄 根据标签页刷新对应数据
        if (tabName === 'qualified') {
            this.updateQualifiedPoolsTable();
            this.updateStatsDisplay();
        } else if (tabName === 'discovered') {
            this.updateDiscoveredPoolsTable();
            this.updateStatsDisplay();
        } else if (tabName === 'filters') {
            this.updateFiltersDisplay();
        }
    }

    /**
     * 显示通知
     */
    showNotification(type, title, message) {
        const notificationArea = document.getElementById('notificationArea');
        if (!notificationArea) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">&times;</button>
        `;

        notificationArea.appendChild(notification);

        // 自动消失
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);

        // 点击关闭
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
    }

    /**
     * 显示错误
     */
    showError(message) {
        this.showNotification('error', '错误', message);
    }

    /**
     * 启动状态更新定时器
     */
    startStatusUpdateTimer() {
        this.statusUpdateTimer = setInterval(() => {
            this.updateStatsDisplay();
        }, 1000);
    }

    /**
     * 安排重连
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectTimer = setTimeout(() => {
            if (!this.isConnected && this.autoReconnect) {
                console.log('🔄 尝试重新连接...');
                this.connect();
            }
        }, this.reconnectInterval);
    }

    /**
     * 格式化地址
     */
    formatAddress(address) {
        if (!address) return '--';
        const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
        // 使用 data-address 属性而不是 onclick，避免特殊字符问题
        return `<span class="pool-address-clickable" data-address="${address}" 
                     title="点击复制完整地址: ${address}" 
                     style="cursor: pointer; color: #0066cc; text-decoration: underline;">${shortAddress}</span>`;
    }

    /**
     * 复制地址到剪贴板
     */
    async copyAddress(address) {
        console.log('🔄 尝试复制地址:', address);

        if (!address) {
            console.error('❌ 地址为空');
            this.showNotification('error', '复制失败', '地址为空');
            return;
        }

        try {
            // 首先尝试使用现代的 Clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(address);
                console.log('✅ 使用 Clipboard API 复制成功');
                this.showNotification('success', '复制成功', `池地址已复制: ${address.slice(0, 8)}...${address.slice(-8)}`);
                return;
            }
        } catch (error) {
            console.warn('⚠️ Clipboard API 失败，尝试降级方式:', error);
        }

        // 降级处理：使用传统方式复制
        try {
            const textArea = document.createElement('textarea');
            textArea.value = address;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (successful) {
                console.log('✅ 使用传统方式复制成功');
                this.showNotification('success', '复制成功', `池地址已复制: ${address.slice(0, 8)}...${address.slice(-8)}`);
            } else {
                throw new Error('execCommand 返回 false');
            }
        } catch (fallbackError) {
            console.error('❌ 所有复制方式都失败:', fallbackError);
            this.showNotification('error', '复制失败', '无法复制到剪贴板，请手动复制');

            // 最后的备用方案：显示完整地址供用户手动复制
            this.showFullAddress(address);
        }
    }

    /**
     * 显示完整地址供用户手动复制
     */
    showFullAddress(address) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 90%;
            word-break: break-all;
        `;

        modal.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: bold;">池地址 (请手动复制):</div>
            <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; user-select: all;">
                ${address}
            </div>
            <button onclick="this.parentElement.remove()" style="margin-top: 10px; padding: 5px 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                关闭
            </button>
        `;

        document.body.appendChild(modal);

        // 5秒后自动关闭
        setTimeout(() => {
            if (modal.parentElement) {
                modal.remove();
            }
        }, 5000);
    }

    /**
     * 格式化货币
     */
    formatCurrency(amount) {
        if (!amount || amount === 0) return '$0.00';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount);
    }

    /**
     * 格式化百分比
     */
    formatPercentage(value) {
        if (!value || value === 0) return '0.00%';
        return `${value.toFixed(2)}%`;
    }

    /**
     * 格式化时间
     */
    formatTime(timestamp) {
        if (!timestamp) return '--';
        return new Date(timestamp).toLocaleString('zh-CN');
    }

    /**
     * 销毁监控器
     */
    destroy() {
        // 清理定时器
        if (this.statusUpdateTimer) {
            clearInterval(this.statusUpdateTimer);
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.statusPollingTimer) {
            clearInterval(this.statusPollingTimer);
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        // 移除事件监听
        if (this.visibilityChangeHandler) {
            document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
        }

        // 断开Socket.IO连接
        if (this.socket) {
            this.socket.disconnect();
        }

        // 清理UI
        if (this.container) {
            this.container.innerHTML = '';
        }

        console.log('🗑️ 池爬虫监控器已销毁');
    }

    /**
     * 🔥 新增：加载localStorage中的历史数据
     */
    loadStoredData() {
        try {
            // 加载合格池数据
            const qualifiedData = localStorage.getItem(this.STORAGE_KEY_QUALIFIED);
            if (qualifiedData) {
                const parsed = JSON.parse(qualifiedData);
                if (Array.isArray(parsed)) {
                    this.qualifiedPools = parsed.filter(pool => {
                        // 过滤过期数据
                        const poolTime = pool.poolData?.scrapedAt || pool.discoveredAt || Date.now();
                        return Date.now() - poolTime < (this.DATA_RETENTION_HOURS * 60 * 60 * 1000);
                    });
                }
            }

            // 立即清理并保存过滤后的数据
            this.saveQualifiedPoolsToStorage();

            // 更新界面
            this.updateQualifiedPoolsTable();

            // 更新统计数据
            this.updateStatsDisplay();

        } catch (error) {
            console.error('❌ 加载localStorage数据失败:', error);
            // 出错时重置为空数组
            this.qualifiedPools = [];
            this.updateQualifiedPoolsTable();
        }
    }

    /**
     * 🔥 新增：清理过期的localStorage数据
     */
    clearExpiredData() {
        const now = Date.now();
        const expiryTime = this.DATA_RETENTION_HOURS * 60 * 60 * 1000; // 小时转换为毫秒

        // 清理过期的合格池数据
        const validQualifiedPools = this.qualifiedPools.filter(pool => {
            const poolTime = pool.poolData?.scrapedAt || pool.discoveredAt || Date.now();
            return now - poolTime < expiryTime;
        });

        // 检查是否有数据被清理
        const qualifiedRemoved = this.qualifiedPools.length - validQualifiedPools.length;

        if (qualifiedRemoved > 0) {
            this.qualifiedPools = validQualifiedPools;
            // 更新界面
            this.updateQualifiedPoolsTable();
        }
    }

    /**
     * 🔥 新增：将合格的池保存到localStorage
     */
    saveQualifiedPoolsToStorage() {
        try {
            const dataToSave = JSON.stringify(this.qualifiedPools);
            localStorage.setItem(this.STORAGE_KEY_QUALIFIED, dataToSave);
        } catch (error) {
            console.error('❌ 保存合格的池失败:', error);
        }
    }

    /**
     * 🔥 新增：启动定时清理过期数据
     */
    startPeriodicCleanup() {
        this.cleanupTimer = setInterval(() => {
            this.clearExpiredData();
            console.log('✅ 已清理过期数据');
        }, 60 * 60 * 1000); // 每小时清理一次
    }

    /**
     * 🔥 新增：清除localStorage中保存的筛选器设置
     */
    clearFiltersFromStorage() {
        localStorage.removeItem('poolCrawler_filters');
        console.log('✅ 筛选器设置已从localStorage清除');
    }

    /**
     * 🔥 新增：将筛选器设置保存到localStorage
     */
    saveFiltersToStorage() {
        try {
            const dataToSave = JSON.stringify(this.filters);
            localStorage.setItem('poolCrawler_filters', dataToSave);
            console.log(`✅ 筛选器设置已保存到localStorage: ${Object.keys(this.filters).length} 个过滤器，数据大小: ${dataToSave.length} 字符`);
        } catch (error) {
            console.error('❌ 保存筛选器设置失败:', error);
        }
    }

    /**
     * 🔥 新增：加载筛选器设置
     */
    loadFiltersFromStorage() {
        const savedFilters = localStorage.getItem('poolCrawler_filters');
        if (savedFilters) {
            try {
                const parsedFilters = JSON.parse(savedFilters);
                if (typeof parsedFilters === 'object' && parsedFilters !== null) {
                    this.filters = parsedFilters;
                    this.restoreFiltersUI();
                    console.log('✅ 筛选器设置已从localStorage加载');
                } else {
                    console.warn('⚠️ localStorage中的筛选器数据格式不正确');
                }
            } catch (error) {
                console.error('❌ 加载筛选器设置失败:', error);
                this.filters = {}; // 加载失败时重置为空对象
            }
        } else {
            console.log('📦 localStorage中没有找到筛选器设置');
        }
    }

    /**
     * 🔥 新增：恢复UI中的筛选器输入框值
     */
    restoreFiltersUI() {
        try {
            // 恢复Meteor Score
            if (this.filters.meteorScore) {
                this.setInputValue('minMeteorScore', this.filters.meteorScore.min);
                this.setInputValue('maxMeteorScore', this.filters.meteorScore.max);
            }

            // 恢复TVL/流动性
            if (this.filters.liquidity) {
                this.setInputValue('minLiquidity', this.filters.liquidity.min);
                this.setInputValue('maxLiquidity', this.filters.liquidity.max);
            }

            // 恢复池年龄
            if (this.filters.ageInHours) {
                this.setInputValue('minAge', this.filters.ageInHours.min);
                this.setInputValue('maxAge', this.filters.ageInHours.max);
            }

            // 恢复FDV
            if (this.filters.fdv) {
                this.setInputValue('minFdv', this.filters.fdv.min);
                this.setInputValue('maxFdv', this.filters.fdv.max);
            }

            // 恢复APR
            if (this.filters.apr?.['24h']) {
                this.setInputValue('minApr24h', this.filters.apr['24h'].min);
                this.setInputValue('maxApr24h', this.filters.apr['24h'].max);
            }

            // 恢复交易量
            if (this.filters.volume?.['24h']) {
                this.setInputValue('minVolume24h', this.filters.volume['24h'].min);
                this.setInputValue('maxVolume24h', this.filters.volume['24h'].max);
            }

            // 恢复代币过滤 - 已禁用
            // 🚫 代币筛选功能已禁用，跳过恢复
            /*
            if (this.filters.tokenWhitelist) {
                this.setInputValue('tokenWhitelist', this.filters.tokenWhitelist.join(', '));
            }
            if (this.filters.tokenBlacklist) {
                this.setInputValue('tokenBlacklist', this.filters.tokenBlacklist.join(', '));
            }
            */

            console.log('✅ 筛选器UI已恢复');
        } catch (error) {
            console.error('❌ 恢复筛选器UI失败:', error);
        }
    }

    /**
     * 🔥 新增：辅助方法，设置输入框值
     */
    setInputValue(inputId, value) {
        const input = document.getElementById(inputId);
        if (input && value !== undefined && value !== null) {
            input.value = value;
        }
    }

    /**
     * 🔥 新增：智能调整轮询频率
     */
    adjustPollingFrequency() {
        // 重新启动轮询以应用新的间隔
        this.stopStatusPolling();
        this.startStatusPolling();

        const intervalText = this.crawlerStatus.isRunning === true ? '5秒' : '30秒';
        console.log(`🔄 轮询频率已调整为 ${intervalText}间隔`);
    }

    /**
     * 🔔 加载声音设置
     */
    loadSoundSettings() {
        try {
            const savedSettings = localStorage.getItem(this.STORAGE_KEY_SETTINGS);
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                this.soundEnabled = settings.soundEnabled || false;
            }
        } catch (error) {
            console.warn('⚠️ 加载声音设置失败:', error);
            this.soundEnabled = false;
        }
    }

    /**
     * 🔔 保存声音设置
     */
    saveSoundSettings() {
        try {
            const settings = {
                soundEnabled: this.soundEnabled,
                lastUpdated: Date.now()
            };
            localStorage.setItem(this.STORAGE_KEY_SETTINGS, JSON.stringify(settings));
        } catch (error) {
            console.warn('⚠️ 保存声音设置失败:', error);
        }
    }

    /**
     * 🔔 切换声音开关
     */
    toggleSound(enabled) {
        this.soundEnabled = enabled;
        this.saveSoundSettings();
        this.updateSoundIcon();

        // 初始化音频上下文（需要用户交互）
        if (enabled && !this.audioContext) {
            this.initAudioContext();
        }

        console.log(`🔔 声音提醒${enabled ? '已启用' : '已关闭'}`);

        // 播放测试音
        if (enabled) {
            this.playNotificationSound();
        }
    }

    /**
     * 🔔 更新声音图标
     */
    updateSoundIcon() {
        const soundIcon = document.getElementById('soundIcon');
        const soundToggle = document.getElementById('soundToggle');

        if (soundIcon) {
            soundIcon.textContent = this.soundEnabled ? '🔊' : '🔇';
        }

        if (soundToggle) {
            soundToggle.checked = this.soundEnabled;
        }
    }

    /**
     * 🔔 初始化音频上下文
     */
    initAudioContext() {
        try {
            // 创建音频上下文
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('🎵 音频上下文已初始化');
        } catch (error) {
            console.warn('⚠️ 音频上下文初始化失败:', error);
            this.audioContext = null;
        }
    }

    /**
     * 🔔 播放提醒声音
     */
    playNotificationSound() {
        if (!this.soundEnabled) return;

        try {
            // 如果没有音频上下文，尝试初始化
            if (!this.audioContext) {
                this.initAudioContext();
            }

            if (!this.audioContext) {
                // 如果仍然没有音频上下文，使用HTML5 Audio作为备用
                this.playFallbackSound();
                return;
            }

            // 使用Web Audio API创建提醒音
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            // 连接音频节点
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            // 设置音频参数 - 清脆的提醒音
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime); // 800Hz
            oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime + 0.1); // 上升到1000Hz
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.2); // 回到800Hz

            // 设置音量包络
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.15);
            gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.25);
            gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.4);

            // 播放音频
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.4);

            console.log('🎵 播放提醒音');

        } catch (error) {
            console.warn('⚠️ 播放提醒音失败:', error);
            this.playFallbackSound();
        }
    }

    /**
     * 🔔 备用声音播放（HTML5 Audio）
     */
    playFallbackSound() {
        try {
            // 创建简单的Data URI音频
            const audioData = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+H2vn4jBSx+zPDZhzwIGGu+8qGWXgwOUare7K5eDgc2jdv1w3IlBSp6yO/cdTIGHWa98qGVXgoOTa3g7bBnGQ4+ltryxnQmBCt2xvHajjEIGGq99eSXXgwOUKve67BRIglLr+f7XGd2E1";

            const audio = new Audio(audioData);
            audio.volume = 0.3;
            audio.play().catch(e => console.warn('⚠️ 备用音频播放失败:', e));

        } catch (error) {
            console.warn('⚠️ 备用音频播放失败:', error);
        }
    }

    /**
     * 🔔 初始化声音设置UI
     */
    initSoundUI() {
        // 在DOM渲染完成后更新UI
        setTimeout(() => {
            this.updateSoundIcon();
        }, 100);
    }

    /**
     * 🔥 新增：发送命令到服务器
     */
    async sendCommand(command, data = {}) {
        try {
            console.log(`📤 发送命令: ${command}`);
            const response = await fetch(`/api/pool-crawler/${command}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            // 🔍 调试信息：显示服务器响应
            console.log('🔍 响应状态:', response.status);

            if (response.ok) {
                console.log(`✅ 命令 ${command} 执行成功`);
                if (result.data) {
                    this.updateStatusFromAPI(result.data);
                }
            } else {
                console.error(`❌ 命令 ${command} 执行失败:`, result.error);
                this.showNotification('error', '命令执行失败', result.error);
            }

            return result;
        } catch (error) {
            console.error(`❌ 发送命令 ${command} 失败:`, error);
            this.showNotification('error', '命令发送失败', error.message);
            throw error;
        }
    }

    /**
     * 🔥 新增：从API响应更新状态
     */
    updateStatusFromAPI(data) {
        if (data.status) {
            this.crawlerStatus = {
                ...this.crawlerStatus,
                ...data.status
            };
            this.updateCrawlerStatus();
        }

        if (data.discoveredPools) {
            this.discoveredPools = data.discoveredPools;
            this.updateDiscoveredPoolsTable();
        }

        if (data.qualifiedPools) {
            this.qualifiedPools = data.qualifiedPools;
            this.updateQualifiedPoolsTable();
        }

        this.updateStatsDisplay();
    }
}

// 确保全局可用
window.PoolCrawlerMonitor = PoolCrawlerMonitor; 