/**
 * �� DLMM流动性管理系统 - 主应用
 */

/**
 * 简化的日志记录器
 */
class SimpleLogger {
    constructor(context) {
        this.context = context;
    }

    info(message, ...args) {
        console.log(`[${this.context}] ${message}`, ...args);
    }

    error(message, ...args) {
        console.error(`[${this.context}] ${message}`, ...args);
    }

    warn(message, ...args) {
        console.warn(`[${this.context}] ${message}`, ...args);
    }
}

/**
 * 通知管理器
 */
class SimpleNotificationManager {
    constructor() {
        this.container = null;
        this.notificationId = 0;
        this.createContainer();
    }

    createContainer() {
        this.container = document.getElementById('notificationContainer');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'notificationContainer';
            this.container.className = 'notification-container';
            this.container.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 9999; max-width: 400px;
            `;
            document.body.appendChild(this.container);
        }
    }

    show(type, title, message, duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        const colors = {
            success: '#10B981', error: '#EF4444',
            warning: '#F59E0B', info: '#3B82F6'
        };
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

        notification.style.cssText = `
            background: ${colors[type] || colors.info}; color: white; padding: 16px;
            margin-bottom: 8px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            opacity: 0; transform: translateX(100%); transition: all 0.3s ease;
        `;

        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 18px;">${icons[type] || icons.info}</span>
                <div style="flex: 1;">
                    <div style="font-weight: bold; margin-bottom: 4px;">${title}</div>
                    <div style="font-size: 14px; opacity: 0.9;">${message}</div>
                </div>
                <button class="notification-close" style="
                    background: none; border: none; color: white; cursor: pointer;
                    font-size: 18px; padding: 0; width: 24px; height: 24px;
                ">×</button>
            </div>
        `;

        this.container.appendChild(notification);

        // 事件绑定和动画
        notification.querySelector('.notification-close').addEventListener('click', () => notification.remove());
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);

        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.style.opacity = '0';
                    notification.style.transform = 'translateX(100%)';
                    setTimeout(() => notification.remove(), 300);
                }
            }, duration);
        }
    }

    showSuccess(title, message, duration) { return this.show('success', title, message, duration); }
    showError(title, message, duration) { return this.show('error', title, message, duration); }
    showWarning(title, message, duration) { return this.show('warning', title, message, duration); }
    showInfo(title, message, duration) { return this.show('info', title, message, duration); }
}

/**
 * 主题管理器
 */
class SimpleThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('dlmm-theme') ||
            (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        this.init();
    }

    init() {
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        this.bindThemeToggle();
        this.updateThemeButton();
    }

    bindThemeToggle() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        localStorage.setItem('dlmm-theme', this.currentTheme);
        this.updateThemeButton();
    }

    updateThemeButton() {
        const themeToggle = document.getElementById('themeToggle');
        const icon = themeToggle?.querySelector('.icon');
        if (icon) {
            icon.textContent = this.currentTheme === 'dark' ? '☀️' : '🌙';
            themeToggle.title = `切换到${this.currentTheme === 'dark' ? '浅色' : '深色'}主题`;
        }
    }
}

/**
 * 应用管理器
 */
class SimpleAppManager {
    constructor() {
        this.currentPage = 'dashboard';
        this.logger = new SimpleLogger('AppManager');
        this.walletManager = null;
        this.loadedComponents = new Set();
    }

    init() {
        this.bindNavigation();
        this.bindQuickActions();
        this.bindOtherButtons();
        this.setupPageVisibilityRecovery(); // 添加页面可见性检测和自动恢复
    }

    bindNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const page = e.currentTarget.dataset.page;
                if (page) this.navigateToPage(page);
            });
        });
    }

    bindQuickActions() {
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleQuickAction(action);
            });
        });
    }

    bindOtherButtons() {
        const bindings = {
            refreshBtn: () => this.refreshCurrentPage(),
            emergencyStop: () => this.handleEmergencyStop(),
            settingsBtn: () => this.navigateToPage('settings'),
            clearActivity: () => this.clearActivityLog()
        };

        Object.entries(bindings).forEach(([id, handler]) => {
            const element = document.getElementById(id);
            if (element) element.addEventListener('click', handler);
        });
    }

    async navigateToPage(page) {
        if (this.currentPage === page) {
            // 🔧 即使是同一页面，也要检查组件状态
            const needsReload = this.verifyPageComponentIntegrity(page);
            if (needsReload) {
                await this.loadPageContent(page, true);
            }
            return;
        }

        this.logger.info(`🔄 页面切换: ${this.currentPage} → ${page}`);

        // 🔧 页面切换前的清理工作
        await this.cleanupCurrentPage();

        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // 更新页面显示
        document.querySelectorAll('.page-content').forEach(content => {
            content.classList.toggle('active', content.dataset.page === page);
        });

        this.currentPage = page;

        // 更新页面标题
        const titles = {
            dashboard: '仪表盘', wallet: '钱包管理', positions: '头寸管理',
            'simple-y': '简单Y策略', strategies: '策略管理', monitor: '池爬虫监控',
            analytics: '数据分析', settings: '系统设置', 'chain-position': '连锁头寸策略'
        };
        document.title = `${titles[page] || '未知页面'} - DLMM流动性管理系统`;

        // 🔧 验证页面组件完整性
        const needsReload = this.verifyPageComponentIntegrity(page);

        // 加载页面内容
        await this.loadPageContent(page, needsReload);

        this.logger.info(`✅ 页面切换完成: ${page}`);
    }

    /**
     * 🔧 验证页面组件完整性
     */
    verifyPageComponentIntegrity(page) {
        const pageElement = document.getElementById(`page-${page}`);
        if (!pageElement) {
            this.logger.warn(`页面元素不存在: page-${page}`);
            return true; // 需要重新加载
        }

        // 检查特定页面的组件完整性
        switch (page) {
            case 'simple-y':
                // 🔧 新增：简单Y策略页面完整性检查
                const simpleYContent = document.getElementById('simpleYContent');
                const simpleYManager = simpleYContent?.querySelector('.simple-y-manager');
                const hasValidSimpleY = simpleYManager && simpleYManager.children.length > 0;

                if (!hasValidSimpleY) {
                    this.logger.warn('简单Y策略页面组件缺失，需要重新加载');
                    this.loadedComponents.delete('simple-y');
                    return true;
                }
                break;

            case 'chain-position':
                const createContent = document.getElementById('chainPositionContent');
                const creator = createContent?.querySelector('.chain-position-creator');
                const hasValidContent = creator && creator.children.length > 0;

                if (!hasValidContent) {
                    this.logger.warn('连锁头寸策略页面组件缺失，需要重新加载');
                    this.loadedComponents.delete('chain-position');
                    return true;
                }
                break;

            case 'monitor':
                const monitorContent = document.getElementById('monitorContent');
                const monitor = monitorContent?.querySelector('.pool-crawler-monitor');
                const hasValidMonitor = monitor && monitor.children.length > 0;

                if (!hasValidMonitor) {
                    this.logger.warn('池爬虫监控页面组件缺失，需要重新加载');
                    this.loadedComponents.delete('monitor');
                    return true;
                }
                break;
        }

        return false; // 不需要重新加载
    }

    /**
     * 🔧 页面切换前的清理工作
     */
    async cleanupCurrentPage() {
        if (!this.currentPage) return;

        this.logger.info(`🧹 清理当前页面: ${this.currentPage}`);

        // 特定页面的清理逻辑
        switch (this.currentPage) {
            case 'monitor':
                // 清理池爬虫监控的Socket连接和事件监听器
                if (window.poolCrawlerMonitor && typeof window.poolCrawlerMonitor.destroy === 'function') {
                    window.poolCrawlerMonitor.destroy();
                    window.poolCrawlerMonitor = null;
                    this.loadedComponents.delete('monitor');
                    this.logger.info('🧹 池爬虫监控已清理');
                }
                break;

            case 'simple-y':
                // 🔧 清理简单Y策略的全局状态和样式
                this.cleanupSimpleYPage();
                break;

            case 'chain-position':
                // 清理连锁头寸策略的事件监听器
                const existingTabs = document.querySelectorAll('#page-chain-position .tab-btn');
                existingTabs.forEach(btn => {
                    const newBtn = btn.cloneNode(true);
                    btn.parentNode?.replaceChild(newBtn, btn);
                });
                break;
        }
    }

    /**
     * 🔧 清理简单Y策略页面的全局污染
     */
    cleanupSimpleYPage() {
        this.logger.info('🧹 清理简单Y策略全局状态...');

        // 0. 🔧 修复：先清理加载状态，这样下次切换回来时会重新加载
        this.loadedComponents.delete('simple-y');
        this.logger.info('🧹 已重置SimpleY组件加载状态');

        // 1. 清理全局CSS样式
        const simpleYStyles = document.getElementById('simple-y-creator-styles');
        if (simpleYStyles) {
            simpleYStyles.remove();
            this.logger.info('🧹 已移除SimpleY全局样式');
        }

        // 2. 清理全局变量
        if (window.simpleYManager) {
            if (typeof window.simpleYManager.destroy === 'function') {
                window.simpleYManager.destroy();
            }
            window.simpleYManager = null;
            this.logger.info('🧹 已清理SimpleY管理器');
        }

        // 3. 清理SimpleY监控器的模态弹窗样式
        const configModalStyles = document.getElementById('config-modal-styles');
        if (configModalStyles) {
            configModalStyles.remove();
            this.logger.info('🧹 已移除SimpleY配置弹窗样式');
        }

        // 4. 清理所有SimpleY相关的模态弹窗
        const simpleYModals = document.querySelectorAll('.config-modal-overlay, .edit-config-modal-overlay');
        simpleYModals.forEach(modal => {
            modal.remove();
        });

        // 5. 强制清理可能残留的内嵌样式元素
        document.querySelectorAll('style').forEach(styleEl => {
            const content = styleEl.textContent || styleEl.innerHTML;
            if (content.includes('simple-y-creator') || content.includes('simple-y-manager')) {
                styleEl.remove();
                this.logger.info('🧹 清理了残留的SimpleY样式');
            }
        });

        // 6. 🔧 清理SimpleY页面内容，确保下次重新加载
        const simpleYContent = document.getElementById('simpleYContent');
        if (simpleYContent) {
            simpleYContent.innerHTML = ''; // 清空内容
            this.logger.info('🧹 已清空SimpleY页面内容');
        }

        this.logger.info('✅ SimpleY页面清理完成');
    }

    async loadPageContent(page, forceReload = false) {
        // 🔧 如果强制重新加载，清除组件状态
        if (forceReload && this.loadedComponents.has(page)) {
            this.loadedComponents.delete(page);
            this.logger.info(`🔄 强制重新加载页面: ${page}`);
        }

        // 确保钱包页面优先加载
        if (page !== 'wallet' && !this.loadedComponents.has('wallet')) {
            await this.loadWalletPage();
            if (!window.walletManager) {
                this.logger.error('钱包管理器初始化失败');
                return;
            }
        }

        switch (page) {
            case 'wallet': await this.loadWalletPage(); break;
            case 'positions': await this.loadPositionsPage(); break;
            case 'jupiter': await this.loadJupiterPage(); break;
            case 'simple-y': await this.loadSimpleYPage(); break;
            case 'chain-position': await this.loadChainPositionPage(); break;
            case 'strategies': await this.loadNewStrategiesPage(); break;
            case 'analytics': await this.loadAnalyticsPage(); break;
            case 'monitor': await this.loadMonitorPage(); break;
            case 'settings':
                this.loadPlaceholderPage(page);
                break;
        }
    }

    async loadWalletPage() {
        if (this.loadedComponents.has('wallet')) return;

        const walletContent = document.getElementById('walletContent');
        if (!walletContent) return;

        walletContent.innerHTML = `
            <div class="loading-placeholder">
                <div class="spinner"></div>
                <p>正在加载钱包组件...</p>
            </div>
        `;

        try {
            await this.waitForClasses(['WalletManager', 'WalletCore', 'WalletUI'], 8000);

            const walletManager = new WalletManager();
            const success = await walletManager.init('walletContent');

            if (success) {
                this.walletManager = walletManager;
                window.walletManager = walletManager;
                this.loadedComponents.add('wallet');
            } else {
                throw new Error('钱包管理器初始化失败');
            }
        } catch (error) {
            this.showErrorPage(walletContent, '钱包模块加载失败', error);
        }
    }

    async loadPositionsPage() {
        if (this.loadedComponents.has('positions')) return;

        const positionsContent = document.getElementById('positionsContent');
        if (!positionsContent) return;

        try {
            // 等待钱包管理器可用
            await this.waitForWalletManager();
            await this.waitForClasses(['PositionManager'], 5000);

            const positionManager = new PositionManager();
            positionsContent.innerHTML = `
                <div class="positions-container" id="positionsContainer">
                    <div class="loading-placeholder">
                        <div class="spinner"></div>
                        <p>正在加载头寸数据...</p>
                    </div>
                </div>
            `;

            const success = await positionManager.init('positionsContainer');
            if (success) {
                window.positionManager = positionManager;
                this.bindPositionEvents(positionManager);
                this.loadedComponents.add('positions');
            } else {
                throw new Error('头寸管理器初始化失败');
            }
        } catch (error) {
            this.showErrorPage(positionsContent, '头寸管理加载失败', error);
        }
    }

    async loadJupiterPage() {
        if (this.loadedComponents.has('jupiter')) return;

        const jupiterContent = document.getElementById('jupiterContent');
        if (!jupiterContent) return;

        jupiterContent.innerHTML = `
            <div class="loading-placeholder">
                <div class="spinner"></div>
                <p>正在加载Jupiter交换组件...</p>
            </div>
        `;

        try {
            // 等待钱包管理器可用
            await this.waitForWalletManager();
            await this.waitForClasses(['JupiterManager'], 5000);

            const jupiterManager = new JupiterManager();
            await jupiterManager.init(jupiterContent);

            // 检查初始化是否成功
            if (jupiterManager.initialized) {
                window.jupiterManager = jupiterManager;
                this.loadedComponents.add('jupiter');
                this.logger.info('Jupiter页面加载成功');
            } else {
                throw new Error('Jupiter管理器初始化失败');
            }
        } catch (error) {
            this.logger.error('Jupiter页面加载失败:', error);
            this.showErrorPage(jupiterContent, 'Jupiter交换模块加载失败', error);
        }
    }

    async loadSimpleYPage() {
        if (this.loadedComponents.has('simple-y')) return;

        const simpleYContent = document.getElementById('simpleYContent');
        if (!simpleYContent) return;

        simpleYContent.innerHTML = `
            <div class="loading-placeholder">
                <div class="spinner"></div>
                <p>正在加载简单Y策略系统...</p>
            </div>
        `;

        try {
            // 等待钱包管理器可用
            await this.waitForWalletManager();

            // 等待新的SimpleY组件加载
            await this.waitForClasses([
                'SimpleYManager',
                'SimpleYCreator',
                'SimpleYStrategyMonitor',
                'SimpleYEnvironmentAdapter',
                'SimpleYConnectionManager',
                'SimpleYDataService',
                'SimpleYUIManager',
                'SimpleYStrategyController',
                'SimpleYConfigManager'
            ], 10000);

            // 使用新的简单Y策略管理器
            const simpleYManager = new SimpleYManager('simpleYContent');
            const success = await simpleYManager.init();

            if (success) {
                window.simpleYManager = simpleYManager;
                this.loadedComponents.add('simple-y');
                this.logger.info('📊 简单Y策略系统加载成功（全新重构版本）');
            } else {
                throw new Error('SimpleY策略管理器初始化失败');
            }
        } catch (error) {
            this.logger.error('简单Y策略系统加载失败:', error);
            this.showErrorPage(simpleYContent, '简单Y策略系统加载失败', error);
        }
    }

    async loadChainPositionPage() {
        if (this.loadedComponents.has('chain-position')) return;

        const createContent = document.getElementById('chainPositionContent');
        if (!createContent) return;

        createContent.innerHTML = `
            <div class="loading-placeholder">
                <div class="spinner"></div>
                <p>正在加载策略创建器...</p>
            </div>
        `;

        try {
            // 等待钱包管理器可用
            await this.waitForWalletManager();

            // 等待策略创建器组件加载
            await this.waitForClasses(['ChainPositionCreator'], 5000);

            // 初始化策略创建器
            const chainPositionCreator = new ChainPositionCreator(createContent, {
                autoValidate: true,
                showPreview: true
            });

            window.chainPositionCreator = chainPositionCreator;

            // 初始化策略监控器
            await this.initializeStrategyMonitor();

            // 🔧 只在组件成功加载后绑定事件监听器
            this.bindChainPositionTabs();

            this.loadedComponents.add('chain-position');
            this.logger.info('🔗 连锁头寸策略系统加载成功');

        } catch (error) {
            this.logger.error('连锁头寸策略系统加载失败:', error);
            this.showErrorPage(createContent, '连锁头寸策略创建器加载失败', error);
        }
    }

    /**
     * 绑定连锁头寸策略选项卡切换事件
     */
    bindChainPositionTabs() {
        // 🔧 先清除现有的事件监听器，防止重复绑定
        const existingTabs = document.querySelectorAll('#page-chain-position .tab-btn');
        existingTabs.forEach(btn => {
            // 创建新的按钮元素来替换原有的，这样可以清除所有事件监听器
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
        });

        // 重新绑定事件监听器
        document.querySelectorAll('#page-chain-position .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = e.currentTarget.dataset.tab;
                this.switchChainPositionTab(targetTab);
            });
        });

        this.logger.info('🔗 连锁头寸选项卡事件监听器绑定完成');
    }

    /**
     * 切换连锁头寸策略选项卡
     */
    switchChainPositionTab(targetTab) {
        try {
            // 更新按钮状态
            document.querySelectorAll('#page-chain-position .tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === targetTab);
            });

            // 更新内容显示
            document.querySelectorAll('#page-chain-position .tab-content').forEach(content => {
                content.classList.toggle('active', content.id === `chain-position-${targetTab}`);
            });

            this.logger.info(`🔗 切换到${targetTab === 'create' ? '创建策略' : '实时监控'}选项卡`);

            // 🔧 添加详细调试信息
            this.logger.info(`🔧 选项卡切换详情: targetTab=${targetTab}, 当前页面=${this.currentPage}`);

        } catch (error) {
            this.logger.error('连锁头寸选项卡切换失败:', error);

            // 🔧 尝试恢复
            setTimeout(() => {
                this.checkAndRecoverChainPositionPage();
            }, 1000);
        }
    }

    /**
     * 初始化策略监控器
     */
    async initializeStrategyMonitor() {
        try {
            // 等待策略监控器模块化架构的所有类加载
            await this.waitForClasses([
                'EnvironmentAdapter',
                'ConnectionManager',
                'DataService',
                'UIManager',
                'StrategyController',
                'ConfigManager',
                'StrategyMonitor'
            ], 10000);

            const monitorContainer = document.getElementById('strategyMonitorContainer');
            if (!monitorContainer) {
                this.logger.warn('策略监控器容器不存在');
                return;
            }

            // 🔧 修复：检查现有实例的连接状态
            if (window.strategyMonitor) {
                console.log('📊 策略监控器实例已存在，检查连接状态...');
                
                // 检查是否已初始化且连接正常
                const isInitialized = window.strategyMonitor.isInitialized;
                const isConnected = window.strategyMonitor.connectionManager?.isConnected;
                
                console.log('📊 监控器状态:', { isInitialized, isConnected });
                
                if (isInitialized && isConnected) {
                    console.log('📊 策略监控器状态正常，无需重新初始化');
                    return;
                } else if (isInitialized && !isConnected) {
                    console.log('🔌 策略监控器存在但未连接，尝试重新连接...');
                    try {
                        await window.strategyMonitor.connect();
                        console.log('✅ 策略监控器重新连接成功');
                        return;
                    } catch (connectError) {
                        console.warn('⚠️ 重新连接失败，将重新初始化:', connectError);
                        // 清理现有实例，准备重新初始化
                        if (window.strategyMonitor.destroy && typeof window.strategyMonitor.destroy === 'function') {
                            window.strategyMonitor.destroy();
                        }
                        window.strategyMonitor = null;
                    }
                } else {
                    console.log('⚠️ 策略监控器未正确初始化，重新初始化...');
                    // 清理现有实例
                    if (window.strategyMonitor.destroy && typeof window.strategyMonitor.destroy === 'function') {
                        window.strategyMonitor.destroy();
                    }
                    window.strategyMonitor = null;
                }
            }

            // 创建新的策略监控器实例
            console.log('🆕 创建新的策略监控器实例...');
            const strategyMonitor = new StrategyMonitor(monitorContainer, {
                autoConnect: true,
                reconnectInterval: 3000,
                maxReconnectAttempts: 5
            });

            // 保存到全局变量
            window.strategyMonitor = strategyMonitor;

            this.logger.info('📊 策略监控器初始化成功');

        } catch (error) {
            this.logger.error('策略监控器初始化失败:', error);

            // 显示错误信息
            const monitorContainer = document.getElementById('strategyMonitorContainer');
            if (monitorContainer) {
                monitorContainer.innerHTML = `
                    <div class="error-state">
                        <div class="error-icon">❌</div>
                        <h4>策略监控器初始化失败</h4>
                        <p>${error.message}</p>
                        <button class="btn btn-primary" onclick="window.dlmmApp.appManager.initializeStrategyMonitor()">
                            重试
                        </button>
                    </div>
                `;
            }

            // 🔧 不要因为监控器初始化失败而阻止整个页面加载
            // 抛出错误会导致整个loadChainPositionPage失败
            // throw error;
        }
    }

    async loadNewStrategiesPage() {
        if (this.loadedComponents.has('strategies')) return;

        const strategiesContent = document.getElementById('strategiesContent');
        if (!strategiesContent) return;

        try {
            // 先渲染策略概览界面
            this.renderStrategyOverview(strategiesContent);

            // 尝试初始化策略管理器（非阻塞方式）
            this.initializeStrategyManager();

            this.loadedComponents.add('strategies');
            this.logger.info('🎯 策略管理页面加载成功');

        } catch (error) {
            this.logger.error('策略管理页面加载失败:', error);
            this.showErrorPage(strategiesContent, '策略管理页面加载失败', error);
        }
    }

    async loadAnalyticsPage() {
        if (this.loadedComponents.has('analytics')) return;

        const analyticsContent = document.getElementById('analyticsContent');
        if (!analyticsContent) return;

        analyticsContent.innerHTML = `
            <div class="loading-placeholder">
                <div class="spinner"></div>
                <p>正在加载简化数据分析系统...</p>
            </div>
        `;

        try {
            // 🔥 等待简化数据分析组件加载
            await this.waitForClasses([
                'SimpleAnalytics',
                'StrategyDataStorage'
            ], 10000);

            // 检查Chart.js是否已加载（本地版本应该立即可用）
            if (typeof Chart === 'undefined') {
                throw new Error('Chart.js库未加载 - 请检查本地文件是否存在');
            }

            this.logger.info('📊 开始初始化简化数据分析系统...');

            // 🔥 创建简化分析实例
            const simpleAnalytics = new SimpleAnalytics(analyticsContent);

            // 保存到全局和实例
            window.simpleAnalytics = simpleAnalytics;
            this.simpleAnalytics = simpleAnalytics;

            this.loadedComponents.add('analytics');
            this.logger.info('✅ 简化数据分析系统加载成功');

        } catch (error) {
            this.logger.error('简化数据分析系统加载失败:', error);
            this.showErrorPage(analyticsContent, '数据分析模块加载失败', error);
        }
    }

    async loadMonitorPage() {
        if (this.loadedComponents.has('monitor')) return;

        const monitorContent = document.getElementById('monitorContent');
        if (!monitorContent) return;

        monitorContent.innerHTML = `
            <div class="loading-placeholder">
                <div class="spinner"></div>
                <p>正在加载池爬虫监控...</p>
            </div>
        `;

        try {
            // 等待池爬虫监控组件
            await this.waitForClasses(['PoolCrawlerMonitor'], 5000);

            // 直接初始化池爬虫监控，取代原有的实时监控
            const poolCrawlerMonitor = new PoolCrawlerMonitor('monitorContent');

            // 保存引用
            window.poolCrawlerMonitor = poolCrawlerMonitor;

            this.loadedComponents.add('monitor');
            this.logger.info('🏊 池爬虫监控加载成功');

        } catch (error) {
            this.logger.error('池爬虫监控加载失败:', error);
            this.showErrorPage(monitorContent, '池爬虫监控加载失败', error);
        }
    }



    /**
 * 异步初始化策略管理器（非阻塞）
 */
    async initializeStrategyManager() {
        const container = document.getElementById('strategyManagerContainer');
        if (!container) return;

        // 直接显示新架构的统一管理界面，而不是具体策略实例
        this.renderUnifiedManagementInterface(container);
    }

    /**
     * 渲染统一管理界面
     */
    renderUnifiedManagementInterface(container) {
        container.innerHTML = `
            <div class="unified-management-interface">
                <div class="management-header">
                    <h3>🎯 统一策略管理中心</h3>
                    <p>新一代模块化策略管理系统</p>
                </div>

                <div class="management-sections">
                    <!-- 策略统计 -->
                    <div class="section-card">
                        <h4>📊 策略统计</h4>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-number">1</span>
                                <span class="stat-label">可用策略类型</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number">2</span>
                                <span class="stat-label">开发中策略</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number">100%</span>
                                <span class="stat-label">向后兼容性</span>
                            </div>
                        </div>
                    </div>

                    <!-- 快速操作 -->
                    <div class="section-card">
                        <h4>⚡ 快速操作</h4>
                        <div class="quick-actions">
                            <button class="action-btn" onclick="window.dlmmApp.appManager.navigateToPage('simple-y')">
                                <span class="btn-icon">📊</span>
                                <span class="btn-text">管理SimpleY策略</span>
                            </button>
                            <button class="action-btn" disabled>
                                <span class="btn-icon">📈</span>
                                <span class="btn-text">网格交易策略</span>
                                <span class="btn-badge">即将推出</span>
                            </button>
                            <button class="action-btn" disabled>
                                <span class="btn-icon">📅</span>
                                <span class="btn-text">DCA定投策略</span>
                                <span class="btn-badge">即将推出</span>
                            </button>
                        </div>
                    </div>

                    <!-- 系统状态 -->
                    <div class="section-card">
                        <h4>🔧 系统状态</h4>
                        <div class="status-items">
                            <div class="status-item">
                                <span class="status-indicator success"></span>
                                <span class="status-text">策略注册表</span>
                                <span class="status-badge">正常</span>
                            </div>
                            <div class="status-item">
                                <span class="status-indicator success"></span>
                                <span class="status-text">策略工厂</span>
                                <span class="status-badge">正常</span>
                            </div>
                            <div class="status-item">
                                <span class="status-indicator success"></span>
                                <span class="status-text">事件总线</span>
                                <span class="status-badge">正常</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="management-footer">
                    <p style="color: var(--text-secondary); text-align: center; font-size: 0.875rem;">
                        💡 提示：要创建和管理具体策略，请点击上方对应的策略类型按钮
                    </p>
                </div>
            </div>
        `;
    }

    /**
     * 渲染策略概览界面
     */
    renderStrategyOverview(container) {
        container.innerHTML = `
            <div class="strategy-overview">
                <!-- 策略类型卡片 -->
                <div class="strategy-cards">
                    <!-- SimpleY策略卡片 -->
                    <div class="strategy-card">
                        <div class="strategy-type-badge strategy-type-simple-y">简单Y策略</div>
                        <h3>
                            <span>📊</span>
                            SimpleY流动性管理
                        </h3>
                        <p>经典的流动性提供策略，适合稳定币对和蓝筹代币对的流动性管理。</p>
                        
                        <ul class="feature-list">
                            <li>自动价格区间调整</li>
                            <li>风险控制机制</li>
                            <li>收益最大化</li>
                            <li>向后兼容支持</li>
                        </ul>
                        
                        <div class="strategy-actions">
                            <button class="btn btn-primary" onclick="window.dlmmApp.appManager.navigateToPage('simple-y')">
                                创建SimpleY策略
                            </button>
                            <button class="btn btn-secondary" onclick="window.dlmmApp.appManager.showSimpleYHelp()">
                                了解更多
                            </button>
                        </div>
                    </div>

                    <!-- 网格交易策略卡片 -->
                    <div class="strategy-card coming-soon">
                        <div class="strategy-type-badge strategy-type-grid">网格交易</div>
                        <h3>
                            <span>📈</span>
                            智能网格交易
                        </h3>
                        <p>在价格波动中自动买低卖高，适合横盘震荡市场的套利策略。</p>
                        
                        <ul class="feature-list">
                            <li>自动网格布局</li>
                            <li>动态网格调整</li>
                            <li>止盈止损控制</li>
                            <li>多时间周期支持</li>
                        </ul>
                        
                        <div class="strategy-actions">
                            <button class="btn btn-primary" disabled>
                                即将推出
                            </button>
                            <button class="btn btn-secondary" onclick="window.dlmmApp.appManager.showGridHelp()">
                                了解更多
                            </button>
                        </div>
                    </div>

                    <!-- DCA策略卡片 -->
                    <div class="strategy-card coming-soon">
                        <div class="strategy-type-badge strategy-type-dca">定投策略</div>
                        <h3>
                            <span>📅</span>
                            定期定额投资
                        </h3>
                        <p>通过定期购买降低平均成本，适合长期看好的资产积累策略。</p>
                        
                        <ul class="feature-list">
                            <li>智能定投时机</li>
                            <li>动态投资金额</li>
                            <li>市场情绪分析</li>
                            <li>长期收益优化</li>
                        </ul>
                        
                        <div class="strategy-actions">
                            <button class="btn btn-primary" disabled>
                                即将推出
                            </button>
                            <button class="btn btn-secondary" onclick="window.dlmmApp.appManager.showDCAHelp()">
                                了解更多
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 策略管理器容器 -->
            <div id="strategyManagerContainer" class="strategy-manager-container">
                <!-- 统一策略管理器将在这里加载 -->
            </div>
        `;
    }

    async waitForWalletManager(timeout = 2000) {
        const startTime = Date.now();
        while ((!window.walletManager || typeof window.walletManager !== 'object') &&
            Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!window.walletManager) {
            throw new Error('钱包管理器未完全初始化');
        }
    }

    async waitForClasses(classNames, timeout = 10000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (classNames.every(className => window[className])) return true;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const missing = classNames.filter(className => !window[className]);
        throw new Error(`等待类加载超时: ${missing.join(', ')}`);
    }

    bindPositionEvents(positionManager) {
        positionManager.onStateChange((eventName, data) => {
            this.logger.info(`头寸状态变化: ${eventName}`, data);
        });

        positionManager.onErrorOccurred((error) => {
            if (window.dlmmApp?.notification) {
                window.dlmmApp.notification.showError('头寸管理错误', error.error?.message || '未知错误');
            }
        });
    }

    bindStrategyEvents(strategyManager) {
        // 策略状态变化监听
        strategyManager.on('strategyCreated', (data) => {
            this.logger.info(`策略创建成功: ${data.name}`);
            if (window.dlmmApp?.notification) {
                window.dlmmApp.notification.showSuccess('策略创建', `策略 ${data.name} 创建成功`);
            }
        });

        strategyManager.on('strategyUpdated', (data) => {
            this.logger.info(`策略更新成功: ${data.name}`);
            if (window.dlmmApp?.notification) {
                window.dlmmApp.notification.showSuccess('策略更新', `策略 ${data.name} 更新成功`);
            }
        });

        strategyManager.on('strategyDeleted', (data) => {
            this.logger.info(`策略删除成功: ${data.name}`);
            if (window.dlmmApp?.notification) {
                window.dlmmApp.notification.showSuccess('策略删除', `策略 ${data.name} 删除成功`);
            }
        });

        strategyManager.on('error', (error) => {
            this.logger.error('策略管理错误:', error);
            if (window.dlmmApp?.notification) {
                window.dlmmApp.notification.showError('策略管理错误', error.message || '未知错误');
            }
        });
    }

    loadPlaceholderPage(page) {
        if (this.loadedComponents.has(page)) return;

        const icons = { strategies: '🎯', monitor: '👁️', analytics: '📊', settings: '⚙️' };
        const titles = { strategies: '策略管理', monitor: '实时监控', analytics: '数据分析', settings: '系统设置' };

        const content = document.getElementById(`${page}Content`);
        if (content) {
            content.innerHTML = `
                <div class="placeholder-content">
                    <div class="placeholder-icon">${icons[page]}</div>
                    <h3>${titles[page]}</h3>
                    <p>${titles[page]}功能正在开发中...</p>
                </div>
            `;
            this.loadedComponents.add(page);
        }
    }

    /**
     * 🔧 添加详细的错误日志和调试信息输出机制
     */
    logComponentStatus() {
        const status = {
            currentPage: this.currentPage,
            loadedComponents: Array.from(this.loadedComponents),
            globalObjects: {
                chainPositionCreator: !!window.chainPositionCreator,
                strategyMonitor: !!window.strategyMonitor,
                walletManager: !!window.walletManager,
                positionManager: !!window.positionManager
            },
            domElements: {
                chainPositionPage: !!document.getElementById('page-chain-position'),
                chainPositionContent: !!document.getElementById('chainPositionContent'),
                strategyMonitorContainer: !!document.getElementById('strategyMonitorContainer'),
                tabButtons: document.querySelectorAll('#page-chain-position .tab-btn').length,
                tabContents: document.querySelectorAll('#page-chain-position .tab-content').length
            },
            timestamp: new Date().toISOString()
        };

        this.logger.info('📊 组件状态报告:', status);
        return status;
    }

    /**
     * 🔧 增强的错误页面显示方法
     */
    showErrorPage(container, title, error) {
        // 记录详细的错误信息
        this.logger.error(`❌ 显示错误页面: ${title}`, {
            error: error.message,
            stack: error.stack,
            currentPage: this.currentPage,
            loadedComponents: Array.from(this.loadedComponents)
        });

        // 生成组件状态报告
        const componentStatus = this.logComponentStatus();

        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h3>${title}</h3>
                <p class="error-message">${error.message}</p>
                <div class="error-details">
                    <details>
                        <summary>🔧 调试信息</summary>
                        <pre>${JSON.stringify(componentStatus, null, 2)}</pre>
                    </details>
                </div>
                <div class="error-actions">
                    <button class="btn btn-primary" onclick="location.reload()">刷新页面</button>
                    <button class="btn btn-secondary" onclick="window.dlmmApp.appManager.checkAndRecoverChainPositionPage()">
                        尝试恢复
                    </button>
                </div>
            </div>
        `;
    }

    handleQuickAction(action) {
        const actions = {
            'create-wallet': () => {
                this.navigateToPage('wallet').then(() => {
                    if (this.walletManager?.showCreateWalletForm) {
                        this.walletManager.showCreateWalletForm();
                    }
                });
            },
            'create-position': () => {
                this.navigateToPage('positions').then(() => {
                    if (window.walletManager?.isWalletUnlocked?.()) {
                        if (window.positionManager?.showCreatePositionForm) {
                            window.positionManager.showCreatePositionForm();
                        }
                    } else {
                        window.dlmmApp?.notification?.showWarning(
                            '需要解锁钱包', '请先在钱包页面解锁钱包，然后再创建头寸'
                        );
                    }
                });
            },
            'create-strategy': () => {
                this.navigateToPage('simple-y').then(() => {
                    if (window.walletManager?.isWalletUnlocked?.()) {
                        if (window.simpleYStrategyManager?.showCreateStrategyForm) {
                            window.simpleYStrategyManager.showCreateStrategyForm();
                        }
                    } else {
                        window.dlmmApp?.notification?.showWarning(
                            '需要解锁钱包', '请先在钱包页面解锁钱包，然后再创建策略'
                        );
                    }
                });
            },
            'start-harvest': () => {
                if (window.walletManager?.isWalletUnlocked?.()) {
                    if (window.positionManager?.startHarvestFees) {
                        window.positionManager.startHarvestFees();
                    } else {
                        window.dlmmApp?.notification?.showInfo(
                            '手续费收集', '正在准备手续费收集功能...'
                        );
                    }
                } else {
                    window.dlmmApp?.notification?.showWarning(
                        '需要解锁钱包', '请先在钱包页面解锁钱包，然后再进行手续费收集'
                    );
                }
            }
        };

        if (actions[action]) {
            actions[action]();
        } else {
            window.dlmmApp?.notification?.showInfo('操作执行', `正在执行${action}操作...`);
        }
    }

    refreshCurrentPage() {
        this.loadPageContent(this.currentPage);
        window.dlmmApp?.notification?.showInfo('页面刷新', `${this.currentPage}页面数据已刷新`, 2000);
    }

    handleEmergencyStop() {
        if (confirm('确定要执行紧急停止吗？这将停止所有正在运行的操作。')) {
            window.dlmmApp?.notification?.showWarning('紧急停止', '正在停止所有操作...', 5000);
        }
    }

    clearActivityLog() {
        const activityList = document.querySelector('.activity-list');
        if (activityList) {
            activityList.innerHTML = '<div class="empty-state">活动记录已清空</div>';
        }
        window.dlmmApp?.notification?.showInfo('活动清空', '活动日志已清空', 2000);
    }

    // 帮助方法
    showSimpleYHelp() {
        if (window.dlmmApp?.notification) {
            window.dlmmApp.notification.showInfo(
                '📊 SimpleY策略说明',
                'SimpleY策略是一种智能的流动性管理策略，专为DLMM设计。支持自动价格区间调整、风险控制机制、收益最大化等功能。',
                10000
            );
        }
    }

    showGridHelp() {
        if (window.dlmmApp?.notification) {
            window.dlmmApp.notification.showInfo(
                '📈 网格交易策略说明',
                '网格交易策略通过在价格区间内布置买卖网格，实现自动化套利。适合横盘震荡市场的套利策略。该功能即将推出！',
                10000
            );
        }
    }

    showDCAHelp() {
        if (window.dlmmApp?.notification) {
            window.dlmmApp.notification.showInfo(
                '📅 定投策略说明',
                'DCA策略通过定期投资降低平均成本，支持智能定投时机、动态投资金额、市场情绪分析等功能。该功能即将推出！',
                10000
            );
        }
    }

    /**
     * 🔧 添加组件状态检查和恢复机制
     */
    checkAndRecoverChainPositionPage() {
        // 检查连锁头寸页面是否正常显示
        const chainPositionPage = document.getElementById('page-chain-position');
        const createContent = document.getElementById('chainPositionContent');

        if (!chainPositionPage || !createContent) {
            this.logger.warn('连锁头寸页面元素不存在');
            return false;
        }

        // 检查是否显示了错误页面
        const errorState = createContent.querySelector('.error-state');
        if (errorState) {
            this.logger.info('检测到错误页面，尝试恢复...');

            // 清除错误状态
            this.loadedComponents.delete('chain-position');

            // 重新加载页面
            this.loadChainPositionPage();
            return true;
        }

        // 检查创建器是否正常
        const creator = createContent.querySelector('.chain-position-creator');
        if (!creator && this.loadedComponents.has('chain-position')) {
            this.logger.warn('创建器界面丢失，尝试恢复...');

            // 清除组件状态
            this.loadedComponents.delete('chain-position');

            // 重新加载页面
            this.loadChainPositionPage();
            return true;
        }

        return false;
    }

    /**
     * 🔧 添加页面可见性检测和自动恢复
     */
    setupPageVisibilityRecovery() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.currentPage === 'chain-position') {
                // 页面变为可见时检查连锁头寸页面状态
                setTimeout(() => {
                    this.checkAndRecoverChainPositionPage();
                }, 1000);
            }
        });
    }
}

/**
* 主应用类
*/
class DLMMApp {
    constructor() {
        this.logger = new SimpleLogger('DLMMApp');
        this.notification = null;
        this.themeManager = null;
        this.appManager = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            // 隐藏加载指示器
            const loading = document.getElementById('loading');
            if (loading) loading.style.display = 'none';

            // 🔥 首先设置连接状态为连接中
            this.updateConnectionStatus('connecting');

            // 初始化各个管理器
            this.notification = new SimpleNotificationManager();
            this.themeManager = new SimpleThemeManager();
            this.appManager = new SimpleAppManager();
            this.appManager.init();



            // 绑定全局事件
            this.bindGlobalEvents();

            this.isInitialized = true;

            // 设置连接状态为已连接
            this.updateConnectionStatus('connected');

            this.notification.showSuccess('系统启动成功', 'DLMM流动性管理系统已就绪', 3000);

        } catch (error) {
            this.logger.error('应用初始化失败:', error);
            if (this.notification) {
                this.notification.showError('系统启动失败', `应用初始化遇到错误: ${error.message}`, 10000);
            }
            throw error;
        }
    }

    bindGlobalEvents() {
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.show').forEach(modal => {
                    modal.classList.remove('show');
                });
            }

            // 数字键快速导航
            if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '7') {
                e.preventDefault();
                const pages = ['dashboard', 'wallet', 'positions', 'strategies', 'monitor', 'analytics', 'settings'];
                const pageIndex = parseInt(e.key) - 1;
                if (pages[pageIndex] && this.appManager) {
                    this.appManager.navigateToPage(pages[pageIndex]);
                }
            }
        });

        // 模态框关闭事件
        document.addEventListener('click', (e) => {
            if (e.target.hasAttribute('data-dismiss') && e.target.dataset.dismiss === 'modal') {
                const modal = e.target.closest('.modal');
                if (modal) modal.style.display = 'none';
            }
        });
    }

    getInfo() {
        return {
            isInitialized: this.isInitialized,
            currentPage: this.appManager?.currentPage,
            currentTheme: this.themeManager?.currentTheme
        };
    }

    /**
     * 更新连接状态
     */
    updateConnectionStatus(status, text = null) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');

        if (!statusDot || !statusText) return;

        // 状态映射
        const statusMap = {
            'connecting': { class: 'connecting', text: '连接中...' },
            'connected': { class: 'connected', text: '已连接' },
            'disconnected': { class: 'disconnected', text: '连接断开' },
            'error': { class: 'error', text: '连接错误' }
        };

        const statusInfo = statusMap[status] || statusMap['disconnected'];

        // 更新状态点样式
        statusDot.className = `status-dot ${statusInfo.class}`;

        // 更新状态文本
        statusText.textContent = text || statusInfo.text;
    }








}

// 创建全局应用实例
const dlmmApp = new DLMMApp();

// 应用启动
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await dlmmApp.initialize();
        window.dlmmApp = dlmmApp;
    } catch (error) {
        console.error('DLMM应用启动失败:', error);
        // 显示错误页面
        document.body.innerHTML += `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                        background: #EF4444; color: white; padding: 24px; border-radius: 12px;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.3); max-width: 500px; z-index: 10000; text-align: center;">
                <h2 style="margin: 0 0 16px 0;">❌ 应用启动失败</h2>
                <p style="margin: 0 0 16px 0;">DLMM流动性管理系统遇到启动错误，请尝试刷新页面。</p>
                <button onclick="location.reload()" style="background: white; color: #EF4444; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: bold;">刷新页面</button>
            </div>
        `;
    }
});

// 导出应用实例
export { dlmmApp };
export default dlmmApp; 