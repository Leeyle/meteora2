/**
 * 🎯 本地私钥钱包管理核心
 * 专门针对本地私钥钱包的管理，不是Web3钱包连接
 */

// 简化的事件发射器
class SimpleEventEmitter {
    constructor() {
        this.listeners = {};
    }

    on(eventName, listener) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(listener);
    }

    off(eventName, listener) {
        if (!this.listeners[eventName]) return;
        const index = this.listeners[eventName].indexOf(listener);
        if (index > -1) {
            this.listeners[eventName].splice(index, 1);
        }
    }

    emit(eventName, ...args) {
        if (this.listeners[eventName]) {
            this.listeners[eventName].forEach(listener => {
                try {
                    listener(...args);
                } catch (error) {
                    console.error(`事件监听器错误 [${eventName}]:`, error);
                }
            });
        }
    }

    removeAllListeners() {
        this.listeners = {};
    }
}

class WalletCore extends SimpleEventEmitter {
    constructor() {
        super();
        this.api = null; // 先设为null，在init时初始化
        this.walletInfo = null;
        this.isUnlocked = false;
        this.balances = {
            sol: 0,
            tokens: []
        };
        this.transactions = [];
        this.refreshInterval = null;
        this.isInitialized = false;

        this.logger = {
            info: (msg, data) => console.log(`[WalletCore] ${msg}`, data || ''),
            error: (msg, error) => console.error(`[WalletCore] ${msg}`, error || ''),
            warn: (msg, data) => console.warn(`[WalletCore] ${msg}`, data || '')
        };
    }

    /**
     * 初始化钱包核心
     */
    async init() {
        try {
            this.logger.info('初始化本地钱包管理系统');

            // 确保API实例可用
            await this.ensureApiInstance();

            // 检查钱包状态
            await this.checkWalletStatus();

            this.isInitialized = true;
            this.emit('initialized');
            this.logger.info('钱包系统初始化完成');

            return true;
        } catch (error) {
            this.logger.error('钱包系统初始化失败:', error);
            this.emit('error', { type: 'init', error });
            return false;
        }
    }

    /**
     * 确保API实例可用
     */
    async ensureApiInstance() {
        this.logger.info('开始确保API实例可用...');

        // 尝试获取全局API实例
        this.logger.info('检查全局API实例 window.dlmmApi:', window.dlmmApi);
        if (window.dlmmApi) {
            this.api = window.dlmmApi;
            this.logger.info('使用全局API实例');
            return;
        }

        this.logger.warn('未找到全局API实例，开始等待...');
        // 如果没有，等待一段时间再检查
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            this.logger.info(`等待第${i + 1}次，检查 window.dlmmApi:`, window.dlmmApi);
            if (window.dlmmApi) {
                this.api = window.dlmmApi;
                this.logger.info(`等待${i * 100}ms后获取到API实例`);
                return;
            }
        }

        this.logger.warn('等待超时，检查DLMMAPI类:', window.DLMMAPI);
        // 最后尝试创建新实例
        if (window.DLMMAPI) {
            this.api = new window.DLMMAPI();
            this.logger.warn('创建新的API实例');
            // 同时设置为全局实例
            window.dlmmApi = this.api;
            return;
        }

        this.logger.error('API检查结果 - window.dlmmApi:', window.dlmmApi, 'window.DLMMAPI:', window.DLMMAPI);
        throw new Error('无法获取或创建API实例，请检查API脚本是否正确加载');
    }

    /**
     * 检查钱包状态
     */
    async checkWalletStatus() {
        try {
            this.logger.info('检查钱包状态...');

            // 🔧 第一步：安全检查localStorage中的钱包状态
            const localWalletInfo = this.getWalletInfoFromLocalStorage();
            if (localWalletInfo) {
                console.log('[WalletCore] 检测到localStorage中的有效钱包信息:', localWalletInfo);
            }

            // 添加API调用日志
            this.logger.info('调用API: /wallet/status');
            const statusResponse = await this.api.getWalletStatus();
            this.logger.info('钱包状态API响应:', statusResponse);

            if (statusResponse.success && statusResponse.data) {
                const { exists, unlocked, status } = statusResponse.data;
                this.logger.info(`解析状态 - 存在: ${exists}, 解锁: ${unlocked}, 状态: ${status}`);

                if (exists) {
                    // 🔧 钱包存在的情况处理
                    let shouldLoadWalletData = false;

                    // 检查状态不一致问题
                    if (localWalletInfo?.isUnlocked && !unlocked) {
                        console.log('[WalletCore] 检测到状态不一致 - localStorage显示已解锁，但后端显示未解锁');
                        console.log('[WalletCore] 尝试从localStorage恢复钱包状态...');

                        if (localWalletInfo.address) {
                            this.isUnlocked = true;
                            this.walletInfo = localWalletInfo;
                            shouldLoadWalletData = true;
                            console.log('[WalletCore] 从localStorage恢复钱包状态成功:', this.walletInfo);
                        }
                    } else {
                        // 正常状态同步
                        this.isUnlocked = unlocked || false;

                        // 尝试获取钱包信息
                        this.logger.info('调用API: /wallet/info');
                        const infoResponse = await this.api.getWalletInfo();
                        this.logger.info('钱包信息API响应:', infoResponse);

                        if (infoResponse.success && infoResponse.data) {
                            this.walletInfo = infoResponse.data;
                            this.logger.info('钱包信息设置完成:', this.walletInfo);

                            // 如果钱包已解锁，同步到localStorage
                            if (this.isUnlocked) {
                                this.syncWalletInfoToLocalStorage(infoResponse.data);
                                shouldLoadWalletData = true;
                            }
                        } else {
                            // 即使获取信息失败，也要标记钱包存在（只是被锁定）
                            this.walletInfo = {
                                address: '需要解锁查看',
                                status: status || 'locked',
                                message: '钱包已锁定'
                            };
                            this.logger.info('设置默认钱包信息（锁定状态）:', this.walletInfo);
                        }
                    }

                    // 如果钱包已解锁，加载余额数据
                    if (shouldLoadWalletData || this.isUnlocked) {
                        this.logger.info('钱包已解锁，加载余额数据...');
                        await this.loadWalletData();
                        this.startAutoRefresh();
                    }

                    this.logger.info(`钱包状态确认: ${status}, 已解锁: ${this.isUnlocked}`);
                } else {
                    // 钱包不存在
                    this.walletInfo = null;
                    this.isUnlocked = false;
                    this.clearWalletInfoFromLocalStorage(); // 清理过期的localStorage数据
                    this.logger.info('确认：没有找到钱包');
                }
            } else {
                // API调用失败，尝试从localStorage恢复
                if (localWalletInfo?.isUnlocked) {
                    console.log('[WalletCore] API调用失败，从localStorage恢复钱包状态');
                    this.isUnlocked = true;
                    this.walletInfo = localWalletInfo;
                    // 恢复后也尝试加载数据
                    try {
                        await this.loadWalletData();
                    } catch (loadError) {
                        console.warn('[WalletCore] localStorage恢复后加载数据失败:', loadError);
                    }
                } else {
                    this.walletInfo = null;
                    this.isUnlocked = false;
                    this.logger.error('获取钱包状态失败，响应:', statusResponse);
                }
            }

            const finalStatus = {
                hasWallet: !!this.walletInfo,
                isUnlocked: this.isUnlocked,
                walletInfo: this.walletInfo
            };

            console.log('[WalletCore] checkWalletStatus - 内部状态:', {
                isUnlocked: this.isUnlocked,
                hasWalletInfo: !!this.walletInfo,
                walletAddress: this.walletInfo?.address
            });
            console.log('[WalletCore] 发送状态更新事件:', finalStatus);
            this.logger.info('发送状态更新事件:', finalStatus);
            this.emit('statusUpdated', finalStatus);

        } catch (error) {
            this.logger.error('检查钱包状态异常:', error);

            // 🔧 异常情况下也尝试从localStorage恢复
            const recoveryWalletInfo = this.getWalletInfoFromLocalStorage();
            if (recoveryWalletInfo?.isUnlocked) {
                console.log('[WalletCore] 异常情况下从localStorage恢复钱包状态');
                this.isUnlocked = true;
                this.walletInfo = recoveryWalletInfo;

                const recoveredStatus = {
                    hasWallet: !!this.walletInfo,
                    isUnlocked: this.isUnlocked,
                    walletInfo: this.walletInfo
                };
                this.emit('statusUpdated', recoveredStatus);
                return;
            }

            this.walletInfo = null;
            this.isUnlocked = false;

            const errorStatus = {
                hasWallet: false,
                isUnlocked: false,
                walletInfo: null
            };

            this.logger.info('发送错误状态更新事件:', errorStatus);
            this.emit('statusUpdated', errorStatus);
        }
    }

    /**
     * 创建新钱包
     */
    async createWallet(password, mnemonic = null) {
        try {
            this.logger.info('开始创建新钱包');
            this.emit('loading', { action: '创建钱包', message: '正在生成密钥对...' });

            const response = await this.api.createWallet(password, mnemonic);
            if (response.success) {
                await this.checkWalletStatus(); // 重新检查状态
                this.emit('walletCreated', response.data);
                this.logger.info('钱包创建成功');
                return response.data;
            }
            throw new Error(response.error || '创建钱包失败');
        } catch (error) {
            this.logger.error('创建钱包失败:', error);
            this.emit('error', { type: 'create', error: error.message });
            throw error;
        } finally {
            this.emit('loadingEnd');
        }
    }

    /**
     * 导入钱包（通过助记词）
     */
    async importWalletByMnemonic(mnemonic, password) {
        try {
            this.logger.info('开始通过助记词导入钱包');
            this.emit('loading', { action: '导入钱包', message: '正在验证助记词...' });

            const response = await this.api.importWallet(mnemonic, password);
            if (response.success) {
                await this.checkWalletStatus();
                this.emit('walletImported', { type: 'mnemonic', data: response.data });
                this.logger.info('钱包导入成功');
                return response.data;
            }
            throw new Error(response.error || '导入钱包失败');
        } catch (error) {
            this.logger.error('导入钱包失败:', error);
            this.emit('error', { type: 'import', error: error.message });
            throw error;
        } finally {
            this.emit('loadingEnd');
        }
    }

    /**
     * 导入钱包（通过私钥）
     */
    async importWalletByPrivateKey(privateKey, password) {
        try {
            this.logger.info('开始通过私钥导入钱包');
            this.emit('loading', { action: '导入钱包', message: '正在验证私钥...' });

            const response = await this.api.importWalletByKey(privateKey, password);
            if (response.success) {
                await this.checkWalletStatus();
                this.emit('walletImported', { type: 'privateKey', data: response.data });
                this.logger.info('钱包导入成功');
                return response.data;
            }
            throw new Error(response.error || '导入钱包失败');
        } catch (error) {
            this.logger.error('通过私钥导入钱包失败:', error);
            this.emit('error', { type: 'import', error: error.message });
            throw error;
        } finally {
            this.emit('loadingEnd');
        }
    }

    /**
     * 解锁钱包
     */
    async unlockWallet(password) {
        try {
            this.logger.info('开始解锁钱包');
            this.emit('loading', { action: '解锁钱包', message: '正在验证密码...' });

            const response = await this.api.unlockWallet(password);
            if (response.success) {
                this.isUnlocked = true;
                this.walletInfo = response.data;

                console.log('[WalletCore] 解锁成功，设置内部状态:', {
                    isUnlocked: this.isUnlocked,
                    walletInfo: this.walletInfo
                });

                // 同步钱包状态到localStorage (参考头寸管理的实现)
                this.syncWalletInfoToLocalStorage(response.data);

                await this.loadWalletData();
                // 🚫 已禁用自动刷新钱包余额轮询
                // this.startAutoRefresh();

                // 重新发送状态更新事件，确保UI同步
                const updatedStatus = {
                    hasWallet: !!this.walletInfo,
                    isUnlocked: this.isUnlocked,
                    walletInfo: this.walletInfo
                };
                console.log('[WalletCore] 解锁后发送状态更新:', updatedStatus);
                this.emit('statusUpdated', updatedStatus);

                this.emit('walletUnlocked', response.data);
                this.logger.info('钱包解锁成功');
                return true;
            }
            throw new Error(response.error || '密码错误');
        } catch (error) {
            this.logger.error('钱包解锁失败:', error);
            this.emit('error', { type: 'unlock', error: error.message });
            throw error;
        } finally {
            this.emit('loadingEnd');
        }
    }

    /**
     * 锁定钱包
     */
    async lockWallet() {
        try {
            this.logger.info('开始锁定钱包');

            const response = await this.api.lockWallet();
            if (response.success) {
                this.isUnlocked = false;
                this.balances = { sol: 0, tokens: [] };
                this.transactions = [];

                // 清理localStorage中的钱包状态
                this.clearWalletInfoFromLocalStorage();

                this.stopAutoRefresh();
                this.emit('walletLocked');
                this.logger.info('钱包已锁定');
                return true;
            }
            throw new Error(response.error || '锁定钱包失败');
        } catch (error) {
            this.logger.error('锁定钱包失败:', error);
            this.emit('error', { type: 'lock', error: error.message });
            return false;
        }
    }

    /**
     * 删除钱包
     */
    async deleteWallet(password) {
        try {
            this.logger.info('开始删除钱包');
            this.emit('loading', { action: '删除钱包', message: '正在验证权限...' });

            const response = await this.api.deleteWallet(password);
            if (response.success) {
                this.walletInfo = null;
                this.isUnlocked = false;
                this.balances = { sol: 0, tokens: [] };
                this.transactions = [];
                this.stopAutoRefresh();
                this.emit('walletDeleted');
                this.logger.info('钱包已删除');
                return true;
            }
            throw new Error(response.error || '删除钱包失败');
        } catch (error) {
            this.logger.error('删除钱包失败:', error);
            this.emit('error', { type: 'delete', error: error.message });
            throw error;
        } finally {
            this.emit('loadingEnd');
        }
    }

    /**
     * 加载钱包数据（余额、交易历史等）
     */
    async loadWalletData() {
        if (!this.isUnlocked) return;

        try {
            // 并行加载余额和交易历史
            const [balanceResponse, transactionsResponse] = await Promise.all([
                this.api.getAllWalletBalances().catch(() => ({ success: false })),
                this.api.getWalletTransactions(20).catch(() => ({ success: false }))
            ]);

            if (balanceResponse.success) {
                this.balances = balanceResponse.data;
                this.emit('balancesUpdated', this.balances);
            }

            if (transactionsResponse.success) {
                this.transactions = transactionsResponse.data;
                this.emit('transactionsUpdated', this.transactions);
            }

        } catch (error) {
            this.logger.error('加载钱包数据失败:', error);
        }
    }

    /**
     * 刷新钱包数据 (手动调用)
     */
    async refresh() {
        if (!this.isUnlocked) return false;

        try {
            this.logger.info('手动刷新钱包数据');
            await this.loadWalletData();
            this.emit('refreshed');
            return true;
        } catch (error) {
            this.logger.error('刷新钱包数据失败:', error);
            this.emit('error', { type: 'refresh', error: error.message });
            return false;
        }
    }

    /**
     * 手动获取钱包余额 (用于交易前检查)
     */
    async getBalance(tokenMint = null) {
        if (!this.isUnlocked) {
            throw new Error('钱包未解锁');
        }

        try {
            this.logger.info(`主动查询钱包余额: ${tokenMint || 'SOL'}`);
            const response = await this.api.getWalletBalance(tokenMint);
            if (response.success) {
                return response.data.balance;
            }
            throw new Error(response.error || '获取余额失败');
        } catch (error) {
            this.logger.error('获取钱包余额失败:', error);
            throw error;
        }
    }

    /**
     * 开始自动刷新 (已禁用)
     */
    startAutoRefresh() {
        // 🚫 已禁用自动刷新钱包余额轮询
        // if (this.refreshInterval) return;

        // this.refreshInterval = setInterval(() => {
        //     if (this.isUnlocked) {
        //         this.refresh();
        //     }
        // }, 30000); // 30秒刷新一次

        this.logger.info('钱包自动刷新已禁用，请手动刷新或在交易前主动查询');
    }

    /**
     * 停止自动刷新
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * 获取钱包状态
     */
    getWalletState() {
        return {
            hasWallet: !!this.walletInfo,
            isUnlocked: this.isUnlocked,
            walletInfo: this.walletInfo,
            balances: this.balances,
            transactions: this.transactions
        };
    }

    /**
     * 获取钱包地址
     */
    getWalletAddress() {
        return this.walletInfo?.address || null;
    }

    /**
     * 检查钱包是否存在
     */
    hasWallet() {
        return !!this.walletInfo;
    }

    /**
     * 检查钱包是否已解锁
     */
    isWalletUnlocked() {
        return this.isUnlocked;
    }

    /**
     * 同步钱包信息到localStorage (参考头寸管理的实现)
     */
    syncWalletInfoToLocalStorage(walletData) {
        try {
            const walletInfo = {
                ...walletData,
                isUnlocked: true,
                status: 'unlocked',
                lastUpdate: Date.now(),
                syncVersion: '1.0' // 添加版本号用于兼容性检查
            };

            console.log('[WalletCore] 正在同步钱包信息到localStorage:', walletInfo);
            localStorage.setItem('walletInfo', JSON.stringify(walletInfo));
            console.log('[WalletCore] localStorage同步完成');
            this.logger.info('钱包信息已同步到localStorage:', walletInfo);
        } catch (error) {
            console.error('[WalletCore] 同步钱包信息到localStorage失败:', error);
            this.logger.error('同步钱包信息到localStorage失败:', error);
        }
    }

    /**
     * 从localStorage安全读取钱包信息
     */
    getWalletInfoFromLocalStorage() {
        try {
            const walletInfoStr = localStorage.getItem('walletInfo');
            if (!walletInfoStr) {
                return null;
            }

            const walletInfo = JSON.parse(walletInfoStr);

            // 验证数据完整性
            if (!walletInfo.address || !walletInfo.lastUpdate) {
                console.warn('[WalletCore] localStorage中的钱包数据不完整，清理');
                this.clearWalletInfoFromLocalStorage();
                return null;
            }

            // 检查数据是否过期（24小时）
            const now = Date.now();
            const lastUpdate = walletInfo.lastUpdate || 0;
            const maxAge = 24 * 60 * 60 * 1000; // 24小时

            if (now - lastUpdate > maxAge) {
                console.warn('[WalletCore] localStorage中的钱包数据已过期，清理');
                this.clearWalletInfoFromLocalStorage();
                return null;
            }

            console.log('[WalletCore] 从localStorage读取有效钱包信息');
            return walletInfo;
        } catch (error) {
            console.error('[WalletCore] 读取localStorage钱包信息失败:', error);
            this.clearWalletInfoFromLocalStorage();
            return null;
        }
    }

    /**
     * 清理localStorage中的钱包状态
     */
    clearWalletInfoFromLocalStorage() {
        try {
            localStorage.removeItem('walletInfo');
            console.log('[WalletCore] localStorage钱包信息已清理');
            this.logger.info('已清理localStorage中的钱包信息');
        } catch (error) {
            console.error('[WalletCore] 清理localStorage钱包信息失败:', error);
            this.logger.error('清理localStorage钱包信息失败:', error);
        }
    }

    /**
     * 销毁核心实例
     */
    destroy() {
        this.stopAutoRefresh();
        this.removeAllListeners();
        this.logger.info('钱包核心已销毁');
    }
}

// 导出到全局
window.WalletCore = WalletCore;
console.log('[WalletCore] 本地私钥钱包管理核心已加载'); 