/* 🔗 DLMM流动性管理系统 - API封装模块 */
/* 提供统一的API调用接口和错误处理 */

/**
 * DLMM API封装类 - 基于已实现的31个API端点
 * 版本：v3.0 - 仅包含已实现的功能
 */
class DLMMAPI {
    constructor() {
        this.baseURL = '/api';
        this.timeout = 30000;
        this.retryCount = 3;
        this.retryDelay = 1000;

        // 请求拦截器队列
        this.requestInterceptors = [];
        this.responseInterceptors = [];

        // 请求统计
        this.stats = {
            totalRequests: 0,
            successRequests: 0,
            failedRequests: 0,
            averageLatency: 0
        };

        this.setupDefaultInterceptors();
    }

    /**
     * 设置默认拦截器
     */
    setupDefaultInterceptors() {
        // 请求拦截器：添加认证和统计
        this.addRequestInterceptor((config) => {
            this.stats.totalRequests++;
            config.startTime = Date.now();

            // 添加默认头部
            config.headers = {
                'Content-Type': 'application/json',
                'X-Client-Version': '3.0.0',
                'X-Request-ID': this.generateRequestId(),
                ...config.headers
            };

            return config;
        });

        // 响应拦截器：统计和错误处理
        this.addResponseInterceptor(
            (response, config) => {
                this.stats.successRequests++;
                this.updateLatencyStats(Date.now() - config.startTime);
                return response;
            },
            (error, config) => {
                this.stats.failedRequests++;
                this.updateLatencyStats(Date.now() - config.startTime);
                return this.handleApiError(error);
            }
        );
    }

    /**
     * 添加请求拦截器
     */
    addRequestInterceptor(interceptor) {
        this.requestInterceptors.push(interceptor);
    }

    /**
     * 添加响应拦截器
     */
    addResponseInterceptor(onSuccess, onError) {
        this.responseInterceptors.push({ onSuccess, onError });
    }

    /**
     * 生成请求ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 更新延迟统计
     */
    updateLatencyStats(latency) {
        const total = this.stats.successRequests + this.stats.failedRequests;
        this.stats.averageLatency = (this.stats.averageLatency * (total - 1) + latency) / total;
    }

    /**
     * 核心请求方法
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;

        // 准备配置
        let config = {
            method: 'GET',
            timeout: this.timeout,
            ...options,
            url,
            endpoint
        };

        // 应用请求拦截器
        for (const interceptor of this.requestInterceptors) {
            config = await interceptor(config);
        }

        // 执行请求
        try {
            const response = await this.executeRequest(config);

            // 应用响应拦截器
            let result = response;
            for (const { onSuccess } of this.responseInterceptors) {
                if (onSuccess) {
                    result = await onSuccess(result, config);
                }
            }

            return result;

        } catch (error) {
            // 应用错误拦截器
            let handledError = error;
            for (const { onError } of this.responseInterceptors) {
                if (onError) {
                    handledError = await onError(handledError, config);
                }
            }
            throw handledError;
        }
    }

    /**
     * 执行HTTP请求
     */
    async executeRequest(config) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        try {
            const fetchOptions = {
                method: config.method,
                headers: config.headers,
                signal: controller.signal
            };

            // 添加请求体
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method) && config.body) {
                if (typeof config.body === 'object') {
                    fetchOptions.body = JSON.stringify(config.body);
                } else {
                    fetchOptions.body = config.body;
                }
            }

            const response = await fetch(config.url, fetchOptions);
            clearTimeout(timeoutId);

            // 检查响应状态
            if (!response.ok) {
                const errorData = await this.parseErrorResponse(response);
                throw new APIError(
                    errorData.message || `HTTP ${response.status}`,
                    response.status,
                    errorData,
                    config.endpoint
                );
            }

            // 解析响应
            const data = await this.parseResponse(response);
            return data;

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new APIError('请求超时', 408, null, config.endpoint);
            }

            if (error instanceof APIError) {
                throw error;
            }

            // 网络错误
            throw new APIError(
                error.message || '网络请求失败',
                0,
                null,
                config.endpoint
            );
        }
    }

    /**
     * 解析响应数据
     */
    async parseResponse(response) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    }

    /**
     * 解析错误响应
     */
    async parseErrorResponse(response) {
        try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            return { message: await response.text() };
        } catch {
            return { message: `HTTP ${response.status} ${response.statusText}` };
        }
    }

    /**
     * 处理API错误
     */
    handleApiError(error) {
        this.logError(error);

        switch (error.status) {
            case 401:
                return this.handleUnauthorized(error);
            case 403:
                return this.handleForbidden(error);
            case 429:
                return this.handleRateLimit(error);
            case 500:
            case 502:
            case 503:
            case 504:
                return this.handleServerError(error);
            default:
                return Promise.reject(error);
        }
    }

    /**
     * 记录错误日志
     */
    logError(error) {
        console.error('API错误:', {
            endpoint: error.endpoint,
            status: error.status,
            message: error.message,
            data: error.data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 处理未授权错误
     */
    handleUnauthorized(error) {
        // 可以在这里触发重新登录流程
        return Promise.reject(error);
    }

    /**
     * 处理禁止访问错误
     */
    handleForbidden(error) {
        return Promise.reject(error);
    }

    /**
     * 处理频率限制错误
     */
    handleRateLimit(error) {
        return Promise.reject(error);
    }

    /**
     * 处理服务器错误
     */
    handleServerError(error) {
        return Promise.reject(error);
    }

    /**
     * 带重试的请求
     */
    async requestWithRetry(endpoint, options = {}, retries = this.retryCount) {
        try {
            return await this.request(endpoint, options);
        } catch (error) {
            if (retries > 0 && this.shouldRetry(error)) {
                await this.delay(this.retryDelay);
                return this.requestWithRetry(endpoint, options, retries - 1);
            }
            throw error;
        }
    }

    /**
     * 判断是否应该重试
     */
    shouldRetry(error) {
        return error.status >= 500 || error.status === 408 || error.status === 0;
    }

    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===== 已实现的API方法 =====

    // === 系统API（3个）===

    /**
     * 健康检查
     */
    async healthCheck() {
        return this.request('/health');
    }

    /**
     * 获取系统信息
     */
    async getSystemInfo() {
        return this.request('/info');
    }

    /**
     * 获取系统指标
     */
    async getSystemMetrics() {
        return this.request('/metrics');
    }

    // === 钱包管理API（11个）===

    /**
     * 获取钱包信息
     */
    async getWalletInfo() {
        return this.request('/wallet/info');
    }

    /**
     * 创建钱包
     */
    async createWallet(password, mnemonic = null) {
        const body = { password };
        if (mnemonic) body.mnemonic = mnemonic;
        return this.request('/wallet/create', {
            method: 'POST',
            body
        });
    }

    /**
     * 导入钱包（通过助记词）
     */
    async importWallet(mnemonic, password) {
        return this.request('/wallet/import', {
            method: 'POST',
            body: { mnemonic, password }
        });
    }

    /**
     * 导入钱包（通过私钥）
     */
    async importWalletByKey(privateKey, password) {
        return this.request('/wallet/import-by-key', {
            method: 'POST',
            body: { privateKey, password }
        });
    }

    /**
     * 获取钱包余额
     */
    async getWalletBalance(tokenMint = null) {
        const endpoint = tokenMint
            ? `/wallet/balance/${tokenMint}`
            : '/wallet/balance';
        return this.request(endpoint);
    }

    /**
     * 获取所有代币余额
     */
    async getAllWalletBalances() {
        return this.request('/wallet/balances');
    }

    /**
     * 解锁钱包
     */
    async unlockWallet(password) {
        return this.request('/wallet/unlock', {
            method: 'POST',
            body: { password }
        });
    }

    /**
     * 锁定钱包
     */
    async lockWallet() {
        return this.request('/wallet/lock', {
            method: 'POST'
        });
    }

    /**
     * 删除钱包
     */
    async deleteWallet(password) {
        return this.request('/wallet/delete', {
            method: 'DELETE',
            body: { password }
        });
    }

    /**
     * 检查钱包状态
     */
    async getWalletStatus() {
        return this.request('/wallet/status');
    }

    /**
     * 获取钱包交易历史
     */
    async getWalletTransactions(limit = 20) {
        return this.request(`/wallet/transactions?limit=${limit}`);
    }

    // === 池子管理API（4个）===

    /**
     * 获取池子基本信息
     */
    async getPoolInfo(poolAddress) {
        return this.request(`/pools/${poolAddress}/info`);
    }

    /**
     * 获取实时价格与活跃bin信息
     */
    async getPoolPriceAndBin(poolAddress, refresh = false) {
        const endpoint = `/pools/${poolAddress}/price-and-bin${refresh ? '?refresh=1' : ''}`;
        return this.request(endpoint);
    }

    /**
     * 获取强制实时价格与活跃bin信息（绕过缓存）
     */
    async getPoolRealtimePriceAndBin(poolAddress) {
        return this.request(`/pools/${poolAddress}/price-and-bin/realtime`);
    }

    /**
     * 获取流动性分布信息
     */
    async getPoolLiquidity(poolAddress, range = 20) {
        return this.request(`/pools/${poolAddress}/liquidity?range=${range}`);
    }

    // === 头寸管理API（12个）===

    /**
     * 获取用户所有头寸
     */
    async getUserPositions(userAddress) {
        return this.request(`/positions/user/${userAddress}`);
    }

    /**
     * 获取用户在特定池中的头寸
     */
    async getUserPositionsInPool(userAddress, poolAddress) {
        return this.request(`/positions/user/${userAddress}/pool/${poolAddress}`);
    }

    /**
     * 获取特定头寸信息（详细版）
     */
    async getPositionInfo(positionAddress) {
        return this.request(`/positions/${positionAddress}/info`);
    }

    /**
     * 获取头寸信息（简化版）
     */
    async getPositionBasicInfo(positionAddress) {
        return this.request(`/positions/${positionAddress}`);
    }

    /**
     * 创建Y代币头寸
     */
    async createYPosition(params) {
        return this.request('/positions/y/create', {
            method: 'POST',
            body: params
        });
    }

    /**
     * 创建X代币头寸
     */
    async createXPosition(params) {
        return this.request('/positions/x/create', {
            method: 'POST',
            body: params
        });
    }

    /**
     * 创建连锁头寸
     */
    async createChainPosition(params) {
        return this.request('/chain-position/create', {
            method: 'POST',
            body: params
        });
    }

    /**
     * 关闭头寸 (统一方法，使用PositionManager)
     * @param {string} positionAddress - 头寸地址
     * @param {string} password - 钱包密码 (可选)
     */
    async closePosition(positionAddress, password = null) {
        const body = {};
        if (password) {
            body.password = password;
        }

        return this.request(`/positions/${positionAddress}/close`, {
            method: 'POST',
            body: body
        });
    }

    /**
     * 关闭Y代币头寸 (委托给统一方法)
     * @param {string} positionAddress - 头寸地址
     * @param {string} password - 钱包密码 (可选)
     */
    async closeYPosition(positionAddress, password = null) {
        return this.closePosition(positionAddress, password);
    }

    /**
     * 关闭X代币头寸 (委托给统一方法)
     * @param {string} positionAddress - 头寸地址
     * @param {string} password - 钱包密码 (可选)
     */
    async closeXPosition(positionAddress, password = null) {
        return this.closePosition(positionAddress, password);
    }

    /**
     * 删除头寸
     */
    async deletePosition(positionAddress) {
        return this.request(`/positions/${positionAddress}`, {
            method: 'DELETE'
        });
    }

    /**
     * 收集头寸手续费
     */
    async collectPositionFees(positionAddress) {
        return this.request(`/positions/${positionAddress}/collect-fees`, {
            method: 'POST'
        });
    }

    /**
     * 获取头寸收益统计
     */
    async getPositionStats(positionAddress) {
        return this.request(`/positions/${positionAddress}/stats`);
    }

    /**
     * 批量收集手续费
     */
    async batchCollectFees(addresses) {
        return this.request('/positions/batch/collect-fees', {
            method: 'POST',
            body: { addresses }
        });
    }

    // === 日志查询API（7个）===

    /**
     * 获取最近日志
     */
    async getLogs(limit = 50) {
        return this.request(`/logs?limit=${limit}`);
    }

    /**
     * 获取错误日志
     */
    async getErrorLogs(limit = 20) {
        return this.request(`/logs/errors?limit=${limit}`);
    }

    /**
     * 获取业务操作日志
     */
    async getBusinessOperationLogs(limit = 50) {
        return this.request(`/logs/business/operations?limit=${limit}`);
    }

    /**
     * 获取业务监控日志
     */
    async getBusinessMonitoringLogs(limit = 50) {
        return this.request(`/logs/business/monitoring?limit=${limit}`);
    }

    /**
     * 按类别获取日志
     */
    async getLogsByCategory(category, limit = 50) {
        return this.request(`/logs/category/${category}?limit=${limit}`);
    }

    /**
     * 获取混合日志
     */
    async getMixedLogs(limit = 50) {
        return this.request(`/logs/mixed?limit=${limit}`);
    }

    /**
     * 获取日志文件列表
     */
    async getLogFiles() {
        return this.request('/logs/files');
    }

    // === 工具方法 ===

    /**
     * 获取API统计信息
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            successRequests: 0,
            failedRequests: 0,
            averageLatency: 0
        };
    }
}

/**
 * API错误类
 */
class APIError extends Error {
    constructor(message, status, data, endpoint) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
        this.endpoint = endpoint;
    }
}

// 全局API实例
window.dlmmApi = new DLMMAPI();

// 导出API类和实例
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DLMMAPI, APIError };
} 