/**
 * 策略控制器
 * 负责业务逻辑处理和模块间协调
 */
class SimpleYStrategyController {
    constructor(dataService, uiManager, options = {}) {
        this.dataService = dataService;
        this.uiManager = uiManager;
        this.options = {
            autoRefreshInterval: 30000,
            maxRetries: 3,
            retryDelay: 1000,
            ...options
        };

        // 业务状态
        this.strategies = new Map();
        this.lastUpdateTime = null;
        this.isProcessing = false;

        // EventBus监听
        this.eventBus = window.EventBus;

        // 配置管理器
        this.configManager = null;

        // 初始化
        this.init();
    }

    /**
     * 初始化策略控制器
     */
    init() {
        try {
            console.log('🎯 初始化策略控制器');

            // 初始化配置管理器
            this.configManager = new SimpleYConfigManager(this.dataService, this.uiManager);

            // 设置配置保存回调
            this.configManager.setOnConfigSaved((strategyId) => {
                this.requestStrategyList();
            });

            // 设置UI事件监听
            this.setupUIEventListeners();

            // 设置EventBus监听
            this.setupEventBusListeners();

            // 初始化数据
            this.initializeData();

            console.log('✅ 策略控制器初始化完成');
        } catch (error) {
            console.error('❌ 策略控制器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 设置UI事件监听
     */
    setupUIEventListeners() {
        // 刷新请求
        this.uiManager.on('ui:refresh-requested', () => {
            this.handleRefreshRequest();
        });

        // 重连请求
        this.uiManager.on('ui:reconnect-requested', () => {
            this.handleReconnectRequest();
        });

        // 策略操作
        this.uiManager.on('ui:strategy-action', (data) => {
            this.handleStrategyAction(data.action, data.strategyId, data.button);
        });

        console.log('✅ UI事件监听已设置');
    }

    /**
     * 设置EventBus监听
     */
    setupEventBusListeners() {
        if (this.eventBus) {
            // 监听策略创建事件
            this.eventBus.on('strategy:created', (data) => {
                console.log('📊 收到策略创建事件:', data);
                this.uiManager.showNotification('新策略已创建，正在刷新列表...', 'success');

                // 延迟刷新，确保后端已完全处理
                setTimeout(() => {
                    this.requestStrategyList();
                }, 1000);
            });

            // 监听策略删除事件
            this.eventBus.on('strategy:deleted', (data) => {
                console.log('🗑️ 收到策略删除事件:', data);
                this.uiManager.showNotification('策略已删除', 'info');
                this.requestStrategyList();
            });

            console.log('✅ EventBus事件监听已设置');
        } else {
            console.warn('⚠️ EventBus不可用，无法监听策略事件');
        }
    }

    /**
     * 初始化数据
     */
    async initializeData() {
        try {
            console.log('📊 开始初始化数据...');

            // 测试API连接
            const testResult = await this.dataService.testAPIConnection();
            if (testResult.success) {
                this.uiManager.showNotification(testResult.message, 'success');
            } else {
                this.uiManager.showNotification(testResult.message, 'error');
            }

            // 加载策略列表
            await this.requestStrategyList();

            console.log('✅ 数据初始化完成');
        } catch (error) {
            console.error('❌ 数据初始化失败:', error);
            this.uiManager.showNotification('数据初始化失败: ' + error.message, 'error');
        }
    }

    /**
     * 请求策略列表
     */
    async requestStrategyList() {
        try {
            console.log('🔄 开始请求策略列表...');

            const result = await this.dataService.getStrategyList();

            if (result.success) {
                const oldCount = this.strategies.size;

                // 更新策略数据
                this.strategies.clear();
                result.data.forEach(strategy => {
                    this.strategies.set(strategy.instanceId, strategy);
                });

                console.log(`📊 策略列表更新: ${oldCount} → ${result.data.length} 个简单Y策略`);

                // 更新UI
                this.uiManager.updateStrategies(result.data);

                // 显示成功通知
                if (result.data.length > oldCount) {
                    this.uiManager.showNotification(`发现 ${result.data.length - oldCount} 个新策略`, 'success');
                } else if (result.data.length !== oldCount) {
                    this.uiManager.showNotification('策略列表已更新', 'info');
                }
            } else {
                console.warn('⚠️ 获取策略列表失败:', result.error);
                this.uiManager.showNotification('获取策略列表失败: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('❌ 获取策略列表失败:', error);
            this.uiManager.showNotification('刷新失败: ' + error.message, 'error');
        }
    }

    /**
     * 处理刷新请求
     */
    handleRefreshRequest() {
        console.log('🔄 处理刷新请求');
        this.requestStrategyList();
    }

    /**
     * 处理重连请求
     */
    handleReconnectRequest() {
        console.log('🔌 处理重连请求');
        // 发送重连事件给连接管理器
        this.emit('controller:reconnect-requested', {
            timestamp: Date.now()
        });
    }

    /**
     * 处理策略操作
     */
    async handleStrategyAction(action, strategyId, buttonElement) {
        console.log(`🎯 处理策略操作: ${action} for ${strategyId}`);

        // 防止重复操作
        if (this.isProcessing || buttonElement.disabled) {
            console.log('⏳ 操作正在进行中，跳过重复请求');
            return;
        }

        this.isProcessing = true;
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
                    this.uiManager.showNotification(`未知操作: ${action}`, 'error');
            }
        } catch (error) {
            console.error(`❌ 策略操作失败 (${action}):`, error);
            this.uiManager.showNotification(`操作失败: ${error.message}`, 'error');
        } finally {
            this.isProcessing = false;
            buttonElement.disabled = false;
        }
    }

    /**
     * 暂停策略
     */
    async pauseStrategy(strategyId) {
        try {
            console.log(`🔄 正在暂停策略: ${strategyId}`);

            const result = await this.dataService.pauseStrategy(strategyId);

            if (result.success) {
                this.uiManager.showNotification('策略已暂停', 'success');
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

            const result = await this.dataService.startStrategy(strategyId);

            if (result.success) {
                this.uiManager.showNotification('策略已启动', 'success');
                this.updateStrategyInList(strategyId, { status: 'running' });

                // 刷新列表以获取最新状态
                setTimeout(() => this.requestStrategyList(), 1000);
            } else {
                // 更详细的错误处理
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

            const result = await this.dataService.stopStrategy(strategyId);

            if (result.success) {
                this.uiManager.showNotification('策略已停止', 'warning');
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

            const result = await this.dataService.deleteStrategy(strategyId);

            if (result.success) {
                this.uiManager.showNotification('策略已删除', 'info');
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
     * 执行手动止损
     */
    async executeManualStopLoss(strategyId) {
        if (!confirm('确定要执行手动止损吗？\n\n此操作将：\n1. 关闭所有头寸\n2. 卖出所有X代币为Y代币\n3. 停止策略监控\n\n此操作不可撤销！')) {
            return;
        }

        try {
            console.log(`🛑 正在执行手动止损: ${strategyId}`);

            const result = await this.dataService.executeManualStopLoss(strategyId);

            if (result.success) {
                this.uiManager.showNotification('手动止损执行成功', 'success');
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
     * 显示策略配置弹窗
     */
    showStrategyConfigModal(strategyId) {
        const strategy = this.strategies.get(strategyId);
        if (!strategy) {
            this.uiManager.showNotification('策略不存在', 'error');
            return;
        }

        // 使用配置管理器显示配置弹窗
        this.configManager.showStrategyConfigModal(strategy);
    }

    /**
     * 显示编辑配置弹窗
     */
    showEditConfigModal(strategyId) {
        const strategy = this.strategies.get(strategyId);
        if (!strategy) {
            this.uiManager.showNotification('策略不存在', 'error');
            return;
        }

        if (strategy.status !== 'stopped') {
            this.uiManager.showNotification('只能编辑已停止的策略配置', 'warning');
            return;
        }

        // 使用配置管理器显示编辑配置弹窗
        this.configManager.showEditConfigModal(strategy);
    }

    /**
     * 创建配置弹窗（已废弃，使用配置管理器）
     */
    createConfigModal(strategy, isEditable) {
        // 向后兼容性保留，但现在使用配置管理器
        if (isEditable) {
            this.configManager.showEditConfigModal(strategy);
        } else {
            this.configManager.showStrategyConfigModal(strategy);
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

            // 防重复更新：检查数据时间戳
            const strategy = this.strategies.get(instanceId);
            if (strategy) {
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

                console.log(`📊 更新策略 ${instanceId} 的实时数据`);

                // 更新UI
                this.uiManager.updateStrategyCard(instanceId, data);

                // 保存数据到存储
                this.dataService.saveDataToStorage(instanceId, marketData);
            } else {
                console.warn(`⚠️ 未找到策略: ${instanceId}`);
            }

            this.lastUpdateTime = Date.now();
            this.uiManager.setLastUpdateTime(this.lastUpdateTime);

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

                // 更新UI
                this.uiManager.updateStrategy(instanceId, { status });

                // 如果状态在运行/停止之间切换，重新排序整个列表
                const isStatusChangeSignificant =
                    (oldStatus === 'running' && status !== 'running') ||
                    (oldStatus !== 'running' && status === 'running');

                if (isStatusChangeSignificant) {
                    console.log(`🔄 状态变化需要重新排序: ${oldStatus} → ${status}`);
                    // 触发UI重新渲染
                    this.uiManager.updateStrategies(Array.from(this.strategies.values()));
                }
            }

        } catch (error) {
            console.error('❌ 处理策略状态更新失败:', error);
        }
    }

    /**
     * 更新策略列表中的策略
     */
    updateStrategyInList(strategyId, updates) {
        const strategy = this.strategies.get(strategyId);
        if (strategy) {
            Object.assign(strategy, updates);
            this.strategies.set(strategyId, strategy);

            // 更新UI
            this.uiManager.updateStrategy(strategyId, updates);
        }
    }

    /**
     * 从列表中移除策略
     */
    removeStrategyFromList(strategyId) {
        this.strategies.delete(strategyId);

        // 更新UI
        this.uiManager.removeStrategy(strategyId);
    }

    /**
     * 获取策略数据
     */
    getStrategy(strategyId) {
        return this.strategies.get(strategyId);
    }

    /**
     * 获取所有策略
     */
    getAllStrategies() {
        return Array.from(this.strategies.values());
    }

    /**
     * 获取活跃策略数量
     */
    getActiveStrategiesCount() {
        return Array.from(this.strategies.values())
            .filter(s => s.status === 'running').length;
    }

    /**
     * 注册事件监听器
     */
    on(event, callback) {
        // 这里可以实现事件监听器的注册
        console.log(`注册事件监听器: ${event}`);
    }

    /**
     * 触发事件
     */
    emit(event, data) {
        // 这里可以实现事件的触发
        console.log(`触发事件: ${event}`, data);
    }

    /**
     * 批量操作策略
     */
    async batchStrategyOperation(operations) {
        try {
            console.log('🔄 执行批量策略操作:', operations);

            const results = await this.dataService.batchStrategyOperation(operations);

            // 处理结果
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            if (successCount > 0) {
                this.uiManager.showNotification(`批量操作完成: ${successCount}个成功`, 'success');
            }

            if (failCount > 0) {
                this.uiManager.showNotification(`批量操作失败: ${failCount}个失败`, 'warning');
            }

            // 刷新列表
            setTimeout(() => this.requestStrategyList(), 1000);

            return results;
        } catch (error) {
            console.error('❌ 批量操作失败:', error);
            this.uiManager.showNotification('批量操作失败: ' + error.message, 'error');
            throw error;
        }
    }

    /**
     * 获取统计信息
     */
    getStatistics() {
        const strategies = Array.from(this.strategies.values());
        const totalStrategies = strategies.length;
        const runningStrategies = strategies.filter(s => s.status === 'running').length;
        const pausedStrategies = strategies.filter(s => s.status === 'paused').length;
        const stoppedStrategies = strategies.filter(s => s.status === 'stopped').length;
        const errorStrategies = strategies.filter(s => s.status === 'error').length;

        return {
            totalStrategies,
            runningStrategies,
            pausedStrategies,
            stoppedStrategies,
            errorStrategies,
            lastUpdateTime: this.lastUpdateTime
        };
    }

    /**
     * 获取调试信息
     */
    getDebugInfo() {
        return {
            strategiesCount: this.strategies.size,
            lastUpdateTime: this.lastUpdateTime,
            isProcessing: this.isProcessing,
            options: this.options,
            statistics: this.getStatistics(),
            dataServiceDebug: this.dataService.getDebugInfo(),
            uiManagerDebug: this.uiManager.getDebugInfo()
        };
    }

    /**
     * 销毁策略控制器
     */
    destroy() {
        console.log('🧹 销毁策略控制器');

        // 销毁配置管理器
        if (this.configManager) {
            this.configManager.destroy();
            this.configManager = null;
        }

        // 清理EventBus监听
        if (this.eventBus) {
            this.eventBus.off('strategy:created');
            this.eventBus.off('strategy:deleted');
        }

        // 清理策略数据
        this.strategies.clear();

        // 重置状态
        this.lastUpdateTime = null;
        this.isProcessing = false;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleYStrategyController;
} else if (typeof window !== 'undefined') {
    window.SimpleYStrategyController = SimpleYStrategyController;
} 