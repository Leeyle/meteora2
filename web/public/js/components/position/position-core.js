/**
 * 📈 头寸核心逻辑模块
 * 负责DLMM头寸的数据管理和API调用，不包含UI逻辑
 */

class PositionCore {
    constructor() {
        this.api = null; // 将在init中设置
        this.positions = [];
        this.pools = new Map();
        this.refreshInterval = null;
        this.eventListeners = new Set();
        this.cache = {
            userPositions: null,
            poolInfo: new Map(),
            lastUpdate: 0
        };
    }

    /**
     * 确保API实例已初始化
     */
    ensureApiInstance() {
        if (!this.api) {
            // 尝试从全局对象获取API实例
            this.api = window.dlmmApi || window.dlmmAPI;

            if (!this.api) {
                throw new Error('API实例未找到，请确保应用已正确初始化');
            }
        }
        return this.api;
    }

    /**
     * 初始化头寸核心
     */
    async init() {
        try {
            // 确保API实例可用
            this.ensureApiInstance();

            // 同步钱包信息
            await this.syncWalletInfo();

            // 预加载池信息
            await this.preloadPoolInfo();

            // 加载用户头寸
            await this.loadUserPositions();

            this.emit('initialized');
            return true;
        } catch (error) {
            console.error('头寸核心初始化失败:', error);
            this.emit('error', { type: 'init_error', error });
            return false;
        }
    }

    /**
     * 加载用户头寸
     */
    async loadUserPositions() {
        try {
            // 确保API可用
            this.ensureApiInstance();

            // 首先确保有钱包地址
            let walletAddress = this.getCurrentWalletAddress();

            // 如果没有地址，尝试异步获取
            if (!walletAddress) {
                walletAddress = await this.syncWalletInfo();
            }

            if (!walletAddress) {
                throw new Error('钱包未解锁或地址不可用，请先解锁钱包');
            }

            console.log('📡 正在从后端获取头寸列表，钱包地址:', walletAddress);

            const response = await this.api.getUserPositions(walletAddress);
            console.log('📊 后端返回的头寸数据:', response);

            if (response.success) {
                this.positions = response.data.positions || response.data || [];
                this.cache.userPositions = response.data;
                this.cache.lastUpdate = Date.now();

                console.log('✅ 头寸列表已更新:', {
                    count: this.positions.length,
                    positions: this.positions.map(p => ({
                        address: p.address,
                        status: p.status,
                        type: p.type || p.positionType
                    }))
                });

                // 预加载相关池信息
                await this.preloadPoolInfo();

                this.emit('positionsLoaded', this.positions);
                return this.positions;
            }
            throw new Error(response.error || '获取头寸失败');
        } catch (error) {
            console.error('加载用户头寸失败:', error);
            this.emit('error', { type: 'load_positions', error });
            return [];
        }
    }

    /**
     * 获取当前钱包地址
     */
    getCurrentWalletAddress() {
        // 从localStorage获取缓存的钱包信息（主要方法）
        const walletInfo = this.getStoredWalletInfo();
        if (walletInfo?.address) {
            return walletInfo.address;
        }

        return null;
    }

    /**
     * 异步同步钱包信息 (增强版本)
     */
    async syncWalletInfo() {
        try {
            this.ensureApiInstance();

            const response = await this.api.getWalletInfo();

            if (response.success && response.data?.address) {
                // 存储到localStorage
                localStorage.setItem('walletInfo', JSON.stringify(response.data));
                return response.data.address;
            }
        } catch (error) {
            console.error('同步钱包信息失败:', error);
        }
        return null;
    }

    /**
     * 获取存储的钱包信息
     */
    getStoredWalletInfo() {
        try {
            const walletData = localStorage.getItem('walletInfo');
            return walletData ? JSON.parse(walletData) : null;
        } catch (error) {
            console.warn('获取钱包信息失败:', error);
            return null;
        }
    }

    /**
     * 保存前端头寸信息到localStorage
     */
    saveFrontendPositionInfo(positionAddress, info) {
        try {
            const key = 'frontendPositionInfo';
            const existing = localStorage.getItem(key);
            const data = existing ? JSON.parse(existing) : {};

            data[positionAddress] = {
                ...info,
                savedAt: new Date().toISOString()
            };

            localStorage.setItem(key, JSON.stringify(data));
            console.log('💾 前端头寸信息已保存:', positionAddress, info);
        } catch (error) {
            console.warn('保存前端头寸信息失败:', error);
        }
    }

    /**
     * 获取前端头寸信息
     */
    getFrontendPositionInfo(positionAddress) {
        try {
            const key = 'frontendPositionInfo';
            const data = localStorage.getItem(key);
            if (data) {
                const parsed = JSON.parse(data);
                return parsed[positionAddress] || null;
            }
            return null;
        } catch (error) {
            console.warn('获取前端头寸信息失败:', error);
            return null;
        }
    }

    /**
     * 删除前端头寸信息
     */
    removeFrontendPositionInfo(positionAddress) {
        try {
            const key = 'frontendPositionInfo';
            const data = localStorage.getItem(key);
            if (data) {
                const parsed = JSON.parse(data);
                delete parsed[positionAddress];
                localStorage.setItem(key, JSON.stringify(parsed));
                console.log('🗑️ 前端头寸信息已删除:', positionAddress);
            }
        } catch (error) {
            console.warn('删除前端头寸信息失败:', error);
        }
    }

    /**
     * 预加载池信息
     */
    async preloadPoolInfo() {
        const poolPromises = this.positions.map(async (position) => {
            if (!this.cache.poolInfo.has(position.poolAddress)) {
                try {
                    const poolInfo = await this.getPoolInfo(position.poolAddress);
                    this.cache.poolInfo.set(position.poolAddress, poolInfo);
                } catch (error) {
                    console.warn(`预加载池信息失败 ${position.poolAddress}:`, error);
                }
            }
        });

        await Promise.allSettled(poolPromises);
    }

    /**
     * 获取池信息
     */
    async getPoolInfo(poolAddress) {
        try {
            // 先检查缓存
            if (this.cache.poolInfo.has(poolAddress)) {
                return this.cache.poolInfo.get(poolAddress);
            }

            this.ensureApiInstance();
            const response = await this.api.getPoolInfo(poolAddress);
            if (response.success) {
                const poolInfo = response.data;
                this.cache.poolInfo.set(poolAddress, poolInfo);
                return poolInfo;
            }
            throw new Error(response.error || '获取池信息失败');
        } catch (error) {
            console.error('获取池信息失败:', error);
            this.emit('error', { type: 'get_pool_info', error });
            return null;
        }
    }

    /**
     * 创建头寸 (Y代币侧)
     */
    async createYPosition(poolAddress, amount, binRange, config = {}) {
        try {
            // 确保API可用
            this.ensureApiInstance();

            // 检查钱包是否解锁
            if (!this.isWalletUnlocked()) {
                throw new Error('钱包未解锁，请先解锁钱包后再创建头寸');
            }

            const params = {
                poolAddress,
                amount: amount, // 直接传SOL值，由后端处理转换
                binRange: binRange || 10,
                strategy: config.strategy || 'moderate',
                slippageBps: config.slippageBps || 100,
                // 注意：如果后端需要密码，这里可能需要添加
                ...config
            };

            console.log('创建Y头寸参数:', params);
            console.log('原始金额 (SOL):', amount);

            const response = await this.api.createYPosition(params);
            if (response.success) {
                // 保存前端创建的头寸信息到localStorage
                this.saveFrontendPositionInfo(response.data.address || response.data.positionAddress, {
                    type: 'Y',
                    createdAt: new Date().toISOString(),
                    originalAmount: amount,
                    poolAddress: poolAddress,
                    binRange: binRange,
                    strategy: config.strategy || 'moderate'
                });

                await this.refreshUserPositions();
                this.emit('positionCreated', { type: 'Y', data: response.data });
                return response.data;
            }
            throw new Error(response.error || '创建Y头寸失败');
        } catch (error) {
            console.error('创建Y头寸失败:', error);
            this.emit('error', { type: 'create_y_position', error });
            throw error;
        }
    }

    /**
     * 创建头寸 (X代币侧)
     */
    async createXPosition(poolAddress, amount, binRange, config = {}) {
        try {
            // 确保API可用
            this.ensureApiInstance();

            // 检查钱包是否解锁
            if (!this.isWalletUnlocked()) {
                throw new Error('钱包未解锁，请先解锁钱包后再创建头寸');
            }

            const params = {
                poolAddress,
                amount: amount, // 直接传SOL值，由后端处理转换
                binRange: binRange || 10,
                strategy: config.strategy || 'moderate',
                slippageBps: config.slippageBps || 800,
                // 注意：如果后端需要密码，这里可能需要添加
                ...config
            };

            console.log('创建X头寸参数:', params);
            console.log('原始金额 (SOL):', amount);

            const response = await this.api.createXPosition(params);
            if (response.success) {
                // 保存前端创建的头寸信息到localStorage
                this.saveFrontendPositionInfo(response.data.address || response.data.positionAddress, {
                    type: 'X',
                    createdAt: new Date().toISOString(),
                    originalAmount: amount,
                    poolAddress: poolAddress,
                    binRange: binRange,
                    strategy: config.strategy || 'moderate'
                });

                await this.refreshUserPositions();
                this.emit('positionCreated', { type: 'X', data: response.data });
                return response.data;
            }
            throw new Error(response.error || '创建X头寸失败');
        } catch (error) {
            console.error('创建X头寸失败:', error);
            this.emit('error', { type: 'create_x_position', error });
            throw error;
        }
    }

    /**
     * 创建连锁头寸
     */
    async createChainPosition(poolAddresses, amount, binRange, config = {}) {
        try {
            console.log('🔗 开始创建连锁头寸...', {
                poolAddresses,
                amount,
                binRange,
                config
            });

            // 确保API可用
            this.ensureApiInstance();

            // 检查钱包是否解锁
            if (!this.isWalletUnlocked()) {
                throw new Error('钱包未解锁，请先解锁钱包后再创建连锁头寸');
            }

            // 构造请求参数 - 连锁头寸只需要一个主池地址
            // 如果传入多个地址，使用第一个作为主池地址
            const mainPoolAddress = Array.isArray(poolAddresses) ? poolAddresses[0] : poolAddresses;

            const params = {
                poolAddress: mainPoolAddress, // 后端期望单个池地址
                totalAmount: amount, // 直接传SOL值，由后端处理转换
                slippageBps: config.slippageBps || 800,
                password: config.password || null, // 如果需要密码
                ...config
            };

            console.log('📋 连锁头寸参数:', params);
            console.log('原始金额 (SOL):', amount);

            // 调用API创建连锁头寸
            const response = await this.api.createChainPosition(params);

            if (response.success) {
                console.log('✅ 连锁头寸创建成功:', response);

                // 保存前端连锁头寸信息到本地存储
                if (response.position1Address && response.position2Address) {
                    const chainInfo = {
                        type: 'chain',
                        position1Address: response.position1Address,
                        position2Address: response.position2Address,
                        poolAddress: params.poolAddress,
                        totalAmount: amount,
                        createdAt: new Date().toISOString(),
                        totalBinCount: 138,
                        fundingAllocation: response.fundingAllocation
                    };

                    // 为每个位置保存连锁信息
                    this.saveFrontendPositionInfo(response.position1Address, {
                        ...chainInfo,
                        isChainPosition: true,
                        chainRole: 'position1'
                    });

                    this.saveFrontendPositionInfo(response.position2Address, {
                        ...chainInfo,
                        isChainPosition: true,
                        chainRole: 'position2'
                    });
                }

                // 刷新头寸列表
                await this.refreshUserPositions();

                // 触发头寸创建事件
                this.emit('positionCreated', { type: 'chain', data: response });
                return response;
            }

            throw new Error(response.error || '连锁头寸创建失败');
        } catch (error) {
            console.error('❌ 连锁头寸创建失败:', error);
            this.emit('error', { type: 'create_chain_position', error });
            throw error;
        }
    }

    /**
     * 统一关闭头寸方法 (使用PositionManager)
     * @param {string} positionAddress - 头寸地址
     * @param {string} password - 钱包密码 (可选)
     */
    async closePosition(positionAddress, password = null) {
        try {
            // 确保API可用
            this.ensureApiInstance();

            // 检查钱包是否解锁
            if (!this.isWalletUnlocked()) {
                throw new Error('钱包未解锁，请先解锁钱包后再关闭头寸');
            }

            console.log('🔴 准备关闭头寸（统一流程）:', positionAddress);

            // 调用统一的关闭头寸API
            const response = await this.api.closePosition(positionAddress, password);
            console.log('🔴 关闭头寸API响应:', response);

            if (response.success) {
                console.log('✅ 头寸关闭成功，由UI层负责删除前端显示');
                this.emit('positionClosed', { type: 'unified', data: response.data });
                return response.data;
            }
            throw new Error(response.error || '关闭头寸失败');
        } catch (error) {
            console.error('❌ 关闭头寸失败:', error);
            this.emit('error', { type: 'close_position', error });
            throw error;
        }
    }

    /**
     * 关闭Y头寸 (委托给统一方法)
     * @param {string} positionAddress - 头寸地址
     * @param {string} password - 钱包密码 (可选)
     */
    async closeYPosition(positionAddress, password = null) {
        console.log('🔴 Y头寸关闭委托给统一方法:', positionAddress);
        return this.closePosition(positionAddress, password);
    }

    /**
     * 关闭X头寸 (委托给统一方法)
     * @param {string} positionAddress - 头寸地址  
     * @param {string} password - 钱包密码 (可选)
     */
    async closeXPosition(positionAddress, password = null) {
        console.log('🔴 X头寸关闭委托给统一方法:', positionAddress);
        return this.closePosition(positionAddress, password);
    }

    /**
     * 检查钱包是否解锁
     */
    isWalletUnlocked() {
        // 检查本地存储的钱包状态（主要方法）
        try {
            const walletInfo = localStorage.getItem('walletInfo');
            if (walletInfo) {
                const info = JSON.parse(walletInfo);
                return info.isUnlocked === true || info.status === 'unlocked';
            }
        } catch (error) {
            console.warn('从本地存储检查钱包状态失败:', error);
        }

        return false;
    }

    /**
     * 异步检查钱包解锁状态（通过API）
     */
    async checkWalletUnlockedAsync() {
        try {
            this.ensureApiInstance();
            const response = await this.api.getWalletStatus();
            if (response.success && response.data) {
                return response.data.unlocked === true;
            }
        } catch (error) {
            console.warn('异步检查钱包状态失败:', error);
        }
        return false;
    }

    /**
     * 删除头寸
     */
    async deletePosition(positionAddress) {
        try {
            console.log('🗑️ 准备删除头寸:', positionAddress);

            const response = await this.api.deletePosition(positionAddress);
            console.log('🗑️ 删除头寸API响应:', response);

            if (response.success) {
                console.log('✅ 头寸删除成功，正在刷新头寸列表...');
                await this.refreshUserPositions();
                this.emit('positionDeleted', response.data);
                console.log('✅ 头寸列表刷新完成');
                return response.data;
            }
            throw new Error(response.error || '删除头寸失败');
        } catch (error) {
            console.error('❌ 删除头寸失败:', error);
            this.emit('error', { type: 'delete_position', error });
            throw error;
        }
    }

    /**
     * 收集手续费
     */
    async collectFees(positionAddress) {
        try {
            const response = await this.api.collectPositionFees(positionAddress);
            if (response.success) {
                await this.refreshUserPositions();
                this.emit('feesCollected', response.data);
                return response.data;
            }
            throw new Error(response.error || '收集手续费失败');
        } catch (error) {
            console.error('收集手续费失败:', error);
            this.emit('error', { type: 'collect_fees', error });
            throw error;
        }
    }

    /**
     * 批量收集手续费
     */
    async batchCollectFees(positionAddresses) {
        try {
            const response = await this.api.batchCollectFees(positionAddresses);
            if (response.success) {
                await this.refreshUserPositions();
                this.emit('batchFeesCollected', response.data);
                return response.data;
            }
            throw new Error(response.error || '批量收集手续费失败');
        } catch (error) {
            console.error('批量收集手续费失败:', error);
            this.emit('error', { type: 'batch_collect_fees', error });
            throw error;
        }
    }

    /**
     * 获取头寸统计
     */
    async getPositionStats(positionAddress) {
        try {
            const response = await this.api.getPositionStats(positionAddress);
            if (response.success) {
                this.emit('positionStatsLoaded', response.data);
                return response.data;
            }
            throw new Error(response.error || '获取头寸统计失败');
        } catch (error) {
            console.error('获取头寸统计失败:', error);
            this.emit('error', { type: 'get_position_stats', error });
            return null;
        }
    }

    /**
     * 批量操作头寸
     */
    async batchPositionOperation(operation, positionAddresses, params = {}) {
        try {
            const requestData = {
                operation,
                positions: positionAddresses,
                ...params
            };

            const response = await this.api.batchPositionOps(requestData);
            if (response.success) {
                await this.refreshUserPositions();
                this.emit('batchOperationCompleted', { operation, data: response.data });
                return response.data;
            }
            throw new Error(response.error || '批量操作失败');
        } catch (error) {
            console.error('批量操作头寸失败:', error);
            this.emit('error', { type: 'batch_operation', error });
            throw error;
        }
    }

    /**
     * 刷新用户头寸
     */
    async refreshUserPositions() {
        return await this.loadUserPositions();
    }

    /**
     * 强制刷新用户头寸（清除缓存）
     */
    async forceRefreshPositions() {
        console.log('🔄 强制刷新头寸列表，清除缓存...');

        // 清除所有缓存
        this.cache.userPositions = null;
        this.cache.poolInfo.clear();
        this.cache.lastUpdate = 0;
        this.positions = [];

        console.log('🧹 缓存已清除，重新获取数据...');

        // 重新加载数据
        const result = await this.loadUserPositions();

        console.log('✅ 强制刷新完成');
        return result;
    }

    /**
     * 从前端删除头寸显示（不调用后端API）
     */
    removePositionFromFrontend(positionAddress) {
        console.log('🗑️ 从前端删除头寸显示:', positionAddress);

        // 从positions数组中移除
        const originalLength = this.positions.length;
        this.positions = this.positions.filter(pos => pos.address !== positionAddress);

        // 同时删除前端保存的头寸信息
        this.removeFrontendPositionInfo(positionAddress);

        const removedCount = originalLength - this.positions.length;

        if (removedCount > 0) {
            console.log('✅ 成功从前端删除头寸，删除数量:', removedCount);
            // 触发事件通知UI更新
            this.emit('positionRemovedFromFrontend', { positionAddress, removedCount });
        } else {
            console.log('⚠️ 未找到要删除的头寸:', positionAddress);
        }

        return removedCount > 0;
    }

    /**
     * 获取头寸详情
     */
    getPositionById(positionAddress) {
        return this.positions.find(pos => pos.address === positionAddress) || null;
    }

    /**
     * 获取所有头寸
     */
    getAllPositions() {
        return [...this.positions];
    }

    /**
     * 按池地址过滤头寸
     */
    getPositionsByPool(poolAddress) {
        return this.positions.filter(pos => pos.poolAddress === poolAddress);
    }

    /**
     * 按状态过滤头寸
     */
    getPositionsByStatus(status) {
        return this.positions.filter(pos => pos.status === status);
    }

    /**
     * 计算总价值
     */
    calculateTotalValue() {
        return this.positions.reduce((total, position) => {
            return total + (parseFloat(position.totalValue) || 0);
        }, 0);
    }

    /**
     * 计算总盈亏
     */
    calculateTotalPnL() {
        return this.positions.reduce((total, position) => {
            return total + (parseFloat(position.unrealizedPnL) || 0);
        }, 0);
    }

    /**
     * 开始自动刷新
     */
    startAutoRefresh(interval = 30000) {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(() => {
            this.refreshUserPositions();
        }, interval);
        this.emit('autoRefreshStarted', { interval });
    }

    /**
     * 停止自动刷新
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            this.emit('autoRefreshStopped');
        }
    }

    /**
     * 获取当前状态
     */
    getState() {
        return {
            positions: this.positions,
            positionsCount: this.positions.length,
            totalValue: this.calculateTotalValue(),
            totalPnL: this.calculateTotalPnL(),
            isAutoRefreshing: !!this.refreshInterval,
            lastUpdate: this.cache.lastUpdate
        };
    }

    /**
     * 事件发射器
     */
    emit(eventName, data = null) {
        this.eventListeners.forEach(listener => {
            if (listener.event === eventName || listener.event === '*') {
                try {
                    listener.callback(eventName, data);
                } catch (error) {
                    console.error('头寸事件监听器错误:', error);
                }
            }
        });
    }

    /**
     * 添加事件监听器
     */
    on(eventName, callback) {
        const listener = { event: eventName, callback };
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
    }

    /**
     * 移除所有事件监听器
     */
    removeAllListeners() {
        this.eventListeners.clear();
    }

    /**
     * 销毁头寸核心
     */
    destroy() {
        this.stopAutoRefresh();
        this.removeAllListeners();
        this.positions = [];
        this.pools.clear();
        this.cache = {
            userPositions: null,
            poolInfo: new Map(),
            lastUpdate: 0
        };
    }
}

// 导出头寸核心类
window.PositionCore = PositionCore;