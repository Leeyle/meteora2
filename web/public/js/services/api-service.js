/**
 * 🌐 API服务 - 处理前后端通信
 * 统一管理所有API请求
 */

class APIService {
    constructor() {
        this.baseURL = '';  // 使用相对路径，因为前端和API在同一端口
        this.requestCount = 0;
    }

    /**
     * 🔧 通用请求方法
     */
    async request(endpoint, options = {}) {
        this.requestCount++;
        const requestId = `req_${this.requestCount}_${Date.now()}`;

        const url = `${this.baseURL}/api${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'X-Request-ID': requestId
            }
        };

        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        // 🔥 修复：自动序列化body为JSON字符串
        if (finalOptions.body && typeof finalOptions.body === 'object') {
            finalOptions.body = JSON.stringify(finalOptions.body);
        }

        // 只在开发环境输出详细日志
        const isDebugMode = window.location.search.includes('debug=true');

        if (isDebugMode) {
            console.log(`📡 API请求 [${requestId}]:`, {
                method: finalOptions.method || 'GET',
                url,
                body: finalOptions.body
            });
        }

        try {
            const response = await fetch(url, finalOptions);

            if (isDebugMode) {
                console.log(`🔄 API响应 [${requestId}]:`, {
                    status: response.status,
                    statusText: response.statusText,
                    url: url,
                    ok: response.ok
                });
            }

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch {
                    errorData = { message: response.statusText };
                }
                console.error(`❌ API请求失败 [${requestId}]:`, {
                    status: response.status,
                    statusText: response.statusText,
                    errorData,
                    url
                });
                throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            if (isDebugMode) {
                console.log(`✅ API成功 [${requestId}]:`, data);
            }

            return data;
        } catch (error) {
            console.error(`❌ API错误 [${requestId}]:`, {
                error: error.message,
                stack: error.stack,
                url,
                options: finalOptions
            });
            throw error;
        }
    }

    /**
     * 🔧 便捷的GET请求方法（支持查询参数）
     */
    async get(endpoint, params = {}) {
        let url = endpoint;

        // 如果有查询参数，添加到URL
        if (Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += (url.includes('?') ? '&' : '?') + queryString;
        }

        return await this.request(url, { method: 'GET' });
    }

    /**
     * 🔧 便捷的POST请求方法
     */
    async post(endpoint, data = {}) {
        return await this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * 📋 策略管理API
     */

    // 获取所有策略
    async getStrategies() {
        const response = await this.request('/strategy/list');
        return {
            success: response.success !== false,
            data: response.data || response || []
        };
    }

    // 创建策略
    async createStrategy(strategyData) {
        const response = await this.request('/strategy/create', {
            method: 'POST',
            body: JSON.stringify(this.formatStrategyData(strategyData))
        });
        return response.data;
    }

    // 启动策略
    async startStrategy(instanceId) {
        const response = await this.request(`/strategy/${instanceId}/start`, {
            method: 'POST'
        });
        return response.data;
    }

    // 停止策略
    async stopStrategy(instanceId) {
        const response = await this.request(`/strategy/${instanceId}/stop`, {
            method: 'POST'
        });
        return response.data;
    }

    // 暂停策略
    async pauseStrategy(instanceId) {
        const response = await this.request(`/strategy/${instanceId}/pause`, {
            method: 'POST'
        });
        return response.data;
    }

    // 恢复策略
    async resumeStrategy(instanceId) {
        const response = await this.request(`/strategy/${instanceId}/resume`, {
            method: 'POST'
        });
        return response.data;
    }

    // 获取策略状态
    async getStrategyStatus(instanceId) {
        const response = await this.request(`/strategy/${instanceId}/status`);
        return response.data;
    }

    // 删除策略
    async deleteStrategy(instanceId) {
        const response = await this.request(`/strategy/${instanceId}`, {
            method: 'DELETE'
        });
        return response.data;
    }

    // 获取策略模板
    async getStrategyTemplates() {
        const response = await this.request('/strategy/templates');
        return response.data || [];
    }

    /**
     * 🔄 格式化策略数据 - 前端格式转换为后端格式
     */
    formatStrategyData(frontendData) {
        // 根据策略类型进行不同的格式化
        if (frontendData.type === 'chain_position') {
            return {
                type: 'chain_position',
                name: frontendData.name,
                config: {
                    poolAddress: frontendData.poolAddress,
                    chainPositionType: frontendData.chainPositionType,
                    positionAmount: frontendData.positionAmount,
                    binRange: frontendData.binRange,
                    monitoringInterval: frontendData.monitoringInterval, // 秒
                    outOfRangeTimeout: frontendData.outOfRangeTimeout, // 秒
                    yieldExtractionThreshold: frontendData.yieldExtractionThreshold || '10', // 收益提取阈值
                    enableSmartStopLoss: frontendData.enableSmartStopLoss,
                    stopLossConfig: frontendData.stopLossConfig
                },
                description: `连锁头寸策略 - ${frontendData.name}`
            };
        } else {
            // 简单Y策略
            return {
                type: 'simple_y',
                name: frontendData.name,
                config: {
                    poolAddress: frontendData.poolAddress,
                    yAmount: frontendData.yAmount,
                    binRange: frontendData.binRange,
                    stopLossCount: frontendData.stopLossCount,
                    stopLossBinOffset: frontendData.stopLossBinOffset,
                    upwardTimeout: frontendData.upwardTimeout,
                    downwardTimeout: frontendData.downwardTimeout,
                    // 转换为后端期望的格式
                    outOfRangeTimeoutMinutes: Math.floor(frontendData.upwardTimeout / 60),
                    pauseAfterOutOfRange: false
                },
                description: `简单Y头寸策略 - ${frontendData.name}`
            };
        }
    }

    /**
     * 🔄 格式化策略数据 - 后端格式转换为前端格式
     */
    formatStrategyFromBackend(backendData) {
        const config = backendData.config || {};
        const baseData = {
            id: backendData.instanceId || backendData.id,
            name: backendData.name,
            type: backendData.type || 'simple_y',
            status: this.mapBackendStatus(backendData.status),
            currentPnL: backendData.pnl || 0,
            lastUpdate: backendData.lastUpdate || backendData.createdAt,
            createdAt: backendData.createdAt
        };

        // 根据策略类型添加特定配置
        if (backendData.type === 'chain_position') {
            return {
                ...baseData,
                // 连锁头寸策略配置
                poolAddress: config.poolAddress || '',
                chainPositionType: config.chainPositionType || 'Y_CHAIN',
                positionAmount: config.positionAmount || 100,
                binRange: config.binRange || 10,
                monitoringInterval: config.monitoringInterval || 30, // 秒
                outOfRangeTimeout: config.outOfRangeTimeout || 300, // 秒
                yieldExtractionThreshold: config.yieldExtractionThreshold || '10', // 收益提取阈值
                enableSmartStopLoss: config.enableSmartStopLoss || false,
                stopLossConfig: config.stopLossConfig || {}
            };
        } else {
            // 简单Y策略
            return {
                ...baseData,
                poolAddress: config.poolAddress || '',
                yAmount: config.yAmount || 0,
                binRange: config.binRange || 69,
                stopLossCount: config.stopLossCount || 1,
                stopLossBinOffset: config.stopLossBinOffset || 35,
                upwardTimeout: config.upwardTimeout || 300,
                downwardTimeout: config.downwardTimeout || 60
            };
        }
    }

    /**
     * 🗺️ 映射后端状态到前端状态
     */
    mapBackendStatus(backendStatus) {
        const statusMap = {
            'created': 'stopped',
            'running': 'running',
            'paused': 'paused',
            'stopped': 'stopped',
            'error': 'error',
            'completed': 'stopped'
        };
        return statusMap[backendStatus] || 'stopped';
    }

    /**
     * 🏥 健康检查API
     */
    async healthCheck() {
        return await this.request('/health');
    }

    /**
     * 📊 获取系统信息
     */
    async getSystemInfo() {
        return await this.request('/info');
    }

    /**
     * 📈 获取系统指标
     */
    async getMetrics() {
        return await this.request('/metrics');
    }

    /**
     * 🏥 策略健康检查API
     */

    // 获取健康检查概览
    async getHealthOverview() {
        return await this.request('/health-check/overview');
    }

    // 获取健康检查统计
    async getHealthStatistics() {
        return await this.request('/health-check/statistics');
    }

    // 获取健康检查配置
    async getHealthConfig() {
        return await this.request('/health-check/config');
    }

    // 更新健康检查配置
    async updateHealthConfig(config) {
        return await this.request('/health-check/config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });
    }

    // 执行健康检查
    async performHealthCheck() {
        return await this.request('/health-check/check', {
            method: 'POST'
        });
    }

    // 启动健康检查服务
    async startHealthChecker() {
        return await this.request('/health-check/start', {
            method: 'POST'
        });
    }

    // 停止健康检查服务
    async stopHealthChecker() {
        return await this.request('/health-check/stop', {
            method: 'POST'
        });
    }

    // 获取单个实例健康状态
    async getInstanceHealth(instanceId) {
        return await this.request(`/health-check/instance/${instanceId}`);
    }

    // 强制清理实例
    async forceCleanupInstance(instanceId) {
        return await this.request(`/health-check/instance/${instanceId}/force-cleanup`, {
            method: 'POST'
        });
    }

    // 修复特定问题
    async fixInstanceIssue(instanceId, issueType) {
        return await this.request(`/health-check/instance/${instanceId}/fix/${issueType}`, {
            method: 'POST'
        });
    }

    // 获取实例历史
    async getInstanceHistory(instanceId) {
        return await this.request(`/health-check/instance/${instanceId}/history`);
    }
}

// 创建全局实例
window.apiService = new APIService();

// 导出类
window.APIService = APIService;

// 为了兼容性，也导出为APIClient
window.APIClient = APIService; 